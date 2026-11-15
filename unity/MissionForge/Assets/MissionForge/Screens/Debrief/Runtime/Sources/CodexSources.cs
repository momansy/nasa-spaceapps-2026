using System;
using System.Collections.Generic;
using System.Linq;
using MissionForge.Core.Session;
using Newtonsoft.Json.Linq;

namespace MissionForge.EndScreens.Sources
{
    /// <summary>
    /// Codex entries. Reads data/codex.json (codex.schema.json) when it exists; otherwise synthesises entries from the data
    /// already on main: the design 8.3 simplifications, parts with real-world twins, facts, the Core lesson table
    /// (<see cref="LessonsLearned"/>), campaign milestones and minigames. Rejected facts never appear.
    /// </summary>
    public sealed class CodexSource : ICodexSource
    {
        private readonly List<CodexEntryView> _entries = new List<CodexEntryView>();

        public CodexSource(IReadOnlyDictionary<string, string> dataFiles, string linksJson, CodexUnlocks unlocks, bool rehearsal)
        {
            if (dataFiles == null) throw new ArgumentNullException(nameof(dataFiles));
            unlocks ??= new CodexUnlocks();
            IsRehearsal = rehearsal;
            Facts = FactCatalog.Parse(CoreDebriefAdapter.Find(dataFiles, "facts.json"));
            string codexJson = CoreDebriefAdapter.Find(dataFiles, "codex.json");
            FromData = !string.IsNullOrEmpty(codexJson);
            if (FromData) ReadCodexFile(codexJson, unlocks);
            else Synthesise(dataFiles, linksJson, unlocks);
        }

        public bool IsRehearsal { get; }
        /// <summary>True when the entries came from data/codex.json.</summary>
        public bool FromData { get; }
        public FactCatalog Facts { get; }
        public IReadOnlyList<CodexEntryView> Entries => _entries;

        public CodexEntryView Find(string id) => _entries.FirstOrDefault(e => e.Id == id);

        public IEnumerable<CodexEntryView> In(CodexCategory category) => _entries.Where(e => e.Category == category);

        /// <summary>Entry id of the lesson card for a failure mode (the investigation reveal links here).</summary>
        public static string LessonId(string failureModeId) => "lesson." + failureModeId;

        // ---------- data/codex.json ----------

        private void ReadCodexFile(string json, CodexUnlocks unlocks)
        {
            JObject root = JObject.Parse(json);
            foreach (JToken e in (root["entries"] as JArray) ?? new JArray())
            {
                string id = (string)e["id"];
                if (string.IsNullOrEmpty(id)) continue;
                var facts = new List<string>();
                foreach (JToken f in (e["facts"] as JArray) ?? new JArray()) facts.Add((string)f);
                string unlockKind = (string)e["unlock"]?["kind"] ?? "always";
                bool unlocked = unlockKind == "always" || unlocks.EntryIds.Contains(id)
                    || (unlockKind == "part_chosen" && unlocks.Parts.Contains((string)e["unlock"]?["part"] ?? ""))
                    || (unlockKind == "failure_mode" && unlocks.FailureModes.Contains((string)e["unlock"]?["failure_mode"] ?? ""))
                    || (unlockKind == "milestone" && unlocks.Milestones.Contains((string)e["unlock"]?["milestone"] ?? ""))
                    || (unlockKind == "fact_seen" && facts.Any(unlocks.Facts.Contains));
                _entries.Add(new CodexEntryView
                {
                    Id = id,
                    Category = CategoryOf((string)e["kind"]),
                    TitleKey = (string)e["title_key"] ?? "",
                    BodyKey = (string)e["body_key"],
                    SimplificationKey = (string)e["simplification_key"],
                    Facts = Facts.Showable(facts),
                    Sensitive = (bool?)e["sensitive"] ?? false,
                    Unlocked = unlocked,
                    UnlockHintKey = "ui.host.codex.locked." + unlockKind,
                    Image = (string)e["image"],
                });
            }
        }

        public static CodexCategory CategoryOf(string kind)
        {
            switch (kind)
            {
                case "part": return CodexCategory.Parts;
                case "lesson_learned": return CodexCategory.Lessons;
                case "milestone": return CodexCategory.Milestones;
                case "history":
                case "mission": return CodexCategory.Facts;
                default: return CodexCategory.Physics;
            }
        }

        // ---------- synthesis ----------

        private void Synthesise(IReadOnlyDictionary<string, string> files, string linksJson, CodexUnlocks unlocks)
        {
            JObject links = string.IsNullOrEmpty(linksJson) ? new JObject() : JObject.Parse(linksJson);

            foreach (JToken s in (links["simplifications"] as JArray) ?? new JArray())
            {
                string id = (string)s;
                string key = "ui.host.codex.simplification." + id;
                _entries.Add(new CodexEntryView
                {
                    Id = "physics." + id,
                    Category = CodexCategory.Physics,
                    TitleKey = key + ".title",
                    BodyKey = key + ".reality",
                    SimplificationKey = key + ".why",
                    Unlocked = true,
                    UnlockHintKey = "ui.host.codex.locked.always",
                });
            }

            foreach (KeyValuePair<string, string> file in files.Where(f => f.Key.Replace('\\', '/').Contains("parts/")).OrderBy(f => f.Key, StringComparer.Ordinal))
            {
                JObject root = JObject.Parse(file.Value);
                foreach (JToken p in (root["parts"] as JArray) ?? new JArray())
                {
                    string twin = (string)p["twin"];
                    if (string.IsNullOrEmpty(twin)) continue;
                    string id = (string)p["id"];
                    _entries.Add(new CodexEntryView
                    {
                        Id = "part." + id,
                        Category = CodexCategory.Parts,
                        TitleKey = (string)p["name_key"] ?? "part." + id + ".name",
                        SubtitleKey = twin,
                        StrengthKeys = Strings(p["strengths"]),
                        DrawbackKeys = Strings(p["drawbacks"]),
                        Stats = PartStats(p["stats"] as JObject),
                        Unlocked = unlocks.Parts.Contains(id) || unlocks.EntryIds.Contains("part." + id),
                        UnlockHintKey = "ui.host.codex.locked.part_chosen",
                    });
                }
            }

            foreach (FactView f in Facts.Shown)
            {
                _entries.Add(new CodexEntryView
                {
                    Id = "fact." + f.Id,
                    Category = CodexCategory.Facts,
                    TitleKey = f.TopicKey,
                    BodyKey = f.TextKey,
                    Facts = new[] { f },
                    Unlocked = unlocks.Facts.Contains(f.Id) || unlocks.EntryIds.Contains("fact." + f.Id),
                    UnlockHintKey = "ui.host.codex.locked.fact_seen",
                });
            }

            JObject parallels = links["lesson_parallels"] as JObject ?? new JObject();
            foreach (string mode in FailureModes.All)
            {
                LessonCard card = LessonsLearned.For(mode);
                string test = card.Effects.FirstOrDefault(e => e.Kind == LessonEffectKind.FreeTest)?.Value ?? "";
                _entries.Add(new CodexEntryView
                {
                    Id = LessonId(mode),
                    Category = CodexCategory.Lessons,
                    TitleKey = "ui.host.debrief.failure_mode." + mode,
                    SubtitleKey = "ui.host.codex.lesson.subtitle",
                    BodyKey = "ui.host.codex.lesson.body",
                    BodyArgKeys = new[] { "ui.host.debrief.failure_mode." + mode, "test." + test + ".name" },
                    Facts = Facts.Showable(Strings(parallels[mode])),
                    Unlocked = unlocks.FailureModes.Contains(mode) || unlocks.EntryIds.Contains(LessonId(mode)),
                    UnlockHintKey = "ui.host.codex.locked.lesson_learned",
                });
            }

            foreach (JToken m in (links["milestones"] as JArray) ?? new JArray())
            {
                string id = (string)m;
                _entries.Add(new CodexEntryView
                {
                    Id = "milestone." + id,
                    Category = CodexCategory.Milestones,
                    TitleKey = "ui.host.codex.milestone." + id + ".title",
                    BodyKey = "ui.host.codex.milestone." + id + ".body",
                    Unlocked = unlocks.Milestones.Contains(id) || unlocks.EntryIds.Contains("codex_campaign_" + id) || unlocks.EntryIds.Contains("milestone." + id),
                    UnlockHintKey = "ui.host.codex.locked.milestone",
                });
            }

            string minigames = CoreDebriefAdapter.Find(files, "minigames.json");
            if (!string.IsNullOrEmpty(minigames))
            {
                foreach (JToken g in (JObject.Parse(minigames)["minigames"] as JArray) ?? new JArray())
                {
                    string id = (string)g["id"];
                    _entries.Add(new CodexEntryView
                    {
                        Id = "minigame." + id,
                        Category = CodexCategory.Minigames,
                        TitleKey = (string)g["name_key"] ?? "minigame." + id + ".name",
                        SubtitleKey = (string)g["when_key"],
                        BodyKey = (string)g["detail_key"],
                        Facts = Facts.Showable(Strings(g["facts"])),
                        Unlocked = unlocks.Minigames.Contains(id) || unlocks.EntryIds.Contains("minigame." + id),
                        UnlockHintKey = "ui.host.codex.locked.minigame_tier",
                    });
                }
            }
        }

        private static IReadOnlyList<string> Strings(JToken token)
        {
            var list = new List<string>();
            if (token is JArray a) foreach (JToken t in a) list.Add((string)t);
            return list;
        }

        /// <summary>The part stats a player compares, SI with the exact imperial equivalent.</summary>
        private static IReadOnlyList<CodexStat> PartStats(JObject stats)
        {
            var list = new List<CodexStat>();
            if (stats == null) return list;
            void Add(string field, string nameKey, string siUnit, double factor, string impUnit, int decimals)
            {
                JToken v = stats[field];
                if (v == null || (v.Type != JTokenType.Float && v.Type != JTokenType.Integer)) return;
                double si = (double)v;
                list.Add(new CodexStat(nameKey, si, siUnit, double.IsNaN(factor) ? double.NaN : si * factor, impUnit, decimals));
            }
            Add("thrust_sl_kN", "ui.host.codex.stat.thrust_sl", "kN", UnitConversions.LbfPerKn, "lbf", 0);
            Add("thrust_vac_kN", "ui.host.codex.stat.thrust_vac", "kN", UnitConversions.LbfPerKn, "lbf", 0);
            Add("thrust_sl_each_kN", "ui.host.codex.stat.thrust_sl", "kN", UnitConversions.LbfPerKn, "lbf", 0);
            Add("isp_sl_s", "ui.host.codex.stat.isp_sl", "s", double.NaN, null, 0);
            Add("isp_vac_s", "ui.host.codex.stat.isp_vac", "s", double.NaN, null, 0);
            Add("mass_t", "ui.host.codex.stat.mass", "t", UnitConversions.LbPerTonne, "lb", 2);
            Add("mass_each_t", "ui.host.codex.stat.mass", "t", UnitConversions.LbPerTonne, "lb", 1);
            Add("mass_kg", "ui.host.codex.stat.mass", "kg", UnitConversions.LbPerKg, "lb", 0);
            Add("diameter_m", "ui.host.codex.stat.diameter", "m", UnitConversions.FtPerM, "ft", 1);
            Add("max_entry_speed_km_s", "ui.host.codex.stat.entry_speed", "km/s", UnitConversions.FtsPerKms, "ft/s", 1);
            Add("power_W", "ui.host.codex.stat.power", "W", double.NaN, null, 0);
            return list;
        }

        /// <summary>Parses the rehearsal unlock fixture (Screens/Codex/Fixtures/codex_rehearsal.json).</summary>
        public static CodexUnlocks ParseUnlocks(string json)
        {
            var u = new CodexUnlocks();
            if (string.IsNullOrEmpty(json)) return u;
            JObject o = JObject.Parse(json);
            foreach (string s in Strings(o["entries"])) u.EntryIds.Add(s);
            foreach (string s in Strings(o["parts"])) u.Parts.Add(s);
            foreach (string s in Strings(o["facts"])) u.Facts.Add(s);
            foreach (string s in Strings(o["failure_modes"])) u.FailureModes.Add(s);
            foreach (string s in Strings(o["minigames"])) u.Minigames.Add(s);
            foreach (string s in Strings(o["milestones"])) u.Milestones.Add(s);
            return u;
        }
    }
}
