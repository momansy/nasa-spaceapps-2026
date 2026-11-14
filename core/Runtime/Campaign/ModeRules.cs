#nullable enable
using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Text;
using MissionForge.Core.Random;

namespace MissionForge.Core.Campaign
{
    /// <summary>Host-selected options; caller supplies dates and never exposes personal data (13.3).</summary>
    public sealed class ModeOptions
    {
        /// <summary>Caller-supplied ISO date string, yyyy-MM-dd, for DAILY.</summary>
        public string Date { get; }
        /// <summary>Heritage rules preset ID.</summary>
        public string HeritagePreset { get; }
        /// <summary>Classroom host may pause and resume.</summary>
        public bool ClassroomAllowPause { get; }
        /// <summary>Classroom host may lock votes.</summary>
        public bool ClassroomAllowVoteLock { get; }
        /// <summary>Classroom host may export anonymous results.</summary>
        public bool ClassroomAllowExport { get; }

        /// <summary>Constructs mode options with no accounts, names, IDs, or personal information.</summary>
        public ModeOptions(string date = "", string heritagePreset = "1960s_lunar_flyby",
            bool classroomAllowPause = true, bool classroomAllowVoteLock = true, bool classroomAllowExport = true)
        {
            Date = date ?? "";
            HeritagePreset = heritagePreset ?? "";
            ClassroomAllowPause = classroomAllowPause;
            ClassroomAllowVoteLock = classroomAllowVoteLock;
            ClassroomAllowExport = classroomAllowExport;
        }
    }

    /// <summary>Immutable mission configuration interpreted by the host, not the room server.</summary>
    public sealed class MissionSetupRules
    {
        /// <summary>Protocol GameMode token (QUICK, CAMPAIGN, SANDBOX, DAILY, HERITAGE, CLASSROOM, SOLO, SPEEDRUN, BUDGET_CRUNCH).</summary>
        public string Mode { get; }
        /// <summary>Multiplier on contract budget (dimensionless game value).</summary>
        public double BudgetMultiplier { get; }
        /// <summary>Absolute budget override, $M, or null for the contract default.</summary>
        public double? BudgetOverrideM { get; }
        /// <summary>True if the build should not apply budget constraints.</summary>
        public bool UnlimitedBudget { get; }
        /// <summary>Multiplier on contract deadline (dimensionless game value).</summary>
        public double ScheduleMultiplier { get; }
        /// <summary>True if no mission time limit applies.</summary>
        public bool UnlimitedTime { get; }
        /// <summary>All parts are available, regardless of research or restrictions.</summary>
        public bool AllPartsAvailable { get; }
        /// <summary>When nonempty, only the listed part IDs are allowed (subject to contract applicability).</summary>
        public IReadOnlyList<string> PartAllowList { get; }
        /// <summary>Daily deterministic challenge seed, or null for session seed.</summary>
        public ulong? FixedSeed { get; }
        /// <summary>Daily challenge's selected C0–C8 contract, or null for host choice.</summary>
        public string? FixedContractId { get; }
        /// <summary>Seed policy token: SESSION or DATE_FNV1A64.</summary>
        public string SeedPolicy { get; }
        /// <summary>Assist level cannot be changed by players when true.</summary>
        public bool AssistLocked { get; }
        /// <summary>AI Flight Director advisor available.</summary>
        public bool AdvisorEnabled { get; }
        /// <summary>Maximum human player count: 1 for SOLO, 10 otherwise.</summary>
        public int MaxPlayers { get; }
        /// <summary>Leaderboard metric: SCORE, SCHEDULE_DAYS, BUDGET_EFFICIENCY, or NONE.</summary>
        public string LeaderboardMetric { get; }
        /// <summary>Whether classroom pause can be requested.</summary>
        public bool ClassroomAllowPause { get; }
        /// <summary>Whether the teacher can lock a vote.</summary>
        public bool ClassroomAllowVoteLock { get; }
        /// <summary>Whether anonymised classroom exports are enabled.</summary>
        public bool ClassroomAllowExport { get; }

        internal MissionSetupRules(string mode, double budgetMultiplier = 1, double? budgetOverrideM = null,
            bool unlimitedBudget = false, double scheduleMultiplier = 1, bool unlimitedTime = false,
            bool allPartsAvailable = false, IEnumerable<string>? partAllowList = null,
            ulong? fixedSeed = null, string? fixedContractId = null,
            string seedPolicy = "SESSION", bool assistLocked = false, bool advisorEnabled = false,
            int maxPlayers = 10, string leaderboardMetric = "SCORE",
            bool classroomAllowPause = false, bool classroomAllowVoteLock = false, bool classroomAllowExport = false)
        {
            Mode = mode;
            BudgetMultiplier = budgetMultiplier;
            BudgetOverrideM = budgetOverrideM;
            UnlimitedBudget = unlimitedBudget;
            ScheduleMultiplier = scheduleMultiplier;
            UnlimitedTime = unlimitedTime;
            AllPartsAvailable = allPartsAvailable;
            PartAllowList = Array.AsReadOnly((partAllowList ?? Array.Empty<string>()).ToArray());
            FixedSeed = fixedSeed;
            FixedContractId = fixedContractId;
            SeedPolicy = seedPolicy;
            AssistLocked = assistLocked;
            AdvisorEnabled = advisorEnabled;
            MaxPlayers = maxPlayers;
            LeaderboardMetric = leaderboardMetric;
            ClassroomAllowPause = classroomAllowPause;
            ClassroomAllowVoteLock = classroomAllowVoteLock;
            ClassroomAllowExport = classroomAllowExport;
        }

        /// <summary>Part filter for mode-restricted choices; the caller additionally checks contract and research rules.</summary>
        public bool AllowsPart(string partId) => AllPartsAvailable || PartAllowList.Count == 0 ||
            PartAllowList.Contains(partId);
    }

    /// <summary>Mode configurations from design 13.1 and 13.3, keyed by protocol GameMode tokens.</summary>
    public static class ModeRules
    {
        // Fixed, catalog-verified game pools. These are curated game alternatives,
        // not historical hardware inventories or real-world mission specifications.
        private static readonly string[] DailyPool =
        {
            "site_equatorial_spaceport", "site_subtropical_coast",
            "site_west_coast_polar_range",
            "eng_kerolox_workhorse", "eng_kerolox_staged_combustion",
            "eng_hydrolox_vacuum", "eng_kerolox_vacuum",
            "eng_hypergolic_storable", "engcount_first_1", "engcount_first_3",
            "engcount_upper_1", "tank_s", "tank_m", "tank_l",
            "sep_pyro_bolts_springs", "sep_pneumatic_pushers",
            "comm_s_band", "comm_x_band", "comm_relay_network",
            "nav_imu_gnss", "nav_imu_gnss_star_tracker",
            "fairing_small", "fairing_standard", "fairing_large",
            "mat_aluminum_2219", "mat_aluminum_lithium_2195",
            "pwr_primary_batteries", "pwr_deployable_solar_liion",
            "satpwr_body_mounted_solar_cells", "satpwr_deployable_solar_wings",
            "inst_wide_field_optical_camera", "inst_multispectral_imager",
            "avi_commercial_single", "avi_radiation_hardened",
            "adcs_reaction_wheels", "rcs_cold_gas",
            "aero_gimbal_only", "aero_fins",
            "strap_none", "strap_2_small_solid",
            "assur_standard", "assur_class_a",
            "brec_expendable", "brec_parachute_splashdown",
            "cap_compact", "cap_standard", "crec_parachutes_splashdown",
            "tps_avcoat_ablator", "les_escape_tower", "ls_open_loop",
            "lander_legged", "lander_sky_crane"
        };

        private static readonly string[] LunarSixtiesPool =
        {
            "site_equatorial_spaceport", "site_subtropical_coast",
            "eng_kerolox_workhorse", "eng_kerolox_giant", "eng_kerolox_vacuum",
            "eng_hypergolic_storable", "engcount_first_1", "engcount_first_5",
            "engcount_upper_1", "tank_s", "tank_m", "tank_l",
            "sep_pyro_bolts_springs", "comm_uhf", "comm_s_band",
            "nav_imu_only", "fairing_standard", "fairing_large",
            "mat_aluminum_2219", "pwr_primary_batteries", "pwr_fuel_cells",
            "satpwr_body_mounted_solar_cells", "avi_commercial_single",
            "adcs_magnetorquers_only", "rcs_bipropellant", "aero_fins",
            "strap_none", "assur_standard", "brec_expendable",
            "cap_standard", "crec_parachutes_splashdown",
            "tps_avcoat_ablator", "les_escape_tower", "ls_open_loop"
        };

        private static readonly string[] EarlySatellitesPool =
        {
            "site_equatorial_spaceport", "site_subtropical_coast",
            "eng_kerolox_workhorse", "eng_kerolox_vacuum",
            "engcount_first_1", "engcount_upper_1",
            "tank_xs", "tank_s", "sep_pyro_bolts_springs",
            "comm_uhf", "comm_s_band", "nav_imu_only", "fairing_small",
            "mat_aluminum_2219", "satpwr_body_mounted_solar_cells",
            "pwr_primary_batteries", "adcs_magnetorquers_only",
            "avi_commercial_single", "inst_wide_field_optical_camera",
            "aero_gimbal_only", "rcs_cold_gas", "strap_none",
            "assur_standard", "brec_expendable"
        };

        /// <summary>Returns deterministic rules for a supported GameMode; unknown tokens are rejected.</summary>
        public static MissionSetupRules For(string mode, ModeOptions? options = null)
        {
            options = options ?? new ModeOptions();
            switch (mode)
            {
                case "QUICK": return new MissionSetupRules(mode);
                case "CAMPAIGN": return new MissionSetupRules(mode);
                case "SANDBOX":
                    return new MissionSetupRules(mode, unlimitedBudget: true, unlimitedTime: true,
                        allPartsAvailable: true, leaderboardMetric: "NONE");
                case "DAILY":
                    ulong hash = HashDate(options.Date);
                    var rng = new SeededRandom(hash).ForStream("campaign");
                    int contract = rng.NextInt(0, 9);
                    return new MissionSetupRules(mode, partAllowList: DailyPool, fixedSeed: hash,
                        fixedContractId: "C" + contract, seedPolicy: "DATE_FNV1A64",
                        assistLocked: true);
                case "HERITAGE":
                    string[] pool = options.HeritagePreset == "1960s_lunar_flyby" ? LunarSixtiesPool :
                        options.HeritagePreset == "early_satellites" ? EarlySatellitesPool :
                        throw new ArgumentException("Unknown heritage preset: " + options.HeritagePreset);
                    return new MissionSetupRules(mode, partAllowList: pool, assistLocked: true);
                case "CLASSROOM":
                    return new MissionSetupRules(mode, leaderboardMetric: "NONE",
                        classroomAllowPause: options.ClassroomAllowPause,
                        classroomAllowVoteLock: options.ClassroomAllowVoteLock,
                        classroomAllowExport: options.ClassroomAllowExport);
                case "SOLO": return new MissionSetupRules(mode, maxPlayers: 1, advisorEnabled: true);
                case "SPEEDRUN": return new MissionSetupRules(mode, leaderboardMetric: "SCHEDULE_DAYS");
                case "BUDGET_CRUNCH":
                    return new MissionSetupRules(mode, budgetOverrideM: CampaignConstants.BudgetCrunchM,
                        leaderboardMetric: "BUDGET_EFFICIENCY");
                default: throw new ArgumentException("Unknown protocol GameMode: " + mode, nameof(mode));
            }
        }

        /// <summary>Portable FNV-1a 64-bit hash of an exact ISO date, used to seed DAILY, never a system clock.</summary>
        public static ulong HashDate(string date)
        {
            if (date == null || date.Length != 10 ||
                !DateTime.TryParseExact(date, "yyyy-MM-dd", CultureInfo.InvariantCulture,
                    DateTimeStyles.None, out var parsed) ||
                parsed.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture) != date)
                throw new ArgumentException("DAILY requires a valid yyyy-MM-dd date.", nameof(date));
            ulong value = 14695981039346656037UL;
            foreach (byte c in Encoding.UTF8.GetBytes(date))
            {
                unchecked { value ^= c; value *= 1099511628211UL; }
            }
            return value;
        }
    }
}
