using System;
using System.Linq;
using UnityEditor;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.Rendering.Universal;
using Object = UnityEngine.Object;

namespace MissionForge.Editor.DesignSystem
{
    /// <summary>
    /// Quality tiers, URP assets and renderer features. URP asset fields are internal, so they are edited through
    /// SerializedObject with the field names of <c>Assets/Settings/*_RPAsset.asset</c> (URP 17.6, asset version 13).
    /// </summary>
    public static partial class LightingFoundation
    {
        public const string PcAssetPath = SettingsDir + "/PC_RPAsset.asset";
        public const string WebAssetPath = SettingsDir + "/Mobile_RPAsset.asset"; // shared by the Web and Mobile tiers
        public const string PcRendererPath = SettingsDir + "/PC_Renderer.asset";
        public const string WebRendererPath = SettingsDir + "/Mobile_Renderer.asset";

        /// <summary>T031 step 5 blur feature, written by another task; added by reflection and skipped if absent.</summary>
        public const string BlurFeatureTypeName = "MissionForge.Rendering.MfBlurredSceneFeature, MissionForge.Rendering";

        public const string WebTier = "Web";
        public const string PcTier = "PC";
        public const string MobileTier = "Mobile";

        private const string QualitySettingsPath = "ProjectSettings/QualitySettings.asset";

        // SSAO (VISUAL_TARGET 2.5: intensity 0.5–0.8, radius 0.5 m close-up to 1.5 m wide). SSAO is a renderer
        // feature: without the MODERN_SSAO define a volume cannot override it, so one default serves every scene.
        private const float SsaoIntensity = 0.6f;       // game_value
        private const float SsaoRadiusM = 1.0f;         // game_value, metres (world units)
        private const float SsaoDirectLighting = 0.25f; // URP default, how much AO also darkens direct light
        // Fade-out distance. The Build Bay vantage sits about 190 m from the vehicle, so the URP default of 100 m
        // would remove AO from the hero entirely. game_value.
        private const float SsaoFalloffM = 500f;

        // Fields copied from the Web tier into the new Mobile tier (QualitySettings.asset, serializedVersion 5).
        private static readonly string[] TierScalarFields =
        {
            "pixelLightCount", "shadows", "shadowResolution", "shadowProjection", "shadowCascades", "shadowDistance",
            "shadowNearPlaneOffset", "shadowCascade2Split", "shadowmaskMode", "skinWeights", "globalTextureMipmapLimit",
            "anisotropicTextures", "antiAliasing", "softParticles", "softVegetation", "realtimeReflectionProbes",
            "billboardsFaceCameraPosition", "useLegacyDetailDistribution", "adaptiveVsync", "vSyncCount",
            "realtimeGICPUUsage", "adaptiveVsyncExtraA", "adaptiveVsyncExtraB", "lodBias", "meshLodThreshold",
            "maximumLODLevel", "enableLODCrossFade", "streamingMipmapsActive", "streamingMipmapsAddAllCameras",
            "streamingMipmapsMemoryBudget", "streamingMipmapsRenderersPerFrame", "streamingMipmapsMaxLevelReduction",
            "streamingMipmapsMaxFileIORequests", "particleRaycastBudget", "asyncUploadTimeSlice",
            "asyncUploadBufferSize", "asyncUploadPersistentBuffer", "resolutionScalingFixedDPIFactor",
            "terrainQualityOverrides", "terrainPixelError", "terrainDetailDensityScale", "terrainBasemapDistance",
            "terrainDetailDistance", "terrainTreeDistance", "terrainBillboardStart", "terrainFadeLength", "terrainMaxTrees",
        };

        [MenuItem(MenuRoot + "1. Configure Pipelines", priority = 111)]
        public static void ConfigurePipelines()
        {
            var pc = LoadRequired<UniversalRenderPipelineAsset>(PcAssetPath);
            var web = LoadRequired<UniversalRenderPipelineAsset>(WebAssetPath);
            TuneAsset(pc, desktop: true);
            TuneAsset(web, desktop: false);

            var pcRenderer = LoadRequired<ScriptableRendererData>(PcRendererPath);
            var webRenderer = LoadRequired<ScriptableRendererData>(WebRendererPath);
            ConfigureSsao(pcRenderer, desktop: true);
            ConfigureSsao(webRenderer, desktop: false);
            EnsureBlurFeature(pcRenderer);
            EnsureBlurFeature(webRenderer);

            ConfigureQualityTiers(pc, web);
            AssetDatabase.SaveAssets();
            for (int i = 0; i < QualitySettings.names.Length; i++)
            {
                RenderPipelineAsset rp = QualitySettings.GetRenderPipelineAssetAt(i);
                Log("Quality tier " + i + " '" + QualitySettings.names[i] + "' -> " + (rp != null ? rp.name : "None"));
            }
            Log("Pipelines configured.");
        }

        /// <summary>
        /// Desktop (PC_RPAsset): HDR, MSAA 4x, 4 cascades at 4096. Web (Mobile_RPAsset, also the Mobile tier): HDR,
        /// MSAA 4x, 2 cascades at 2048, depth texture for SSAO. Both: SRP Batcher, soft shadows, HDR grading (the
        /// ACES workflow the MF_Volume_Global grading values assume). No TAA anywhere (it is per camera, and the
        /// Shell camera keeps AntialiasingMode.None).
        /// </summary>
        private static void TuneAsset(UniversalRenderPipelineAsset asset, bool desktop)
        {
            var so = new SerializedObject(asset);
            string n = asset.name + ".";
            SetBool(Find(so, "m_SupportsHDR"), true, n + "m_SupportsHDR");
            SetInt(Find(so, "m_MSAA"), 4, n + "m_MSAA");
            SetFloat(Find(so, "m_RenderScale"), 1f, n + "m_RenderScale");
            SetBool(Find(so, "m_UseSRPBatcher"), true, n + "m_UseSRPBatcher");
            SetBool(Find(so, "m_MainLightShadowsSupported"), true, n + "m_MainLightShadowsSupported");
            SetInt(Find(so, "m_MainLightShadowmapResolution"), desktop ? 4096 : 2048, n + "m_MainLightShadowmapResolution");
            SetInt(Find(so, "m_ShadowCascadeCount"), desktop ? 4 : 2, n + "m_ShadowCascadeCount");
            SetBool(Find(so, "m_SoftShadowsSupported"), true, n + "m_SoftShadowsSupported");
            // Shadow distance stays 0 (no shadows) as PC_RPAsset ships: space screens need none, and BayEnvironment
            // raises it to 320 m on the active asset while the Build Bay is loaded and restores it on exit.
            SetFloat(Find(so, "m_ShadowDistance"), 0f, n + "m_ShadowDistance");
            SetInt(Find(so, "m_ColorGradingMode"), (int)ColorGradingMode.HighDynamicRange, n + "m_ColorGradingMode");
            if (!desktop) SetBool(Find(so, "m_RequireDepthTexture"), true, n + "m_RequireDepthTexture");
            so.ApplyModifiedPropertiesWithoutUndo();
            EditorUtility.SetDirty(asset);
        }

        private static void ConfigureSsao(ScriptableRendererData data, bool desktop)
        {
            ScriptableRendererFeature ssao = data.rendererFeatures.FirstOrDefault(f => f is ScreenSpaceAmbientOcclusion);
            if (ssao == null) ssao = AddRendererFeature(data, typeof(ScreenSpaceAmbientOcclusion), "ScreenSpaceAmbientOcclusion");

            var so = new SerializedObject(ssao);
            string n = data.name + ".SSAO.";
            SetFloat(Find(so, "m_Settings.Intensity"), SsaoIntensity, n + "Intensity");
            SetFloat(Find(so, "m_Settings.Radius"), SsaoRadiusM, n + "Radius");
            SetFloat(Find(so, "m_Settings.DirectLightingStrength"), SsaoDirectLighting, n + "DirectLightingStrength");
            SetFloat(Find(so, "m_Settings.Falloff"), SsaoFalloffM, n + "Falloff");
            SetInt(Find(so, "m_Settings.AOMethod"), 0, n + "AOMethod (BlueNoise)");
            SetBool(Find(so, "m_Settings.AfterOpaque"), false, n + "AfterOpaque");
            // Desktop: full resolution, depth-normals prepass, 8 samples, bilateral blur (the existing PC setup).
            // Web/Mobile: half resolution, normals reconstructed from depth, 8 samples, Gaussian blur.
            SetBool(Find(so, "m_Settings.Downsample"), !desktop, n + "Downsample");
            SetInt(Find(so, "m_Settings.Source"), desktop ? 1 : 0, n + "Source (0 Depth, 1 DepthNormals)");
            SetInt(Find(so, "m_Settings.NormalSamples"), 1, n + "NormalSamples (Medium)");
            SetInt(Find(so, "m_Settings.Samples"), 1, n + "Samples (Medium)");
            SetInt(Find(so, "m_Settings.BlurQuality"), desktop ? 0 : 1, n + "BlurQuality (0 High, 1 Medium)");
            so.ApplyModifiedPropertiesWithoutUndo();
            if (!ssao.isActive)
            {
                ssao.SetActive(true);
                Log(n + "activated");
            }
            EditorUtility.SetDirty(ssao);
            data.SetDirty();
            EditorUtility.SetDirty(data);
        }

        private static void EnsureBlurFeature(ScriptableRendererData data)
        {
            Type type = Type.GetType(BlurFeatureTypeName);
            if (type == null || !typeof(ScriptableRendererFeature).IsAssignableFrom(type))
            {
                Warn("Blur feature type '" + BlurFeatureTypeName + "' not found; skipped on " + data.name +
                     ". Re-run Configure Pipelines once MfBlurredSceneFeature compiles.");
                return;
            }
            if (data.rendererFeatures.Any(f => f != null && f.GetType() == type))
            {
                Log(data.name + " already has " + type.Name);
                return;
            }
            AddRendererFeature(data, type, type.Name);
        }

        /// <summary>Mirrors ScriptableRendererDataEditor.AddComponent: sub-asset, feature list and local-id map.</summary>
        private static ScriptableRendererFeature AddRendererFeature(ScriptableRendererData data, Type type, string name)
        {
            var feature = (ScriptableRendererFeature)ScriptableObject.CreateInstance(type);
            feature.name = name;
            feature.hideFlags |= HideFlags.HideInHierarchy;
            AssetDatabase.AddObjectToAsset(feature, data);
            AssetDatabase.TryGetGUIDAndLocalFileIdentifier(feature, out string _, out long localId);

            var so = new SerializedObject(data);
            SerializedProperty list = Find(so, "m_RendererFeatures");
            SerializedProperty map = Find(so, "m_RendererFeatureMap");
            list.arraySize++;
            list.GetArrayElementAtIndex(list.arraySize - 1).objectReferenceValue = feature;
            map.arraySize++;
            map.GetArrayElementAtIndex(map.arraySize - 1).longValue = localId;
            so.ApplyModifiedPropertiesWithoutUndo();

            data.SetDirty();
            EditorUtility.SetDirty(data);
            AssetDatabase.SaveAssetIfDirty(data);
            Log(data.name + ": added renderer feature " + name + " (local id " + localId + ")");
            return feature;
        }

        /// <summary>
        /// Tier 0 "Mobile" becomes "Web" (WebGL default, Mobile_RPAsset); "PC" stays (Standalone default,
        /// PC_RPAsset); a new tier 2 "Mobile" (Android and iPhone default, Mobile_RPAsset) is appended. Realtime
        /// reflection probes are allowed on every tier because the rig probes fall back to Realtime/OnAwake when a
        /// bake is not possible.
        /// </summary>
        private static void ConfigureQualityTiers(Object pcAsset, Object webAsset)
        {
            Object qualityObject = AssetDatabase.LoadAllAssetsAtPath(QualitySettingsPath).FirstOrDefault();
            if (qualityObject == null) throw new InvalidOperationException("Cannot load " + QualitySettingsPath);
            var so = new SerializedObject(qualityObject);
            SerializedProperty levels = Find(so, "m_QualitySettings");

            if (FindTier(levels, WebTier) < 0)
            {
                if (levels.arraySize == 0) throw new InvalidOperationException("No quality tiers in " + QualitySettingsPath);
                SetString(levels.GetArrayElementAtIndex(0).FindPropertyRelative("name"), WebTier, "Quality tier 0 name");
            }
            int web = FindTier(levels, WebTier);
            int pc = FindTier(levels, PcTier);
            if (pc < 0) throw new InvalidOperationException("Quality tier 'PC' not found in " + QualitySettingsPath);

            int mobile = FindTier(levels, MobileTier);
            if (mobile < 0)
            {
                levels.arraySize++;
                mobile = levels.arraySize - 1;
                CopyTierScalars(levels.GetArrayElementAtIndex(web), levels.GetArrayElementAtIndex(mobile));
                SetString(levels.GetArrayElementAtIndex(mobile).FindPropertyRelative("name"), MobileTier,
                    "Quality tier " + mobile + " name (new tier, copied from Web)");
            }

            ConfigureTier(levels.GetArrayElementAtIndex(web), webAsset, new[] { "Standalone", "Android", "iPhone" });
            ConfigureTier(levels.GetArrayElementAtIndex(pc), pcAsset, null);
            ConfigureTier(levels.GetArrayElementAtIndex(mobile), webAsset, new[] { "Standalone", "WebGL" });

            SerializedProperty defaults = Find(so, "m_PerPlatformDefaultQuality");
            SetPlatformDefault(defaults, "WebGL", web);
            SetPlatformDefault(defaults, "Standalone", pc);
            SetPlatformDefault(defaults, "Android", mobile);
            SetPlatformDefault(defaults, "iPhone", mobile);

            so.ApplyModifiedPropertiesWithoutUndo();
            EditorUtility.SetDirty(qualityObject);
        }

        private static int FindTier(SerializedProperty levels, string name)
        {
            for (int i = 0; i < levels.arraySize; i++)
            {
                if (levels.GetArrayElementAtIndex(i).FindPropertyRelative("name").stringValue == name) return i;
            }
            return -1;
        }

        private static void ConfigureTier(SerializedProperty tier, Object pipeline, string[] excludedPlatforms)
        {
            string n = "Quality '" + tier.FindPropertyRelative("name").stringValue + "'.";
            SetObject(tier.FindPropertyRelative("customRenderPipeline"), pipeline, n + "customRenderPipeline");
            SetBool(tier.FindPropertyRelative("realtimeReflectionProbes"), true, n + "realtimeReflectionProbes");
            if (excludedPlatforms != null) SetStringArray(tier.FindPropertyRelative("excludedTargetPlatforms"), excludedPlatforms, n + "excludedTargetPlatforms");
        }

        private static void SetStringArray(SerializedProperty array, string[] values, string label)
        {
            bool same = array.arraySize == values.Length;
            for (int i = 0; same && i < values.Length; i++) same = array.GetArrayElementAtIndex(i).stringValue == values[i];
            if (same) return;
            string[] old = new string[array.arraySize];
            for (int i = 0; i < old.Length; i++) old[i] = array.GetArrayElementAtIndex(i).stringValue;
            array.arraySize = values.Length;
            for (int i = 0; i < values.Length; i++) array.GetArrayElementAtIndex(i).stringValue = values[i];
            Log(label + ": [" + string.Join(", ", old) + "] -> [" + string.Join(", ", values) + "]");
        }

        /// <summary>m_PerPlatformDefaultQuality is a serialized map: an array of pairs with "first" and "second".</summary>
        private static void SetPlatformDefault(SerializedProperty map, string platform, int tier)
        {
            for (int i = 0; i < map.arraySize; i++)
            {
                SerializedProperty pair = map.GetArrayElementAtIndex(i);
                SerializedProperty key = pair.FindPropertyRelative("first");
                SerializedProperty value = pair.FindPropertyRelative("second");
                if (key == null || value == null)
                {
                    throw new InvalidOperationException("m_PerPlatformDefaultQuality has no first/second pairs; set the " +
                                                        platform + " default to tier " + tier + " in Project Settings > Quality.");
                }
                if (key.stringValue != platform) continue;
                SetInt(value, tier, "Default quality tier for " + platform);
                return;
            }
            map.arraySize++;
            SerializedProperty added = map.GetArrayElementAtIndex(map.arraySize - 1);
            added.FindPropertyRelative("first").stringValue = platform;
            added.FindPropertyRelative("second").intValue = tier;
            Log("Default quality tier for " + platform + ": (none) -> " + tier);
        }

        private static void CopyTierScalars(SerializedProperty from, SerializedProperty to)
        {
            foreach (string field in TierScalarFields)
            {
                SerializedProperty src = from.FindPropertyRelative(field);
                SerializedProperty dst = to.FindPropertyRelative(field);
                if (src == null || dst == null || src.propertyType != dst.propertyType) continue;
                switch (src.propertyType)
                {
                    case SerializedPropertyType.Boolean: dst.boolValue = src.boolValue; break;
                    case SerializedPropertyType.Integer:
                    case SerializedPropertyType.Enum: dst.intValue = src.intValue; break;
                    case SerializedPropertyType.Float: dst.floatValue = src.floatValue; break;
                    case SerializedPropertyType.Vector3: dst.vector3Value = src.vector3Value; break;
                }
            }
        }
    }
}
