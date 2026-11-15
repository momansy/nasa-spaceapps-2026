using System;
using System.Collections;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Text;
using MissionForge.App;
using MissionForge.EndScreens.Sources;
using MissionForge.Screens.Debrief;
using MissionForge.UI;
using UnityEngine;

namespace MissionForge.EndScreens.Evidence
{
    /// <summary>
    /// Desktop evidence pass for T024, inert unless the player starts with <c>-mfEndShots &lt;folder&gt;</c>. It opens the host
    /// straight on the Debrief (the shell's first screen is switched before SceneFlow starts), steps the end screens through
    /// the states of the brief's evidence list, writes one PNG per state, measures frame times and quits. Never in WebGL.
    /// </summary>
    public sealed partial class EndScreensEvidence : MonoBehaviour
    {
        private const float SettleSeconds = 1.2f;
        private const float CountUpSeconds = 3.2f;
        private const float FpsSampleSeconds = 6f;

        private string _folder;
        private SceneFlow _flow;
        private readonly StringBuilder _log = new StringBuilder();

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
        private static void Boot()
        {
            if (Application.isEditor) return;
            string folder = CommandLine.Value("-mfEndShots");
            if (string.IsNullOrEmpty(folder)) return;
            SceneFlow flow = FindAnyObjectByType<SceneFlow>();
            if (flow == null) return;
            // Evidence only: open on the Debrief instead of the Title (SceneFlow has not run Start yet).
            FieldInfo first = typeof(SceneFlow).GetField("firstScreen", BindingFlags.NonPublic | BindingFlags.Instance);
            first?.SetValue(flow, ScreenId.Debrief);
            var go = new GameObject("T024 Evidence");
            DontDestroyOnLoad(go);
            var runner = go.AddComponent<EndScreensEvidence>();
            runner._folder = Path.GetFullPath(folder);
            runner._flow = flow;
            // Evidence never writes the real host preferences.
            MissionForge.Settings.HostPreferences.SetCurrent(new MissionForge.Settings.HostPreferences(new MissionForge.Settings.MemoryPreferenceStore()));
        }

        private IEnumerator Start()
        {
            Directory.CreateDirectory(_folder);
            Log("Unity " + Application.unityVersion + ", " + SystemInfo.operatingSystem + ", " + SystemInfo.processorType + ", " + SystemInfo.graphicsDeviceName
                + ", screen " + Screen.width + " × " + Screen.height);
            yield return new WaitUntil(() => _flow.Current != null && !_flow.IsBusy);
            yield return new WaitForSecondsRealtime(2f);

            foreach (Func<IEnumerator> step in Steps())
            {
                IEnumerator routine = null;
                try { routine = step(); }
                catch (Exception e) { Log("step failed: " + e.Message); }
                if (routine != null) yield return Guard(routine);
            }

            File.WriteAllText(Path.Combine(_folder, "evidence_log.txt"), _log.ToString());
            yield return new WaitForSecondsRealtime(0.5f);
            Application.Quit(0);
        }

        private IEnumerator Guard(IEnumerator routine)
        {
            while (true)
            {
                object current;
                try
                {
                    if (!routine.MoveNext()) yield break;
                    current = routine.Current;
                }
                catch (Exception e)
                {
                    Log("step failed: " + e);
                    yield break;
                }
                yield return current;
            }
        }

        /// <summary>The evidence states in order; the other end screens add theirs in partial files.</summary>
        private IEnumerable<Func<IEnumerator>> Steps()
        {
            yield return DebriefShots;
            foreach (Func<IEnumerator> s in MoreSteps()) yield return s;
        }

        private IEnumerator DebriefShots()
        {
            DebriefScreen debrief = FindAnyObjectByType<DebriefScreen>();
            yield return new WaitUntil(() => debrief.View != null);

            yield return Fixture(debrief, "c1_success", "debrief_success", true);
            yield return Fixture(debrief, "c1_failure_pogo", "debrief_failure", true);
            yield return Fixture(debrief, "ten_players", "debrief_10_players", true);
            yield return Fixture(debrief, "c3_crewed_partial", "debrief_c3_crewed_partial", true);

            // Reduced motion: the values are final on the first frame (no count-up), captured 0.3 s after binding.
            MfAccessibility.Set(false, false, false, true);
            debrief.ShowFixture("c1_success");
            yield return new WaitForSecondsRealtime(0.3f);
            yield return Shot("debrief_reduced_motion");
            MfAccessibility.Set(true, true, false, true);
            debrief.ShowFixture("c1_failure_pogo");
            yield return new WaitForSecondsRealtime(SettleSeconds);
            yield return Shot("debrief_200_rtl");
            MfAccessibility.Set(false, false, true, true);
            debrief.ShowFixture("c1_success");
            yield return new WaitForSecondsRealtime(SettleSeconds);
            yield return Shot("debrief_high_contrast");
            MfAccessibility.Set(false, false, false, false);

            // Keyboard / gamepad: the primary action has focus; navigation events move the visible Signal focus ring.
            yield return NavigationCheck(debrief);

            // Frame times while the formula counts up.
            debrief.ShowFixture("c1_success");
            yield return Fps("debrief (count-up running)");
        }

        private IEnumerator NavigationCheck(DebriefScreen debrief)
        {
            debrief.ShowFixture("c1_failure_pogo");
            yield return new WaitForSecondsRealtime(CountUpSeconds);
            UnityEngine.UIElements.UIDocument doc = debrief.GetComponent<UnityEngine.UIElements.UIDocument>();
            UnityEngine.UIElements.FocusController focus = doc.rootVisualElement.panel.focusController;
            var path = new List<string>();
            for (int i = 0; i < 4; i++)
            {
                var focused = focus.focusedElement as UnityEngine.UIElements.VisualElement;
                path.Add(focused?.name ?? "(none)");
                if (focused == null) break;
                using (var e = UnityEngine.UIElements.NavigationMoveEvent.GetPooled(UnityEngine.UIElements.NavigationMoveEvent.Direction.Left))
                {
                    e.target = focused;
                    focused.SendEvent(e);
                }
                yield return null;
                yield return null;
            }
            Log("keyboard focus path (Left ×3 from the first focus): " + string.Join(" → ", path));
            yield return Shot("debrief_keyboard_focus");
        }

        private IEnumerator Fixture(DebriefScreen debrief, string fixture, string shot, bool waitCountUp)
        {
            debrief.ShowFixture(fixture);
            yield return new WaitForSecondsRealtime(waitCountUp ? CountUpSeconds : SettleSeconds);
            yield return Shot(shot);
        }

        public IEnumerator Shot(string name)
        {
            yield return new WaitForEndOfFrame();
            string path = Path.Combine(_folder, name + ".png");
            ScreenCapture.CaptureScreenshot(path);
            yield return null;
            yield return new WaitForSecondsRealtime(0.4f);
            Log("shot " + name + ".png (" + Screen.width + " × " + Screen.height + ")");
        }

        public IEnumerator Fps(string label)
        {
            var frames = new List<float>();
            float until = Time.realtimeSinceStartup + FpsSampleSeconds;
            while (Time.realtimeSinceStartup < until)
            {
                yield return null;
                frames.Add(Time.unscaledDeltaTime);
            }
            frames.Sort();
            float median = frames.Count == 0 ? 0f : frames[frames.Count / 2];
            float p95 = frames.Count == 0 ? 0f : frames[Mathf.Min(frames.Count - 1, (int)(frames.Count * 0.95f))];
            Log(string.Format(CultureInfo.InvariantCulture, "fps {0}: median {1:F1} fps ({2:F2} ms), 95th percentile frame {3:F2} ms, {4} frames at {5} × {6}",
                label, median > 0f ? 1f / median : 0f, median * 1000f, p95 * 1000f, frames.Count, Screen.width, Screen.height));
        }

        public SceneFlow Flow => _flow;

        public void Log(string line)
        {
            _log.AppendLine(line);
            Debug.Log("[T024 evidence] " + line);
        }
    }
}
