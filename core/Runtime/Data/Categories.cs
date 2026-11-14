#nullable enable
using System;
using System.Collections.Generic;

namespace MissionForge.Core.Data
{
    /// <summary>
    /// Part categories as used in <c>data/parts/&lt;category&gt;.json</c> (<c>common.schema.json#/$defs/part_category</c>).
    /// One category can fill several vote slots (<c>tank_size</c> and <c>engine_count</c> are voted per stage).
    /// </summary>
    public static class PartCategories
    {
        /// <summary>Launch site (7.1).</summary>
        public const string LaunchSite = "launch_site";
        /// <summary>Satellite instrument (7.2.1).</summary>
        public const string Instrument = "instrument";
        /// <summary>Satellite power generation (7.2.1).</summary>
        public const string SatellitePower = "satellite_power";
        /// <summary>Satellite attitude control (7.2.1).</summary>
        public const string AttitudeControl = "attitude_control";
        /// <summary>Capsule (7.2.2).</summary>
        public const string Capsule = "capsule";
        /// <summary>Life support (7.2.2).</summary>
        public const string LifeSupport = "life_support";
        /// <summary>Mars lander (7.2.3).</summary>
        public const string MarsLander = "mars_lander";
        /// <summary>Heat shield (7.3).</summary>
        public const string HeatShield = "heat_shield";
        /// <summary>Launch escape system (7.4).</summary>
        public const string EscapeSystem = "escape_system";
        /// <summary>Payload fairing (7.5).</summary>
        public const string Fairing = "fairing";
        /// <summary>Engine count, per stage (7.6).</summary>
        public const string EngineCount = "engine_count";
        /// <summary>First-stage engine (7.7).</summary>
        public const string FirstStageEngine = "first_stage_engine";
        /// <summary>Upper-stage engine (7.8).</summary>
        public const string UpperStageEngine = "upper_stage_engine";
        /// <summary>Tank size, per stage (7.9).</summary>
        public const string TankSize = "tank_size";
        /// <summary>Structural material (7.10).</summary>
        public const string StructuralMaterial = "structural_material";
        /// <summary>Strap-on boosters (7.11).</summary>
        public const string StrapOnBooster = "strap_on_booster";
        /// <summary>Stage separation system (7.12).</summary>
        public const string SeparationSystem = "separation_system";
        /// <summary>Avionics (7.13).</summary>
        public const string Avionics = "avionics";
        /// <summary>Navigation sensors (7.14).</summary>
        public const string NavigationSensor = "navigation_sensor";
        /// <summary>Aerodynamic control (7.15).</summary>
        public const string AeroControl = "aero_control";
        /// <summary>Reaction control system (7.15).</summary>
        public const string Rcs = "rcs";
        /// <summary>Power system (7.16).</summary>
        public const string PowerSystem = "power_system";
        /// <summary>Communications (7.17).</summary>
        public const string Communications = "communications";
        /// <summary>Booster recovery (7.18).</summary>
        public const string BoosterRecovery = "booster_recovery";
        /// <summary>Capsule or payload recovery (7.19).</summary>
        public const string CapsuleRecovery = "capsule_recovery";
        /// <summary>Mission assurance level (7.20).</summary>
        public const string MissionAssurance = "mission_assurance";
    }

    /// <summary>
    /// Vote slot IDs (the <c>id</c> of a contract vote, design 6.2). A build holds one chosen part per slot.
    /// For most slots the ID equals the part category; engine count and tank size have one slot per stage.
    /// </summary>
    public static class Slots
    {
        /// <summary>Vote 1: launch site.</summary>
        public const string LaunchSite = "launch_site";
        /// <summary>Vote 2 (C1, C2, C5): instrument.</summary>
        public const string PayloadInstrument = "instrument";
        /// <summary>Vote 2 (C1, C2, C5): satellite power.</summary>
        public const string PayloadPower = "satellite_power";
        /// <summary>Vote 2 (C1, C2, C5): attitude control.</summary>
        public const string PayloadAttitude = "attitude_control";
        /// <summary>Vote 2 (C3, C4, C6): capsule.</summary>
        public const string Capsule = "capsule";
        /// <summary>Vote 2 (crewed): life support.</summary>
        public const string LifeSupport = "life_support";
        /// <summary>Vote 2 (C7): Mars lander.</summary>
        public const string Lander = "mars_lander";
        /// <summary>Vote 3: heat shield.</summary>
        public const string HeatShield = "heat_shield";
        /// <summary>Vote 3: capsule or payload recovery.</summary>
        public const string CapsuleRecovery = "capsule_recovery";
        /// <summary>Vote 4 (crewed only): launch escape system.</summary>
        public const string LaunchEscape = "escape_system";
        /// <summary>Vote 5 (non-capsule): payload fairing.</summary>
        public const string Fairing = "fairing";
        /// <summary>Vote 6: upper stage engine.</summary>
        public const string UpperStageEngine = "upper_stage_engine";
        /// <summary>Vote 7: upper stage engine count.</summary>
        public const string UpperStageEngineCount = "upper_stage_engine_count";
        /// <summary>Vote 8: upper stage tank size.</summary>
        public const string UpperStageTank = "upper_stage_tank_size";
        /// <summary>Vote 9: stage separation system.</summary>
        public const string StageSeparation = "separation_system";
        /// <summary>Vote 10: first stage engine.</summary>
        public const string FirstStageEngine = "first_stage_engine";
        /// <summary>Vote 11: first stage engine count.</summary>
        public const string FirstStageEngineCount = "first_stage_engine_count";
        /// <summary>Vote 12: first stage tank size.</summary>
        public const string FirstStageTank = "first_stage_tank_size";
        /// <summary>Vote 13: structural material.</summary>
        public const string StructuralMaterial = "structural_material";
        /// <summary>Vote 14: strap-on boosters.</summary>
        public const string StrapOnBoosters = "strap_on_booster";
        /// <summary>Vote 15: booster recovery.</summary>
        public const string BoosterRecovery = "booster_recovery";
        /// <summary>Vote 16: avionics.</summary>
        public const string Avionics = "avionics";
        /// <summary>Vote 17: navigation sensors.</summary>
        public const string Navigation = "navigation_sensor";
        /// <summary>Vote 18a: aerodynamic control.</summary>
        public const string AeroControl = "aero_control";
        /// <summary>Vote 18b: RCS.</summary>
        public const string Rcs = "rcs";
        /// <summary>Vote 19: power system.</summary>
        public const string PowerSystem = "power_system";
        /// <summary>Vote 20: communications.</summary>
        public const string Communications = "communications";
        /// <summary>Vote 21: mission assurance level.</summary>
        public const string MissionAssurance = "mission_assurance";

        /// <summary>The default vote order of design section 6.2.</summary>
        public static readonly IReadOnlyList<string> VoteOrder = new[]
        {
            LaunchSite,
            PayloadInstrument, PayloadPower, PayloadAttitude, Capsule, LifeSupport, Lander,
            HeatShield, CapsuleRecovery,
            LaunchEscape,
            Fairing,
            UpperStageEngine, UpperStageEngineCount, UpperStageTank,
            StageSeparation,
            FirstStageEngine, FirstStageEngineCount, FirstStageTank,
            StructuralMaterial,
            StrapOnBoosters,
            BoosterRecovery,
            Avionics, Navigation, AeroControl, Rcs,
            PowerSystem, Communications,
            MissionAssurance,
        };

        /// <summary>Slots whose parts fly with the payload to the destination.</summary>
        public static readonly IReadOnlyList<string> PayloadGroup = new[]
        {
            PayloadInstrument, PayloadPower, PayloadAttitude, Capsule, LifeSupport, Lander, HeatShield, CapsuleRecovery,
        };

        /// <summary>Propulsion and structure slots (decided before the PDR).</summary>
        public static readonly IReadOnlyList<string> PropulsionGroup = new[]
        {
            UpperStageEngine, UpperStageEngineCount, UpperStageTank, StageSeparation,
            FirstStageEngine, FirstStageEngineCount, FirstStageTank, StructuralMaterial,
            StrapOnBoosters, BoosterRecovery,
        };

        private static readonly HashSet<string> PayloadSet = new HashSet<string>(PayloadGroup);
        private static readonly HashSet<string> PropulsionSet = new HashSet<string>(PropulsionGroup);

        /// <summary>True for payload-bay slots.</summary>
        public static bool IsPayload(string slot) => PayloadSet.Contains(slot);

        /// <summary>True for propulsion and structure slots.</summary>
        public static bool IsPropulsion(string slot) => PropulsionSet.Contains(slot);

        /// <summary>True for the two engine slots.</summary>
        public static bool IsEngine(string slot) => slot == FirstStageEngine || slot == UpperStageEngine;

        /// <summary>Part category a slot takes its options from.</summary>
        public static string CategoryOf(string slot) => slot switch
        {
            UpperStageEngineCount => PartCategories.EngineCount,
            FirstStageEngineCount => PartCategories.EngineCount,
            UpperStageTank => PartCategories.TankSize,
            FirstStageTank => PartCategories.TankSize,
            _ => slot,
        };

        /// <summary>
        /// Default slot of a category (and stage, for per-stage categories). Used when data votes carry only a category.
        /// </summary>
        public static string For(string category, string? stage)
        {
            if (category == PartCategories.EngineCount)
                return stage == "upper" ? UpperStageEngineCount : stage == "first" ? FirstStageEngineCount
                    : throw new ArgumentException("engine_count needs a stage (first or upper).", nameof(stage));
            if (category == PartCategories.TankSize)
                return stage == "upper" ? UpperStageTank : stage == "first" ? FirstStageTank
                    : throw new ArgumentException("tank_size needs a stage (first or upper).", nameof(stage));
            return category;
        }

        /// <summary>All slots that take options from a category.</summary>
        public static IReadOnlyList<string> ForCategory(string category)
        {
            if (category == PartCategories.EngineCount) return new[] { FirstStageEngineCount, UpperStageEngineCount };
            if (category == PartCategories.TankSize) return new[] { FirstStageTank, UpperStageTank };
            return new[] { category };
        }
    }
}
