using System;
using System.Collections.Generic;
using System.IO;
using MissionForge.Core.Scoring;

namespace MissionForge.Core.Tests.Scoring
{
    /// <summary>
    /// Reads the real <c>data/</c> files for the scoring tests (same repository walk as
    /// <c>Tests/Data/DesignFixture.cs</c>). Only test code reads files; Core never does.
    /// </summary>
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

        /// <summary>Every top-level <c>data/*.json</c> file, keyed by file name.</summary>
        public static Dictionary<string, string> Files()
        {
            var files = new Dictionary<string, string>(StringComparer.Ordinal);
            foreach (var f in Directory.GetFiles(DataDir, "*.json")) files[Path.GetFileName(f)] = File.ReadAllText(f);
            return files;
        }

        private static ScoringCatalog? cached;

        /// <summary>The catalog loaded from the real data (cached; the catalog is immutable).</summary>
        public static ScoringCatalog Catalog() => cached ??= ScoringCatalog.Load(Files());
    }
}
