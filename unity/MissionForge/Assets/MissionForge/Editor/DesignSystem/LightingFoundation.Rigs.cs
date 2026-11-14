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
        public const string ProbeName = "Reflection Probe";
        public const string GlobalVolumeName = "Volume Global";
        public const string OverrideVolumeName = "Volume Override";

        // Poly Haven CC0 HDRIs, 2K .hdr (slugs and URLs in Art/Lighting/README.md). The sun or key position in each
        // equirect was measured from the downloaded file (brightest pixel): u from the left edge, elevation in degrees.
        public const string DuskHdriPath = HdriDir + "/kloppenheim_06_puresky_2k.hdr";
        public const string InteriorHdriPath = HdriDir + "/empty_warehouse_01_2k.hdr";
        private const float DuskHdriSunU = 0.6130f;
        private const float DuskHdriSunElevationDeg = 4.66f;
        private const float InteriorHdriKeyU = 0.5984f;
        private const float InteriorHdriKeyElevationDeg = 51.42f;

        /// <summary>
        /// Direction to the dusk sun: BayEnvironmentBuilder.ToSun (T015), 7° above the horizon, right of and behind
        /// the vehicle. It must match the visible sun of the Build Bay sky dome (LP_dusk_sky _SunDir), so the key
        /// uses it and the HDRI is rotated to the same azimuth (its own sun sits 2.3° lower, at 4.7°).
        /// </summary>
        private static readonly Vector3 DuskToSun = new Vector3(0.70f, 0.122f, 0.70f).normalized;

        /// <summary>Fill travel direction from T015's DuskFill, kept so the bay keeps its lighting intent.</summary>
        private static readonly Vector3 DuskFillTravel = new Vector3(0.45f, -0.35f, 0.82f).normalized;

        /// <summary>Direction to the orbit sun: ProjectSetup.ToSun, the Shell Sun that EarthSystem feeds to the Earth shaders.</summary>
        private static readonly Vector3 OrbitToSun = new Vector3(0.90f, 0.22f, 0.38f).normalized;

        /// <summary>Earth fill travels up from the planet below, from the side opposite the sun. game_value.</summary>
        private static readonly Vector3 EarthFillTravel = new Vector3(0.45f, 0.85f, 0.25f).normalized;

        /// <summary>Interior fill: cool screen bounce from the front and slightly above. game_value.</summary>
        private static readonly Vector3 InteriorFillTravel = new Vector3(-0.35f, -0.30f, 0.89f).normalized;

        private const float DuskSkyExposure = 0.4f;     // ambient sky about (0.20, 0.24, 0.30), as T015's trilight sky
        private const float InteriorSkyExposure = 0.7f; // ambient about 0.45 under a 1.4 key
        private const int ProbeResolution = 256;        // VISUAL_TARGET: 256 px on WebGL

        private sealed class LightSpec
        {
            public float Kelvin;
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
            public ProbeSpec Probe;
            public string OverrideProfilePath;
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
            Vector3 interiorToKey = DirFromPanoramic(InteriorHdriKeyU, InteriorHdriKeyElevationDeg, 0f);

            BuildRig(new RigSpec
            {
                Path = DuskRigPath,
                OverrideProfilePath = DuskProfilePath,
                // T015 used 2.4 / 0.6; trimmed with +0.2 EV in MF_Volume_Dusk (see BuildDusk). Fill = 1/4 of key.
                Key = new LightSpec { Kelvin = 4500f, Intensity = 2.2f, Travel = -DuskToSun, Shadows = true, ShadowStrength = 0.85f },
                Fill = new LightSpec { Kelvin = 8000f, Intensity = 0.55f, Travel = DuskFillTravel, Shadows = false },
                // Pad origin; captured at mid-stack height. Bounds cover deck, tower and a 110 m stack (outdoors:
                // no box projection). Far clip reaches the 2400 m sky dome.
                Probe = new ProbeSpec
                {
                    LocalPosition = new Vector3(0f, 30f, 0f), Size = new Vector3(420f, 260f, 420f),
                    Center = new Vector3(0f, 90f, 0f), BoxProjection = false, Near = 0.5f, Far = 3000f, BlendDistance = 10f,
                },
            });
            BuildRig(new RigSpec
            {
                Path = OrbitRigPath,
                OverrideProfilePath = OrbitProfilePath,
                Key = new LightSpec { Kelvin = 5800f, Intensity = 2.0f, Travel = -OrbitToSun, Shadows = true, ShadowStrength = 1f },
                Fill = new LightSpec { Kelvin = 8000f, Intensity = 0.25f, Travel = EarthFillTravel, Shadows = false },
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

        private static void ConfigureLight(GameObject go, LightSpec spec)
        {
            if (!go.TryGetComponent(out Light light)) light = go.AddComponent<Light>();
            light.type = LightType.Directional;
            light.useColorTemperature = true;
            light.colorTemperature = spec.Kelvin;
            light.color = Color.white;
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
