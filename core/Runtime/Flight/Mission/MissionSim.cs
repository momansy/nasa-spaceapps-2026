using System;
using System.Collections.Generic;
using System.Collections.ObjectModel;
using MissionForge.Core.Build;
using MissionForge.Core.Data;

namespace MissionForge.Core.Flight.Mission
{
    /// <summary>Deterministic mission driver. Physics uses the T007 kernel; mission gates are game_value.</summary>
    public sealed partial class MissionSim
    {
        private readonly FlightVehicleSpec spec;
        private readonly MissionSetup setup;
        private Body body;
        private FlightDynamics dynamics;
        private readonly FailureModel failures;
        private readonly HashSet<string> rolled = new HashSet<string>(StringComparer.Ordinal);
        private readonly List<FlightEvent> events = new List<FlightEvent>();
        private readonly Dictionary<string, double> metrics = new Dictionary<string, double>(StringComparer.Ordinal);
        private FlightState state;
        private int stageIndex;
        private double elapsedS, phaseStartS, launchS = double.NaN, peakQPa, maxAltitudeM;
        private double throttleFraction, pitchRad = Math.PI / 2, gLoad;
        private bool initialized, lifted, fairingDropped, stageSeparated;
        private double carriedJettisonKg;
        private long tick;
        private string phase = "F0";

        private MissionSim(FlightVehicleSpec spec, MissionSetup setup)
        {
            this.spec = spec; this.setup = setup;
            var latitude = spec.LatitudeRad;
            var desired = (setup.Contract.InclinationDeg ?? Math.Abs(latitude * 180 / Math.PI)) * Math.PI / 180;
            // The kernel's direct-azimuth API covers prograde inclinations. Reflect retrograde targets.
            var reflected = Math.Min(desired, Math.PI - desired);
            var reachable = Math.Max(Math.Abs(latitude), reflected);
            var azimuth = LaunchGeometry.LaunchAzimuthRad(latitude, reachable);
            if (desired > Math.PI / 2) azimuth = -azimuth;
            InclinationDeg = Math.Acos(Math.Cos(latitude) * Math.Sin(azimuth)) * 180 / Math.PI;
            var rotation = LaunchGeometry.EastwardRotationBoostMs(Body.Earth, latitude) * Math.Sin(azimuth);
            body = new Body(Body.Earth.MuM3S2, Body.Earth.RadiusM, Body.Earth.SurfaceDensityKgM3,
                Body.Earth.ScaleHeightM, rotation, Body.Earth.SoundSpeedMs);
            dynamics = new FlightDynamics(body);
            failures = new FailureModel(spec, setup.Modifiers);
            if (spec.RecoveryKind != "brec_expendable" && spec.BoosterReserveDeltaVMs > 0)
            {
                // Reserve for the stage that will return: the core "first" stage.
                for (var i = 0; i < spec.Stages.Count; i++)
                    if (spec.Stages[i].Id == "first")
                    {
                        var e = spec.Stages[i].Engine;
                        var drop = Math.Max(0, spec.Stages[i].JettisonMassKg - (i + 1 < spec.Stages.Count && spec.Stages[i + 1].Id == "upper"
                            ? spec.FairingMassKg + spec.EscapeTowerMassKg : 0));
                        boosterReserveHeldKg = drop * (Math.Exp(spec.BoosterReserveDeltaVMs / (e.IspVacS * PhysicalConstants.StandardGravityMs2)) - 1);
                    }
            }
            state = new FlightState(body.RadiusM, 0, 0, rotation, spec.LiftoffMassKg);
            foreach (var key in new[] { "payload_recovered", "payload_deployed", "capsule_recovered",
                "booster_landed", "booster_recovered", "lander_landed_safely", "lunar_flyby_completed", "crew_safe" })
                metrics[key] = 0;
        }

        public static MissionSim Create(FlightVehicleSpec spec, MissionSetup setup)
        {
            if (spec == null || setup == null) throw new ArgumentNullException(spec == null ? nameof(spec) : nameof(setup));
            if (setup.Contract == null || setup.Phases == null) throw new ArgumentException("Contract and phase catalog required.");
            if (setup.Seed != spec.BuildSeed || setup.Contract.Id != spec.Contract.Id)
                throw new ArgumentException("Mission seed and contract must match the build.");
            FlightGuard.Nonnegative(setup.RolloutDurationS, nameof(setup.RolloutDurationS));
            FlightGuard.Nonnegative(setup.CountdownDurationS, nameof(setup.CountdownDurationS));
            FlightGuard.Nonnegative(setup.OrbitalOperationsDurationS, nameof(setup.OrbitalOperationsDurationS));
            FlightGuard.Positive(setup.TargetOrbitAltitudeM, nameof(setup.TargetOrbitAltitudeM));
            return new MissionSim(spec, setup);
        }
        public FlightState State => state;
        public string Phase => phase;
        public double InclinationDeg { get; }
        public FlightResult? Result { get; private set; }
        public double MetS => lifted ? elapsedS - launchS : Math.Min(-Rk4Integrator.FixedStepS,
            elapsedS - setup.RolloutDurationS - setup.CountdownDurationS);
        private FlightStageSpec Stage => spec.Stages[stageIndex];
        public FailureModel Failures => failures;
        /// <summary>Stage engine after recovered engine-outs and stage damage (design 8.4).</summary>
        private EngineModel CurrentEngine
        {
            get
            {
                var upper = Stage.Id == "upper";
                var scale = failures.ThrustScale(upper ? Slots.UpperStageEngine : Slots.FirstStageEngine);
                if (upper && failures.StageDamaged) scale *= 0.5; // game_value: recontact damage halves upper thrust
                if (scale >= 1 && IspBoostFactor == 1) return Stage.Engine;
                if (cachedEngine == null || cachedEngineStage != stageIndex || cachedEngineScale != scale)
                {
                    var e = Stage.Engine;
                    cachedEngine = new EngineModel(e.ThrustSlN * scale, e.ThrustVacN * scale,
                        e.IspSlS * IspBoostFactor, e.IspVacS * IspBoostFactor);
                    cachedEngineStage = stageIndex; cachedEngineScale = scale;
                }
                return cachedEngine;
            }
        }
        private EngineModel? cachedEngine; private int cachedEngineStage = -1; private double cachedEngineScale;
        /// <summary>Δv bonus and fuel saver act as an Isp multiplier (game_value): the same propellant gives more Δv.</summary>
        public double IspBoostFactor => (1 + setup.Modifiers.DeltaVBonusFraction) / (1 - setup.Modifiers.FuelSaverFraction);
        private bool IsLastStage => stageIndex == spec.Stages.Count - 1;
        private bool Rolled(string checkpoint) => rolled.Contains(checkpoint);

        /// <summary>Emits the records as events; a fatal failure ends the mission. Returns true if the mission ended.</summary>
        private bool Apply(IReadOnlyList<FailureRecord> records)
        {
            FailureRecord? fatal = null;
            foreach (var r in records)
            {
                Emit(r.Kind, r.Mode);
                if (r.Kind == "failure" && r.Fatal && fatal == null) fatal = r;
            }
            if (fatal == null) return false;
            TryAutomaticEscape(fatal);
            Finish(MissionOutcome.Failure, fatal.Mode, fatal.Slot, announce: false);
            return true;
        }
        private bool RollOnce(string checkpoint)
        {
            if (!rolled.Add(checkpoint)) return false;
            return Apply(failures.Roll(checkpoint));
        }
        private double AltitudeM => state.RadiusM - body.RadiusM;
        private double RadialMs => (state.PositionXM * state.VelocityXMs + state.PositionYM * state.VelocityYMs) / state.RadiusM;
        private double AirSpeedMs
        {
            get
            {
                var x = state.VelocityXMs + body.RotationRateRadS * state.PositionYM;
                var y = state.VelocityYMs - body.RotationRateRadS * state.PositionXM;
                return Math.Sqrt(x * x + y * y);
            }
        }
        private double HeldBackKg => Stage.Id == "first" ? boosterReserveHeldKg : 0;
        private double boosterReserveHeldKg;
        private double PropellantKg => Math.Max(0, state.MassKg - Stage.FinalMassKg - carriedJettisonKg - HeldBackKg);
        private int delivered;
        /// <summary>Returns the events since the last delivery; events added between steps (Abort) ride the next Step.</summary>
        private IReadOnlyList<FlightEvent> Deliver() { delivered = events.Count; return events.ToArray(); }
        private void Emit(string kind, string id) => events.Add(new FlightEvent(tick, MetS, phase, kind, id));

        private void Enter(string id)
        {
            phase = id; phaseStartS = elapsedS;
            Emit("phase_entered", id);
            var definition = setup.Phases.Phase(id);
            foreach (var cue in definition.MinigameIds)
            {
                // Conditional engine-out/pogo, reusable-fairing and post-failure cues are emitted by their trigger.
                if (cue == "MG-11" || cue == "MG-12" || cue == "MG-10" || cue == "MG-28" || cue == "MG-25") continue;
                if (cue == "MG-26" && setup.Contract.Id != "C7") continue;
                Emit("minigame_cue", cue);
            }
            foreach (var fact in definition.FactIds) Emit("fact_moment", fact);
        }

        public IReadOnlyList<FlightEvent> Step(PilotInput input)
        {
            var result = StepCore(input);
            if (Result != null && result.Count == 0 && events.Count == delivered) return result;
            var before = events.Count;
            AnnounceAborts();
            return events.Count == before ? result : Deliver();
        }

        private IReadOnlyList<FlightEvent> StepCore(PilotInput input)
        {
            if (input == null || input.Main == null) throw new ArgumentNullException(nameof(input));
            FlightGuard.Range(input.Main.ThrottleFraction, 0, 1, nameof(input.Main.ThrottleFraction));
            FlightGuard.Finite(input.Main.PitchRad, nameof(input.Main.PitchRad));
            events.RemoveRange(0, delivered); delivered = 0;
            if (Result != null) return Array.Empty<FlightEvent>();
            tick++;
            if (input.Main.AbortId != null && !lifted && Abort(input.Main.AbortId)) return Deliver();
            if (!initialized) { initialized = true; Enter("F0"); }
            WarpFactor = ResolveWarp(input);
            if (WarpFactor < 1)
            {
                // Bullet time: the fixed-step integrator is held until 1/WarpFactor Step calls have accumulated.
                bulletTimeS += WarpFactor;
                if (bulletTimeS < 1 - 1e-9) return Deliver();
                bulletTimeS -= 1;
            }
            else if (WarpFactor > 1) return CoastStep(input, WarpFactor);
            elapsedS += Rk4Integrator.FixedStepS;
            if (phase == "F0") { if (elapsedS >= setup.RolloutDurationS) Enter("F1"); return Deliver(); }
            if (phase == "F1") { if (elapsedS - phaseStartS >= setup.CountdownDurationS) Enter("F2"); return Deliver(); }

            if (boosterActive) StepBooster(input);
            if (input.Main.AbortId != null && Abort(input.Main.AbortId)) return Deliver();
            if (entryBegan) { EntryStep(input); return Deliver(); }
            input = AssistedInput(input);
            throttleFraction = input.Main.Cutoff ? 0 : input.Main.ThrottleFraction;
            pitchRad = input.Main.PitchRad;
            if (phase == "F8" || (descentArmed && !entryBegan)) throttleFraction = 0;
            if (PropellantKg <= 1e-6) throttleFraction = 0; // game_value exhaustion tolerance, kg
            var radialX = state.PositionXM / state.RadiusM;
            var radialY = state.PositionYM / state.RadiusM;
            var dx = radialX * Math.Sin(pitchRad) - radialY * Math.Cos(pitchRad);
            var dy = radialY * Math.Sin(pitchRad) + radialX * Math.Cos(pitchRad);
            if (input.Main.Attitude != AttitudeMode.Manual && state.SpeedMs > 0)
            {
                var sign = input.Main.Attitude == AttitudeMode.Prograde ? 1 : -1;
                dx = sign * state.VelocityXMs / state.SpeedMs; dy = sign * state.VelocityYMs / state.SpeedMs;
            }
            if (!lifted && throttleFraction > 0 && RollOnce("ignition")) return Deliver();
            var control = new FlightControl(CurrentEngine, throttleFraction, dx, dy, spec.ReferenceAreaM2,
                descentArmed ? 0 : Stage.FinalMassKg + carriedJettisonKg); // the released capsule is lighter than the stack's dry mass
            if (!lifted)
            {
                var thrust = CurrentEngine.ThrustN(1) * throttleFraction;
                if (thrust <= state.MassKg * body.GravityMs2(body.RadiusM)) return Deliver();
                lifted = true; launchS = elapsedS; Enter("F3");
                if (RollOnce("liftoff")) return Deliver();
                if (failures.HasImuOnlyNavigation && Apply(failures.Condition("liftoff", "guidance_drift", Slots.Navigation)))
                    return Deliver();
            }
            var derivative = dynamics.Derivative(elapsedS, state, control);
            var grav = body.GravityMs2(state.RadiusM);
            gLoad = EntryPhysics.GLoadUnitless(derivative.AccelerationXMs2 + grav * radialX,
                derivative.AccelerationYMs2 + grav * radialY);
            state = dynamics.Step(state, elapsedS, control);
            maxAltitudeM = Math.Max(maxAltitudeM, AltitudeM);
            var q = Aerodynamics.DynamicPressurePa(body.DensityKgM3(AltitudeM), AirSpeedMs);
            peakQPa = Math.Max(peakQPa, q);
            var ascent = !descentArmed && (phase == "F3" || phase == "F4" || phase == "F5" || phase == "F6" || phase == "F7");
            if (ascent && failures.IsStructuralOverload(q, gLoad)
                && Apply(failures.Condition("maxq", "structural_failure", Slots.StructuralMaterial)))
                return Deliver();
            if (ascent && FailureModel.IsRangeSafetyViolation(AltitudeM, EntryPhysics.FlightPathAngleRad(state))
                && Apply(failures.Condition("ascent", "range_safety", "trajectory")))
                return Deliver();
            if (phase == "F3" && q >= 20000) Enter("F4");
            if (phase == "F4" && q < peakQPa * 0.85) Enter("F5");
            if (phase == "F3" && PropellantKg <= 1e-6) Enter("F5");
            if (lifted && phase != "F3" && phase != "F4" && RollOnce("maxq")) return Deliver();
            if (!descentArmed && (phase == "F5" || phase == "F4") && input.Main.Stage && stageIndex + 1 < spec.Stages.Count)
                { if (SeparateStage()) return Deliver(); }
            if (!descentArmed && phase == "F6" && input.Main.Deploy && AltitudeM >= 70000 && JettisonFairing()) return Deliver();
            if (IsLastStage && PropellantKg <= 1e-6 && (phase == "F5" || phase == "F6" || phase == "F7")
                && setup.Contract.Id != "C0" && CheckOrbitReached()) return Deliver();
            if (phase == "F7")
            {
                var elements = OrbitalMechanics.Elements(state, body.MuM3S2);
                if (elements.PeriapsisRadiusM - body.RadiusM > 150000 && throttleFraction == 0) Enter("F8");
            }
            if (OrbitalOperations(input)) return Deliver();
            if (phase == "F9" && !descentArmed && DeorbitLogic()) return Deliver();
            if (setup.Contract.Id == "C0" && lifted && !descentArmed
                && ((IsLastStage && PropellantKg <= 1e-6) || (input.Main.Cutoff && AltitudeM > 20000)))
                ArmBallisticDescent();
            StartEntryIfAtInterface();
            if (Result != null) return Deliver();
            if (AltitudeM < -1) Finish(MissionOutcome.Failure, "impact"); // game_value contact tolerance 1 m
            return Deliver();
        }

        private bool SeparateStage()
        {
            var dropped = Stage.JettisonMassKg;
            var discardedPropellantKg = PropellantKg;
            var boosterBundleKg = 0.0;
            // Keep fairing/tower until the explicit F6 jettison, while matching Dashboard's later-stage stack.
            var next = spec.Stages[stageIndex + 1];
            if (next.Id == "upper")
            {
                carriedJettisonKg = spec.FairingMassKg + spec.EscapeTowerMassKg;
                dropped = Math.Max(0, dropped - carriedJettisonKg);
            }
            var returning = Stage.Id == "first" && spec.RecoveryKind != "brec_expendable";
            if (returning)
            { // the booster keeps its dry mass and the reserved propellant for its own return (F7b)
                boosterBundleKg = dropped + boosterReserveHeldKg;
                BeginBoosterReturn(dropped, boosterReserveHeldKg);
            }
            state = new FlightState(state.PositionXM, state.PositionYM, state.VelocityXMs, state.VelocityYMs,
                state.MassKg - dropped - discardedPropellantKg - (returning ? boosterReserveHeldKg : 0));
            if (returning) boosterReserveHeldKg = 0;
            Emit("staging", Stage.Id); stageIndex++;
            stageSeparated = next.Id == "upper";
            Enter(stageSeparated ? "F6" : "F5");
            if (Apply(failures.Roll("staging")) || Apply(failures.RollPogo("staging"))) return true;
            return stageSeparated && Apply(failures.Roll("burn_upper"));
        }
        private bool JettisonFairing()
        {
            if (fairingDropped) return false;
            fairingDropped = true;
            if (Apply(failures.Roll("fairing"))) return true;
            if (!failures.FairingStuck)
            {
                state = new FlightState(state.PositionXM, state.PositionYM, state.VelocityXMs, state.VelocityYMs,
                    state.MassKg - carriedJettisonKg);
                carriedJettisonKg = 0;
                Emit("jettison", "fairing");
                if (spec.EscapeTowerMassKg > 0) { Emit("jettison", "escape_tower"); towerJettisoned = true; }
            }
            Enter("F7");
            return Apply(failures.Roll("burn_circularize"));
        }
        /// <summary>Last stage is empty: classify the orbit (game_value limits: 150 km target, 80 km partial).</summary>
        private bool CheckOrbitReached()
        {
            var peri = OrbitalMechanics.Elements(state, body.MuM3S2).PeriapsisRadiusM - body.RadiusM;
            if (peri >= 150000) return false; // the F7 -> F8 transition handles a good orbit
            if (peri >= 80000) { Finish(MissionOutcome.Partial, "low_orbit", null); return true; }
            Finish(MissionOutcome.Failure, "orbit_not_reached", null);
            return true;
        }
        private void Finish(MissionOutcome outcome, string? failure = null, string? slot = null, bool announce = true)
        {
            if (Result != null) return;
            if (outcome == MissionOutcome.Success && failure == null)
            {
                // Non-fatal degradations leave a wrong orbit or a stuck payload: partial success (design 8.5).
                if (degradedReason != null) failure = degradedReason;
                else if (failures.GuidanceDrift) failure = "guidance_drift";
                else if (failures.DeploymentFailed) failure = "deployment_failure";
                if (failure != null) { outcome = MissionOutcome.Partial; announce = false; }
            }
            metrics["apogee_km"] = maxAltitudeM / 1000;
            metrics["orbit_altitude_km"] = Math.Max(0, OrbitalMechanics.Elements(state, body.MuM3S2).PeriapsisRadiusM - body.RadiusM) / 1000;
            metrics["inclination_deg"] = InclinationDeg + (failures.GuidanceDrift ? FailureModel.GuidanceDriftInclinationDeg : 0);
            var failurePhase = failure == null ? null : phase;
            if (failure != null && announce) Emit("failure", failure);
            Result = new FlightResult(outcome, failure, failurePhase, slot,
                new ReadOnlyDictionary<string, double>(new Dictionary<string, double>(metrics)));
            Enter("F14"); Emit("mission_end", outcome.ToString());
        }
    }
}
