using System;
using System.Collections.Generic;
using MissionForge.Core.Data;

namespace MissionForge.Core.Flight.Mission
{
    public enum ShieldKind { Reroll, Negate }
    public enum MissionOutcome { Success, Partial, Failure }
    public enum AttitudeMode { Manual, Prograde, Retrograde, HeatShieldForward }

    /// <summary>Host bridge from scoring; fractions and shield counts are game_value.</summary>
    public sealed class FlightModifiers
    {
        public IReadOnlyList<ShieldKind> Shields { get; set; } = Array.Empty<ShieldKind>();
        public double DeltaVBonusFraction { get; set; }
        public double HeatMarginFraction { get; set; }
        public double LoadMarginFraction { get; set; }
        public double PrecisionFraction { get; set; }
        public double FuelSaverFraction { get; set; }
        public bool SaveTheMission { get; set; }
    }

    /// <summary>One craft's sampled controls; pitch is radians above local horizontal.</summary>
    public sealed class CraftInput
    {
        public double ThrottleFraction { get; set; }
        public double PitchRad { get; set; } = Math.PI / 2;
        public AttitudeMode Attitude { get; set; }
        public bool Stage { get; set; }
        public bool Cutoff { get; set; }
        public bool Deploy { get; set; }
        public bool Rcs { get; set; }
        public string? AbortId { get; set; }
    }
    public sealed class PilotInput
    {
        public CraftInput Main { get; set; } = new CraftInput();
        public CraftInput Booster { get; set; } = new CraftInput();
        public bool MinigameActive { get; set; }
        public double RequestedWarpFactor { get; set; } = 1;
    }

    /// <summary>Durations and target orbit are game_value settings supplied by the host.</summary>
    public sealed class MissionSetup
    {
        public ulong Seed { get; set; }
        public ContractDef Contract { get; set; } = null!;
        public FlightPhaseCatalog Phases { get; set; } = null!;
        public string AssistLevelId { get; set; } = "engineer";
        public AssistLevelCatalog? Assists { get; set; }
        public AbortModeCatalog? Aborts { get; set; }
        /// <summary>Game_value test/demo controller; distinct from the player-facing assist levels.</summary>
        public bool FullAutopilot { get; set; }
        public FlightModifiers Modifiers { get; set; } = new FlightModifiers();
        public double RolloutDurationS { get; set; } = 2;
        public double CountdownDurationS { get; set; } = 8;
        public double OrbitalOperationsDurationS { get; set; } = 30;
        public double TargetOrbitAltitudeM { get; set; } = 300000;
    }

    public sealed class FlightEvent
    {
        internal FlightEvent(long tick, double metS, string phase, string kind, string id)
        { TickCount = tick; MetS = metS; Phase = phase; Kind = kind; Id = id; }
        public long TickCount { get; }
        public double MetS { get; }
        public string Phase { get; }
        public string Kind { get; }
        public string Id { get; }
    }
    public sealed class FlightResult
    {
        internal FlightResult(MissionOutcome outcome, string? failureMode, string? failurePhase,
            string? failureSlot, IReadOnlyDictionary<string, double> metrics)
        { Outcome = outcome; FailureMode = failureMode; FailurePhase = failurePhase; FailureSlot = failureSlot; Metrics = metrics; }
        public MissionOutcome Outcome { get; }
        public string? FailureMode { get; }
        public string? FailurePhase { get; }
        public string? FailureSlot { get; }
        /// <summary>Contract metric keys preserve their data units; booleans use 0/1.</summary>
        public IReadOnlyDictionary<string, double> Metrics { get; }
    }

    /// <summary>UI boundary; SI except explicit km, kPa, degrees, percent. Numeric thresholds are game_value.</summary>
    public sealed class HudSnapshot
    {
        public long TickCount { get; internal set; }
        public string Phase { get; internal set; } = "F0";
        public double MetS { get; internal set; }
        public double AltitudeKm { get; internal set; }
        public double VelocityMs { get; internal set; }
        public double VerticalSpeedMs { get; internal set; }
        public double QKpa { get; internal set; }
        public double GLoad { get; internal set; }
        public double ThrottlePct { get; internal set; }
        public double PropellantPct { get; internal set; }
        public double DvRemainingMs { get; internal set; }
        public double? ApoapsisKm { get; internal set; }
        public double? PeriapsisKm { get; internal set; }
        public double InclinationDeg { get; internal set; }
        public double HeatLoadPct { get; internal set; }
        public double WarpFactor { get; internal set; } = 1;
        public double? TargetPitchDeg { get; internal set; }
        public IReadOnlyDictionary<string, double> StageDeltaVMs { get; internal set; } = null!;
        public IReadOnlyDictionary<string, IReadOnlyDictionary<string, double>> Channels { get; internal set; } = null!;
    }
}
