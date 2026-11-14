using System.IO;
using MissionForge.App;
using Unity.Cinemachine;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.Rendering.Universal;
using UnityEngine.SceneManagement;

namespace MissionForge.Editor
{
    /// <summary>
    /// Renders a screen's 3D backdrop from its authored camera vantage to a PNG, without entering
    /// Play mode. Used for look development and evidence in batch mode:
    /// -executeMethod MissionForge.Editor.EvidenceCapture.Backdrops
    /// UI Toolkit panels are not part of this render; screenshots with UI come from the built player.
    /// </summary>
    public static class EvidenceCapture
    {
        private const int Width = 1920;
        private const int Height = 1080;
        private const string ScenesDir = "Assets/MissionForge/Scenes/";

        [MenuItem("MissionForge/Capture Backdrops")]
        public static void Backdrops()
        {
            string outputDir = Path.Combine(Application.dataPath, "..", "Logs", "captures");
            Directory.CreateDirectory(outputDir);
            foreach (ScreenId id in new[] { ScreenId.Title, ScreenId.Lobby, ScreenId.BuildBay, ScreenId.Briefing, ScreenId.Flight })
            {
                Capture(ScreenCatalog.Get(id), Path.Combine(outputDir, "backdrop-" + id + ".png"));
            }
        }

        private static void Capture(ScreenInfo info, string outputPath)
        {
            EditorSceneManager.OpenScene(ScenesDir + ScreenCatalog.ShellSceneName + ".unity", OpenSceneMode.Single);
            Scene screen = EditorSceneManager.OpenScene(ScenesDir + info.SceneName + ".unity", OpenSceneMode.Additive);

            Camera camera = Object.FindAnyObjectByType<Camera>();
            CinemachineCamera vantage = null;
            foreach (GameObject root in screen.GetRootGameObjects())
            {
                vantage = root.GetComponentInChildren<CinemachineCamera>(true);
                if (vantage != null) break;
            }
            if (camera == null || vantage == null)
            {
                Debug.LogError("[MissionForge] Cannot capture " + info.Id + ": camera or vantage missing.");
                return;
            }

            camera.transform.SetPositionAndRotation(vantage.transform.position, vantage.transform.rotation);
            camera.fieldOfView = vantage.Lens.FieldOfView;

            var descriptor = new RenderTextureDescriptor(Width, Height, RenderTextureFormat.ARGB32, 24) { sRGB = true, msaaSamples = 4 };
            RenderTexture target = RenderTexture.GetTemporary(descriptor);
            var request = new UniversalRenderPipeline.SingleCameraRequest { destination = target };
            if (RenderPipeline.SupportsRenderRequest(camera, request))
            {
                RenderPipeline.SubmitRenderRequest(camera, request);
            }
            else
            {
                Debug.LogError("[MissionForge] The render pipeline does not support single-camera requests.");
            }

            RenderTexture previous = RenderTexture.active;
            RenderTexture.active = target;
            var image = new Texture2D(Width, Height, TextureFormat.RGBA32, false);
            image.ReadPixels(new Rect(0, 0, Width, Height), 0, 0);
            image.Apply();
            RenderTexture.active = previous;
            File.WriteAllBytes(outputPath, image.EncodeToPNG());
            Object.DestroyImmediate(image);
            RenderTexture.ReleaseTemporary(target);
            Debug.Log("[MissionForge] Captured " + outputPath);
        }
    }
}
