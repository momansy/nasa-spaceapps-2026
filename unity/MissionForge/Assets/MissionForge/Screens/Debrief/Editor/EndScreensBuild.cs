using System.IO;
using System.Linq;
using UnityEditor;
using UnityEditor.Build.Reporting;
using UnityEngine;

namespace MissionForge.EndScreens.Editor
{
    /// <summary>
    /// T024 evidence and performance builds into the git-ignored unity/MissionForge/Builds/ folder (never docs/play/):
    /// a macOS development player for the -mfEndShots evidence pass, and a WebGL build for the build check.
    /// Batch: -executeMethod MissionForge.EndScreens.Editor.EndScreensBuild.MacEvidence (or .WebGL).
    /// </summary>
    public static class EndScreensBuild
    {
        private static string BuildsFolder => Path.GetFullPath(Path.Combine(Application.dataPath, "..", "Builds"));

        [MenuItem("MissionForge/T024/Build macOS evidence player")]
        public static void MacEvidence() => Run(BuildTarget.StandaloneOSX, Path.Combine(BuildsFolder, "T024-mac", "MissionForge.app"), BuildOptions.Development);

        [MenuItem("MissionForge/T024/Build macOS performance player (release)")]
        public static void MacRelease() => Run(BuildTarget.StandaloneOSX, Path.Combine(BuildsFolder, "T024-mac-release", "MissionForge.app"), BuildOptions.None);

        [MenuItem("MissionForge/T024/Build WebGL (Builds/T024-webgl)")]
        public static void WebGL() => Run(BuildTarget.WebGL, Path.Combine(BuildsFolder, "T024-webgl"), BuildOptions.None);

        private static void Run(BuildTarget target, string output, BuildOptions options)
        {
            string[] scenes = EditorBuildSettings.scenes.Where(s => s.enabled).Select(s => s.path).ToArray();
            BuildReport report = BuildPipeline.BuildPlayer(new BuildPlayerOptions
            {
                scenes = scenes,
                locationPathName = output,
                target = target,
                options = options,
            });
            BuildSummary s = report.summary;
            Debug.Log("[MissionForge] T024 " + target + " build " + s.result + " in " + s.totalTime.TotalSeconds.ToString("F0") + " s, "
                + (s.totalSize / (1024.0 * 1024.0)).ToString("F1") + " MiB, " + s.totalErrors + " errors, " + s.totalWarnings + " warnings → " + output);
            if (Application.isBatchMode) EditorApplication.Exit(s.result == BuildResult.Succeeded ? 0 : 1);
        }
    }
}
