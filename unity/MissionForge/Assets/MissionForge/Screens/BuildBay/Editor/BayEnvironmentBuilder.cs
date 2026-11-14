using Unity.Cinemachine;
using UnityEditor;
using UnityEngine;
using UnityEngine.Rendering;

namespace MissionForge.Screens.BuildBay.Editor
{
    /// <summary>
    /// Builds the bay environment under the scene's <c>Bay</c> root: launch pad prefab (with its <c>VehicleMount</c>),
    /// dusk lights, post-processing volume and the vantage. Every placement and light value is a game_value
    /// art-direction choice (STYLE_GUIDE.md: warm 4500 K key from a low sun, cool 8000 K fill, about 4:1, filmic
    /// tone curve, bloom only on practicals).
    /// </summary>
    public static class BayEnvironmentBuilder
    {
        public const string LaunchPadPrefabPath = LaunchPadAssets.PrefabPath;

        /// <summary>Vantage vertical field of view, degrees (about a 45 mm lens on full frame). game_value.</summary>
        public const float VantageFovDeg = 30f;

        /// <summary>Direction to the low sun: right of and behind the vehicle, 7° above the horizon. game_value.</summary>
        public static readonly Vector3 ToSun = new Vector3(0.70f, 0.122f, 0.70f).normalized;

        public static Transform Build(Transform bay)
        {
            if (AssetDatabase.LoadAssetAtPath<GameObject>(LaunchPadPrefabPath) == null) LaunchPadAssets.RebuildAll();
            var padPrefab = AssetDatabase.LoadAssetAtPath<GameObject>(LaunchPadPrefabPath);
            var pad = (GameObject)PrefabUtility.InstantiatePrefab(padPrefab, bay);
            pad.transform.localPosition = Vector3.zero;
            Transform mount = pad.GetComponent<LaunchPadRig>().VehicleMount;

            var sky = AssetDatabase.LoadAssetAtPath<Material>(LaunchPadAssets.MaterialsDir + "/LP_dusk_sky.mat");
            sky.SetVector("_SunDir", ToSun);
            EditorUtility.SetDirty(sky);

            AddLights(bay);
            bay.gameObject.AddComponent<BayEnvironment>();
            var volumeGo = new GameObject("BayVolume");
            volumeGo.transform.SetParent(bay, false);
            var volume = volumeGo.AddComponent<Volume>();
            volume.isGlobal = true;
            volume.priority = 10f;
            volume.sharedProfile = AssetDatabase.LoadAssetAtPath<VolumeProfile>(LaunchPadAssets.ProfilePath) ?? LaunchPadAssets.EnsureVolumeProfile();
            return mount;
        }

        public static CinemachineCamera AddVantage(Transform screenRoot, Transform bay)
        {
            var go = new GameObject("Vantage");
            go.transform.SetParent(screenRoot, false);
            go.transform.position = bay.position + new Vector3(0f, 30f, -190f);
            go.transform.rotation = Quaternion.LookRotation(new Vector3(0f, 0.05f, 1f));
            var cam = go.AddComponent<CinemachineCamera>();
            LensSettings lens = cam.Lens;
            lens.FieldOfView = VantageFovDeg;
            lens.NearClipPlane = 0.5f;
            lens.FarClipPlane = 6000f;
            cam.Lens = lens;
            return cam;
        }

        public static void ConfigureStage(BayStage stage, Transform bay)
        {
            stage.ConfigurePad(bay.GetComponentInChildren<LaunchPadRig>());
        }

        private static void AddLights(Transform bay)
        {
            var key = new GameObject("DuskKey").AddComponent<Light>();
            key.transform.SetParent(bay, false);
            key.type = LightType.Directional;
            key.useColorTemperature = true;
            key.colorTemperature = 4500f;
            key.color = Color.white;
            key.intensity = 2.4f;
            key.shadows = LightShadows.Soft;
            key.shadowStrength = 0.85f;
            key.transform.rotation = Quaternion.LookRotation(-ToSun, Vector3.up);

            var fill = new GameObject("DuskFill").AddComponent<Light>();
            fill.transform.SetParent(bay, false);
            fill.type = LightType.Directional;
            fill.useColorTemperature = true;
            fill.colorTemperature = 8000f;
            fill.color = Color.white;
            fill.intensity = 0.6f;
            fill.shadows = LightShadows.None;
            fill.transform.rotation = Quaternion.LookRotation(new Vector3(0.45f, -0.35f, 0.82f).normalized, Vector3.up);
        }

        internal static Transform FindDeep(Transform root, string name)
        {
            if (root.name == name) return root;
            for (int i = 0; i < root.childCount; i++)
            {
                Transform hit = FindDeep(root.GetChild(i), name);
                if (hit != null) return hit;
            }
            return null;
        }
    }
}
