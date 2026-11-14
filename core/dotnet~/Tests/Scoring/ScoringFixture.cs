using System;
using System.Collections.Generic;
using System.IO;
using MissionForge.Core.Scoring;

namespace MissionForge.Core.Tests.Scoring
{
    /// <summary>Loads the real <c>data/</c> scoring files (own repo-walk helper, as T011 asks). Only test code reads files.</summary>
    public static class ScoringFixture
    {
        /// <summary>The repository <c>data/</c> folder, found by walking up from the test binaries.</summary>
        public static string DataDir
        {
            get
            {
                var dir = new DirectoryInfo(AppContext.BaseDirectory);
                while (dir != null)
                {
                    if (File.Exists(Path.Combine(dir.FullName, "data", "scoring.json"))) return Path.Combine(dir.FullName, "data");
                    dir = dir.Parent;
                }
                throw new InvalidOperationException("data/scoring.json not found above " + AppContext.BaseDirectory);
            }
        }

        /// <summary>The five files <see cref="ScoringCatalog.Load"/> reads.</summary>
        public static Dictionary<string, string> Files()
        {
            var files = new Dictionary<string, string>(StringComparer.Ordinal);
            foreach (var name in new[] { "boosts.json", "scoring.json", "awards.json", "assist_levels.json", "contracts.json" })
                files[name] = File.ReadAllText(Path.Combine(DataDir, name));
            return files;
        }

        private static ScoringCatalog? _catalog;

        /// <summary>The catalog of the real data, loaded once.</summary>
        public static ScoringCatalog Catalog => _catalog ??= ScoringCatalog.Load(Files());
    }
}
