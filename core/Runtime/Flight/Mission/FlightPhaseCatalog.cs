using System;
using System.Collections.Generic;
using MissionForge.Core.Data;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

namespace MissionForge.Core.Flight.Mission
{
    /// <summary>Immutable presentation cues for one phase; cue eligibility belongs to the mission driver.</summary>
    public sealed class FlightPhaseDef
    {
        internal FlightPhaseDef(string id, List<string> minigames, List<string> facts, string factMomentKey)
        {
            Id = id;
            MinigameIds = minigames.AsReadOnly();
            FactIds = facts.AsReadOnly();
            FactMomentKey = factMomentKey;
        }

        public string Id { get; }
        /// <summary>Candidate cues in data order, not an instruction to start every minigame on entry.</summary>
        public IReadOnlyList<string> MinigameIds { get; }
        /// <summary>Fact-bank IDs, e.g. F04. Empty when the fact moment has no fact-bank entry.</summary>
        public IReadOnlyList<string> FactIds { get; }
        /// <summary>Localization key for the phase's fact moment; never a fact-bank ID.</summary>
        public string FactMomentKey { get; }
    }

    /// <summary>Loads host-supplied flight_phases.json text without I/O or mutable JSON escaping the loader.</summary>
    public sealed class FlightPhaseCatalog
    {
        private static readonly string[] RequiredIds =
            { "F0", "F1", "F2", "F3", "F4", "F5", "F6", "F7", "F7b", "F8", "F9", "F10", "F11", "F12", "F13", "F14" };
        private readonly Dictionary<string, FlightPhaseDef> _byId;

        private FlightPhaseCatalog(List<FlightPhaseDef> phases, Dictionary<string, FlightPhaseDef> byId)
        {
            Phases = phases.AsReadOnly();
            _byId = byId;
        }

        /// <summary>Definitions in source order, including the parallel F7b track.</summary>
        public IReadOnlyList<FlightPhaseDef> Phases { get; }

        public FlightPhaseDef Phase(string id) => _byId.TryGetValue(id, out var phase)
            ? phase : throw new CatalogException($"flight_phases.json: unknown phase '{id}'.");

        /// <summary>Requires all mission phase IDs once, unique cue IDs within each list and nonempty fact keys.</summary>
        public static FlightPhaseCatalog Load(string json)
        {
            if (json == null) throw new ArgumentNullException(nameof(json));
            JObject root;
            try { root = JObject.Parse(json); }
            catch (JsonException exception)
            { throw new CatalogException("flight_phases.json: invalid JSON.", exception); }
            if (!(root["flight_phases"] is JArray entries))
                throw new CatalogException("flight_phases.json: flight_phases must be an array.");
            var phases = new List<FlightPhaseDef>();
            var byId = new Dictionary<string, FlightPhaseDef>(StringComparer.Ordinal);
            foreach (var entry in entries)
            {
                if (!(entry is JObject item))
                    throw new CatalogException("flight_phases.json: each phase must be an object.");
                var id = RequiredText(item["phase"], "phase");
                if (Array.IndexOf(RequiredIds, id) < 0)
                    throw new CatalogException($"flight_phases.json: unknown phase '{id}'.");
                if (byId.ContainsKey(id))
                    throw new CatalogException($"flight_phases.json: duplicate phase '{id}'.");
                var phase = new FlightPhaseDef(id, ReadIds(item, "minigames", id, false),
                    ReadIds(item, "facts", id, true), RequiredText(item["fact_moment_key"], id + ".fact_moment_key"));
                phases.Add(phase);
                byId.Add(id, phase);
            }
            foreach (var id in RequiredIds)
                if (!byId.ContainsKey(id))
                    throw new CatalogException($"flight_phases.json: missing required phase '{id}'.");
            return new FlightPhaseCatalog(phases, byId);
        }

        private static List<string> ReadIds(JObject item, string field, string phaseId, bool optional)
        {
            var values = new List<string>();
            if (optional && item[field] == null) return values;
            if (!(item[field] is JArray array))
                throw new CatalogException($"flight_phases.json: {phaseId}.{field} must be an array.");
            var seen = new HashSet<string>(StringComparer.Ordinal);
            foreach (var token in array)
            {
                var id = RequiredText(token, phaseId + "." + field);
                if (!seen.Add(id))
                    throw new CatalogException($"flight_phases.json: duplicate '{id}' in {phaseId}.{field}.");
                values.Add(id);
            }
            return values;
        }

        private static string RequiredText(JToken? token, string field)
        {
            if (token == null || token.Type != JTokenType.String || string.IsNullOrWhiteSpace((string?)token))
                throw new CatalogException($"flight_phases.json: {field} must be a nonempty string.");
            return (string)token!;
        }
    }
}
