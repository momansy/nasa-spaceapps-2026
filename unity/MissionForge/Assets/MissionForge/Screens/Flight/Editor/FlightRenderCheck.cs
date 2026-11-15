using System.IO;
using MissionForge.Core.Data;
using MissionForge.Data;
using MissionForge.Data.Editor;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.SceneManagement;

namespace MissionForge.Screens.Flight.Editor
{
    /// <summary>
    /// Batch-mode render check (no play mode): opens MF_Countdown, builds the rehearsal vehicle in the flight world and
    /// renders the pad shot to a PNG. Separates scene problems from player-build problems. Output: -mfOut &lt;png&gt;.
    /// </summary>
    public static class FlightRenderCheck
    {
        public static void Run()
        {
            string output = FlightSession.Arg("-mfOut") ?? "/tmp/t016-render-check.png";
            Scene scene = EditorSceneManager.OpenScene("Assets/MissionForge/Scenes/MF_Countdown.unity", OpenSceneMode.Single);
            string temp = Path.Combine(Path.GetTempPath(), "mf-t016-rc-" + Path.GetRandomFileName());
            GameDataSync.Sync(GameDataSync.RepositoryDataPath, temp);
            GameDataSet data = GameDataLoader.LoadFromDirectory(temp);
            Directory.Delete(temp, true);
            GameCatalog catalog = CatalogLoader.Load(data.JsonByPath);
            IFlightFeed feed = new CoreFlightFeed(FlightSession.RehearsalBuild(catalog), catalog, data.JsonByPath);
            string met = FlightSession.Arg("-mfMet");
            if (met != null)
            {
                var rec = new RecordedFlightFeed(FlightRecording.FromJson(File.ReadAllText(FlightRecorder.OutputPath)));
                rec.SeekToMet(double.Parse(met, System.Globalization.CultureInfo.InvariantCulture));
                feed = rec;
            }
            typeof(FlightSession).GetProperty("Build").SetValue(null, FlightSession.RehearsalBuild(catalog));
            typeof(FlightSession).GetProperty("Catalog").SetValue(null, catalog);
            FlightSession.Use(feed, feed as IFlightControlSink, "check");

            FlightWorld world = Object.FindAnyObjectByType<FlightWorld>(FindObjectsInactive.Include);
            world.Activate();
            world.Vehicle.Build();
            var camGo = new GameObject("CheckCam") { tag = "MainCamera" };
            Camera cam = camGo.AddComponent<Camera>();
            cam.nearClipPlane = 0.5f;
            cam.farClipPlane = float.Parse(FlightSession.Arg("-mfFar") ?? "40000", System.Globalization.CultureInfo.InvariantCulture);
            cam.fieldOfView = 48f;
            Vector3 mount = world.AnchorHome;
            cam.transform.position = mount + new Vector3(-38f, -6f, -58f);
            cam.transform.LookAt(mount + Vector3.up * 18f);
            if (met != null)
            {
                var flags = System.Reflection.BindingFlags.Instance | System.Reflection.BindingFlags.NonPublic;
                typeof(FlightVehicleView).GetMethod("LateUpdate", flags).Invoke(world.Vehicle, null);
                FlightSpace space = world.GetComponentInChildren<FlightSpace>(true);
                typeof(FlightSpace).GetMethod("Awake", flags).Invoke(space, null);
                FlightVehicleView v = world.Vehicle;
                float len = v.LengthM;
                Vector3 mid = v.AxisPoint(0.5f);
                cam.transform.position = mid + v.Pivot.right * (-len * 0.7f) + v.Pivot.forward * (-len * 2.3f) + v.Pivot.up * (-len * 0.35f);
                cam.transform.rotation = Quaternion.LookRotation(v.AxisPoint(0.55f) - cam.transform.position, Vector3.up);
                cam.fieldOfView = 38f;
                typeof(FlightSpace).GetMethod("LateUpdate", flags).Invoke(space, null);
                Debug.Log("[MissionForge] render check pose: alt " + feed.Current.altitudeM + " env renderers on " + world.Environment.GetComponentInChildren<Renderer>().enabled);
            }
            var rt = new RenderTexture(1280, 720, 24, RenderTextureFormat.ARGB32);
            cam.targetTexture = rt;
            cam.Render();
            RenderTexture.active = rt;
            var tex = new Texture2D(1280, 720, TextureFormat.RGB24, false);
            tex.ReadPixels(new Rect(0, 0, 1280, 720), 0, 0);
            tex.Apply();
            File.WriteAllBytes(output, tex.EncodeToPNG());
            Debug.Log("[MissionForge] render check -> " + output + " far " + cam.farClipPlane + " rig " + (world.Vehicle.Rig != null));
            FlightSession.End();
        }
    }
}
