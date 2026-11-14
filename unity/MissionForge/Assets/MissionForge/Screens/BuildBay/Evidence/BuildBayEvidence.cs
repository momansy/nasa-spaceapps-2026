#if !UNITY_WEBGL && (UNITY_EDITOR || MF_REHEARSAL)
using System;
using System.Collections;
using System.Collections.Generic;
using System.IO;
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

        private IEnumerator Run(string folder)
        {
            Directory.CreateDirectory(folder);
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
