using System.IO;
using NUnit.Framework;
using UnityEditor;
using UnityEngine;
using UnityEngine.Rendering;

namespace MissionForge.Editor.KitMaterials.Tests
{
    /// <summary>
    /// EditMode tests for the kit material pipeline against the tiny fixture library in
    /// Editor/KitMaterials/Fixtures~ (a tilde folder, so Unity does not import it). Each test imports into
    /// the _FixtureTest_ folders and TearDown deletes them again.
    /// </summary>
    public sealed class KitMaterialLibraryImporterTests
    {
        private const string TexOut = KitAssetPaths.FixtureTextureFolder;
        private const string MatOut = KitAssetPaths.FixtureMaterialFolder;
        private const string FixturePart = "eng_fixture";
        private const float Epsilon = 1e-4f;

        private bool _textureRootExisted;

        [SetUp]
        public void SetUp()
        {
            _textureRootExisted = AssetDatabase.IsValidFolder(KitAssetPaths.TextureFolder);
            DeleteOutputs();
        }

        [TearDown]
        public void TearDown()
        {
            DeleteOutputs();
            bool createdByTest = !_textureRootExisted && AssetDatabase.IsValidFolder(KitAssetPaths.TextureFolder);
            if (createdByTest && AssetDatabase.FindAssets("", new[] { KitAssetPaths.TextureFolder }).Length == 0)
            {
                AssetDatabase.DeleteAsset(KitAssetPaths.TextureFolder);
            }
        }

        [Test]
        public void FixtureImport_HasNoErrors_AndCreatesEverySlotMaterial()
        {
            ImportReport report = ImportFixture();

            Assert.That(report.Errors, Is.Empty, string.Join("\n", report.Errors));
            Assert.That(report.Created, Is.GreaterThan(0));
            Material hull = LoadSlot("hull");
            Material trim = LoadSlot("trim");
            Material decal = LoadSlot("decal");
            Assert.IsNotNull(hull);
            Assert.IsNotNull(trim);
            Assert.IsNotNull(decal);
            Assert.AreEqual(KitMaterialWriter.LitShaderName, hull.shader.name);
            Assert.AreEqual(KitMaterialWriter.LitShaderName, trim.shader.name);
            Assert.AreEqual(KitMaterialWriter.DecalShaderName, decal.shader.name);

            Assert.IsNotNull(hull.GetTexture("_BaseMap"));
            Assert.IsNotNull(hull.GetTexture("_BumpMap"));
            Assert.IsNotNull(hull.GetTexture("_OrmMap"));
            Assert.AreEqual(2f, hull.GetFloat("_Tiling"), Epsilon, "tiling_m");
            Assert.AreEqual(1f, hull.GetFloat("_Metallic"), Epsilon, "ORM present: neutral multiplier");
            Assert.AreEqual(0f, hull.GetFloat("_Smoothness"), Epsilon, "ORM present: roughness straight from ORM.G");
            Assert.AreEqual(0.40f, hull.GetVector("_RoughnessRange").x, Epsilon);
            Assert.AreEqual(0.55f, hull.GetVector("_RoughnessRange").y, Epsilon);
            ColorUtility.TryParseHtmlString("#E8EEF0", out Color tint);
            Assert.AreEqual(tint.r, hull.GetColor("_BaseColor").r, Epsilon);

            Assert.IsNotNull(trim.GetTexture("_BaseMap"), "trim falls back to the shared trim textures");
            Assert.IsNotNull(decal.GetTexture("_BaseMap"), "decal falls back to the shared decal textures");
            Assert.AreEqual(0.4f, decal.GetFloat("_Cutoff"), Epsilon);
            Assert.AreEqual(1f, decal.GetFloat("_Tiling"), Epsilon);
        }

        [Test]
        public void SecondImport_IsIdempotent()
        {
            ImportFixture();

            ImportReport second = ImportFixture();

            Assert.That(second.Errors, Is.Empty, string.Join("\n", second.Errors));
            Assert.AreEqual(0, second.Created, "created: " + string.Join(", ", second.ChangedAssets));
            Assert.AreEqual(0, second.Updated, "updated: " + string.Join(", ", second.ChangedAssets));
            Assert.That(second.Unchanged, Is.GreaterThan(0));
        }

        [Test]
        public void Reimport_UpdatesInPlace_AndKeepsMaterialGuids()
        {
            ImportFixture();
            string hullPath = KitMaterialWriter.SlotMaterialPath(MatOut, "hull");
            string variantPath = KitMaterialWriter.VariantMaterialPath(MatOut, "hull", FixturePart, 0);
            string hullGuid = AssetDatabase.AssetPathToGUID(hullPath);
            string variantGuid = AssetDatabase.AssetPathToGUID(variantPath);
            Material hull = LoadSlot("hull");
            hull.SetFloat("_Tiling", 7f); // Drift the asset so the importer must write it back.
            EditorUtility.SetDirty(hull);
            AssetDatabase.SaveAssets();

            ImportReport again = ImportFixture();

            Assert.That(again.Errors, Is.Empty, string.Join("\n", again.Errors));
            Assert.AreEqual(1, again.Updated, "updated: " + string.Join(", ", again.ChangedAssets));
            Assert.AreEqual(hullGuid, AssetDatabase.AssetPathToGUID(hullPath));
            Assert.AreEqual(variantGuid, AssetDatabase.AssetPathToGUID(variantPath));
            Assert.AreEqual(2f, LoadSlot("hull").GetFloat("_Tiling"), Epsilon);
        }

        [Test]
        public void Textures_HaveContractImportSettings()
        {
            ImportFixture();

            TextureImporter albedo = Importer(TexOut + "/hull/hull_albedo.png");
            TextureImporter orm = Importer(TexOut + "/hull/hull_orm.png");
            TextureImporter normal = Importer(TexOut + "/hull/hull_normal.png");
            TextureImporter trimAlbedo = Importer(TexOut + "/trim/mf_trim_01_albedo.png");
            TextureImporter decalAlbedo = Importer(TexOut + "/decal/mf_decals_01_albedo.png");
            TextureImporter mask = Importer(TexOut + "/" + KitAssetPaths.MaskSubfolder + "/" + FixturePart + "/eng_fixture_lod0_mask.png");

            Assert.IsTrue(albedo.sRGBTexture, "albedo is sRGB");
            Assert.AreEqual(TextureImporterType.Default, albedo.textureType);
            Assert.IsFalse(orm.sRGBTexture, "ORM is linear");
            Assert.AreEqual(TextureImporterType.NormalMap, normal.textureType);
            Assert.IsFalse(mask.sRGBTexture, "mask is linear");

            foreach (TextureImporter t in new[] { albedo, orm, normal, trimAlbedo, decalAlbedo })
            {
                Assert.AreEqual(KitTextureSync.MaxTextureSize, t.maxTextureSize, t.assetPath);
                Assert.IsTrue(t.mipmapEnabled, t.assetPath);
                Assert.AreEqual(KitTextureSync.TilingAnisoLevel, t.anisoLevel, t.assetPath);
            }
            Assert.AreEqual(TextureWrapMode.Repeat, albedo.wrapModeU);
            Assert.AreEqual(TextureWrapMode.Clamp, decalAlbedo.wrapModeU);
            Assert.IsTrue(decalAlbedo.alphaIsTransparency);

            Assert.IsFalse(WebGL(albedo).overridden, "hero set keeps 2048 on WebGL");
            Assert.IsTrue(WebGL(trimAlbedo).overridden, "non-hero set is capped on WebGL");
            Assert.AreEqual(KitTextureSync.WebGLNonHeroMaxSize, WebGL(trimAlbedo).maxTextureSize);

            int maskSize = KitTextureSync.MaskMaxSize(16);
            Assert.AreEqual(maskSize, mask.maxTextureSize);
            Assert.IsTrue(WebGL(mask).overridden);
            Assert.AreEqual(maskSize, WebGL(mask).maxTextureSize);
            Assert.AreEqual(TextureWrapMode.Clamp, mask.wrapModeU);
        }

        [Test]
        public void KitShaders_AreFound_AndSupported()
        {
            Shader lit = Shader.Find(KitMaterialWriter.LitShaderName);
            Shader decal = Shader.Find(KitMaterialWriter.DecalShaderName);
            Assert.IsNotNull(lit, KitMaterialWriter.LitShaderName);
            Assert.IsNotNull(decal, KitMaterialWriter.DecalShaderName);
            if (SystemInfo.graphicsDeviceType == GraphicsDeviceType.Null)
            {
                Assert.Ignore("No graphics device (-nographics): Shader.isSupported cannot be evaluated.");
            }

            ImportFixture();

            Assert.IsTrue(LoadSlot("hull").shader.isSupported, "KitLit compiles on " + SystemInfo.graphicsDeviceType);
            Assert.IsTrue(LoadSlot("decal").shader.isSupported, "KitDecal compiles on " + SystemInfo.graphicsDeviceType);
        }

        [Test]
        public void PartMasks_BecomeVariants_ThatOverrideOnlyThePartMask()
        {
            ImportFixture();
            Material hull = LoadSlot("hull");
            Material lod0 = AssetDatabase.LoadAssetAtPath<Material>(KitMaterialWriter.VariantMaterialPath(MatOut, "hull", FixturePart, 0));
            Material lod1 = AssetDatabase.LoadAssetAtPath<Material>(KitMaterialWriter.VariantMaterialPath(MatOut, "hull", FixturePart, 1));
            Material trimLod0 = AssetDatabase.LoadAssetAtPath<Material>(KitMaterialWriter.VariantMaterialPath(MatOut, "trim", FixturePart, 0));

            Assert.IsNotNull(lod0);
            Assert.IsNotNull(lod1);
            Assert.IsNotNull(trimLod0);
            Assert.IsNull(AssetDatabase.LoadAssetAtPath<Material>(KitMaterialWriter.VariantMaterialPath(MatOut, "decal", FixturePart, 0)), "decal gets no mask variant");
            Assert.IsTrue(lod0.isVariant);
            Assert.AreEqual(hull, lod0.parent);
            Assert.IsNull(hull.GetTexture("_PartMask"));
            Assert.IsNotNull(lod0.GetTexture("_PartMask"));
            Assert.AreNotEqual(lod0.GetTexture("_PartMask"), lod1.GetTexture("_PartMask"), "LOD1 has its own UV1 bake");
            Assert.AreEqual(hull.GetTexture("_BaseMap"), lod0.GetTexture("_BaseMap"), "inherited from the slot material");

            string mapPath = KitPartMaskMap.MapPath(MatOut);
            Assert.AreEqual(4, KitPartMaskMap.Load(mapPath).Count, "2 slots x 2 LODs");
            Assert.AreEqual(lod1, KitPartMaskMap.FindVariant(mapPath, FixturePart, 1, "hull"));

            hull.SetColor("_BaseColor", Color.red); // Un-overridden properties follow the parent.
            Assert.AreEqual(1f, lod0.GetColor("_BaseColor").r, Epsilon);
            Assert.AreEqual(0f, lod0.GetColor("_BaseColor").g, Epsilon);
        }

        [Test]
        public void MissingTexture_IsReportedAsError_NotThrown()
        {
            ImportReport report = null;
            string library = Path.Combine(KitAssetPaths.FixtureDirectory, "library_missing.json");

            Assert.DoesNotThrow(() => report = KitMaterialLibraryImporter.Import(library, TexOut, MatOut));

            Assert.IsTrue(report.Errors.Exists(e => e.Contains("does_not_exist_albedo.png")), string.Join("\n", report.Errors));
            Material hull = LoadSlot("hull");
            Assert.IsNotNull(hull, "the slot is still written with the maps that exist");
            Assert.IsNotNull(hull.GetTexture("_BumpMap"));
            Assert.IsNull(hull.GetTexture("_BaseMap"));
        }

        [Test]
        public void MissingLibrary_IsReportedAsError_NotThrown()
        {
            ImportReport report = null;
            string library = Path.Combine(KitAssetPaths.FixtureDirectory, "no_such_library.json");

            Assert.DoesNotThrow(() => report = KitMaterialLibraryImporter.Import(library, TexOut, MatOut));

            Assert.IsTrue(report.HasErrors);
            Assert.AreEqual(0, report.Created);
            Assert.IsFalse(AssetDatabase.IsValidFolder(MatOut));
        }

        [Test]
        public void DryRun_WritesNothing()
        {
            ImportReport report = KitMaterialLibraryImporter.Import(KitAssetPaths.FixtureLibraryPath, TexOut, MatOut, dryRun: true);

            Assert.That(report.Errors, Is.Empty, string.Join("\n", report.Errors));
            Assert.That(report.Created, Is.GreaterThan(0));
            Assert.IsFalse(AssetDatabase.IsValidFolder(MatOut));
            Assert.IsFalse(AssetDatabase.IsValidFolder(TexOut));
        }

        private static ImportReport ImportFixture() =>
            KitMaterialLibraryImporter.Import(KitAssetPaths.FixtureLibraryPath, TexOut, MatOut);

        private static Material LoadSlot(string slot) =>
            AssetDatabase.LoadAssetAtPath<Material>(KitMaterialWriter.SlotMaterialPath(MatOut, slot));

        private static TextureImporter Importer(string assetPath)
        {
            var importer = AssetImporter.GetAtPath(assetPath) as TextureImporter;
            Assert.IsNotNull(importer, assetPath);
            return importer;
        }

        private static TextureImporterPlatformSettings WebGL(TextureImporter importer) =>
            importer.GetPlatformTextureSettings(KitTextureSync.WebGLPlatform);

        private static void DeleteOutputs()
        {
            AssetDatabase.DeleteAsset(MatOut);
            AssetDatabase.DeleteAsset(TexOut);
        }
    }
}
