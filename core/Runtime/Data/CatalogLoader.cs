#nullable enable
using System;
using System.Collections.Generic;
using System.Globalization;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

namespace MissionForge.Core.Data
{
    /// <summary>
    /// Builds a <see cref="GameCatalog"/> from the JSON text of the <c>data/</c> files (schemas in
    /// <c>data/schema/</c>). Pure: the caller reads the files and passes their text, keyed by path relative to
    /// <c>data/</c> (for example <c>parts/first_stage_engine.json</c>, <c>contracts.json</c>,
    /// <c>strings/en.json</c>). This is the unit boundary: data units (kN, t, km/s) become SI (N, kg, m/s) in
    /// <see cref="PartStats"/>, and part modifiers become the derived stats the build rules read.
    /// </summary>
    public static class CatalogLoader
    {
        /// <summary>
        /// Weight multiplier of an anomaly trigger whose data gives no <c>weight_mult</c>
        /// ("higher for…", "more often"). game_value (decision).
        /// </summary>
        public const double DefaultTriggerMultiplier = 2.0;

        /// <summary>Weight multiplier of a <c>rare</c> anomaly trigger without <c>weight_mult</c>. game_value (decision).</summary>
        public const double RareTriggerMultiplier = 0.25;

        /// <summary>Probability that a test reveals a hidden flaw in the tested part when data gives none. game_value (decision).</summary>
        public const double DefaultRevealChance = 0.8;

        /// <summary>Days per month for launch-window intervals given in months. physical (365.25 / 12).</summary>
        public const double DaysPerMonth = 365.25 / 12.0;

        /// <summary>
        /// Loads every known file in <paramref name="files"/>. Unknown files (facts, minigames, codex…) are ignored.
        /// </summary>
        /// <param name="files">File text keyed by path relative to <c>data/</c>; a leading <c>data/</c> and backslashes are accepted.</param>
        /// <param name="language">Language of the strings files to merge (<c>strings/&lt;language&gt;*.json</c>).</param>
        /// <param name="lenient">
        /// When true, references to parts that do not exist yet (vote options, part rules) are dropped and listed in
        /// <see cref="GameCatalog.Warnings"/> instead of failing. Use while the catalog is still being written.
        /// </param>
        /// <exception cref="CatalogException">Malformed JSON, a missing required field, a duplicate ID or (strict mode) a bad reference. The message names the file.</exception>
        public static GameCatalog Load(IReadOnlyDictionary<string, string> files, string language = "en", bool lenient = false)
        {
            if (files == null) throw new ArgumentNullException(nameof(files));
            var warnings = new List<string>();
            var named = new SortedDictionary<string, string>(StringComparer.Ordinal);
            foreach (var kv in files)
            {
                var key = kv.Key.Replace('\\', '/');
                if (key.StartsWith("data/", StringComparison.Ordinal)) key = key.Substring(5);
                named[key] = kv.Value;
            }

            // ---- strings first, so names and explanations can be resolved
            var strings = new Dictionary<string, string>(StringComparer.Ordinal);
            foreach (var kv in named)
            {
                if (!kv.Key.StartsWith("strings/", StringComparison.Ordinal)) continue;
                var name = kv.Key.Substring(8);
                if (!(name == language + ".json" || name.StartsWith(language + ".", StringComparison.Ordinal))) continue;
                var root = Parse(kv.Key, kv.Value);
                foreach (var p in root.Properties())
                {
                    if (p.Name.StartsWith("$", StringComparison.Ordinal)) continue;
                    if (p.Value.Type != JTokenType.String) continue;
                    if (strings.ContainsKey(p.Name)) throw new CatalogException($"{kv.Key}: string key '{p.Name}' is defined twice.");
                    strings[p.Name] = (string)p.Value!;
                }
            }

            // ---- parts
            var parts = new List<PartDef>();
            var ratios = new Dictionary<string, double>(StringComparer.Ordinal);
            foreach (var kv in named)
            {
                if (!kv.Key.StartsWith("parts/", StringComparison.Ordinal) || !kv.Key.EndsWith(".json", StringComparison.Ordinal)) continue;
                var root = Parse(kv.Key, kv.Value);
                var fileCategory = Str(root, "category") ?? throw new CatalogException($"{kv.Key}: missing 'category'.");
                var expected = kv.Key.Substring(6, kv.Key.Length - 6 - 5);
                if (fileCategory != expected)
                    throw new CatalogException($"{kv.Key}: category '{fileCategory}' does not match the file name.");
                if (root["category_params"] is JObject cp && cp["structural_ratio_by_propellant"] is JObject sr)
                    foreach (var p in sr.Properties())
                        if (IsNumber(p.Value)) ratios[Propellants.Normalize(p.Name)] = p.Value.Value<double>();
                if (!(root["parts"] is JArray arr)) throw new CatalogException($"{kv.Key}: missing 'parts' array.");
                foreach (var t in arr)
                {
                    if (!(t is JObject po)) throw new CatalogException($"{kv.Key}: a parts entry is not an object.");
                    parts.Add(ReadPart(kv.Key, fileCategory, po, strings));
                }
            }
            var partIds = new HashSet<string>(StringComparer.Ordinal);
            foreach (var p in parts) partIds.Add(p.Id);

            // ---- contracts
            var contracts = new List<ContractDef>();
            if (named.TryGetValue("contracts.json", out var contractsText))
            {
                var root = Parse("contracts.json", contractsText);
                foreach (var c in Array(root, "contracts", "contracts.json"))
                    contracts.Add(ReadContract("contracts.json", (JObject)c, strings, partIds, lenient, warnings));
            }

            // ---- tests
            var tests = new List<TestDef>();
            if (named.TryGetValue("tests.json", out var testsText))
                foreach (var t in Array(Parse("tests.json", testsText), "tests", "tests.json"))
                    tests.Add(ReadTest("tests.json", (JObject)t, strings));

            // ---- anomalies
            var anomalies = new List<AnomalyDef>();
            int? minVotes = null, maxVotes = null;
            if (named.TryGetValue("anomalies.json", out var anomaliesText))
            {
                var root = Parse("anomalies.json", anomaliesText);
                if (root["draw"] is JObject draw)
                {
                    minVotes = (int?)Num(draw, "min_votes_between");
                    maxVotes = (int?)Num(draw, "max_votes_between");
                }
                foreach (var a in Array(root, "anomalies", "anomalies.json"))
                    anomalies.Add(ReadAnomaly("anomalies.json", (JObject)a, strings));
            }

            // ---- roles, boosts, validation rules
            var roles = new List<RoleDef>();
            if (named.TryGetValue("roles.json", out var rolesText))
                foreach (var r in Array(Parse("roles.json", rolesText), "roles", "roles.json"))
                {
                    var ro = (JObject)r;
                    roles.Add(new RoleDef
                    {
                        Id = ReqStr(ro, "id", "roles.json"),
                        Name = Text(strings, Str(ro, "name_key")) ?? ReqStr(ro, "id", "roles.json"),
                        AbilityId = ro["ability"] is JObject ab ? Str(ab, "id") ?? "" : "",
                    });
                }

            var boosts = new List<BoostDef>();
            if (named.TryGetValue("boosts.json", out var boostsText))
                foreach (var b in Array(Parse("boosts.json", boostsText), "boosts", "boosts.json"))
                    boosts.Add(ReadBoost("boosts.json", (JObject)b, strings));

            var rules = new List<ValidationRuleDef>();
            if (named.TryGetValue("validation_rules.json", out var rulesText))
                foreach (var r in Array(Parse("validation_rules.json", rulesText), "rules", "validation_rules.json"))
                    rules.Add(ReadRule("validation_rules.json", (JObject)r, strings));

            // ---- cross-references the catalog constructor does not know about
            var anomalyIds = new HashSet<string>(StringComparer.Ordinal);
            foreach (var a in anomalies) anomalyIds.Add(a.Id);
            var testIds = new HashSet<string>(StringComparer.Ordinal);
            foreach (var t in tests) testIds.Add(t.Id);
            foreach (var p in parts)
            {
                foreach (var r in p.Rules)
                {
                    foreach (var other in r.Parts)
                        if (!partIds.Contains(other))
                            Problem(lenient, warnings, $"part '{p.Id}' rule '{r.Kind}' refers to unknown part '{other}'.");
                    if (r.Anomaly != null && anomalies.Count > 0 && !anomalyIds.Contains(r.Anomaly))
                        Problem(lenient, warnings, $"part '{p.Id}' rule '{r.Kind}' refers to unknown anomaly '{r.Anomaly}'.");
                    if (r.Test != null && tests.Count > 0 && !testIds.Contains(r.Test))
                        Problem(lenient, warnings, $"part '{p.Id}' rule '{r.Kind}' refers to unknown test '{r.Test}'.");
                }
                if (contracts.Count > 0)
                    foreach (var cid in p.Contracts)
                    {
                        var known = false;
                        foreach (var c in contracts) if (c.Id == cid) known = true;
                        if (!known) warnings.Add($"part '{p.Id}' lists contract '{cid}', which is not loaded yet.");
                    }
            }
            GameCatalog catalog;
            try
            {
                catalog = new GameCatalog(parts, contracts, tests, anomalies, roles, boosts, rules);
            }
            catch (CatalogException e)
            {
                throw new CatalogException("data/: " + e.Message, e);
            }
            catalog.StructuralRatios = ratios;
            catalog.AnomalyMinVotesBetween = minVotes;
            catalog.AnomalyMaxVotesBetween = maxVotes;
            catalog.Strings = strings;
            catalog.Warnings = warnings;
            return catalog;
        }

        // ------------------------------------------------------------------ parts

        private static PartDef ReadPart(string file, string fileCategory, JObject j, IReadOnlyDictionary<string, string> strings)
        {
            var id = ReqStr(j, "id", file);
            var where = $"{file}: part '{id}'";
            var category = Str(j, "category") ?? fileCategory;
            if (category != fileCategory) throw new CatalogException($"{where} has category '{category}' in a '{fileCategory}' file.");

            var numbers = new Dictionary<string, double>(StringComparer.Ordinal);
            var text = new Dictionary<string, string>(StringComparer.Ordinal);
            var tags = new List<string>();
            string? propellant = null;
            if (j["stats"] is JObject stats)
            {
                foreach (var p in stats.Properties())
                {
                    switch (p.Value.Type)
                    {
                        case JTokenType.Integer:
                        case JTokenType.Float:
                            numbers[p.Name] = p.Value.Value<double>();
                            break;
                        case JTokenType.Boolean:
                            text[p.Name] = p.Value.Value<bool>() ? "true" : "false";
                            break;
                        case JTokenType.String:
                            if (p.Name == "propellant") propellant = (string)p.Value!;
                            else text[p.Name] = (string)p.Value!;
                            break;
                    }
                }
            }

            // Mass of one unit, kg (data: mass_t, mass_kg; boosters mass_each_t; a capsule adds its service module).
            double massKg = 0;
            if (numbers.TryGetValue("mass_t", out var mt)) massKg = mt * 1000.0;
            else if (numbers.TryGetValue("mass_kg", out var mk)) massKg = mk;
            else if (numbers.TryGetValue("mass_each_t", out var me)) massKg = me * 1000.0;
            if (numbers.TryGetValue("service_module_mass_t", out var sm)) massKg += sm * 1000.0;

            if (category == PartCategories.EscapeSystem && text.TryGetValue("carried_all_flight", out var carried) && carried == "false")
                tags.Add("jettison_at_staging");
            if (category == PartCategories.StrapOnBooster && text.TryGetValue("mirrors_first_stage", out var mirrors) && mirrors == "true")
                tags.Add("mirror_first_stage");

            // game block
            var game = j["game"] as JObject;
            double costM = game != null ? Num(game, "cost_M") ?? 0 : 0;
            double lead = game != null ? Num(game, "lead_days") ?? 0 : 0;
            double integ = game != null ? Num(game, "integ_days") ?? 0 : 0;
            double? reliability = game != null ? Num(game, "reliability") : null;
            var maturity = ParseMaturity(game != null ? Str(game, "maturity") : null, where);

            if (category == PartCategories.StrapOnBooster)
            {
                // Build rules multiply a booster option's cost by its booster count: store the cost of one booster.
                var count = numbers.TryGetValue("booster_count", out var bc) ? bc : 0;
                if (numbers.TryGetValue("cost_each_M", out var each)) costM = each;
                else if (count > 0) costM /= count;
            }

            // modifiers → derived stats read by the build rules
            var modifiers = new List<ModifierDef>();
            if (j["modifiers"] is JArray mods)
            {
                foreach (var t in mods)
                {
                    if (!(t is JObject mo)) continue;
                    var target = ReqStr(mo, "target", where);
                    var op = ReqStr(mo, "op", where);
                    var value = Num(mo, "value") ?? throw new CatalogException($"{where}: modifier '{target}' has no value.");
                    var scope = Str(mo, "scope");
                    modifiers.Add(new ModifierDef(target, op, value, scope, Str(mo, "condition")));
                    ApplyModifier(numbers, ref massKg, target, op, value, scope);
                }
            }

            // rules
            var rules = new List<PartRuleDef>();
            var anomalyWeights = new Dictionary<string, double>(StringComparer.Ordinal);
            if (j["rules"] is JArray rarr)
            {
                foreach (var t in rarr)
                {
                    if (!(t is JObject ro)) continue;
                    var kind = ReqStr(ro, "kind", where);
                    var rule = new PartRuleDef { Kind = kind };
                    switch (kind)
                    {
                        case "requires_part":
                        case "incompatible_with_part":
                            rule.Parts = new[] { ReqStr(ro, "part", where) };
                            break;
                        case "requires_any_part":
                            rule.Parts = Strings(ro, "parts");
                            break;
                        case "anomaly_weight":
                            rule.Anomaly = ReqStr(ro, "anomaly", where);
                            rule.WeightMult = Num(ro, "weight_mult");
                            anomalyWeights[rule.Anomaly] = rule.WeightMult ?? PartDef.DefaultAnomalyWeightMultiplier;
                            break;
                        case "enables_minigame":
                            rule.Minigame = Str(ro, "minigame");
                            break;
                        case "test_mitigates_failure_mode":
                            rule.FailureMode = Str(ro, "failure_mode");
                            rule.Test = Str(ro, "test");
                            rule.WithPropellant = Str(ro, "with_propellant");
                            break;
                        case "recommends_test":
                            rule.Test = Str(ro, "test");
                            break;
                        case "flag":
                            rule.Flag = ReqStr(ro, "flag", where);
                            if (!tags.Contains(rule.Flag)) tags.Add(rule.Flag);
                            break;
                    }
                    rules.Add(rule);
                }
            }

            var valueTypes = new Dictionary<string, string>(StringComparer.Ordinal);
            if (j["value_types"] is JObject vt)
                foreach (var p in vt.Properties())
                    if (p.Value.Type == JTokenType.String) valueTypes[p.Name] = (string)p.Value!;

            var nameKey = Str(j, "name_key");
            var part = new PartDef(id, category, Text(strings, nameKey) ?? id, massKg, costM, lead, integ, reliability, maturity,
                new PartStats(numbers, text), propellant, Strings(j, "contracts"), tags, Strings(j, "failure_modes"),
                Str(j, "twin"), valueTypes, anomalyWeights)
            {
                Modifiers = modifiers,
                Rules = rules,
                NameKey = nameKey,
            };
            return part;
        }

        /// <summary>
        /// Maps one data modifier onto the derived stats the build rules read (see <see cref="PartStats"/>).
        /// Modifiers the build phase does not use (guidance precision, landing ellipse, heat margin…) are only kept
        /// in <see cref="PartDef.Modifiers"/>.
        /// </summary>
        private static void ApplyModifier(Dictionary<string, double> n, ref double massKg, string target, string op, double value, string? scope)
        {
            void Mul(string key) => n[key] = (n.TryGetValue(key, out var x) ? x : 1.0) * value;
            void Add(string key, double v) => n[key] = (n.TryGetValue(key, out var x) ? x : 0.0) + v;
            switch (target)
            {
                case "dry_mass_t":
                    if (op == "mul") Mul("dry_mass_multiplier");
                    else if (op == "add_fraction") Add("dry_mass_multiplier_fraction", value);
                    else if (op == "add") massKg += value * 1000.0;
                    break;
                case "cost_M":
                    if (op == "mul") Mul("cost_multiplier");
                    else if (op == "add_fraction") Add("cost_fraction", value);
                    else if (op == "add") Add("extra_cost_M", value);
                    break;
                case "schedule_days":
                    if (op == "add_fraction") Add("days_fraction", value);
                    else if (op == "add") Add("extra_integ_days", value); // serial days on the launch date (decision)
                    break;
                case "lead_days":
                    if (op == "add") Add("extra_lead_days", value);
                    break;
                case "integ_days":
                    if (op == "add") Add("extra_integ_days", value);
                    break;
                case "uncertainty_band":
                    if (op == "mul") Mul("band_scale");
                    break;
                case "reliability":
                    if (op == "add") Add(scope == "all_parts" ? "reliability_bonus" : "reliability_modifier", value);
                    break;
                case "delta_v_m_s":
                    if (op == "add_fraction")
                    {
                        if (value < 0) Add("dv_cost_fraction", -value); // booster recovery reserve
                        else Add("dv_bonus_fraction", value);           // hot staging
                    }
                    break;
                case "cost_refund_fraction":
                    n["refund_fraction"] = value;
                    break;
            }
        }

        private static Maturity ParseMaturity(string? s, string where) => s switch
        {
            null => Maturity.Proven, // data omits maturity where the design gives none: narrowest band (decision)
            "proven" => Maturity.Proven,
            "mature" => Maturity.Mature,
            "new" => Maturity.New,
            _ => throw new CatalogException($"{where}: unknown maturity '{s}'."),
        };

        // ------------------------------------------------------------------ contracts

        private static ContractDef ReadContract(string file, JObject j, IReadOnlyDictionary<string, string> strings,
            HashSet<string> partIds, bool lenient, List<string> warnings)
        {
            var id = ReqStr(j, "id", file);
            var where = $"{file}: contract '{id}'";
            var payload = j["payload"] as JObject ?? throw new CatalogException($"{where}: missing 'payload'.");
            var payloadKg = (Num(payload, "mass_kg") ?? throw new CatalogException($"{where}: payload has no mass_kg."))
                            * (Num(payload, "count") ?? 1);
            var dvKmS = Num(j, "delta_v_required_km_s") ?? throw new CatalogException($"{where}: missing delta_v_required_km_s.");
            var budget = Num(j, "budget_M") ?? throw new CatalogException($"{where}: missing budget_M.");
            var schedule = Num(j, "schedule_days") ?? throw new CatalogException($"{where}: missing schedule_days.");
            var dest = j["destination"] as JObject;
            var req = j["requirements"] as JObject ?? new JObject();

            var votes = new List<ContractVote>();
            foreach (var t in Array(j, "votes", where))
            {
                var vo = (JObject)t;
                var category = ReqStr(vo, "category", where);
                var slot = Str(vo, "id");
                var stage = Str(vo, "stage");
                var options = new List<string>();
                foreach (var o in Strings(vo, "options"))
                {
                    if (partIds.Contains(o)) { options.Add(o); continue; }
                    var msg = $"{where} vote '{slot ?? category}' offers unknown part '{o}'.";
                    if (lenient) warnings.Add(msg); else throw new CatalogException(msg);
                }
                votes.Add(new ContractVote(category, options, slot, stage, (int)(Num(vo, "step") ?? 0)));
            }

            var restartsMin = Num(req, "upper_stage_restarts_min");
            var windowMonths = Num(req, "launch_window_interval_months");
            var crewed = Bool(req, "crewed") || Bool(req, "launch_escape_required");
            var entry = Num(req, "entry_speed_km_s");
            return new ContractDef(
                id, Text(strings, Str(j, "name_key")) ?? id, payloadKg, dvKmS * 1000.0, budget, schedule, votes,
                inclinationDeg: dest != null ? Num(dest, "inclination_deg") : null,
                crewed: crewed,
                returning: Bool(req, "payload_returns"),
                entrySpeedMps: entry.HasValue ? entry.Value * 1000.0 : (double?)null,
                requiredUpperStageStarts: restartsMin.HasValue ? (int)restartsMin.Value + 1 : 1,
                longCoast: Bool(req, "long_coast"),
                science: Bool(req, "science_scoring"),
                launchWindowIntervalDays: windowMonths.HasValue ? windowMonths.Value * DaysPerMonth : 30,
                boosterLandingRequired: Bool(req, "booster_landing_required"),
                destination: dest != null ? Str(dest, "type") : null);
        }

        // ------------------------------------------------------------------ tests

        private static TestDef ReadTest(string file, JObject j, IReadOnlyDictionary<string, string> strings)
        {
            var id = ReqStr(j, "id", file);
            var appliesTo = new List<string> { ReqStr(j, "applies_to_scope", file) };
            foreach (var c in Strings(j, "applies_to_categories")) if (!appliesTo.Contains(c)) appliesTo.Add(c);
            var t = new TestDef
            {
                Id = id,
                Name = Text(strings, Str(j, "name_key")) ?? id,
                AppliesTo = appliesTo,
                Days = Num(j, "days") ?? 0,
                RevealChance = DefaultRevealChance,
            };
            if (Num(j, "cost_fraction_of_part") is double f) { t.CostKind = TestCostKind.PartFraction; t.CostPartFraction = f; }
            else if (Num(j, "cost_min_M") is double lo) { t.CostKind = TestCostKind.StageScaled; t.CostM = lo; t.CostMaxM = Num(j, "cost_max_M") ?? lo; }
            else { t.CostKind = TestCostKind.Fixed; t.CostM = Num(j, "cost_M") ?? 0; }

            double band = 1.0, bonus = 0;
            foreach (var e in Effects(j, "effects"))
            {
                if (e.target == "uncertainty_band" && e.op == "mul") band *= e.value;
                else if (e.target == "reliability" && e.op == "add") bonus += e.value;
            }
            t.BandScale = band;
            t.ReliabilityBonus = bonus;
            var risks = new List<string>(Strings(j, "flags"));
            foreach (var m in Strings(j, "reveals_failure_modes")) if (!risks.Contains(m)) risks.Add(m);
            t.ClearsRisks = risks;
            var games = Strings(j, "minigames");
            t.MinigameId = games.Count > 0 ? games[0] : null;
            return t;
        }

        // ------------------------------------------------------------------ anomalies

        private static AnomalyDef ReadAnomaly(string file, JObject j, IReadOnlyDictionary<string, string> strings)
        {
            var id = ReqStr(j, "id", file);
            var where = $"{file}: anomaly '{id}'";
            var card = new AnomalyDef
            {
                Id = id,
                Name = Text(strings, Str(j, "name_key")) ?? id,
                BaseWeight = Num(j, "base_weight") ?? 1.0,
            };
            var triggers = new List<AnomalyTrigger>();
            bool flawCard = false, partRule = false, payloadCard = false;
            if (j["triggers"] is JArray tarr)
            {
                foreach (var t in tarr)
                {
                    if (!(t is JObject to)) continue;
                    var kind = ReqStr(to, "kind", where);
                    var mult = Num(to, "weight_mult");
                    switch (kind)
                    {
                        case "part_rule": partRule = true; break; // weights come from the parts' anomaly_weight rules
                        case "campaign_mode": triggers.Add(new AnomalyTrigger { Condition = "campaign", Multiplier = mult ?? DefaultTriggerMultiplier }); break;
                        case "test_revealed_flaw": card.RequiresCondition = "flaw_revealed"; flawCard = true; break;
                        case "test_skipped":
                            triggers.Add(new AnomalyTrigger
                            {
                                Condition = "test_skipped:" + ReqStr(to, "test", where),
                                Multiplier = mult ?? DefaultTriggerMultiplier,
                            });
                            break;
                        case "payload_contract": triggers.Add(new AnomalyTrigger { Condition = "payload_contract", Multiplier = mult ?? DefaultTriggerMultiplier }); payloadCard = true; break;
                        case "science_payload": triggers.Add(new AnomalyTrigger { Condition = "science_payload", Multiplier = mult ?? DefaultTriggerMultiplier }); payloadCard = true; break;
                        case "rare": triggers.Add(new AnomalyTrigger { Condition = "always", Multiplier = mult ?? RareTriggerMultiplier }); break;
                        case "random": if (mult.HasValue) triggers.Add(new AnomalyTrigger { Condition = "always", Multiplier = mult.Value }); break;
                        default: throw new CatalogException($"{where}: unknown trigger kind '{kind}'.");
                    }
                }
            }
            card.Triggers = triggers;
            card.OnDraw = ToEffect(Effects(j, "effects"), null, null, null, null, null, false);

            var responses = new List<AnomalyResponse>();
            bool engineCard = false;
            foreach (var t in Array(j, "responses", where))
            {
                var ro = (JObject)t;
                var rid = ReqStr(ro, "id", where);
                var effects = Effects(ro, "effects");
                foreach (var e in effects) if (e.target == "delta_v_m_s") engineCard = true;
                var flags = Strings(ro, "flags");
                var fixes = rid.StartsWith("fix", StringComparison.Ordinal) || Contains(flags, "fixes_flaw") || Contains(flags, "fix_flaw");
                responses.Add(new AnomalyResponse
                {
                    Id = rid,
                    TextKey = Str(ro, "text_key") ?? "",
                    Effect = ToEffect(effects, Str(ro, "action"), Str(ro, "revote_category"), flags, Str(ro, "minigame"),
                        Str(ro, "guarantees_minigame"), fixes),
                });
            }
            card.Responses = responses;
            card.Target = flawCard ? "flawed_part" : engineCard ? "engine" : partRule ? "single_source_part" : payloadCard ? "payload" : null;
            return card;
        }

        private static EffectDef ToEffect(List<(string target, string op, double value, string? scope)> effects, string? action,
            string? revoteCategory, IReadOnlyList<string>? flags, string? minigame, string? guaranteedMinigame, bool fixesFlaw)
        {
            var e = new EffectDef();
            double band = 1.0;
            foreach (var (target, op, value, scope) in effects)
            {
                switch (target)
                {
                    case "cost_M":
                        if (op == "add") e.CostM += value;
                        else if (op == "add_fraction") e.CostPartFraction += value;
                        break;
                    case "budget_M":
                        if (op == "add_fraction") e.BudgetFraction += value;
                        else if (op == "add") e.BudgetM += value;
                        break;
                    case "schedule_days":
                    case "integ_days":
                        if (op == "add") e.Days += value;
                        break;
                    case "lead_days":
                        if (op == "add") e.LeadDays += value;
                        break;
                    case "reliability":
                        if (op == "add") e.ReliabilityDelta += value;
                        break;
                    case "uncertainty_band":
                        if (op == "mul") band *= value;
                        break;
                    case "delta_v_m_s":
                        if (op == "add_fraction") e.DvBonusFraction += value;
                        break;
                    case "dry_mass_t":
                        if (op == "add") e.MassKg += value * 1000.0;
                        break;
                    case "science_value":
                        if (op == "add_fraction") e.SciencePenaltyFraction += value;
                        break;
                }
            }
            e.BandScale = band;
            var addFlags = new List<string>();
            if (flags != null) addFlags.AddRange(flags);
            if (guaranteedMinigame != null) addFlags.Add("guaranteed_minigame:" + guaranteedMinigame);
            if (action == "cut_test") addFlags.Add("test_cut");
            e.AddFlags = addFlags;
            e.MinigameId = minigame;
            e.FixesFlaw = fixesFlaw;
            switch (action)
            {
                case "use_emergency_funding": e.UsesEmergencyFunding = true; break;
                case "remove_instrument": e.ReopenCategory = Slots.PayloadInstrument; break;
                case "swap_part":
                case "downgrade_part":
                case "revote_category":
                    e.ReopenCategory = revoteCategory != null ? SlotForCategory(revoteCategory) : EffectDef.ReopenTarget;
                    break;
            }
            if (action == null && revoteCategory != null) e.ReopenCategory = SlotForCategory(revoteCategory);
            return e;
        }

        /// <summary>
        /// Vote slot an anomaly response reopens for a category. Per-stage categories pick the upper stage for tanks
        /// ("bigger tank vote" on Payload Overweight sizes the stage that carries the payload) and the first stage for
        /// engine counts. game_value decision.
        /// </summary>
        private static string SlotForCategory(string category) =>
            category == PartCategories.TankSize ? Slots.UpperStageTank
            : category == PartCategories.EngineCount ? Slots.FirstStageEngineCount
            : category;

        // ------------------------------------------------------------------ boosts and rules

        private static BoostDef ReadBoost(string file, JObject j, IReadOnlyDictionary<string, string> strings)
        {
            var id = ReqStr(j, "id", file);
            var tiers = j["tiers"] as JObject;
            double Tier(string name) => tiers?[name] is JObject t ? Num(t, "value") ?? 0 : 0;
            return new BoostDef
            {
                Id = id,
                Name = Text(strings, Str(j, "name_key")) ?? id,
                Bronze = Tier("bronze"),
                Silver = Tier("silver"),
                Gold = Tier("gold"),
                Cap = j["cap"] is JObject cap ? Num(cap, "value") : null,
                Unit = (Str(j, "target") ?? Str(j, "kind") ?? "") + (Str(j, "op") is string op ? ":" + op : ""),
            };
        }

        private static ValidationRuleDef ReadRule(string file, JObject j, IReadOnlyDictionary<string, string> strings)
        {
            var id = ReqStr(j, "id", file);
            var key = Str(j, "explanation_key") ?? "";
            var ps = new Dictionary<string, double>(StringComparer.Ordinal);
            if (j["params"] is JObject po)
                foreach (var p in po.Properties())
                {
                    if (IsNumber(p.Value)) ps[p.Name] = p.Value.Value<double>();
                    else if (p.Value.Type == JTokenType.Boolean) ps[p.Name] = p.Value.Value<bool>() ? 1 : 0;
                }
            if (j["relaxed"] is JObject relaxed && Num(relaxed, "margin_fraction") is double margin)
                ps["major_margin_fraction"] = margin;
            return new ValidationRuleDef
            {
                Id = id,
                Severity = ParseSeverity(ReqStr(j, "severity", file), file),
                TextKey = key,
                Text = Text(strings, key) ?? "",
                Params = ps,
            };
        }

        private static Severity ParseSeverity(string s, string file) => s switch
        {
            "blocker" => Severity.Blocker,
            "major" => Severity.Major,
            "minor" => Severity.Minor,
            _ => throw new CatalogException($"{file}: unknown severity '{s}'."),
        };

        // ------------------------------------------------------------------ JSON helpers

        private static JObject Parse(string file, string text)
        {
            try
            {
                var root = JsonConvert.DeserializeObject<JToken>(text, new JsonSerializerSettings { DateParseHandling = DateParseHandling.None });
                return root as JObject ?? throw new CatalogException($"{file}: the top level is not a JSON object.");
            }
            catch (JsonException e)
            {
                throw new CatalogException($"{file}: invalid JSON ({e.Message})", e);
            }
        }

        private static void Problem(bool lenient, List<string> warnings, string message)
        {
            if (lenient) warnings.Add(message); else throw new CatalogException("data/: " + message);
        }

        private static bool IsNumber(JToken t) => t.Type == JTokenType.Integer || t.Type == JTokenType.Float;

        private static string? Str(JObject o, string name) => o[name] is JToken t && t.Type == JTokenType.String ? (string)t! : null;

        private static string ReqStr(JObject o, string name, string where) =>
            Str(o, name) ?? throw new CatalogException($"{where}: missing '{name}'.");

        private static double? Num(JObject o, string name) => o[name] is JToken t && IsNumber(t) ? t.Value<double>() : (double?)null;

        private static bool Bool(JObject o, string name) => o[name] is JToken t && t.Type == JTokenType.Boolean && t.Value<bool>();

        private static IReadOnlyList<string> Strings(JObject o, string name)
        {
            var list = new List<string>();
            if (o[name] is JArray a)
                foreach (var t in a)
                    if (t.Type == JTokenType.String) list.Add((string)t!);
            return list;
        }

        private static JArray Array(JObject o, string name, string where) =>
            o[name] as JArray ?? throw new CatalogException($"{where}: missing '{name}' array.");

        private static List<(string target, string op, double value, string? scope)> Effects(JObject o, string name)
        {
            var list = new List<(string, string, double, string?)>();
            if (o[name] is JArray a)
                foreach (var t in a)
                    if (t is JObject e && Str(e, "target") is string target && Str(e, "op") is string op && Num(e, "value") is double v)
                        list.Add((target, op, v, Str(e, "scope")));
            return list;
        }

        private static string? Text(IReadOnlyDictionary<string, string> strings, string? key) =>
            key != null && strings.TryGetValue(key, out var s) ? s : null;

        private static bool Contains(IReadOnlyList<string> list, string s)
        {
            for (int i = 0; i < list.Count; i++) if (list[i] == s) return true;
            return false;
        }
    }
}
