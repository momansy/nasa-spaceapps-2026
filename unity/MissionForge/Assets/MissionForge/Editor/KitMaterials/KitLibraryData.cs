using System.Collections.Generic;
using UnityEngine;

namespace MissionForge.Editor.KitMaterials
{
    /// <summary>How a texture is used; decides its import settings.</summary>
    public enum KitTextureRole
    {
        Albedo, // sRGB
        Normal, // TextureImporterType.NormalMap, OpenGL +Y
        Orm,    // linear: R occlusion, G roughness, B metallic
        Mask,   // linear UV1 part mask: R AO, G edge wear, B heat or frost, A cavity
    }

    /// <summary>One texture reference from library.json, resolved against the library folder.</summary>
    public sealed class KitTextureRef
    {
        public KitTextureRef(string field, string relativePath, string sourcePath, KitTextureRole role, bool exists)
        {
            Field = field;
            RelativePath = relativePath;
            SourcePath = sourcePath;
            Role = role;
            Exists = exists;
        }

        /// <summary>JSON location for messages, e.g. "materials.hull.albedo".</summary>
        public string Field { get; }
        public string RelativePath { get; }
        /// <summary>Absolute source path (null when the path was rejected).</summary>
        public string SourcePath { get; }
        public KitTextureRole Role { get; }
        /// <summary>False when the file is missing; an error is already in the report.</summary>
        public bool Exists { get; }
    }

    /// <summary>One entry of library.json "materials" (a kit material slot). All values are game_value.</summary>
    public sealed class KitSlotSpec
    {
        public const string DecalSlot = "decal";
        public const string TrimSlot = "trim";

        public KitSlotSpec(string slot) => Slot = slot;

        public string Slot { get; }
        public KitTextureRef Albedo { get; set; }
        public KitTextureRef Normal { get; set; }
        public KitTextureRef Orm { get; set; }
        /// <summary>Metres per texture repeat on the metric UV0.</summary>
        public float TilingM { get; set; } = 1f;
        /// <summary>sRGB tint (gamma-space colour, as Material.SetColor expects).</summary>
        public Color Tint { get; set; } = Color.white;
        /// <summary>(min, max) or null when absent.</summary>
        public Vector2? Metallic { get; set; }
        public Vector2? Roughness { get; set; }
        public float NormalStrength { get; set; } = 1f;
        public bool Hero { get; set; }
        public float AlphaCutoff { get; set; } = 0.5f;

        public bool IsDecal => Slot == DecalSlot;
    }

    /// <summary>One entry of library.json "parts": the UV1 bake masks of a kit part.</summary>
    public sealed class KitPartSpec
    {
        public KitPartSpec(string partId) => PartId = partId;

        public string PartId { get; }
        public KitTextureRef Lod0Mask { get; set; }
        public KitTextureRef Lod1Mask { get; set; }
        public int MaskResolution { get; set; } = 2048;
        /// <summary>True when mask B is frost (tanks), false for heat (engines).</summary>
        public bool MaskBIsFrost { get; set; }
        /// <summary>Optional explicit slot list; null means "derive from the imported model".</summary>
        public List<string> Slots { get; set; }

        public KitTextureRef MaskFor(int lod) => lod == 0 ? Lod0Mask : Lod1Mask;
    }

    /// <summary>Parsed and validated library.json (version 1).</summary>
    public sealed class KitLibraryData
    {
        public KitLibraryData(string rootDirectory) => RootDirectory = rootDirectory;

        /// <summary>Folder holding library.json; texture paths are relative to it.</summary>
        public string RootDirectory { get; }
        public List<KitSlotSpec> Slots { get; } = new List<KitSlotSpec>();
        public List<KitPartSpec> Parts { get; } = new List<KitPartSpec>();

        public KitSlotSpec FindSlot(string slot)
        {
            foreach (KitSlotSpec s in Slots)
            {
                if (s.Slot == slot) return s;
            }
            return null;
        }
    }
}
