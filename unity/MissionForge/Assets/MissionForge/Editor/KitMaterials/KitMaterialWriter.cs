using UnityEditor;
using UnityEngine;

namespace MissionForge.Editor.KitMaterials
{
    /// <summary>Textures resolved for one slot (null = not provided or not importable).</summary>
    public sealed class KitSlotTextures
    {
        public Texture2D Albedo;
        public Texture2D Normal;
        public Texture2D Orm;
        /// <summary>True when the library named a map but it could not be imported: leave that property alone.</summary>
        public bool AlbedoFailed, NormalFailed, OrmFailed;
    }

    /// <summary>
    /// Creates or updates <c>Kit_&lt;slot&gt;.mat</c> and the per-part mask variants
    /// <c>Kit_&lt;slot&gt;__&lt;part&gt;[__lod1].mat</c>. Existing assets are always edited in place so their
    /// GUIDs (and every FBX, prefab and scene reference) survive; nothing is deleted.
    /// </summary>
    public static class KitMaterialWriter
    {
        public const string LitShaderName = "MissionForge/KitLit";
        public const string DecalShaderName = "MissionForge/KitDecal";
        public const string MaterialPrefix = "Kit_";
        public const string VariantSeparator = "__";
        public const string Lod1Suffix = "__lod1";

        // Shader properties (Art/Shaders/Kit/MF_KitInput.hlsl).
        public const string BaseMap = "_BaseMap";
        public const string BaseColor = "_BaseColor";
        public const string BumpMap = "_BumpMap";
        public const string BumpScale = "_BumpScale";
        public const string OrmMap = "_OrmMap";
        public const string Metallic = "_Metallic";
        public const string Smoothness = "_Smoothness";
        public const string MetallicRange = "_MetallicRange";
        public const string RoughnessRange = "_RoughnessRange";
        public const string Tiling = "_Tiling";
        public const string Cutoff = "_Cutoff";
        public const string PartMask = "_PartMask";
        public const string MaskBIsFrost = "_MaskB_IsFrost";

        // Flat fallbacks when library.json gives no range (game_value, matching the URP Lit defaults).
        private const float DefaultFlatMetallic = 0f;
        private const float DefaultFlatRoughness = 0.5f;

        public static string SlotMaterialPath(string materialOutDir, string slot) =>
            materialOutDir + "/" + MaterialPrefix + slot + ".mat";

        public static string VariantMaterialPath(string materialOutDir, string slot, string partId, int lod) =>
            materialOutDir + "/" + MaterialPrefix + slot + VariantSeparator + partId + (lod == 0 ? "" : Lod1Suffix) + ".mat";

        /// <summary>Creates or updates the slot material. Returns it (null in a dry run when it does not exist yet).</summary>
        public static Material WriteSlot(KitSlotSpec spec, KitSlotTextures textures, Shader shader, string materialOutDir, ImportReport report)
        {
            string path = SlotMaterialPath(materialOutDir, spec.Slot);
            if (!TryLoadOrCreate(path, shader, null, report, out Material material, out bool created)) return null;
            if (material == null) return null; // Dry run, would be created.

            var edit = new KitMaterialEdit(material, !report.DryRun);
            edit.SetShader(shader);
            edit.UseShaderRenderQueue();
            if (!textures.AlbedoFailed) edit.SetTexture(BaseMap, textures.Albedo);
            if (!textures.NormalFailed) edit.SetTexture(BumpMap, textures.Normal);
            if (!textures.OrmFailed) edit.SetTexture(OrmMap, textures.Orm);
            edit.SetColor(BaseColor, spec.Tint);
            edit.SetFloat(BumpScale, spec.NormalStrength);
            edit.SetFloat(Tiling, spec.IsDecal ? 1f : spec.TilingM);

            Vector2 metallic = spec.Metallic ?? new Vector2(0f, 1f);
            Vector2 roughness = spec.Roughness ?? new Vector2(0f, 1f);
            bool hasOrm = textures.Orm != null
                          || (textures.OrmFailed && material.HasProperty(OrmMap) && material.GetTexture(OrmMap) != null);
            // With an ORM map the maps drive the values (multipliers neutral, ranges clamp).
            // Without one the flat values are the range midpoints (see README "ORM defaults").
            float flatMetallic = spec.Metallic.HasValue ? Mid(metallic) : DefaultFlatMetallic;
            float flatRoughness = spec.Roughness.HasValue ? Mid(roughness) : DefaultFlatRoughness;
            edit.SetFloat(Metallic, hasOrm ? 1f : flatMetallic);
            edit.SetFloat(Smoothness, hasOrm ? 0f : 1f - flatRoughness);
            edit.SetVector(MetallicRange, new Vector4(metallic.x, metallic.y, 0f, 0f));
            edit.SetVector(RoughnessRange, new Vector4(roughness.x, roughness.y, 0f, 0f));
            if (spec.IsDecal) edit.SetFloat(Cutoff, spec.AlphaCutoff);

            Finish(material, path, created, edit.Changed, report);
            return material;
        }

        /// <summary>Creates or updates a mask variant of <paramref name="parent"/> that overrides only _PartMask (and _MaskB_IsFrost for frost).</summary>
        public static Material WriteVariant(Material parent, string variantPath, Texture2D mask, bool maskBIsFrost, ImportReport report)
        {
            if (parent == null) return null;
            if (!TryLoadOrCreate(variantPath, parent.shader, parent, report, out Material variant, out bool created)) return null;
            if (variant == null) return null; // Dry run, would be created.

            var edit = new KitMaterialEdit(variant, !report.DryRun);
            edit.SetParent(parent);
            edit.SetTexture(PartMask, mask);
            edit.SetFloat(MaskBIsFrost, maskBIsFrost ? 1f : 0f);
            Finish(variant, variantPath, created, edit.Changed, report);
            return variant;
        }

        private static bool TryLoadOrCreate(string path, Shader shader, Material parent, ImportReport report,
                                            out Material material, out bool created)
        {
            created = false;
            material = null;
            Object existing = AssetDatabase.LoadMainAssetAtPath(path);
            if (existing != null)
            {
                material = existing as Material;
                if (material != null) return true;
                report.Error(path + " exists but is not a Material; left untouched.");
                return false;
            }

            created = true;
            if (report.DryRun)
            {
                report.Count(KitAssetKind.Material, KitChange.Created, path);
                return true; // material stays null
            }

            // The new material stays in memory until Finish has applied every value: writing the asset
            // first and editing it afterwards let a later import in the same editor session reload the
            // creation-time defaults (non-idempotent re-runs). A variant starts as a copy of its parent and
            // is then parented, so un-overridden properties keep following the parent.
            material = parent != null ? new Material(parent) : new Material(shader);
            material.name = System.IO.Path.GetFileNameWithoutExtension(path);
            if (parent != null) material.parent = parent;
            return true;
        }

        private static void Finish(Material material, string path, bool created, bool changed, ImportReport report)
        {
            if (created)
            {
                KitAssetPaths.EnsureFolder(System.IO.Path.GetDirectoryName(path).Replace('\\', '/'));
                AssetDatabase.CreateAsset(material, path);
                report.Count(KitAssetKind.Material, KitChange.Created, path);
                return;
            }
            if (changed && !report.DryRun) EditorUtility.SetDirty(material);
            report.Count(KitAssetKind.Material, changed ? KitChange.Updated : KitChange.Unchanged, path);
        }

        private static float Mid(Vector2 range) => 0.5f * (range.x + range.y);
    }
}
