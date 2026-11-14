#nullable enable
using System;
using System.Collections.Generic;

namespace MissionForge.Core.Data
{
    /// <summary>
    /// Propellant family identifiers used by parts (<c>propellant</c> field in data).
    /// </summary>
    public static class Propellants
    {
        /// <summary>RP-1 kerosene and liquid oxygen.</summary>
        public const string Kerolox = "RP1_LOX";
        /// <summary>Liquid hydrogen and liquid oxygen.</summary>
        public const string Hydrolox = "LH2_LOX";
        /// <summary>Liquid methane and liquid oxygen.</summary>
        public const string Methalox = "CH4_LOX";
        /// <summary>Aerozine-50 and nitrogen tetroxide (storable, hypergolic).</summary>
        public const string Hypergolic = "A50_N2O4";
        /// <summary>Solid propellant.</summary>
        public const string Solid = "SOLID";

        /// <summary>Normalises the many spellings used in data (e.g. "kerolox", "RP-1/LOX").</summary>
        public static string Normalize(string? raw)
        {
            if (string.IsNullOrWhiteSpace(raw)) return "";
            var s = raw!.Trim().ToUpperInvariant().Replace("-", "").Replace(" ", "").Replace("/", "_");
            if (s.Contains("RP1") || s == "KEROLOX") return Kerolox;
            if (s.Contains("LH2") || s == "HYDROLOX") return Hydrolox;
            if (s.Contains("CH4") || s == "METHALOX") return Methalox;
            if (s.Contains("N2O4") || s.Contains("A50") || s.Contains("AEROZINE") || s.Contains("HYPERGOL") || s.Contains("MMH")) return Hypergolic;
            if (s.Contains("SOLID") || s == "HTPB" || s == "APCP") return Solid;
            return s;
        }
    }

    /// <summary>
    /// Category-specific numbers of a part, stored in data units (the units in the data key,
    /// e.g. <c>thrust_sl_kN</c>) and exposed in SI units through typed properties. This is
    /// the data boundary where unit conversion happens (architecture section 3).
    /// </summary>
    public sealed class PartStats
    {
        private readonly IReadOnlyDictionary<string, double> _numbers;
        private readonly IReadOnlyDictionary<string, string> _text;

        /// <summary>Creates stats from raw data-unit numbers and text attributes.</summary>
        public PartStats(IReadOnlyDictionary<string, double>? numbers, IReadOnlyDictionary<string, string>? text = null)
        {
            _numbers = numbers ?? new Dictionary<string, double>();
            _text = text ?? new Dictionary<string, string>();
        }

        /// <summary>All raw numeric stats, keyed by data name (unit in the name).</summary>
        public IReadOnlyDictionary<string, double> Raw => _numbers;

        /// <summary>All raw text stats (e.g. <c>engine_out</c>).</summary>
        public IReadOnlyDictionary<string, string> Text => _text;

        /// <summary>Raw value of a data key, or null when absent.</summary>
        public double? Get(string key) => _numbers.TryGetValue(key, out var v) ? v : (double?)null;

        /// <summary>Raw value of a data key, or <paramref name="fallback"/> when absent.</summary>
        public double Get(string key, double fallback) => _numbers.TryGetValue(key, out var v) ? v : fallback;

        /// <summary>Text value of a data key, or null.</summary>
        public string? GetText(string key) => _text.TryGetValue(key, out var v) ? v : null;

        private double? Scaled(string key, double factor) { var v = Get(key); return v.HasValue ? v.Value * factor : (double?)null; }

        /// <summary>Sea-level thrust of one engine or booster, N (data: <c>thrust_sl_kN</c>, boosters <c>thrust_sl_each_kN</c>).</summary>
        public double? ThrustSlN => Scaled("thrust_sl_kN", 1000.0) ?? Scaled("thrust_sl_each_kN", 1000.0);
        /// <summary>Vacuum thrust of one engine or booster, N (data: <c>thrust_vac_kN</c>).</summary>
        public double? ThrustVacN => Scaled("thrust_vac_kN", 1000.0);
        /// <summary>Sea-level specific impulse, s (data: <c>isp_sl_s</c>).</summary>
        public double? IspSlS => Get("isp_sl_s");
        /// <summary>Vacuum specific impulse, s (data: <c>isp_vac_s</c>, or <c>isp_s</c>).</summary>
        public double? IspVacS => Get("isp_vac_s") ?? Get("isp_s");
        /// <summary>Minimum throttle as a fraction of full thrust, 0–1 (data: <c>throttle_min</c>).</summary>
        public double? ThrottleMin => Get("throttle_min");
        /// <summary>Number of engine restarts (data: <c>restarts</c>).</summary>
        public int? Restarts { get { var v = Get("restarts"); return v.HasValue ? (int)Math.Round(v.Value) : (int?)null; } }
        /// <summary>
        /// Count of identical units, dimensionless (data: <c>engine_count</c> of an engine-count option,
        /// <c>booster_count</c> of a strap-on option, or <c>count</c>).
        /// </summary>
        public int? Count
        {
            get
            {
                var v = Get("engine_count") ?? Get("booster_count") ?? Get("count");
                return v.HasValue ? (int)Math.Round(v.Value) : (int?)null;
            }
        }
        /// <summary>Additive reliability modifier, fraction (from a <c>reliability add</c> modifier, e.g. −0.003 for −0.3%).</summary>
        public double ReliabilityModifier => Get("reliability_modifier", 0.0);
        /// <summary>
        /// Engine-out capability of an engine-count option: <c>no</c>, <c>partial</c>, <c>usually</c> or <c>yes</c>
        /// (data: <c>engine_out_capability</c>); null when data omits it.
        /// </summary>
        public string? EngineOut => GetText("engine_out_capability") ?? GetText("engine_out");
        /// <summary>Stage of a per-stage option (<c>first</c> or <c>upper</c>; data: <c>stage</c>), or null.</summary>
        public string? Stage => GetText("stage");
        /// <summary>
        /// Fixed propellant carried by the part itself, kg: the solid kick motor's propellant
        /// (data: <c>fixed_propellant_t</c>) or a generic <c>propellant_t</c>.
        /// </summary>
        public double? PropellantKg => Scaled("fixed_propellant_t", 1000.0) ?? Scaled("propellant_t", 1000.0) ?? Get("propellant_kg");
        /// <summary>Propellant capacity of a tank option on the first stage, kg (data: <c>first_stage_propellant_t</c>).</summary>
        public double? FirstStagePropellantKg => Scaled("first_stage_propellant_t", 1000.0) ?? Scaled("propellant_t", 1000.0);
        /// <summary>Propellant capacity of a tank option on the upper stage, kg (data: <c>upper_stage_propellant_t</c>).</summary>
        public double? UpperStagePropellantKg => Scaled("upper_stage_propellant_t", 1000.0) ?? Scaled("propellant_t", 1000.0);
        /// <summary>Propellant capacity of a tank option on the given stage (<c>first</c> or <c>upper</c>), kg.</summary>
        public double? TankPropellantKg(bool firstStage) => firstStage ? FirstStagePropellantKg : UpperStagePropellantKg;
        /// <summary>Dry-mass multiplier of a structural material, dimensionless (data: <c>dry_mass_multiplier</c>).</summary>
        public double DryMassMultiplier => Get("dry_mass_multiplier", 1.0);
        /// <summary>Cost multiplier of a structural material, dimensionless (data: <c>cost_multiplier</c>).</summary>
        public double CostMultiplier => Get("cost_multiplier", 1.0);
        /// <summary>Launch-site latitude, degrees (data: <c>latitude_deg</c>).</summary>
        public double? LatitudeDeg => Get("latitude_deg");
        /// <summary>Heat-shield maximum entry speed rating, m/s (data: <c>max_entry_speed_km_s</c>).</summary>
        public double? MaxEntrySpeedMps => Scaled("max_entry_speed_km_s", 1000.0);
        /// <summary>Usable diameter of a fairing, or outside diameter of a payload, m (data: <c>diameter_m</c>).</summary>
        public double? DiameterM => Get("diameter_m");
        /// <summary>Electrical consumption while operating, W (data: <c>power_W</c>).</summary>
        public double PowerDrawW => Get("power_W", 0.0);
        /// <summary>Orbit-average solar generation, W (data: <c>generation_avg_W</c>).</summary>
        public double GenerationAvgW => Get("generation_avg_W") ?? Get("generation_W", 0.0);
        /// <summary>Generation independent of sunlight (RTG, fuel cell), W (data: <c>continuous_W</c>).</summary>
        public double ContinuousPowerW => Get("continuous_W", 0.0);
        /// <summary>Battery energy capacity, W·h (data: <c>battery_Wh</c>); null means "sized to the array".</summary>
        public double? BatteryWh => Get("battery_Wh");
        /// <summary>Data generated per day, GB/day (data: <c>data_GB_per_day</c>).</summary>
        public double DataGeneratedGbPerDay => Get("data_GB_per_day") ?? Get("data_GB_day", 0.0);
        /// <summary>Downlink per ground-station pass, GB/pass (data: <c>data_rate_GB_per_pass</c>).</summary>
        public double DownlinkGbPerPass => Get("data_rate_GB_per_pass") ?? Get("data_GB_pass", 0.0);
        /// <summary>
        /// Continuous downlink capacity, GB/day (data: <c>downlink_GB_day</c>; a radio with
        /// <c>continuous_coverage</c> gets <c>BuildConstants.RelayDownlinkGbPerDay</c> from the loader).
        /// </summary>
        public double DownlinkGbPerDay => Get("downlink_GB_day", 0.0);
        /// <summary>Booster-recovery Δv cost as a fraction of first-stage Δv (data: <c>dv_cost_fraction</c>, e.g. 0.15).</summary>
        public double DvCostFraction => Math.Abs(Get("dv_cost_fraction", 0.0));
        /// <summary>Fraction of a recovered item's cost refunded (data: <c>refund_fraction</c>).</summary>
        public double RefundFraction => Get("refund_fraction", 0.0);
        /// <summary>Δv bonus as a fraction of total Δv (hot staging, data: <c>dv_bonus_fraction</c>).</summary>
        public double DvBonusFraction => Get("dv_bonus_fraction", 0.0);
        /// <summary>Booster burn time, s (data: <c>burn_time_s</c>).</summary>
        public double? BurnTimeS => Get("burn_time_s") ?? Get("burn_s");
        /// <summary>Extra one-off cost from a drawback, $M game (data: <c>extra_cost_M</c>).</summary>
        public double ExtraCostM => Get("extra_cost_M", 0.0);
        /// <summary>Extra procurement lead time from a drawback, days (data: <c>extra_lead_days</c>).</summary>
        public double ExtraLeadDays => Get("extra_lead_days", 0.0);
        /// <summary>Extra integration time from a drawback, days (data: <c>extra_integ_days</c>).</summary>
        public double ExtraIntegDays => Get("extra_integ_days", 0.0);
        /// <summary>Mission-assurance total cost change, fraction (data: <c>cost_fraction</c>, e.g. −0.15).</summary>
        public double CostFraction => Get("cost_fraction", 0.0);
        /// <summary>Mission-assurance schedule change, fraction (data: <c>days_fraction</c>, e.g. +0.15).</summary>
        public double DaysFraction => Get("days_fraction", 0.0);
        /// <summary>Mission-assurance uncertainty band scale, dimensionless (data: <c>band_scale</c>).</summary>
        public double BandScale => Get("band_scale", 1.0);
        /// <summary>Mission-assurance reliability bonus for all parts, fraction (data: <c>reliability_bonus</c>).</summary>
        public double ReliabilityBonus => Get("reliability_bonus", 0.0);
        /// <summary>Number of parallel redundant units, dimensionless (data: <c>redundancy</c> or avionics <c>computer_count</c>, default 1).</summary>
        public int Redundancy { get { var v = Get("redundancy") ?? Get("computer_count"); return v.HasValue ? Math.Max(1, (int)Math.Round(v.Value)) : 1; } }
        /// <summary>Orbit insertion error, m (data: <c>insertion_error_km</c>).</summary>
        public double? InsertionErrorM => Scaled("insertion_error_km", 1000.0);
    }

    /// <summary>
    /// One modifier of a part as written in data (<c>common.schema.json#/$defs/effect</c>):
    /// <c>(base × Π mul × (1 + Σ add_fraction)) + Σ add</c>. Units are those of the target name (<c>cost_M</c> in $M,
    /// <c>dry_mass_t</c> in t, <c>reliability</c> in fraction points).
    /// </summary>
    public sealed class ModifierDef
    {
        /// <summary>Creates a modifier.</summary>
        public ModifierDef(string target, string op, double value, string? scope = null, string? condition = null)
        {
            Target = target;
            Op = op;
            Value = value;
            Scope = scope;
            Condition = condition;
        }

        /// <summary>Target, e.g. <c>dry_mass_t</c>, <c>cost_M</c>, <c>reliability</c>, <c>delta_v_m_s</c>.</summary>
        public string Target { get; }
        /// <summary><c>add</c>, <c>add_fraction</c> or <c>mul</c>.</summary>
        public string Op { get; }
        /// <summary>Value in the unit of the target (fraction for <c>add_fraction</c>, factor for <c>mul</c>).</summary>
        public double Value { get; }
        /// <summary>Scope, e.g. <c>vehicle</c>, <c>this_part</c>, <c>all_parts</c>, <c>mission</c>; null when data omits it.</summary>
        public string? Scope { get; }
        /// <summary>Condition, e.g. <c>recovered</c>; null when unconditional.</summary>
        public string? Condition { get; }
    }

    /// <summary>One rule hook of a part as written in data (<c>part.schema.json</c> <c>rules</c>).</summary>
    public sealed class PartRuleDef
    {
        /// <summary>Kind: <c>requires_part</c>, <c>requires_any_part</c>, <c>incompatible_with_part</c>, <c>anomaly_weight</c>,
        /// <c>enables_minigame</c>, <c>test_mitigates_failure_mode</c>, <c>recommends_test</c> or <c>flag</c>.</summary>
        public string Kind { get; internal set; } = "";
        /// <summary>Referenced part IDs (one for <c>requires_part</c>/<c>incompatible_with_part</c>).</summary>
        public IReadOnlyList<string> Parts { get; internal set; } = Array.Empty<string>();
        /// <summary>Referenced anomaly card, test, minigame, failure mode, propellant or flag, by kind.</summary>
        public string? Anomaly { get; internal set; }
        /// <summary>Weight multiplier of an <c>anomaly_weight</c> rule, dimensionless (game value).</summary>
        public double? WeightMult { get; internal set; }
        /// <summary>Referenced test ID.</summary>
        public string? Test { get; internal set; }
        /// <summary>Referenced minigame ID.</summary>
        public string? Minigame { get; internal set; }
        /// <summary>Referenced failure mode.</summary>
        public string? FailureMode { get; internal set; }
        /// <summary>Propellant the mitigation applies to, or null.</summary>
        public string? WithPropellant { get; internal set; }
        /// <summary>Flag name of a <c>flag</c> rule.</summary>
        public string? Flag { get; internal set; }
    }

    /// <summary>
    /// One selectable option in a vote (design section 17.5). Immutable. Masses are in kg,
    /// costs in $M (game-scaled), times in days (game values).
    /// </summary>
    public sealed class PartDef
    {
        /// <summary>Creates a part definition. Prefer <see cref="CatalogLoader"/> for data files.</summary>
        public PartDef(
            string id, string category, string name, double massKg, double costM, double leadDays, double integDays,
            double? reliability, Maturity maturity, PartStats? stats = null, string? propellant = null,
            IReadOnlyList<string>? contracts = null, IReadOnlyList<string>? tags = null,
            IReadOnlyList<string>? failureModes = null, string? twin = null,
            IReadOnlyDictionary<string, string>? valueTypes = null,
            IReadOnlyDictionary<string, double>? anomalyWeights = null)
        {
            Id = id ?? throw new ArgumentNullException(nameof(id));
            Category = category ?? throw new ArgumentNullException(nameof(category));
            Name = name ?? id;
            MassKg = massKg;
            CostM = costM;
            LeadDays = leadDays;
            IntegDays = integDays;
            Reliability = reliability;
            Maturity = maturity;
            Stats = stats ?? new PartStats(null);
            Propellant = Propellants.Normalize(propellant);
            Contracts = contracts ?? Array.Empty<string>();
            Tags = tags ?? Array.Empty<string>();
            FailureModes = failureModes ?? Array.Empty<string>();
            Twin = twin;
            ValueTypes = valueTypes ?? new Dictionary<string, string>();
            AnomalyWeights = anomalyWeights ?? new Dictionary<string, double>();
        }

        /// <summary>
        /// Anomaly cards this part makes more likely (data rule <c>anomaly_weight</c>): card ID → weight multiplier
        /// (game value; <see cref="DefaultAnomalyWeightMultiplier"/> when the design only says "more likely").
        /// </summary>
        public IReadOnlyDictionary<string, double> AnomalyWeights { get; }

        /// <summary>Weight multiplier used when data says "more likely" without a number. game_value (decision).</summary>
        public const double DefaultAnomalyWeightMultiplier = 2.0;

        /// <summary>Stable lowercase snake-case ID, e.g. <c>eng_kerolox_workhorse</c>.</summary>
        public string Id { get; }
        /// <summary>Category (see <see cref="PartCategories"/>).</summary>
        public string Category { get; }
        /// <summary>Display name (English fallback; localised text lives in strings).</summary>
        public string Name { get; }
        /// <summary>Dry mass of one unit, kg. For boosters, the gross mass of one booster.</summary>
        public double MassKg { get; }
        /// <summary>Cost of one unit, $M (game value).</summary>
        public double CostM { get; }
        /// <summary>Procurement lead time, days (game value; parallel).</summary>
        public double LeadDays { get; }
        /// <summary>Integration time, days (game value; serial).</summary>
        public double IntegDays { get; }
        /// <summary>Displayed base reliability per flight, 0–1 (game value), or null when the part cannot fail on its own.</summary>
        public double? Reliability { get; }
        /// <summary>Maturity level; sets the uncertainty band.</summary>
        public Maturity Maturity { get; }
        /// <summary>Category-specific stats.</summary>
        public PartStats Stats { get; }
        /// <summary>Normalised propellant family (see <see cref="Propellants"/>), or empty.</summary>
        public string Propellant { get; }
        /// <summary>Contracts that offer this part. Empty means "any".</summary>
        public IReadOnlyList<string> Contracts { get; }
        /// <summary>Free tags that drive rules, e.g. <c>single_source</c>, <c>pressure_fed</c>, <c>jettison_at_staging</c>, <c>boil_off_mitigation</c>, <c>mirror_first_stage</c>.</summary>
        public IReadOnlyList<string> Tags { get; }
        /// <summary>Failure-mode IDs this part can cause (design section 8.4).</summary>
        public IReadOnlyList<string> FailureModes { get; }
        /// <summary>Real-world twin text.</summary>
        public string? Twin { get; }
        /// <summary>Value-type tags per field group, e.g. <c>stats → real_world_approximate</c>.</summary>
        public IReadOnlyDictionary<string, string> ValueTypes { get; }

        /// <summary>Vehicle or mission modifiers as written in data (<c>modifiers</c>), kept for systems outside the build rules.</summary>
        public IReadOnlyList<ModifierDef> Modifiers { get; internal set; } = Array.Empty<ModifierDef>();

        /// <summary>Rule hooks as written in data (<c>rules</c>): requires/incompatible parts, recommended tests, minigames…</summary>
        public IReadOnlyList<PartRuleDef> Rules { get; internal set; } = Array.Empty<PartRuleDef>();

        /// <summary>Strings key of the display name (data <c>name_key</c>), or null for parts built in code.</summary>
        public string? NameKey { get; internal set; }

        /// <summary>True if the part carries the given tag.</summary>
        public bool HasTag(string tag)
        {
            for (int i = 0; i < Tags.Count; i++) if (Tags[i] == tag) return true;
            return false;
        }

        /// <summary>True if the part is dropped at stage separation rather than carried to orbit (escape tower).</summary>
        public bool JettisonAtStaging => HasTag("jettison_at_staging");

        /// <summary>True when this part may be offered for the given contract.</summary>
        public bool OfferedFor(string contractId)
        {
            if (Contracts.Count == 0) return true;
            for (int i = 0; i < Contracts.Count; i++) if (Contracts[i] == contractId) return true;
            return false;
        }

        /// <inheritdoc />
        public override string ToString() => Id;
    }
}
