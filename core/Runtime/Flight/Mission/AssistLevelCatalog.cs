using System;
using System.Collections.Generic;
using MissionForge.Core.Data;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

namespace MissionForge.Core.Flight.Mission
{
    /// <summary>Mission-owned, immutable view of host-supplied assist-level aids.</summary>
    public sealed class AssistLevelCatalog
    {
        private readonly Dictionary<string, HashSet<string>> aidsByLevel;

        private AssistLevelCatalog(Dictionary<string, HashSet<string>> aidsByLevel)
        {
            this.aidsByLevel = aidsByLevel;
        }

        /// <summary>Returns whether an assist-level ID contains an aid marker.</summary>
        public bool HasAid(string assistLevelId, string aidId)
        {
            if (assistLevelId == null) throw new ArgumentNullException(nameof(assistLevelId));
            if (aidId == null) throw new ArgumentNullException(nameof(aidId));
            return aidsByLevel.TryGetValue(assistLevelId, out var aids) && aids.Contains(aidId);
        }

        /// <summary>Loads the assist-level aid markers from JSON supplied by the host; performs no I/O.</summary>
        public static AssistLevelCatalog Load(string json)
        {
            if (json == null) throw new ArgumentNullException(nameof(json));
            JObject root;
            try { root = JObject.Parse(json); }
            catch (JsonException exception) { throw new CatalogException("assist_levels.json: invalid JSON.", exception); }
            if (!(root["assist_levels"] is JArray levels))
                throw new CatalogException("assist_levels.json: assist_levels must be an array.");
            var result = new Dictionary<string, HashSet<string>>(StringComparer.Ordinal);
            foreach (var token in levels)
            {
                if (!(token is JObject level)) throw new CatalogException("assist_levels.json: each level must be an object.");
                var id = RequiredText(level["id"], "id");
                if (!result.TryAdd(id, new HashSet<string>(StringComparer.Ordinal)))
                    throw new CatalogException($"assist_levels.json: duplicate level '{id}'.");
                if (!(level["aids"] is JObject groups))
                    throw new CatalogException($"assist_levels.json: {id}.aids must be an object.");
                foreach (var group in groups.Properties())
                {
                    if (!(group.Value is JArray aids))
                        throw new CatalogException($"assist_levels.json: {id}.aids.{group.Name} must be an array.");
                    foreach (var aidToken in aids)
                    {
                        var aid = RequiredText(aidToken, $"{id}.aids.{group.Name}");
                        // An aid may intentionally appear in more than one segment, such as
                        // flight_director's "manual" orbit and entry markers.
                        result[id].Add(aid);
                    }
                }
            }
            return new AssistLevelCatalog(result);
        }

        private static string RequiredText(JToken? token, string field)
        {
            if (token == null || token.Type != JTokenType.String || string.IsNullOrWhiteSpace((string?)token))
                throw new CatalogException($"assist_levels.json: {field} must be a nonempty string.");
            return (string)token!;
        }
    }
}
