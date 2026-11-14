using System;
using System.Collections.Generic;
using System.IO;
using UnityEditor;
using UnityEditor.Build;
using UnityEditor.Build.Reporting;
using UnityEngine;

namespace MissionForge.Data.Editor
{
    /// <summary>
    /// Copies the repository's data/ folder to Assets/StreamingAssets/data/ and writes index.json.
    /// Runs before entering Play mode and before every build, so the host always ships the
    /// current data (ARCHITECTURE.md section 4).
    /// </summary>
    [InitializeOnLoad]
    public sealed class GameDataSync : IPreprocessBuildWithReport
    {
        private const string JsonPattern = "*.json";

        static GameDataSync()
        {
            EditorApplication.playModeStateChanged += state =>
            {
                if (state == PlayModeStateChange.ExitingEditMode) SyncProject();
            };
        }

        public int callbackOrder => -100;

        public void OnPreprocessBuild(BuildReport report) => SyncProject();

        /// <summary>Repository data/ folder: three levels above Assets (unity/MissionForge/Assets → repo root).</summary>
        public static string RepositoryDataPath =>
            Path.GetFullPath(Path.Combine(Application.dataPath, "..", "..", "..", GameDataIndex.FolderName));

        public static string StreamingDataPath =>
            Path.Combine(Application.dataPath, "StreamingAssets", GameDataIndex.FolderName);

        [MenuItem("MissionForge/Sync Game Data")]
        public static void SyncProject()
        {
            int count = Sync(RepositoryDataPath, StreamingDataPath);
            AssetDatabase.Refresh();
            if (count == 0)
            {
                Debug.Log("[MissionForge] No game data found at " + RepositoryDataPath + "; wrote an empty index.");
            }
        }

        /// <summary>
        /// Mirrors every .json under <paramref name="sourceDirectory"/> (except the schema folder) into
        /// <paramref name="targetDirectory"/> and writes the index. Returns the number of files copied.
        /// A missing source produces an empty index rather than an error, so the host still starts.
        /// </summary>
        public static int Sync(string sourceDirectory, string targetDirectory)
        {
            Directory.CreateDirectory(targetDirectory);
            var index = new GameDataIndex();
            var keep = new HashSet<string>(StringComparer.Ordinal);

            if (Directory.Exists(sourceDirectory))
            {
                string[] sources = Directory.GetFiles(sourceDirectory, JsonPattern, SearchOption.AllDirectories);
                Array.Sort(sources, StringComparer.Ordinal);
                foreach (string source in sources)
                {
                    string relative = source.Substring(sourceDirectory.Length).TrimStart(Path.DirectorySeparatorChar, '/').Replace('\\', '/');
                    if (relative.StartsWith("schema/", StringComparison.Ordinal)) continue; // Schemas are a build-time concern.
                    if (relative == GameDataIndex.FileName) continue;
                    string target = Path.Combine(targetDirectory, relative.Replace('/', Path.DirectorySeparatorChar));
                    Directory.CreateDirectory(Path.GetDirectoryName(target));
                    File.Copy(source, target, true);
                    index.Files.Add(relative);
                    keep.Add(Path.GetFullPath(target));
                }
            }

            // Remove stale copies so a deleted data file does not linger in builds.
            foreach (string existing in Directory.GetFiles(targetDirectory, JsonPattern, SearchOption.AllDirectories))
            {
                string full = Path.GetFullPath(existing);
                if (Path.GetFileName(full) == GameDataIndex.FileName && Path.GetDirectoryName(full) == Path.GetFullPath(targetDirectory)) continue;
                if (!keep.Contains(full)) File.Delete(full);
            }

            File.WriteAllText(Path.Combine(targetDirectory, GameDataIndex.FileName), index.ToJson());
            return index.Files.Count;
        }
    }
}
