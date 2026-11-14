using System;
using System.Collections.Generic;
using UnityEditor;
using UnityEngine;

namespace MissionForge.Editor.KitMaterials
{
    /// <summary>
    /// Decides which slot materials of a part get a mask variant. library.json "parts" entries may carry
    /// an optional "slots" list; otherwise the slots are read from the part's imported model
    /// (Art/Models/Kit/&lt;part_id&gt;.fbx, renderer materials named Kit_&lt;slot&gt; or by the FBX slot name).
    /// The decal slot never gets a variant: decal quads have no UV1 mask.
    /// </summary>
    public static class KitPartSlots
    {
        public static List<string> Resolve(KitPartSpec part, KitLibraryData library, ImportReport report)
        {
            var result = new List<string>();
            IEnumerable<string> candidates = part.Slots ?? SlotsFromModel(part.PartId, library);
            if (candidates == null)
            {
                report.Warn("parts." + part.PartId + ": no \"slots\" list and no model at "
                            + ModelPath(part.PartId) + "; no mask variants created.");
                return result;
            }

            foreach (string slot in candidates)
            {
                if (slot == KitSlotSpec.DecalSlot || result.Contains(slot)) continue;
                if (library.FindSlot(slot) == null)
                {
                    report.Warn("parts." + part.PartId + ": slot \"" + slot + "\" is not in \"materials\"; skipped.");
                    continue;
                }
                result.Add(slot);
            }
            result.Sort(StringComparer.Ordinal);
            return result;
        }

        public static string ModelPath(string partId) => RocketKitImport.KitFolder + "/" + partId + ".fbx";

        /// <summary>Slots used by the model's renderers, or null when the model is not imported.</summary>
        private static List<string> SlotsFromModel(string partId, KitLibraryData library)
        {
            var model = AssetDatabase.LoadAssetAtPath<GameObject>(ModelPath(partId));
            if (model == null) return null;

            var slots = new List<string>();
            foreach (Renderer renderer in model.GetComponentsInChildren<Renderer>(true))
            {
                foreach (Material material in renderer.sharedMaterials)
                {
                    string slot = material != null ? MatchSlot(material.name, library) : null;
                    if (slot != null && !slots.Contains(slot)) slots.Add(slot);
                }
            }
            return slots;
        }

        /// <summary>"Kit_engine_metal", "engine_metal.001" and "engine_metal_mat" all map to "engine_metal" (longest match).</summary>
        public static string MatchSlot(string materialName, KitLibraryData library)
        {
            string name = materialName.ToLowerInvariant();
            string prefix = KitMaterialWriter.MaterialPrefix.ToLowerInvariant();
            if (name.StartsWith(prefix, StringComparison.Ordinal)) name = name.Substring(prefix.Length);

            string best = null;
            foreach (KitSlotSpec spec in library.Slots)
            {
                string slot = spec.Slot.ToLowerInvariant();
                if (name.StartsWith(slot, StringComparison.Ordinal) && (best == null || slot.Length > best.Length)) best = spec.Slot;
            }
            return best;
        }
    }
}
