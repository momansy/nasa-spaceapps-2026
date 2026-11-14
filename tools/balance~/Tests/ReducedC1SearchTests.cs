using MissionForge.Core.Build;
using MissionForge.Core.Data;
using Xunit;

namespace MissionForge.Balance.Tests;

public sealed class ReducedC1SearchTests
{
    /// <summary>
    /// With the first two offered options of every vote, the pruned depth-first search must find exactly the
    /// valid builds that a brute-force walk over every combination (no pruning) finds.
    /// </summary>
    [Theory]
    [InlineData("C1")]
    [InlineData("C3")]
    public void Reduced_pruned_search_matches_brute_force(string contractId)
    {
        var catalog = TestCatalog.Load();
        var contract = catalog.Contract(contractId);
        var engine = new SearchEngine(catalog, 10_000_000, 1, optionLimit: 2);
        var searched = engine.Search(contract);

        var brute = new SearchEngine(catalog, 10_000_000, 1, optionLimit: 2);
        var (leaves, evaluated, valid, cheapestCost) = BruteForce(contract, brute);

        Assert.False(searched.Capped);
        Assert.Equal(0, searched.SampledStrata);
        Assert.Equal(valid, searched.Valid);
        Assert.True(valid > 0, "the reduced option set should still contain valid builds");
        Assert.True(searched.Evaluated <= evaluated, "pruning never evaluates more builds than brute force");
        Assert.True(searched.LeavesVisited < leaves, "pruning should remove at least one branch");
        Assert.NotNull(searched.Cheapest);
        Assert.Equal(cheapestCost, searched.Cheapest!.CostM, 9);
    }

    [Fact]
    public void Search_is_deterministic()
    {
        var catalog = TestCatalog.Load();
        var contract = catalog.Contract("C1");
        var a = new SearchEngine(catalog, 4000, 7).Search(contract);
        var b = new SearchEngine(catalog, 4000, 7).Search(contract);
        BalanceAnalysis.Analyze(a);
        BalanceAnalysis.Analyze(b);

        Assert.True(a.Capped);
        Assert.Equal(a.Evaluated, b.Evaluated);
        Assert.Equal(a.Valid, b.Valid);
        Assert.Equal(a.ArchitectureBest.Select(x => x.Signature), b.ArchitectureBest.Select(x => x.Signature));
        Assert.True(a.Evaluated <= 4000);
    }

    private static (int Leaves, int Evaluated, int Valid, double CheapestCost) BruteForce(ContractDef contract, SearchEngine engine)
    {
        var coupled = engine.CoupledSlots(contract);
        int leaves = 0, evaluated = 0, valid = 0;
        var cheapest = double.MaxValue;

        void Count(BuildState build)
        {
            if (!engine.IsValid(build, out var metrics, out _)) return;
            valid++;
            cheapest = Math.Min(cheapest, metrics.CostM);
        }

        void Walk(BuildState build, int depth)
        {
            if (depth == coupled.Count)
            {
                leaves++;
                var cheap = engine.Fill(build, reliable: false);
                var reliable = engine.Fill(build, reliable: true);
                var same = cheap.Choices.All(kv => reliable.Choice(kv.Key) == kv.Value);
                evaluated++;
                Count(cheap);
                if (!same)
                {
                    evaluated++;
                    Count(reliable);
                }
                return;
            }
            foreach (var part in engine.OfferedOptions(build, coupled[depth]))
                Walk(build.WithChoice(coupled[depth], part.Id), depth + 1);
        }

        Walk(BuildState.New(contract.Id, 1), 0);
        return (leaves, evaluated, valid, cheapest);
    }
}

internal static class TestCatalog
{
    private static GameCatalog? _catalog;

    public static GameCatalog Load()
    {
        if (_catalog != null) return _catalog;
        var root = Directory.GetCurrentDirectory();
        while (!File.Exists(Path.Combine(root, "data", "contracts.json")))
        {
            root = Directory.GetParent(root)?.FullName
                   ?? throw new DirectoryNotFoundException("Repository data directory not found.");
        }
        var data = Path.Combine(root, "data");
        var files = Directory.EnumerateFiles(data, "*.json", SearchOption.AllDirectories)
            .Select(file => (File: file, Relative: Path.GetRelativePath(data, file).Replace('\\', '/')))
            .Where(item => !item.Relative.StartsWith("schema/", StringComparison.Ordinal))
            .OrderBy(item => item.Relative, StringComparer.Ordinal)
            .ToDictionary(item => item.Relative, item => File.ReadAllText(item.File), StringComparer.Ordinal);
        _catalog = CatalogLoader.Load(files);
        return _catalog;
    }
}
