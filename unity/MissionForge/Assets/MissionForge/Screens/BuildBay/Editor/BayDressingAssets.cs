using System.IO;
using UnityEditor;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.Rendering.Universal;

namespace MissionForge.Screens.BuildBay.Editor
{
    /// <summary>
    /// T034 environment materials: URP Lit sets from the ambientCG textures prepared by
    /// <c>Art/Environment/LaunchPad/Source/prepare_textures.py</c> (CC0, recorded in THIRD_PARTY.md) plus the particle
    /// materials for floodlight cones, steam, glows and soot. UVs on the dressing meshes are metric (1 UV = 1 m), so
    /// each set's tiling is 1 / (tile size in m). Tints, tiling and smoothness are game_value art direction.
    /// </summary>
    public static class BayDressingAssets
    {
        public const string TexturesDir = LaunchPadAssets.Root + "/Textures";
        public const string MeshesDir = LaunchPadAssets.Root + "/Meshes";

        private static readonly (string set, float tileM, string tint, float smoothness, float normal)[] Ground =
        {
            ("Concrete034", 7f, "#C9C4BC", 0.55f, 0.8f),   // apron: light poured concrete with stains
            ("Concrete031", 5f, "#8F8A84", 0.45f, 1.0f),   // trench walls, mount plinths
            ("Gravel022", 3.5f, "#9A948A", 0.7f, 1.0f),    // gravel verge around the apron
            ("Ground037", 14f, "#8D8A6E", 0.7f, 0.9f),     // coastal scrub, desaturated to sit in the dusk palette
            ("Ground054", 10f, "#C9B79A", 0.75f, 0.8f),    // beach sand
        };

        public static string MaterialPath(string name) => LaunchPadAssets.MaterialsDir + "/" + name + ".mat";

        public static Material Load(string name) => AssetDatabase.LoadAssetAtPath<Material>(MaterialPath(name));

        public const string BayVolumePath = LaunchPadAssets.Root + "/MF_Volume_BayFrame.asset";

        /// <summary>
        /// Bay framing override on top of T031's MF_Volume_Global + MF_Volume_Dusk (it does not fork them): the T034 camera
        /// looks up into more of the upper sky, where the dusk grade drove the red channel to 0, so saturation is
        /// eased (−8) and the navy edge vignette is raised to the VISUAL_TARGET ceiling (0.18, colour #071522) to frame
        /// the vehicle like frame 02. game_value art direction.
        /// </summary>
        public static VolumeProfile EnsureBayVolume()
        {
            var profile = AssetDatabase.LoadAssetAtPath<VolumeProfile>(BayVolumePath);
            if (profile == null)
            {
                profile = ScriptableObject.CreateInstance<VolumeProfile>();
                AssetDatabase.CreateAsset(profile, BayVolumePath);
            }
            if (!profile.TryGet(out ColorAdjustments colour))
            {
                colour = profile.Add<ColorAdjustments>(false);
                AssetDatabase.AddObjectToAsset(colour, profile);
            }
            colour.saturation.Override(-8f);
            if (!profile.TryGet(out Vignette vignette))
            {
                vignette = profile.Add<Vignette>(false);
                AssetDatabase.AddObjectToAsset(vignette, profile);
            }
            vignette.intensity.Override(0.18f);
            vignette.smoothness.Override(0.5f);
            vignette.color.Override(new Color(7f / 255f, 21f / 255f, 34f / 255f));
            EditorUtility.SetDirty(profile);
            AssetDatabase.SaveAssets();
            return profile;
        }

        public static void EnsureAll()
        {
            Directory.CreateDirectory(MeshesDir);
            ConfigureTextures();
            foreach (var g in Ground) GroundMaterial(g.set, g.tileM, g.tint, g.smoothness, g.normal);
            OceanMaterial();
            Particle("LP_flood_cone", null, new Color(1f, 0.82f, 0.58f, 1f), additive: true, cullOff: true);
            Particle("LP_glow", Tex("Soft_puff.png"), new Color(2.6f, 1.9f, 1.2f, 1f), additive: true, cullOff: true);
            Particle("LP_steam", Tex("Soft_puff.png"), new Color(0.92f, 0.93f, 0.96f, 1f), additive: false, cullOff: false);
            Particle("LP_soot", Tex("Soft_puff.png"), new Color(0.04f, 0.035f, 0.03f, 0.75f), additive: false, cullOff: false);
            LitColour("LP_paint", "#D9D4C8", 0.35f);
            LitColour("LP_foliage", "#2E3A2C", 0.2f);
            AssetDatabase.SaveAssets();
        }

        private static Texture2D Tex(string file) => AssetDatabase.LoadAssetAtPath<Texture2D>(TexturesDir + "/" + file);

        private static void ConfigureTextures()
        {
            foreach (string guid in AssetDatabase.FindAssets("t:Texture2D", new[] { TexturesDir }))
            {
                string path = AssetDatabase.GUIDToAssetPath(guid);
                var imp = (TextureImporter)AssetImporter.GetAtPath(path);
                string file = Path.GetFileNameWithoutExtension(path);
                bool normal = file.EndsWith("_normal");
                bool mask = file.EndsWith("_mask");
                bool changed = false;
                void Set<T>(T current, T wanted, System.Action<T> apply)
                {
                    if (Equals(current, wanted)) return;
                    apply(wanted);
                    changed = true;
                }
                Set(imp.textureType, normal ? TextureImporterType.NormalMap : TextureImporterType.Default, v => imp.textureType = v);
                Set(imp.sRGBTexture, !normal && !mask, v => imp.sRGBTexture = v);
                Set(imp.wrapMode, TextureWrapMode.Repeat, v => imp.wrapMode = v);
                Set(imp.maxTextureSize, 1024, v => imp.maxTextureSize = v);
                Set(imp.alphaIsTransparency, file == "Soft_puff", v => imp.alphaIsTransparency = v);
                Set(imp.anisoLevel, 8, v => imp.anisoLevel = v);
                TextureImporterPlatformSettings web = imp.GetPlatformTextureSettings("WebGL");
                if (!web.overridden || web.maxTextureSize != 1024)
                {
                    web.overridden = true;
                    web.maxTextureSize = 1024;
                    imp.SetPlatformTextureSettings(web);
                    changed = true;
                }
                if (changed) imp.SaveAndReimport();
            }
        }

        private static Material LoadOrCreate(string name, Shader shader)
        {
            string path = MaterialPath(name);
            var m = AssetDatabase.LoadAssetAtPath<Material>(path);
            if (m == null)
            {
                m = new Material(shader);
                AssetDatabase.CreateAsset(m, path);
            }
            if (m.shader != shader) m.shader = shader;
            return m;
        }

        private static void GroundMaterial(string set, float tileM, string tint, float smoothness, float normalScale)
        {
            Material m = LoadOrCreate("LP_" + set, Shader.Find("Universal Render Pipeline/Lit"));
            ColorUtility.TryParseHtmlString(tint, out Color c);
            m.SetColor("_BaseColor", c);
            m.SetTexture("_BaseMap", Tex(set + "_albedo.jpg"));
            m.SetTexture("_BumpMap", Tex(set + "_normal.png"));
            m.SetFloat("_BumpScale", normalScale);
            m.EnableKeyword("_NORMALMAP");
            Texture2D mask = Tex(set + "_mask.png");
            m.SetTexture("_MetallicGlossMap", mask);
            m.EnableKeyword("_METALLICSPECGLOSSMAP");
            m.SetFloat("_Smoothness", smoothness);       // multiplies the map's smoothness (A)
            m.SetFloat("_GlossMapScale", smoothness);
            m.SetFloat("_SmoothnessTextureChannel", 0f);
            m.SetTexture("_OcclusionMap", mask);         // URP reads occlusion from G
            m.SetFloat("_OcclusionStrength", 1f);
            m.EnableKeyword("_OCCLUSIONMAP");
            m.SetTextureScale("_BaseMap", Vector2.one / tileM);
            m.SetFloat("_EnvironmentReflections", 1f);
            EditorUtility.SetDirty(m);
        }

        private static void OceanMaterial()
        {
            Material m = LoadOrCreate("LP_ocean", Shader.Find("Universal Render Pipeline/Lit"));
            m.SetColor("_BaseColor", new Color(0.035f, 0.075f, 0.105f, 1f));   // deep navy-teal water
            m.SetTexture("_BaseMap", null);
            m.SetTexture("_BumpMap", Tex("Ocean_normal.png"));
            m.SetFloat("_BumpScale", 0.35f);
            m.EnableKeyword("_NORMALMAP");
            m.SetTexture("_MetallicGlossMap", null);
            m.DisableKeyword("_METALLICSPECGLOSSMAP");
            m.SetFloat("_Metallic", 0f);
            m.SetFloat("_Smoothness", 0.9f);
            m.SetTextureScale("_BaseMap", Vector2.one / 46f);
            m.SetFloat("_EnvironmentReflections", 1f);
            m.SetFloat("_SpecularHighlights", 1f);
            EditorUtility.SetDirty(m);
        }

        private static void LitColour(string name, string hex, float smoothness)
        {
            Material m = LoadOrCreate(name, Shader.Find("Universal Render Pipeline/Lit"));
            ColorUtility.TryParseHtmlString(hex, out Color c);
            m.SetColor("_BaseColor", c);
            m.SetFloat("_Metallic", 0f);
            m.SetFloat("_Smoothness", smoothness);
            EditorUtility.SetDirty(m);
        }

        /// <summary>URP Particles/Unlit, transparent; multiplies vertex colour (cones fade by vertex alpha).</summary>
        private static void Particle(string name, Texture2D tex, Color colour, bool additive, bool cullOff)
        {
            Material m = LoadOrCreate(name, Shader.Find("Universal Render Pipeline/Particles/Unlit"));
            m.SetFloat("_Surface", 1f);
            m.SetFloat("_Blend", additive ? 2f : 0f);
            m.SetFloat("_SrcBlend", (float)BlendMode.SrcAlpha);
            m.SetFloat("_DstBlend", (float)(additive ? BlendMode.One : BlendMode.OneMinusSrcAlpha));
            m.SetFloat("_ZWrite", 0f);
            m.SetFloat("_Cull", cullOff ? 0f : 2f);
            m.SetFloat("_ColorMode", 0f);
            m.EnableKeyword("_SURFACE_TYPE_TRANSPARENT");
            m.renderQueue = (int)RenderQueue.Transparent;
            m.SetTexture("_BaseMap", tex);
            m.SetColor("_BaseColor", colour);
            EditorUtility.SetDirty(m);
        }
    }
}
