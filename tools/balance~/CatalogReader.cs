using MissionForge.Core.Data;

namespace MissionForge.Balance;

internal static class CatalogReader
{
    public static GameCatalog Load(string dataPath)
    {
        var root = Path.GetFullPath(dataPath);
        if (!Directory.Exists(root)) throw new OptionException($"Data directory not found: {root}");

        var files = new SortedDictionary<string, string>(StringComparer.Ordinal);
        foreach (var file in Directory.EnumerateFiles(root, "*.json", SearchOption.AllDirectories)
                     .OrderBy(path => path, StringComparer.Ordinal))
        {
            var relative = Path.GetRelativePath(root, file).Replace('\\', '/');
            if (relative.StartsWith("schema/", StringComparison.Ordinal)) continue;
            files[relative] = File.ReadAllText(file);
        }

        if (!files.ContainsKey("contracts.json"))
            throw new OptionException($"contracts.json was not found under {root}.");
        return CatalogLoader.Load(files, lenient: false);
    }
}
