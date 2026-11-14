using System;
using System.IO;
using System.Linq;
using System.Text;
using UnityEditor;
using UnityEditor.Build;
using UnityEditor.Build.Reporting;
using UnityEngine;

namespace MissionForge
{
    /// <summary>
    /// Build entry points. <c>MissionForge.Build.WebGL</c> builds the host to the repository's
    /// docs/play/host/ folder, gzip with the decompression fallback so any static host can serve it
    /// without special headers (files stay well under the 49 MB publish limit).
    /// Batch mode: Unity -batchmode -quit -projectPath unity/MissionForge -buildTarget WebGL -executeMethod MissionForge.Build.WebGL
    /// </summary>
    public static class Build
    {
        private const string SummaryFileName = "webgl-build-summary.txt";

        /// <summary>Repository root: two levels above the Unity project (unity/MissionForge → repo).</summary>
        public static string RepositoryRoot => Path.GetFullPath(Path.Combine(Application.dataPath, "..", "..", ".."));

        public static string WebGLOutputPath => Path.Combine(RepositoryRoot, "docs", "play", "host");

        [MenuItem("MissionForge/Build/WebGL (docs/play/host)")]
        public static void WebGL()
        {
            string[] scenes = EditorBuildSettings.scenes.Where(s => s.enabled).Select(s => s.path).ToArray();
            if (scenes.Length == 0) throw new BuildFailedException("No scenes in Build Settings. Run MissionForge/Rebuild Scenes And Assets first.");

            PlayerSettings.WebGL.compressionFormat = WebGLCompressionFormat.Gzip;
            PlayerSettings.WebGL.decompressionFallback = true; // Any static host works: the loader inflates .gz itself when Content-Encoding is missing.
            PlayerSettings.WebGL.template = "PROJECT:MissionForge";
            PlayerSettings.WebGL.dataCaching = true;
            PlayerSettings.SetManagedStrippingLevel(NamedBuildTarget.WebGL, ManagedStrippingLevel.Minimal);

            // Stale files from a build with other settings (for example uncompressed) must not linger.
            string staleBuild = Path.Combine(WebGLOutputPath, "Build");
            if (Directory.Exists(staleBuild)) Directory.Delete(staleBuild, true);

            var options = new BuildPlayerOptions
            {
                scenes = scenes,
                locationPathName = WebGLOutputPath,
                target = BuildTarget.WebGL,
                options = BuildOptions.None,
            };

            BuildReport report = BuildPipeline.BuildPlayer(options);
            string summary = Summarise(report, scenes);
            string summaryPath = Path.Combine(Application.dataPath, "..", "Logs", SummaryFileName);
            Directory.CreateDirectory(Path.GetDirectoryName(summaryPath));
            File.WriteAllText(summaryPath, summary);
            Debug.Log("[MissionForge] WebGL build " + report.summary.result + "\n" + summary);

            if (report.summary.result != BuildResult.Succeeded)
            {
                if (Application.isBatchMode) EditorApplication.Exit(1);
                throw new BuildFailedException("WebGL build failed: " + report.summary.result);
            }
        }

        /// <summary>
        /// Look-development player for evidence screenshots (macOS, Metal) into Logs/lookdev/ (git-ignored).
        /// Run it with -mfShot (see EvidenceDirector). Not a release target.
        /// </summary>
        [MenuItem("MissionForge/Build/macOS look-dev player")]
        public static void MacLookDev()
        {
            string[] scenes = EditorBuildSettings.scenes.Where(s => s.enabled).Select(s => s.path).ToArray();
            string output = Path.GetFullPath(Path.Combine(Application.dataPath, "..", "Logs", "lookdev", "MissionForge.app"));
            BuildReport report = BuildPipeline.BuildPlayer(new BuildPlayerOptions
            {
                scenes = scenes,
                locationPathName = output,
                target = BuildTarget.StandaloneOSX,
                options = BuildOptions.None,
            });
            Debug.Log("[MissionForge] macOS look-dev build " + report.summary.result + " → " + output);
            if (report.summary.result != BuildResult.Succeeded && Application.isBatchMode) EditorApplication.Exit(1);
        }

        private static string Summarise(BuildReport report, string[] scenes)
        {
            BuildSummary s = report.summary;
            var text = new StringBuilder();
            text.AppendLine("MissionForge WebGL build summary");
            text.AppendLine("Result:        " + s.result);
            text.AppendLine("Unity:         " + Application.unityVersion);
            text.AppendLine("Target:        " + s.platform);
            text.AppendLine("Output:        docs/play/host");
            text.AppendLine("Started (UTC): " + s.buildStartedAt.ToUniversalTime().ToString("u"));
            text.AppendLine("Duration:      " + s.totalTime.TotalSeconds.ToString("F0") + " s");
            text.AppendLine("Total size:    " + (s.totalSize / (1024.0 * 1024.0)).ToString("F2") + " MiB (" + s.totalSize + " bytes)");
            text.AppendLine("Errors:        " + s.totalErrors);
            text.AppendLine("Warnings:      " + s.totalWarnings);
            text.AppendLine("Compression:   " + PlayerSettings.WebGL.compressionFormat);
            text.AppendLine("Scenes (" + scenes.Length + "):");
            foreach (string scene in scenes) text.AppendLine("  " + scene);

            if (Directory.Exists(WebGLOutputPath))
            {
                text.AppendLine("Output files:");
                foreach (string file in Directory.GetFiles(WebGLOutputPath, "*", SearchOption.AllDirectories).OrderBy(f => f, StringComparer.Ordinal))
                {
                    long bytes = new FileInfo(file).Length;
                    string relative = file.Substring(WebGLOutputPath.Length + 1).Replace('\\', '/');
                    text.AppendLine("  " + relative.PadRight(48) + (bytes / (1024.0 * 1024.0)).ToString("F2").PadLeft(8) + " MiB");
                }
            }
            return text.ToString();
        }
    }
}
