using System;
using System.IO;
using UnityEditor;
using UnityEngine;

namespace MissionForge.Editor.KitMaterials
{
    /// <summary>
    /// Copies library textures into the project (only when the bytes differ) and enforces their import
    /// settings (VISUAL_TARGET 2.1): albedo sRGB, ORM and masks linear, normals as NormalMap, mipmaps on,
    /// max 2048, WebGL override 1024 for non-hero sets, anisotropic 4 on tiling sets.
    /// </summary>
    public static class KitTextureSync
    {
        public const string WebGLPlatform = "WebGL";
        public const int MaxTextureSize = 2048;
        public const int WebGLNonHeroMaxSize = 1024;
        public const int TilingAnisoLevel = 4;
        public const int MaskAnisoLevel = 1;
        private const int MinTextureSize = 32;

        /// <summary>
        /// Brings one texture into <paramref name="folderAssetPath"/> and returns the loaded texture
        /// (null on failure or, in a dry run, when the asset does not exist yet).
        /// </summary>
        public static Texture2D Sync(KitTextureRef texture, string folderAssetPath, bool hero, bool isDecal, int maxSize,
                                     ImportReport report)
        {
            if (texture == null || !texture.Exists) return null;

            string assetPath = folderAssetPath + "/" + Path.GetFileName(texture.SourcePath);
            string absolutePath = KitAssetPaths.ToAbsolute(assetPath);
            bool existed = File.Exists(absolutePath);
            bool contentChanged;
            try
            {
                contentChanged = !existed || !SameBytes(texture.SourcePath, absolutePath);
            }
            catch (IOException e)
            {
                report.Error(texture.Field + ": cannot read " + texture.RelativePath + " (" + e.Message + ").");
                return null;
            }

            if (report.DryRun)
            {
                var dryImporter = existed ? AssetImporter.GetAtPath(assetPath) as TextureImporter : null;
                bool settingsDiffer = dryImporter != null && Configure(dryImporter, texture.Role, hero, isDecal, maxSize, false);
                report.Count(KitAssetKind.Texture, !existed ? KitChange.Created : contentChanged || settingsDiffer ? KitChange.Updated : KitChange.Unchanged, assetPath);
                return existed ? AssetDatabase.LoadAssetAtPath<Texture2D>(assetPath) : null;
            }

            if (contentChanged)
            {
                try
                {
                    KitAssetPaths.EnsureFolder(folderAssetPath);
                    File.Copy(texture.SourcePath, absolutePath, true);
                }
                catch (Exception e) when (e is IOException || e is UnauthorizedAccessException)
                {
                    report.Error(texture.Field + ": copy to " + assetPath + " failed (" + e.Message + ").");
                    return null;
                }
                AssetDatabase.ImportAsset(assetPath, ImportAssetOptions.ForceSynchronousImport | ImportAssetOptions.ForceUpdate);
            }

            var importer = AssetImporter.GetAtPath(assetPath) as TextureImporter;
            if (importer == null)
            {
                report.Error(texture.Field + ": " + assetPath + " did not import as a texture.");
                return null;
            }
            bool settingsChanged = Configure(importer, texture.Role, hero, isDecal, maxSize, true);
            if (settingsChanged) importer.SaveAndReimport();

            report.Count(KitAssetKind.Texture, !existed ? KitChange.Created : contentChanged || settingsChanged ? KitChange.Updated : KitChange.Unchanged, assetPath);
            var loaded = AssetDatabase.LoadAssetAtPath<Texture2D>(assetPath);
            if (loaded == null) report.Error(texture.Field + ": " + assetPath + " could not be loaded as Texture2D.");
            return loaded;
        }

        /// <summary>Max import size for a UV1 mask of the given bake resolution (power of two, 32..2048).</summary>
        public static int MaskMaxSize(int maskResolution) =>
            Mathf.Clamp(Mathf.NextPowerOfTwo(Mathf.Max(1, maskResolution)), MinTextureSize, MaxTextureSize);

        /// <summary>
        /// Compares (and when <paramref name="apply"/> is true, sets) the import settings. Returns true when
        /// anything differs. Only fields the pipeline owns are touched, so re-runs are stable.
        /// </summary>
        public static bool Configure(TextureImporter importer, KitTextureRole role, bool hero, bool isDecal, int maxSize, bool apply)
        {
            bool changed = false;
            bool isNormal = role == KitTextureRole.Normal;
            bool isMask = role == KitTextureRole.Mask;

            TextureImporterType type = isNormal ? TextureImporterType.NormalMap : TextureImporterType.Default;
            if (importer.textureType != type) { changed = true; if (apply) importer.textureType = type; }

            if (!isNormal)
            {
                bool srgb = role == KitTextureRole.Albedo;
                if (importer.sRGBTexture != srgb) { changed = true; if (apply) importer.sRGBTexture = srgb; }

                TextureImporterAlphaSource alpha = role == KitTextureRole.Orm ? TextureImporterAlphaSource.None : TextureImporterAlphaSource.FromInput;
                if (importer.alphaSource != alpha) { changed = true; if (apply) importer.alphaSource = alpha; }

                bool alphaIsTransparency = isDecal && role == KitTextureRole.Albedo;
                if (importer.alphaIsTransparency != alphaIsTransparency) { changed = true; if (apply) importer.alphaIsTransparency = alphaIsTransparency; }
            }

            if (!importer.mipmapEnabled) { changed = true; if (apply) importer.mipmapEnabled = true; }
            if (importer.maxTextureSize != maxSize) { changed = true; if (apply) importer.maxTextureSize = maxSize; }

            int aniso = isMask ? MaskAnisoLevel : TilingAnisoLevel;
            if (importer.anisoLevel != aniso) { changed = true; if (apply) importer.anisoLevel = aniso; }

            TextureWrapMode wrap = isMask || isDecal ? TextureWrapMode.Clamp : TextureWrapMode.Repeat;
            if (importer.wrapModeU != wrap || importer.wrapModeV != wrap) { changed = true; if (apply) importer.wrapMode = wrap; }

            bool overrideWebGL = !hero || isMask; // Masks always take the WebGL cap.
            changed |= ConfigureWebGL(importer, overrideWebGL, Mathf.Min(WebGLNonHeroMaxSize, maxSize), apply);
            return changed;
        }

        private static bool ConfigureWebGL(TextureImporter importer, bool overrideSize, int size, bool apply)
        {
            TextureImporterPlatformSettings web = importer.GetPlatformTextureSettings(WebGLPlatform);
            web.name = WebGLPlatform;
            if (overrideSize)
            {
                if (web.overridden && web.maxTextureSize == size) return false;
                if (apply)
                {
                    web.overridden = true;
                    web.maxTextureSize = size;
                    importer.SetPlatformTextureSettings(web);
                }
                return true;
            }
            if (!web.overridden) return false;
            if (apply)
            {
                web.overridden = false;
                importer.SetPlatformTextureSettings(web);
            }
            return true;
        }

        private static bool SameBytes(string a, string b)
        {
            var infoA = new FileInfo(a);
            var infoB = new FileInfo(b);
            if (infoA.Length != infoB.Length) return false;
            byte[] bytesA = File.ReadAllBytes(a);
            byte[] bytesB = File.ReadAllBytes(b);
            for (int i = 0; i < bytesA.Length; i++)
            {
                if (bytesA[i] != bytesB[i]) return false;
            }
            return true;
        }
    }
}
