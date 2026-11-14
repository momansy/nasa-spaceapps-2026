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
        private readonly Body body;
        private readonly FlightDynamics dynamics;
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
            elapsedS += Rk4Integrator.FixedStepS;
            if (phase == "F0") { if (elapsedS >= setup.RolloutDurationS) Enter("F1"); return events.ToArray(); }
            if (phase == "F1") { if (elapsedS - phaseStartS >= setup.CountdownDurationS) Enter("F2"); return events.ToArray(); }

            input = AssistedInput(input);
            throttleFraction = input.Main.Cutoff ? 0 : input.Main.ThrottleFraction;
            pitchRad = input.Main.PitchRad;
            if (phase == "F8") throttleFraction = 0;
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
            var control = new FlightControl(Stage.Engine, throttleFraction, dx, dy, spec.ReferenceAreaM2,
                Stage.FinalMassKg + carriedJettisonKg);
            if (!lifted)
            {
                var thrust = Stage.Engine.ThrustN(1) * throttleFraction;
                if (thrust <= state.MassKg * body.GravityMs2(body.RadiusM)) return events.ToArray();
                lifted = true; launchS = elapsedS; Enter("F3");
            }
            var derivative = dynamics.Derivative(elapsedS, state, control);
            var grav = body.GravityMs2(state.RadiusM);
            gLoad = EntryPhysics.GLoadUnitless(derivative.AccelerationXMs2 + grav * radialX,
                derivative.AccelerationYMs2 + grav * radialY);
            state = dynamics.Step(state, elapsedS, control);
            maxAltitudeM = Math.Max(maxAltitudeM, AltitudeM);
            var q = Aerodynamics.DynamicPressurePa(body.DensityKgM3(AltitudeM), AirSpeedMs);
            peakQPa = Math.Max(peakQPa, q);
            if (phase == "F3" && q >= 20000) Enter("F4");
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
                metrics["payload_deployed"] = 1;
                if (!setup.Contract.Returning) Finish(MissionOutcome.Success);
            }
            if (AltitudeM < -1) Finish(MissionOutcome.Failure, "impact"); // game_value contact tolerance 1 m
            return events.ToArray();
        }

        private void SeparateStage()
        {
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
            stageSeparated = next.Id == "upper";
            Enter(stageSeparated ? "F6" : "F5");
        }
        private void JettisonFairing()
        {
            if (fairingDropped) return;
            state = new FlightState(state.PositionXM, state.PositionYM, state.VelocityXMs, state.VelocityYMs,
                state.MassKg - carriedJettisonKg);
            carriedJettisonKg = 0; fairingDropped = true;
            Emit("jettison", "fairing");
            if (spec.EscapeTowerMassKg > 0) Emit("jettison", "escape_tower");
            Enter("F7");
        }
        private void Finish(MissionOutcome outcome, string? failure = null)
        {
            if (Result != null) return;
            metrics["apogee_km"] = maxAltitudeM / 1000;
            metrics["orbit_altitude_km"] = Math.Max(0, OrbitalMechanics.Elements(state, body.MuM3S2).PeriapsisRadiusM - body.RadiusM) / 1000;
            metrics["inclination_deg"] = InclinationDeg;
            var failurePhase = failure == null ? null : phase;
            if (failure != null) Emit("failure", failure);
            Result = new FlightResult(outcome, failure, failurePhase, null,
                new ReadOnlyDictionary<string, double>(new Dictionary<string, double>(metrics)));
            Enter("F14"); Emit("mission_end", outcome.ToString());
        }
    }
}
