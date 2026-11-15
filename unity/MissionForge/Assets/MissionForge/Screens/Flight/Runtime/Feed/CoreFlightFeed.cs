using System;
using System.Collections.Generic;
using MissionForge.Core.Build;
using MissionForge.Core.Data;
using MissionForge.Core.Flight;
using MissionForge.Core.Flight.Mission;

namespace MissionForge.Screens.Flight
{
    /// <summary>
    /// Adapts Core's deterministic mission driver (<see cref="MissionSim"/>, T013) to <see cref="IFlightFeed"/>.
    /// Core owns the physics (fixed 1/120 s RK4, Kepler coasts), phases, staging and failures; this class only copies
    /// Core's numbers into <see cref="FlightTelemetry"/> and maps Core events to view events. It never integrates.
    /// </summary>
    public sealed class CoreFlightFeed : IFlightFeed, IFlightControlSink
    {
        /// <summary>Durations handed to Core (all game_value, MissionSetup). The countdown scene opens with rollout complete, so
        /// Core's rollout is 0 s and the clock starts at T−10 s.</summary>
        public const double RolloutDurationS = 0;
        public const double CountdownDurationS = 10;
        /// <summary>Time in orbit before the payload deploy ends the C1 mission, s (game_value; long enough for the map).</summary>
        public const double OrbitalOperationsDurationS = 90;

        private readonly MissionSim _sim;
        private readonly FlightVehicleSpec _spec;
        private readonly double _rotationSpeedMs;
        private FlightControlCommand _pending;
        private double _lastThrottle;
        private bool _orbitReported;
        private double _simTimeS;

        public CoreFlightFeed(BuildState build, GameCatalog catalog, IReadOnlyDictionary<string, string> jsonByPath,
            bool fullAutopilot = true)
        {
            if (build == null) throw new ArgumentNullException(nameof(build));
            if (catalog == null) throw new ArgumentNullException(nameof(catalog));
            if (jsonByPath == null || !jsonByPath.TryGetValue("flight_phases.json", out string phasesJson))
                throw new ArgumentException("flight_phases.json is missing from the game data.", nameof(jsonByPath));

            _spec = FlightVehicleSpec.FromBuild(build, catalog);
            var setup = new MissionSetup
            {
                Seed = build.Seed,
                Contract = catalog.Contract(build.ContractId),
                Phases = FlightPhaseCatalog.Load(phasesJson),
                FullAutopilot = fullAutopilot,
                RolloutDurationS = RolloutDurationS,
                CountdownDurationS = CountdownDurationS,
                OrbitalOperationsDurationS = OrbitalOperationsDurationS,
            };
            if (jsonByPath.TryGetValue("assist_levels.json", out string assists)) setup.Assists = AssistLevelCatalog.Load(assists);
            if (jsonByPath.TryGetValue("abort_modes.json", out string aborts)) setup.Aborts = AbortModeCatalog.Load(aborts);
            _sim = MissionSim.Create(_spec, setup);
            // MissionSim starts at rest on the pad: its initial inertial velocity is the launch-direction surface rotation.
            _rotationSpeedMs = _sim.State.VelocityYMs;
            Current = Capture(Array.Empty<FlightEvent>(), advanced: false);
            Previous = Current;
        }

        public FlightTelemetry Current { get; private set; }
        public FlightTelemetry Previous { get; private set; }
        public int StageCount => _spec.Stages.Count;
        public bool IsFinished => _sim.Result != null;
        public bool BulletTime { get; set; }
        public FlightResult Result => _sim.Result;

        public void Submit(FlightControlCommand command) => _pending = command;

        public FlightTelemetry Step()
        {
            var input = new PilotInput { MinigameActive = BulletTime };
            FlightControlCommand cmd = _pending;
            _pending = null;
            if (cmd != null)
            {
                if (cmd.Throttle01.HasValue) input.Main.ThrottleFraction = Math.Max(0, Math.Min(1, cmd.Throttle01.Value));
                if (cmd.PitchRad.HasValue) input.Main.PitchRad = cmd.PitchRad.Value;
                input.Main.Stage = cmd.Stage;
                input.Main.Cutoff = cmd.Cutoff;
                input.Main.Deploy = cmd.Deploy;
                input.Main.AbortId = cmd.AbortId;
                input.RequestedWarpFactor = cmd.RequestedWarp;
            }
            IReadOnlyList<FlightEvent> events = _sim.Step(input);
            Previous = Current;
            Current = Capture(events, advanced: true);
            return Current;
        }

        private FlightTelemetry Capture(IReadOnlyList<FlightEvent> coreEvents, bool advanced)
        {
            HudSnapshot hud = _sim.Snapshot();
            // Core holds the inertial state on the pad until lift-off; from then the pad turns with the Earth for MET
            // seconds (MET already includes time warp).
            _simTimeS = hud.MetS > 0 ? hud.MetS : 0;
            FlightState s = _sim.State;
            Body earth = Body.Earth;
            double altitudeM = s.RadiusM - earth.RadiusM;
            double radialMs = (s.PositionXM * s.VelocityXMs + s.PositionYM * s.VelocityYMs) / s.RadiusM;
            // Air-relative speed with Core's rigid co-rotating atmosphere (same formula as MissionSim.AirSpeedMs).
            double omega = _rotationSpeedMs / earth.RadiusM;
            double ax = s.VelocityXMs + omega * s.PositionYM;
            double ay = s.VelocityYMs - omega * s.PositionXM;
            double surfaceMs = Math.Sqrt(ax * ax + ay * ay);

            int stages = _spec.Stages.Count;
            var dv = new double[stages];
            var prop = new double[stages];
            int stageIndex = 0;
            for (int i = 0; i < stages; i++)
            {
                dv[i] = hud.StageDeltaVMs.TryGetValue(_spec.Stages[i].Id, out double v) ? v : 0;
                if (dv[i] <= 0 && i < stages - 1) stageIndex = i + 1;
            }
            // Core zeroes the Δv of dropped stages; the first stage with Δv left (or the last) is active.
            for (int i = 0; i < stages; i++)
                prop[i] = i < stageIndex ? 0 : i == stageIndex ? Clamp01(hud.PropellantPct / 100) : 1;

            var t = new FlightTelemetry
            {
                tick = hud.TickCount,
                metS = hud.MetS,
                altitudeM = altitudeM,
                surfaceSpeedMs = surfaceMs,
                orbitalSpeedMs = s.SpeedMs,
                verticalSpeedMs = radialMs,
                dynamicPressurePa = hud.QKpa * 1000,
                mach = surfaceMs / earth.SoundSpeedMs,
                gLoad = hud.GLoad,
                throttle01 = hud.ThrottlePct / 100,
                stageDeltaVMs = dv,
                stagePropellant01 = prop,
                deltaVRemainingMs = hud.DvRemainingMs,
                apoapsisM = hud.ApoapsisKm.HasValue ? hud.ApoapsisKm.Value * 1000 : double.NaN,
                periapsisM = hud.PeriapsisKm.HasValue ? hud.PeriapsisKm.Value * 1000 : double.NaN,
                inclinationRad = hud.InclinationDeg * Math.PI / 180,
                heatLoad01 = hud.HeatLoadPct / 100,
                pressureRatio = earth.PressureRatioUnitless(Math.Max(0, altitudeM)),
                pitchRad = DisplayPitch(hud, s, radialMs),
                groundAngleRad = Math.Atan2(s.PositionYM, s.PositionXM) - omega * _simTimeS,
                positionXM = s.PositionXM,
                positionYM = s.PositionYM,
                velocityXMs = s.VelocityXMs,
                velocityYMs = s.VelocityYMs,
                phase = hud.Phase,
                stageIndex = stageIndex,
                fairingJettisoned = Current != null && Current.fairingJettisoned,
                warp = hud.WarpFactor,
                missionEnded = _sim.Result != null,
            };
            foreach (FlightEvent e in coreEvents) Map(e, t);
            if (t.throttle01 <= 0 && _lastThrottle > 0 && (t.phase == "F7" || t.phase == "F8"))
                t.events.Add(new FlightTelemetryEvent(FlightEventKind.Seco, "seco", t.phase, t.metS));
            _lastThrottle = t.throttle01;
            return t;
        }

        private void Map(FlightEvent e, FlightTelemetry t)
        {
            FlightEventKind kind = FlightEventKind.Other;
            switch (e.Kind)
            {
                case "phase_entered":
                    t.events.Add(new FlightTelemetryEvent(FlightEventKind.PhaseEntered, e.Id, e.Phase, e.MetS));
                    if (e.Id == "F2") kind = FlightEventKind.Ignition;
                    else if (e.Id == "F3") kind = FlightEventKind.LiftOff;
                    else if (e.Id == "F4") kind = FlightEventKind.MaxQ;
                    else if (e.Id == "F8" && !_orbitReported) { kind = FlightEventKind.Orbit; _orbitReported = true; }
                    else return;
                    break;
                case "staging":
                    // MECO and separation happen on the same Core step; the view plays shutdown tail-off then the drop.
                    t.events.Add(new FlightTelemetryEvent(FlightEventKind.Meco, e.Id, e.Phase, e.MetS));
                    kind = FlightEventKind.Staging;
                    break;
                case "jettison":
                    if (e.Id == "fairing") { kind = FlightEventKind.FairingJettison; t.fairingJettisoned = true; }
                    break;
                case "minigame_cue": kind = FlightEventKind.MinigameCue; break;
                case "fact_moment": kind = FlightEventKind.FactMoment; break;
                case "failure": kind = FlightEventKind.Failure; break;
                case "abort": kind = FlightEventKind.Abort; break;
                case "mission_end": kind = FlightEventKind.MissionEnd; break;
            }
            t.events.Add(new FlightTelemetryEvent(kind, e.Id, e.Phase, e.MetS));
        }

        /// <summary>Attitude for display: Core's guidance pitch when it has one, else the flight-path angle once moving.</summary>
        private static double DisplayPitch(HudSnapshot hud, FlightState s, double radialMs)
        {
            if (hud.TargetPitchDeg.HasValue) return hud.TargetPitchDeg.Value * Math.PI / 180;
            double speed = s.SpeedMs;
            if (speed < 50 || hud.Phase == "F0" || hud.Phase == "F1" || hud.Phase == "F2") return Math.PI / 2;
            return Math.Asin(Math.Max(-1, Math.Min(1, radialMs / speed)));
        }

        private static double Clamp01(double v) => v < 0 ? 0 : v > 1 ? 1 : v;
    }
}
