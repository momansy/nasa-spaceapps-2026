using System;
using System.IO;
using MissionForge.App;
using MissionForge.App.Screens;
using MissionForge.Screens.BuildBay;
using MissionForge.Vehicle;
using Unity.Cinemachine;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.SceneManagement;
using UnityEngine.UIElements;

namespace MissionForge.Screens.Flight.Editor
{
    /// <summary>
    /// Generates T016's assets and wires its three scenes (idempotent; re-run after BuildBay dressing changes):
    /// VFX materials (Art/VFX), the flight world prefab copied from MF_BuildBay's <c>Bay</c> root (pad, dressing, dusk
    /// rig), and MF_Countdown / MF_Flight / MF_OrbitMap with the T016 screen controllers in place of T001's
    /// placeholder RegionScreen. Menu: MissionForge ▸ Flight ▸ Build Flight Scenes. Batch:
    /// <c>-executeMethod MissionForge.Screens.Flight.Editor.FlightSceneBuilder.BuildAll</c>.
    /// </summary>
    public static class FlightSceneBuilder
    {
        private const string Root = "Assets/MissionForge";
        private const string VfxDir = Root + "/Art/VFX";
        private const string VfxResources = VfxDir + "/Resources/FlightVFX";
        private const string FlightDir = Root + "/Screens/Flight";
        private const string WorldPrefabPath = FlightDir + "/Prefabs/MF_FlightWorld.prefab";
        private const string ScreenUxmlPath = FlightDir + "/UI/FlightScreen.uxml";
        private const string BayScenePath = Root + "/Scenes/MF_BuildBay.unity";
        private const string KitLibraryPath = Root + "/Vehicle/KitLibrary.asset";

        [MenuItem("MissionForge/Flight/Build Flight Scenes")]
        public static void BuildAll()
        {
            BuildMaterials();
            GameObject world = BuildWorldPrefab();
            WireScene(ScreenId.Countdown, world);
            WireScene(ScreenId.Flight, world);
            WireScene(ScreenId.OrbitMap, null);
            AssetDatabase.SaveAssets();
            Debug.Log("[MissionForge] T016 flight scenes built.");
        }

        // ---------- Materials ----------

        public static void BuildMaterials()
        {
            Directory.CreateDirectory(VfxResources);
            Directory.CreateDirectory(VfxDir + "/Materials");
            Shader particle = Shader.Find("MissionForge/VFX/Particle");
            Particle(particle, "MF_Plume", new Color(1f, 0.62f, 0.3f, 1f), 2.2f, 0.75f, additive: true);
            Particle(particle, "MF_PlumeCore", new Color(1f, 0.9f, 0.75f, 1f), 3.2f, 0.55f, additive: true);
            Particle(particle, "MF_Vapour", new Color(0.92f, 0.95f, 1f, 1f), 1.0f, 0.9f, additive: false);
            Particle(particle, "MF_Smoke", new Color(0.78f, 0.76f, 0.74f, 1f), 1.0f, 1.0f, additive: false);

            CopyMaterial(Root + "/App/Space/Materials/Earth.mat", "MissionForge/Flight/Earth", VfxDir + "/Materials/MF_FlightEarth.mat");
            CopyMaterial(Root + "/App/Space/Materials/Atmosphere.mat", "MissionForge/Flight/Atmosphere", VfxDir + "/Materials/MF_FlightAtmosphere.mat");
        }

        private static void Particle(Shader shader, string name, Color tint, float intensity, float softness, bool additive)
        {
            string path = VfxResources + "/" + name + ".mat";
            Material m = AssetDatabase.LoadAssetAtPath<Material>(path);
            if (m == null)
            {
                m = new Material(shader) { name = name };
                AssetDatabase.CreateAsset(m, path);
            }
            m.shader = shader;
            m.SetColor("_Tint", tint);
            m.SetFloat("_Intensity", intensity);
            m.SetFloat("_Softness", softness);
            m.SetFloat("_SrcBlend", (float)BlendMode.One);
            m.SetFloat("_DstBlend", additive ? (float)BlendMode.One : (float)BlendMode.OneMinusSrcAlpha);
            m.renderQueue = (int)RenderQueue.Transparent;
            m.enableInstancing = true;
            EditorUtility.SetDirty(m);
        }

        private static void CopyMaterial(string sourcePath, string shaderName, string path)
        {
            Material source = AssetDatabase.LoadAssetAtPath<Material>(sourcePath);
            Shader shader = Shader.Find(shaderName);
            if (source == null || shader == null) throw new InvalidOperationException("Missing " + sourcePath + " or " + shaderName);
            Material m = AssetDatabase.LoadAssetAtPath<Material>(path);
            if (m == null)
            {
                m = new Material(source);
                AssetDatabase.CreateAsset(m, path);
            }
            m.CopyPropertiesFromMaterial(source);
            m.shader = shader;
            EditorUtility.SetDirty(m);
        }

        // ---------- World prefab ----------

        public static GameObject BuildWorldPrefab()
        {
            Directory.CreateDirectory(FlightDir + "/Prefabs");
            Scene bay = EditorSceneManager.OpenScene(BayScenePath, OpenSceneMode.Additive);
            GameObject copy = null;
            try
            {
                GameObject bayRoot = Array.Find(bay.GetRootGameObjects(), g => g.name == "Bay");
                if (bayRoot == null) throw new InvalidOperationException("MF_BuildBay has no Bay root.");
                copy = UnityEngine.Object.Instantiate(bayRoot);
                copy.name = "Environment";
                StripBayLogic(copy);

                var root = new GameObject("MF_FlightWorld");
                SceneManager.MoveGameObjectToScene(root, bay);
                copy.transform.SetParent(root.transform, true);
                var anchor = new GameObject("VehicleAnchor");
                anchor.transform.SetParent(root.transform, false);
                var space = new GameObject("Space");
                space.transform.SetParent(root.transform, false);

                FlightWorld world = root.AddComponent<FlightWorld>();
                FlightVehicleView view = anchor.AddComponent<FlightVehicleView>();
                view.Configure(AssetDatabase.LoadAssetAtPath<KitLibrary>(KitLibraryPath), world);
                LaunchPadRig pad = copy.GetComponentInChildren<LaunchPadRig>(true);
                if (pad != null && pad.VehicleMount != null) anchor.transform.position = pad.VehicleMount.position;
                world.Configure(copy.transform, anchor.transform, view);
                FlightSpace fs = space.AddComponent<FlightSpace>();
                fs.Configure(AssetDatabase.LoadAssetAtPath<Mesh>(Root + "/App/Space/Meshes/EarthSphere.asset"),
                    AssetDatabase.LoadAssetAtPath<Material>(VfxDir + "/Materials/MF_FlightEarth.mat"),
                    AssetDatabase.LoadAssetAtPath<Material>(VfxDir + "/Materials/MF_FlightAtmosphere.mat"), world);

                GameObject saved = PrefabUtility.SaveAsPrefabAsset(root, WorldPrefabPath);
                UnityEngine.Object.DestroyImmediate(root);
                return saved;
            }
            finally
            {
                EditorSceneManager.CloseScene(bay, true);
            }
        }

        /// <summary>Keeps the pad's look (environment, rig, launch pad) and removes the Build Bay's screen logic.</summary>
        private static void StripBayLogic(GameObject copy)
        {
            foreach (MonoBehaviour mb in copy.GetComponentsInChildren<MonoBehaviour>(true))
            {
                if (mb == null) continue;
                Type t = mb.GetType();
                bool bayType = t.Namespace != null && t.Namespace.StartsWith("MissionForge.Screens.BuildBay");
                bool keep = mb is BayEnvironment || mb is LaunchPadRig || t.Name == "BayQualityGroup" || t.Name == "BayArmEnd";
                if (bayType && !keep) UnityEngine.Object.DestroyImmediate(mb);
            }
        }

        // ---------- Scenes ----------

        private static void WireScene(ScreenId id, GameObject worldPrefab)
        {
            ScreenInfo info = ScreenCatalog.Get(id);
            string path = Root + "/Scenes/" + info.SceneName + ".unity";
            Scene scene = EditorSceneManager.OpenScene(path, OpenSceneMode.Single);
            GameObject screenGo = Array.Find(scene.GetRootGameObjects(), g => g.GetComponentInChildren<UIDocument>(true) != null);
            if (screenGo == null) throw new InvalidOperationException(path + " has no screen object.");
            UIDocument doc = screenGo.GetComponentInChildren<UIDocument>(true);
            CinemachineCamera vantage = screenGo.GetComponentInChildren<CinemachineCamera>(true);
            VisualTreeAsset uxml = AssetDatabase.LoadAssetAtPath<VisualTreeAsset>(ScreenUxmlPath);
            if (uxml != null) doc.visualTreeAsset = uxml;

            foreach (ScreenController old in screenGo.GetComponents<ScreenController>()) UnityEngine.Object.DestroyImmediate(old);
            foreach (FlightCameraDirector old in screenGo.GetComponents<FlightCameraDirector>()) UnityEngine.Object.DestroyImmediate(old);
            foreach (GameObject g in scene.GetRootGameObjects())
                if (g.GetComponent<FlightWorld>() != null) UnityEngine.Object.DestroyImmediate(g);

            FlightWorld world = null;
            if (worldPrefab != null)
            {
                var instance = (GameObject)PrefabUtility.InstantiatePrefab(worldPrefab, scene);
                instance.name = "FlightWorld";
                world = instance.GetComponent<FlightWorld>();
                instance.SetActive(false); // switched on by the screen (one world active at a time)
            }

            if (vantage != null && world != null)
            {
                // Same opening pose as the pad shot, so countdown → flight and Build Bay → countdown blends are short.
                Vector3 mount = world.VehicleAnchor.position;
                vantage.transform.position = mount + new Vector3(-38f, -6f, -58f);
                vantage.transform.rotation = Quaternion.LookRotation(mount + Vector3.up * 16f - vantage.transform.position);
            }

            switch (id)
            {
                case ScreenId.Countdown:
                {
                    var c = screenGo.AddComponent<CountdownScreen>();
                    c.Configure(id, doc, vantage);
                    FlightCameraDirector director = screenGo.AddComponent<FlightCameraDirector>();
                    director.Configure(vantage, world);
                    c.ConfigureWorld(world, director);
                    break;
                }
                case ScreenId.Flight:
                {
                    var f = screenGo.AddComponent<FlightScreen>();
                    f.Configure(id, doc, vantage);
                    FlightCameraDirector director = screenGo.AddComponent<FlightCameraDirector>();
                    director.Configure(vantage, world);
                    f.ConfigureWorld(world, director);
                    break;
                }
                default:
                    screenGo.AddComponent<OrbitMapScreen>().Configure(id, doc, vantage);
                    break;
            }
            EditorSceneManager.MarkSceneDirty(scene);
            EditorSceneManager.SaveScene(scene);
        }
    }
}
