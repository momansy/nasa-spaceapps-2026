using System;
using System.Collections.Generic;
using System.IO;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using UnityEditor;
using UnityEngine;

namespace MissionForge.Editor.KitMaterials
{
    /// <summary>
    /// <c>KitPartMaskMap.json</c> in the material folder: which mask variant a renderer of a kit part
    /// should use, per (part id, LOD, slot). Written by <see cref="KitMaterialLibraryImporter"/>; meant for
    /// RocketKitImport's model postprocessor or KitLibrary tooling, which can call
    /// <see cref="FindVariant"/> with the model file name (= part id), the renderer's LOD suffix and the
    /// slot from <see cref="RocketKitImport.SlotFor"/>.
    /// </summary>
    public static class KitPartMaskMap
    {
        public const string FileName = "KitPartMaskMap.json";
        public const int FormatVersion = 1;

        public sealed class Entry
        {
            public string PartId;
            public int Lod;
            public string Slot;
            public string MaterialPath;
            public string MaskPath;
            public string MaskB;
        }

        public static string MapPath(string materialOutDir) => materialOutDir + "/" + FileName;

        /// <summary>Deterministic JSON (sorted, "\n" newlines) so unchanged input gives identical bytes.</summary>
        public static string Serialize(IEnumerable<Entry> entries)
        {
            var sorted = new List<Entry>(entries);
            sorted.Sort((a, b) =>
            {
                int c = string.CompareOrdinal(a.PartId, b.PartId);
                if (c != 0) return c;
                c = a.Lod.CompareTo(b.Lod);
                return c != 0 ? c : string.CompareOrdinal(a.Slot, b.Slot);
            });

            var array = new JArray();
            foreach (Entry e in sorted)
            {
                array.Add(new JObject
                {
                    ["part_id"] = e.PartId,
                    ["lod"] = e.Lod,
                    ["slot"] = e.Slot,
                    ["material"] = e.MaterialPath,
                    ["mask"] = e.MaskPath,
                    ["mask_b"] = e.MaskB,
                });
            }
            var root = new JObject
            {
                ["version"] = FormatVersion,
                ["generated_by"] = "MissionForge.Editor.KitMaterials.KitMaterialLibraryImporter",
                ["value_type"] = "game_value",
                ["entries"] = array,
            };
            return root.ToString(Formatting.Indented).Replace("\r\n", "\n") + "\n";
        }

        /// <summary>Writes the map when its content changed and counts the result.</summary>
        public static void Write(string materialOutDir, IEnumerable<Entry> entries, ImportReport report)
        {
            string assetPath = MapPath(materialOutDir);
            string absolute = KitAssetPaths.ToAbsolute(assetPath);
            string text = Serialize(entries);
            bool existed = File.Exists(absolute);
            if (existed && File.ReadAllText(absolute) == text)
            {
                report.Count(KitAssetKind.MaskMap, KitChange.Unchanged, assetPath);
                return;
            }
            report.Count(KitAssetKind.MaskMap, existed ? KitChange.Updated : KitChange.Created, assetPath);
            if (report.DryRun) return;

            KitAssetPaths.EnsureFolder(materialOutDir);
            File.WriteAllText(absolute, text);
            AssetDatabase.ImportAsset(assetPath, ImportAssetOptions.ForceSynchronousImport);
        }

        /// <summary>Reads a map; a missing or unreadable file gives an empty list (with a warning for unreadable).</summary>
        public static List<Entry> Load(string mapAssetPath)
        {
            var result = new List<Entry>();
            string absolute = KitAssetPaths.ToAbsolute(mapAssetPath);
            if (!File.Exists(absolute)) return result;
            try
            {
                if (!(JObject.Parse(File.ReadAllText(absolute))["entries"] is JArray entries)) return result;
                foreach (JToken token in entries)
                {
                    if (!(token is JObject o)) continue;
                    result.Add(new Entry
                    {
                        PartId = (string)o["part_id"],
                        Lod = o["lod"] != null ? (int)o["lod"] : 0,
                        Slot = (string)o["slot"],
                        MaterialPath = (string)o["material"],
                        MaskPath = (string)o["mask"],
                        MaskB = (string)o["mask_b"],
                    });
                }
            }
            catch (Exception e) when (e is JsonException || e is IOException || e is FormatException || e is InvalidCastException)
            {
                Debug.LogWarning("[MissionForge] " + mapAssetPath + " could not be read: " + e.Message);
            }
            return result;
        }

        /// <summary>The mask variant for a part renderer, or null (use the plain Kit_&lt;slot&gt; material).</summary>
        public static Material FindVariant(string mapAssetPath, string partId, int lod, string slot)
        {
            foreach (Entry e in Load(mapAssetPath))
            {
                if (e.PartId == partId && e.Lod == lod && e.Slot == slot)
                {
                    return AssetDatabase.LoadAssetAtPath<Material>(e.MaterialPath);
                }
            }
            return null;
        }
    }
}
