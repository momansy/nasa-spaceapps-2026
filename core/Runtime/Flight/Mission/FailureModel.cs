using System;
using System.Collections.Generic;
using MissionForge.Core.Build;
using MissionForge.Core.Data;

namespace MissionForge.Core.Flight.Mission
{
    /// <summary>One failure-model outcome; Kind is <c>failure</c> or <c>shield_consumed</c>.</summary>
    public sealed class FailureRecord
    {
        internal FailureRecord(string kind, string checkpoint, string mode, string slot, bool fatal, bool missionImpact)
        { Kind = kind; Checkpoint = checkpoint; Mode = mode; Slot = slot; Fatal = fatal; MissionImpact = missionImpact; }
        public string Kind { get; }
        public string Checkpoint { get; }
        /// <summary>Failure mode of design table 8.4, or the shield kind for <c>shield_consumed</c>.</summary>
        public string Mode { get; }
        public string Slot { get; }
        /// <summary>Ends the mission (vehicle or crew lost).</summary>
        public bool Fatal { get; }
        /// <summary>False only for a recovered failure (engine-out, one lost unit of a redundant set).</summary>
        public bool MissionImpact { get; }
    }

    /// <summary>
    /// Deterministic failure model (design 8.4). A part exposed at n checkpoints survives each with probability
    /// R_true^(1/n) (game_value decision), so the whole-flight survival equals the build's true reliability.
    /// Every draw is keyed by (seed, "failure", "checkpoint:slot", unit): pilot input never changes a draw.
    /// </summary>
    public sealed class FailureModel
    {
        public const string StreamId = "failure";
        // game_value thresholds (disclosed in the flight README).
        public const double BaseStructuralLimitKpaG = 120;
        public const double PogoPropellantThresholdKg = 250000;
        public const double PogoChanceFraction = 0.25;
        public const double GuidanceDriftInclinationDeg = 1.5;
        public const double RangeSafetyFlightPathDeg = -5;
        public const double RangeSafetyMinAltitudeM = 1000;
        private const int RerollIndexOffset = 1000;

        public static readonly string[] AllCheckpoints =
        {
            "ignition", "liftoff", "maxq", "staging", "fairing", "burn_upper", "burn_circularize",
            "deployment", "entry", "chutes", "landing", "booster_landing"
        };

        private sealed class Item
        {
            public string Slot = "", Mode = "", Kind = "";
            public int Units; public bool EngineOut, Mirrored;
            public double PerCheckpointSuccess, ModifierFactor = 1;
            public string[] Checkpoints = Array.Empty<string>();
            public bool[] Dead = Array.Empty<bool>();
            public bool ModifierRolled;
            public int DeadCount() { var n = 0; foreach (var d in Dead) if (d) n++; return n; }
        }

        private readonly ulong seed;
        private readonly FlightModifiers modifiers;
        private readonly Vehicle vehicle;
        private readonly List<Item> items = new List<Item>();
        private readonly HashSet<string> conditionHandled = new HashSet<string>(StringComparer.Ordinal);
        private int shieldsUsed;
        private bool saveUsed;

        public FailureModel(FlightVehicleSpec spec, FlightModifiers? modifiers)
        {
            if (spec == null) throw new ArgumentNullException(nameof(spec));
            this.modifiers = modifiers ?? new FlightModifiers();
            seed = spec.BuildSeed; vehicle = spec.Vehicle;
            var checkpoints = MissionCheckpoints(spec);
            foreach (var item in ReliabilityModel.TrueSuccess(vehicle).Items)
            {
                var slot = item.Category;
                var entry = new Item { Slot = slot, Units = Math.Max(1, item.Units), EngineOut = item.EngineOutCapable };
                var exposure = Exposure(slot, checkpoints);
                entry.Checkpoints = exposure; entry.Mode = ModeOf(slot);
                if (item.Id == "boosters")
                {
                    entry.Kind = "boosters"; entry.Mirrored = vehicle.BoostersMirrorFirstStage;
                    // R_b is the product over k boosters; each booster survives the flight with R_b^(1/k).
                    var perBooster = Math.Pow(item.Reliability, 1.0 / entry.Units);
                    entry.PerCheckpointSuccess = Math.Pow(perBooster, 1.0 / exposure.Length);
                }
                else if (item.Id == "first_stage_cluster" || item.Id == "upper_stage_cluster")
                {
                    entry.Kind = "engines";
                    var r = ReliabilityModel.True(vehicle, slot);
                    entry.PerCheckpointSuccess = Math.Pow(r, 1.0 / exposure.Length);
                    var cluster = ReliabilityModel.Cluster(r, entry.Units, entry.EngineOut);
                    entry.ModifierFactor = cluster <= 0 ? 1 : Math.Min(1, item.Reliability / cluster);
                }
                else
                {
                    entry.Kind = "part";
                    var r = ReliabilityModel.True(vehicle, slot);
                    entry.PerCheckpointSuccess = Math.Pow(r, 1.0 / exposure.Length);
                }
                entry.Dead = new bool[entry.Units];
                items.Add(entry);
            }
        }

        // ------------------------------------------------------------------ exposure tables

        /// <summary>Checkpoints that exist in this mission, in flight order.</summary>
        public static IReadOnlyList<string> MissionCheckpoints(FlightVehicleSpec spec)
        {
            var list = new List<string> { "ignition", "liftoff", "maxq", "staging", "fairing", "burn_upper",
                "burn_circularize", "deployment" };
            if (spec.Contract.Returning) { list.Add("entry"); list.Add("chutes"); list.Add("landing"); }
            if (spec.RecoveryKind != "brec_expendable") list.Add("booster_landing");
            return list;
        }

        private static string[] Exposure(string slot, IReadOnlyList<string> mission)
        {
            string[] wanted;
            switch (slot)
            {
                case Slots.FirstStageEngine: wanted = new[] { "ignition", "liftoff", "maxq", "staging" }; break;
                case Slots.StrapOnBoosters: wanted = new[] { "ignition", "liftoff", "maxq", "staging" }; break;
                case Slots.StageSeparation: wanted = new[] { "staging" }; break;
                case Slots.Fairing: wanted = new[] { "fairing" }; break;
                case Slots.LaunchEscape: wanted = new[] { "fairing" }; break; // tower jettison with the fairing
                case Slots.UpperStageEngine: wanted = new[] { "burn_upper", "burn_circularize" }; break;
                case Slots.Avionics: case Slots.Navigation: case Slots.AeroControl:
                    wanted = new[] { "liftoff", "maxq", "staging", "burn_circularize", "deployment" }; break;
                case Slots.HeatShield: wanted = new[] { "entry" }; break;
                case Slots.CapsuleRecovery: wanted = new[] { "chutes", "landing" }; break;
                case Slots.Lander: wanted = new[] { "entry", "landing" }; break;
                case Slots.BoosterRecovery: wanted = new[] { "booster_landing" }; break;
                default: wanted = new[] { "deployment" }; break;
            }
            var result = new List<string>();
            foreach (var cp in wanted) if (Contains(mission, cp)) result.Add(cp);
            if (result.Count == 0) result.Add("deployment"); // every build part is exposed at least once
            return result.ToArray();
        }
        private static bool Contains(IReadOnlyList<string> list, string value)
        { for (var i = 0; i < list.Count; i++) if (list[i] == value) return true; return false; }

        private static string ModeOf(string slot)
        {
            switch (slot)
            {
                case Slots.FirstStageEngine: case Slots.UpperStageEngine: return "engine_shutdown";
                case Slots.StrapOnBoosters: return "booster_failure";
                case Slots.StageSeparation: return "stage_recontact";
                case Slots.Fairing: case Slots.LaunchEscape: return "fairing_stuck";
                case Slots.Avionics: return "guidance_fault";
                case Slots.Navigation: return "guidance_drift";
                case Slots.AeroControl: return "control_loss";
                case Slots.HeatShield: return "burn_through";
                case Slots.CapsuleRecovery: return "parachute_failure";
                case Slots.Lander: return "landing_failure";
                case Slots.BoosterRecovery: return "booster_landing_failure";
                default: return "deployment_failure";
            }
        }
        /// <summary>True when the mode ends the mission outright (vehicle or crew lost).</summary>
        public static bool IsFatalMode(string mode)
        {
            switch (mode)
            {
                case "engine_shutdown": case "booster_failure": case "guidance_fault": case "control_loss":
                case "burn_through": case "parachute_failure": case "landing_failure":
                case "structural_failure": case "range_safety": case "pogo":
                    return true;
                default: return false;
            }
        }

        // ------------------------------------------------------------------ derived effects

        /// <summary>Remaining thrust fraction of an engine slot after recovered engine-out failures.</summary>
        public double ThrustScale(string slot)
        {
            foreach (var item in items)
                if (item.Slot == slot && item.Kind == "engines")
                    return (item.Units - item.DeadCount()) / (double)item.Units;
            return 1;
        }
        public bool StageDamaged { get; private set; }
        public bool FairingStuck { get; private set; }
        public bool DeploymentFailed { get; private set; }
        public bool GuidanceDrift { get; private set; }
        public bool BoosterLandingFailed { get; private set; }
        public bool ParachuteFailed { get; private set; }
        public const double UntestedParachuteFailureChance = 0.15;
        /// <summary>Reliability shields still queued (Save the Mission not included).</summary>
        public int ShieldsRemaining => modifiers.Shields.Count - shieldsUsed;

        // ------------------------------------------------------------------ rolling

        private double Draw(string checkpoint, string slot, int unit) =>
            BuildRandom.Uniform(seed, StreamId, checkpoint + ":" + slot, unit);

        /// <summary>Rolls every part exposed at <paramref name="checkpoint"/>. Dead units are never revived by time.</summary>
        public IReadOnlyList<FailureRecord> Roll(string checkpoint)
        {
            var records = new List<FailureRecord>();
            foreach (var item in items)
            {
                if (Array.IndexOf(item.Checkpoints, checkpoint) < 0) continue;
                if (item.Kind == "engines" && !item.ModifierRolled && checkpoint == item.Checkpoints[0])
                {
                    item.ModifierRolled = true;
                    if (item.ModifierFactor < 1 && Draw("modifier", item.Slot, 0) >= item.ModifierFactor)
                        Fail(item, checkpoint, 0, records, wholeItem: true);
                }
                for (var unit = 0; unit < item.Units; unit++)
                {
                    if (item.Dead[unit]) continue;
                    if (Draw(checkpoint, item.Slot, unit) < item.PerCheckpointSuccess) continue;
                    Fail(item, checkpoint, unit, records, wholeItem: false);
                }
            }
            return records;
        }

        private void Fail(Item item, string checkpoint, int unit, List<FailureRecord> records, bool wholeItem, string? modeOverride = null)
        {
            if (wholeItem) { for (var i = 0; i < item.Units; i++) item.Dead[i] = true; }
            else item.Dead[unit] = true;
            var dead = item.DeadCount();
            // Recovered: engine-out cluster survives one failure; a redundant set survives while one unit lives.
            var recovered = !wholeItem && ((item.Kind == "engines" && item.EngineOut && dead == 1) ||
                (item.Kind == "part" && item.Units > 1 && dead < item.Units));
            if (recovered)
            {
                records.Add(new FailureRecord("failure", checkpoint, item.Kind == "engines" ? "engine_out" : "unit_lost",
                    item.Slot, false, false));
                return;
            }
            var mode = modeOverride ?? item.Mode;
            var fatal = IsFatalMode(mode);
            if (fatal && TryShield(item, checkpoint, unit, records, wholeItem)) return;
            Apply(item.Slot, mode);
            records.Add(new FailureRecord("failure", checkpoint, mode, item.Slot, fatal, true));
        }

        // Shield order is the queue order; Save the Mission negates one fatal failure after the queue empties.
        private bool TryShield(Item item, string checkpoint, int unit, List<FailureRecord> records, bool wholeItem)
        {
            if (shieldsUsed < modifiers.Shields.Count)
            {
                var kind = modifiers.Shields[shieldsUsed++];
                records.Add(new FailureRecord("shield_consumed", checkpoint, kind == ShieldKind.Reroll ? "reroll" : "negate",
                    item.Slot, false, false));
                if (kind == ShieldKind.Negate) { Revive(item, unit, wholeItem); return true; }
                if (!wholeItem && Draw(checkpoint, item.Slot, unit + RerollIndexOffset) < item.PerCheckpointSuccess)
                { Revive(item, unit, wholeItem); return true; }
                if (wholeItem && Draw("modifier", item.Slot, RerollIndexOffset) < item.ModifierFactor)
                { Revive(item, unit, wholeItem); return true; }
                return false;
            }
            if (modifiers.SaveTheMission && !saveUsed)
            {
                saveUsed = true;
                records.Add(new FailureRecord("shield_consumed", checkpoint, "save_the_mission", item.Slot, false, false));
                Revive(item, unit, wholeItem);
                return true;
            }
            return false;
        }
        private static void Revive(Item item, int unit, bool wholeItem)
        {
            if (wholeItem) { for (var i = 0; i < item.Units; i++) item.Dead[i] = false; }
            else item.Dead[unit] = false;
        }

        private void Apply(string slot, string mode)
        {
            switch (mode)
            {
                case "stage_recontact": StageDamaged = true; break;
                case "fairing_stuck": FairingStuck = true; break;
                case "deployment_failure": DeploymentFailed = true; break;
                case "guidance_drift": GuidanceDrift = true; break;
                case "booster_landing_failure": BoosterLandingFailed = true; break;
                case "parachute_failure": ParachuteFailed = true; break;
            }
        }

        // ------------------------------------------------------------------ condition failures

        /// <summary>Structural limit, kPa × g (game_value; light materials are weaker).</summary>
        public double StructuralLimitKpaG(double loadMarginFraction) =>
            BaseStructuralLimitKpaG * Math.Max(0.75, vehicle.MaterialDryMultiplier) * (1 + loadMarginFraction);

        public bool IsStructuralOverload(double qPa, double gLoadUnitless) =>
            qPa / 1000.0 * Math.Max(1, gLoadUnitless) > StructuralLimitKpaG(modifiers.LoadMarginFraction);

        /// <summary>Nav sensor is IMU only: the orbit drifts (design 8.4 guidance drift).</summary>
        public bool HasImuOnlyNavigation => vehicle.Part(Slots.Navigation)?.Id == "nav_imu_only";

        /// <summary>First stage is long (propellant above the game_value threshold) and no pogo test cleared the risk.</summary>
        public bool IsPogoProne =>
            vehicle.Mass.FirstPropellantKg >= PogoPropellantThresholdKg && !TestCampaign.RiskCleared(vehicle.Build, "pogo");

        /// <summary>Parachute recovery whose slot never had a drop test.</summary>
        public bool HasUntestedParachute(string slot) =>
            vehicle.Part(slot) != null && !vehicle.Build.Condition(slot).HasTest("drop_test");

        public static bool IsRangeSafetyViolation(double altitudeM, double flightPathRad) =>
            altitudeM >= RangeSafetyMinAltitudeM && flightPathRad * 180 / Math.PI < RangeSafetyFlightPathDeg;

        /// <summary>Burn-through when the entry speed or the accumulated heat load exceeds the shield (game_value).</summary>
        public bool IsBurnThrough(double entrySpeedMs, double heatLoadFractionOfCapacity, double ratingMs) =>
            entrySpeedMs > ratingMs * (1 + modifiers.HeatMarginFraction) ||
            heatLoadFractionOfCapacity > 1 + modifiers.HeatMarginFraction;

        /// <summary>
        /// Resolves a condition failure once per mode. A Negate shield (or Save the Mission) cancels it;
        /// Only the head of the shield queue can act, and a Reroll at the head cannot cancel a deterministic condition, so it stays queued.
        /// </summary>
        public IReadOnlyList<FailureRecord> Condition(string checkpoint, string mode, string slot)
        {
            var records = new List<FailureRecord>();
            if (!conditionHandled.Add(mode + ":" + slot)) return records;
            var fatal = IsFatalMode(mode);
            if (fatal)
            {
                if (shieldsUsed < modifiers.Shields.Count && modifiers.Shields[shieldsUsed] == ShieldKind.Negate)
                {
                    shieldsUsed++;
                    records.Add(new FailureRecord("shield_consumed", checkpoint, "negate", slot, false, false));
                    return records;
                }
                if (modifiers.SaveTheMission && !saveUsed)
                {
                    saveUsed = true;
                    records.Add(new FailureRecord("shield_consumed", checkpoint, "save_the_mission", slot, false, false));
                    return records;
                }
            }
            Apply(slot, mode);
            records.Add(new FailureRecord("failure", checkpoint, mode, slot, fatal, true));
            return records;
        }

        /// <summary>
        /// Pogo at staging (design 8.4): a pogo-prone vehicle loses one first-stage engine with probability
        /// <see cref="PogoChanceFraction"/> (keyed draw). Engine-out clusters survive it; others do not.
        /// </summary>
        public IReadOnlyList<FailureRecord> RollPogo(string checkpoint)
        {
            var records = new List<FailureRecord>();
            if (!IsPogoProne || ConditionDraw(checkpoint, "pogo") >= PogoChanceFraction) return records;
            foreach (var item in items)
            {
                if (item.Slot != Slots.FirstStageEngine) continue;
                for (var unit = 0; unit < item.Units; unit++)
                    if (!item.Dead[unit]) { Fail(item, checkpoint, unit, records, false, "pogo"); return records; }
            }
            return records;
        }

        /// <summary>No drop test (design 8.4): a keyed game_value chance that the parachutes never open.</summary>
        public IReadOnlyList<FailureRecord> RollUntestedParachute(string checkpoint, string slot) =>
            ConditionDraw(checkpoint + "_untested", slot) < UntestedParachuteFailureChance
                ? Condition(checkpoint, "parachute_failure", slot) : new List<FailureRecord>();

        /// <summary>Keyed draw for conditional risks (pogo): independent of pilot input.</summary>
        public double ConditionDraw(string checkpoint, string slot) => Draw(checkpoint, slot, 0);
    }
}
