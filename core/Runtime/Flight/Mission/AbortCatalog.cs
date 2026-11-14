using System;
using System.Collections.Generic;
using MissionForge.Core.Data;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

namespace MissionForge.Core.Flight.Mission
{
    public sealed class AbortModeDef
    {
        internal AbortModeDef(string id, IReadOnlyList<string> phases, bool needsEscape, IReadOnlyList<string> requirements)
        { Id = id; Phases = phases; RequiresEscapeSystem = needsEscape; Requirements = requirements; }
        public string Id { get; }
        public IReadOnlyList<string> Phases { get; }
        public bool RequiresEscapeSystem { get; }
        public IReadOnlyList<string> Requirements { get; }
    }

    /// <summary>Abort modes of design table 9.8, from <c>abort_modes.json</c>; supplied by the host, no I/O.</summary>
    public sealed class AbortCatalog
    {
        private readonly List<AbortModeDef> modes;
        private AbortCatalog(List<AbortModeDef> modes) { this.modes = modes; }
        public IReadOnlyList<AbortModeDef> Modes => modes;
        public AbortModeDef? Find(string id) => modes.Find(m => m.Id == id);

        public static AbortCatalog Load(string json)
        {
            if (json == null) throw new ArgumentNullException(nameof(json));
            JObject root;
            try { root = JObject.Parse(json); }
            catch (JsonException exception) { throw new CatalogException("abort_modes.json: invalid JSON.", exception); }
            if (!(root["abort_modes"] is JArray array)) throw new CatalogException("abort_modes.json: abort_modes must be an array.");
            var list = new List<AbortModeDef>(); var seen = new HashSet<string>(StringComparer.Ordinal);
            foreach (var token in array)
            {
                if (!(token is JObject o)) throw new CatalogException("abort_modes.json: each mode must be an object.");
                var id = Text(o["id"], "id");
                if (!seen.Add(id)) throw new CatalogException($"abort_modes.json: duplicate mode '{id}'.");
                var needs = o["requires_escape_system"];
                if (needs == null || needs.Type != JTokenType.Boolean)
                    throw new CatalogException($"abort_modes.json: {id}.requires_escape_system must be a boolean.");
                list.Add(new AbortModeDef(id, Texts(o["flight_phases"], id + ".flight_phases"), (bool)needs,
                    Texts(o["requirements"], id + ".requirements")));
            }
            return new AbortCatalog(list);
        }
        private static string Text(JToken? t, string field)
        {
            if (t == null || t.Type != JTokenType.String || string.IsNullOrWhiteSpace((string?)t))
                throw new CatalogException($"abort_modes.json: {field} must be a nonempty string.");
            return (string)t!;
        }
        private static List<string> Texts(JToken? t, string field)
        {
            if (!(t is JArray a)) throw new CatalogException($"abort_modes.json: {field} must be an array.");
            var r = new List<string>(); foreach (var x in a) r.Add(Text(x, field)); return r;
        }
    }
}
