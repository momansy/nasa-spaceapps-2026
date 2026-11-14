using System.Collections.Generic;
using UnityEditor;
using UnityEngine;
using UnityEngine.Rendering;

namespace MissionForge.Screens.BuildBay.Editor
{
    /// <summary>
    /// Assembles <c>MF_LaunchPad.prefab</c>: deck with flame trench, launch mount (VehicleMount), the stackable
    /// service tower with crane and umbilical arms (<see cref="LaunchPadRig"/>), lightning masts, floodlights, the
    /// dusk sky dome and the distant site. Positions are game_values in metres (+Y up; the camera looks along +Z, so
    /// the tower stands left-behind the vehicle and the distant site sits low behind it).
    /// </summary>
    public static class LaunchPadPrefabBuilder
    {
        /// <summary>Max tower segments (8 m each): enough for a 110 m stack plus the mount.</summary>
        public const int MaxSegments = 17;
        /// <summary>Tower centre relative to the vehicle axis, m (23.5 m away so the 23.5 m jib hook reaches the axis).</summary>
        public static readonly Vector3 TowerOffset = new Vector3(-16.6f, LaunchPadRig.DeckTopM, 16.6f);
        public const float SkyRadiusM = 2400f;

        public static GameObject Build()
        {
            var root = new GameObject("MF_LaunchPad");
            Place("pad_deck", root.transform, Vector3.zero);
            GameObject mount = Place("pad_mount", root.transform, Vector3.zero);
            Transform vehicleMount = BayEnvironmentBuilder.FindDeep(mount.transform, "VehicleMount");
            if (vehicleMount == null) throw new System.InvalidOperationException("pad_mount has no VehicleMount empty");

            // Tower: stacked segments, crown, crane, arms.
            var tower = new GameObject("Tower").transform;
            tower.SetParent(root.transform, false);
            tower.localPosition = TowerOffset;
            tower.localRotation = Quaternion.Euler(0f, 45f, 0f);
            var segments = new List<Transform>();
            for (int i = 0; i < MaxSegments; i++)
            {
                GameObject seg = Place("pad_gantry_segment", tower, new Vector3(0f, i * LaunchPadRig.SegmentHeightM, 0f));
                seg.name = "Segment_" + i.ToString("00");
                segments.Add(seg.transform);
            }
            GameObject crown = Place("pad_gantry_crown", tower, new Vector3(0f, 6 * LaunchPadRig.SegmentHeightM, 0f));
            Transform pivot = BayEnvironmentBuilder.FindDeep(crown.transform, "crane_pivot");
            var jibRoot = new GameObject("Jib").transform;
            jibRoot.SetParent(pivot, false);
            GameObject jib = Place("pad_crane_jib", jibRoot, Vector3.zero);
            Transform hookPoint = BayEnvironmentBuilder.FindDeep(jib.transform, "hook_point");
            GameObject cable = Place("pad_cable", root.transform, Vector3.zero);
            GameObject hook = Place("pad_crane_hook", root.transform, Vector3.zero);
            GameObject armUpper = Place("pad_umbilical_arm", root.transform, Vector3.zero);
            armUpper.name = "Arm_Upper";
            GameObject armLower = Place("pad_umbilical_arm", root.transform, Vector3.zero);
            armLower.name = "Arm_Lower";

            // Lightning masts and floodlights (practicals), kept inside the middle of the frame or low at its edges.
            Place("pad_lightning_mast", root.transform, new Vector3(-30f, 0f, 34f));
            Place("pad_lightning_mast", root.transform, new Vector3(28f, 0f, 30f));
            Place("pad_lightning_mast", root.transform, new Vector3(4f, 0f, 62f));
            AddFloodlight(root.transform, new Vector3(-27f, LaunchPadRig.DeckTopM, -24f));
            AddFloodlight(root.transform, new Vector3(27f, LaunchPadRig.DeckTopM, -20f));
            AddFloodlight(root.transform, new Vector3(30f, LaunchPadRig.DeckTopM, 24f));

            // Distant site and sky.
            var site = new GameObject("Site").transform;
            site.SetParent(root.transform, false);
            Place("site_ground", site, new Vector3(0f, -0.4f, 0f));
            Place("site_hills", site, Vector3.zero);
            Place("site_hangar", site, new Vector3(-330f, 0f, 780f)).transform.localRotation = Quaternion.Euler(0f, 20f, 0f);
            Place("site_water_tower", site, new Vector3(270f, 0f, 660f));
            AddSky(root.transform);

            var rig = root.AddComponent<LaunchPadRig>();
            rig.Configure(vehicleMount, tower, segments, crown.transform, pivot, jibRoot, hookPoint, cable.transform, hook.transform,
                armUpper.transform, armLower.transform);

            GameObject prefab = PrefabUtility.SaveAsPrefabAsset(root, LaunchPadAssets.PrefabPath);
            Object.DestroyImmediate(root);
            Debug.Log("[MissionForge] Launch pad prefab: " + LaunchPadAssets.PrefabPath);
            return prefab;
        }

        private static GameObject Place(string model, Transform parent, Vector3 localPos)
        {
            var asset = AssetDatabase.LoadAssetAtPath<GameObject>(LaunchPadAssets.ModelsDir + "/" + model + ".fbx");
            if (asset == null) throw new System.InvalidOperationException("Launch pad model missing: " + model + " (run build_launchpad.py)");
            var go = (GameObject)PrefabUtility.InstantiatePrefab(asset, parent);
            go.transform.localPosition = localPos;
            return go;
        }

        private static void AddFloodlight(Transform root, Vector3 at)
        {
            GameObject pole = Place("pad_floodlight", root, at);
            Vector3 toAxis = new Vector3(-at.x, 0f, -at.z).normalized;
            pole.transform.localRotation = Quaternion.LookRotation(-toAxis, Vector3.up) * Quaternion.Euler(0f, 0f, 0f);
            var lightGo = new GameObject("Flood");
            lightGo.transform.SetParent(pole.transform, false);
            lightGo.transform.localPosition = new Vector3(0f, 14.4f, 0f);
            Vector3 target = new Vector3(0f, 30f, 0f) - (at + new Vector3(0f, 14.4f, 0f));
            lightGo.transform.rotation = Quaternion.LookRotation(target.normalized, Vector3.up);
            var spot = lightGo.AddComponent<Light>();
            spot.type = LightType.Spot;
            spot.useColorTemperature = true;
            spot.colorTemperature = 5600f;   // xenon-like floodlight (game_value)
            spot.color = Color.white;
            spot.intensity = 900f;
            spot.range = 120f;
            spot.spotAngle = 38f;
            spot.innerSpotAngle = 18f;
            spot.shadows = LightShadows.None;
        }

        private static void AddSky(Transform root)
        {
            var sphere = GameObject.CreatePrimitive(PrimitiveType.Sphere);
            Mesh mesh = sphere.GetComponent<MeshFilter>().sharedMesh;
            Object.DestroyImmediate(sphere);
            var sky = new GameObject("DuskSky");
            sky.transform.SetParent(root, false);
            sky.transform.localScale = Vector3.one * SkyRadiusM * 2f;
            sky.AddComponent<MeshFilter>().sharedMesh = mesh;
            var r = sky.AddComponent<MeshRenderer>();
            r.sharedMaterial = AssetDatabase.LoadAssetAtPath<Material>(LaunchPadAssets.MaterialsDir + "/LP_dusk_sky.mat");
            r.shadowCastingMode = ShadowCastingMode.Off;
            r.receiveShadows = false;
            r.lightProbeUsage = LightProbeUsage.Off;
            r.reflectionProbeUsage = ReflectionProbeUsage.Off;
        }
    }
}
