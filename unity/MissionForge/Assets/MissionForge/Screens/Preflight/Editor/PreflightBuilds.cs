using System.IO;
using System.Linq;
using UnityEditor;
using UnityEditor.Build.Reporting;
using UnityEngine;

namespace MissionForge.Screens.Preflight.Editor
{
    /// <summary>
    /// T027 evidence and check builds into the git-ignored unity/MissionForge/Builds/ folder (never docs/play/): a macOS
    /// development player (rehearsal compiled in through MF_REHEARSAL) for the -mfPreShots evidence pass, and a WebGL release build for the build check.
    /// Batch: -executeMethod MissionForge.Screens.Preflight.Editor.PreflightBuilds.MacEvidence (or .WebGL).
    /// </summary>
    public static class PreflightBuilds
    {
        private static string BuildsFolder => Path.GetFullPath(Path.Combine(Application.dataPath, "..", "Builds"));

        [MenuItem("MissionForge/T027/Build macOS evidence player")]
        public static void MacEvidence() => Run(BuildTarget.StandaloneOSX, Path.Combine(BuildsFolder, "T027-mac", "MissionForge.app"), BuildOptions.Development, true);

        [MenuItem("MissionForge/T027/Build WebGL (Builds/T027-webgl)")]
        public static void WebGL() => Run(BuildTarget.WebGL, Path.Combine(BuildsFolder, "T027-webgl"), BuildOptions.None, false);

        /// <summary>Evidence players compile the rehearsal drivers in through MF_REHEARSAL (labelled REHEARSAL on screen).</summary>
        private static void Run(BuildTarget target, string output, BuildOptions options, bool rehearsal)
        {
            string[] scenes = EditorBuildSettings.scenes.Where(s => s.enabled).Select(s => s.path).ToArray();
            BuildReport report = BuildPipeline.BuildPlayer(new BuildPlayerOptions
            {
                scenes = scenes, locationPathName = output, target = target, options = options,
                extraScriptingDefines = rehearsal ? new[] { "MF_REHEARSAL" } : new string[0],
            });
            BuildSummary s = report.summary;
            Debug.Log("[MissionForge] T027 " + target + " build " + s.result + " in " + s.totalTime.TotalSeconds.ToString("F0") + " s, "
                + (s.totalSize / (1024.0 * 1024.0)).ToString("F1") + " MiB, " + s.totalErrors + " errors → " + output);
            if (Application.isBatchMode) EditorApplication.Exit(s.result == BuildResult.Succeeded ? 0 : 1);
        }
    }
}
