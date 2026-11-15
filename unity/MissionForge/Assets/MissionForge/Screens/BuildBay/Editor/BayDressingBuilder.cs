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
        /// <summary>
        /// Main-light shadow distance on High, m (rework 2, M9; was 320 m). The camera stands 60–130 m from the pad, so
        /// 200 m still shadows everything near the vehicle while the far cascades stop drawing distant casters.
        /// </summary>
        public const float HighShadowDistanceM = 200f;

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
            BuildHeroTower(pad);
            BuildHeroArms(pad);
            var highOnly = new List<GameObject>();
            BuildGround(dressing, highOnly);
            highOnly.Add(BuildSilhouettes(dressing));
            highOnly.AddRange(BuildDistance(dressing));
            BuildWetSheen(dressing, pad);
            HideRigWetSheen(scene);
            highOnly.AddRange(BuildPracticals(dressing, pad));
            BuildCrew(dressing);
            TrimShadowCasters(pad, dressing);
            foreach (string group in new[] { "Ground/ApronPaint", "Ground/Soot", "WetSheen", "LampReflections", "Practicals/FloodCones" })
                MergeChildren(dressing.Find(group));
            var quality = dressing.gameObject.AddComponent<BayQualityGroup>();
            quality.Configure(highOnly);
            var qso = new SerializedObject(quality);
            qso.FindProperty("highShadowDistanceM").floatValue = HighShadowDistanceM;
            qso.ApplyModifiedPropertiesWithoutUndo();
            dressing.gameObject.AddComponent<BayFrameGrade>().Configure(BayDressingAssets.Load("LP_frame_grade"),
                BayDressingMeshes.Save(BayDressingMeshes.Card(), "bay_card"));
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
        /// Hero launch mount (build_hero_pad.py <c>hero_launch_mount</c>: legged table, stairs, plinth, lamps) on the
        /// T017 <c>world_flame_trench</c>, in place of T015's flat table. The T015 mount meshes are hidden, not removed,
        /// because the rig's VehicleMount transform (10.5 m above grade) lives on them; the hero table top is at 12 m
        /// so the nozzles sit inside its 11.2 m opening exactly as before.
        /// </summary>
        private static void BuildLaunchMount(Transform dressing, LaunchPadRig pad)
        {
            Transform mount = pad.VehicleMount != null ? pad.VehicleMount.parent : null;
            if (mount == null) throw new System.InvalidOperationException("LaunchPadRig has no VehicleMount");
            RemoveHero(mount);
            foreach (MeshRenderer r in mount.GetComponentsInChildren<MeshRenderer>(true))
            {
                r.enabled = false;
                Record(r);
            }
            // Rework 2 (M1): T017's world_flame_trench is no longer placed. With the plinth walls gone it stood under the
            // open table as a solid 8 m concrete block; the hero mount now carries its own exhaust pit and deflector.
            Group(dressing, "LaunchMount");
            HeroPiece(mount, "hero_launch_mount");
        }

        // ------------------------------------------------------------------ hero service tower (build_hero_pad.py)

        public const string HeroPrefix = "Hero_";
        private const string HeroModelsDir = LaunchPadAssets.ModelsDir + "/Hero";

        /// <summary>
        /// Clads the rig's tower: every 8 m <c>Segment_NN</c> gets a hero storey (alternating the plain and the balcony
        /// variant) as a child, so LaunchPadRig's segment visibility and crown height drive the hero tower unchanged.
        /// The T015 lattice meshes stay as hidden renderers. The crown gets the machine house (the crane pivot is kept),
        /// the tower foot a plant building, and the crane hook a hook block. No rig contract or attach point moves.
        /// </summary>
        private static void BuildHeroTower(LaunchPadRig pad)
        {
            var segments = pad.GetComponentsInChildren<Transform>(true).Where(t => t.name.StartsWith("Segment_"))
                .OrderBy(t => t.name, System.StringComparer.Ordinal).ToList();
            if (segments.Count == 0) throw new System.InvalidOperationException("LaunchPadRig has no tower segments");
            for (int i = 0; i < segments.Count; i++)
            {
                RemoveHero(segments[i]);
                HideOwn(segments[i], null);
                HeroPiece(segments[i], i % 2 == 0 ? "hero_tower_segment_a" : "hero_tower_segment_b");
            }
            Transform tower = segments[0].parent;
            RemoveHero(tower, recursive: false);
            HeroPiece(tower, "hero_tower_base");

            Transform crown = BayEnvironmentBuilder.FindDeep(pad.transform, "pad_gantry_crown");
            if (crown != null)
            {
                RemoveHero(crown);
                HideOwn(crown, "crane_pivot");
                HeroPiece(crown, "hero_tower_crown");
            }
            if (pad.Hook != null)
            {
                RemoveHero(pad.Hook);
                HideOwn(pad.Hook, null);
                HeroPiece(pad.Hook, "hero_crane_hook");
            }
        }

        /// <summary>
        /// Rework 2 (M3): each T015 umbilical arm (a stretched truss ending in a plain near-black box) gets the hero truss,
        /// which stretches with the arm, and the modelled arm-end plate (hinge yoke, curved connector plate, couplers,
        /// hose loops, lamp), which <see cref="BayArmEnd"/> keeps at the tip at true size. The T015 meshes are hidden.
        /// The arm ends cast no shadow (small parts, rubric M9 shadow-caster budget).
        /// </summary>
        private static void BuildHeroArms(LaunchPadRig pad)
        {
            foreach (string name in new[] { "Arm_Upper", "Arm_Lower" })
            {
                Transform arm = BayEnvironmentBuilder.FindDeep(pad.transform, name);
                if (arm == null) throw new System.InvalidOperationException("LaunchPadRig has no " + name);
                RemoveHero(arm);
                HideOwn(arm, null);
                HeroPiece(arm, "hero_umbilical_truss");
                GameObject end = HeroPiece(arm, "hero_umbilical_end", castShadows: false);
                end.transform.localPosition = new Vector3(LaunchPadRig.ArmModelLengthM, 0f, 0f);
                end.AddComponent<BayArmEnd>();
            }
        }

        /// <summary>Hides the renderers of a T015 piece, skipping hero children and the subtree under <paramref name="keep"/>.</summary>
        private static void HideOwn(Transform piece, string keep)
        {
            foreach (MeshRenderer r in piece.GetComponentsInChildren<MeshRenderer>(true))
            {
                if (UnderNamed(r.transform, piece, keep)) continue;
                r.enabled = false;
                Record(r);
            }
        }

        private static bool UnderNamed(Transform t, Transform stop, string keep)
        {
            for (Transform p = t; p != null && p != stop; p = p.parent)
            {
                if (p.name.StartsWith(HeroPrefix)) return true;
                if (keep != null && p.name == keep) return true;
            }
            return false;
        }

        private static void RemoveHero(Transform parent, bool recursive = true)
        {
            var old = recursive
                ? parent.GetComponentsInChildren<Transform>(true).Where(t => t.name.StartsWith(HeroPrefix)).ToList()
                : parent.Cast<Transform>().Where(t => t.name.StartsWith(HeroPrefix)).ToList();
            foreach (Transform t in old)
                if (t != null) Object.DestroyImmediate(t.gameObject);
        }

        /// <summary>
        /// Instantiates a hero model as a child at local zero and maps its slots to LP_hero_* (concrete to the ambientCG
        /// set with box-projected metric UVs; lamp, grating and warning_red are already mapped by the importer).
        /// </summary>
        private static GameObject HeroPiece(Transform parent, string model, bool castShadows = true)
        {
            var asset = AssetDatabase.LoadAssetAtPath<GameObject>(HeroModelsDir + "/" + model + ".fbx");
            if (asset == null) throw new System.InvalidOperationException("Hero model missing: " + model + " (run build_hero_pad.py)");
            var go = (GameObject)PrefabUtility.InstantiatePrefab(asset, parent);
            go.name = HeroPrefix + model;
            go.transform.localPosition = Vector3.zero;
            go.transform.localRotation = Quaternion.identity;
            go.transform.localScale = Vector3.one;
            foreach (MeshRenderer r in go.GetComponentsInChildren<MeshRenderer>(true))
            {
                Material[] mats = r.sharedMaterials;
                int concreteSlot = -1;
                for (int i = 0; i < mats.Length; i++)
                {
                    string n = mats[i] != null ? mats[i].name : "";
                    if (n.StartsWith("hero_")) mats[i] = BayDressingAssets.Load("LP_" + n.Split(' ')[0]) ?? mats[i];
                    else if (n.StartsWith("concrete") || n == "LP_concrete")
                    {
                        mats[i] = BayDressingAssets.Load("LP_Concrete034");
                        concreteSlot = i;
                    }
                }
                bool concrete = concreteSlot >= 0;
                r.sharedMaterials = mats;
                r.shadowCastingMode = castShadows ? ShadowCastingMode.On : ShadowCastingMode.Off;
                var filter = r.GetComponent<MeshFilter>();
                if (concrete && filter != null && filter.sharedMesh != null)
                    filter.sharedMesh = BayDressingMeshes.Save(BayDressingMeshes.WithBoxUv(filter.sharedMesh, concreteSlot), filter.sharedMesh.name + "_uv");
            }
            return go;
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
            // Rework 2 (M1/M10): the far hall is the detailed hero_far_hall, on land (430 m out along the view, 21 deg
            // left, where T017's plain assembly box stood in the sea band 750 m out), its door facing the bay.
            FarHall(site, 430f, -170f);
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

        /// <summary>Places hero_far_hall <paramref name="alongM"/> out along the view axis and <paramref name="acrossM"/> to its right, on the terrain, facing the pad.</summary>
        private static void FarHall(Transform site, float alongM, float acrossM)
        {
            Vector3 right = Vector3.Cross(Vector3.up, BayDressingMeshes.Forward);
            Vector3 p = BayDressingMeshes.Forward * alongM + right * acrossM;
            p.y = BayDressingMeshes.Height(p.x, p.z) - 0.3f;
            GameObject hall = HeroPiece(site, "hero_far_hall", castShadows: false);
            hall.transform.localPosition = p;
            // Its camera face is local -Z (Blender -Y); turn it toward the pad.
            hall.transform.localRotation = Quaternion.LookRotation(new Vector3(p.x, 0f, p.z).normalized, Vector3.up);
        }

        // ------------------------------------------------------------------ distance: headlands, haze band, sun glint (rework, M8)

        /// <summary>
        /// Dusk sun bearing right of the vantage axis, degrees: mirrors T031's LightingFoundation.Rigs
        /// DuskSunRightOfViewDeg (the HDRI sun disc and the key light sit there). game_value.
        /// </summary>
        public const float SunRightOfViewDeg = 10f;

        /// <summary>Ground direction from the pad toward the dusk sun disc.</summary>
        private static Vector3 TowardSun() => Quaternion.Euler(0f, SunRightOfViewDeg, 0f) * BayDressingMeshes.Forward;

        /// <summary>
        /// Breaks the hard sea-sky line: two hazed headlands on the coast either side of the sun's path (frame 02's
        /// hills), a haze band on a 1.7 km arc straddling the horizon, and a sun-glint strip on the sea toward the sun.
        /// Returns the decorative pieces for the Low quality switch (the headlands stay: they are silhouette, not cost).
        /// </summary>
        private static IEnumerable<GameObject> BuildDistance(Transform dressing)
        {
            var distance = Group(dressing, "Distance");
            Vector3 toSun = TowardSun();
            Material land = BayDressingAssets.Load("LP_headland");
            // Inside the vantage's horizontal view (about ±25° at 16:9), clear of the sun's glint path at +10°.
            MeshObject(distance, "HeadlandLeft", BayDressingMeshes.Save(BayDressingMeshes.Headland(1000f, -30f, -6f, 62f, 3), "bay_headland_left"),
                new[] { land }, castShadows: false);
            MeshObject(distance, "HeadlandRight", BayDressingMeshes.Save(BayDressingMeshes.Headland(1150f, 17f, 34f, 48f, 9), "bay_headland_right"),
                new[] { land }, castShadows: false);
            var band = MeshObject(distance, "HorizonHaze", BayDressingMeshes.Save(BayDressingMeshes.HorizonArc(1700f, 80f, -12f, 150f), "bay_horizon_haze"),
                new[] { BayDressingAssets.Load("LP_horizon_haze") }, castShadows: false);
            // Rework 2 (M8): a second, low and dense haze card just past the shore blurs the hard sea-sky line itself.
            var low = MeshObject(distance, "HorizonHazeLow", BayDressingMeshes.Save(BayDressingMeshes.HorizonArc(1250f, 80f, -8f, 34f), "bay_horizon_haze_low"),
                new[] { BayDressingAssets.Load("LP_horizon_haze") }, castShadows: false);
            var glint = MeshObject(distance, "SunGlint",
                BayDressingMeshes.Save(BayDressingMeshes.GlintPath(toSun, BayDressingMeshes.ShoreM + 90f, 4200f, 14f, 170f), "bay_sun_glint"),
                new[] { BayDressingAssets.Load("LP_glint") }, castShadows: false);
            return new[] { band, low, glint };
        }

        // ------------------------------------------------------------------ wet sheen in the lamp pools (rework, M8)

        /// <summary>Name of T031's procedural wet-ground sheet in MF_Rig_DuskPad (LightingFoundation.WetSheenName).</summary>
        public const string RigWetSheenName = "Wet Sheen";

        /// <summary>
        /// Turns off T031's 80 m procedural wet sheet in this scene only (a prefab-instance override; MF_Rig_DuskPad is not
        /// edited): its puddles glint at random far from any lamp (rubric M8), and the LP_wet patches below replace it.
        /// </summary>
        private static void HideRigWetSheen(Scene scene)
        {
            foreach (GameObject root in scene.GetRootGameObjects())
            {
                foreach (Transform t in root.GetComponentsInChildren<Transform>(true).Where(t => t.name == RigWetSheenName).ToList())
                {
                    t.gameObject.SetActive(false);
                    Record(t.gameObject);
                }
            }
        }

        /// <summary>
        /// Wet patches (LP_wet) clustered under each floodlight and in front of the mount, instead of a uniformly glossy
        /// ground: two or three overlapping soft quads per lamp, seeded so reruns are identical. game_value placement.
        /// </summary>
        private static void BuildWetSheen(Transform dressing, LaunchPadRig pad)
        {
            var wet = Group(dressing, "WetSheen");
            Mesh quad = BayDressingMeshes.Save(BayDressingMeshes.GroundQuad(), "bay_ground_quad");
            Material mat = BayDressingAssets.Load("LP_wet");
            var rng = new System.Random(34);
            float Rand(float a, float b) => a + (float)rng.NextDouble() * (b - a);
            var pools = new List<Vector3>();
            foreach (Light l in pad.GetComponentsInChildren<Light>(true).Where(l => l.name == "Flood"))
            {
                Vector3 p = dressing.InverseTransformPoint(l.transform.position);
                Vector3 aim = dressing.InverseTransformDirection(l.transform.forward);
                pools.Add(new Vector3(p.x + aim.x * 9f, LaunchPadRig.DeckTopM + 0.02f, p.z + aim.z * 9f));
            }
            pools.Add(new Vector3(0f, LaunchPadRig.DeckTopM + 0.02f, -17f));   // in front of the mount's lit door
            pools.Add(new Vector3(-9f, LaunchPadRig.DeckTopM + 0.02f, -15f));
            pools.Add(new Vector3(9f, LaunchPadRig.DeckTopM + 0.02f, -15f));
            foreach (Vector3 c in pools)
            {
                int n = 2 + rng.Next(2);
                for (int i = 0; i < n; i++)
                {
                    Vector3 at = c + new Vector3(Rand(-3f, 3f), 0.002f * i, Rand(-3f, 3f));
                    Decal(wet, quad, mat, at, Rand(0f, 180f), new Vector2(Rand(9f, 15f), Rand(6f, 11f)));
                }
            }
            BuildLampReflections(dressing, pad, wet, quad, mat);
        }

        /// <summary>Reflection streak length and width on wet concrete, m (rework 2, M2). game_value.</summary>
        public const float ReflectionLengthM = 11f, ReflectionWidthM = 1.5f;

        /// <summary>
        /// Lamp reflections in the wet patches (rework 2, M2, frame 02's bright streaks under every lamp). A smooth
        /// transparent patch cannot reliably mirror a 0.5 m lamp head at this distance, so each floodlight gets the
        /// streak a wet surface shows: a soft warm additive card on the ground from the pole foot toward the camera,
        /// lying on its own wet patch. Seen from the vantage (azimuth −14° ± 7° orbit) it reads as the lamp mirrored in
        /// the wet ground. All streaks merge into one mesh (one draw).
        /// </summary>
        private static void BuildLampReflections(Transform dressing, LaunchPadRig pad, Transform wet, Mesh quad, Material wetMat)
        {
            var group = Group(dressing, "LampReflections");
            Material streak = BayDressingAssets.Load("LP_lamp_reflection");
            Vector3 toCamera = -BayDressingMeshes.Forward;
            float yaw = Mathf.Atan2(toCamera.x, toCamera.z) * Mathf.Rad2Deg;
            foreach (Light l in pad.GetComponentsInChildren<Light>(true).Where(l => l.name == "Flood"))
            {
                Vector3 head = dressing.InverseTransformPoint(l.transform.position);
                Vector3 foot = new Vector3(head.x, LaunchPadRig.DeckTopM + 0.03f, head.z);
                // Rework 2 review: keep the streak on the apron (two ran past its edge onto the lower terrain).
                float length = ReflectionLengthM;
                while (length > 3f && new Vector2((foot + toCamera * length).x, (foot + toCamera * length).z).magnitude > BayDressingMeshes.ApronR - 3f)
                    length -= 1f;
                Vector3 centre = foot + toCamera * (length * 0.5f);
                Decal(wet, quad, wetMat, centre, yaw, new Vector2(ReflectionWidthM * 4f, length * 1.1f));
                Decal(group, quad, streak, centre + Vector3.up * 0.01f, yaw, new Vector2(ReflectionWidthM, length));
            }
        }

        /// <summary>
        /// Merges the child decals and cards of <paramref name="group"/> into one mesh per material (rework 2, M9): the
        /// paint, soot, wet, reflection and cone groups were one draw per quad. Children are removed.
        /// </summary>
        private static void MergeChildren(Transform group)
        {
            if (group == null) return;
            var byMaterial = new Dictionary<Material, List<CombineInstance>>();
            var children = group.GetComponentsInChildren<MeshFilter>(true).Where(f => f.transform != group).ToList();
            foreach (MeshFilter f in children)
            {
                var r = f.GetComponent<MeshRenderer>();
                if (r == null || f.sharedMesh == null || r.sharedMaterial == null) continue;
                if (!byMaterial.TryGetValue(r.sharedMaterial, out var list)) byMaterial[r.sharedMaterial] = list = new List<CombineInstance>();
                list.Add(new CombineInstance { mesh = f.sharedMesh, transform = group.worldToLocalMatrix * f.transform.localToWorldMatrix });
            }
            foreach (MeshFilter f in children) if (f != null) Object.DestroyImmediate(f.gameObject);
            string prefix = "bay_merged_" + group.name.ToLowerInvariant();
            foreach (var kv in byMaterial)
            {
                var mesh = new Mesh { indexFormat = UnityEngine.Rendering.IndexFormat.UInt32 };
                mesh.CombineMeshes(kv.Value.ToArray(), true, true);
                mesh.RecalculateBounds();
                string name = prefix + "_" + kv.Key.name.ToLowerInvariant();
                MeshObject(group, "Merged_" + kv.Key.name, BayDressingMeshes.Save(mesh, name), new[] { kv.Key }, false);
            }
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

            // The hero storeys carry their own platform lamps (build_hero_pad.py), so no lamp cards are added here.
            var glows = new List<GameObject> { cones.gameObject };
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

        /// <summary>
        /// Rework 2 (M9): thin or tiny props stop casting shadows (crew figures, lamp poles, lightning masts); each of
        /// their submeshes drew once per shadow cascade, about a fifth of the frame's draws, for shadows that are a few
        /// pixels wide at bay distance. The hero tower, mount, arm trusses and the vehicle keep theirs.
        /// </summary>
        private static void TrimShadowCasters(LaunchPadRig pad, Transform dressing)
        {
            var renderers = new List<MeshRenderer>();
            renderers.AddRange(pad.GetComponentsInChildren<MeshRenderer>(true)
                .Where(r => HasAncestor(r.transform, "pad_floodlight", "pad_lightning_mast")));
            foreach (string group in new[] { "Crew", "Practicals" })
            {
                Transform t = dressing.Find(group);
                if (t != null) renderers.AddRange(t.GetComponentsInChildren<MeshRenderer>(true));
            }
            foreach (MeshRenderer r in renderers)
            {
                if (r.shadowCastingMode == ShadowCastingMode.Off) continue;
                r.shadowCastingMode = ShadowCastingMode.Off;
                Record(r);
            }
        }

        private static bool HasAncestor(Transform t, params string[] names)
        {
            for (Transform p = t; p != null; p = p.parent)
                foreach (string n in names) if (p.name.StartsWith(n)) return true;
            return false;
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
                so.FindProperty("sparkMaterial").objectReferenceValue = BayDressingAssets.Load("LP_weld_spark");
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
