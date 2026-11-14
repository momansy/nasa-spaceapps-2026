#nullable enable
using System;
using System.Collections.Generic;
using System.Globalization;
using MissionForge.Core.Data;
using Newtonsoft.Json.Linq;

namespace MissionForge.Core.Scoring
{
    /// <summary>Kind of boost (design 10.4): a stat effect or a consumable shield.</summary>
    public enum BoostKind { Effect, Shield }

    /// <summary>How a boost value combines with the stat it targets (<c>data/schema/boost.schema.json</c>).</summary>
    public enum BoostOp
    {
        /// <summary>Adds the value in the unit of the target (M, days, morale points).</summary>
        Add,
        /// <summary>Adds the value as a fraction (0.01 = +1 %) of the target stat.</summary>
        AddFraction,
        /// <summary>Multiplies the target stat by the value (×1.1).</summary>
        Mul,
    }

    /// <summary>One tier row of <c>boosts.json</c> <c>tiers</c> (design 10.3): the completion threshold and the boost tier it pays.</summary>
    public sealed class TierDef
    {
        /// <summary>Creates a tier row.</summary>
        public TierDef(string id, double minFractionUnitless, bool requiresAllPerfect, string boostTier)
        {
            Id = id; MinFractionUnitless = minFractionUnitless; RequiresAllPerfect = requiresAllPerfect; BoostTier = boostTier;
        }
        /// <summary>Tier ID: <c>bronze</c>, <c>silver</c>, <c>gold</c> or <c>platinum</c>.</summary>
        public string Id { get; }
        /// <summary>Minimum completion fraction f (0–1, unitless) to reach the tier. game_value.</summary>
        public double MinFractionUnitless { get; }
        /// <summary>True when every active player must also be "perfect" (Platinum).</summary>
        public bool RequiresAllPerfect { get; }
        /// <summary>Tier whose boost values apply (Platinum pays <c>gold</c>, design 10.3).</summary>
        public string BoostTier { get; }
    }

    /// <summary>One boost of design 10.4, as read from <c>boosts.json</c>. Unit of every value is that of <see cref="Target"/>.</summary>
    public sealed class BoostRule
    {
        /// <summary>Creates a boost rule.</summary>
        public BoostRule(string id, BoostKind kind, string? target, BoostOp op,
            IReadOnlyDictionary<string, double> valueByTier, IReadOnlyDictionary<string, string> shieldByTier,
            double? capValue, string? capKind, string phase, bool crewedOnly, string scope)
        {
            Id = id; Kind = kind; Target = target; Op = op; ValueByTier = valueByTier; ShieldByTier = shieldByTier;
            CapValue = capValue; CapKind = capKind; Phase = phase; CrewedOnly = crewedOnly; Scope = scope;
        }
        /// <summary>Boost ID, lowercase snake case (<c>dv_bonus</c>).</summary>
        public string Id { get; }
        /// <summary>Effect or shield.</summary>
        public BoostKind Kind { get; }
        /// <summary>Stat the boost changes (<c>delta_v_m_s</c>, <c>budget_M</c>…); null for shields.</summary>
        public string? Target { get; }
        /// <summary>How the value combines with the stat; <see cref="BoostOp.Add"/> for shields.</summary>
        public BoostOp Op { get; }
        /// <summary>Value per boost tier (<c>bronze</c>, <c>silver</c>, <c>gold</c>); a tier without an entry pays nothing. game_value.</summary>
        public IReadOnlyDictionary<string, double> ValueByTier { get; }
        /// <summary>Shield kind per boost tier (<c>reroll_next_failure</c>, <c>negate_next_failure</c>); empty for effects.</summary>
        public IReadOnlyDictionary<string, string> ShieldByTier { get; }
        /// <summary>Cap on the total (or the number of shields held), or null for none. game_value.</summary>
        public double? CapValue { get; }
        /// <summary>Cap kind: <c>total_per_mission</c>, <c>held_at_once</c> or <c>meter_max</c>; null without a cap.</summary>
        public string? CapKind { get; }
        /// <summary><c>any</c> or <c>build</c>: the phase in which the boost can apply.</summary>
        public string Phase { get; }
        /// <summary>True when the boost applies on crewed contracts only (Crew Morale).</summary>
        public bool CrewedOnly { get; }
        /// <summary><c>mission</c> or <c>segment</c>.</summary>
        public string Scope { get; }
    }

    /// <summary>One term of a score component (design 11.3).</summary>
    public sealed class ScoreTerm
    {
        /// <summary>Creates a term.</summary>
        public ScoreTerm(string id, string kind, double points, string? tier)
        {
            Id = id; Kind = kind; Points = points; Tier = tier;
        }
        /// <summary>Term ID (<c>primary</c>, <c>budget_remaining</c>…).</summary>
        public string Id { get; }
        /// <summary><c>fixed</c>, <c>up_to</c>, <c>per_fraction</c> or <c>each</c>.</summary>
        public string Kind { get; }
        /// <summary>Points of the term (game_value): the fixed award, the cap, the points at fraction 1, or the points per unit.</summary>
        public double Points { get; }
        /// <summary>Minigame tier an <c>each</c> term pays for, or null.</summary>
        public string? Tier { get; }
    }

    /// <summary>A score component: a named group of terms (objectives, efficiency, …).</summary>
    public sealed class ScoreComponentDef
    {
        /// <summary>Creates a component.</summary>
        public ScoreComponentDef(string id, IReadOnlyList<ScoreTerm> terms) { Id = id; Terms = terms; }
        /// <summary>Component ID (<c>objective_points</c>, <c>efficiency</c>, <c>safety_recovery</c>, <c>science_data</c>, <c>teamwork</c>, <c>knowledge</c>).</summary>
        public string Id { get; }
        /// <summary>Terms in data order.</summary>
        public IReadOnlyList<ScoreTerm> Terms { get; }
        /// <summary>Term by ID, or null.</summary>
        public ScoreTerm? Term(string id)
        {
            foreach (var t in Terms) if (t.Id == id) return t;
            return null;
        }
    }

    /// <summary>A Mission Control Moment option (design 11.2).</summary>
    public sealed class SyncMomentDef
    {
        /// <summary>Creates a moment.</summary>
        public SyncMomentDef(string id, string flag, double scoreMultiplierNextPhase)
        {
            Id = id; Flag = flag; ScoreMultiplierNextPhase = scoreMultiplierNextPhase;
        }
        /// <summary>Moment ID (<c>perfect_phase</c>, <c>save_the_mission</c>, <c>golden_window</c>).</summary>
        public string Id { get; }
        /// <summary>Flag the host sets while the moment is active.</summary>
        public string Flag { get; }
        /// <summary>Multiplier on minigame points in the next flight phase (unitless; 2 for Golden Window, 1 otherwise).</summary>
        public double ScoreMultiplierNextPhase { get; }
    }

    /// <summary>The Team Sync block of <c>scoring.json</c> (design 11.2).</summary>
    public sealed class TeamSyncDef
    {
        /// <summary>Creates the block.</summary>
        public TeamSyncDef(double meterMax, IReadOnlyDictionary<string, double> gains, double choiceVoteS, IReadOnlyList<SyncMomentDef> moments)
        {
            MeterMax = meterMax; Gains = gains; ChoiceVoteS = choiceVoteS; Moments = moments;
        }
        /// <summary>Meter maximum (points). game_value: 100.</summary>
        public double MeterMax { get; }
        /// <summary>Gain per source in meter points: <c>gold</c>, <c>silver</c>, <c>bronze</c>, <c>good_call</c>. game_value.</summary>
        public IReadOnlyDictionary<string, double> Gains { get; }
        /// <summary>Length of the moment-choice vote (s). game_value: 5.</summary>
        public double ChoiceVoteS { get; }
        /// <summary>The three moments in data order.</summary>
        public IReadOnlyList<SyncMomentDef> Moments { get; }
        /// <summary>Moment by ID, or null.</summary>
        public SyncMomentDef? Moment(string id)
        {
            foreach (var m in Moments) if (m.Id == id) return m;
            return null;
        }
    }

    /// <summary>A grade row (design 11.4).</summary>
    public sealed class GradeDef
    {
        /// <summary>Creates a grade.</summary>
        public GradeDef(string id, double? minScorePoints, string titleKey) { Id = id; MinScorePoints = minScorePoints; TitleKey = titleKey; }
        /// <summary>Grade letter (<c>S</c>…<c>D</c>).</summary>
        public string Id { get; }
        /// <summary>Minimum score in points, or null for the lowest grade. game_value.</summary>
        public double? MinScorePoints { get; }
        /// <summary>String key of the title.</summary>
        public string TitleKey { get; }
    }

    /// <summary>An individual award (design 11.5).</summary>
    public sealed class AwardDef
    {
        /// <summary>Creates an award.</summary>
        public AwardDef(string id, string selection, string metric, string? role, IReadOnlyList<string> minigames)
        {
            Id = id; Selection = selection; Metric = metric; Role = role; Minigames = minigames;
        }
        /// <summary>Award ID (<c>best_callout</c>…).</summary>
        public string Id { get; }
        /// <summary><c>highest</c> (largest metric value wins) or <c>condition</c> (every player whose metric is true).</summary>
        public string Selection { get; }
        /// <summary>Name of the metric in <see cref="PlayerStats.Metrics"/>.</summary>
        public string Metric { get; }
        /// <summary>Role the winner must hold (<c>PM</c> for Budget Hawk), or null.</summary>
        public string? Role { get; }
        /// <summary>Minigames the metric is restricted to (documentation for the host), possibly empty.</summary>
        public IReadOnlyList<string> Minigames { get; }
    }

    /// <summary>A comparison of one contract criterion (design 8.5; <c>contract.schema.json</c> <c>objectives</c>).</summary>
    public sealed class Criterion
    {
        /// <summary>Creates a criterion.</summary>
        public Criterion(string metric, string op, double? value, double? tolerance, string? minigame)
        {
            Metric = metric; Op = op; Value = value; Tolerance = tolerance; Minigame = minigame;
        }
        /// <summary>Metric name looked up in the metrics dictionary (booleans are 1/0).</summary>
        public string Metric { get; }
        /// <summary><c>gte gt lte lt eq within is_true</c>.</summary>
        public string Op { get; }
        /// <summary>Comparison value in the unit of the metric; null for <c>is_true</c>.</summary>
        public double? Value { get; }
        /// <summary>Tolerance of <c>within</c>, in the unit of the metric.</summary>
        public double? Tolerance { get; }
        /// <summary>Minigame the criterion refers to, or null.</summary>
        public string? Minigame { get; }
    }

    /// <summary>Kind of a contract objective (design 5.2; <c>ObjectiveKind</c> of the protocol).</summary>
    public enum ObjectiveKind { Primary, Secondary, Stretch, Safety }

    /// <summary>One objective: all criteria must hold.</summary>
    public sealed class ObjectiveDef
    {
        /// <summary>Creates an objective.</summary>
        public ObjectiveDef(string id, ObjectiveKind kind, IReadOnlyList<Criterion> criteria) { Id = id; Kind = kind; Criteria = criteria; }
        /// <summary>Objective ID, unique within the contract.</summary>
        public string Id { get; }
        /// <summary>Primary, secondary, stretch or safety.</summary>
        public ObjectiveKind Kind { get; }
        /// <summary>Conditions that must all hold.</summary>
        public IReadOnlyList<Criterion> Criteria { get; }
    }

    /// <summary>The <c>objectives</c> block of one contract (design 5.2).</summary>
    public sealed class ContractObjectives
    {
        /// <summary>Creates the block.</summary>
        public ContractObjectives(string contractId, bool crewed, ObjectiveDef primary, IReadOnlyList<ObjectiveDef> secondary,
            ObjectiveDef? stretch, ObjectiveDef? safety)
        {
            ContractId = contractId; Crewed = crewed; Primary = primary; Secondary = secondary; Stretch = stretch; Safety = safety;
        }
        /// <summary>Contract ID.</summary>
        public string ContractId { get; }
        /// <summary>True when <c>requirements.crewed</c> is set: crew-safe points apply.</summary>
        public bool Crewed { get; }
        /// <summary>The primary objective.</summary>
        public ObjectiveDef Primary { get; }
        /// <summary>Two or three secondary objectives.</summary>
        public IReadOnlyList<ObjectiveDef> Secondary { get; }
        /// <summary>The stretch objective, or null.</summary>
        public ObjectiveDef? Stretch { get; }
        /// <summary>The crew-returns-safely objective of crewed contracts, or null.</summary>
        public ObjectiveDef? Safety { get; }
    }

    /// <summary>
    /// The scoring data of the game, loaded from <c>boosts.json</c>, <c>scoring.json</c>, <c>awards.json</c>,
    /// <c>assist_levels.json</c> and <c>contracts.json</c> (the <c>objectives</c> block only). Immutable. All numbers
    /// are game_value (design 19, "Score weights &amp; grades"). Reads its own fields so the lossy
    /// <see cref="GameCatalog.Boosts"/> is not needed.
    /// </summary>
    public sealed class ScoringCatalog
    {
        private readonly Dictionary<string, BoostRule> boostsById = new Dictionary<string, BoostRule>(StringComparer.Ordinal);
        private readonly Dictionary<string, TierDef> tiersById = new Dictionary<string, TierDef>(StringComparer.Ordinal);
        private readonly Dictionary<string, ContractObjectives> objectivesById = new Dictionary<string, ContractObjectives>(StringComparer.Ordinal);

        private ScoringCatalog(IReadOnlyList<TierDef> tiers, IReadOnlyList<BoostRule> boosts, TeamSyncDef teamSync,
            IReadOnlyList<ScoreComponentDef> components, IReadOnlyList<GradeDef> grades, string crewLostGrade,
            IReadOnlyList<AwardDef> awards, int minAwardsPerPlayer, bool awardsPositiveOnly,
            IReadOnlyDictionary<string, double> assistMultipliers, IReadOnlyList<ContractObjectives> objectives,
            int cosmeticMinSuccesses, double scoreBoostCap)
        {
            Tiers = tiers; Boosts = boosts; TeamSync = teamSync; Components = components; Grades = grades;
            CrewLostGrade = crewLostGrade; Awards = awards; MinAwardsPerPlayer = minAwardsPerPlayer;
            AwardsPositiveOnly = awardsPositiveOnly; AssistScoreMultipliers = assistMultipliers; Objectives = objectives;
            CosmeticMinSuccesses = cosmeticMinSuccesses; ScoreBoostCap = scoreBoostCap;
            foreach (var b in boosts) boostsById[b.Id] = b;
            foreach (var t in tiers) tiersById[t.Id] = t;
            foreach (var o in objectives) objectivesById[o.ContractId] = o;
        }

        /// <summary>Tier rows (bronze → platinum) in data order.</summary>
        public IReadOnlyList<TierDef> Tiers { get; }
        /// <summary>The 11 boosts of design 10.4 in data order.</summary>
        public IReadOnlyList<BoostRule> Boosts { get; }
        /// <summary>Team Sync meter data.</summary>
        public TeamSyncDef TeamSync { get; }
        /// <summary>Score components in data order.</summary>
        public IReadOnlyList<ScoreComponentDef> Components { get; }
        /// <summary>Grades S → D in data order.</summary>
        public IReadOnlyList<GradeDef> Grades { get; }
        /// <summary>Grade given when the crew is lost (design 5.2).</summary>
        public string CrewLostGrade { get; }
        /// <summary>Awards in the list order of design 11.5.</summary>
        public IReadOnlyList<AwardDef> Awards { get; }
        /// <summary>Awards every player must receive at least. game_value: 1.</summary>
        public int MinAwardsPerPlayer { get; }
        /// <summary>True when awards are positive only (no last place).</summary>
        public bool AwardsPositiveOnly { get; }
        /// <summary>Difficulty multiplier per assist-level ID (unitless): cadet 0.8, engineer 1.0, flight_director 1.25.</summary>
        public IReadOnlyDictionary<string, double> AssistScoreMultipliers { get; }
        /// <summary>Objectives of every contract.</summary>
        public IReadOnlyList<ContractObjectives> Objectives { get; }
        /// <summary>Successes needed for the cosmetic sparkle below Bronze (<c>below_bronze.cosmetic_min_successes</c>).</summary>
        public int CosmeticMinSuccesses { get; }
        /// <summary>Cap on the Score Multiplier boost (unitless), from <c>scoring.json</c> multipliers.</summary>
        public double ScoreBoostCap { get; }

        /// <summary>Boost by ID, or null.</summary>
        public BoostRule? Boost(string id) => boostsById.TryGetValue(id, out var b) ? b : null;

        /// <summary>Tier row by ID (<c>bronze</c>…), or null.</summary>
        public TierDef? Tier(string id) => tiersById.TryGetValue(id, out var t) ? t : null;

        /// <summary>Objectives of a contract, or null when the contract is unknown.</summary>
        public ContractObjectives? ObjectivesFor(string contractId) =>
            objectivesById.TryGetValue(contractId, out var o) ? o : null;

        /// <summary>Component by ID, or null.</summary>
        public ScoreComponentDef? Component(string id)
        {
            foreach (var c in Components) if (c.Id == id) return c;
            return null;
        }

        /// <summary>Points of a term of a component; throws when data lacks it.</summary>
        public double Points(string componentId, string termId) =>
            (Component(componentId) ?? throw new CatalogException($"scoring.json: no component '{componentId}'."))
            .Term(termId)?.Points ?? throw new CatalogException($"scoring.json: component '{componentId}' has no term '{termId}'.");

        /// <summary>
        /// Loads the five files. Keys are paths relative to <c>data/</c> (a leading <c>data/</c> and backslashes are
        /// accepted), as in <see cref="CatalogLoader.Load"/>.
        /// </summary>
        /// <exception cref="CatalogException">A file is missing or malformed; the message names the file.</exception>
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

            var boostsRoot = Root(named, "boosts.json");
            var scoringRoot = Root(named, "scoring.json");
            var awardsRoot = Root(named, "awards.json");
            var assistRoot = Root(named, "assist_levels.json");
            var contractsRoot = Root(named, "contracts.json");

            // ---- boosts.json
            const string bf = "boosts.json";
            var tiers = new List<TierDef>();
            foreach (var t in Arr(boostsRoot, "tiers", bf))
            {
                var o = Obj(t, bf, "tiers entry");
                tiers.Add(new TierDef(ReqStr(o, "id", bf), ReqNum(o, "min_fraction", bf), Bool(o, "requires_all_perfect"), ReqStr(o, "boost_tier", bf)));
            }
            if (tiers.Count == 0) throw new CatalogException($"{bf}: 'tiers' is empty.");
            foreach (var t in tiers)
            {
                if (!IsTierId(t.Id) || !IsTierId(t.BoostTier)) throw new CatalogException($"{bf}: tier '{t.Id}' (boost_tier '{t.BoostTier}') is not one of bronze, silver, gold, platinum.");
            }
            var below = boostsRoot["below_bronze"] as JObject ?? throw new CatalogException($"{bf}: missing 'below_bronze'.");
            var cosmeticMin = (int)ReqNum(below, "cosmetic_min_successes", bf);
            var boosts = new List<BoostRule>();
            var seen = new HashSet<string>(StringComparer.Ordinal);
            foreach (var b in Arr(boostsRoot, "boosts", bf))
            {
                var o = Obj(b, bf, "boosts entry");
                var id = ReqStr(o, "id", bf);
                if (!seen.Add(id)) throw new CatalogException($"{bf}: boost '{id}' is defined twice.");
                boosts.Add(ReadBoost(bf, id, o));
            }

            // ---- scoring.json
            const string sf = "scoring.json";
            var ts = scoringRoot["team_sync"] as JObject ?? throw new CatalogException($"{sf}: missing 'team_sync'.");
            var gains = new Dictionary<string, double>(StringComparer.Ordinal);
            var gainsObj = ts["gains"] as JObject ?? throw new CatalogException($"{sf}: team_sync is missing 'gains'.");
            foreach (var p in gainsObj.Properties()) gains[p.Name] = Number(p.Value, sf, "team_sync.gains." + p.Name);
            foreach (var need in new[] { "gold", "silver", "bronze", "good_call" })
                if (!gains.ContainsKey(need)) throw new CatalogException($"{sf}: team_sync.gains has no '{need}'.");
            var moments = new List<SyncMomentDef>();
            foreach (var m in Arr(ts, "moments", sf))
            {
                var o = Obj(m, sf, "moments entry");
                double mult = 1;
                if (o["params"] is JObject pm && pm["score_multiplier_next_phase"] is JToken mv) mult = Number(mv, sf, "moments.params");
                moments.Add(new SyncMomentDef(ReqStr(o, "id", sf), ReqStr(o, "flag", sf), mult));
            }
            if (moments.Count != 3) throw new CatalogException($"{sf}: team_sync needs exactly 3 moments, found {moments.Count}.");
            var teamSync = new TeamSyncDef(ReqNum(ts, "meter_max", sf), gains, ReqNum(ts, "choice_vote_s", sf), moments);

            var components = new List<ScoreComponentDef>();
            foreach (var c in Arr(scoringRoot, "components", sf))
            {
                var o = Obj(c, sf, "components entry");
                var terms = new List<ScoreTerm>();
                foreach (var t in Arr(o, "terms", sf))
                {
                    var to = Obj(t, sf, "terms entry");
                    terms.Add(new ScoreTerm(ReqStr(to, "id", sf), ReqStr(to, "kind", sf), ReqNum(to, "points", sf), Str(to, "tier")));
                }
                components.Add(new ScoreComponentDef(ReqStr(o, "id", sf), terms));
            }
            double boostCap = 1.5;
            foreach (var m in Arr(scoringRoot, "multipliers", sf))
            {
                var o = Obj(m, sf, "multipliers entry");
                if (Str(o, "id") == "score_boosts" && o["cap"] is JToken cap) boostCap = Number(cap, sf, "multipliers.cap");
            }
            var grades = new List<GradeDef>();
            foreach (var g in Arr(scoringRoot, "grades", sf))
            {
                var o = Obj(g, sf, "grades entry");
                grades.Add(new GradeDef(ReqStr(o, "id", sf), o["min_score"] is JToken ms ? Number(ms, sf, "grades.min_score") : (double?)null, ReqStr(o, "title_key", sf)));
            }
            if (grades.Count == 0 || grades[grades.Count - 1].MinScorePoints != null)
                throw new CatalogException($"{sf}: the last grade must have no min_score.");
            var crewLost = ReqStr(scoringRoot, "crew_lost_grade", sf);

            // ---- awards.json
            const string af = "awards.json";
            var rules = awardsRoot["rules"] as JObject ?? throw new CatalogException($"{af}: missing 'rules'.");
            var awards = new List<AwardDef>();
            foreach (var a in Arr(awardsRoot, "awards", af))
            {
                var o = Obj(a, af, "awards entry");
                var mg = new List<string>();
                if (o["minigames"] is JArray ma) foreach (var x in ma) mg.Add((string?)x ?? throw new CatalogException($"{af}: minigames entry is not a string."));
                awards.Add(new AwardDef(ReqStr(o, "id", af), ReqStr(o, "selection", af), ReqStr(o, "metric", af), Str(o, "role"), mg));
            }

            // ---- assist_levels.json
            const string lf = "assist_levels.json";
            var assist = new Dictionary<string, double>(StringComparer.Ordinal);
            foreach (var l in Arr(assistRoot, "assist_levels", lf))
            {
                var o = Obj(l, lf, "assist_levels entry");
                assist[ReqStr(o, "id", lf)] = ReqNum(o, "score_multiplier", lf);
            }

            // ---- contracts.json (objectives only)
            const string cf = "contracts.json";
            var objectives = new List<ContractObjectives>();
            foreach (var c in Arr(contractsRoot, "contracts", cf))
            {
                var o = Obj(c, cf, "contracts entry");
                var cid = ReqStr(o, "id", cf);
                var ob = o["objectives"] as JObject ?? throw new CatalogException($"{cf}: contract '{cid}' has no 'objectives'.");
                var primary = ReadObjective(cf, cid, ObjectiveKind.Primary, ob["primary"] as JObject
                    ?? throw new CatalogException($"{cf}: contract '{cid}' has no primary objective."));
                var secondary = new List<ObjectiveDef>();
                foreach (var s in Arr(ob, "secondary", cf)) secondary.Add(ReadObjective(cf, cid, ObjectiveKind.Secondary, Obj(s, cf, cid + " secondary")));
                var stretch = ob["stretch"] is JObject so ? ReadObjective(cf, cid, ObjectiveKind.Stretch, so) : null;
                var safety = ob["safety"] is JObject sa ? ReadObjective(cf, cid, ObjectiveKind.Safety, sa) : null;
                var crewed = o["requirements"] is JObject rq && Bool(rq, "crewed");
                objectives.Add(new ContractObjectives(cid, crewed, primary, secondary, stretch, safety));
            }

            return new ScoringCatalog(tiers, boosts, teamSync, components, grades, crewLost, awards,
                (int)ReqNum(rules, "min_awards_per_player", af), Bool(rules, "positive_only"), assist, objectives, cosmeticMin, boostCap);
        }

        // ------------------------------------------------------------------ readers

        private static BoostRule ReadBoost(string file, string id, JObject o)
        {
            var kind = ReqStr(o, "kind", file) switch
            {
                "effect" => BoostKind.Effect,
                "shield" => BoostKind.Shield,
                var k => throw new CatalogException($"{file}: boost '{id}' has unknown kind '{k}'."),
            };
            var op = BoostOp.Add;
            if (kind == BoostKind.Effect)
                op = ReqStr(o, "op", file) switch
                {
                    "add" => BoostOp.Add,
                    "add_fraction" => BoostOp.AddFraction,
                    "mul" => BoostOp.Mul,
                    var x => throw new CatalogException($"{file}: boost '{id}' has unknown op '{x}'."),
                };
            var values = new Dictionary<string, double>(StringComparer.Ordinal);
            var shields = new Dictionary<string, string>(StringComparer.Ordinal);
            var tiers = o["tiers"] as JObject ?? throw new CatalogException($"{file}: boost '{id}' has no 'tiers'.");
            foreach (var p in tiers.Properties())
            {
                if (p.Value.Type == JTokenType.Null) continue;
                var cell = p.Value as JObject ?? throw new CatalogException($"{file}: boost '{id}' tier '{p.Name}' is not an object.");
                if (kind == BoostKind.Shield) shields[p.Name] = ReqStr(cell, "shield", file);
                else values[p.Name] = ReqNum(cell, "value", file);
            }
            double? capValue = null;
            string? capKind = null;
            if (o["cap"] is JObject cap)
            {
                capValue = ReqNum(cap, "value", file);
                capKind = ReqStr(cap, "kind", file);
            }
            return new BoostRule(id, kind, Str(o, "target"), op, values, shields, capValue, capKind,
                ReqStr(o, "phase", file), Bool(o, "crewed_only"), ReqStr(o, "scope", file));
        }

        private static ObjectiveDef ReadObjective(string file, string contractId, ObjectiveKind kind, JObject o)
        {
            var id = ReqStr(o, "id", file);
            var list = new List<Criterion>();
            foreach (var c in Arr(o, "criteria", file))
            {
                var co = Obj(c, file, contractId + " criteria");
                var op = ReqStr(co, "op", file);
                if (Array.IndexOf(CriterionOps, op) < 0) throw new CatalogException($"{file}: contract '{contractId}' objective '{id}' has unknown op '{op}'.");
                var value = Num(co, "value");
                var tolerance = Num(co, "tolerance");
                if (op != "is_true" && value == null) throw new CatalogException($"{file}: contract '{contractId}' objective '{id}': op '{op}' needs a 'value'.");
                if (op == "within" && tolerance == null) throw new CatalogException($"{file}: contract '{contractId}' objective '{id}': op 'within' needs a 'tolerance'.");
                list.Add(new Criterion(ReqStr(co, "metric", file), op, value, tolerance, Str(co, "minigame")));
            }
            return new ObjectiveDef(id, kind, list);
        }

        private static bool IsTierId(string id) => id == "bronze" || id == "silver" || id == "gold" || id == "platinum";

        internal static readonly string[] CriterionOps = { "gte", "gt", "lte", "lt", "eq", "within", "is_true" };

        // ------------------------------------------------------------------ JSON helpers

        private static JObject Root(Dictionary<string, string> named, string file)
        {
            if (!named.TryGetValue(file, out var text)) throw new CatalogException($"{file}: file is missing.");
            try
            {
                return JObject.Parse(text);
            }
            catch (Exception e) when (e is Newtonsoft.Json.JsonException || e is ArgumentException)
            {
                throw new CatalogException($"{file}: malformed JSON ({e.Message}).", e);
            }
        }

        private static JArray Arr(JObject o, string name, string file) =>
            o[name] as JArray ?? throw new CatalogException($"{file}: missing array '{name}'.");

        private static JObject Obj(JToken t, string file, string what) =>
            t as JObject ?? throw new CatalogException($"{file}: {what} is not an object.");

        private static bool IsNumber(JToken t) => t.Type == JTokenType.Integer || t.Type == JTokenType.Float;

        private static double Number(JToken t, string file, string what) =>
            IsNumber(t) ? t.Value<double>() : throw new CatalogException($"{file}: {what} is not a number.");

        private static string? Str(JObject o, string name) => o[name] is JToken t && t.Type == JTokenType.String ? (string)t! : null;

        private static string ReqStr(JObject o, string name, string file) =>
            Str(o, name) ?? throw new CatalogException($"{file}: missing string '{name}'.");

        private static double? Num(JObject o, string name) => o[name] is JToken t && IsNumber(t) ? t.Value<double>() : (double?)null;

        private static double ReqNum(JObject o, string name, string file) =>
            Num(o, name) ?? throw new CatalogException(string.Format(CultureInfo.InvariantCulture, "{0}: missing number '{1}'.", file, name));

        private static bool Bool(JObject o, string name) => o[name] is JToken t && t.Type == JTokenType.Boolean && t.Value<bool>();
    }
}
