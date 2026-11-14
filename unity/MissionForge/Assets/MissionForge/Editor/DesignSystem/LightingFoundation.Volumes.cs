using UnityEditor;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.Rendering.Universal;

namespace MissionForge.Editor.DesignSystem
{
    /// <summary>
    /// Volume profiles in Art/Lighting. MF_Volume_Global is the base look (rig volume priority 1); Dusk, Orbit and
    /// Interior are partial overrides (rig volume priority 2); CloseUp is for close-up and part-inspection cameras
    /// (priority 3, weight driven by camera code). Only the parameters set here carry an override flag, so each
    /// override profile changes nothing else. Every value is a game_value art target (VISUAL_TARGET 2.5).
    /// MF_Volume_Global overrides every parameter that the Shell's SpaceVolumeProfile (priority 0, always loaded)
    /// sets, so rigged scenes do not inherit the space look underneath.
    /// </summary>
    public static partial class LightingFoundation
    {
        public const string GlobalProfilePath = LightingDir + "/MF_Volume_Global.asset";
        public const string DuskProfilePath = LightingDir + "/MF_Volume_Dusk.asset";
        public const string OrbitProfilePath = LightingDir + "/MF_Volume_Orbit.asset";
        public const string InteriorProfilePath = LightingDir + "/MF_Volume_Interior.asset";
        public const string CloseUpProfilePath = LightingDir + "/MF_Volume_CloseUp.asset";

        /// <summary>Space navy #071522 (STYLE_GUIDE palette), sRGB.</summary>
        private static readonly Color SpaceNavy = new Color(7f / 255f, 21f / 255f, 34f / 255f, 1f);

        [MenuItem(MenuRoot + "2. Build Volumes", priority = 112)]
        public static void BuildVolumes()
        {
            EnsureFolder(LightingDir);
            BuildGlobal(LoadOrCreateProfile(GlobalProfilePath));
            BuildDusk(LoadOrCreateProfile(DuskProfilePath));
            BuildOrbit(LoadOrCreateProfile(OrbitProfilePath));
            BuildInterior(LoadOrCreateProfile(InteriorProfilePath));
            BuildCloseUp(LoadOrCreateProfile(CloseUpProfilePath));
            AssetDatabase.SaveAssets();
            Log("Volume profiles built.");
        }

        private static void BuildGlobal(VolumeProfile p)
        {
            string n = p.name + ".";
            Set(GetOrAdd<Tonemapping>(p).mode, TonemappingMode.ACES, n + "Tonemapping.mode");

            var bloom = GetOrAdd<Bloom>(p);
            // URP converts the threshold with GammaToLinearSpace, so store LinearToGamma(1.1) for 1.1 linear: only
            // the sun, flames, plasma and HDR practicals pass it.
            Set(bloom.threshold, Mathf.LinearToGammaSpace(1.1f), n + "Bloom.threshold (1.1 linear)");
            Set(bloom.intensity, 0.28f, n + "Bloom.intensity");               // VISUAL_TARGET 0.2–0.35
            Set(bloom.scatter, 0.6f, n + "Bloom.scatter");
            Set(bloom.highQualityFiltering, false, n + "Bloom.highQualityFiltering"); // WebGL cost; Space profile had it on

            var colour = GetOrAdd<ColorAdjustments>(p);
            Set(colour.postExposure, 0f, n + "ColorAdjustments.postExposure");
            Set(colour.contrast, 8f, n + "ColorAdjustments.contrast");         // VISUAL_TARGET "around +8"
            Set(colour.saturation, 4f, n + "ColorAdjustments.saturation");     // T015 bay value; overrides Space +8
            Set(colour.hueShift, 0f, n + "ColorAdjustments.hueShift");
            Set(colour.colorFilter, Color.white, n + "ColorAdjustments.colorFilter");

            // Navy shadows, warm highlights. URP does split toning in gamma space (soft light against 0.5 grey), so
            // these are sRGB-ish values close to grey; balance −10 widens the shadow range a little.
            var split = GetOrAdd<SplitToning>(p);
            Set(split.shadows, new Color(0.40f, 0.47f, 0.62f, 1f), n + "SplitToning.shadows (navy)");
            Set(split.highlights, new Color(0.62f, 0.55f, 0.44f, 1f), n + "SplitToning.highlights (warm)");
            Set(split.balance, -10f, n + "SplitToning.balance");

            // Shadow range gain with a cool tilt, so occluded forms stay readable and navy rather than grey-black.
            // w = +0.03 adds 0.12 to every channel's shadow multiplier (ColorUtils.PrepareShadowsMidtonesHighlights).
            // This is multiplicative: it cannot lift pure black, so the floor itself comes from Lift below.
            Set(GetOrAdd<ShadowsMidtonesHighlights>(p).shadows, new Vector4(0.90f, 0.95f, 1.0f, 0.03f),
                n + "ShadowsMidtonesHighlights.shadows");

            // Navy shadow floor >= sRGB 12 (never crushed). Lift is additive before the ACES tonemap
            // (HDR grading). w = 0.016 is the neutral offset that ACES maps to about sRGB 12; xyz tilts it towards
            // #071522 (luminance-neutral chroma, ColorUtils.PrepareLiftGammaGain). Verify with a pixel probe on a
            // fully occluded area in the beauty shot and tune w.
            Set(GetOrAdd<LiftGammaGain>(p).lift, new Vector4(0.897f, 0.939f, 1.0f, 0.016f), n + "LiftGammaGain.lift");

            var vignette = GetOrAdd<Vignette>(p);
            Set(vignette.intensity, 0.16f, n + "Vignette.intensity");          // VISUAL_TARGET <= 0.18
            Set(vignette.smoothness, 0.4f, n + "Vignette.smoothness");
            Set(vignette.color, SpaceNavy, n + "Vignette.color (#071522)");
            Set(vignette.rounded, false, n + "Vignette.rounded");

            // Explicitly off (VISUAL_TARGET 2.5), so no lower-priority profile can switch them on.
            Set(GetOrAdd<ChromaticAberration>(p).intensity, 0f, n + "ChromaticAberration.intensity");
            Set(GetOrAdd<MotionBlur>(p).intensity, 0f, n + "MotionBlur.intensity");
            Set(GetOrAdd<LensDistortion>(p).intensity, 0f, n + "LensDistortion.intensity");
            Set(GetOrAdd<FilmGrain>(p).intensity, 0f, n + "FilmGrain.intensity");
            Set(GetOrAdd<DepthOfField>(p).mode, DepthOfFieldMode.Off, n + "DepthOfField.mode");
            EditorUtility.SetDirty(p);
        }

        private static void BuildDusk(VolumeProfile p)
        {
            string n = p.name + ".";
            Set(GetOrAdd<WhiteBalance>(p).temperature, 12f, n + "WhiteBalance.temperature (warm dusk)");
            // T015 graded the bay +0.35 EV with a 2.4 key; the rig trims the key to 2.2 and adds +0.2 EV here, about
            // 0.3 EV less overall, so the sun side of the #E8EEF0 hull stays below clipping after the warm balance.
            Set(GetOrAdd<ColorAdjustments>(p).postExposure, 0.2f, n + "ColorAdjustments.postExposure");
            EditorUtility.SetDirty(p);
        }

        private static void BuildOrbit(VolumeProfile p)
        {
            string n = p.name + ".";
            Set(GetOrAdd<WhiteBalance>(p).temperature, -4f, n + "WhiteBalance.temperature (cool orbit)");
            Set(GetOrAdd<ColorAdjustments>(p).contrast, 12f, n + "ColorAdjustments.contrast (global +8, slightly higher)");
            EditorUtility.SetDirty(p);
        }

        private static void BuildInterior(VolumeProfile p)
        {
            string n = p.name + ".";
            Set(GetOrAdd<Bloom>(p).intensity, 0.18f, n + "Bloom.intensity (lower indoors)");
            var balance = GetOrAdd<WhiteBalance>(p);
            Set(balance.temperature, 0f, n + "WhiteBalance.temperature (neutral)");
            Set(balance.tint, 0f, n + "WhiteBalance.tint");
            EditorUtility.SetDirty(p);
        }

        /// <summary>
        /// Bokeh is the VISUAL_TARGET first choice. It has not been measured on WebGL yet: if it costs more than 2 ms
        /// at 1080p, switch mode to Gaussian (gaussianStart about focus − 2 m, gaussianEnd about focus + 15 m).
        /// focusDistance is a default subject distance for part inspection; camera code should drive it.
        /// </summary>
        private static void BuildCloseUp(VolumeProfile p)
        {
            string n = p.name + ".";
            var dof = GetOrAdd<DepthOfField>(p);
            Set(dof.mode, DepthOfFieldMode.Bokeh, n + "DepthOfField.mode");
            Set(dof.focusDistance, 8f, n + "DepthOfField.focusDistance (m)");
            Set(dof.aperture, 5f, n + "DepthOfField.aperture (f/5)");                // f/4–5.6
            Set(dof.focalLength, 50f, n + "DepthOfField.focalLength (mm)");          // 35–50 mm house lens
            Set(dof.bladeCount, 6, n + "DepthOfField.bladeCount");
            Set(dof.bladeCurvature, 1f, n + "DepthOfField.bladeCurvature");
            Set(dof.bladeRotation, 0f, n + "DepthOfField.bladeRotation");
            EditorUtility.SetDirty(p);
        }

        private static VolumeProfile LoadOrCreateProfile(string path)
        {
            var profile = AssetDatabase.LoadAssetAtPath<VolumeProfile>(path);
            if (profile != null) return profile;
            profile = ScriptableObject.CreateInstance<VolumeProfile>();
            AssetDatabase.CreateAsset(profile, path);
            Log("Created " + path);
            return profile;
        }

        /// <summary>Returns the profile's component of type T, adding it as a sub-asset with no overrides if missing.</summary>
        private static T GetOrAdd<T>(VolumeProfile profile) where T : VolumeComponent
        {
            if (profile.TryGet(out T component)) return component;
            component = profile.Add<T>(false);
            component.name = typeof(T).Name;
            component.hideFlags = HideFlags.HideInInspector | HideFlags.HideInHierarchy;
            AssetDatabase.AddObjectToAsset(component, profile);
            Log(profile.name + ": added " + typeof(T).Name);
            return component;
        }

        private static void Set<TValue>(VolumeParameter<TValue> parameter, TValue value, string label)
        {
            if (parameter.overrideState && Equals(parameter.value, value)) return;
            Log(label + ": " + (parameter.overrideState ? parameter.value + "" : "(not overridden)") + " -> " + value);
            parameter.Override(value);
        }
    }
}
