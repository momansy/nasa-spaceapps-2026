using System.Collections.Generic;
using System.IO;
using MissionForge.App;
using MissionForge.App.Screens;
using MissionForge.App.Space;
using MissionForge.Data;
using MissionForge.Data.Editor;
using MissionForge.Net;
using Unity.Cinemachine;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.InputSystem.UI;
using UnityEngine.Rendering;
using UnityEngine.Rendering.Universal;
using UnityEngine.SceneManagement;
using UnityEngine.UIElements;

namespace MissionForge.Editor
{
    /// <summary>
    /// Generates every MissionForge asset and scene that is derived from code: the Earth mesh and
    /// materials, the post-processing profile, the UI panel settings, the Shell scene and one scene
    /// per host screen. Re-running it is safe; it overwrites what it generated.
    /// Batch mode: -executeMethod MissionForge.Editor.ProjectSetup.Run
    /// </summary>
    public static class ProjectSetup
    {
        private const string Root = "Assets/MissionForge";
        private const string ScenesDir = Root + "/Scenes";
        private const string SpaceDir = Root + "/App/Space";
        private const string EarthTexDir = Root + "/Art/Textures/Earth";
        private const string LayoutsDir = Root + "/UI/Layouts";
        private const string PanelSettingsPath = Root + "/UI/MissionForgePanelSettings.asset";
        private const string ThemePath = Root + "/UI/Theme/MissionForgeTheme.tss";
        private const string ServerConfigPath = Root + "/App/Config/ServerConfig.asset";
        private const string UrpAssetPath = "Assets/Settings/PC_RPAsset.asset";

        private const int ScreenSortOrder = 10;
        private const int OverlaySortOrder = 50;
        private const int ChromeSortOrder = 100;
        private const float CameraFieldOfView = 34f;
        private const float CameraBlendSeconds = 1.8f;

        /// <summary>Direction from the Earth towards the sun in world space (art-directed, game value).</summary>
        private static readonly Vector3 ToSun = new Vector3(0.90f, 0.22f, 0.38f).normalized;

        /// <summary>Authored camera vantage per screen: position and look-at point, in units of 1000 km.</summary>
        private static readonly Dictionary<ScreenId, (Vector3 position, Vector3 lookAt)> Vantages =
            new Dictionary<ScreenId, (Vector3, Vector3)>
            {
                { ScreenId.Title, (new Vector3(-9.5f, 3.4f, -15.5f), new Vector3(-5.2f, 0.9f, 0f)) },
                { ScreenId.Lobby, (new Vector3(-3.0f, 10.5f, -22.0f), new Vector3(-1.0f, 8.4f, 0f)) },
                { ScreenId.Briefing, (new Vector3(7.5f, 5.0f, -16.0f), new Vector3(5.6f, 2.0f, 0f)) },
                { ScreenId.ContractVote, (new Vector3(0f, 13.0f, -21.0f), new Vector3(0f, 9.8f, 0f)) },
                { ScreenId.BuildBay, (new Vector3(-2.0f, -1.5f, -27.0f), new Vector3(0f, 0f, 0f)) },
                { ScreenId.TestStand, (new Vector3(4.0f, -2.0f, -25.0f), new Vector3(0f, 0.5f, 0f)) },
                { ScreenId.DesignReview, (new Vector3(-12.0f, 9.0f, -20.0f), new Vector3(-7.0f, 7.5f, 0f)) },
                { ScreenId.FlightReadinessReview, (new Vector3(11.0f, 10.0f, -19.0f), new Vector3(6.5f, 8.2f, 0f)) },
                { ScreenId.Countdown, (new Vector3(0.5f, 2.2f, -13.2f), new Vector3(0f, 4.4f, 0f)) },
                { ScreenId.Flight, (new Vector3(-1.5f, 7.6f, -9.4f), new Vector3(0.5f, 6.2f, 0f)) },
                { ScreenId.OrbitMap, (new Vector3(0f, 26.0f, -19.0f), new Vector3(0f, 0f, 0f)) },
                { ScreenId.Debrief, (new Vector3(13.0f, 4.0f, -22.0f), new Vector3(9.0f, 3.0f, 0f)) },
                { ScreenId.CampaignHub, (new Vector3(-14.0f, -3.0f, -21.0f), new Vector3(-9.0f, -1.5f, 0f)) },
            };

        [MenuItem("MissionForge/Rebuild Scenes And Assets")]
        public static void Run()
        {
            ConfigureProject();
            ConfigureTextures();
            Mesh sphere = CreateSphereMesh();
            Material earth = CreateMaterial("MissionForge/Earth", SpaceDir + "/Materials/Earth.mat");
            earth.SetTexture("_DayTex", LoadTexture("earth_day_4k.jpg"));
            earth.SetTexture("_NightTex", LoadTexture("earth_night_2k.jpg"));
            earth.SetTexture("_OceanTex", LoadTexture("earth_ocean_2k.jpg"));
            earth.SetTexture("_CloudTex", LoadTexture("earth_clouds_2k.jpg"));
            Material atmosphere = CreateMaterial("MissionForge/Atmosphere", SpaceDir + "/Materials/Atmosphere.mat");
            Material starfield = CreateMaterial("MissionForge/Starfield", SpaceDir + "/Materials/Starfield.mat");
            EditorUtility.SetDirty(earth);

            VolumeProfile profile = CreateVolumeProfile();
            PanelSettings panel = CreatePanelSettings();
            ServerConfig serverConfig = CreateServerConfig();
            ConfigureRenderPipeline();
            AssetDatabase.SaveAssets();

            var scenePaths = new List<string>();
            scenePaths.Add(BuildShellScene(sphere, earth, atmosphere, starfield, profile, panel, serverConfig));
            foreach (ScreenInfo info in ScreenCatalog.All)
            {
                scenePaths.Add(BuildScreenScene(info, panel, starfield));
            }

            var buildScenes = new List<EditorBuildSettingsScene>();
            foreach (string path in scenePaths) buildScenes.Add(new EditorBuildSettingsScene(path, true));
            EditorBuildSettings.scenes = buildScenes.ToArray();

            GameDataSync.SyncProject();
            AssetDatabase.SaveAssets();
            EditorSceneManager.OpenScene(scenePaths[0], OpenSceneMode.Single);
            Debug.Log("[MissionForge] Rebuilt " + scenePaths.Count + " scenes and shared assets.");
        }

        // ---------------------------------------------------------------- project

        private static void ConfigureProject()
        {
            PlayerSettings.companyName = "MissionForge Team";
            PlayerSettings.productName = "MissionForge";
            PlayerSettings.colorSpace = ColorSpace.Linear;
            PlayerSettings.runInBackground = true;
            PlayerSettings.SplashScreen.showUnityLogo = false;
            PlayerSettings.WebGL.compressionFormat = WebGLCompressionFormat.Disabled;
            PlayerSettings.WebGL.decompressionFallback = false;
            PlayerSettings.WebGL.template = "PROJECT:MissionForge";
            PlayerSettings.defaultScreenWidth = 1920;
            PlayerSettings.defaultScreenHeight = 1080;
        }

        private static void ConfigureRenderPipeline()
        {
            var urp = AssetDatabase.LoadAssetAtPath<UniversalRenderPipelineAsset>(UrpAssetPath);
            if (urp == null)
            {
                Debug.LogError("[MissionForge] URP asset not found at " + UrpAssetPath);
                return;
            }
            urp.supportsHDR = true;
            urp.msaaSampleCount = 4;
            urp.renderScale = 1f;
            urp.shadowDistance = 0f; // The space backdrop casts no shadows; later scenes raise this.
            EditorUtility.SetDirty(urp);

            // One pipeline asset for every quality level so WebGL looks like the editor.
            GraphicsSettings.defaultRenderPipeline = urp;
            int current = QualitySettings.GetQualityLevel();
            for (int i = 0; i < QualitySettings.names.Length; i++)
            {
                QualitySettings.SetQualityLevel(i, false);
                QualitySettings.renderPipeline = urp;
                QualitySettings.vSyncCount = 1;
                QualitySettings.antiAliasing = 4;
            }
            QualitySettings.SetQualityLevel(current, false);
        }

        private static void ConfigureTextures()
        {
            ConfigureTexture("earth_day_4k.jpg", 4096, true);
            ConfigureTexture("earth_night_2k.jpg", 2048, true);
            ConfigureTexture("earth_ocean_2k.jpg", 2048, false);
            ConfigureTexture("earth_clouds_2k.jpg", 2048, false);
        }

        private static void ConfigureTexture(string fileName, int maxSize, bool srgb)
        {
            string path = EarthTexDir + "/" + fileName;
            var importer = AssetImporter.GetAtPath(path) as TextureImporter;
            if (importer == null)
            {
                Debug.LogError("[MissionForge] Missing texture " + path);
                return;
            }
            importer.textureType = TextureImporterType.Default;
            importer.sRGBTexture = srgb;
            importer.maxTextureSize = maxSize;
            importer.wrapModeU = TextureWrapMode.Repeat;
            importer.wrapModeV = TextureWrapMode.Clamp;
            importer.mipmapEnabled = true;
            importer.anisoLevel = 8;
            importer.filterMode = FilterMode.Trilinear;
            importer.npotScale = TextureImporterNPOTScale.None;
            importer.textureCompression = TextureImporterCompression.CompressedHQ;
            importer.SaveAndReimport();
        }

        private static Texture2D LoadTexture(string fileName) =>
            AssetDatabase.LoadAssetAtPath<Texture2D>(EarthTexDir + "/" + fileName);

        // ---------------------------------------------------------------- assets

        /// <summary>Unit-radius UV sphere, dense enough that the limb is a smooth curve at 1080p.</summary>
        private static Mesh CreateSphereMesh()
        {
            const int longitudes = 192;
            const int latitudes = 96;
            var vertices = new List<Vector3>();
            var normals = new List<Vector3>();
            var uvs = new List<Vector2>();
            var triangles = new List<int>();

            for (int lat = 0; lat <= latitudes; lat++)
            {
                float v = lat / (float)latitudes;
                float theta = v * Mathf.PI; // 0 at the north pole.
                for (int lon = 0; lon <= longitudes; lon++)
                {
                    float u = lon / (float)longitudes;
                    float phi = u * Mathf.PI * 2f;
                    var p = new Vector3(-Mathf.Cos(phi) * Mathf.Sin(theta), Mathf.Cos(theta), Mathf.Sin(phi) * Mathf.Sin(theta));
                    vertices.Add(p);
                    normals.Add(p);
                    uvs.Add(new Vector2(u, 1f - v));
                }
            }

            int stride = longitudes + 1;
            for (int lat = 0; lat < latitudes; lat++)
            {
                for (int lon = 0; lon < longitudes; lon++)
                {
                    int a = lat * stride + lon;
                    int b = a + stride;
                    triangles.Add(a); triangles.Add(a + 1); triangles.Add(b);
                    triangles.Add(a + 1); triangles.Add(b + 1); triangles.Add(b);
                }
            }

            var mesh = new Mesh { name = "EarthSphere", indexFormat = IndexFormat.UInt32 };
            mesh.SetVertices(vertices);
            mesh.SetNormals(normals);
            mesh.SetUVs(0, uvs);
            mesh.SetTriangles(triangles, 0);
            mesh.RecalculateBounds();

            string path = SpaceDir + "/Meshes/EarthSphere.asset";
            EnsureFolder(path);
            AssetDatabase.DeleteAsset(path);
            AssetDatabase.CreateAsset(mesh, path);
            return mesh;
        }

        private static Material CreateMaterial(string shaderName, string path)
        {
            Shader shader = Shader.Find(shaderName);
            if (shader == null) throw new System.InvalidOperationException("Shader not found: " + shaderName);
            EnsureFolder(path);
            var existing = AssetDatabase.LoadAssetAtPath<Material>(path);
            if (existing != null)
            {
                existing.shader = shader;
                return existing;
            }
            var material = new Material(shader);
            AssetDatabase.CreateAsset(material, path);
            return material;
        }

        private static VolumeProfile CreateVolumeProfile()
        {
            string path = SpaceDir + "/SpaceVolumeProfile.asset";
            AssetDatabase.DeleteAsset(path);
            var profile = ScriptableObject.CreateInstance<VolumeProfile>();
            AssetDatabase.CreateAsset(profile, path);

            var bloom = profile.Add<Bloom>(true);
            bloom.threshold.Override(1.0f);
            bloom.intensity.Override(0.85f);
            bloom.scatter.Override(0.72f);
            bloom.highQualityFiltering.Override(true);

            var tonemapping = profile.Add<Tonemapping>(true);
            tonemapping.mode.Override(TonemappingMode.ACES);

            var vignette = profile.Add<Vignette>(true);
            vignette.intensity.Override(0.26f);
            vignette.smoothness.Override(0.45f);

            var colour = profile.Add<ColorAdjustments>(true);
            colour.contrast.Override(6f);
            colour.saturation.Override(8f);

            foreach (VolumeComponent component in profile.components)
            {
                AssetDatabase.AddObjectToAsset(component, profile);
            }
            EditorUtility.SetDirty(profile);
            return profile;
        }

        private static PanelSettings CreatePanelSettings()
        {
            var theme = AssetDatabase.LoadAssetAtPath<ThemeStyleSheet>(ThemePath);
            if (theme == null) throw new System.InvalidOperationException("Theme not found: " + ThemePath);
            var panel = AssetDatabase.LoadAssetAtPath<PanelSettings>(PanelSettingsPath);
            if (panel == null)
            {
                panel = ScriptableObject.CreateInstance<PanelSettings>();
                AssetDatabase.CreateAsset(panel, PanelSettingsPath);
            }
            panel.themeStyleSheet = theme;
            panel.scaleMode = PanelScaleMode.ScaleWithScreenSize;
            panel.referenceResolution = new Vector2Int(1920, 1080);
            panel.screenMatchMode = PanelScreenMatchMode.MatchWidthOrHeight;
            panel.match = 0.5f;
            panel.clearColor = false;
            EditorUtility.SetDirty(panel);
            return panel;
        }

        private static ServerConfig CreateServerConfig()
        {
            var config = AssetDatabase.LoadAssetAtPath<ServerConfig>(ServerConfigPath);
            if (config != null) return config;
            EnsureFolder(ServerConfigPath);
            config = ScriptableObject.CreateInstance<ServerConfig>();
            AssetDatabase.CreateAsset(config, ServerConfigPath);
            return config;
        }

        // ---------------------------------------------------------------- scenes

        private static string BuildShellScene(Mesh sphere, Material earthMat, Material atmoMat, Material starfield,
            VolumeProfile profile, PanelSettings panel, ServerConfig serverConfig)
        {
            Scene scene = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);
            ApplySpaceEnvironment(starfield);

            // Sun.
            var sunGo = new GameObject("Sun");
            var sun = sunGo.AddComponent<Light>();
            sun.type = LightType.Directional;
            sun.color = new Color(1f, 0.97f, 0.92f);
            sun.intensity = 1.6f;
            sun.shadows = LightShadows.None;
            sunGo.transform.rotation = Quaternion.LookRotation(-ToSun, Vector3.up);

            // Earth: an axial-tilt pivot, the spinning globe and the atmosphere shell.
            var space = new GameObject("Space");
            var tilt = new GameObject("EarthAxis");
            tilt.transform.SetParent(space.transform, false);
            tilt.transform.rotation = Quaternion.Euler(0f, 0f, 23.44f); // Axial tilt, degrees (physical).
            GameObject earth = CreateSphere("Earth", sphere, earthMat, tilt.transform, EarthSystem.EarthRadiusUnits);
            earth.transform.localRotation = Quaternion.Euler(0f, 108f, 0f); // Starting longitude under the camera.
            GameObject atmosphere = CreateSphere("Atmosphere", sphere, atmoMat, space.transform, EarthSystem.EarthRadiusUnits * 1.045f);
            var earthSystem = space.AddComponent<EarthSystem>();
            SetReference(earthSystem, "earth", earth.transform);
            SetReference(earthSystem, "atmosphere", atmosphere.transform);
            SetReference(earthSystem, "sun", sun);

            // Camera.
            var cameraGo = new GameObject("Main Camera") { tag = "MainCamera" };
            var camera = cameraGo.AddComponent<Camera>();
            camera.clearFlags = CameraClearFlags.Skybox;
            camera.fieldOfView = CameraFieldOfView;
            camera.nearClipPlane = 0.1f;
            camera.farClipPlane = 400f;
            camera.allowHDR = true;
            camera.allowMSAA = true;
            cameraGo.transform.position = Vantages[ScreenId.Title].position;
            cameraGo.transform.rotation = Quaternion.LookRotation(Vantages[ScreenId.Title].lookAt - Vantages[ScreenId.Title].position);
            cameraGo.AddComponent<AudioListener>();
            var cameraData = cameraGo.AddComponent<UniversalAdditionalCameraData>();
            cameraData.renderPostProcessing = true;
            cameraData.antialiasing = AntialiasingMode.None;
            var brain = cameraGo.AddComponent<CinemachineBrain>();
            brain.DefaultBlend = new CinemachineBlendDefinition(CinemachineBlendDefinition.Styles.EaseInOut, CameraBlendSeconds);

            // Post-processing.
            var volumeGo = new GameObject("Global Volume");
            var volume = volumeGo.AddComponent<Volume>();
            volume.isGlobal = true;
            volume.sharedProfile = profile;

            // UI input.
            var eventSystem = new GameObject("EventSystem");
            eventSystem.AddComponent<EventSystem>();
            eventSystem.AddComponent<InputSystemUIInputModule>();

            // App services.
            var app = new GameObject("App");
            var root = app.AddComponent<AppRoot>();
            var flow = app.AddComponent<SceneFlow>();
            var navigator = app.AddComponent<HostNavigator>();
            var room = app.AddComponent<RoomClientBehaviour>();
            var data = app.AddComponent<GameDataService>();
            room.config = serverConfig;
            EditorUtility.SetDirty(room);

            // Chrome.
            var chromeGo = new GameObject("Chrome");
            UIDocument chromeDoc = AddDocument(chromeGo, panel, "Chrome", ChromeSortOrder);
            var chrome = chromeGo.AddComponent<ChromeController>();
            SetReference(chrome, "document", chromeDoc);
            SetReference(chrome, "room", room);

            SetReference(root, "flow", flow);
            SetReference(root, "chrome", chrome);
            SetReference(root, "room", room);
            SetReference(root, "data", data);
            SetReference(flow, "chrome", chrome);
            SetReference(navigator, "flow", flow);

            string path = ScenesDir + "/" + ScreenCatalog.ShellSceneName + ".unity";
            EnsureFolder(path);
            EditorSceneManager.SaveScene(scene, path);
            return path;
        }

        private static string BuildScreenScene(ScreenInfo info, PanelSettings panel, Material starfield)
        {
            Scene scene = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);
            ApplySpaceEnvironment(starfield);

            var go = new GameObject("Screen_" + info.Id);
            int sortOrder = info.Kind == ScreenKind.Overlay ? OverlaySortOrder : ScreenSortOrder;
            UIDocument document = AddDocument(go, panel, info.Layout, sortOrder);

            CinemachineCamera vantage = null;
            if (Vantages.TryGetValue(info.Id, out (Vector3 position, Vector3 lookAt) pose))
            {
                var vantageGo = new GameObject("Vantage");
                vantageGo.transform.SetParent(go.transform, false);
                vantageGo.transform.position = pose.position;
                vantageGo.transform.rotation = Quaternion.LookRotation(pose.lookAt - pose.position, Vector3.up);
                vantage = vantageGo.AddComponent<CinemachineCamera>();
                LensSettings lens = vantage.Lens;
                lens.FieldOfView = CameraFieldOfView;
                lens.NearClipPlane = 0.1f;
                lens.FarClipPlane = 400f;
                vantage.Lens = lens;
                vantageGo.AddComponent<CameraDrift>();
            }

            ScreenController controller;
            switch (info.Id)
            {
                case ScreenId.Title: controller = go.AddComponent<TitleScreen>(); break;
                case ScreenId.Lobby: controller = go.AddComponent<LobbyScreen>(); break;
                default: controller = go.AddComponent<RegionScreen>(); break;
            }
            controller.Configure(info.Id, document, vantage);
            EditorUtility.SetDirty(controller);

            string path = ScenesDir + "/" + info.SceneName + ".unity";
            EditorSceneManager.SaveScene(scene, path);
            return path;
        }

        /// <summary>Every scene gets the starfield sky and flat dark ambient, so no scene shows the default skybox.</summary>
        private static void ApplySpaceEnvironment(Material starfield)
        {
            RenderSettings.skybox = starfield;
            RenderSettings.ambientMode = AmbientMode.Flat;
            RenderSettings.ambientLight = new Color(0.02f, 0.025f, 0.04f);
            RenderSettings.fog = false;
            RenderSettings.defaultReflectionMode = DefaultReflectionMode.Custom;
            RenderSettings.sun = null;
        }

        private static GameObject CreateSphere(string name, Mesh mesh, Material material, Transform parent, float radius)
        {
            var go = new GameObject(name);
            go.transform.SetParent(parent, false);
            go.transform.localScale = Vector3.one * radius;
            go.AddComponent<MeshFilter>().sharedMesh = mesh;
            var renderer = go.AddComponent<MeshRenderer>();
            renderer.sharedMaterial = material;
            renderer.shadowCastingMode = ShadowCastingMode.Off;
            renderer.receiveShadows = false;
            renderer.lightProbeUsage = LightProbeUsage.Off;
            renderer.reflectionProbeUsage = ReflectionProbeUsage.Off;
            return go;
        }

        private static UIDocument AddDocument(GameObject go, PanelSettings panel, string layout, int sortOrder)
        {
            string path = LayoutsDir + "/" + layout + ".uxml";
            var tree = AssetDatabase.LoadAssetAtPath<VisualTreeAsset>(path);
            if (tree == null) throw new System.InvalidOperationException("Layout not found: " + path);
            var document = go.AddComponent<UIDocument>();
            document.panelSettings = panel;
            document.visualTreeAsset = tree;
            document.sortingOrder = sortOrder;
            return document;
        }

        private static void SetReference(Object target, string field, Object value)
        {
            var serialized = new SerializedObject(target);
            SerializedProperty property = serialized.FindProperty(field);
            if (property == null) throw new System.InvalidOperationException(target.GetType().Name + " has no serialized field '" + field + "'.");
            property.objectReferenceValue = value;
            serialized.ApplyModifiedPropertiesWithoutUndo();
        }

        private static void EnsureFolder(string assetPath)
        {
            string directory = Path.GetDirectoryName(assetPath);
            if (!string.IsNullOrEmpty(directory) && !Directory.Exists(directory))
            {
                Directory.CreateDirectory(directory);
                AssetDatabase.Refresh();
            }
        }
    }
}
