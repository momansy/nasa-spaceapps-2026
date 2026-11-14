using System;
using System.Collections.Generic;
using Newtonsoft.Json;

namespace MissionForge.Data
{
    /// <summary>
    /// The flat string table for one language. The catalog splits each language over several
    /// files (<c>strings/en.json</c>, <c>strings/en.content.json</c>, <c>strings/en.parts_a.json</c>, ...);
    /// this merges every <c>strings/&lt;lang&gt;*.json</c> in ordinal path order. A key defined in
    /// two files is a data error: the first file keeps it and the clash is listed in <see cref="Conflicts"/>.
    /// </summary>
    public sealed class GameStrings
    {
        public const string Folder = "strings/";
        public const string DefaultLanguage = "en";

        private readonly Dictionary<string, string> _byKey;

        private GameStrings(string language, Dictionary<string, string> byKey, List<string> files, List<string> conflicts)
        {
            Language = language;
            _byKey = byKey;
            Files = files;
            Conflicts = conflicts;
        }

        public string Language { get; }
        public int Count => _byKey.Count;

        /// <summary>The string files merged, in merge order.</summary>
        public IReadOnlyList<string> Files { get; }

        /// <summary>"key (fileA, fileB)" for every key defined more than once.</summary>
        public IReadOnlyList<string> Conflicts { get; }

        public bool TryGet(string key, out string text) => _byKey.TryGetValue(key, out text);

        /// <summary>The text for <paramref name="key"/>, or the key itself in brackets so a missing string is visible, never blank.</summary>
        public string Get(string key) => _byKey.TryGetValue(key, out string text) ? text : "[" + key + "]";

        /// <summary>True for <c>strings/en.json</c> and <c>strings/en.*.json</c>, false for <c>strings/en_gb.json</c> or <c>strings/es.json</c>.</summary>
        public static bool IsStringFile(string relativePath, string language)
        {
            if (relativePath == null || !relativePath.StartsWith(Folder, StringComparison.Ordinal)) return false;
            string name = relativePath.Substring(Folder.Length);
            if (name.IndexOf('/') >= 0 || !name.EndsWith(".json", StringComparison.Ordinal)) return false;
            return name == language + ".json" || name.StartsWith(language + ".", StringComparison.Ordinal);
        }

        public static GameStrings Merge(GameDataSet data, string language = DefaultLanguage)
        {
            if (data == null) throw new ArgumentNullException(nameof(data));
            var paths = new List<string>();
            foreach (string path in data.JsonByPath.Keys)
            {
                if (IsStringFile(path, language)) paths.Add(path);
            }
            paths.Sort(StringComparer.Ordinal);

            var byKey = new Dictionary<string, string>(StringComparer.Ordinal);
            var source = new Dictionary<string, string>(StringComparer.Ordinal);
            var conflicts = new List<string>();
            foreach (string path in paths)
            {
                Dictionary<string, string> table;
                try
                {
                    table = JsonConvert.DeserializeObject<Dictionary<string, string>>(data.GetText(path));
                }
                catch (JsonException e)
                {
                    throw new FormatException("String file " + path + " is not a flat JSON object of strings: " + e.Message, e);
                }
                if (table == null) continue;
                foreach (KeyValuePair<string, string> entry in table)
                {
                    if (source.TryGetValue(entry.Key, out string first))
                    {
                        conflicts.Add(entry.Key + " (" + first + ", " + path + ")");
                        continue;
                    }
                    byKey[entry.Key] = entry.Value;
                    source[entry.Key] = path;
                }
            }
            return new GameStrings(language, byKey, paths, conflicts);
        }
    }
}
