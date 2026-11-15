#if !UNITY_WEBGL && (UNITY_EDITOR || MF_REHEARSAL)
using System;
using System.Collections;
using System.Collections.Generic;
using System.IO;
using Unity.Profiling;
using UnityEngine;

namespace MissionForge.Screens.BuildBay
{
    /// <summary>
    /// Desktop evidence tool for T015, inert unless the player starts with <c>-mfBayShots &lt;folder&gt;</c>: steps the
    /// Build Bay through the states of the brief's evidence list, writes one 1920 × 1080 PNG per state and quits.
    /// Never compiled into WebGL or release builds.
    /// </summary>
    public sealed class BuildBayEvidence : MonoBehaviour
    {
        /// <summary>One evidence state: a name (file name) and a routine that sets it up.</summary>
        public readonly struct Shot
        {
            public Shot(string name, Func<BuildBayScreen, IEnumerator> setup, float settleSeconds = 1.5f)
            {
                Name = name;
                Setup = setup;
                SettleSeconds = settleSeconds;
            }

            public string Name { get; }
            public Func<BuildBayScreen, IEnumerator> Setup { get; }
            public float SettleSeconds { get; }
        }

        /// <summary>Evidence states in order; other partial classes of the screen add theirs.</summary>
        public static readonly List<Shot> Shots = new List<Shot>();

        private BuildBayScreen _screen;

        /// <summary>The <c>-mfBayShots</c> output folder of the running evidence pass.</summary>
        public static string Folder { get; private set; }

        /// <summary>Optional action run right after the next capture (e.g. resume a paused rehearsal).</summary>
        public static Action AfterCapture;

        public static void Attach(BuildBayScreen screen)
        {
            string folder = BuildBayScreen.Argument("-mfBayShots");
            if (string.IsNullOrEmpty(folder) || Application.isEditor) return;
            var runner = screen.gameObject.AddComponent<BuildBayEvidence>();
            runner._screen = screen;
            runner.StartCoroutine(runner.Run(folder));
        }

        // Render counters (T034 rework, M9): visible triangles and draw calls of the last rendered frame, against the
        // VISUAL_TARGET Build Bay budget of 1 800 000 triangles and 600 draw calls at 1920 x 1080.
        private ProfilerRecorder _tris, _draws, _batches, _setPass;

        private void OnEnable()
        {
            _tris = ProfilerRecorder.StartNew(ProfilerCategory.Render, "Triangles Count");
            _draws = ProfilerRecorder.StartNew(ProfilerCategory.Render, "Draw Calls Count");
            _batches = ProfilerRecorder.StartNew(ProfilerCategory.Render, "Batches Count");
            _setPass = ProfilerRecorder.StartNew(ProfilerCategory.Render, "SetPass Calls Count");
        }

        private void OnDisable()
        {
            _tris.Dispose();
            _draws.Dispose();
            _batches.Dispose();
            _setPass.Dispose();
        }

        /// <summary>
        /// Logs the engine counters (every pass of the last frame: shadow cascades, depth-normals prepass, main, UI) and a
        /// main-view estimate: triangles and submesh draws of the enabled mesh renderers whose bounds meet the main
        /// camera frustum (what VISUAL_TARGET's "visible triangles / draw calls" budget describes), plus the five
        /// heaviest of them.
        /// </summary>
        private void LogRenderStats(string shot)
        {
            Debug.Log("[MissionForge] Render stats " + shot + ": triangles=" + _tris.LastValue + " drawCalls=" + _draws.LastValue +
                      " batches=" + _batches.LastValue + " setPass=" + _setPass.LastValue + " valid=" + _tris.Valid);
            Camera cam = Camera.main;
            if (cam == null) return;
            Plane[] planes = GeometryUtility.CalculateFrustumPlanes(cam);
            long tris = 0, draws = 0, shadowTris = 0;
            var heavy = new List<(long tris, string name)>();
            foreach (MeshRenderer r in FindObjectsByType<MeshRenderer>())
            {
                if (!r.enabled || !r.gameObject.activeInHierarchy || !GeometryUtility.TestPlanesAABB(planes, r.bounds)) continue;
                var f = r.GetComponent<MeshFilter>();
                Mesh m = f != null ? f.sharedMesh : null;
                if (m == null) continue;
                long t = 0;
                for (int i = 0; i < m.subMeshCount; i++) t += (long)m.GetIndexCount(i) / 3;
                tris += t;
                draws += m.subMeshCount;
                if (r.shadowCastingMode != UnityEngine.Rendering.ShadowCastingMode.Off) shadowTris += t;
                heavy.Add((t, r.name));
            }
            heavy.Sort((a, b) => b.tris.CompareTo(a.tris));
            var top = new System.Text.StringBuilder();
            for (int i = 0; i < Mathf.Min(5, heavy.Count); i++) top.Append(heavy[i].name).Append('=').Append(heavy[i].tris).Append(' ');
            Debug.Log("[MissionForge] Main-view stats " + shot + ": visibleTriangles=" + tris + " visibleDraws=" + draws +
                      " shadowCasterTriangles=" + shadowTris + " heaviest: " + top);
        }

        private IEnumerator Run(string folder)
        {
            Directory.CreateDirectory(folder);
            Folder = folder;
            string only = BuildBayScreen.Argument("-mfBayOnly");
            yield return new WaitForSecondsRealtime(3f); // camera blend and first layout
            foreach (Shot shot in Shots)
            {
                if (!string.IsNullOrEmpty(only) && !System.Array.Exists(only.Split(','), o => shot.Name.Contains(o))) continue;
                Debug.Log("[MissionForge] Evidence state " + shot.Name);
                if (shot.Setup != null) yield return shot.Setup(_screen);
                yield return new WaitForSecondsRealtime(shot.SettleSeconds);
                yield return new WaitForEndOfFrame();
                string path = Path.Combine(folder, shot.Name + ".png");
                Texture2D frame = ScreenCapture.CaptureScreenshotAsTexture();
                File.WriteAllBytes(path, frame.EncodeToPNG());
                Debug.Log("[MissionForge] Evidence shot " + path + " " + frame.width + "x" + frame.height);
                LogRenderStats(shot.Name);
                Destroy(frame);
                Action after = AfterCapture;
                AfterCapture = null;
                after?.Invoke();
            }
            Debug.Log("[MissionForge] Evidence complete.");
            if (BuildBayScreen.Flag("-mfBayStay")) yield break;
            Application.Quit(0);
        }
    }
}
#endif
