using System;
using System.Collections.Generic;
using System.IO;
using UnityEditor;
using UnityEngine;

namespace MissionForge.Editor
{
    /// <summary>
    /// Brings the procedural rocket kit (task T006/T009, assets/blender/) into the one art root
    /// <c>Assets/MissionForge/Art/Models/Kit/</c>, fixes import scale and orientation, and swaps the
    /// six kit material slots for the URP materials of assets/media/style/STYLE_GUIDE.md.
    /// Kit conventions (assets/blender/scripts/AUTHORING.md): metres, Blender +Z up = stack axis,
    /// origin at the centre of the bottom mating ring. With bakeAxisConversion the imported model
    /// is +Y up with an identity root rotation and 1 Unity unit = 1 m.
    /// </summary>
    public static class RocketKitImport
    {
        public const string KitFolder = "Assets/MissionForge/Art/Models/Kit";
        public const string MaterialFolder = "Assets/MissionForge/Art/Materials/Kit";

        /// <summary>Where task T009 exports Unity FBX files (relative to the repository root).</summary>
        public static string RepositoryFbxPath =>
            Path.GetFullPath(Path.Combine(Application.dataPath, "..", "..", "..", "assets", "blender", "export", "fbx"));

        /// <summary>
        /// Material recipes from STYLE_GUIDE.md "Materials" (artistic game_value settings, not measured
        /// constants): base colour sRGB hex, metallic, smoothness (= 1 − Blender roughness).
        /// </summary>
        private static readonly (string slot, string hex, float metallic, float smoothness)[] Recipes =
        {
            ("hull", "#E8EEF0", 0.0f, 0.52f),         // Painted rocket shell: Ceramic, broad soft highlight.
            ("livery", "#112B40", 0.0f, 0.50f),       // Generic paint bands: Console navy, no liveries.
            ("engine_metal", "#4A4642", 0.80f, 0.50f), // Engine bell: dark warm graphite metal.
            ("nozzle_hot", "#5A4436", 0.75f, 0.45f),   // Bell exit: restrained heat tint, no chrome.
            ("thermal", "#B8955A", 0.75f, 0.57f),      // Insulation blanket: muted warm gold.
            ("detail_dark", "#2A3036", 0.20f, 0.38f),  // Raceways, bolts, gantry-style housings.
        };

        [MenuItem("MissionForge/Art/Sync Rocket Kit")]
        public static void SyncFromRepository()
        {
            EnsureMaterials(); // Before the import, so the postprocessor can bind them.
            int copied = CopyKit(RepositoryFbxPath, Path.GetFullPath(KitFolder));
            AssetDatabase.Refresh();
            foreach (string guid in AssetDatabase.FindAssets("t:Model", new[] { KitFolder }))
            {
                AssetDatabase.ImportAsset(AssetDatabase.GUIDToAssetPath(guid), ImportAssetOptions.ForceUpdate);
            }
            Debug.Log("[MissionForge] Rocket kit: " + copied + " FBX file(s) copied from " + RepositoryFbxPath + ".");
        }

        /// <summary>Copies every *.fbx from <paramref name="source"/> into <paramref name="target"/>. A missing source copies nothing.</summary>
        public static int CopyKit(string source, string target)
        {
            if (!Directory.Exists(source)) return 0;
            Directory.CreateDirectory(target);
            int count = 0;
            foreach (string file in Directory.GetFiles(source, "*.fbx", SearchOption.TopDirectoryOnly))
            {
                File.Copy(file, Path.Combine(target, Path.GetFileName(file)), true);
                count++;
            }
            return count;
        }

        /// <summary>Creates or updates the six kit materials and returns them by slot name.</summary>
        public static Dictionary<string, Material> EnsureMaterials()
        {
            Shader lit = Shader.Find("Universal Render Pipeline/Lit");
            if (lit == null) throw new InvalidOperationException("URP Lit shader not found.");
            CreateFolder(MaterialFolder);

            var bySlot = new Dictionary<string, Material>(StringComparer.Ordinal);
            foreach ((string slot, string hex, float metallic, float smoothness) in Recipes)
            {
                string path = MaterialFolder + "/Kit_" + slot + ".mat";
                var material = AssetDatabase.LoadAssetAtPath<Material>(path);
                if (material == null)
                {
                    material = new Material(lit);
                    AssetDatabase.CreateAsset(material, path);
                }
                material.shader = lit;
                ColorUtility.TryParseHtmlString(hex, out Color colour);
                material.SetColor("_BaseColor", colour);
                material.SetFloat("_Metallic", metallic);
                material.SetFloat("_Smoothness", smoothness);
                material.SetFloat("_EnvironmentReflections", 1f);
                material.SetFloat("_SpecularHighlights", 1f);
                EditorUtility.SetDirty(material);
                bySlot[slot] = material;
            }
            AssetDatabase.SaveAssets();
            return bySlot;
        }

        /// <summary>Kit slot for an imported material name: "hull", "hull.001" and "hull_mat" all map to "hull".</summary>
        public static string SlotFor(string materialName)
        {
            if (string.IsNullOrEmpty(materialName)) return null;
            string name = materialName.ToLowerInvariant();
            // Longest names first so "engine_metal" is not mistaken for a shorter slot.
            string best = null;
            foreach ((string slot, _, _, _) in Recipes)
            {
                if (name.StartsWith(slot, StringComparison.Ordinal) && (best == null || slot.Length > best.Length)) best = slot;
            }
            return best;
        }

        public static Material MaterialFor(string slot) =>
            slot == null ? null : AssetDatabase.LoadAssetAtPath<Material>(MaterialFolder + "/Kit_" + slot + ".mat");

        private static void CreateFolder(string path)
        {
            if (AssetDatabase.IsValidFolder(path)) return;
            string parent = Path.GetDirectoryName(path).Replace('\\', '/');
            CreateFolder(parent);
            AssetDatabase.CreateFolder(parent, Path.GetFileName(path));
        }
    }

    /// <summary>Import settings for every model in the kit folder (scale 1 m = 1 unit, +Y up baked in).</summary>
    public sealed class RocketKitModelPostprocessor : AssetPostprocessor
    {
        private bool InKit => assetPath.StartsWith(RocketKitImport.KitFolder + "/", StringComparison.Ordinal);

        private void OnPreprocessModel()
        {
            if (!InKit) return;
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
            importer.isReadable = false;
            importer.meshCompression = ModelImporterMeshCompression.Off;
            importer.importNormals = ModelImporterNormals.Import;
            importer.importTangents = ModelImporterTangents.CalculateMikk;
        }

        private void OnPostprocessModel(GameObject root)
        {
            if (!InKit) return;
            FixNestedAxisConversion(root.transform);
            foreach (Renderer renderer in root.GetComponentsInChildren<Renderer>(true))
            {
                Material[] materials = renderer.sharedMaterials;
                for (int i = 0; i < materials.Length; i++)
                {
                    string slot = RocketKitImport.SlotFor(materials[i] != null ? materials[i].name : null);
                    if (slot == null) continue;
                    string path = RocketKitImport.MaterialFolder + "/Kit_" + slot + ".mat";
                    context.DependsOnSourceAsset(path);
                    Material kit = AssetDatabase.LoadAssetAtPath<Material>(path);
                    if (kit != null) materials[i] = kit;
                }
                renderer.sharedMaterials = materials;
                renderer.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.On;
            }
        }

        /// <summary>
        /// Blender's exporter bakes the Z-up → Y-up conversion into the vertices, but objects nested
        /// two levels deep (the fairing halves under their half_a / half_b empties) still carry the
        /// −90° X correction on their transform, so they would lie on their side. Their meshes are
        /// already +Y up, so that leftover rotation is removed. Depth-one children are correct.
        /// </summary>
        public static void FixNestedAxisConversion(Transform root)
        {
            Quaternion leftover = Quaternion.Euler(270f, 0f, 0f);
            foreach (Transform child in root.GetComponentsInChildren<Transform>(true))
            {
                if (child == root || child.parent == root) continue;
                if (Quaternion.Angle(child.localRotation, leftover) < 0.5f) child.localRotation = Quaternion.identity;
            }
        }
    }
}
