using System.IO;
using MissionForge.UI;
using UnityEditor;
using UnityEditor.Build.Reporting;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.Rendering.Universal;
using UnityEngine.SceneManagement;
using UnityEngine.UIElements;

namespace MissionForge.Editor.DesignSystem
{
    /// <summary>
    /// Builds <c>Scenes/Dev/MF_DesignSystem.unity</c> (editor and development only; never in Build Settings) and a
    /// development macOS player for it under the git-ignored <c>Builds/Specimen/</c>. Run the player with
    /// <c>-mfShot &lt;png&gt;</c> to capture the specimen page at 1920 × 1080.
    /// </summary>
    public static class SpecimenSceneBuilder
    {
        public const string ScenePath = "Assets/MissionForge/Scenes/Dev/MF_DesignSystem.unity";
        private const string PanelSettingsPath = "Assets/MissionForge/UI/MissionForgePanelSettings.asset";
        private const string EarthMaterialPath = "Assets/MissionForge/App/Space/Materials/Earth.mat";
        private const string OrbitRigPath = "Assets/MissionForge/Art/Lighting/MF_Rig_Orbit.prefab";

        [MenuItem("MissionForge/Design System/Build Specimen Scene")]
        public static void BuildScene()
        {
            Directory.CreateDirectory(Path.GetDirectoryName(ScenePath));
            Scene scene = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);

            var cameraGo = new GameObject("Main Camera") { tag = "MainCamera" };
            var camera = cameraGo.AddComponent<Camera>();
            camera.clearFlags = CameraClearFlags.SolidColor;
            camera.backgroundColor = MfPalette.Space;
            camera.fieldOfView = 40f;
            cameraGo.AddComponent<UniversalAdditionalCameraData>().renderPostProcessing = true;
            cameraGo.transform.SetPositionAndRotation(new Vector3(0f, 0f, -10f), Quaternion.identity);

            // A lit planet behind the page so the glass panel has something to blur.
            var earth = GameObject.CreatePrimitive(PrimitiveType.Sphere);
            earth.name = "Specimen Backdrop";
            Object.DestroyImmediate(earth.GetComponent<Collider>());
            earth.transform.position = new Vector3(4.2f, -2.6f, 6f);
            earth.transform.localScale = Vector3.one * 9f;
            var earthMat = AssetDatabase.LoadAssetAtPath<Material>(EarthMaterialPath);
            if (earthMat != null) earth.GetComponent<MeshRenderer>().sharedMaterial = earthMat;

            var rig = AssetDatabase.LoadAssetAtPath<GameObject>(OrbitRigPath);
            if (rig != null) PrefabUtility.InstantiatePrefab(rig, scene);
            else
            {
                var sun = new GameObject("Key Light");
                Light l = sun.AddComponent<Light>();
                l.type = LightType.Directional;
                l.intensity = 2f;
                sun.transform.rotation = Quaternion.Euler(20f, -40f, 0f);
            }

            var ui = new GameObject("Specimen UI");
            var doc = ui.AddComponent<UIDocument>();
            doc.panelSettings = AssetDatabase.LoadAssetAtPath<PanelSettings>(PanelSettingsPath);
            ui.AddComponent<MfDesignSystemSpecimen>();

            EditorSceneManager.SaveScene(scene, ScenePath);
            Debug.Log("[MissionForge] Specimen scene written to " + ScenePath);
        }

        [MenuItem("MissionForge/Design System/Build Specimen Player (macOS, dev)")]
        public static void BuildPlayer()
        {
            if (!File.Exists(ScenePath)) BuildScene();
            string output = Path.GetFullPath(Path.Combine(Application.dataPath, "..", "Builds", "Specimen", "Specimen.app"));
            BuildReport report = BuildPipeline.BuildPlayer(new BuildPlayerOptions
            {
                scenes = new[] { ScenePath },
                locationPathName = output,
                target = BuildTarget.StandaloneOSX,
                options = BuildOptions.Development,
            });
            Debug.Log("[MissionForge] Specimen player " + report.summary.result + " → " + output);
            if (report.summary.result != BuildResult.Succeeded && Application.isBatchMode) EditorApplication.Exit(1);
        }
    }
}
