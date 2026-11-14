using System;
using System.Collections.Generic;
using MissionForge.Core.Data;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

namespace MissionForge.Core.Flight.Mission
{
    public sealed class AbortModeDef
    {
        internal AbortModeDef(string id, List<string> phases, List<string> requirements, bool requiresEscapeSystem)
        {
            Id = id; FlightPhaseIds = phases.AsReadOnly(); Requirements = requirements.AsReadOnly();
            RequiresEscapeSystem = requiresEscapeSystem;
        }
        public string Id { get; }
        public IReadOnlyList<string> FlightPhaseIds { get; }
        public IReadOnlyList<string> Requirements { get; }
        public bool RequiresEscapeSystem { get; }
    }

    /// <summary>Immutable mission-owned view of host-supplied abort modes.</summary>
    public sealed class AbortModeCatalog
    {
        private readonly Dictionary<string, AbortModeDef> byId;
        private AbortModeCatalog(Dictionary<string, AbortModeDef> byId) { this.byId = byId; }
        public IReadOnlyCollection<AbortModeDef> Modes => byId.Values;
        public AbortModeDef Mode(string id) => byId.TryGetValue(id, out var value)
            ? value : throw new CatalogException($"abort_modes.json: unknown abort mode '{id}'.");

        public static AbortModeCatalog Load(string json)
        {
            if (json == null) throw new ArgumentNullException(nameof(json));
            JObject root;
            try { root = JObject.Parse(json); }
            catch (JsonException exception) { throw new CatalogException("abort_modes.json: invalid JSON.", exception); }
            if (!(root["abort_modes"] is JArray modes))
                throw new CatalogException("abort_modes.json: abort_modes must be an array.");
            var result = new Dictionary<string, AbortModeDef>(StringComparer.Ordinal);
            foreach (var token in modes)
            {
                if (!(token is JObject item)) throw new CatalogException("abort_modes.json: each mode must be an object.");
                var id = Text(item["id"], "id");
                if (result.ContainsKey(id)) throw new CatalogException($"abort_modes.json: duplicate mode '{id}'.");
                result.Add(id, new AbortModeDef(id, Strings(item["flight_phases"], id + ".flight_phases"),
                    Strings(item["requirements"], id + ".requirements"), item.Value<bool?>("requires_escape_system") ?? false));
            }
            return new AbortModeCatalog(result);
        }

        private static List<string> Strings(JToken? token, string field)
        {
            if (!(token is JArray array)) throw new CatalogException($"abort_modes.json: {field} must be an array.");
            var result = new List<string>();
            foreach (var value in array) result.Add(Text(value, field));
            return result;
        }
        private static string Text(JToken? token, string field)
        {
            if (token == null || token.Type != JTokenType.String || string.IsNullOrWhiteSpace((string?)token))
                throw new CatalogException($"abort_modes.json: {field} must be a nonempty string.");
            return (string)token!;
        }
    }
}
