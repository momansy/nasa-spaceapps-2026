using System.Collections.Generic;

namespace MissionForge.Editor.KitMaterials
{
    /// <summary>What one asset did during an import run.</summary>
    public enum KitChange
    {
        Created,
        Updated,
        Unchanged,
    }

    /// <summary>Kinds of asset the importer writes (for the per-kind counters).</summary>
    public enum KitAssetKind
    {
        Texture,
        Material,
        MaskMap,
    }

    /// <summary>
    /// Result of <see cref="KitMaterialLibraryImporter.Import"/>. Problems with the input (missing files,
    /// bad values) are reported here as errors or warnings, never thrown.
    /// </summary>
    public sealed class ImportReport
    {
        public ImportReport(string libraryPath, bool dryRun)
        {
            LibraryPath = libraryPath;
            DryRun = dryRun;
        }

        public string LibraryPath { get; }
        public bool DryRun { get; }

        public int Created { get; private set; }
        public int Updated { get; private set; }
        public int Unchanged { get; private set; }

        public int TexturesCreated { get; private set; }
        public int TexturesUpdated { get; private set; }
        public int MaterialsCreated { get; private set; }
        public int MaterialsUpdated { get; private set; }

        public List<string> Errors { get; } = new List<string>();
        public List<string> Warnings { get; } = new List<string>();

        /// <summary>Asset paths touched (created or updated) in this run, for logs and tests.</summary>
        public List<string> ChangedAssets { get; } = new List<string>();

        public bool HasErrors => Errors.Count > 0;

        public void Error(string message) => Errors.Add(message);

        public void Warn(string message) => Warnings.Add(message);

        public void Count(KitAssetKind kind, KitChange change, string assetPath)
        {
            switch (change)
            {
                case KitChange.Created:
                    Created++;
                    if (kind == KitAssetKind.Texture) TexturesCreated++;
                    if (kind == KitAssetKind.Material) MaterialsCreated++;
                    ChangedAssets.Add(assetPath);
                    break;
                case KitChange.Updated:
                    Updated++;
                    if (kind == KitAssetKind.Texture) TexturesUpdated++;
                    if (kind == KitAssetKind.Material) MaterialsUpdated++;
                    ChangedAssets.Add(assetPath);
                    break;
                default:
                    Unchanged++;
                    break;
            }
        }

        /// <summary>One-line summary used by the log and the batch entry points.</summary>
        public string Summary =>
            "[MissionForge] Kit material library" + (DryRun ? " (dry run)" : "") + ": "
            + Created + " created, " + Updated + " updated, " + Unchanged + " unchanged "
            + "(textures " + TexturesCreated + "/" + TexturesUpdated + ", materials "
            + MaterialsCreated + "/" + MaterialsUpdated + " created/updated); "
            + Errors.Count + " error(s), " + Warnings.Count + " warning(s). Source: " + LibraryPath;
    }
}
