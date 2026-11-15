using System;
using System.Collections.Generic;
using MissionForge.Core.Scoring;
using Newtonsoft.Json.Linq;

namespace MissionForge.EndScreens.Sources
{
    /// <summary>
    /// Turns a <see cref="DebriefRecord"/> into a <see cref="DebriefView"/> through Core: the score, grade, title and outcome
    /// come from <see cref="ScoreCalculator.Compute"/>, the awards from <see cref="AwardAssigner.Assign"/>. Nothing here computes
    /// a rule; it only copies Core's numbers and looks up string keys in the data.
    /// </summary>
    public sealed class CoreDebriefAdapter
    {
        private readonly ScoringCatalog _scoring;
        private readonly FactCatalog _facts;
        private readonly Dictionary<string, string> _objectiveText = new Dictionary<string, string>(StringComparer.Ordinal);
        private readonly Dictionary<string, string> _contractName = new Dictionary<string, string>(StringComparer.Ordinal);

        /// <param name="dataFiles">Game data JSON by path relative to data/ (GameDataSet.JsonByPath).</param>
        public CoreDebriefAdapter(IReadOnlyDictionary<string, string> dataFiles)
        {
            if (dataFiles == null) throw new ArgumentNullException(nameof(dataFiles));
            _scoring = ScoringCatalog.Load(dataFiles);
            _facts = FactCatalog.Parse(Find(dataFiles, "facts.json"));
            IndexContracts(Find(dataFiles, "contracts.json"));
        }

        public ScoringCatalog Scoring => _scoring;
        public FactCatalog Facts => _facts;

        /// <summary>The order and string keys of the additive terms (design 11.3).</summary>
        public static readonly IReadOnlyList<(string id, string key)> TermOrder = new[]
        {
            ("objective_points", "score.objective_points.name"),
            ("efficiency", "score.efficiency.name"),
            ("safety_recovery", "score.safety_recovery.name"),
            ("science_data", "score.science_data.name"),
            ("teamwork", "score.teamwork.name"),
            ("knowledge", "score.knowledge.name"),
        };

        public DebriefView Build(DebriefRecord record, bool isRehearsal)
        {
            if (record == null) throw new ArgumentNullException(nameof(record));
            ScoreResult score = ScoreCalculator.Compute(_scoring, record.Input);
            ScoreBreakdown b = score.Breakdown;

            var terms = new List<ScoreTermView>
            {
                new ScoreTermView(TermOrder[0].id, TermOrder[0].key, b.Objectives),
                new ScoreTermView(TermOrder[1].id, TermOrder[1].key, b.Efficiency),
                new ScoreTermView(TermOrder[2].id, TermOrder[2].key, b.SafetyRecovery),
                new ScoreTermView(TermOrder[3].id, TermOrder[3].key, b.ScienceData),
                new ScoreTermView(TermOrder[4].id, TermOrder[4].key, b.Teamwork),
                new ScoreTermView(TermOrder[5].id, TermOrder[5].key, b.Knowledge),
            };
            double subtotal = 0.0;
            foreach (ScoreTermView t in terms) subtotal += t.Points;

            var objectives = new List<ObjectiveView>();
            foreach (ObjectiveScore o in score.Objectives)
            {
                _objectiveText.TryGetValue(record.Input.ContractId + "/" + o.Id, out string key);
                objectives.Add(new ObjectiveView(o.Id, o.Kind, key ?? "", o.Met, o.Points));
            }

            var stats = new List<PlayerStats>();
            var byId = new Dictionary<string, DebriefPlayer>(StringComparer.Ordinal);
            var players = new List<DebriefPlayer>();
            foreach (RecordedPlayer p in record.Players)
            {
                stats.Add(new PlayerStats(p.Player.Id, p.Player.Roles, p.Stats));
                byId[p.Player.Id] = p.Player;
                players.Add(p.Player);
            }
            var awards = new List<PlayerAwardsView>();
            if (stats.Count > 0)
            {
                foreach (PlayerAwards a in AwardAssigner.Assign(_scoring, stats, record.Seed))
                {
                    awards.Add(new PlayerAwardsView(byId[a.PlayerId], a.AwardIds));
                }
            }

            _contractName.TryGetValue(record.Input.ContractId, out string nameKey);
            return new DebriefView
            {
                FixtureId = record.FixtureId,
                ContractId = record.Input.ContractId,
                ContractNameKey = nameKey ?? "contract." + record.Input.ContractId + ".name",
                AssistLevelId = record.Input.AssistLevelId,
                Outcome = score.Outcome.ToString(),
                Grade = score.Grade,
                GradeTitleKey = score.TitleKey,
                Total = score.TotalRounded,
                Subtotal = subtotal,
                Terms = terms,
                DifficultyMult = b.DifficultyMult,
                BoostMult = b.BoostMult,
                Objectives = objectives,
                Timeline = record.Timeline,
                MissionLengthS = record.MissionLengthS,
                Players = players,
                Awards = awards,
                Facts = _facts.Showable(record.FactIds),
                KpEarned = record.KpEarned,
                Crewed = record.Input.Crewed,
                CapsuleRecovered = record.Input.CapsuleRecovered,
                BoosterRecovered = record.Input.BoosterRecovered,
                Failure = record.Failure,
                RetryAvailable = record.RetryAvailable && record.Failure != null,
                Seed = record.Seed,
                IsRehearsal = isRehearsal,
            };
        }

        private void IndexContracts(string json)
        {
            if (string.IsNullOrEmpty(json)) return;
            JObject root = JObject.Parse(json);
            foreach (JToken c in (root["contracts"] as JArray) ?? new JArray())
            {
                string id = (string)c["id"];
                if (id == null) continue;
                _contractName[id] = (string)c["name_key"] ?? "contract." + id + ".name";
                if (!(c["objectives"] is JObject obj)) continue;
                foreach (JProperty kind in obj.Properties())
                {
                    if (kind.Value is JArray list)
                    {
                        foreach (JToken o in list) AddObjective(id, o);
                    }
                    else
                    {
                        AddObjective(id, kind.Value);
                    }
                }
            }
        }

        private void AddObjective(string contractId, JToken o)
        {
            string oid = (string)o?["id"];
            string key = (string)o?["text_key"];
            if (oid != null && key != null) _objectiveText[contractId + "/" + oid] = key;
        }

        internal static string Find(IReadOnlyDictionary<string, string> files, string name)
        {
            if (files.TryGetValue(name, out string text)) return text;
            if (files.TryGetValue("data/" + name, out text)) return text;
            return null;
        }
    }

    /// <summary>Debrief source that reads a rehearsal fixture and maps it through Core.</summary>
    public sealed class FixtureDebriefSource : IDebriefSource
    {
        private readonly CoreDebriefAdapter _adapter;
        private readonly DebriefRecord _record;

        public FixtureDebriefSource(CoreDebriefAdapter adapter, string fixtureJson)
        {
            _adapter = adapter ?? throw new ArgumentNullException(nameof(adapter));
            _record = DebriefRecord.Parse(fixtureJson);
        }

        public bool IsRehearsal => true;
        public DebriefRecord Record => _record;
        public DebriefView Load() => _adapter.Build(_record, true);
    }

    /// <summary>Debrief source for a live session: the session hands over its record when the mission ends.</summary>
    public sealed class CoreDebriefSource : IDebriefSource
    {
        private readonly CoreDebriefAdapter _adapter;
        private readonly DebriefRecord _record;

        public CoreDebriefSource(CoreDebriefAdapter adapter, DebriefRecord record)
        {
            _adapter = adapter ?? throw new ArgumentNullException(nameof(adapter));
            _record = record ?? throw new ArgumentNullException(nameof(record));
        }

        public bool IsRehearsal => false;
        public DebriefView Load() => _adapter.Build(_record, false);
    }
}
