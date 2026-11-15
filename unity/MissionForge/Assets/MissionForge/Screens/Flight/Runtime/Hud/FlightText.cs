using System.Collections.Generic;
using MissionForge.App;
using Newtonsoft.Json;
using UnityEngine;

namespace MissionForge.Screens.Flight
{
    /// <summary>
    /// Player-visible text for the flight screens. Looks the key up in the game strings (data/strings, current
    /// language) first, then in this screen's English table <c>Resources/FlightStrings/en.json</c> (the ui.flight.*
    /// keys are not in data/strings yet; data/ is read-only for T016). Never returns debug brackets for a known key.
    /// </summary>
    public static class FlightText
    {
        private static Dictionary<string, string> _local;

        public static string Get(string key)
        {
            if (string.IsNullOrEmpty(key)) return "";
            AppRoot app = AppRoot.Instance;
            if (app != null && app.Data != null && app.Data.Strings != null && app.Data.Strings.TryGet(key, out string s)) return s;
            if (Local.TryGetValue(key, out string l)) return l;
            return key;
        }

        public static string Format(string key, params object[] args) => string.Format(Get(key), args);

        public static bool Has(string key)
        {
            AppRoot app = AppRoot.Instance;
            if (app != null && app.Data != null && app.Data.Strings != null && app.Data.Strings.TryGet(key, out _)) return true;
            return Local.ContainsKey(key);
        }

        private static Dictionary<string, string> Local
        {
            get
            {
                if (_local != null) return _local;
                TextAsset asset = Resources.Load<TextAsset>("FlightStrings/en");
                _local = asset != null
                    ? JsonConvert.DeserializeObject<Dictionary<string, string>>(asset.text) ?? new Dictionary<string, string>()
                    : new Dictionary<string, string>();
                return _local;
            }
        }
    }
}
