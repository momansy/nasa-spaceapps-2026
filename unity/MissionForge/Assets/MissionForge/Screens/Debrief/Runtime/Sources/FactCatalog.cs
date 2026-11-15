using System;
using System.Collections.Generic;
using Newtonsoft.Json.Linq;

namespace MissionForge.EndScreens.Sources
{
    /// <summary>
    /// Read-only view of data/facts.json for the end screens: status, citation key and URL per fact id. Lookups return null
    /// for a rejected fact, so a rejected fact can never reach a screen.
    /// </summary>
    public sealed class FactCatalog
    {
        private readonly Dictionary<string, FactView> _byId = new Dictionary<string, FactView>(StringComparer.Ordinal);
        private readonly List<FactView> _shown = new List<FactView>();

        public static FactCatalog Parse(string factsJson)
        {
            var catalog = new FactCatalog();
            if (string.IsNullOrEmpty(factsJson)) return catalog;
            JObject root = JObject.Parse(factsJson);
            foreach (JToken f in (root["facts"] as JArray) ?? new JArray())
            {
                string id = (string)f["id"];
                if (string.IsNullOrEmpty(id)) continue;
                var view = new FactView(id, (string)f["topic_key"] ?? "fact." + id + ".topic", (string)f["text_key"] ?? "fact." + id + ".text",
                    (string)f["source_key"] ?? "fact." + id + ".source", (string)f["source_url"] ?? "", ParseStatus((string)f["status"]));
                catalog._byId[id] = view;
                if (view.Status != FactStatus.Rejected) catalog._shown.Add(view);
            }
            return catalog;
        }

        /// <summary>Every fact that may be shown (not rejected), in file order.</summary>
        public IReadOnlyList<FactView> Shown => _shown;

        /// <summary>The fact, or null when it is unknown or rejected.</summary>
        public FactView Find(string id)
        {
            if (id == null || !_byId.TryGetValue(id, out FactView view)) return null;
            return view.Status == FactStatus.Rejected ? null : view;
        }

        /// <summary>Maps ids to showable facts, dropping unknown and rejected ones and duplicates.</summary>
        public IReadOnlyList<FactView> Showable(IEnumerable<string> ids)
        {
            var list = new List<FactView>();
            var seen = new HashSet<string>(StringComparer.Ordinal);
            if (ids == null) return list;
            foreach (string id in ids)
            {
                FactView view = Find(id);
                if (view != null && seen.Add(id)) list.Add(view);
            }
            return list;
        }

        public static FactStatus ParseStatus(string status)
        {
            switch (status)
            {
                case "verified": return FactStatus.Verified;
                case "rejected": return FactStatus.Rejected;
                default: return FactStatus.Unverified;
            }
        }
    }
}
