using MissionForge.Core.Build;
using MissionForge.Core.Data;
using Xunit;

namespace MissionForge.Balance.Tests;

public sealed class ReducedC1SearchTests
{
    private static readonly string[] Coupled =
    {
        Slots.LaunchSite, Slots.Capsule, Slots.Lander, Slots.HeatShield, Slots.LaunchEscape,
        Slots.Fairing, Slots.UpperStageEngine, Slots.UpperStageEngineCount, Slots.UpperStageTank,
        Slots.StageSeparation, Slots.FirstStageEngine, Slots.FirstStageEngineCount, Slots.FirstStageTank,
        Slots.StructuralMaterial, Slots.StrapOnBoosters, Slots.BoosterRecovery,
    };

    [Fact]
    public void Reduced_C1_search_valid_count_matches_brute_force()
    {
        var catalog = LoadCatalog();
        var contract = catalog.Contract("C1");
        var searched = new SearchEngine(catalog, 100, 1, optionLimit: 1).Search(contract);
        var bruteValid = BruteForceSingleOption(contract, catalog);

        Assert.Equal(bruteValid, searched.Valid);
        Assert.False(searched.Capped);
    }

    private static int BruteForceSingleOption(ContractDef contract, GameCatalog catalog)
    {
        var votes = VoteOptions.VotesFor(contract);
        var build = BuildState.New(contract.Id, 1);
        foreach (var slot in Coupled.Where(slot => votes.Any(vote => vote.Slot == slot)))
        {
            var option = VoteOptions.Offered(build, catalog, slot).FirstOrDefault();
            if (option == null) return 0;
            build = build.WithChoice(slot, option.Id);
        }
        foreach (var vote in votes)
        {
            if (build.Has(vote.Slot)) continue;
            var option = VoteOptions.Offered(build, catalog, vote.Slot).FirstOrDefault();
            if (option == null) return 0;
            build = build.WithChoice(vote.Slot, option.Id);
        }

        var metrics = Dashboard.Compute(build, catalog);
        var valid = !Validator.HasBlocker(Validator.Validate(build, catalog, ValidationMode.Complete))
                    && metrics.Budget.RemainingM >= -1e-9
                    && metrics.Budget.TotalDays <= metrics.Budget.DeadlineDays + 1e-9;
        return valid ? 1 : 0;
    }

    private static GameCatalog LoadCatalog()
    {
        var root = Directory.GetCurrentDirectory();
        while (!File.Exists(Path.Combine(root, "data", "contracts.json")))
        {
            root = Directory.GetParent(root)?.FullName
                   ?? throw new DirectoryNotFoundException("Repository data directory not found.");
        }
        var data = Path.Combine(root, "data");
        var files = Directory.EnumerateFiles(data, "*.json", SearchOption.AllDirectories)
            .Where(file => !Path.GetRelativePath(data, file).Replace('\\', '/').StartsWith("schema/", StringComparison.Ordinal))
            .OrderBy(file => file, StringComparer.Ordinal)
            .ToDictionary(file => Path.GetRelativePath(data, file).Replace('\\', '/'), File.ReadAllText, StringComparer.Ordinal);
        return CatalogLoader.Load(files);
    }
}
