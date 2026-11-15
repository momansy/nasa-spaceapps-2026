using System.Collections.Generic;
using System.Linq;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.SceneManagement;

namespace MissionForge.Screens.BuildBay.Editor
{
    /// <summary>
    /// T034 Build Bay environment pass, applied to <c>MF_BuildBay.unity</c> as scene content under <c>Bay/Dressing</c>
    /// plus overrides on the <c>MF_LaunchPad</c> instance (the prefab asset is not edited). Idempotent: it deletes and
    /// rebuilds <c>Bay/Dressing</c> each run. Run it after <see cref="BuildBaySceneBuilder"/> and T031's
    /// <c>LightingFoundation.ApplyToScenes</c>, which recreate or relight the scene. Menu
    /// <b>MissionForge ▸ Build Bay ▸ Apply Environment Dressing (T034)</b>; batch
    /// <c>-executeMethod MissionForge.Screens.BuildBay.Editor.BayDressingBuilder.Run</c>.
    /// Placements are bay-local metres (pad axis at the origin) and game_value composition choices.
    /// </summary>
    public static class BayDressingBuilder
    {
        public const string DressingName = "Dressing";
        private const string WorldModelsDir = LaunchPadAssets.ModelsDir + "/World";

        /// <summary>Haze for the bay (BayEnvironment): a dusky mauve that sits between the warm horizon and the blue sky.</summary>
        public static readonly Color Haze = new Color(0.80f, 0.60f, 0.42f);
        public const float HazeDensity = 0.001f;

        [MenuItem("MissionForge/Build Bay/Apply Environment Dressing (T034)")]
        public static void Run()
        {
            BayDressingAssets.EnsureAll();
            Scene scene = EditorSceneManager.OpenScene(BuildBaySceneBuilder.ScenePath, OpenSceneMode.Single);
            GameObject bayGo = scene.GetRootGameObjects().FirstOrDefault(g => g.name == "Bay");
            if (bayGo == null) throw new System.InvalidOperationException("MF_BuildBay has no Bay root");
            Transform bay = bayGo.transform;
            LaunchPadRig pad = bay.GetComponentInChildren<LaunchPadRig>(true);
            if (pad == null) throw new System.InvalidOperationException("MF_BuildBay has no LaunchPadRig");

            Transform old = bay.Find(DressingName);
            if (old != null) Object.DestroyImmediate(old.gameObject);
            RemoveTowerLamps(pad);
            var dressing = new GameObject(DressingName).transform;
            dressing.SetParent(bay, false);

            RetexturePad(pad);
            BuildLaunchMount(dressing, pad);
            var highOnly = new List<GameObject>();
            BuildGround(dressing, highOnly);
            highOnly.Add(BuildSilhouettes(dressing));
            highOnly.AddRange(BuildPracticals(dressing, pad));
            BuildCrew(dressing);
            dressing.gameObject.AddComponent<BayQualityGroup>().Configure(highOnly);
            var volume = dressing.gameObject.AddComponent<Volume>();
            volume.isGlobal = true;
            volume.priority = 2.5f;   // above T031's Dusk override (2), below a future close-up volume (3)
            volume.sharedProfile = BayDressingAssets.EnsureBayVolume();

            ConfigureRuntime(bay);
            EditorSceneManager.MarkSceneDirty(scene);
            EditorSceneManager.SaveScene(scene);
            AssetDatabase.SaveAssets();
            Debug.Log("[MissionForge] T034 Build Bay dressing applied: " + BuildBaySceneBuilder.ScenePath);
        }

        // ------------------------------------------------------------------ pad overrides

        /// <summary>Box-UV copies of the pad's concrete pieces with the ambientCG concrete sets; the old site props off.</summary>
        private static void RetexturePad(LaunchPadRig pad)
        {
            var map = new Dictionary<string, Material>
            {
                { "LP_concrete", BayDressingAssets.Load("LP_Concrete034") },
                { "LP_concrete_dark", BayDressingAssets.Load("LP_Concrete031") },
            };
            var meshCache = new Dictionary<Mesh, Mesh>();
            foreach (MeshRenderer r in pad.GetComponentsInChildren<MeshRenderer>(true))
            {
                var filter = r.GetComponent<MeshFilter>();
                if (filter == null || filter.sharedMesh == null) continue;
                if (r.name.StartsWith("site_"))
                {
                    if (PrefabUtility.IsPartOfPrefabInstance(filter)) PrefabUtility.RevertObjectOverride(filter, InteractionMode.AutomatedAction);
                    if (PrefabUtility.IsPartOfPrefabInstance(r)) PrefabUtility.RevertObjectOverride(r, InteractionMode.AutomatedAction);
                    continue;
                }
                Material[] mats = r.sharedMaterials;
                bool hit = false;
                for (int i = 0; i < mats.Length; i++)
                {
                    if (mats[i] == null || !map.TryGetValue(mats[i].name, out Material m)) continue;
                    mats[i] = m;
                    hit = true;
                }
                if (!hit) continue;
                Mesh src = filter.sharedMesh;
                if (src.name.EndsWith("_uv")) src = OriginalMesh(r) ?? src;
                if (!meshCache.TryGetValue(src, out Mesh uvMesh))
                {
                    uvMesh = BayDressingMeshes.Save(BayDressingMeshes.WithBoxUv(src), src.name + "_uv");
                    meshCache[src] = uvMesh;
                }
                filter.sharedMesh = uvMesh;
                r.sharedMaterials = mats;
                Record(filter);
                Record(r);
            }
            foreach (string name in new[] { "site_ground", "site_hills", "site_hangar", "site_water_tower" })
            {
                Transform t = BayEnvironmentBuilder.FindDeep(pad.transform, name);
                if (t == null) continue;
                t.gameObject.SetActive(false);
                Record(t.gameObject);
            }
        }

        /// <summary>
        /// Hero launch mount (T017 <c>world_pad_deck</c> on <c>world_flame_trench</c>) in place of T015's flat navy table:
        /// the T017 <c>vehicle_base</c> (9.0 m above its origin) is put at the rig's VehicleMount (10.5 m above grade),
        /// and the trench is turned to exhaust along +X like the T015 deck notch. T015's mount meshes are hidden, not
        /// removed, because the VehicleMount transform lives on them.
        /// </summary>
        private static void BuildLaunchMount(Transform dressing, LaunchPadRig pad)
        {
            Transform mount = pad.VehicleMount != null ? pad.VehicleMount.parent : null;
            if (mount != null)
            {
                foreach (MeshRenderer r in mount.GetComponentsInChildren<MeshRenderer>(true))
                {
                    r.enabled = false;
                    Record(r);
                }
            }
            var hero = Group(dressing, "LaunchMount");
            float baseY = (pad.VehicleMount != null ? dressing.InverseTransformPoint(pad.VehicleMount.position).y : 10.5f) - 9.0f;
            Model(hero, "world_flame_trench", new Vector3(0f, baseY, 0f), 90f, 1f, boxUv: true, castShadows: true);
            Model(hero, "world_pad_deck", new Vector3(0f, baseY, 0f), 90f, 1f, boxUv: true, castShadows: true);
        }

        private static Mesh OriginalMesh(Renderer r)
        {
            var source = PrefabUtility.GetCorrespondingObjectFromSource(r.GetComponent<MeshFilter>());
            return source != null ? source.sharedMesh : null;
        }

        private static void Record(Object o)
        {
            if (PrefabUtility.IsPartOfPrefabInstance(o)) PrefabUtility.RecordPrefabInstancePropertyModifications(o);
        }

        // ------------------------------------------------------------------ ground, sea, wear

        private static void BuildGround(Transform dressing, List<GameObject> highOnly)
        {
            var ground = Group(dressing, "Ground");
            MeshObject(ground, "Terrain", BayDressingMeshes.Save(BayDressingMeshes.Terrain(4000f, 200), "bay_terrain"),
                new[] { BayDressingAssets.Load("LP_Ground037"), BayDressingAssets.Load("LP_Ground054") }, castShadows: false);
            MeshObject(ground, "GravelVerge",
                BayDressingMeshes.Save(BayDressingMeshes.Annulus(BayDressingMeshes.ApronR - 1f, BayDressingMeshes.GravelR, BayDressingMeshes.GradeY + 0.02f), "bay_gravel_verge"),
                new[] { BayDressingAssets.Load("LP_Gravel022") }, castShadows: false);
            MeshObject(ground, "Ocean",
                BayDressingMeshes.Save(BayDressingMeshes.Ocean(BayDressingMeshes.ShoreM - 80f, 5900f, 7000f), "bay_ocean"),
                new[] { BayDressingAssets.Load("LP_ocean") }, castShadows: false);

            // Paint on the apron (deck top, 2 m): hold-short bars and a lane to the tower base; soot at the trench mouth.
            Mesh quad = BayDressingMeshes.Save(BayDressingMeshes.GroundQuad(), "bay_ground_quad");
            Material paint = BayDressingAssets.Load("LP_paint");
            Material yellow = LaunchPadAssets.MaterialFor("marking");
            var paintGroup = Group(ground, "ApronPaint");
            float deck = LaunchPadRig.DeckTopM + 0.012f;
            for (int i = 0; i < 6; i++) Decal(paintGroup, quad, yellow, new Vector3(-30f + i * 2.4f, deck, -24f), 45f, new Vector2(1.2f, 6f));
            Decal(paintGroup, quad, paint, new Vector3(-8f, deck, -30f), 0f, new Vector2(0.35f, 22f));
            Decal(paintGroup, quad, paint, new Vector3(8f, deck, -30f), 0f, new Vector2(0.35f, 22f));
            Decal(paintGroup, quad, yellow, new Vector3(0f, deck, -19.5f), 0f, new Vector2(16f, 0.45f));

            var soot = Group(ground, "Soot");
            Material sootMat = BayDressingAssets.Load("LP_soot");
            float grade = BayDressingMeshes.GradeY + 0.035f;
            Decal(soot, quad, sootMat, new Vector3(52f, grade, 0f), 0f, new Vector2(26f, 18f));
            Decal(soot, quad, sootMat, new Vector3(66f, grade, 3f), 20f, new Vector2(30f, 22f));
            Decal(soot, quad, sootMat, new Vector3(41f, deck, 0f), 0f, new Vector2(8f, 12f));
            highOnly.Add(soot.gameObject);
        }

        // ------------------------------------------------------------------ distant site silhouettes (T017 models)

        private static GameObject BuildSilhouettes(Transform dressing)
        {
            var site = Group(dressing, "SiteSilhouettes");
            float g = BayDressingMeshes.GradeY;
            Model(site, "world_site_subtropical_assembly", new Vector3(-470f, g, 660f), 18f, 1f);
            Model(site, "world_site_equatorial_hall", new Vector3(-330f, g, 540f), 8f, 1f);
            Model(site, "world_site_subtropical_water_tower", new Vector3(360f, g, 470f), 0f, 1f);
            Model(site, "world_site_polar_blockhouse", new Vector3(190f, g, 230f), -32f, 1f);
            Model(site, "world_lightning_mast", new Vector3(-210f, g, 390f), 0f, 1f);
            Model(site, "world_lightning_mast", new Vector3(250f, g, 420f), 0f, 1f);
            Model(site, "world_lightning_mast", new Vector3(-90f, g, 520f), 0f, 1f);
            Vector3 right = Vector3.Cross(Vector3.up, BayDressingMeshes.Forward);
            foreach (float s in new[] { -520f, -330f, 380f, 560f })   // dunes off the vehicle's line so the sea stays open
            {
                Vector3 p = BayDressingMeshes.Forward * (BayDressingMeshes.ShoreM - 70f) + right * s;
                p.y = BayDressingMeshes.Height(p.x, p.z) - 0.3f;
                Model(site, "world_site_subtropical_dunes", p, BayStage.VantageAzimuthDeg + s * 0.03f, 1.3f);
            }
            return site.gameObject;
        }

        private static readonly (string key, string material)[] WorldMaterialMap =
        {
            ("gantry", "LP_steel"), ("detail", "LP_detail_dark"), ("engine_metal", "LP_detail_dark"), ("hull", "LP_Concrete031"),
            ("livery", "LP_Concrete031"), ("foliage", "LP_foliage"), ("ground", "LP_Ground054"), ("concrete", "LP_Concrete034"),
            ("heat_shield", "LP_detail_dark"), ("thermal", "LP_detail_dark"), ("nozzle", "LP_Concrete031"),
        };

        private static void Model(Transform parent, string model, Vector3 at, float yawDeg, float scale, bool boxUv = false,
            bool castShadows = false)
        {
            var asset = AssetDatabase.LoadAssetAtPath<GameObject>(WorldModelsDir + "/" + model + ".fbx");
            if (asset == null)
            {
                Debug.LogWarning("[MissionForge] T034 dressing: missing " + model);
                return;
            }
            var go = (GameObject)PrefabUtility.InstantiatePrefab(asset, parent);
            go.transform.localPosition = at;
            go.transform.localRotation = Quaternion.Euler(0f, yawDeg, 0f);
            go.transform.localScale = Vector3.one * scale;
            foreach (Renderer r in go.GetComponentsInChildren<Renderer>(true))
            {
                Material[] mats = r.sharedMaterials;
                for (int i = 0; i < mats.Length; i++)
                {
                    string n = mats[i] != null ? mats[i].name.ToLowerInvariant() : "";
                    foreach (var (key, material) in WorldMaterialMap)
                    {
                        if (!n.Contains(key)) continue;
                        mats[i] = BayDressingAssets.Load(material) ?? LaunchPadAssets.MaterialFor(material.Substring(3)) ?? mats[i];
                        break;
                    }
                }
                r.sharedMaterials = mats;
                // Fogged silhouettes 200–700 m out cast no shadows (no cost); the hero mount does.
                r.shadowCastingMode = castShadows ? ShadowCastingMode.On : ShadowCastingMode.Off;
                var filter = r.GetComponent<MeshFilter>();
                if (boxUv && filter != null && filter.sharedMesh != null)
                    filter.sharedMesh = BayDressingMeshes.Save(BayDressingMeshes.WithBoxUv(filter.sharedMesh), filter.sharedMesh.name + "_uv");
            }
        }

        // ------------------------------------------------------------------ practicals: floods, cones, tower lamps

        private static IEnumerable<GameObject> BuildPracticals(Transform dressing, LaunchPadRig pad)
        {
            var practicals = Group(dressing, "Practicals");
            var cones = Group(practicals, "FloodCones");
            Material coneMat = BayDressingAssets.Load("LP_flood_cone");
            Material glowMat = BayDressingAssets.Load("LP_glow");
            Mesh card = BayDressingMeshes.Save(BayDressingMeshes.Card(), "bay_card");
            Mesh cone = BayDressingMeshes.Save(BayDressingMeshes.Cone(17f, 0.9f, 7.5f, 0.055f), "bay_flood_cone");

            // The pad's own floodlights (lit or not): a cheap cone card along each lamp's aim, and a glow on the head.
            foreach (Light l in pad.GetComponentsInChildren<Light>(true).Where(l => l.name == "Flood"))
            {
                Vector3 local = practicals.InverseTransformPoint(l.transform.position);
                Quaternion rot = Quaternion.Inverse(practicals.rotation) * l.transform.rotation;
                MeshObject(cones, "Cone_" + cones.childCount, cone, new[] { coneMat }, false, local, rot);
                Glow(cones, card, glowMat, local + Vector3.up * 0.2f, 3.4f);
            }

            // Two extra flood towers further out (lamp heads and cones, no Light: the URP additional-light budget is spent).
            var extra = Group(practicals, "ExtraFloods");
            var floodModel = AssetDatabase.LoadAssetAtPath<GameObject>(LaunchPadAssets.ModelsDir + "/pad_floodlight.fbx");
            foreach (Vector3 at in new[] { new Vector3(-62f, 0f, 58f), new Vector3(58f, 0f, 74f), new Vector3(-4f, 0f, 96f) })
            {
                Vector3 p = new Vector3(at.x, BayDressingMeshes.GradeY, at.z);
                if (floodModel != null)
                {
                    var pole = (GameObject)PrefabUtility.InstantiatePrefab(floodModel, extra);
                    pole.transform.localPosition = p;
                    pole.transform.localRotation = Quaternion.LookRotation(new Vector3(at.x, 0f, at.z).normalized, Vector3.up);
                }
                Vector3 head = p + Vector3.up * 14.4f;
                Vector3 inward = new Vector3(-at.x, 0f, -at.z).normalized;
                Vector3 aim = (Vector3.down * Mathf.Cos(0.45f) + inward * Mathf.Sin(0.45f)).normalized;
                MeshObject(cones, "Cone_" + cones.childCount, cone, new[] { coneMat }, false, head, Quaternion.LookRotation(aim, inward));
                Glow(cones, card, glowMat, head + Vector3.up * 0.2f, 3.4f);
            }

            // Work-platform lamps on the tower: two per segment at the camera-facing corners (they follow the segments' visibility).
            var glows = new List<GameObject> { cones.gameObject };
            Material lamp = LaunchPadAssets.MaterialFor("lamp");
            Mesh cube = Resources.GetBuiltinResource<Mesh>("Cube.fbx");
            Vector3 toCam = -BayDressingMeshes.Forward;
            foreach (Transform seg in pad.GetComponentsInChildren<Transform>(true).Where(t => t.name.StartsWith("Segment_")))
            {
                var corners = new[] { new Vector3(4.5f, 0f, 4.5f), new Vector3(-4.5f, 0f, 4.5f), new Vector3(4.5f, 0f, -4.5f), new Vector3(-4.5f, 0f, -4.5f) };
                foreach (Vector3 c in corners.OrderByDescending(c => Vector3.Dot(seg.TransformDirection(c), toCam)).Take(1))
                {
                    Vector3 at = c * 1.06f + Vector3.up * 7.4f;
                    var l = MeshObject(seg, "TowerLamp", cube, new[] { lamp }, false, at, Quaternion.identity);
                    l.transform.localScale = new Vector3(0.6f, 0.22f, 0.6f);
                    var gl = MeshObject(seg, "TowerLampGlow", card, new[] { glowMat }, false, at,
                        Quaternion.Inverse(seg.rotation) * Quaternion.LookRotation(-toCam, Vector3.up));
                    gl.transform.localScale = Vector3.one * 1.3f;
                    glows.Add(gl);
                }
            }
            return glows;
        }

        private static void RemoveTowerLamps(LaunchPadRig pad)
        {
            foreach (Transform t in pad.GetComponentsInChildren<Transform>(true).Where(t => t.name.StartsWith("TowerLamp")).ToList())
                Object.DestroyImmediate(t.gameObject);
        }

        private static void Glow(Transform parent, Mesh card, Material mat, Vector3 local, float size)
        {
            var g = MeshObject(parent, "Glow", card, new[] { mat }, false, local, Quaternion.LookRotation(BayDressingMeshes.Forward, Vector3.up));
            g.transform.localScale = Vector3.one * size;
        }

        // ------------------------------------------------------------------ people for scale

        private static void BuildCrew(Transform dressing)
        {
            var model = AssetDatabase.LoadAssetAtPath<GameObject>(LaunchPadAssets.ModelsDir + "/tech_worker.fbx");
            if (model == null) return;
            var crew = Group(dressing, "Crew");
            float deck = LaunchPadRig.DeckTopM;
            var spots = new (Vector3 at, float yaw)[]
            {
                (new Vector3(-9.5f, deck, -13f), 20f), (new Vector3(-8.3f, deck, -14.1f), 60f), (new Vector3(10.5f, deck, -12f), -35f),
                (new Vector3(-13f, deck, 6f), 120f), (new Vector3(-22f, deck, -18f), 10f), (new Vector3(20f, deck, -26f), -80f),
                (new Vector3(-29f, deck, -27.5f), 75f),
            };
            foreach (var (at, yaw) in spots)
            {
                var go = (GameObject)PrefabUtility.InstantiatePrefab(model, crew);
                go.transform.localPosition = at;
                go.transform.localRotation = Quaternion.Euler(0f, yaw, 0f);
            }
        }

        // ------------------------------------------------------------------ runtime wiring

        private static void ConfigureRuntime(Transform bay)
        {
            var env = bay.GetComponent<BayEnvironment>();
            if (env != null)
            {
                var so = new SerializedObject(env);
                so.FindProperty("haze").colorValue = Haze;
                so.FindProperty("hazeDensity").floatValue = HazeDensity;
                so.ApplyModifiedPropertiesWithoutUndo();
            }
            var stage = bay.GetComponent<BayStage>();
            if (stage != null)
            {
                var so = new SerializedObject(stage);
                so.FindProperty("steamMaterial").objectReferenceValue = BayDressingAssets.Load("LP_steam");
                so.ApplyModifiedPropertiesWithoutUndo();
            }
            RenderSettings.fogDensity = HazeDensity;
        }

        // ------------------------------------------------------------------ helpers

        private static Transform Group(Transform parent, string name)
        {
            var t = new GameObject(name).transform;
            t.SetParent(parent, false);
            return t;
        }

        private static GameObject MeshObject(Transform parent, string name, Mesh mesh, Material[] mats, bool castShadows,
            Vector3? local = null, Quaternion? rot = null)
        {
            var go = new GameObject(name);
            go.transform.SetParent(parent, false);
            go.transform.localPosition = local ?? Vector3.zero;
            go.transform.localRotation = rot ?? Quaternion.identity;
            go.AddComponent<MeshFilter>().sharedMesh = mesh;
            var r = go.AddComponent<MeshRenderer>();
            r.sharedMaterials = mats;
            r.shadowCastingMode = castShadows ? ShadowCastingMode.On : ShadowCastingMode.Off;
            r.lightProbeUsage = LightProbeUsage.Off;
            return go;
        }

        private static void Decal(Transform parent, Mesh quad, Material mat, Vector3 at, float yawDeg, Vector2 size)
        {
            var go = MeshObject(parent, "Decal", quad, new[] { mat }, false, at, Quaternion.Euler(0f, yawDeg, 0f));
            go.transform.localScale = new Vector3(size.x, 1f, size.y);
        }
    }
}
