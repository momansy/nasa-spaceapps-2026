using System;
using System.Collections.Generic;
using System.IO;
using UnityEditor;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.Rendering.Universal;

namespace MissionForge.Screens.BuildBay.Editor
{
    /// <summary>
    /// Materials, import settings and the <c>MF_LaunchPad.prefab</c> for the launch pad pieces authored by
    /// <c>Art/Environment/LaunchPad/Source/build_launchpad.py</c>. Material values are STYLE_GUIDE.md recipes
    /// (artistic game_values: gantry Console navy, metallic 0.2, smoothness 0.38; concrete matte; practicals HDR).
    /// </summary>
    public static class LaunchPadAssets
    {
        public const string Root = "Assets/MissionForge/Art/Environment/LaunchPad";
        public const string ModelsDir = Root + "/Models";
        public const string MaterialsDir = Root + "/Materials";
        public const string PrefabPath = Root + "/MF_LaunchPad.prefab";
        public const string ProfilePath = Root + "/BayVolumeProfile.asset";

        private static readonly (string slot, string hex, float metallic, float smoothness, float emission)[] Recipes =
        {
            ("concrete", "#7A7872", 0f, 0.22f, 0f),
            ("concrete_dark", "#34363A", 0f, 0.14f, 0f),
            ("marking", "#C9A15A", 0f, 0.30f, 0f),
            ("steel", "#112B40", 0.2f, 0.38f, 0f),
            ("grating", "#1C2833", 0.3f, 0.32f, 0f),
            ("detail_dark", "#2A3036", 0.2f, 0.38f, 0f),
            ("lamp", "#FFE9C8", 0f, 0.6f, 8f),
            ("warning_red", "#E0332B", 0f, 0.5f, 3f),
            ("suit", "#E07A2E", 0f, 0.35f, 0f),
            ("skin", "#8D5B3E", 0f, 0.35f, 0f),
            ("cable", "#141618", 0.6f, 0.4f, 0f),
        };

        public static Material MaterialFor(string slot) =>
            slot == null ? null : AssetDatabase.LoadAssetAtPath<Material>(MaterialsDir + "/LP_" + slot + ".mat");

        public static string SlotFor(string materialName)
        {
            if (string.IsNullOrEmpty(materialName)) return null;
            string n = materialName.ToLowerInvariant();
            string best = null;
            foreach (var r in Recipes) if (n.StartsWith(r.slot, StringComparison.Ordinal) && (best == null || r.slot.Length > best.Length)) best = r.slot;
            if (best == null && n.StartsWith("ghost", StringComparison.Ordinal)) best = "ghost";
            return best;
        }

        [MenuItem("MissionForge/Build Bay/Rebuild Launch Pad Assets")]
        public static void RebuildAll()
        {
            EnsureMaterials();
            foreach (string guid in AssetDatabase.FindAssets("t:Model", new[] { ModelsDir }))
                AssetDatabase.ImportAsset(AssetDatabase.GUIDToAssetPath(guid), ImportAssetOptions.ForceUpdate);
            EnsureVolumeProfile();
            LaunchPadPrefabBuilder.Build();
        }

        public static void EnsureMaterials()
        {
            Directory.CreateDirectory(MaterialsDir);
            Shader lit = Shader.Find("Universal Render Pipeline/Lit");
            foreach (var r in Recipes)
            {
                Material m = LoadOrCreate(MaterialsDir + "/LP_" + r.slot + ".mat", lit);
                ColorUtility.TryParseHtmlString(r.hex, out Color c);
                m.SetColor("_BaseColor", c);
                m.SetFloat("_Metallic", r.metallic);
                m.SetFloat("_Smoothness", r.smoothness);
                if (r.emission > 0f)
                {
                    m.EnableKeyword("_EMISSION");
                    m.globalIlluminationFlags = MaterialGlobalIlluminationFlags.None;
                    m.SetColor("_EmissionColor", c.linear * r.emission);
                }
                EditorUtility.SetDirty(m);
            }
            Shader ghost = Shader.Find("MissionForge/Ghost");
            Material g = LoadOrCreate(MaterialsDir + "/LP_ghost.mat", ghost);
            g.SetColor("_Color", new Color(0.333f, 0.773f, 0.804f, 1f));
            g.SetFloat("_Fill", 0.10f);
            g.SetFloat("_Rim", 0.7f);
            EditorUtility.SetDirty(g);
            Material vehicleGhost = LoadOrCreate(MaterialsDir + "/LP_vehicle_ghost.mat", ghost);
            vehicleGhost.SetColor("_Color", new Color(0.333f, 0.773f, 0.804f, 1f));
            vehicleGhost.SetFloat("_Fill", 0.18f);
            vehicleGhost.SetFloat("_Rim", 0.9f);
            EditorUtility.SetDirty(vehicleGhost);
            // Weld sparks: built-in Particle System with the URP particle shader, additive, HDR so only they bloom.
            Material spark = LoadOrCreate(MaterialsDir + "/LP_spark.mat", Shader.Find("Universal Render Pipeline/Particles/Unlit"));
            spark.SetFloat("_Surface", 1f);
            spark.SetFloat("_Blend", 2f);
            spark.SetFloat("_SrcBlend", (float)BlendMode.SrcAlpha);
            spark.SetFloat("_DstBlend", (float)BlendMode.One);
            spark.SetFloat("_ZWrite", 0f);
            spark.EnableKeyword("_SURFACE_TYPE_TRANSPARENT");
            spark.renderQueue = (int)RenderQueue.Transparent;
            spark.SetColor("_BaseColor", new Color(4f, 2.4f, 0.9f, 1f));
            EditorUtility.SetDirty(spark);
            Material sky = LoadOrCreate(MaterialsDir + "/LP_dusk_sky.mat", Shader.Find("MissionForge/DuskSky"));
            EditorUtility.SetDirty(sky);
            AssetDatabase.SaveAssets();
        }

        private static Material LoadOrCreate(string path, Shader shader)
        {
            var m = AssetDatabase.LoadAssetAtPath<Material>(path);
            if (m == null)
            {
                m = new Material(shader);
                AssetDatabase.CreateAsset(m, path);
            }
            m.shader = shader;
            return m;
        }

        public static VolumeProfile EnsureVolumeProfile()
        {
            AssetDatabase.DeleteAsset(ProfilePath);
            var profile = ScriptableObject.CreateInstance<VolumeProfile>();
            AssetDatabase.CreateAsset(profile, ProfilePath);
            var tone = profile.Add<Tonemapping>(true);
            tone.mode.Override(TonemappingMode.ACES);              // filmic tone curve
            var bloom = profile.Add<Bloom>(true);
            bloom.threshold.Override(1.25f);                       // only HDR practicals (lamps, aviation lights) bloom
            bloom.intensity.Override(0.45f);
            bloom.scatter.Override(0.6f);
            var colour = profile.Add<ColorAdjustments>(true);
            colour.postExposure.Override(0.35f);
            colour.contrast.Override(6f);
            colour.saturation.Override(4f);
            var vignette = profile.Add<Vignette>(true);
            vignette.intensity.Override(0.12f);                    // no heavy vignette
            foreach (VolumeComponent c in profile.components) AssetDatabase.AddObjectToAsset(c, profile);
            EditorUtility.SetDirty(profile);
            AssetDatabase.SaveAssets();
            return profile;
        }
    }

    /// <summary>Import settings for the launch pad models: 1 unit = 1 m, axis conversion baked, slots › URP materials.</summary>
    public sealed class LaunchPadModelPostprocessor : AssetPostprocessor
    {
        private bool InPad => assetPath.StartsWith(LaunchPadAssets.ModelsDir + "/", StringComparison.Ordinal);

        private void OnPreprocessModel()
        {
            if (!InPad) return;
            var importer = (ModelImporter)assetImporter;
            importer.globalScale = 1f;
            importer.useFileScale = true;
            importer.bakeAxisConversion = true;
            importer.importCameras = false;
            importer.importLights = false;
            importer.importAnimation = false;
            importer.animationType = ModelImporterAnimationType.None;
            importer.importBlendShapes = false;
            importer.materialImportMode = ModelImporterMaterialImportMode.ImportViaMaterialDescription;
            importer.materialLocation = ModelImporterMaterialLocation.InPrefab;
            importer.importNormals = ModelImporterNormals.Calculate;
            importer.normalSmoothingAngle = 30f;
            importer.isReadable = false;
        }

        private void OnPostprocessModel(GameObject root)
        {
            if (!InPad) return;
            bool isSite = root.name.StartsWith("site_", StringComparison.Ordinal);
            foreach (Renderer renderer in root.GetComponentsInChildren<Renderer>(true))
            {
                Material[] materials = renderer.sharedMaterials;
                for (int i = 0; i < materials.Length; i++)
                {
                    string slot = LaunchPadAssets.SlotFor(materials[i] != null ? materials[i].name : null);
                    if (slot == null) continue;
                    context.DependsOnSourceAsset(LaunchPadAssets.MaterialsDir + "/LP_" + slot + ".mat");
                    Material m = LaunchPadAssets.MaterialFor(slot);
                    if (m != null) materials[i] = m;
                }
                renderer.sharedMaterials = materials;
                renderer.shadowCastingMode = isSite || root.name.StartsWith("ref_", StringComparison.Ordinal)
                    ? ShadowCastingMode.Off : ShadowCastingMode.On;
            }
        }
    }
}
