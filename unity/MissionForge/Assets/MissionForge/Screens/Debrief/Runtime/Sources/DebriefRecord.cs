using System;
using System.Collections.Generic;
using System.Globalization;
using MissionForge.Core.Scoring;
using Newtonsoft.Json.Linq;

namespace MissionForge.EndScreens.Sources
{
    /// <summary>A player as recorded by the session: identity plus the award metrics Core reads (awards.json names).</summary>
    public sealed class RecordedPlayer
    {
        public RecordedPlayer(DebriefPlayer player, IReadOnlyDictionary<string, double> stats)
        {
            Player = player;
            Stats = stats;
        }

        public DebriefPlayer Player { get; }
        public IReadOnlyDictionary<string, double> Stats { get; }
    }

    /// <summary>
    /// What a finished mission recorded: the Core <see cref="ScoreInput"/>, the players with their award metrics, the
    /// timeline, facts collected, KP and the failure. This is data (a fixture or a live session), never rules: Core turns it
    /// into the score, grade and awards in <see cref="CoreDebriefAdapter"/>.
    /// </summary>
    public sealed class DebriefRecord
    {
        public string FixtureId { get; set; } = "";
        public ScoreInput Input { get; set; } = new ScoreInput();
        public ulong Seed { get; set; }
        public IReadOnlyList<RecordedPlayer> Players { get; set; } = Array.Empty<RecordedPlayer>();
        public IReadOnlyList<TimelineEventView> Timeline { get; set; } = Array.Empty<TimelineEventView>();
        public double MissionLengthS { get; set; }
        public IReadOnlyList<string> FactIds { get; set; } = Array.Empty<string>();
        public int KpEarned { get; set; }
        public FailureView Failure { get; set; }
        public bool RetryAvailable { get; set; }

        /// <summary>Parses a debrief fixture (Screens/Debrief/Fixtures/*.json). Throws <see cref="FormatException"/> naming the field.</summary>
        public static DebriefRecord Parse(string json)
        {
            if (string.IsNullOrEmpty(json)) throw new FormatException("debrief fixture: empty");
            JObject o;
            try { o = JObject.Parse(json); }
            catch (Exception e) { throw new FormatException("debrief fixture: malformed JSON: " + e.Message, e); }

            var input = new ScoreInput
            {
                ContractId = Need<string>(o, "contractId"),
                AssistLevelId = (string)o["assistLevel"] ?? "engineer",
                Crewed = (bool?)o["crewed"] ?? false,
                CrewLost = (bool?)o["crewLost"] ?? false,
                CrewSafe = (bool?)o["crewSafe"] ?? false,
                BoosterRecovered = (bool?)o["boosterRecovered"] ?? false,
                CapsuleRecovered = (bool?)o["capsuleRecovered"] ?? false,
                BudgetRemainingFraction = (double?)o["budgetRemainingFraction"] ?? 0.0,
                ScheduleMarginFraction = (double?)o["scheduleMarginFraction"] ?? 0.0,
                ScienceFraction = (double?)o["scienceFraction"] ?? 0.0,
                GoodCalls = (int?)o["goodCalls"] ?? 0,
                CorrectPredictions = (int?)o["correctPredictions"] ?? 0,
                TriviaTiebreaks = (int?)o["triviaTiebreaks"] ?? 0,
                ScoreBoostMultiplier = (double?)o["scoreBoostMultiplier"] ?? 1.0,
                Metrics = Doubles(o["metrics"] as JObject),
                Minigames = Minigames(o["minigames"] as JArray),
            };

            var players = new List<RecordedPlayer>();
            foreach (JToken p in (o["players"] as JArray) ?? new JArray())
            {
                var roles = new List<string>();
                foreach (JToken r in (p["roles"] as JArray) ?? new JArray()) roles.Add((string)r);
                var player = new DebriefPlayer(Need<string>(p, "id"), (string)p["nickname"], (string)p["avatar"], roles);
                players.Add(new RecordedPlayer(player, Doubles(p["stats"] as JObject)));
            }

            var timeline = new List<TimelineEventView>();
            foreach (JToken t in (o["timeline"] as JArray) ?? new JArray())
            {
                string kindText = Need<string>(t, "kind");
                if (!TryKind(kindText, out TimelineKind kind)) throw new FormatException("debrief fixture: unknown timeline kind '" + kindText + "'");
                timeline.Add(new TimelineEventView((double?)t["t"] ?? 0.0, kind, Need<string>(t, "key"), (string)t["tier"]));
            }

            var facts = new List<string>();
            foreach (JToken f in (o["facts"] as JArray) ?? new JArray()) facts.Add((string)f);

            FailureView failure = null;
            if (o["failure"] is JObject fo)
            {
                failure = new FailureView(Need<string>(fo, "mode"), (string)fo["phase"] ?? "", (string)fo["slot"] ?? "", (double?)fo["atS"] ?? 0.0);
            }

            return new DebriefRecord
            {
                FixtureId = (string)o["fixture"] ?? "",
                Input = input,
                Seed = ulong.Parse((string)o["seed"] ?? "1", CultureInfo.InvariantCulture),
                Players = players,
                Timeline = timeline,
                MissionLengthS = (double?)o["missionLengthS"] ?? 0.0,
                FactIds = facts,
                KpEarned = (int?)o["kpEarned"] ?? 0,
                Failure = failure,
                RetryAvailable = (bool?)o["retryAvailable"] ?? false,
            };
        }

        private static bool TryKind(string text, out TimelineKind kind)
        {
            switch (text)
            {
                case "phase": kind = TimelineKind.Phase; return true;
                case "minigame": kind = TimelineKind.Minigame; return true;
                case "boost": kind = TimelineKind.Boost; return true;
                case "good_call": kind = TimelineKind.GoodCall; return true;
                case "anomaly": kind = TimelineKind.Anomaly; return true;
                case "failure": kind = TimelineKind.Failure; return true;
                default: kind = TimelineKind.Phase; return false;
            }
        }

        private static IReadOnlyList<MinigameResult> Minigames(JArray array)
        {
            var list = new List<MinigameResult>();
            if (array == null) return list;
            foreach (JToken m in array)
            {
                list.Add(new MinigameResult(Need<string>(m, "id"), Tiers.Parse(Need<string>(m, "tier")), (bool?)m["golden"] ?? false));
            }
            return list;
        }

        private static IReadOnlyDictionary<string, double> Doubles(JObject o)
        {
            var d = new Dictionary<string, double>(StringComparer.Ordinal);
            if (o == null) return d;
            foreach (JProperty p in o.Properties())
            {
                if (p.Value.Type == JTokenType.Boolean) d[p.Name] = (bool)p.Value ? 1.0 : 0.0;
                else d[p.Name] = (double)p.Value;
            }
            return d;
        }

        private static T Need<T>(JToken o, string field)
        {
            JToken v = o?[field];
            if (v == null || v.Type == JTokenType.Null) throw new FormatException("debrief fixture: missing '" + field + "'");
            return v.ToObject<T>();
        }
    }
}
