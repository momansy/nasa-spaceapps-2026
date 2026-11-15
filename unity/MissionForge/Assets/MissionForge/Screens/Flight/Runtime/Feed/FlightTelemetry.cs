using System;
using System.Collections.Generic;

namespace MissionForge.Screens.Flight
{
    /// <summary>Discrete flight events the view reacts to (cameras, VFX, HUD callouts). Mapped from Core events.</summary>
    public enum FlightEventKind
    {
        PhaseEntered,
        Ignition,
        LiftOff,
        MaxQ,
        BoosterSeparation,
        Meco,
        Staging,
        FairingJettison,
        Seco,
        Orbit,
        MinigameCue,
        FactMoment,
        Failure,
        Abort,
        MissionEnd,
        Other,
    }

    /// <summary>One discrete event of a simulation step. <see cref="Id"/> is the Core id (phase, stage or cue id).</summary>
    [Serializable]
    public sealed class FlightTelemetryEvent
    {
        public FlightEventKind kind;
        public string id = "";
        public string phase = "";
        public double metS;

        public FlightTelemetryEvent() { }

        public FlightTelemetryEvent(FlightEventKind kind, string id, string phase, double metS)
        {
            this.kind = kind;
            this.id = id ?? "";
            this.phase = phase ?? "";
            this.metS = metS;
        }
    }

    /// <summary>
    /// Snapshot of one simulation step, in SI units (m, m/s, Pa, rad, s; fractions 0–1). Every number comes from Core
    /// (MissionSim / Body); Unity only interpolates between two snapshots for display and converts units at the HUD.
    /// Positions and velocities are Core's planet-centred inertial 2-D frame (x radial at launch, y downrange).
    /// Field names are serialised as-is into recordings (Screens/Flight/Recordings/*.json).
    /// </summary>
    [Serializable]
    public sealed class FlightTelemetry
    {
        public long tick;
        /// <summary>Mission elapsed time, s (negative before lift-off).</summary>
        public double metS;
        public double altitudeM;
        /// <summary>Speed relative to the rotating atmosphere, m/s.</summary>
        public double surfaceSpeedMs;
        /// <summary>Inertial speed, m/s.</summary>
        public double orbitalSpeedMs;
        /// <summary>Radial speed, m/s, positive up.</summary>
        public double verticalSpeedMs;
        public double dynamicPressurePa;
        /// <summary>Surface speed / Core's constant 340 m/s sound speed (game_value), unitless.</summary>
        public double mach;
        /// <summary>Felt acceleration, g (gravity excluded, as Core's EntryPhysics.GLoadUnitless).</summary>
        public double gLoad;
        public double throttle01;
        /// <summary>Δv remaining per stage, m/s, bottom stage first (Core HUD snapshot).</summary>
        public double[] stageDeltaVMs = Array.Empty<double>();
        /// <summary>Propellant fraction per stage, 0–1, bottom stage first.</summary>
        public double[] stagePropellant01 = Array.Empty<double>();
        public double deltaVRemainingMs;
        /// <summary>Apoapsis altitude, m; NaN when undefined (escape).</summary>
        public double apoapsisM = double.NaN;
        /// <summary>Periapsis altitude, m; NaN when below the centre of the Earth (Core returns null).</summary>
        public double periapsisM = double.NaN;
        public double inclinationRad;
        /// <summary>Heat load as a fraction of the heat-shield capacity, 0–1+.</summary>
        public double heatLoad01;
        /// <summary>Ambient pressure / sea-level pressure, unitless 0–1 (Core Body.PressureRatioUnitless; plume width).</summary>
        public double pressureRatio;
        /// <summary>Displayed attitude, rad above the local horizontal.</summary>
        public double pitchRad = Math.PI / 2;
        /// <summary>
        /// Downrange angle over the rotating ground from the pad, rad: Core's inertial angle minus the pad's own rotation
        /// (Core's launch-direction surface speed / R × simulated time). Used to place the ground and the Earth.
        /// </summary>
        public double groundAngleRad;
        public double positionXM;
        public double positionYM;
        public double velocityXMs;
        public double velocityYMs;
        /// <summary>Flight phase id from data/flight_phases.json (F0–F14, F7b).</summary>
        public string phase = "F0";
        /// <summary>Active stage, 0 = first stage.</summary>
        public int stageIndex;
        public bool fairingJettisoned;
        /// <summary>Simulation time factor (0.1 bullet-time, 1 normal, up to 1000 in coasts).</summary>
        public double warp = 1;
        public bool missionEnded;
        public List<FlightTelemetryEvent> events = new List<FlightTelemetryEvent>();

        public bool HasApoapsis => !double.IsNaN(apoapsisM) && !double.IsInfinity(apoapsisM);
        public bool HasPeriapsis => !double.IsNaN(periapsisM) && !double.IsInfinity(periapsisM);
        public bool IsLifted => metS >= 0 && phase != "F0" && phase != "F1" && phase != "F2";

        /// <summary>Downrange angle travelled around the Earth from the pad, rad.</summary>
        public double DownrangeAngleRad => Math.Atan2(positionYM, positionXM);

        public FlightTelemetry Clone()
        {
            var copy = (FlightTelemetry)MemberwiseClone();
            copy.stageDeltaVMs = (double[])stageDeltaVMs.Clone();
            copy.stagePropellant01 = (double[])stagePropellant01.Clone();
            copy.events = new List<FlightTelemetryEvent>(events);
            return copy;
        }
    }

    /// <summary>Pilot commands for the feed (keyboard, gamepad, touch and phones go through one merger).</summary>
    public sealed class FlightControlCommand
    {
        /// <summary>Throttle 0–1, or null to leave it to the autopilot / assist.</summary>
        public double? Throttle01;
        /// <summary>Pitch rad above local horizontal, or null to leave it to guidance.</summary>
        public double? PitchRad;
        public bool Stage;
        public bool Cutoff;
        public bool Deploy;
        public string AbortId;
        /// <summary>Requested time warp; the feed enforces design 9.7 through Core's MissionTimeWarp.</summary>
        public double RequestedWarp = 1;
    }

    /// <summary>Source of flight telemetry. Implementations: <see cref="CoreFlightFeed"/>, <see cref="RecordedFlightFeed"/>.</summary>
    public interface IFlightFeed
    {
        /// <summary>Latest completed simulation step.</summary>
        FlightTelemetry Current { get; }

        /// <summary>Step before <see cref="Current"/>, for display interpolation.</summary>
        FlightTelemetry Previous { get; }

        /// <summary>Number of stages of the flown vehicle.</summary>
        int StageCount { get; }

        /// <summary>True once the feed has nothing more to deliver.</summary>
        bool IsFinished { get; }

        /// <summary>Advances exactly one 1/120 s simulation step and returns the new snapshot.</summary>
        FlightTelemetry Step();

        /// <summary>Minigame bullet-time (protocol section 10): the simulation runs at ×0.1 while true.</summary>
        bool BulletTime { get; set; }
    }

    /// <summary>Receives merged pilot commands. Applied on the next simulation step.</summary>
    public interface IFlightControlSink
    {
        void Submit(FlightControlCommand command);
    }
}
