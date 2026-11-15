using System;
using System.Collections.Generic;
using MissionForge.Core.Scoring;
using Newtonsoft.Json.Linq;

namespace MissionForge.Screens.Flight
{
    /// <summary>Where a minigame run is, as seen by the host big screen.</summary>
    public enum MinigameRunState
    {
        /// <summary><c>mg.start</c> sent; phones show the instruction and demo until <c>startAtMs</c>.</summary>
        Intro,
        /// <summary>Between <c>startAtMs</c> and <c>startAtMs + durationMs</c>.</summary>
        Playing,
        /// <summary>Play time over; waiting for late <c>mg.result</c> messages (up to the 2 s close margin).</summary>
        Closing,
        /// <summary><c>mg.summary</c> sent; the result stays on screen for a few seconds.</summary>
        Result,
    }

    /// <summary>Immutable snapshot of the current run for the banner. Built by <see cref="FlightMinigameHost"/>.</summary>
    public sealed class MinigameRunView
    {
        public MinigameRunView(string runId, string minigameId, string nameKey, string howToPlayKey, MinigameRunState state,
            long startAtMs, long durationMs, double progress01, int ready, int active, int succeeded, Tier tier, bool sparkle)
        {
            RunId = runId;
            MinigameId = minigameId;
            NameKey = nameKey;
            HowToPlayKey = howToPlayKey;
            State = state;
            StartAtMs = startAtMs;
            DurationMs = durationMs;
            Progress01 = progress01;
            Ready = ready;
            Active = active;
            Succeeded = succeeded;
            Tier = tier;
            Sparkle = sparkle;
        }

        public string RunId { get; }
        public string MinigameId { get; }
        /// <summary>String key of the minigame name (<c>minigame.MG-08.name</c>).</summary>
        public string NameKey { get; }
        /// <summary>String key of the one-sentence instruction (<c>minigame.MG-08.how_to_play</c>).</summary>
        public string HowToPlayKey { get; }
        public MinigameRunState State { get; }
        /// <summary>Server clock (ms since the Unix epoch) when play begins.</summary>
        public long StartAtMs { get; }
        /// <summary>Length of play, ms.</summary>
        public long DurationMs { get; }
        /// <summary>Team progress 0-1: mean of the latest <c>mg.progress</c> per ready player; a reported result counts as 1.</summary>
        public double Progress01 { get; }
        /// <summary>Players who sent <c>mg.ready</c>, count.</summary>
        public int Ready { get; }
        /// <summary>Active players at close (ready and connected), count; 0 before <see cref="MinigameRunState.Result"/>.</summary>
        public int Active { get; }
        /// <summary>Active players who succeeded, count (live count before the result).</summary>
        public int Succeeded { get; }
        /// <summary>Tier reached; <see cref="Core.Scoring.Tier.None"/> until <see cref="MinigameRunState.Result"/>.</summary>
        public Tier Tier { get; }
        public bool Sparkle { get; }
        /// <summary>True while the host simulation should run in bullet-time (×0.1), i.e. the run is not yet in Result.</summary>
        public bool IsBulletTime => State != MinigameRunState.Result;
    }

    /// <summary>One entry of <c>data/minigames.json</c>, with its type already mapped to the wire enum.</summary>
    public sealed class MinigameDef
    {
        public MinigameDef(string id, string wireType, double durationS, JObject paramsObject, string nameKey, string howToPlayKey, string factId)
        {
            Id = id;
            WireType = wireType;
            DurationS = durationS;
            Params = paramsObject;
            NameKey = nameKey;
            HowToPlayKey = howToPlayKey;
            FactId = factId;
        }

        public string Id { get; }
        /// <summary>Protocol <c>MinigameType</c> (PARALLEL_SOLO, COOP_SPLIT, RELAY, TEAM_SYNC).</summary>
        public string WireType { get; }
        public double DurationS { get; }
        /// <summary>Common parameters; never null. Treat as read-only (the host sends a deep clone).</summary>
        public JObject Params { get; }
        public string NameKey { get; }
        public string HowToPlayKey { get; }
        /// <summary>First fact of the minigame, or null.</summary>
        public string FactId { get; }

        /// <summary>
        /// Maps the data type (<c>parallel_solo</c>, <c>cooperative_split</c>, <c>cooperative</c>, <c>relay</c>, <c>team_sync</c>)
        /// to the protocol enum. Assumption: data <c>cooperative</c> (MG-28, MG-30) is played as COOP_SPLIT on the wire.
        /// </summary>
        public static string ToWireType(string dataType)
        {
            switch ((dataType ?? "").ToLowerInvariant())
            {
                case "cooperative_split":
                case "cooperative":
                    return "COOP_SPLIT";
                case "relay":
                    return "RELAY";
                case "team_sync":
                    return "TEAM_SYNC";
                default:
                    return "PARALLEL_SOLO";
            }
        }

        /// <summary>Parses <c>minigames.json</c> from a data map (key "minigames.json"; a leading "data/" is accepted).</summary>
        /// <exception cref="InvalidOperationException">The file is missing or has no <c>minigames</c> array.</exception>
        public static IReadOnlyDictionary<string, MinigameDef> LoadAll(IReadOnlyDictionary<string, string> jsonByPath)
        {
            if (jsonByPath == null) throw new ArgumentNullException(nameof(jsonByPath));
            string text = null;
            foreach (KeyValuePair<string, string> kv in jsonByPath)
            {
                string key = kv.Key.Replace('\\', '/');
                if (key.StartsWith("data/", StringComparison.Ordinal)) key = key.Substring(5);
                if (key == "minigames.json") { text = kv.Value; break; }
            }
            if (text == null) throw new InvalidOperationException("minigames.json: file is missing");

            var array = JObject.Parse(text)["minigames"] as JArray
                ?? throw new InvalidOperationException("minigames.json: 'minigames' must be an array");
            var result = new Dictionary<string, MinigameDef>(StringComparer.Ordinal);
            foreach (JToken token in array)
            {
                if (!(token is JObject o)) continue;
                string id = (string)o["id"];
                if (string.IsNullOrEmpty(id)) continue;
                string factId = o["facts"] is JArray facts && facts.Count > 0 ? (string)facts[0] : null;
                result[id] = new MinigameDef(
                    id,
                    ToWireType((string)o["type"]),
                    o["duration_s"]?.Value<double>() ?? 20.0,
                    o["params"] as JObject ?? new JObject(),
                    (string)o["name_key"] ?? "minigame." + id + ".name",
                    (string)o["how_to_play_key"] ?? "minigame." + id + ".how_to_play",
                    factId);
            }
            return result;
        }
    }
}
