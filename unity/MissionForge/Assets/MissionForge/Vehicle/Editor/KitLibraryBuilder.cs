using System;
using System.Collections.Generic;
using System.IO;
using MissionForge.Editor;
using Newtonsoft.Json.Linq;
using UnityEditor;
using UnityEngine;

namespace MissionForge.Vehicle.Editor
{
    /// <summary>
    /// Builds <see cref="KitLibrary"/> from the kit models in <c>Art/Models/Kit/</c> and the layout numbers in
    /// <c>assets/blender/kit_manifest.json</c> (read only; T009 owns it). Batch mode:
    /// <c>-executeMethod MissionForge.Vehicle.Editor.KitLibraryBuilder.RefreshAndBuild</c>.
    /// </summary>
    public static class KitLibraryBuilder
    {
        public static string ManifestPath =>
            Path.GetFullPath(Path.Combine(Application.dataPath, "..", "..", "..", "assets", "blender", "kit_manifest.json"));

        /// <summary>Copies the T009 exports into Art/Models/Kit (same importer settings as T008) and rebuilds the library.</summary>
        [MenuItem("MissionForge/Vehicle/Refresh Kit Imports And Build Library")]
        public static void RefreshAndBuild()
        {
            RocketKitImport.SyncFromRepository();
            Build();
        }

        [MenuItem("MissionForge/Vehicle/Build Kit Library")]
        public static KitLibrary Build()
        {
            if (!File.Exists(ManifestPath)) throw new FileNotFoundException("Kit manifest not found", ManifestPath);
            JObject parts = (JObject)JObject.Parse(File.ReadAllText(ManifestPath))["parts"];
            var entries = new List<KitPartEntry>();
            var withoutModel = new List<string>();
            foreach (KeyValuePair<string, JToken> kv in parts)
            {
                var meta = (JObject)kv.Value;
                string id = kv.Key;
                var model = AssetDatabase.LoadAssetAtPath<GameObject>(RocketKitImport.KitFolder + "/" + id + ".fbx");
                if (model == null) withoutModel.Add(id);
                var entry = new KitPartEntry
                {
                    id = id,
                    family = (string)meta["family"],
                    prefab = model,
                    lengthM = (float?)meta["length_m"] ?? 0f,
                    diameterBottomM = (float?)meta["diameter_bottom_m"] ?? 0f,
                    diameterTopM = (float?)meta["diameter_top_m"] ?? 0f,
                };
                if (meta["attach_points_m"] is JObject attach)
                {
                    foreach (KeyValuePair<string, JToken> a in attach)
                    {
                        var xyz = (JArray)a.Value["blender_xyz"];
                        entry.attachPoints.Add(new KitAttachPoint
                        {
                            name = a.Key,
                            kitPositionM = new Vector3((float)xyz[0], (float)xyz[1], (float)xyz[2]),
                        });
                    }
                }
                entries.Add(entry);
            }
            entries.Sort((a, b) => string.CompareOrdinal(a.id, b.id));

            var library = AssetDatabase.LoadAssetAtPath<KitLibrary>(KitLibrary.AssetPath);
            if (library == null)
            {
                library = ScriptableObject.CreateInstance<KitLibrary>();
                AssetDatabase.CreateAsset(library, KitLibrary.AssetPath);
            }
            library.SetParts(entries);
            EditorUtility.SetDirty(library);
            AssetDatabase.SaveAssets();
            Debug.Log("[MissionForge] Kit library: " + entries.Count + " parts" +
                      (withoutModel.Count > 0 ? ", no model for: " + string.Join(", ", withoutModel) : "") + ".");
            return library;
        }
    }
}
