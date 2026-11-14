using System;
using System.Collections.Generic;

namespace MissionForge.Data
{
    /// <summary>Loaded game data: relative path → raw JSON text. Core.Data parses it; Unity never interprets rules.</summary>
    public sealed class GameDataSet
    {
        private readonly Dictionary<string, string> _jsonByPath;

        public GameDataSet(Dictionary<string, string> jsonByPath)
        {
            _jsonByPath = jsonByPath ?? throw new ArgumentNullException(nameof(jsonByPath));
        }

        public IReadOnlyDictionary<string, string> JsonByPath => _jsonByPath;
        public int Count => _jsonByPath.Count;

        public bool TryGetText(string relativePath, out string json) => _jsonByPath.TryGetValue(relativePath, out json);

        public string GetText(string relativePath)
        {
            if (_jsonByPath.TryGetValue(relativePath, out string json)) return json;
            throw new KeyNotFoundException("Game data file not loaded: " + relativePath);
        }
    }
}
