#nullable enable
using System;
using System.Collections.Generic;
using System.Linq;
using Newtonsoft.Json.Linq;

namespace MissionForge.Core.Campaign
{
    /// <summary>One metric predicate in data/achievements.json (design 13.5).</summary>
    public sealed class AchievementCriterion
    {
        /// <summary>Metric identifier.</summary>
        public string Metric { get; }
        /// <summary>Comparison op: gte, gt, lte, lt, eq, within, is_true.</summary>
        public string Operator { get; }
        /// <summary>Comparison target (not used for is_true).</summary>
        public double Value { get; }
        /// <summary>Inclusive radius around Value for within; game_value supplied by data.</summary>
        public double Tolerance { get; }
        /// <summary>Optional minigame filter, e.g. MG-25.</summary>
        public string MinigameId { get; }
        /// <summary>Creates a criterion.</summary>
        public AchievementCriterion(string metric, string op, double value = 0,
            double tolerance = 0, string minigameId = "")
        {
            Metric = metric;
            Operator = op;
            Value = value;
            Tolerance = tolerance;
            MinigameId = minigameId;
        }
    }

    /// <summary>Data-driven achievement definition with optional contract and assist filters.</summary>
    public sealed class AchievementDefinition
    {
        /// <summary>Unique achievement ID.</summary>
        public string Id { get; }
        /// <summary>Mission or career scope.</summary>
        public string Scope { get; }
        /// <summary>Conjunction of predicates; all must be true.</summary>
        public IReadOnlyList<AchievementCriterion> Criteria { get; }
        /// <summary>Optional eligible contracts.</summary>
        public IReadOnlyList<string> Contracts { get; }
        /// <summary>Optional required assist level.</summary>
        public string AssistLevel { get; }
        /// <summary>Name localization key.</summary>
        public string NameKey => "achievement." + Id + ".name";
        /// <summary>Description localization key.</summary>
        public string DescriptionKey => "achievement." + Id + ".description";

        /// <summary>Creates an immutable definition.</summary>
        public AchievementDefinition(string id, string scope, IEnumerable<AchievementCriterion> criteria,
            IEnumerable<string>? contracts = null, string assistLevel = "")
        {
            Id = id;
            Scope = scope;
            Criteria = Array.AsReadOnly(criteria.ToArray());
            Contracts = Array.AsReadOnly((contracts ?? Array.Empty<string>()).ToArray());
            AssistLevel = assistLevel;
        }
    }

    /// <summary>Pure achievement evaluator. The host may pass the exact data/achievements.json text.</summary>
    public static class Achievements
    {
        private static readonly IReadOnlyList<AchievementDefinition> Defaults =
            Array.AsReadOnly(new[]
            {
                Def("escape_velocity", "mission", "contract_completed", "is_true",
                    contracts: new[] { "C6", "C7" }),
                Def("penny_pincher", "mission", "budget_remaining_fraction", "gte", 0.3),
                Def("on_the_dot", "mission", "launched_at_optimal_second", "is_true"),
                new AchievementDefinition("hoverslam_hero", "mission", new[]
                {
                    new AchievementCriterion("booster_landed", "is_true"),
                    new AchievementCriterion("booster_touchdown_speed_m_s", "lt", 1)
                }),
                Def("all_hands", "mission", "all_minigames_gold", "is_true"),
                new AchievementDefinition("fail_forward", "mission", new[]
                {
                    new AchievementCriterion("mission_success", "is_true"),
                    new AchievementCriterion("retry_after_investigation", "is_true")
                }),
                Def("test_pilot", "mission", "mission_success", "is_true", assistLevel: "flight_director"),
                Def("codex_collector", "career", "codex_entries_unlocked", "gte", 100),
                Def("veto_visionary", "mission", "vetoed_option_would_have_failed", "is_true"),
                new AchievementDefinition("ten_seats_full", "mission", new[]
                {
                    new AchievementCriterion("mission_finished", "is_true"),
                    new AchievementCriterion("players_at_finish", "gte", 10)
                }),
                new AchievementDefinition("blackout_calm", "mission", new[]
                {
                    new AchievementCriterion("minigame_tier_gold", "is_true", minigameId: "MG-25")
                }),
                Def("patch_archivist", "career", "mission_patches_designed", "gte", 10)
            });

        private static AchievementDefinition Def(string id, string scope, string metric, string op,
            double value = 0, IEnumerable<string>? contracts = null, string assistLevel = "") =>
            new AchievementDefinition(id, scope, new[] { new AchievementCriterion(metric, op, value) },
                contracts, assistLevel);

        /// <summary>Parses the real data/achievements.json schema with no file access.</summary>
        public static IReadOnlyList<AchievementDefinition> Parse(string json)
        {
            if (json == null) throw new ArgumentNullException(nameof(json));
            var root = JObject.Parse(json);
            if (!(root["achievements"] is JArray list))
                throw new ArgumentException("Missing achievements array.", nameof(json));
            var defs = new List<AchievementDefinition>();
            var ids = new HashSet<string>(StringComparer.Ordinal);
            foreach (JToken t in list)
            {
                if (!(t is JObject row)) throw new ArgumentException("Achievement must be an object.");
                string id = (string?)row["id"] ?? throw new ArgumentException("Achievement missing id.");
                if (!ids.Add(id)) throw new ArgumentException("Duplicate achievement id: " + id);
                string scope = (string?)row["scope"] ?? "mission";
                var criteria = new List<AchievementCriterion>();
                if (!(row["criteria"] is JArray constraints) || constraints.Count == 0)
                    throw new ArgumentException("Achievement missing criteria: " + id);
                foreach (JToken criterion in constraints)
                {
                    string metric = (string?)criterion["metric"] ?? throw new ArgumentException("Missing metric: " + id);
                    string op = (string?)criterion["op"] ?? throw new ArgumentException("Missing operator: " + id);
                    double value = (double?)criterion["value"] ?? 0;
                    double tol = (double?)criterion["tolerance"] ?? 0;
                    if (!new[] { "gte", "gt", "lte", "lt", "eq", "within", "is_true" }.Contains(op))
                        throw new ArgumentException("Unsupported achievement op: " + op);
                    criteria.Add(new AchievementCriterion(metric, op, value, tol,
                        (string?)criterion["minigame"] ?? ""));
                }
                var contracts = row["contracts"] is JArray cs ?
                    cs.Select(x => (string?)x ?? throw new ArgumentException(
                        "Achievement contract must be a string: " + id)).ToArray() : Array.Empty<string>();
                defs.Add(new AchievementDefinition(id, scope, criteria, contracts,
                    (string?)row["assist_level"] ?? ""));
            }
            return Array.AsReadOnly(defs.ToArray());
        }

        /// <summary>
        /// Returns newly earned achievement IDs, never including those already in state.
        /// Metrics are numeric (booleans as 1/0). A minigame-filtered criterion reads
        /// "metric:MG-25"; optional source JSON overrides built-in copies of the shipped rules.
        /// </summary>
        public static IReadOnlyList<string> Evaluate(CampaignState state, MissionReport report,
            IReadOnlyDictionary<string, double> metrics, string? achievementsJson = null)
        {
            if (state == null || report == null || metrics == null)
                throw new ArgumentNullException(state == null ? nameof(state) :
                    report == null ? nameof(report) : nameof(metrics));
            var definitions = achievementsJson == null ? Defaults : Parse(achievementsJson);
            var known = new HashSet<string>(state.Achievements, StringComparer.Ordinal);
            var unlocked = new List<string>();
            foreach (var definition in definitions)
            {
                if (known.Contains(definition.Id)) continue;
                if (definition.Contracts.Count != 0 && !definition.Contracts.Contains(report.ContractId))
                    continue;
                if (definition.AssistLevel.Length != 0 &&
                    (!metrics.TryGetValue("assist_level:" + definition.AssistLevel, out double assist) ||
                     assist < 0.5)) continue;
                bool passed = true;
                foreach (var criterion in definition.Criteria)
                {
                    string key = criterion.MinigameId.Length == 0 ? criterion.Metric :
                        criterion.Metric + ":" + criterion.MinigameId;
                    double actual;
                    if (key == "contract_completed" || key == "mission_success")
                        actual = report.Outcome == MissionOutcome.Success ? 1 : 0;
                    else if (key == "mission_finished") actual = 1;
                    else if (key == "budget_remaining_fraction")
                        actual = report.BudgetInitialM <= 0 ? 0 :
                            Math.Max(0, report.BudgetRemainingM) / report.BudgetInitialM;
                    else if (!metrics.TryGetValue(key, out actual)) { passed = false; break; }
                    if (double.IsNaN(actual) || double.IsInfinity(actual) ||
                        !Compare(actual, criterion)) { passed = false; break; }
                }
                if (passed) { known.Add(definition.Id); unlocked.Add(definition.Id); }
            }
            return Array.AsReadOnly(unlocked.ToArray());
        }

        private static bool Compare(double actual, AchievementCriterion c)
        {
            switch (c.Operator)
            {
                case "gte": return actual >= c.Value;
                case "gt": return actual > c.Value;
                case "lte": return actual <= c.Value;
                case "lt": return actual < c.Value;
                case "eq": return actual == c.Value;
                case "within": return c.Tolerance >= 0 && Math.Abs(actual - c.Value) <= c.Tolerance;
                case "is_true": return actual >= 0.5;
                default: throw new ArgumentException("Unsupported achievement operator: " + c.Operator);
            }
        }

        /// <summary>Returns state with newly unlocked achievements, without duplicates or mutation.</summary>
        public static CampaignState Apply(CampaignState state, IEnumerable<string> ids)
        {
            if (state == null || ids == null) throw new ArgumentNullException(
                state == null ? nameof(state) : nameof(ids));
            var merged = state.Achievements.Concat(ids).Distinct(StringComparer.Ordinal).ToArray();
            return state.With(achievements: merged);
        }
    }
}
