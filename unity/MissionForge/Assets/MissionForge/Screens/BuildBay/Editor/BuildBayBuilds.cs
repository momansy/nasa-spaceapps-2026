using System.IO;
using System.Linq;
using UnityEditor;
using UnityEditor.Build;
using UnityEditor.Build.Reporting;
using UnityEngine;

namespace MissionForge.Screens.BuildBay.Editor
{
    /// <summary>
    /// T015 builds. All go to the git-ignored <c>unity/MissionForge/Builds/</c> (never <c>docs/play/</c>):
    /// the macOS evidence player (Build Bay first, rehearsal compiled in through <c>MF_REHEARSAL</c>) and a WebGL
    /// build for the frame-rate measurement.
    /// </summary>
    public static class BuildBayBuilds
    {
        public static string BuildsRoot => Path.GetFullPath(Path.Combine(Application.dataPath, "..", "Builds"));

        private static string[] Scenes()
        {
            var scenes = EditorBuildSettings.scenes.Where(s => s.enabled).Select(s => s.path).ToList();
            scenes.Remove(BuildBaySceneBuilder.ScenePath);
            scenes.Insert(0, BuildBaySceneBuilder.ScenePath); // the player opens on the Build Bay; AppRoot adds the Shell
            return scenes.ToArray();
        }

        [MenuItem("MissionForge/Build Bay/Build macOS Evidence Player")]
        public static void MacEvidence()
        {
            string output = Path.Combine(BuildsRoot, "BayEvidence", "BayEvidence.app");
            Report(BuildPipeline.BuildPlayer(new BuildPlayerOptions
            {
                scenes = Scenes(),
                locationPathName = output,
                target = BuildTarget.StandaloneOSX,
                options = BuildOptions.None,
                extraScriptingDefines = new[] { "MF_REHEARSAL" },
            }), output);
        }

        [MenuItem("MissionForge/Build Bay/Build WebGL (Builds/BayWebGL)")]
        public static void WebGL()
        {
            string output = Path.Combine(BuildsRoot, "BayWebGL");
            Report(BuildPipeline.BuildPlayer(new BuildPlayerOptions
            {
                scenes = Scenes(),
                locationPathName = output,
                target = BuildTarget.WebGL,
                options = BuildOptions.None,
                extraScriptingDefines = new[] { "MF_REHEARSAL" },
            }), output);
        }

        private static void Report(BuildReport report, string output)
        {
            BuildSummary s = report.summary;
            string text = "[MissionForge] Build " + s.platform + " › " + output + ": " + s.result + ", " + s.totalErrors + " errors, " +
                          s.totalWarnings + " warnings, " + (s.totalSize / (1024f * 1024f)).ToString("0.0") + " MiB, " + s.totalTime;
            Debug.Log(text);
            if (s.result != BuildResult.Succeeded) throw new BuildFailedException(text);
        }
    }
}
