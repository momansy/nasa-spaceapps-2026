#nullable enable
using System;
using System.Collections.Generic;
using System.Globalization;
using MissionForge.Core.Data;
using Newtonsoft.Json.Linq;

namespace MissionForge.Core.Scoring
{
    /// <summary>One minigame tier of <c>boosts.json</c> (design 10.3).</summary>
    public sealed class TierDef
    {
        /// <summary>Creates a tier definition.</summary>
        public TierDef(string id, double minFractionUnitless, bool requiresAllPerfect, string boostTier)
        {
            Id = id; MinFractionUnitless = minFractionUnitless; RequiresAllPerfect = requiresAllPerfect; BoostTier = boostTier;
        }
        /// <summary>Tier id: bronze, silver, gold or platinum.</summary>
        public string Id { get; }
        /// <summary>Smallest completion fraction f that reaches the tier, unitless 0-1 (game_value).</summary>
        public double MinFractionUnitless { get; }
        /// <summary>True when every active player must be perfect (Platinum).</summary>
        public bool RequiresAllPerfect { get; }
        /// <summary>Boost tier the tier pays (Platinum pays gold).</summary>
        public string BoostTier { get; }
    }

    /// <summary>The value one boost pays at one tier: an amount, or a shield kind.</summary>
    public sealed class BoostTierValue
    {
        /// <summary>Creates a tier value.</summary>
        public BoostTierValue(double value, string? shield) { Value = value; Shield = shield; }
        /// <summary>Amount in the unit of the boost's op (fraction, factor, $M, days or points). Zero for shields.</summary>
        public double Value { get; }
        /// <summary>Shield kind (<c>reroll_next_failure</c>, <c>negate_next_failure</c>) or null.</summary>
        public string? Shield { get; }
    }

    /// <summary>One boost of <c>boosts.json</c> (design 10.4, 11.1).</summary>
    public sealed class BoostDef
    {
        /// <summary>Creates a boost definition.</summary>
        public BoostDef(string id, string kind, string? target, string? op, IReadOnlyDictionary<string, BoostTierValue?> tiers,
            double? capValue, string? capKind, string phase, bool crewedOnly, string scope)
        {
            Id = id; Kind = kind; Target = target; Op = op; Tiers = tiers; CapValue = capValue; CapKind = capKind;
            Phase = phase; CrewedOnly = crewedOnly; Scope = scope;
        }
        /// <summary>Boost id, lower case (<c>dv_bonus</c>).</summary>
        public string Id { get; }
        /// <summary><c>effect</c> or <c>shield</c>.</summary>
        public string Kind { get; }
        /// <summary>Quantity the host changes (<c>delta_v_m_s</c>, <c>budget_M</c>...), null for shields.</summary>
        public string? Target { get; }
        /// <summary><c>add_fraction</c>, <c>add</c> or <c>mul</c>; null for shields.</summary>
        public string? Op { get; }
        /// <summary>Value per boost tier (bronze, silver, gold); null where the tier pays nothing.</summary>
        public IReadOnlyDictionary<string, BoostTierValue?> Tiers { get; }
        /// <summary>Cap of the mission total (or number of shields held), null when uncapped.</summary>
        public double? CapValue { get; }
        /// <summary><c>total_per_mission</c>, <c>meter_max</c> or <c>held_at_once</c>.</summary>
        public string? CapKind { get; }
        /// <summary><c>any</c> or <c>build</c>.</summary>
        public string Phase { get; }
        /// <summary>True when the boost applies only to crewed contracts.</summary>
        public bool CrewedOnly { get; }
        /// <summary><c>mission</c> or <c>segment</c>.</summary>
        public string Scope { get; }
    }

    /// <summary>One Mission Control Moment of <c>scoring.json</c> (design 11.2).</summary>
    public sealed class SyncMomentDef
    {
        /// <summary>Creates a moment definition.</summary>
        public SyncMomentDef(string id, string flag) { Id = id; Flag = flag; }
        /// <summary>Moment id.</summary>
        public string Id { get; }
        /// <summary>Flag the host raises when the moment is chosen.</summary>
        public string Flag { get; }
    }

    /// <summary>A term of a score component of <c>scoring.json</c>.</summary>
    public sealed class ScoreTermDef
    {
        /// <summary>Creates a term.</summary>
        public ScoreTermDef(string id, string kind, double points, string? tier)
        { Id = id; Kind = kind; Points = points; Tier = tier; }
        /// <summary>Term id.</summary>
        public string Id { get; }
        /// <summary><c>fixed</c>, <c>up_to</c>, <c>per_fraction</c> or <c>each</c>.</summary>
        public string Kind { get; }
        /// <summary>Points (game_value).</summary>
        public double Points { get; }
        /// <summary>Minigame tier the term pays for, or null.</summary>
        public string? Tier { get; }
    }

    /// <summary>A grade of <c>scoring.json</c> (design 11.4).</summary>
    public sealed class GradeDef
    {
        /// <summary>Creates a grade.</summary>
        public GradeDef(string id, double? minScore, string titleKey) { Id = id; MinScore = minScore; TitleKey = titleKey; }
        /// <summary>Grade letter.</summary>
        public string Id { get; }
        /// <summary>Lowest total that earns the grade, points; null for the lowest grade.</summary>
        public double? MinScore { get; }
        /// <summary>String-table key of the grade title.</summary>
        public string TitleKey { get; }
    }

    /// <summary>A criterion of a contract objective (<c>metric op value</c>).</summary>
    public sealed class Criterion
    {
        /// <summary>Creates a criterion.</summary>
        public Criterion(string metric, string op, double value, double tolerance)
        { Metric = metric; Op = op; Value = value; Tolerance = tolerance; }
        /// <summary>Metric name.</summary>
        public string Metric { get; }
        /// <summary><c>gte gt lte lt eq within is_true</c>.</summary>
        public string Op { get; }
        /// <summary>Comparison value, in the unit of the metric.</summary>
        public double Value { get; }
        /// <summary>Tolerance of <c>within</c>, in the unit of the metric.</summary>
        public double Tolerance { get; }
    }

    /// <summary>An objective of a contract (primary, secondary or stretch).</summary>
    public sealed class ObjectiveDef
    {
        /// <summary>Creates an objective.</summary>
        public ObjectiveDef(string id, string kind, IReadOnlyList<Criterion> criteria) { Id = id; Kind = kind; Criteria = criteria; }
        /// <summary>Objective id.</summary>
        public string Id { get; }
        /// <summary><c>PRIMARY</c>, <c>SECONDARY</c> or <c>STRETCH</c> (protocol ObjectiveKind).</summary>
        public string Kind { get; }
        /// <summary>All criteria must hold for the objective to be met.</summary>
        public IReadOnlyList<Criterion> Criteria { get; }
    }

    /// <summary>The objectives of one contract.</summary>
    public sealed class ContractObjectives
    {
        /// <summary>Creates the objective set.</summary>
        public ContractObjectives(string contractId, ObjectiveDef primary, IReadOnlyList<ObjectiveDef> secondary, ObjectiveDef? stretch, ObjectiveDef? safety = null)
        { ContractId = contractId; Primary = primary; Secondary = secondary; Stretch = stretch; Safety = safety; }
        /// <summary>Contract id.</summary>
        public string ContractId { get; }
        /// <summary>The primary objective.</summary>
        public ObjectiveDef Primary { get; }
        /// <summary>The secondary objectives.</summary>
        public IReadOnlyList<ObjectiveDef> Secondary { get; }
        /// <summary>The stretch objective, if the contract has one.</summary>
        public ObjectiveDef? Stretch { get; }
        /// <summary>The crew-safety objective of a crewed contract (C4, C6), else null. Its points are the crew-safe term of the score.</summary>
        public ObjectiveDef? Safety { get; }
    }

    /// <summary>An award rule of <c>awards.json</c> (design 11.5).</summary>
    public sealed class AwardDef
    {
        /// <summary>Creates an award definition.</summary>
        public AwardDef(string id, string selection, string metric, string? role, IReadOnlyList<string> minigames)
        { Id = id; Selection = selection; Metric = metric; Role = role; Minigames = minigames; }
        /// <summary>Award id.</summary>
        public string Id { get; }
        /// <summary><c>highest</c> or <c>condition</c>.</summary>
        public string Selection { get; }
        /// <summary>Metric the award reads from <see cref="PlayerStats"/>.</summary>
        public string Metric { get; }
        /// <summary>Role the winner must hold, or null.</summary>
        public string? Role { get; }
        /// <summary>Minigame ids the metric belongs to (informational).</summary>
        public IReadOnlyList<string> Minigames { get; }
    }

    /// <summary>
    /// Scoring data of <c>boosts.json</c>, <c>scoring.json</c>, <c>awards.json</c>, <c>assist_levels.json</c> and the
    /// <c>objectives</c> of <c>contracts.json</c>. Own parser: the lossy <see cref="GameCatalog.Boosts"/> is not used.
    /// </summary>
    public sealed class ScoringCatalog
    {
        /// <summary>Tiers in ascending order (bronze, silver, gold, platinum).</summary>
        public IReadOnlyList<TierDef> Tiers { get; private set; } = Array.Empty<TierDef>();
        /// <summary>Smallest number of successes below Bronze that still earns a cosmetic sparkle.</summary>
        public int CosmeticMinSuccesses { get; private set; }
        /// <summary>The 11 boosts by id.</summary>
        public IReadOnlyDictionary<string, BoostDef> Boosts { get; private set; } = new Dictionary<string, BoostDef>();
        /// <summary>Team Sync meter maximum.</summary>
        public double SyncMeterMax { get; private set; }
        /// <summary>Team Sync gain per source: <c>gold silver bronze good_call</c>.</summary>
        public IReadOnlyDictionary<string, double> SyncGains { get; private set; } = new Dictionary<string, double>();
        /// <summary>The three Mission Control Moments.</summary>
        public IReadOnlyList<SyncMomentDef> SyncMoments { get; private set; } = Array.Empty<SyncMomentDef>();
        /// <summary>Score components (id → terms), in file order.</summary>
        public IReadOnlyDictionary<string, IReadOnlyList<ScoreTermDef>> Components { get; private set; } = new Dictionary<string, IReadOnlyList<ScoreTermDef>>();
        /// <summary>Cap of the score-boost multiplier.</summary>
        public double ScoreBoostCap { get; private set; } = 1.5;
        /// <summary>Grades from best to worst.</summary>
        public IReadOnlyList<GradeDef> Grades { get; private set; } = Array.Empty<GradeDef>();
        /// <summary>Grade of a lost crew.</summary>
        public string CrewLostGrade { get; private set; } = "D";
        /// <summary>Difficulty multiplier per assist level id.</summary>
        public IReadOnlyDictionary<string, double> AssistMultipliers { get; private set; } = new Dictionary<string, double>();
        /// <summary>Award rules in file order.</summary>
        public IReadOnlyList<AwardDef> Awards { get; private set; } = Array.Empty<AwardDef>();
        /// <summary>Minimum awards per player.</summary>
        public int MinAwardsPerPlayer { get; private set; } = 1;
        /// <summary>Objectives per contract id.</summary>
        public IReadOnlyDictionary<string, ContractObjectives> Objectives { get; private set; } = new Dictionary<string, ContractObjectives>();

        /// <summary>Gain of one team-sync source, or 0 when unknown.</summary>
        public double SyncGain(string source) => SyncGains.TryGetValue(source, out var g) ? g : 0.0;

        /// <summary>Points of a scoring term of a component, or 0 when the data has no such term.</summary>
        public double TermPoints(string componentId, string termId)
        {
            if (Components.TryGetValue(componentId, out var terms))
                foreach (var t in terms) if (t.Id == termId) return t.Points;
            return 0.0;
        }

        /// <summary>Tier definition by id, or null.</summary>
        public TierDef? Tier(string id)
        {
            foreach (var t in Tiers) if (t.Id == id) return t;
            return null;
        }

        /// <summary>
        /// Loads the scoring data. <paramref name="files"/> uses the key convention of <see cref="CatalogLoader.Load"/>
        /// (path relative to <c>data/</c>; a leading <c>data/</c> and backslashes are accepted).
        /// </summary>
        /// <exception cref="CatalogException">A file is missing, malformed or lacks a required field; the message names the file.</exception>
        public static ScoringCatalog Load(IReadOnlyDictionary<string, string> files)
        {
            if (files == null) throw new ArgumentNullException(nameof(files));
            var named = new Dictionary<string, string>(StringComparer.Ordinal);
            foreach (var kv in files)
            {
                var key = kv.Key.Replace('\\', '/');
                if (key.StartsWith("data/", StringComparison.Ordinal)) key = key.Substring(5);
                named[key] = kv.Value;
            }
            var c = new ScoringCatalog();
            c.LoadBoosts(Parse(named, "boosts.json"));
            c.LoadScoring(Parse(named, "scoring.json"));
            c.LoadAwards(Parse(named, "awards.json"));
            c.LoadAssist(Parse(named, "assist_levels.json"));
            c.LoadObjectives(Parse(named, "contracts.json"));
            return c;
        }

        private static JObject Parse(Dictionary<string, string> files, string name)
        {
            if (!files.TryGetValue(name, out var text)) throw new CatalogException(name + ": file is missing");
            try { return JObject.Parse(text); }
            catch (Exception e) { throw new CatalogException(name + ": malformed JSON: " + e.Message, e); }
        }

        private static T Need<T>(JToken? token, string file, string path)
        {
            if (token == null || token.Type == JTokenType.Null) throw new CatalogException(file + ": missing " + path);
            try { return token.Value<T>()!; }
            catch (Exception e) { throw new CatalogException(file + ": bad value at " + path + ": " + e.Message, e); }
        }

        private static JArray NeedArray(JToken? token, string file, string path) =>
            token as JArray ?? throw new CatalogException(file + ": " + path + " must be an array");

        private void LoadBoosts(JObject root)
        {
            const string f = "boosts.json";
            CosmeticMinSuccesses = (int)(root["below_bronze"]?["cosmetic_min_successes"]?.Value<double>() ?? 1);
            var tiers = new List<TierDef>();
            foreach (var t in NeedArray(root["tiers"], f, "tiers"))
                tiers.Add(new TierDef(Need<string>(t["id"], f, "tiers[].id"), Need<double>(t["min_fraction"], f, "tiers[].min_fraction"),
                    t["requires_all_perfect"]?.Value<bool>() ?? false, Need<string>(t["boost_tier"], f, "tiers[].boost_tier")));
            Tiers = tiers;
            var boosts = new Dictionary<string, BoostDef>(StringComparer.Ordinal);
            foreach (var b in NeedArray(root["boosts"], f, "boosts"))
            {
                var id = Need<string>(b["id"], f, "boosts[].id");
                var values = new Dictionary<string, BoostTierValue?>(StringComparer.Ordinal);
                if (b["tiers"] is JObject tv)
                    foreach (var p in tv.Properties())
                    {
                        if (p.Value.Type == JTokenType.Null) { values[p.Name] = null; continue; }
                        values[p.Name] = new BoostTierValue(p.Value["value"]?.Value<double>() ?? 0.0, p.Value["shield"]?.Value<string>());
                    }
                var cap = b["cap"] as JObject;
                if (boosts.ContainsKey(id)) throw new CatalogException(f + ": duplicate boost " + id);
                boosts[id] = new BoostDef(id, Need<string>(b["kind"], f, id + ".kind"), b["target"]?.Value<string>(), b["op"]?.Value<string>(),
                    values, cap?["value"]?.Value<double>(), cap?["kind"]?.Value<string>(), b["phase"]?.Value<string>() ?? "any",
                    b["crewed_only"]?.Value<bool>() ?? false, b["scope"]?.Value<string>() ?? "mission");
            }
            Boosts = boosts;
        }

        private void LoadScoring(JObject root)
        {
            const string f = "scoring.json";
            var ts = root["team_sync"] ?? throw new CatalogException(f + ": missing team_sync");
            SyncMeterMax = Need<double>(ts["meter_max"], f, "team_sync.meter_max");
            var gains = new Dictionary<string, double>(StringComparer.Ordinal);
            foreach (var p in (ts["gains"] as JObject ?? throw new CatalogException(f + ": missing team_sync.gains")).Properties())
                gains[p.Name] = p.Value.Value<double>();
            SyncGains = gains;
            var moments = new List<SyncMomentDef>();
            foreach (var m in NeedArray(ts["moments"], f, "team_sync.moments"))
                moments.Add(new SyncMomentDef(Need<string>(m["id"], f, "moments[].id"), Need<string>(m["flag"], f, "moments[].flag")));
            SyncMoments = moments;
            var comps = new Dictionary<string, IReadOnlyList<ScoreTermDef>>(StringComparer.Ordinal);
            foreach (var comp in NeedArray(root["components"], f, "components"))
            {
                var terms = new List<ScoreTermDef>();
                foreach (var t in NeedArray(comp["terms"], f, "components[].terms"))
                    terms.Add(new ScoreTermDef(Need<string>(t["id"], f, "terms[].id"), Need<string>(t["kind"], f, "terms[].kind"),
                        Need<double>(t["points"], f, "terms[].points"), t["tier"]?.Value<string>()));
                comps[Need<string>(comp["id"], f, "components[].id")] = terms;
            }
            Components = comps;
            foreach (var m in NeedArray(root["multipliers"], f, "multipliers"))
                if (m["id"]?.Value<string>() == "score_boosts") ScoreBoostCap = m["cap"]?.Value<double>() ?? 1.5;
            var grades = new List<GradeDef>();
            foreach (var g in NeedArray(root["grades"], f, "grades"))
                grades.Add(new GradeDef(Need<string>(g["id"], f, "grades[].id"), g["min_score"]?.Value<double>(), g["title_key"]?.Value<string>() ?? ""));
            Grades = grades;
            CrewLostGrade = root["crew_lost_grade"]?.Value<string>() ?? "D";
        }

        private void LoadAwards(JObject root)
        {
            const string f = "awards.json";
            MinAwardsPerPlayer = (int)(root["rules"]?["min_awards_per_player"]?.Value<double>() ?? 1);
            var list = new List<AwardDef>();
            foreach (var a in NeedArray(root["awards"], f, "awards"))
            {
                var mg = new List<string>();
                if (a["minigames"] is JArray arr) foreach (var m in arr) mg.Add(m.Value<string>() ?? "");
                list.Add(new AwardDef(Need<string>(a["id"], f, "awards[].id"), Need<string>(a["selection"], f, "awards[].selection"),
                    Need<string>(a["metric"], f, "awards[].metric"), a["role"]?.Value<string>(), mg));
            }
            Awards = list;
        }

        private void LoadAssist(JObject root)
        {
            const string f = "assist_levels.json";
            var d = new Dictionary<string, double>(StringComparer.Ordinal);
            foreach (var a in NeedArray(root["assist_levels"], f, "assist_levels"))
                d[Need<string>(a["id"], f, "assist_levels[].id")] = Need<double>(a["score_multiplier"], f, "assist_levels[].score_multiplier");
            AssistMultipliers = d;
        }

        private static Criterion ReadCriterion(JToken c, string f) =>
            new Criterion(Need<string>(c["metric"], f, "criteria[].metric"), Need<string>(c["op"], f, "criteria[].op"),
                c["value"]?.Value<double>() ?? 0.0, c["tolerance"]?.Value<double>() ?? 0.0);

        private static ObjectiveDef ReadObjective(JToken o, string kind, string f)
        {
            var list = new List<Criterion>();
            foreach (var c in NeedArray(o["criteria"], f, "objectives.criteria")) list.Add(ReadCriterion(c, f));
            return new ObjectiveDef(Need<string>(o["id"], f, "objectives.id"), kind, list);
        }

        private void LoadObjectives(JObject root)
        {
            const string f = "contracts.json";
            var map = new Dictionary<string, ContractObjectives>(StringComparer.Ordinal);
            foreach (var c in NeedArray(root["contracts"], f, "contracts"))
            {
                var id = Need<string>(c["id"], f, "contracts[].id");
                var o = c["objectives"] ?? throw new CatalogException(f + ": " + id + " has no objectives");
                var secondary = new List<ObjectiveDef>();
                foreach (var s in NeedArray(o["secondary"], f, id + ".objectives.secondary")) secondary.Add(ReadObjective(s, "SECONDARY", f));
                ObjectiveDef? stretch = o["stretch"] is JObject st ? ReadObjective(st, "STRETCH", f) : null;
                ObjectiveDef? safety = o["safety"] is JObject sf ? ReadObjective(sf, "SAFETY", f) : null;
                map[id] = new ContractObjectives(id, ReadObjective(o["primary"] ?? throw new CatalogException(f + ": " + id + " has no primary"), "PRIMARY", f), secondary, stretch, safety);
            }
            Objectives = map;
        }

        /// <summary>Formats a number invariantly (used in messages).</summary>
        internal static string Num(double v) => v.ToString("0.###", CultureInfo.InvariantCulture);
    }
}
