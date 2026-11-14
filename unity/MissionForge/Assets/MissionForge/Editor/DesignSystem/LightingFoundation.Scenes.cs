using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text.RegularExpressions;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.Rendering.Universal;
using UnityEngine.SceneManagement;
using Object = UnityEngine.Object;

namespace MissionForge.Editor.DesignSystem
{
    /// <summary>
    /// Places the rigs in MF_Title and MF_Lobby (Orbit) and MF_BuildBay (DuskPad), disables only the ad-hoc
    /// lighting and volume objects each rig replaces, sets the dusk scene's skybox and ambient, bakes each rig's
    /// reflection probe and saves. Idempotent: an existing rig instance is reused, never duplicated.
    ///
    /// Runtime facts this respects (read from SceneFlow, BayEnvironment and ProjectSetup):
    /// - MF_Shell stays the active scene, so its RenderSettings (starfield skybox, flat ambient) and its "Sun"
    ///   light apply in every screen scene. A screen scene's own RenderSettings only matter in the editor and for
    ///   probe bakes.
    /// - BayEnvironment fades out every directional light that is not under the "Bay" object, so the DuskPad rig
    ///   is parented under "Bay".
    /// </summary>
    public static partial class LightingFoundation
    {
        private const string ScenesDir = "Assets/MissionForge/Scenes";
        private const string PanelSettingsPath = "Assets/MissionForge/UI/MissionForgePanelSettings.asset";
        private const string UnboundPanel = "m_PanelSettings: {fileID: 0}";

        /// <summary>BayEnvironment.haze: the runtime fog colour, also used for the bay probe bake.</summary>
        private static readonly Color BayHaze = new Color(0.33f, 0.33f, 0.40f);

        /// <summary>
        /// MF_Shell's "Sun" (ProjectSetup.BuildShellScene: intensity 1.6, no shadows, along the same ToSun) already
        /// lights every space screen at runtime. While that is true the Orbit rig's own key would double the sun, so
        /// its Light component is disabled in Title and Lobby. Set to false once the Shell sun is retired.
        /// </summary>
        private static readonly bool ShellSunIsOrbitKey = true;

        private sealed class SceneTarget
        {
            public string SceneName;
            public string RigPath;
            public string ParentName;     // null: scene root
            public string[] Replaces;     // ad-hoc lighting objects the rig replaces (disabled, not deleted)
            public bool DuskEnvironment;  // HDRI skybox + skybox ambient
            public bool DisableRigKey;
        }

        private static readonly SceneTarget[] Targets =
        {
            new SceneTarget
            {
                SceneName = "MF_Title", RigPath = OrbitRigPath, Replaces = new[] { "TitleRim", "TitleFill" },
                DisableRigKey = ShellSunIsOrbitKey,
            },
            new SceneTarget
            {
                SceneName = "MF_Lobby", RigPath = OrbitRigPath, Replaces = Array.Empty<string>(),
                DisableRigKey = ShellSunIsOrbitKey,
            },
            new SceneTarget
            {
                SceneName = "MF_BuildBay", RigPath = DuskRigPath, ParentName = "Bay",
                Replaces = new[] { "DuskKey", "DuskFill", "BayVolume" }, DuskEnvironment = true,
            },
        };

        [MenuItem(MenuRoot + "4. Apply To Scenes", priority = 114)]
        public static void ApplyToScenes()
        {
            if (!Application.isBatchMode && !EditorSceneManager.SaveCurrentModifiedScenesIfUserWantsTo())
            {
                Warn("Apply To Scenes cancelled: open scenes have unsaved changes.");
                return;
            }
            SceneSetup[] previous = EditorSceneManager.GetSceneManagerSetup();
            try
            {
                foreach (SceneTarget target in Targets) Apply(target);
            }
            finally
            {
                bool restorable = previous.Length > 0 && previous.All(s => !string.IsNullOrEmpty(s.path));
                if (!Application.isBatchMode && restorable) EditorSceneManager.RestoreSceneManagerSetup(previous);
            }
            AssetDatabase.SaveAssets();
            Log("Scenes updated.");
        }

        private static void Apply(SceneTarget target)
        {
            string path = ScenesDir + "/" + target.SceneName + ".unity";
            int unboundBefore = CountUnboundPanels(path);
            Scene scene = EditorSceneManager.OpenScene(path, OpenSceneMode.Single);
            var prefab = LoadRequired<GameObject>(target.RigPath);

            Transform parent = null;
            if (target.ParentName != null)
            {
                parent = scene.GetRootGameObjects().FirstOrDefault(g => g.name == target.ParentName)?.transform;
                if (parent == null) throw new InvalidOperationException(target.SceneName + ": root object '" + target.ParentName + "' not found");
            }

            GameObject rig = FindOrCreateRig(scene, prefab, target.RigPath, parent);
            foreach (string name in target.Replaces) DisableReplaced(scene, name, rig.transform);
            ReportKeptLighting(scene, rig.transform);

            Light key = RigPart<Light>(rig, KeyLightName);
            bool keyEnabled = !target.DisableRigKey;
            if (key.enabled != keyEnabled)
            {
                key.enabled = keyEnabled;
                PrefabUtility.RecordPrefabInstancePropertyModifications(key);
                Log(target.SceneName + ": rig Key Light " + (keyEnabled ? "enabled" : "disabled (MF_Shell 'Sun' is the runtime orbit key)"));
            }

            if (target.DuskEnvironment)
            {
                ApplyDuskEnvironment(target.SceneName, key);
                HideEnvironmentSkyDomes(scene, rig.transform);
                TunePadPracticals(scene, rig.transform);
                FitWetSheen(scene, rig);
            }
            else LogEnvironmentKept(target.SceneName);

            EditorSceneManager.MarkSceneDirty(scene);
            if (!EditorSceneManager.SaveScene(scene)) throw new InvalidOperationException("Could not save " + path);

            BakeProbe(scene, rig);
            EditorSceneManager.MarkSceneDirty(scene);
            if (!EditorSceneManager.SaveScene(scene)) throw new InvalidOperationException("Could not save " + path);
            GuardPanelSettings(path, unboundBefore);
            Log(target.SceneName + ": saved with " + prefab.name);
        }

        private static GameObject FindOrCreateRig(Scene scene, GameObject prefab, string rigPath, Transform parent)
        {
            List<GameObject> found = AllObjects(scene)
                .Where(g => PrefabUtility.IsOutermostPrefabInstanceRoot(g) &&
                            PrefabUtility.GetPrefabAssetPathOfNearestInstanceRoot(g) == rigPath)
                .ToList();
            GameObject rig;
            if (found.Count == 0)
            {
                rig = (GameObject)PrefabUtility.InstantiatePrefab(prefab, scene);
                Log(scene.name + ": placed " + prefab.name);
            }
            else
            {
                rig = found[0];
                for (int i = 1; i < found.Count; i++)
                {
                    Log(scene.name + ": removed duplicate rig instance " + PathOf(found[i].transform));
                    Object.DestroyImmediate(found[i]);
                }
            }
            if (rig.transform.parent != parent)
            {
                rig.transform.SetParent(parent, false);
                Log(scene.name + ": rig parented under " + (parent != null ? parent.name : "scene root"));
            }
            rig.transform.localPosition = Vector3.zero;
            rig.transform.rotation = Quaternion.identity; // directional rotations are authored in world space
            rig.transform.localScale = Vector3.one;
            return rig;
        }

        /// <summary>Disables (never deletes) a replaced object, and only if it holds nothing but lighting components.</summary>
        private static void DisableReplaced(Scene scene, string name, Transform rig)
        {
            List<GameObject> matches = AllObjects(scene).Where(g => g.name == name && !g.transform.IsChildOf(rig)).ToList();
            if (matches.Count == 0)
            {
                Log(scene.name + ": '" + name + "' not present (already removed)");
                return;
            }
            foreach (GameObject go in matches)
            {
                if (!IsPureLighting(go))
                {
                    Warn(scene.name + ": '" + PathOf(go.transform) + "' holds more than lighting components or has children; left untouched");
                    continue;
                }
                if (!go.activeSelf)
                {
                    Log(scene.name + ": '" + PathOf(go.transform) + "' already disabled");
                    continue;
                }
                go.SetActive(false);
                Log(scene.name + ": disabled replaced object '" + PathOf(go.transform) + "'");
            }
        }

        private static bool IsPureLighting(GameObject go)
        {
            if (go.transform.childCount > 0) return false;
            foreach (Component c in go.GetComponents<Component>())
            {
                if (c == null) return false;
                if (c is Transform || c is Light || c is Volume || c is ReflectionProbe || c is UniversalAdditionalLightData) continue;
                return false;
            }
            return true;
        }

        private static void ReportKeptLighting(Scene scene, Transform rig)
        {
            foreach (GameObject go in AllObjects(scene))
            {
                if (go.transform.IsChildOf(rig) || !go.activeInHierarchy) continue;
                string kind = go.TryGetComponent(out Light l) && l.enabled ? l.type + " light"
                    : go.TryGetComponent(out Volume v) && v.enabled ? "volume"
                    : go.TryGetComponent(out ReflectionProbe p) && p.enabled ? "reflection probe" : null;
                if (kind != null) Log(scene.name + ": kept " + kind + " '" + PathOf(go.transform) + "' (not replaced by the rig)");
            }
        }

        private static void ApplyDuskEnvironment(string sceneName, Light key)
        {
            var sky = LoadRequired<Material>(DuskSkyPath);
            string n = sceneName + ".RenderSettings.";
            if (RenderSettings.skybox != sky) { Log(n + "skybox: " + Name(RenderSettings.skybox) + " -> " + sky.name); RenderSettings.skybox = sky; }
            if (RenderSettings.ambientMode != AmbientMode.Skybox) { Log(n + "ambientMode: " + RenderSettings.ambientMode + " -> Skybox"); RenderSettings.ambientMode = AmbientMode.Skybox; }
            if (!Mathf.Approximately(RenderSettings.ambientIntensity, 1f)) { Log(n + "ambientIntensity -> 1"); RenderSettings.ambientIntensity = 1f; }
            if (RenderSettings.defaultReflectionMode != DefaultReflectionMode.Skybox)
            {
                Log(n + "defaultReflectionMode: " + RenderSettings.defaultReflectionMode + " -> Skybox");
                RenderSettings.defaultReflectionMode = DefaultReflectionMode.Skybox;
            }
            if (RenderSettings.fogColor != BayHaze) { Log(n + "fogColor: " + RenderSettings.fogColor + " -> " + BayHaze + " (BayEnvironment haze)"); RenderSettings.fogColor = BayHaze; }
            if (RenderSettings.sun != key) { Log(n + "sun -> rig Key Light"); RenderSettings.sun = key; }
            DynamicGI.UpdateEnvironment();
            Warn(sceneName + ": MF_Shell stays the active scene at runtime and BayEnvironment switches ambient to its trilight " +
                 "colours, so this HDRI skybox and ambient only drive the editor view and the probe bake until BayEnvironment " +
                 "adopts the skybox (see Art/Lighting/README.md).");
        }

        /// <summary>Shader of T015's gradient sky dome (MF_LaunchPad/DuskSky, Art/Environment, read-only for T031).</summary>
        private const string EnvironmentSkyShader = "MissionForge/DuskSky";

        /// <summary>
        /// The rig's HDRI Sky Dome replaces the environment's procedural gradient dome. That dome lives in an
        /// Art/Environment prefab, so it is switched off with a scene-level prefab-instance override (m_IsActive), never
        /// by editing the prefab. It drew at a real 2400 m depth and hid any sky behind it.
        /// </summary>
        private static void HideEnvironmentSkyDomes(Scene scene, Transform rig)
        {
            foreach (GameObject go in AllObjects(scene))
            {
                if (go.transform.IsChildOf(rig) || !go.TryGetComponent(out MeshRenderer r)) continue;
                Material m = r.sharedMaterial;
                if (m == null || m.shader == null || m.shader.name != EnvironmentSkyShader) continue;
                if (!go.activeSelf)
                {
                    Log(scene.name + ": environment sky dome '" + PathOf(go.transform) + "' already hidden");
                    continue;
                }
                go.SetActive(false);
                if (PrefabUtility.IsPartOfPrefabInstance(go)) PrefabUtility.RecordPrefabInstancePropertyModifications(go);
                Log(scene.name + ": hid environment sky dome '" + PathOf(go.transform) + "' (scene override; the rig Sky Dome replaces it)");
            }
        }

        /// <summary>Name of the launch pad floodlight spots (LaunchPadPrefabBuilder.AddFloodlight, T015).</summary>
        private const string PadFloodName = "Flood";
        /// <summary>
        /// Light budget: URP Forward (WebGL tier) shades at most 4 additional lights per object. The dusk rig has two
        /// additional directionals (fill, rim), so two floodlights stay on: the two nearest the bay camera, whose pools
        /// read best. The third keeps its lamp head but its Light is disabled.
        /// </summary>
        private const int MaxPadFloods = 2;
        /// <summary>Floodlight look: sodium-warm 3400 K, steep aim (15° off vertical, towards the pad) for a pool. game_values.</summary>
        private const float FloodKelvin = 3400f;
        private const float FloodIntensity = 1400f;
        private const float FloodRange = 60f;
        private const float FloodOuterAngle = 92f;
        private const float FloodInnerAngle = 38f;
        private const float FloodTiltFromVerticalDeg = 15f;

        /// <summary>
        /// Re-aims T015's pad floodlights (scene overrides on the MF_LaunchPad instance) from almost horizontal, where
        /// they washed the front of the vehicle flat, to steep warm pools on the deck and apron.
        /// </summary>
        private static void TunePadPracticals(Scene scene, Transform rig)
        {
            List<Light> floods = AllObjects(scene)
                .Where(g => g.name == PadFloodName && !g.transform.IsChildOf(rig))
                .Select(g => g.GetComponent<Light>())
                .Where(l => l != null && l.type == LightType.Spot)
                .ToList();
            if (floods.Count == 0)
            {
                Warn(scene.name + ": no pad floodlights named '" + PadFloodName + "' found; no light pools");
                return;
            }
            Vector3 padCentre = rig.position;
            // Bay camera direction (BayStage vantage) as seen from the pad: lights nearer the camera rank first.
            Vector3 towardCamera = Quaternion.Euler(0f, BayVantageYawDeg, 0f) * Vector3.back;
            List<Light> ranked = floods.OrderByDescending(l => Vector3.Dot(l.transform.position - padCentre, towardCamera)).ToList();
            for (int i = 0; i < ranked.Count; i++)
            {
                Light l = ranked[i];
                bool keep = i < MaxPadFloods;
                l.enabled = keep;
                if (keep)
                {
                    l.useColorTemperature = true;
                    l.colorTemperature = FloodKelvin;
                    l.color = Color.white;
                    l.intensity = FloodIntensity;
                    l.range = FloodRange;
                    l.spotAngle = FloodOuterAngle;
                    l.innerSpotAngle = FloodInnerAngle;
                    l.shadows = LightShadows.None;
                    Vector3 inward = padCentre - l.transform.position;
                    inward.y = 0f;
                    inward = inward.sqrMagnitude > 1e-4f ? inward.normalized : Vector3.forward;
                    float tilt = FloodTiltFromVerticalDeg * Mathf.Deg2Rad;
                    Vector3 aim = Vector3.down * Mathf.Cos(tilt) + inward * Mathf.Sin(tilt);
                    l.transform.rotation = Quaternion.LookRotation(aim, inward);
                }
                if (PrefabUtility.IsPartOfPrefabInstance(l))
                {
                    PrefabUtility.RecordPrefabInstancePropertyModifications(l);
                    PrefabUtility.RecordPrefabInstancePropertyModifications(l.transform);
                }
                Log(scene.name + ": pad floodlight '" + PathOf(l.transform) + "' at " + l.transform.position.ToString("F1") +
                    (keep ? " -> " + FloodKelvin + " K, " + FloodIntensity + ", pool aim" : " -> Light disabled (light budget)"));
            }
        }

        /// <summary>Ground object of the launch site (MF_LaunchPad/Site/site_ground, T015).</summary>
        private const string SiteGroundName = "site_ground";

        /// <summary>Lifts the rig's Wet Sheen to the top of the site ground (plus WetSheenLift) and logs its flatness.</summary>
        private static void FitWetSheen(Scene scene, GameObject rig)
        {
            Transform sheen = rig.transform.Find(WetSheenName);
            if (sheen == null)
            {
                Warn(scene.name + ": rig has no '" + WetSheenName + "'; run Build Rigs");
                return;
            }
            Renderer ground = AllObjects(scene)
                .Where(g => g.name == SiteGroundName && !g.transform.IsChildOf(rig.transform))
                .SelectMany(g => g.GetComponentsInChildren<Renderer>(true))
                .OrderByDescending(r => r.bounds.size.x * r.bounds.size.z)
                .FirstOrDefault();
            float top = rig.transform.position.y;
            if (ground != null)
            {
                Bounds b = ground.bounds;
                top = b.max.y;
                Log(scene.name + ": site ground bounds " + b.min.ToString("F2") + " .. " + b.max.ToString("F2") +
                    "; the sheen sits on its top face");
            }
            else
            {
                Warn(scene.name + ": no '" + SiteGroundName + "' renderer; sheen stays at the rig origin + " + WetSheenLift + " m");
            }
            Vector3 p = sheen.position;
            p.y = top + WetSheenLift;
            sheen.position = p;
            PrefabUtility.RecordPrefabInstancePropertyModifications(sheen);
            Log(scene.name + ": wet sheen at y = " + p.y.ToString("F3"));
        }

        private static void LogEnvironmentKept(string sceneName)
        {
            Log(sceneName + ": RenderSettings kept (skybox " + Name(RenderSettings.skybox) + ", ambient " + RenderSettings.ambientMode +
                ", reflections " + RenderSettings.defaultReflectionMode + "); the space look comes from MF_Shell at runtime.");
        }

        /// <summary>
        /// Bakes the rig probe to Art/Lighting/Probes/MF_Probe_[scene].exr and uses it as a Custom probe. If the bake
        /// is not possible (for example batch mode with -nographics), the probe stays Realtime / OnAwake.
        /// </summary>
        private static void BakeProbe(Scene scene, GameObject rig)
        {
            ReflectionProbe probe = RigPart<ReflectionProbe>(rig, ProbeName);
            EnsureFolder(ProbesDir);
            string exrPath = ProbesDir + "/MF_Probe_" + scene.name + ".exr";
            Texture baked = null;
            try
            {
                probe.mode = ReflectionProbeMode.Custom;
                if (Lightmapping.BakeReflectionProbe(probe, exrPath))
                {
                    AssetDatabase.ImportAsset(exrPath, ImportAssetOptions.ForceSynchronousImport);
                    EnsureCubemapImport(exrPath);
                    baked = AssetDatabase.LoadAssetAtPath<Texture>(exrPath);
                }
            }
            catch (Exception e)
            {
                Warn(scene.name + ": probe bake threw " + e.Message);
            }

            if (baked is Cubemap)
            {
                probe.customBakedTexture = baked;
                Log(scene.name + ": reflection probe baked to " + exrPath + " (Custom, " + ProbeResolution + " px)");
            }
            else
            {
                probe.mode = ReflectionProbeMode.Realtime;
                probe.refreshMode = ReflectionProbeRefreshMode.OnAwake;
                probe.customBakedTexture = null;
                Warn(scene.name + ": reflection probe bake failed; probe left Realtime / OnAwake (record this fallback)");
            }
            PrefabUtility.RecordPrefabInstancePropertyModifications(probe);
        }

        private static void EnsureCubemapImport(string path)
        {
            if (!(AssetImporter.GetAtPath(path) is TextureImporter importer)) return;
            if (importer.textureShape == TextureImporterShape.TextureCube && importer.mipmapEnabled) return;
            importer.textureShape = TextureImporterShape.TextureCube;
            importer.generateCubemap = TextureImporterGenerateCubemap.AutoCubemap;
            importer.mipmapEnabled = true; // roughness-based reflection blur samples the mips
            importer.SaveAndReimport();
            Log("Cubemap import set on " + path);
        }

        /// <summary>
        /// ProjectSetup notes that Unity 6000.6 can drop UIDocument.panelSettings when a script saves a scene. If
        /// this save produced new unbound documents, rebind them the same way ProjectSetup does.
        /// </summary>
        private static void GuardPanelSettings(string scenePath, int unboundBefore)
        {
            int unboundAfter = CountUnboundPanels(scenePath);
            if (unboundAfter <= unboundBefore) return;
            if (unboundBefore > 0)
            {
                Warn(scenePath + ": UIDocument panel settings lost on save and the scene already had unbound documents; rebind by hand.");
                return;
            }
            string guid = AssetDatabase.AssetPathToGUID(PanelSettingsPath);
            if (string.IsNullOrEmpty(guid)) throw new InvalidOperationException("No panel settings asset at " + PanelSettingsPath);
            string full = Path.GetFullPath(scenePath);
            string text = File.ReadAllText(full);
            File.WriteAllText(full, text.Replace(UnboundPanel, "m_PanelSettings: {fileID: 11400000, guid: " + guid + ", type: 2}"));
            AssetDatabase.ImportAsset(scenePath, ImportAssetOptions.ForceUpdate);
            Warn(scenePath + ": UIDocument panel settings were dropped on save; rebound " + unboundAfter + " document(s) to " + PanelSettingsPath);
        }

        private static int CountUnboundPanels(string scenePath)
        {
            string full = Path.GetFullPath(scenePath);
            return File.Exists(full) ? Regex.Matches(File.ReadAllText(full), Regex.Escape(UnboundPanel)).Count : 0;
        }

        private static T RigPart<T>(GameObject rig, string childName) where T : Component
        {
            Transform t = rig.transform.Find(childName);
            if (t == null || !t.TryGetComponent(out T part))
            {
                throw new InvalidOperationException(rig.name + " has no " + typeof(T).Name + " on '" + childName + "'; run Build Rigs");
            }
            return part;
        }

        private static IEnumerable<GameObject> AllObjects(Scene scene) =>
            scene.GetRootGameObjects().SelectMany(r => r.GetComponentsInChildren<Transform>(true)).Select(t => t.gameObject).ToList();

        private static string PathOf(Transform t) => t.parent == null ? t.name : PathOf(t.parent) + "/" + t.name;

        private static string Name(Object o) => o != null ? o.name : "None";
    }
}
