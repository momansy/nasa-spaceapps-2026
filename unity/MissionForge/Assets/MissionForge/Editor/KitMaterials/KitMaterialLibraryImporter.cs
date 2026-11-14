using System;
using System.Collections.Generic;
using System.IO;
using UnityEditor;
using UnityEngine;

namespace MissionForge.Editor.KitMaterials
{
    /// <summary>
    /// Imports the shared PBR kit material library exported by T032 (assets/blender/materials/library.json)
    /// into Unity: textures into Art/Textures/Kit/&lt;slot&gt;/, materials Kit_&lt;slot&gt;.mat on
    /// MissionForge/KitLit (decal slot on MissionForge/KitDecal), and per-part mask variants plus
    /// KitPartMaskMap.json. Idempotent: a second run with the same library changes nothing.
    /// Contract and strategy: Editor/KitMaterials/README.md.
    /// </summary>
    public static class KitMaterialLibraryImporter
    {
        private const string LogPrefix = "[MissionForge] ";

        [MenuItem("MissionForge/Kit/Import Material Library")]
        public static void ImportRepositoryLibrary() => ImportRepositoryLibraryInternal();

        [MenuItem("MissionForge/Kit/Import Fixture Library (test)")]
        public static void ImportFixtureLibrary() => ImportFixtureLibraryInternal();

        [MenuItem("MissionForge/Kit/Delete Fixture Import (test)")]
        public static void DeleteFixtureImport()
        {
            AssetDatabase.DeleteAsset(KitAssetPaths.FixtureMaterialFolder);
            AssetDatabase.DeleteAsset(KitAssetPaths.FixtureTextureFolder);
        }

        /// <summary>Batch mode: -executeMethod MissionForge.Editor.KitMaterials.KitMaterialLibraryImporter.BatchImportRepository</summary>
        public static void BatchImportRepository() => ExitInBatchMode(ImportRepositoryLibraryInternal());

        /// <summary>Batch mode: -executeMethod MissionForge.Editor.KitMaterials.KitMaterialLibraryImporter.BatchImportFixture</summary>
        public static void BatchImportFixture() => ExitInBatchMode(ImportFixtureLibraryInternal());

        /// <summary>
        /// Imports <paramref name="libraryJsonPath"/>. <paramref name="textureOutDir"/> and
        /// <paramref name="materialOutDir"/> are project paths ("Assets/..."). With
        /// <paramref name="dryRun"/> nothing is written; the report says what would change.
        /// </summary>
        public static ImportReport Import(string libraryJsonPath, string textureOutDir, string materialOutDir, bool dryRun = false)
        {
            var report = new ImportReport(libraryJsonPath, dryRun);
            try
            {
                RunImport(libraryJsonPath, textureOutDir, materialOutDir, report);
            }
            catch (Exception e)
            {
                // Bad input never throws; this only catches editor/IO failures so callers always get a report.
                report.Error("Unexpected " + e.GetType().Name + ": " + e.Message);
                Debug.LogException(e);
            }
            Log(report);
            return report;
        }

        private static ImportReport ImportRepositoryLibraryInternal()
        {
            string path = KitAssetPaths.RepositoryLibraryPath;
            if (!File.Exists(path))
            {
                Debug.Log(LogPrefix + "Kit material library not found at " + path + " — awaiting T032 data");
                return null;
            }
            return Import(path, KitAssetPaths.TextureFolder, KitAssetPaths.MaterialFolder);
        }

        private static ImportReport ImportFixtureLibraryInternal() =>
            Import(KitAssetPaths.FixtureLibraryPath, KitAssetPaths.FixtureTextureFolder, KitAssetPaths.FixtureMaterialFolder);

        private static void RunImport(string libraryJsonPath, string textureOutDir, string materialOutDir, ImportReport report)
        {
            if (!KitAssetPaths.IsAssetFolderPath(textureOutDir) || !KitAssetPaths.IsAssetFolderPath(materialOutDir))
            {
                report.Error("Output folders must be project paths under Assets/ (got \"" + textureOutDir + "\", \"" + materialOutDir + "\").");
                return;
            }

            KitLibraryData library = KitLibraryParser.Parse(libraryJsonPath, report);
            if (library == null) return;

            Shader lit = Shader.Find(KitMaterialWriter.LitShaderName);
            Shader decal = Shader.Find(KitMaterialWriter.DecalShaderName);
            if (lit == null || decal == null)
            {
                report.Error("Shader " + (lit == null ? KitMaterialWriter.LitShaderName : KitMaterialWriter.DecalShaderName)
                             + " not found (Assets/MissionForge/Art/Shaders).");
                return;
            }

            var slotMaterials = new Dictionary<string, Material>(StringComparer.Ordinal);
            foreach (KitSlotSpec slot in library.Slots)
            {
                KitSlotTextures textures = SyncSlotTextures(slot, textureOutDir + "/" + slot.Slot, report);
                Material material = KitMaterialWriter.WriteSlot(slot, textures, slot.IsDecal ? decal : lit, materialOutDir, report);
                if (material != null) slotMaterials[slot.Slot] = material;
            }

            var mapEntries = new List<KitPartMaskMap.Entry>();
            var expectedVariants = new HashSet<string>(StringComparer.Ordinal);
            foreach (KitPartSpec part in library.Parts)
            {
                WritePartVariants(part, library, slotMaterials, textureOutDir, materialOutDir, report, mapEntries, expectedVariants);
            }
            WarnAboutStaleVariants(materialOutDir, expectedVariants, report);
            KitPartMaskMap.Write(materialOutDir, mapEntries, report);

            if (!report.DryRun) AssetDatabase.SaveAssets();
        }

        private static KitSlotTextures SyncSlotTextures(KitSlotSpec slot, string folder, ImportReport report)
        {
            int size = KitTextureSync.MaxTextureSize;
            var textures = new KitSlotTextures
            {
                Albedo = KitTextureSync.Sync(slot.Albedo, folder, slot.Hero, slot.IsDecal, size, report),
                Normal = KitTextureSync.Sync(slot.Normal, folder, slot.Hero, slot.IsDecal, size, report),
                Orm = KitTextureSync.Sync(slot.Orm, folder, slot.Hero, slot.IsDecal, size, report),
            };
            // A named map that did not arrive leaves the material's current map in place (the error is reported).
            textures.AlbedoFailed = slot.Albedo != null && textures.Albedo == null;
            textures.NormalFailed = slot.Normal != null && textures.Normal == null;
            textures.OrmFailed = slot.Orm != null && textures.Orm == null;
            return textures;
        }

        private static void WritePartVariants(KitPartSpec part, KitLibraryData library, Dictionary<string, Material> slotMaterials,
                                              string textureOutDir, string materialOutDir, ImportReport report,
                                              List<KitPartMaskMap.Entry> mapEntries, HashSet<string> expectedVariants)
        {
            List<string> slots = KitPartSlots.Resolve(part, library, report);
            if (slots.Count == 0) return;

            string maskFolder = textureOutDir + "/" + KitAssetPaths.MaskSubfolder + "/" + part.PartId;
            int maskSize = KitTextureSync.MaskMaxSize(part.MaskResolution);
            for (int lod = 0; lod <= 1; lod++)
            {
                KitTextureRef maskRef = part.MaskFor(lod);
                if (maskRef == null || !maskRef.Exists) continue;
                Texture2D mask = KitTextureSync.Sync(maskRef, maskFolder, false, false, maskSize, report);
                string maskPath = maskFolder + "/" + Path.GetFileName(maskRef.SourcePath);

                foreach (string slot in slots)
                {
                    string variantPath = KitMaterialWriter.VariantMaterialPath(materialOutDir, slot, part.PartId, lod);
                    expectedVariants.Add(variantPath);
                    if (!slotMaterials.TryGetValue(slot, out Material parent)) continue; // Dry run: parent not created yet.
                    if (mask == null && !report.DryRun) continue; // Error already reported.

                    KitMaterialWriter.WriteVariant(parent, variantPath, mask, part.MaskBIsFrost, report);
                    mapEntries.Add(new KitPartMaskMap.Entry
                    {
                        PartId = part.PartId,
                        Lod = lod,
                        Slot = slot,
                        MaterialPath = variantPath,
                        MaskPath = maskPath,
                        MaskB = part.MaskBIsFrost ? "frost" : "heat",
                    });
                }
            }
        }

        /// <summary>Old variants are never deleted (their GUIDs may be referenced); they are listed instead.</summary>
        private static void WarnAboutStaleVariants(string materialOutDir, HashSet<string> expected, ImportReport report)
        {
            string absolute = KitAssetPaths.ToAbsolute(materialOutDir);
            if (!Directory.Exists(absolute)) return;
            string pattern = KitMaterialWriter.MaterialPrefix + "*" + KitMaterialWriter.VariantSeparator + "*.mat";
            foreach (string file in Directory.GetFiles(absolute, pattern, SearchOption.TopDirectoryOnly))
            {
                string assetPath = materialOutDir + "/" + Path.GetFileName(file);
                if (!expected.Contains(assetPath)) report.Warn(assetPath + " is no longer produced by the library (not deleted).");
            }
        }

        private static void Log(ImportReport report)
        {
            // Problems are logged as warnings, not errors: the Unity Test Runner fails tests on any LogError.
            foreach (string error in report.Errors) Debug.LogWarning(LogPrefix + "Kit material library error: " + error);
            foreach (string warning in report.Warnings) Debug.LogWarning(LogPrefix + "Kit material library warning: " + warning);
            Debug.Log(report.Summary);
        }

        private static void ExitInBatchMode(ImportReport report)
        {
            if (!Application.isBatchMode) return;
            EditorApplication.Exit(report != null && report.HasErrors ? 1 : 0);
        }
    }
}
