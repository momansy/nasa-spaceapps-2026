using System;
using System.Collections.Generic;
using System.Collections.ObjectModel;
using System.Linq;
using MissionForge.Core.Build;
using MissionForge.Core.Data;

namespace MissionForge.Core.Flight.Mission
{
    /// <summary>Deterministic mission driver. Physics uses the T007 kernel; mission gates are game_value.</summary>
    public sealed partial class MissionSim
    {
        private readonly FlightVehicleSpec spec;
        private readonly MissionSetup setup;
        private readonly Body body;
        private readonly FlightDynamics dynamics;
        private readonly MissionFailureModel failureModel;
        private readonly List<FlightEvent> events = new List<FlightEvent>();
        private readonly Dictionary<string, double> metrics = new Dictionary<string, double>(StringComparer.Ordinal);
        private readonly HashSet<string> rolledCheckpoints = new HashSet<string>(StringComparer.Ordinal);
        private readonly Dictionary<int, int> failedEngines = new Dictionary<int, int>();
        private FlightState state;
        private int stageIndex;
        private double elapsedS, phaseStartS, launchS = double.NaN, peakQPa, maxAltitudeM;
        private double throttleFraction, pitchRad = Math.PI / 2, gLoad;
        private double warpFactor = 1;
        private bool initialized, lifted, fairingDropped, stageSeparated;
        private EntryProfileResult? entryProfile;
        private BoosterReturnSim? boosterReturn;
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
            failureModel = new MissionFailureModel(spec, setup.Modifiers);
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
        private double PropellantKg => Math.Max(0, state.MassKg - Stage.FinalMassKg - carriedJettisonKg);
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
            foreach (var abortId in AvailableAborts()) Emit("abort_available", abortId);
        }

        public IReadOnlyList<FlightEvent> Step(PilotInput input)
        {
            if (input == null || input.Main == null) throw new ArgumentNullException(nameof(input));
            FlightGuard.Range(input.Main.ThrottleFraction, 0, 1, nameof(input.Main.ThrottleFraction));
            FlightGuard.Finite(input.Main.PitchRad, nameof(input.Main.PitchRad));
            events.Clear();
            if (Result != null) return Array.Empty<FlightEvent>();
            tick++;
            if (!initialized) { initialized = true; Enter("F0"); }
            if (phase == "F0")
            {
                elapsedS += Rk4Integrator.FixedStepS;
                if (elapsedS >= setup.RolloutDurationS) Enter("F1");
                return events.ToArray();
            }
            if (phase == "F1")
            {
                elapsedS += Rk4Integrator.FixedStepS;
                if (elapsedS - phaseStartS >= setup.CountdownDurationS) Enter("F2");
                return events.ToArray();
            }

            input = AssistedInput(input);
            if (!string.IsNullOrEmpty(input.Main.AbortId))
            {
                if (!AvailableAborts().Contains(input.Main.AbortId!))
                    throw new InvalidOperationException($"Abort '{input.Main.AbortId}' is not available in phase {phase}.");
                PerformAbort(input.Main.AbortId!);
                return events.ToArray();
            }
            throttleFraction = input.Main.Cutoff ? 0 : input.Main.ThrottleFraction;
            pitchRad = input.Main.PitchRad;
            if (phase == "F8") throttleFraction = 0;
            if (phase == "F9" || phase == "F10" || phase == "F11" || phase == "F12" || phase == "F13")
                throttleFraction = 0;
            if (PropellantKg <= 1e-6) throttleFraction = 0; // game_value exhaustion tolerance, kg
            if (phase == "F2" && throttleFraction > 0
                && !RollCheckpoint("ignition", Slots.FirstStageEngine, 2, true)) return events.ToArray();
            var failedEngineCount = failedEngines.TryGetValue(stageIndex, out var failed) ? failed : 0;
            throttleFraction *= Math.Max(0, Stage.EngineCount - failedEngineCount) / (double)Math.Max(1, Stage.EngineCount);
            warpFactor = MissionTimeWarp.Resolve(input.RequestedWarpFactor, throttleFraction > 0, AltitudeM,
                input.MinigameActive);
            var simulationStepS = Rk4Integrator.FixedStepS * warpFactor;
            elapsedS += simulationStepS;
            if (HandleReturnPhase()) return events.ToArray();
            if (boosterReturn != null)
            {
                boosterReturn.Step(input.Booster, setup.FullAutopilot);
                if (boosterReturn.Succeeded && metrics["booster_landed"] == 0)
                {
                    metrics["booster_landed"] = 1; metrics["booster_recovered"] = 1;
                    metrics["booster_touchdown_speed_m_s"] = boosterReturn.TouchdownSpeedMs;
                    metrics["booster_landing_error_km"] = boosterReturn.HorizontalErrorM / 1000;
                }
            }
            var radialX = state.PositionXM / state.RadiusM;
            var radialY = state.PositionYM / state.RadiusM;
            var dx = radialX * Math.Sin(pitchRad) - radialY * Math.Cos(pitchRad);
            var dy = radialY * Math.Sin(pitchRad) + radialX * Math.Cos(pitchRad);
            if (input.Main.Attitude != AttitudeMode.Manual && state.SpeedMs > 0)
            {
                var sign = input.Main.Attitude == AttitudeMode.Prograde ? 1 : -1;
                dx = sign * state.VelocityXMs / state.SpeedMs; dy = sign * state.VelocityYMs / state.SpeedMs;
            }
            var control = new FlightControl(Stage.Engine, throttleFraction, dx, dy, spec.ReferenceAreaM2,
                Stage.FinalMassKg + carriedJettisonKg);
            if (!lifted)
            {
                var thrust = Stage.Engine.ThrustN(1) * throttleFraction;
                if (thrust <= state.MassKg * body.GravityMs2(body.RadiusM)) return events.ToArray();
                if (!RollCheckpoint("liftoff", Slots.StructuralMaterial, 2, false)) return events.ToArray();
                if (!RollCheckpoint("first_burn", Slots.FirstStageEngine, 2, true)) return events.ToArray();
                lifted = true; launchS = elapsedS; Enter("F3");
            }
            var derivative = dynamics.Derivative(elapsedS, state, control);
            var grav = body.GravityMs2(state.RadiusM);
            gLoad = EntryPhysics.GLoadUnitless(derivative.AccelerationXMs2 + grav * radialX,
                derivative.AccelerationYMs2 + grav * radialY);
            if (warpFactor > 1)
            {
                var elements = OrbitalMechanics.Elements(state, body.MuM3S2);
                if (elements.SemiMajorAxisM > 0 && elements.EccentricityUnitless < 1)
                    state = OrbitalMechanics.PropagateElliptic(state, body.MuM3S2, simulationStepS);
                else
                {
                    warpFactor = 1;
                    elapsedS -= simulationStepS - Rk4Integrator.FixedStepS;
                    state = dynamics.Step(state, elapsedS, control);
                }
            }
            else
            {
                var fixedResult = dynamics.Step(state, elapsedS, control);
                if (warpFactor == 1) state = fixedResult;
                else state = InterpolateState(state, fixedResult, warpFactor);
            }
            maxAltitudeM = Math.Max(maxAltitudeM, AltitudeM);
            if (setup.Contract.Id == "C0" && maxAltitudeM >= 100_000 && RadialMs < 0
                && phase != "F10" && phase != "F11" && phase != "F12" && phase != "F13")
            {
                throttleFraction = 0;
                entryProfile = EntryProfile.Simulate(body, Math.Max(100, AirSpeedMs), 1.5);
                Enter("F10");
                return events.ToArray();
            }
            var q = Aerodynamics.DynamicPressurePa(body.DensityKgM3(AltitudeM), AirSpeedMs);
            peakQPa = Math.Max(peakQPa, q);
            if (phase == "F3" && q >= 20000)
            {
                if (!RollCheckpoint("max_q", Slots.StructuralMaterial, 2, false)) return events.ToArray();
                Enter("F4");
            }
            if (phase == "F4" && q < peakQPa * 0.85) Enter("F5");
            if (phase == "F3" && PropellantKg <= 1e-6) Enter("F5");
            if ((phase == "F5" || phase == "F4") && input.Main.Stage && stageIndex + 1 < spec.Stages.Count)
                SeparateStage();
            if (phase == "F6" && input.Main.Deploy && AltitudeM >= 70000) JettisonFairing();
            if (phase == "F7")
            {
                var elements = OrbitalMechanics.Elements(state, body.MuM3S2);
                if (elements.PeriapsisRadiusM - body.RadiusM > 150000 && throttleFraction == 0) Enter("F8");
            }
            if (phase == "F8" && elapsedS - phaseStartS >= setup.OrbitalOperationsDurationS && input.Main.Deploy)
            {
                if (!RollCheckpoint("deployment", Slots.PayloadInstrument, 1, false)) return events.ToArray();
                if (!CompleteScriptedTransfer()) return events.ToArray();
                metrics["payload_deployed"] = 1;
                if (!setup.Contract.Returning) Finish(MissionOutcome.Success);
                else Enter("F9");
            }
            if (AltitudeM < -1) Finish(MissionOutcome.Failure, "impact"); // game_value contact tolerance 1 m
            return events.ToArray();
        }

        private bool HandleReturnPhase()
        {
            if (phase == "F9" && elapsedS - phaseStartS >= 10)
            {
                Enter("F10");
                var entrySpeedMs = setup.Contract.EntrySpeedMps ?? 7_800; // real_world_approximate LEO default
                if (!RollCheckpoint("entry", Slots.HeatShield, 1, false)) return true;
                entryProfile = EntryProfile.Simulate(body, entrySpeedMs, 1.5);
                if (MissionFailureModel.HeatShieldLimitExceeded(entrySpeedMs, spec.HeatShieldSpeedRatingMs,
                    entryProfile.HeatLoadJm2, setup.Modifiers.HeatMarginFraction))
                {
                    Finish(MissionOutcome.Failure, "heat_shield_burn_through", Slots.HeatShield);
                    return true;
                }
                if (entryProfile.PeakHeatFluxWm2 >= 500_000) // game_value blackout threshold
                {
                    Emit("blackout", "on");
                    Emit("blackout", "off");
                }
                return true;
            }
            if (phase == "F10" && elapsedS - phaseStartS >= 40)
            {
                Enter("F11"); Emit("jettison", "drogue_chutes"); return true;
            }
            if (phase == "F11" && elapsedS - phaseStartS >= 10)
            {
                if (!RollCheckpoint("chutes", Slots.CapsuleRecovery, 2, false)) return true;
                Enter("F12"); Emit("jettison", "main_chutes"); return true;
            }
            if (phase == "F12" && elapsedS - phaseStartS >= 20)
            {
                if (!RollCheckpoint("landing", Slots.CapsuleRecovery, 2, false)) return true;
                metrics["capsule_recovered"] = 1;
                metrics["capsule_landing_error_km"] = 1.5; // game_value nominal ellipse
                metrics["crew_safe"] = setup.Contract.Crewed ? 1 : 0;
                Enter("F13"); return true;
            }
            if (phase == "F13" && elapsedS - phaseStartS >= 5)
            {
                Finish(abortOutcomePartial ? MissionOutcome.Partial : MissionOutcome.Success); return true;
            }
            return phase == "F9" || phase == "F10" || phase == "F11" || phase == "F12" || phase == "F13";
        }

        private bool CompleteScriptedTransfer()
        {
            var id = setup.Contract.Id;
            if (id != "C5" && id != "C6" && id != "C7") return true;
            var availableDvMs = spec.DashboardDeltaVMs * (1 + setup.Modifiers.DeltaVBonusFraction);
            if (availableDvMs < setup.Contract.DvRequiredMps)
            {
                Finish(MissionOutcome.Failure, "transfer_delta_v_shortfall");
                return false;
            }
            Emit("staging", "scripted_transfer_coast");
            if (id == "C5") metrics["apogee_km"] = 35_786; // real_world_approximate GEO altitude
            if (id == "C6") metrics["lunar_flyby_completed"] = 1;
            if (id == "C7")
            {
                // The interplanetary cruise and Mars targeting are cinematic; entry heating still
                // uses the physical Mars atmosphere model from the flight kernel.
                entryProfile = EntryProfile.Simulate(Body.Mars, 5_500, 1.0); // real_world_approximate
                metrics["lander_landed_safely"] = 1;
            }
            return true;
        }

        private static FlightState InterpolateState(FlightState from, FlightState to, double fraction)
        {
            return new FlightState(
                from.PositionXM + (to.PositionXM - from.PositionXM) * fraction,
                from.PositionYM + (to.PositionYM - from.PositionYM) * fraction,
                from.VelocityXMs + (to.VelocityXMs - from.VelocityXMs) * fraction,
                from.VelocityYMs + (to.VelocityYMs - from.VelocityYMs) * fraction,
                from.MassKg + (to.MassKg - from.MassKg) * fraction);
        }

        private void SeparateStage()
        {
            if (!RollCheckpoint("staging", Slots.StageSeparation, 1, false)) return;
            var separatedStage = Stage;
            var dropped = Stage.JettisonMassKg;
            var discardedPropellantKg = PropellantKg;
            // Keep fairing/tower until the explicit F6 jettison, while matching Dashboard's later-stage stack.
            var next = spec.Stages[stageIndex + 1];
            if (next.Id == "upper")
            {
                carriedJettisonKg = spec.FairingMassKg + spec.EscapeTowerMassKg;
                dropped = Math.Max(0, dropped - carriedJettisonKg);
            }
            state = new FlightState(state.PositionXM, state.PositionYM, state.VelocityXMs, state.VelocityYMs,
                state.MassKg - dropped - discardedPropellantKg);
            Emit("staging", Stage.Id); stageIndex++;
            if (spec.RecoveryKind != "brec_expendable" && boosterReturn == null)
            {
                var reservedPropellantKg = Math.Max(2_000, separatedStage.FinalMassKg * 0.25); // game_value reserve
                var horizontalErrorM = spec.RecoveryKind == "brec_propulsive_rtls" ? 50_000
                    : spec.RecoveryKind == "brec_propulsive_drone_ship" ? 5_000 : 0;
                boosterReturn = new BoosterReturnSim(Math.Max(1, AltitudeM), RadialMs, horizontalErrorM,
                    Math.Max(1, spec.FirstDryMassKg + spec.BoosterDryMassKg), reservedPropellantKg,
                    separatedStage.Engine.ThrustSlN, separatedStage.Engine.MassFlowKgS(1));
            }
            stageSeparated = next.Id == "upper";
            Enter(stageSeparated ? "F6" : "F5");
            if (stageSeparated) RollCheckpoint("upper_burn", Slots.UpperStageEngine, 1, true);
        }
        private void JettisonFairing()
        {
            if (fairingDropped) return;
            if (!RollCheckpoint("fairing", Slots.Fairing, 1, false)) return;
            state = new FlightState(state.PositionXM, state.PositionYM, state.VelocityXMs, state.VelocityYMs,
                state.MassKg - carriedJettisonKg);
            carriedJettisonKg = 0; fairingDropped = true;
            Emit("jettison", "fairing");
            if (spec.EscapeTowerMassKg > 0) Emit("jettison", "escape_tower");
            Enter("F7");
        }
        private bool RollCheckpoint(string checkpointId, string slot, int exposureCount, bool perEngine)
        {
            var checkpointKey = checkpointId + ":" + slot;
            if (!rolledCheckpoints.Add(checkpointKey)) return Result == null;
            var units = perEngine ? Math.Max(1, Stage.EngineCount) : 1;
            for (var unit = 0; unit < units; unit++)
            {
                var result = failureModel.Check(checkpointId, slot, exposureCount, unit);
                if (result.ConsumedShield.HasValue) Emit("shield_consumed", result.ConsumedShield.Value.ToString().ToLowerInvariant());
                if (result.Succeeded) continue;
                var engineOut = perEngine && units > 1
                    && ReliabilityModel.EngineOutCapable(spec.Vehicle, stageIndex == 0);
                if (engineOut)
                {
                    failedEngines[stageIndex] = (failedEngines.TryGetValue(stageIndex, out var count) ? count : 0) + 1;
                    Emit("failure", "engine_out:" + slot + ":" + unit);
                    continue;
                }
                if ((checkpointId == "ignition" || checkpointId == "liftoff" || checkpointId == "max_q")
                    && TryAutomaticEscape()) return false;
                Finish(MissionOutcome.Failure, checkpointId + "_failure", slot);
                return false;
            }
            return true;
        }

        private void Finish(MissionOutcome outcome, string? failure = null, string? failureSlot = null)
        {
            if (Result != null) return;
            if (!metrics.ContainsKey("apogee_km")) metrics["apogee_km"] = maxAltitudeM / 1000;
            metrics["orbit_altitude_km"] = Math.Max(0, OrbitalMechanics.Elements(state, body.MuM3S2).PeriapsisRadiusM - body.RadiusM) / 1000;
            metrics["inclination_deg"] = InclinationDeg;
            var failurePhase = failure == null ? null : phase;
            if (failure != null) Emit("failure", failure);
            Result = new FlightResult(outcome, failure, failurePhase, failureSlot,
                new ReadOnlyDictionary<string, double>(new Dictionary<string, double>(metrics)));
            Enter("F14"); Emit("mission_end", outcome.ToString());
        }
    }
}
