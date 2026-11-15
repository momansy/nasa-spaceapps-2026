using System.IO;
using System.Linq;
using UnityEditor;
using UnityEditor.Build.Reporting;
using UnityEngine;

namespace MissionForge.Screens.Flight.Editor
{
    /// <summary>
    /// T016 builds into the git-ignored unity/MissionForge/Builds/: a macOS rehearsal player that opens on the
    /// countdown (evidence: <c>-mfFlightShots &lt;dir&gt;</c>), and a WebGL build that opens on the countdown.
    /// Batch: <c>-executeMethod MissionForge.Screens.Flight.Editor.FlightBuilds.MacEvidence</c> / <c>.WebGL</c>.
    /// </summary>
    public static class FlightBuilds
    {
        private const string Countdown = "Assets/MissionForge/Scenes/MF_Countdown.unity";

        public static string BuildsRoot => Path.GetFullPath(Path.Combine(Application.dataPath, "..", "Builds"));

        private static string[] Scenes()
        {
            var scenes = EditorBuildSettings.scenes.Where(s => s.enabled).Select(s => s.path).ToList();
            scenes.Remove(Countdown);
            scenes.Insert(0, Countdown);
            return scenes.ToArray();
        }

        [MenuItem("MissionForge/Flight/Build macOS Evidence Player")]
        public static void MacEvidence() => Build(BuildTarget.StandaloneOSX, Path.Combine(BuildsRoot, "T016-mac", "MissionForgeFlight.app"));

        [MenuItem("MissionForge/Flight/Build WebGL")]
        public static void WebGL() => Build(BuildTarget.WebGL, Path.Combine(BuildsRoot, "T016-webgl"));

        private static void Build(BuildTarget target, string output)
        {
            BuildReport report = BuildPipeline.BuildPlayer(new BuildPlayerOptions
            {
                scenes = Scenes(),
                locationPathName = output,
                target = target,
                options = FlightSession.Arg("-mfDev") != null ? BuildOptions.Development : BuildOptions.None,
                extraScriptingDefines = new[] { "MF_REHEARSAL" },
            });
            Debug.Log("[MissionForge] T016 build " + target + ": " + report.summary.result + ", " + report.summary.totalErrors
                + " errors, " + (report.summary.totalSize / (1024 * 1024)) + " MB, " + report.summary.totalTime + " -> " + output);
            if (Application.isBatchMode) EditorApplication.Exit(report.summary.result == BuildResult.Succeeded ? 0 : 1);
        }
    }
}
