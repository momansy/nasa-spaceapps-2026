#if !UNITY_WEBGL && (UNITY_EDITOR || MF_REHEARSAL)
using System.Collections;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using MissionForge.App;
using UnityEngine;

namespace MissionForge.Screens.Flight
{
    /// <summary>
    /// Desktop evidence pass for T016, inert unless the player starts with <c>-mfFlightShots &lt;folder&gt;</c>.
    /// Lets the real rehearsal flow run (countdown → flight → orbit map) on CoreFlightFeed and saves 1920×1080 frames
    /// at the brief's moments, plus a frame-time note (median FPS during lift-off and in orbit). Quits when done.
    /// </summary>
    public sealed class FlightEvidence : MonoBehaviour
    {
        private string _folder;
        private readonly List<float> _liftoffFrames = new List<float>();
        private readonly List<float> _orbitFrames = new List<float>();
        private readonly List<string> _log = new List<string>();

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
        private static void Attach()
        {
            string folder = FlightSession.Arg("-mfFlightShots");
            if (string.IsNullOrEmpty(folder)) return;
            Directory.CreateDirectory(folder);
            var go = new GameObject("MF_FlightEvidence");
            DontDestroyOnLoad(go);
            go.AddComponent<FlightEvidence>()._folder = folder;
        }

        private IEnumerator Start()
        {
            yield return WaitFor(() => FlightSession.Feed != null && FlightSession.IsRunning, 120);
            yield return WaitMet(-4.5);
            yield return Shot("01-countdown-venting");
            yield return WaitMet(2.0);
            yield return Shot("02-liftoff-pad-cam");
            yield return WaitFor(() => Screen != null && Screen.Minigames != null && Screen.Minigames.Current != null
                && Screen.Minigames.Current.State == MinigameRunState.Playing, 90);
            yield return new WaitForSecondsRealtime(2f);
            yield return Shot("03-minigame-banner-bullet-time");
            Cameras(FlightShot.Telescope);
            yield return WaitMet(22);
            yield return Shot("04-tracking-telescope");
            Cameras(FlightShot.Chase);
            yield return WaitFor(() => Feed.mach >= 0.97, 300);
            yield return Shot("05-condensation-collar-near-max-q");
            yield return WaitMet(105);
            yield return Shot("06-ascent-hud");
            yield return WaitFor(() => Feed.stageIndex >= 1, 300);
            Cameras(FlightShot.Onboard);
            yield return new WaitForSecondsRealtime(0.6f);
            yield return Shot("07-staging-onboard");
            Cameras(FlightShot.Chase);
            yield return new WaitForSecondsRealtime(1.6f);
            yield return Shot("08-staging-chase");
            yield return WaitFor(() => Feed.fairingJettisoned, 300);
            yield return new WaitForSecondsRealtime(0.9f);
            yield return Shot("09-fairing-jettison");
            yield return WaitFor(() => Feed.phase == "F8", 900);
            yield return new WaitForSecondsRealtime(3f);
            yield return Shot("10-orbit-chase-earth-limb");
            if (AppRoot.Instance != null) AppRoot.Instance.Flow.ShowWithinPhase(ScreenId.OrbitMap);
            yield return new WaitForSecondsRealtime(4.5f);
            yield return Shot("11-orbit-map");
            WriteNote();
            Application.Quit(0);
        }

        private void Update()
        {
            FlightTelemetry t = FlightSession.Feed?.Current;
            if (t == null) return;
            if (t.IsLifted && t.metS < 20) _liftoffFrames.Add(Time.unscaledDeltaTime);
            if (t.phase == "F8") _orbitFrames.Add(Time.unscaledDeltaTime);
        }

        private static FlightTelemetry Feed => FlightSession.Feed.Current;
        private static FlightScreen Screen => FindAnyObjectByType<FlightScreen>();

        private static void Cameras(FlightShot shot)
        {
            FlightScreen s = Screen;
            if (s != null && s.Cameras != null) s.Cameras.SetShot(shot);
        }

        private IEnumerator WaitMet(double metS) => WaitFor(() => FlightSession.Feed.Current.metS >= metS, 900);

        private IEnumerator WaitFor(System.Func<bool> condition, float timeoutS)
        {
            float end = Time.realtimeSinceStartup + timeoutS;
            while (!SafeCheck(condition) && Time.realtimeSinceStartup < end) yield return null;
            if (Time.realtimeSinceStartup >= end) _log.Add("timeout waiting (" + timeoutS + " s)");
        }

        private static bool SafeCheck(System.Func<bool> c)
        {
            try { return c(); }
            catch { return false; }
        }

        private IEnumerator Shot(string name)
        {
            yield return new WaitForEndOfFrame();
            Texture2D frame = ScreenCapture.CaptureScreenshotAsTexture();
            string path = Path.Combine(_folder, name + "-" + frame.width + "x" + frame.height + ".png");
            File.WriteAllBytes(path, frame.EncodeToPNG());
            FlightTelemetry t = FlightSession.Feed?.Current;
            _log.Add(name + ": MET " + (t != null ? t.metS.ToString("0.0") : "?") + " s, phase " + t?.phase
                + ", altitude " + (t != null ? (t.altitudeM / 1000).ToString("0.0") : "?") + " km, feed " + FlightSession.FeedName);
            Destroy(frame);
            _log.Add("  " + Diagnostics());
            File.WriteAllLines(Path.Combine(_folder, "evidence-log.txt"), _log);
        }

        private static string Diagnostics()
        {
            Camera cam = Camera.main;
            FlightWorld w = FlightWorld.Active;
            string s = "cam " + (cam != null ? cam.transform.position + " fwd " + cam.transform.forward + " fov " + cam.fieldOfView.ToString("0.0")
                + " near " + cam.nearClipPlane + " far " + cam.farClipPlane + " mask " + cam.cullingMask : "none");
            if (w != null)
            {
                s += " | anchorHome " + w.AnchorHome + " pad " + w.PadPoint + " env " + (w.Environment != null ? w.Environment.position + " active " + w.Environment.gameObject.activeInHierarchy : "null");
                FlightVehicleView v = w.Vehicle;
                if (v != null && v.Rig != null)
                {
                    Bounds b = MissionForge.Vehicle.VehicleAssembler.RendererBounds(v.Rig.Root);
                    var rs = v.Rig.Root.GetComponentsInChildren<Renderer>(true);
                    int on = 0, vis = 0; foreach (var r in rs) { if (r.enabled && r.gameObject.activeInHierarchy) on++; if (r.isVisible) vis++; }
                    s += " | rig bounds " + b.center + " size " + b.size + " renderers " + rs.Length + " on " + on + " visible " + vis
                        + " layer " + v.Rig.Root.gameObject.layer + " mat0 " + (rs.Length > 0 && rs[0].sharedMaterial != null ? rs[0].sharedMaterial.shader.name : "none");
                }
                else s += " | no rig";
            }
            return s;
        }

        private void WriteNote()
        {
            string Fps(List<float> f) => f.Count == 0 ? "n/a" : (1f / f.OrderBy(x => x).ElementAt(f.Count / 2)).ToString("0.0");
            _log.Add("median FPS lift-off (MET 0-20 s): " + Fps(_liftoffFrames) + " over " + _liftoffFrames.Count + " frames");
            _log.Add("median FPS orbit (F8): " + Fps(_orbitFrames) + " over " + _orbitFrames.Count + " frames");
            _log.Add("resolution " + UnityEngine.Screen.width + "x" + UnityEngine.Screen.height + ", " + SystemInfo.deviceModel + ", "
                + SystemInfo.graphicsDeviceName + ", playback rate " + FlightSession.PlaybackRate);
            File.WriteAllLines(Path.Combine(_folder, "evidence-log.txt"), _log);
        }
    }
}
#endif
