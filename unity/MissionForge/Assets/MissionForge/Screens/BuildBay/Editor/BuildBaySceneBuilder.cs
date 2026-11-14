using System.IO;
using MissionForge.App;
using MissionForge.Vehicle;
using Unity.Cinemachine;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.SceneManagement;
using UnityEngine.UIElements;

namespace MissionForge.Screens.BuildBay.Editor
{
    /// <summary>
    /// Generates <c>MF_BuildBay.unity</c> (T015 owns it): UI document on the T015 layout, <see cref="BuildBayScreen"/>,
    /// the launch pad at dusk with the live vehicle, lights, post-processing and the Cinemachine vantage.
    /// Batch mode: <c>-executeMethod MissionForge.Screens.BuildBay.Editor.BuildBaySceneBuilder.Run</c>.
    /// </summary>
    public static class BuildBaySceneBuilder
    {
        public const string ScenePath = "Assets/MissionForge/Scenes/MF_BuildBay.unity";
        public const string LayoutPath = "Assets/MissionForge/Screens/BuildBay/UI/BuildBay.uxml";
        private const string PanelSettingsPath = "Assets/MissionForge/UI/MissionForgePanelSettings.asset";
        private const int ScreenSortOrder = 10;

        /// <summary>
        /// World position of the bay, metres. The Shell's space backdrop uses 1 unit = 1000 km around the origin; the
        /// bay sits 8 km away along −Z (beyond the 400-unit far plane of the space vantages and with the Earth far
        /// outside the bay camera's far plane), so both worlds share the Shell camera without overlapping. game_value.
        /// </summary>
        public static readonly Vector3 BayOrigin = new Vector3(0f, 0f, -8000f);

        /// <summary>Launch pad materials, models and prefab, then the scene.</summary>
        [MenuItem("MissionForge/Build Bay/Rebuild Pad And Scene")]
        public static void RunAll()
        {
            LaunchPadAssets.RebuildAll();
            Run();
        }

        [MenuItem("MissionForge/Build Bay/Rebuild Scene")]
        public static void Run()
        {
            KitLibrary library = AssetDatabase.LoadAssetAtPath<KitLibrary>(KitLibrary.AssetPath);
            if (library == null) library = Vehicle.Editor.KitLibraryBuilder.Build();

            Scene scene = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);

            var screenGo = new GameObject("Screen_BuildBay");
            var tree = AssetDatabase.LoadAssetAtPath<VisualTreeAsset>(LayoutPath);
            if (tree == null) throw new System.InvalidOperationException("Layout not found: " + LayoutPath);
            var panel = AssetDatabase.LoadAssetAtPath<PanelSettings>(PanelSettingsPath);
            var document = screenGo.AddComponent<UIDocument>();
            document.panelSettings = panel;
            document.visualTreeAsset = tree;
            document.sortingOrder = ScreenSortOrder;

            var bay = new GameObject("Bay");
            bay.transform.position = BayOrigin;
            Transform mount = BayEnvironmentBuilder.Build(bay.transform);

            CinemachineCamera vantage = BayEnvironmentBuilder.AddVantage(screenGo.transform, bay.transform);

            var stage = bay.AddComponent<BayStage>();
            stage.Configure(library, mount);
            BayEnvironmentBuilder.ConfigureStage(stage, bay.transform);
            stage.ConfigureAssembly(
                AssetDatabase.LoadAssetAtPath<Material>(LaunchPadAssets.MaterialsDir + "/LP_vehicle_ghost.mat"),
                AssetDatabase.LoadAssetAtPath<Material>(LaunchPadAssets.MaterialsDir + "/LP_spark.mat"),
                AssetDatabase.LoadAssetAtPath<GameObject>(LaunchPadAssets.ModelsDir + "/tech_worker.fbx"),
                AssetDatabase.LoadAssetAtPath<Material>(LaunchPadAssets.MaterialsDir + "/LP_grating.mat"));
            stage.ConfigureTools(
                AssetDatabase.LoadAssetAtPath<GameObject>(LaunchPadAssets.ModelsDir + "/ref_human.fbx"),
                AssetDatabase.LoadAssetAtPath<GameObject>(LaunchPadAssets.ModelsDir + "/ref_building.fbx"),
                AssetDatabase.LoadAssetAtPath<GameObject>(LaunchPadAssets.ModelsDir + "/ref_saturn_v.fbx"));

            var controller = screenGo.AddComponent<BuildBayScreen>();
            controller.Configure(ScreenId.BuildBay, document, vantage);
            var so = new SerializedObject(controller);
            so.FindProperty("stage").objectReferenceValue = stage;
            so.ApplyModifiedPropertiesWithoutUndo();

            // The Shell is the active scene at runtime (BayEnvironment switches fog on there); the bay scene declares
            // exponential-squared fog so URP's automatic fog stripping keeps those shader variants in builds.
            RenderSettings.fog = true;
            RenderSettings.fogMode = FogMode.ExponentialSquared;
            RenderSettings.fogDensity = 0.0011f;
            EditorSceneManager.SaveScene(scene, ScenePath);
            BindPanelSettingsInSceneFile(ScenePath);
            Debug.Log("[MissionForge] Build Bay scene rebuilt: " + ScenePath);
        }

        /// <summary>Same workaround as ProjectSetup: Unity 6000.6 drops UIDocument.panelSettings set from an editor script.</summary>
        private static void BindPanelSettingsInSceneFile(string scenePath)
        {
            string guid = AssetDatabase.AssetPathToGUID(PanelSettingsPath);
            string full = Path.GetFullPath(scenePath);
            string text = File.ReadAllText(full);
            string bound = text.Replace("m_PanelSettings: {fileID: 0}", "m_PanelSettings: {fileID: 11400000, guid: " + guid + ", type: 2}");
            if (bound == text) return;
            File.WriteAllText(full, bound);
            AssetDatabase.ImportAsset(scenePath, ImportAssetOptions.ForceUpdate);
        }
    }
}
