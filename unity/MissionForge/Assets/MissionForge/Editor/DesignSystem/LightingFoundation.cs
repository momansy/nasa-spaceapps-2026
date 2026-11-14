using System;
using System.IO;
using UnityEditor;
using UnityEngine;

namespace MissionForge.Editor.DesignSystem
{
    /// <summary>
    /// T031 step 6, the shared URP rendering foundation used by every scene: quality tiers, URP assets and
    /// renderers (<see cref="ConfigurePipelines"/>), volume profiles (<see cref="BuildVolumes"/>), lighting-rig
    /// prefabs (<see cref="BuildRigs"/>) and their application to MF_Title, MF_Lobby and MF_BuildBay
    /// (<see cref="ApplyToScenes"/>). Every step is idempotent and logs each change it makes.
    /// Batch mode: <c>-executeMethod MissionForge.Editor.DesignSystem.LightingFoundation.All</c>.
    /// All light, grading and probe numbers are <c>game_value</c> art targets from
    /// orchestration/VISUAL_TARGET.md 2.5 and STYLE_GUIDE.md, not physical measurements.
    /// The map from scene to rig and volume is in <c>Art/Lighting/README.md</c>.
    /// </summary>
    public static partial class LightingFoundation
    {
        public const string LightingDir = "Assets/MissionForge/Art/Lighting";
        public const string HdriDir = LightingDir + "/HDRI";
        public const string ProbesDir = LightingDir + "/Probes";
        public const string SettingsDir = "Assets/Settings";

        private const string MenuRoot = "MissionForge/Design System/Lighting/";
        private const string LogPrefix = "[MissionForge][Lighting] ";

        /// <summary>Runs every step in order. In batch mode any failure exits the editor with code 1.</summary>
        [MenuItem(MenuRoot + "All (Pipelines, Volumes, Rigs, Scenes)", priority = 100)]
        public static void All()
        {
            try
            {
                ConfigurePipelines();
                BuildVolumes();
                BuildRigs();
                ApplyToScenes();
                Log("All steps finished.");
            }
            catch (Exception e)
            {
                Debug.LogError(LogPrefix + "Failed: " + e);
                if (Application.isBatchMode) EditorApplication.Exit(1);
            }
        }

        /// <summary>
        /// Volumes, rigs and scenes only (no URP asset or renderer changes). Batch:
        /// <c>-executeMethod MissionForge.Editor.DesignSystem.LightingFoundation.LookOnly</c>.
        /// </summary>
        [MenuItem(MenuRoot + "Look Only (Volumes, Rigs, Scenes)", priority = 101)]
        public static void LookOnly()
        {
            try
            {
                BuildVolumes();
                BuildRigs();
                ApplyToScenes();
                Log("Look steps finished.");
            }
            catch (Exception e)
            {
                Debug.LogError(LogPrefix + "Failed: " + e);
                if (Application.isBatchMode) EditorApplication.Exit(1);
            }
        }

        internal static void Log(string message) => Debug.Log(LogPrefix + message);

        internal static void Warn(string message) => Debug.LogWarning(LogPrefix + message);

        /// <summary>Creates an asset folder (and its parents) through the AssetDatabase.</summary>
        internal static void EnsureFolder(string folder)
        {
            if (AssetDatabase.IsValidFolder(folder)) return;
            string parent = Path.GetDirectoryName(folder)?.Replace('\\', '/');
            if (string.IsNullOrEmpty(parent)) throw new InvalidOperationException("Invalid folder: " + folder);
            EnsureFolder(parent);
            AssetDatabase.CreateFolder(parent, Path.GetFileName(folder));
            Log("Created folder " + folder);
        }

        internal static T LoadRequired<T>(string path) where T : UnityEngine.Object
        {
            T asset = AssetDatabase.LoadAssetAtPath<T>(path);
            if (asset == null) throw new InvalidOperationException(typeof(T).Name + " not found: " + path);
            return asset;
        }

        // ------------------------------------------------------------ SerializedObject helpers (log on change)

        internal static SerializedProperty Find(SerializedObject so, string path)
        {
            SerializedProperty p = so.FindProperty(path);
            if (p == null) throw new InvalidOperationException(so.targetObject.name + " has no serialized field " + path);
            return p;
        }

        internal static void SetInt(SerializedProperty p, int value, string label)
        {
            int old = p.propertyType == SerializedPropertyType.Boolean ? (p.boolValue ? 1 : 0) : p.intValue;
            if (old == value) return;
            if (p.propertyType == SerializedPropertyType.Boolean) p.boolValue = value != 0;
            else p.intValue = value; // Enum properties: intValue is the enum's numeric value.
            Log(label + ": " + old + " -> " + value);
        }

        internal static void SetBool(SerializedProperty p, bool value, string label) => SetInt(p, value ? 1 : 0, label);

        internal static void SetFloat(SerializedProperty p, float value, string label)
        {
            if (Mathf.Approximately(p.floatValue, value)) return;
            Log(label + ": " + p.floatValue + " -> " + value);
            p.floatValue = value;
        }

        internal static void SetObject(SerializedProperty p, UnityEngine.Object value, string label)
        {
            if (p.objectReferenceValue == value) return;
            Log(label + ": " + (p.objectReferenceValue != null ? p.objectReferenceValue.name : "None") + " -> " +
                (value != null ? value.name : "None"));
            p.objectReferenceValue = value;
        }

        internal static void SetString(SerializedProperty p, string value, string label)
        {
            if (p.stringValue == value) return;
            Log(label + ": '" + p.stringValue + "' -> '" + value + "'");
            p.stringValue = value;
        }
    }
}
