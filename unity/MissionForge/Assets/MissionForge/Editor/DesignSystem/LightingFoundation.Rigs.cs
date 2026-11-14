using System;
using System.IO;
using UnityEditor;
using UnityEngine;
using UnityEngine.Rendering;
using Object = UnityEngine.Object;

namespace MissionForge.Editor.DesignSystem
{
    /// <summary>
    /// Lighting-rig prefabs in Art/Lighting. Each rig has named children only (no runtime C#):
    /// "Key Light", "Fill Light", "Reflection Probe", "Volume Global" (MF_Volume_Global, priority 1) and
    /// "Volume Override" (the rig's override profile, priority 2). A skybox is a scene setting, not a prefab part,
    /// so the HDRI skybox materials MF_Sky_Dusk and MF_Sky_Interior are assigned by <see cref="ApplyToScenes"/>.
    /// Light values are game_value art targets (STYLE_GUIDE: warm 4500 K key, cool 8000 K fill, about 4:1).
    /// </summary>
    public static partial class LightingFoundation
    {
        public const string DuskRigPath = LightingDir + "/MF_Rig_DuskPad.prefab";
        public const string OrbitRigPath = LightingDir + "/MF_Rig_Orbit.prefab";
        public const string InteriorRigPath = LightingDir + "/MF_Rig_Interior.prefab";
        public const string DuskSkyPath = LightingDir + "/MF_Sky_Dusk.mat";
        public const string InteriorSkyPath = LightingDir + "/MF_Sky_Interior.mat";

        public const string KeyLightName = "Key Light";
        public const string FillLightName = "Fill Light";
        public const string RimLightName = "Rim Light";
        public const string ProbeName = "Reflection Probe";
        public const string GlobalVolumeName = "Volume Global";
        public const string OverrideVolumeName = "Volume Override";
        public const string SkyDomeName = "Sky Dome";
        public const string WetSheenName = "Wet Sheen";

        public const string DuskSkyDomeMaterialPath = LightingDir + "/MF_SkyDome_Dusk.mat";
        public const string WetSheenMaterialPath = LightingDir + "/MF_WetSheen.mat";
        private const string SkyDomeShaderName = "MissionForge/HdriSkyDome";
        private const string WetSheenShaderName = "MissionForge/WetSheen";

        // Poly Haven CC0 HDRIs, 2K .hdr (slugs and URLs in Art/Lighting/README.md). The sun or key position in each
        // equirect was measured from the downloaded file (luminance-weighted centroid of the sun pixels, or the
        // brightest pixel): u from the left edge, elevation in degrees.
        public const string DuskHdriPath = HdriDir + "/qwantani_sunset_puresky_2k.hdr";
        public const string InteriorHdriPath = HdriDir + "/empty_warehouse_01_2k.hdr";
        private const float DuskHdriSunU = 0.6001f;
        private const float DuskHdriSunElevationDeg = 6.09f;
        private const float InteriorHdriKeyU = 0.5984f;
        private const float InteriorHdriKeyElevationDeg = 51.42f;

        // Build Bay vantage (BayStage.VantageAzimuthDeg, T015): the camera looks along yaw −14° at the vehicle from a
        // slight three-quarter view. The dusk sun and rim are placed relative to it so they read from the camera.
        private const float BayVantageYawDeg = -14f;
        /// <summary>Sun 10° right of the view axis: in frame (about x = 1310 px at 1080p), right of the vehicle, behind it.</summary>
        private const float DuskSunRightOfViewDeg = 10f;
        /// <summary>Warm rim from 65° right of the view axis, behind the vehicle: lights only its right silhouette.</summary>
        private const float DuskRimRightOfViewDeg = 65f;
        private const float DuskRimElevationDeg = 4f;

        /// <summary>
        /// Direction to the dusk sun. The key is the sun (4500 K) and sits exactly on the HDRI's sun (same azimuth
        /// and elevation), in frame behind the vehicle, so the sky dome's sun disc, the key and the long shadows
        /// towards the camera agree. T015 had the sun 59° right of the view (out of frame); see Art/Lighting/README.md.
        /// </summary>
        private static readonly Vector3 DuskToSun = DirFromYawElevation(BayVantageYawDeg + DuskSunRightOfViewDeg, DuskHdriSunElevationDeg);

        /// <summary>Direction to the dusk rim light (the bright sky glow on the sun side). game_value.</summary>
        private static readonly Vector3 DuskToRim = DirFromYawElevation(BayVantageYawDeg + DuskRimRightOfViewDeg, DuskRimElevationDeg);

        /// <summary>
        /// Rim colour (linear): a saturated amber, about 2400 K pushed towards orange. Kelvin rims (3000–3800 K) went
        /// near white on the white hull after ACES; this keeps a visibly warm edge as in frames 01 and 02. game_value.
        /// </summary>
        private static readonly Color RimAmber = new Color(1.0f, 0.58f, 0.30f, 1f);

        /// <summary>Fill travel direction from T015's DuskFill, kept so the bay keeps its lighting intent.</summary>
        private static readonly Vector3 DuskFillTravel = new Vector3(0.45f, -0.35f, 0.82f).normalized;

        /// <summary>Direction to the orbit sun: ProjectSetup.ToSun, the Shell Sun that EarthSystem feeds to the Earth shaders.</summary>
        private static readonly Vector3 OrbitToSun = new Vector3(0.90f, 0.22f, 0.38f).normalized;

        /// <summary>Earth fill travels up from the planet below, from the side opposite the sun. game_value.</summary>
        private static readonly Vector3 EarthFillTravel = new Vector3(0.45f, 0.85f, 0.25f).normalized;

        /// <summary>MF_Title Vantage (ProjectSetup): at the origin side, pitched 49° up at the title vehicle, yaw 0.</summary>
        private const float TitleVantagePitchUpDeg = 49f;

        /// <summary>
        /// Orbit rim: from the title camera's right and behind the vehicle (camera space x 0.85 right, y 0.12 up,
        /// z 0.5 away), so the ceramic shell gets a warm right edge as in frame 01. game_value.
        /// </summary>
        private static readonly Vector3 OrbitToRim = Quaternion.Euler(-TitleVantagePitchUpDeg, 0f, 0f) * new Vector3(0.85f, 0.12f, 0.5f).normalized;

        /// <summary>Interior fill: cool screen bounce from the front and slightly above. game_value.</summary>
        private static readonly Vector3 InteriorFillTravel = new Vector3(-0.35f, -0.30f, 0.89f).normalized;

        private const float DuskSkyExposure = 0.3f;     // skybox material: ambient for the editor view and probe bake
        private const float InteriorSkyExposure = 0.7f; // ambient about 0.45 under a 1.4 key
        private const int ProbeResolution = 256;        // VISUAL_TARGET: 256 px on WebGL

        /// <summary>Sky dome sphere scale (built-in sphere, radius 0.5): encloses every bay vantage. Depth is far-plane.</summary>
        private const float SkyDomeScale = 10000f;
        /// <summary>Wet sheen: built-in 10 m plane scaled to 800 m, centred on the rig; it fades out from 120 m to 450 m.</summary>
        private const float WetSheenScale = 80f;
        /// <summary>Default sheen height above the rig origin; ApplyToScenes moves it to the ground top + this offset.</summary>
        public const float WetSheenLift = 0.04f;
        /// <summary>Dusk dome exposure on the HDRI (horizon about 2.5, sky at 15° about 1.6 in the source). game_value.</summary>
        private const float DuskDomeExposure = 0.12f;

        private sealed class LightSpec
        {
            public float Kelvin;           // used when Tint is null
            public Color? Tint;            // explicit colour (rims: a saturated amber survives ACES highlight desaturation)
            public float Intensity;
            public Vector3 Travel;
            public bool Shadows;
            public float ShadowStrength = 1f;
        }

        private sealed class ProbeSpec
        {
            public Vector3 LocalPosition;
            public Vector3 Size;
            public Vector3 Center;
            public bool BoxProjection;
            public float Near;
            public float Far;
            public float BlendDistance;
        }

        private sealed class RigSpec
        {
            public string Path;
            public LightSpec Key;
            public LightSpec Fill;
            public LightSpec Rim;          // optional, no shadows
            public ProbeSpec Probe;
            public string OverrideProfilePath;
            public Material SkyDome;       // optional HDRI sky dome (MissionForge/HdriSkyDome)
            public Material WetSheen;      // optional wet-ground sheet (MissionForge/WetSheen)
        }

        [MenuItem(MenuRoot + "3. Build Rigs", priority = 113)]
        public static void BuildRigs()
        {
            EnsureFolder(LightingDir);
            Texture2D duskHdri = ImportHdri(DuskHdriPath);
            Texture2D interiorHdri = ImportHdri(InteriorHdriPath);

            float duskRotation = PanoramicRotationFor(DuskHdriSunU, DuskToSun);
            Vector3 hdriSun = DirFromPanoramic(DuskHdriSunU, DuskHdriSunElevationDeg, duskRotation);
            Log("Dusk HDRI rotation " + duskRotation.ToString("F2") + "°; HDRI sun " + hdriSun.ToString("F3") +
                " vs key direction " + DuskToSun.ToString("F3") + " (" + Vector3.Angle(hdriSun, DuskToSun).ToString("F2") + "° apart)");
            EnsureSkyMaterial(DuskSkyPath, duskHdri, duskRotation, DuskSkyExposure);
            EnsureSkyMaterial(InteriorSkyPath, interiorHdri, 0f, InteriorSkyExposure);
            Material duskDome = EnsureDuskDomeMaterial(duskHdri, duskRotation);
            Material wetSheen = EnsureWetSheenMaterial();
            Vector3 interiorToKey = DirFromPanoramic(InteriorHdriKeyU, InteriorHdriKeyElevationDeg, 0f);

            BuildRig(new RigSpec
            {
                Path = DuskRigPath,
                OverrideProfilePath = DuskProfilePath,
                SkyDome = duskDome,
                WetSheen = wetSheen,
                // T015 used 2.4 / 0.6; trimmed with +0.2 EV in MF_Volume_Dusk (see BuildDusk). Fill = 1/4 of key.
                // The key is now a back light (sun in frame), so the camera sees the fill side of the vehicle.
                Key = new LightSpec { Kelvin = 4500f, Intensity = 2.2f, Travel = -DuskToSun, Shadows = true, ShadowStrength = 0.85f },
                Fill = new LightSpec { Kelvin = 8000f, Intensity = 0.55f, Travel = DuskFillTravel, Shadows = false },
                Rim = new LightSpec { Tint = RimAmber, Intensity = 3.2f, Travel = -DuskToRim, Shadows = false },
                // Pad origin; captured at mid-stack height. Outdoors: no box projection, so the size is only the
                // influence volume. It covers all ground the bay camera sees: in Forward+ a pixel outside it falls back
                // to MF_Shell's dark space reflection, which made distant wet ground read black.
                Probe = new ProbeSpec
                {
                    LocalPosition = new Vector3(0f, 30f, 0f), Size = new Vector3(3000f, 800f, 3000f),
                    Center = new Vector3(0f, 90f, 0f), BoxProjection = false, Near = 0.5f, Far = 3000f, BlendDistance = 10f,
                },
            });
            BuildRig(new RigSpec
            {
                Path = OrbitRigPath,
                OverrideProfilePath = OrbitProfilePath,
                Key = new LightSpec { Kelvin = 5800f, Intensity = 2.0f, Travel = -OrbitToSun, Shadows = true, ShadowStrength = 1f },
                // Earth-shine fill, only slightly cool (clouds are white). About 0.6 of the 1.6 Shell sun, brighter than
                // Earth albedo (~0.3) alone (game_value), so the camera side of a ceramic-white shell reads white, not blue-grey.
                Fill = new LightSpec { Kelvin = 6800f, Intensity = 1.0f, Travel = EarthFillTravel, Shadows = false },
                Rim = new LightSpec { Tint = RimAmber, Intensity = 1.8f, Travel = -OrbitToRim, Shadows = false },
                // Space units (1 unit = 1000 km) around the origin; covers every space vantage. Far = Shell camera far.
                Probe = new ProbeSpec
                {
                    LocalPosition = Vector3.zero, Size = new Vector3(1000f, 1000f, 1000f), Center = Vector3.zero,
                    BoxProjection = false, Near = 0.1f, Far = 400f, BlendDistance = 1f,
                },
            });
            BuildRig(new RigSpec
            {
                Path = InteriorRigPath,
                OverrideProfilePath = InteriorProfilePath,
                // Broad ceiling key aligned with the HDRI's overhead source; cool screen bounce as fill.
                Key = new LightSpec { Kelvin = 5000f, Intensity = 1.4f, Travel = -interiorToKey, Shadows = true, ShadowStrength = 0.8f },
                Fill = new LightSpec { Kelvin = 8000f, Intensity = 0.35f, Travel = InteriorFillTravel, Shadows = false },
                // A 24 x 8 x 24 m room with its floor at y = 0; box projection indoors (VISUAL_TARGET 2.5).
                Probe = new ProbeSpec
                {
                    LocalPosition = new Vector3(0f, 2.5f, 0f), Size = new Vector3(24f, 8f, 24f),
                    Center = new Vector3(0f, 1.5f, 0f), BoxProjection = true, Near = 0.1f, Far = 100f, BlendDistance = 1f,
                },
            });
            AssetDatabase.SaveAssets();
            Log("Rigs built.");
        }

        private static void BuildRig(RigSpec spec)
        {
            bool exists = AssetDatabase.LoadAssetAtPath<GameObject>(spec.Path) != null;
            // Editing the existing prefab in place keeps its object ids, so scene instances and their overrides survive.
            GameObject root = exists ? PrefabUtility.LoadPrefabContents(spec.Path) : new GameObject(Path.GetFileNameWithoutExtension(spec.Path));
            try
            {
                root.transform.localPosition = Vector3.zero;
                root.transform.localRotation = Quaternion.identity;
                root.transform.localScale = Vector3.one;
                ConfigureLight(Child(root, KeyLightName), spec.Key);
                ConfigureLight(Child(root, FillLightName), spec.Fill);
                if (spec.Rim != null) ConfigureLight(Child(root, RimLightName), spec.Rim);
                else RemoveChild(root, RimLightName);
                if (spec.SkyDome != null) ConfigureSkyDome(Child(root, SkyDomeName), spec.SkyDome);
                else RemoveChild(root, SkyDomeName);
                if (spec.WetSheen != null) ConfigureWetSheen(Child(root, WetSheenName), spec.WetSheen);
                else RemoveChild(root, WetSheenName);
                ConfigureProbe(Child(root, ProbeName), spec.Probe);
                ConfigureVolume(Child(root, GlobalVolumeName), LoadRequired<VolumeProfile>(GlobalProfilePath), 1f);
                ConfigureVolume(Child(root, OverrideVolumeName), LoadRequired<VolumeProfile>(spec.OverrideProfilePath), 2f);
                PrefabUtility.SaveAsPrefabAsset(root, spec.Path, out bool saved);
                if (!saved) throw new InvalidOperationException("Could not save " + spec.Path);
                Log((exists ? "Updated " : "Created ") + spec.Path);
            }
            finally
            {
                if (exists) PrefabUtility.UnloadPrefabContents(root);
                else Object.DestroyImmediate(root);
            }
        }

        private static GameObject Child(GameObject root, string name)
        {
            Transform t = root.transform.Find(name);
            if (t != null) return t.gameObject;
            var go = new GameObject(name);
            go.transform.SetParent(root.transform, false);
            return go;
        }

        private static void RemoveChild(GameObject root, string name)
        {
            Transform t = root.transform.Find(name);
            if (t == null) return;
            Object.DestroyImmediate(t.gameObject);
            Log(root.name + ": removed '" + name + "'");
        }

        /// <summary>
        /// HDRI sky dome: an inside-out sphere around the rig. It exists because MF_Shell stays the active scene, so a
        /// screen scene's RenderSettings.skybox never renders at runtime (see Art/Lighting/README.md).
        /// </summary>
        private static void ConfigureSkyDome(GameObject go, Material material)
        {
            go.transform.localPosition = Vector3.zero;
            go.transform.localRotation = Quaternion.identity;
            go.transform.localScale = Vector3.one * SkyDomeScale;
            ConfigureUnshadedRenderer(go, BuiltinMesh(PrimitiveType.Sphere), material, false);
            // Baked reflection probes only render ReflectionProbeStatic objects: without this the bake captures the
            // raw RenderSettings skybox instead of the graded dome.
            GameObjectUtility.SetStaticEditorFlags(go, StaticEditorFlags.ReflectionProbeStatic);
        }

        /// <summary>Wet-ground sheet; ApplyToScenes lifts it to the scene's ground top + WetSheenLift.</summary>
        private static void ConfigureWetSheen(GameObject go, Material material)
        {
            go.transform.localPosition = new Vector3(0f, WetSheenLift, 0f);
            go.transform.localRotation = Quaternion.identity;
            go.transform.localScale = new Vector3(WetSheenScale, 1f, WetSheenScale);
            ConfigureUnshadedRenderer(go, BuiltinMesh(PrimitiveType.Plane), material, true);
        }

        private static void ConfigureUnshadedRenderer(GameObject go, Mesh mesh, Material material, bool useProbes)
        {
            if (!go.TryGetComponent(out MeshFilter filter)) filter = go.AddComponent<MeshFilter>();
            if (!go.TryGetComponent(out MeshRenderer renderer)) renderer = go.AddComponent<MeshRenderer>();
            filter.sharedMesh = mesh;
            renderer.sharedMaterial = material;
            renderer.shadowCastingMode = ShadowCastingMode.Off;
            renderer.receiveShadows = useProbes;
            renderer.lightProbeUsage = useProbes ? LightProbeUsage.BlendProbes : LightProbeUsage.Off;
            renderer.reflectionProbeUsage = useProbes ? ReflectionProbeUsage.BlendProbes : ReflectionProbeUsage.Off;
            renderer.motionVectorGenerationMode = MotionVectorGenerationMode.ForceNoMotion;
            renderer.allowOcclusionWhenDynamic = false;
        }

        /// <summary>The built-in primitive mesh (a Library asset, so prefabs reference it by a stable built-in id).</summary>
        private static Mesh BuiltinMesh(PrimitiveType type)
        {
            GameObject temp = GameObject.CreatePrimitive(type);
            try
            {
                return temp.GetComponent<MeshFilter>().sharedMesh;
            }
            finally
            {
                Object.DestroyImmediate(temp);
            }
        }

        /// <summary>
        /// Dusk sky dome material: the dusk HDRI with the same rotation as MF_Sky_Dusk (so its sun is on the key),
        /// graded towards a deep-blue zenith and a warm band on the sun side of the horizon (frame 02). game_values.
        /// </summary>
        private static Material EnsureDuskDomeMaterial(Texture2D hdri, float rotationDeg)
        {
            Material m = LoadOrCreateMaterial(DuskSkyDomeMaterialPath, SkyDomeShaderName);
            m.SetTexture("_MainTex", hdri);
            m.SetFloat("_Rotation", rotationDeg);
            m.SetFloat("_Exposure", DuskDomeExposure);
            m.SetColor("_Tint", Color.white);
            m.SetColor("_ZenithTint", new Color(0.42f, 0.70f, 1.15f, 1f));   // deep blue from ~17° up
            m.SetColor("_HorizonTint", new Color(2.20f, 1.30f, 0.60f, 1f));  // orange band towards the sun
            m.SetFloat("_HorizonPower", 12f);                                 // band about 6° tall
            m.SetVector("_SunDir", DuskToSun);
            m.SetColor("_BelowHorizon", new Color(0.035f, 0.045f, 0.07f, 1f));
            m.SetFloat("_HazeStrength", 0.1f);
            m.SetFloat("_MaxRadiance", 48f);                                  // sun about 5.8 after exposure: blooms, no blowout
            EditorUtility.SetDirty(m);
            Log(DuskSkyDomeMaterialPath + ": " + hdri.name + ", rotation " + rotationDeg.ToString("F2") + "°, exposure " + DuskDomeExposure);
            return m;
        }

        /// <summary>
        /// Wet concrete sheen: damp areas darken the ground by 60 % and keep 25 % of their reflection; puddles (coverage 0.4, about a quarter of the ground,
        /// smoothness 0.95) darken by 70 % and mirror the sky and sun. The darkening also offsets the ground material
        /// reflecting the brighter HDRI sky. game_values.
        /// </summary>
        private static Material EnsureWetSheenMaterial()
        {
            Material m = LoadOrCreateMaterial(WetSheenMaterialPath, WetSheenShaderName);
            m.SetColor("_BaseColor", new Color(0.015f, 0.03f, 0.055f, 1f));
            m.SetFloat("_DampDarken", 0.6f);
            m.SetFloat("_PuddleDarken", 0.7f);
            m.SetFloat("_DampSmoothness", 0.35f);
            m.SetFloat("_PuddleSmoothness", 0.95f);
            m.SetFloat("_PuddleScale", 22f);
            m.SetFloat("_PuddleCoverage", 0.4f);
            m.SetFloat("_PuddleSoftness", 0.12f);
            m.SetFloat("_DampSpecular", 0.25f);
            m.SetFloat("_SpecularBoost", 1f);
            m.SetFloat("_FadeStart", 120f);
            m.SetFloat("_FadeEnd", 450f);
            EditorUtility.SetDirty(m);
            return m;
        }

        private static Material LoadOrCreateMaterial(string path, string shaderName)
        {
            Shader shader = Shader.Find(shaderName);
            if (shader == null) throw new InvalidOperationException("Shader " + shaderName + " not found (Art/Shaders)");
            var material = AssetDatabase.LoadAssetAtPath<Material>(path);
            if (material == null)
            {
                material = new Material(shader) { name = Path.GetFileNameWithoutExtension(path) };
                AssetDatabase.CreateAsset(material, path);
                Log("Created " + path);
            }
            material.shader = shader;
            return material;
        }

        /// <summary>Unit direction at a Unity yaw (degrees, 0 = +Z, positive turns right) and elevation above the horizon.</summary>
        private static Vector3 DirFromYawElevation(float yawDeg, float elevationDeg) =>
            (Quaternion.Euler(-elevationDeg, yawDeg, 0f) * Vector3.forward).normalized;

        private static void ConfigureLight(GameObject go, LightSpec spec)
        {
            if (!go.TryGetComponent(out Light light)) light = go.AddComponent<Light>();
            light.type = LightType.Directional;
            light.useColorTemperature = !spec.Tint.HasValue;
            if (!spec.Tint.HasValue) light.colorTemperature = spec.Kelvin;
            light.color = spec.Tint ?? Color.white;
            light.intensity = spec.Intensity;
            light.shadows = spec.Shadows ? LightShadows.Soft : LightShadows.None;
            light.shadowStrength = spec.ShadowStrength;
            light.lightmapBakeType = LightmapBakeType.Realtime;
            light.renderMode = LightRenderMode.Auto;
            go.transform.localPosition = Vector3.zero;
            go.transform.localRotation = Quaternion.LookRotation(spec.Travel, Vector3.up);
        }

        /// <summary>
        /// Prefab default is Realtime / OnAwake so the rig reflects something in any scene. ApplyToScenes bakes each
        /// placed probe to a Custom cubemap (Art/Lighting/Probes) and falls back to this default if the bake fails.
        /// </summary>
        private static void ConfigureProbe(GameObject go, ProbeSpec spec)
        {
            if (!go.TryGetComponent(out ReflectionProbe probe)) probe = go.AddComponent<ReflectionProbe>();
            go.transform.localPosition = spec.LocalPosition;
            go.transform.localRotation = Quaternion.identity;
            probe.mode = ReflectionProbeMode.Realtime;
            probe.refreshMode = ReflectionProbeRefreshMode.OnAwake;
            probe.timeSlicingMode = ReflectionProbeTimeSlicingMode.NoTimeSlicing;
            probe.resolution = ProbeResolution;
            probe.hdr = true;
            probe.boxProjection = spec.BoxProjection;
            probe.size = spec.Size;
            probe.center = spec.Center;
            probe.nearClipPlane = spec.Near;
            probe.farClipPlane = spec.Far;
            probe.blendDistance = spec.BlendDistance;
            probe.clearFlags = ReflectionProbeClearFlags.Skybox;
            probe.cullingMask = ~0;
            probe.importance = 1;
            probe.intensity = 1f;
        }

        private static void ConfigureVolume(GameObject go, VolumeProfile profile, float priority)
        {
            if (!go.TryGetComponent(out Volume volume)) volume = go.AddComponent<Volume>();
            go.transform.localPosition = Vector3.zero;
            volume.isGlobal = true;
            volume.priority = priority;
            volume.weight = 1f;
            volume.sharedProfile = profile;
        }

        /// <summary>Equirect HDR import: no mips (avoids the seam at the wrap), clamped poles, WebGL capped at 1024.</summary>
        private static Texture2D ImportHdri(string path)
        {
            if (!File.Exists(path)) throw new FileNotFoundException("HDRI missing (see Art/Lighting/README.md): " + path);
            if (!(AssetImporter.GetAtPath(path) is TextureImporter)) AssetDatabase.ImportAsset(path, ImportAssetOptions.ForceSynchronousImport);
            if (!(AssetImporter.GetAtPath(path) is TextureImporter importer)) throw new InvalidOperationException("No texture importer for " + path);

            bool changed = false;
            if (importer.textureShape != TextureImporterShape.Texture2D) { importer.textureShape = TextureImporterShape.Texture2D; changed = true; }
            if (importer.mipmapEnabled) { importer.mipmapEnabled = false; changed = true; }
            if (importer.wrapModeU != TextureWrapMode.Repeat) { importer.wrapModeU = TextureWrapMode.Repeat; changed = true; }
            if (importer.wrapModeV != TextureWrapMode.Clamp) { importer.wrapModeV = TextureWrapMode.Clamp; changed = true; }
            if (importer.maxTextureSize != 2048) { importer.maxTextureSize = 2048; changed = true; }
            TextureImporterPlatformSettings web = importer.GetPlatformTextureSettings("WebGL");
            if (!web.overridden || web.maxTextureSize != 1024)
            {
                web.overridden = true;
                web.maxTextureSize = 1024;
                importer.SetPlatformTextureSettings(web);
                changed = true;
            }
            if (changed)
            {
                importer.SaveAndReimport();
                Log("Import settings set on " + path + " (2D, no mips, wrap U repeat / V clamp, 2048, WebGL 1024)");
            }
            return LoadRequired<Texture2D>(path);
        }

        private static void EnsureSkyMaterial(string path, Texture2D hdri, float rotationDeg, float exposure)
        {
            Shader shader = Shader.Find("Skybox/Panoramic");
            if (shader == null) throw new InvalidOperationException("Shader Skybox/Panoramic not found");
            var material = AssetDatabase.LoadAssetAtPath<Material>(path);
            if (material == null)
            {
                material = new Material(shader) { name = Path.GetFileNameWithoutExtension(path) };
                AssetDatabase.CreateAsset(material, path);
                Log("Created " + path);
            }
            material.shader = shader;
            material.SetTexture("_MainTex", hdri);
            material.SetFloat("_Mapping", 1f);       // latitude-longitude layout
            material.SetFloat("_ImageType", 0f);     // 360°
            material.SetFloat("_MirrorOnBack", 0f);
            material.SetFloat("_Layout", 0f);
            material.DisableKeyword("_MAPPING_6_FRAMES_LAYOUT");
            material.SetColor("_Tint", new Color(0.5f, 0.5f, 0.5f, 0.5f)); // neutral
            material.SetFloat("_Rotation", rotationDeg);
            material.SetFloat("_Exposure", exposure);
            EditorUtility.SetDirty(material);
            Log(path + ": " + hdri.name + ", rotation " + rotationDeg.ToString("F2") + "°, exposure " + exposure);
        }

        /// <summary>
        /// Skybox/Panoramic draws world direction d with texture coordinates of R(−rotation)·d and
        /// u = 0.5 − atan2(z, x) / 2π (Unity's ToRadialCoords). Solving for the rotation that puts image column u
        /// at the world azimuth of <paramref name="toSun"/> gives rotation = φ_world − 360·(0.5 − u).
        /// </summary>
        private static float PanoramicRotationFor(float u, Vector3 toSun)
        {
            float worldAzimuth = Mathf.Atan2(toSun.z, toSun.x) * Mathf.Rad2Deg;
            return Mathf.Repeat(worldAzimuth - 360f * (0.5f - u), 360f);
        }

        /// <summary>World direction of image column u at the given elevation, for a Panoramic skybox at rotationDeg.</summary>
        private static Vector3 DirFromPanoramic(float u, float elevationDeg, float rotationDeg)
        {
            float azimuth = (360f * (0.5f - u) + rotationDeg) * Mathf.Deg2Rad;
            float elevation = elevationDeg * Mathf.Deg2Rad;
            return new Vector3(Mathf.Cos(elevation) * Mathf.Cos(azimuth), Mathf.Sin(elevation),
                Mathf.Cos(elevation) * Mathf.Sin(azimuth)).normalized;
        }
    }
}
