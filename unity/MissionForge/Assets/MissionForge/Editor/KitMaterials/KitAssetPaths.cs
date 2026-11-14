using System.IO;
using UnityEditor;
using UnityEngine;

namespace MissionForge.Editor.KitMaterials
{
    /// <summary>Project-relative ("Assets/...") and absolute path helpers for the kit material importer.</summary>
    public static class KitAssetPaths
    {
        public const string TextureFolder = "Assets/MissionForge/Art/Textures/Kit";
        public const string MaterialFolder = RocketKitImport.MaterialFolder; // Assets/MissionForge/Art/Materials/Kit
        public const string MaskSubfolder = "_masks";

        /// <summary>Fixture outputs; tests and the fixture menu delete them again.</summary>
        public const string FixtureTextureFolder = TextureFolder + "/_FixtureTest_";
        public const string FixtureMaterialFolder = MaterialFolder + "/_FixtureTest_";

        /// <summary>Unity project folder (parent of Assets/).</summary>
        public static string ProjectRoot => Path.GetDirectoryName(Application.dataPath);

        /// <summary>&lt;repo&gt;/assets/blender/materials/library.json (T032 export).</summary>
        public static string RepositoryLibraryPath =>
            Path.GetFullPath(Path.Combine(Application.dataPath, "..", "..", "..", "assets", "blender", "materials", "library.json"));

        /// <summary>Tilde folder: ignored by the Unity importer, read directly from disk.</summary>
        public static string FixtureDirectory =>
            Path.Combine(Application.dataPath, "MissionForge", "Editor", "KitMaterials", "Fixtures~");

        public static string FixtureLibraryPath => Path.Combine(FixtureDirectory, "library.json");

        public static string ToAbsolute(string assetPath) => Path.Combine(ProjectRoot, assetPath);

        public static bool IsAssetFolderPath(string assetPath) =>
            !string.IsNullOrEmpty(assetPath)
            && (assetPath == "Assets" || assetPath.StartsWith("Assets/", System.StringComparison.Ordinal))
            && !assetPath.Contains("..")
            && !assetPath.EndsWith("/", System.StringComparison.Ordinal);

        /// <summary>Creates the folder and its parents through the AssetDatabase (so .meta files exist).</summary>
        public static void EnsureFolder(string assetPath)
        {
            if (AssetDatabase.IsValidFolder(assetPath)) return;
            string parent = Path.GetDirectoryName(assetPath).Replace('\\', '/');
            EnsureFolder(parent);
            AssetDatabase.CreateFolder(parent, Path.GetFileName(assetPath));
        }
    }
}
