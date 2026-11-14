using MissionForge.Core.Build;

namespace MissionForge.Balance;

/// <summary>Decision (T012): two builds are meaningfully different when this tuple differs.</summary>
public sealed record Architecture(
    string FirstStageEngine,
    string UpperStageEngine,
    string RecoveryFamily,
    string StrapOn)
{
    public override string ToString() =>
        $"{FirstStageEngine} / {UpperStageEngine} / {RecoveryFamily} / {StrapOn}";
}

public sealed class BuildResult
{
    private string? _signature;

    public required Architecture Architecture { get; init; }
    public required IReadOnlyList<ChoiceResult> Choices { get; init; }
    /// <summary>Displayed total cost, $M (game value).</summary>
    public required double CostM { get; init; }
    /// <summary>Displayed schedule to launch, days (game value).</summary>
    public required double ScheduleDays { get; init; }
    /// <summary>Displayed success estimate, 0–1 (never the hidden truth).</summary>
    public required double SuccessEstimate { get; init; }
    public required int MajorCount { get; init; }
    public required string Variant { get; init; }

    /// <summary>Stable text of every choice, used for deterministic tie-breaks.</summary>
    public string Signature => _signature ??= string.Join("|", Choices.Select(c => c.Slot + "=" + c.PartId));
}

public sealed record ChoiceResult(string Slot, string PartId);

public sealed class ContractResult
{
    private readonly Dictionary<Architecture, BuildResult> _bestByArchitecture = new();
    private readonly List<BuildResult> _allBuildFront = new();

    public required string ContractId { get; init; }
    public required string ContractName { get; init; }
    public required double BudgetM { get; init; }
    public required double DeadlineDays { get; init; }

    // ---- search statistics
    public int Strata { get; set; }
    public int ExhaustiveStrata { get; set; }
    public int SampledStrata { get; set; }
    public int LeavesVisited { get; set; }
    /// <summary>Partial builds checked (Partial-mode validation plus cost and schedule bounds).</summary>
    public long NodeChecks { get; set; }
    public int Evaluated { get; set; }
    public int Valid { get; private set; }
    public bool Capped { get; set; }
    public int PartialBlockerPrunes { get; set; }
    public int CostLowerBoundPrunes { get; set; }
    public int ScheduleLowerBoundPrunes { get; set; }
    public SortedDictionary<string, int> PruneReasons { get; } = new(StringComparer.Ordinal);
    public SortedDictionary<string, int> InvalidReasons { get; } = new(StringComparer.Ordinal);
    public SortedSet<string> OfferedPartIds { get; } = new(StringComparer.Ordinal);
    public SortedSet<string> ValidPartIds { get; } = new(StringComparer.Ordinal);

    // ---- analysis (filled by BalanceAnalysis.Analyze)
    public List<BuildResult> ArchitectureBest { get; set; } = new();
    public List<BuildResult> ParetoFront { get; set; } = new();
    public BuildResult? Cheapest { get; private set; }
    public BuildResult? HighestSuccess { get; private set; }
    public BuildResult? BestReusable { get; private set; }
    public List<Architecture> NearDominant { get; set; } = new();
    /// <summary>Architectures with at least one build on the Pareto front of all valid builds (diagnostic).</summary>
    public List<Architecture> AllBuildFrontArchitectures { get; set; } = new();
    public int AllBuildFrontSize => _allBuildFront.Count;

    public bool Dominant => ParetoFront.Count == 1;
    public int ArchitectureCount => ArchitectureBest.Count;
    public bool ArchitecturePass => ArchitectureCount >= 3;
    public bool DominancePass => !Dominant;
    public bool Pass => ArchitecturePass && DominancePass;

    /// <summary>Lowest displayed cost of any valid build per architecture, $M.</summary>
    public SortedDictionary<string, double> MinCostByArchitecture { get; } = new(StringComparer.Ordinal);
    /// <summary>Fewest schedule days of any valid build per architecture.</summary>
    public SortedDictionary<string, double> MinDaysByArchitecture { get; } = new(StringComparer.Ordinal);

    internal IReadOnlyCollection<BuildResult> BestByArchitecture => _bestByArchitecture.Values;
    internal IReadOnlyList<BuildResult> AllBuildFront => _allBuildFront;

    /// <summary>Records one valid build, keeping only the aggregates the report needs (memory stays bounded).</summary>
    public void Offer(BuildResult build)
    {
        Valid++;
        foreach (var choice in build.Choices) ValidPartIds.Add(choice.PartId);
        var name = build.Architecture.ToString();
        if (!MinCostByArchitecture.TryGetValue(name, out var cost) || build.CostM < cost) MinCostByArchitecture[name] = build.CostM;
        if (!MinDaysByArchitecture.TryGetValue(name, out var days) || build.ScheduleDays < days) MinDaysByArchitecture[name] = build.ScheduleDays;

        if (!_bestByArchitecture.TryGetValue(build.Architecture, out var best)
            || BalanceAnalysis.CompareRepresentative(build, best, BudgetM, DeadlineDays) < 0)
            _bestByArchitecture[build.Architecture] = build;

        if (Cheapest == null || BalanceAnalysis.CompareCheapest(build, Cheapest) < 0) Cheapest = build;
        if (HighestSuccess == null || BalanceAnalysis.CompareSafest(build, HighestSuccess) < 0) HighestSuccess = build;
        if (build.Architecture.RecoveryFamily != "expendable"
            && (BestReusable == null || BalanceAnalysis.CompareSafest(build, BestReusable) < 0))
            BestReusable = build;

        BalanceAnalysis.InsertIntoFront(_allBuildFront, build);
    }
}

public sealed record Recommendation(
    string File,
    string Id,
    string Field,
    string CurrentValue,
    string ProposedValue,
    string Reason);

public sealed record UnusedPart(string Id, string Category, string Reason);

public sealed class BalanceReport
{
    public required string Commit { get; init; }
    public required ulong Seed { get; init; }
    public required int MaxEvalsPerContract { get; init; }
    public required List<ContractResult> Contracts { get; init; }
    public required List<UnusedPart> UnusedParts { get; init; }
    public required List<Recommendation> Recommendations { get; init; }
}

internal static class BuildResultFactory
{
    /// <summary>Recovery family from the booster-recovery option ID (brief: expendable, parachute, propulsive).</summary>
    public static string RecoveryFamily(string? recoveryPartId)
    {
        if (recoveryPartId == null) return "expendable";
        if (recoveryPartId.Contains("propulsive", StringComparison.Ordinal)) return "propulsive";
        if (recoveryPartId.Contains("parachute", StringComparison.Ordinal)) return "parachute";
        return "expendable";
    }

    public static BuildResult From(BuildState build, DashboardMetrics metrics, int majors, string variant)
    {
        string Choice(string slot) => build.Choice(slot) ?? "none";
        return new BuildResult
        {
            Architecture = new Architecture(
                Choice(MissionForge.Core.Data.Slots.FirstStageEngine),
                Choice(MissionForge.Core.Data.Slots.UpperStageEngine),
                RecoveryFamily(build.Choice(MissionForge.Core.Data.Slots.BoosterRecovery)),
                Choice(MissionForge.Core.Data.Slots.StrapOnBoosters)),
            Choices = build.Choices.OrderBy(kv => kv.Key, StringComparer.Ordinal)
                .Select(kv => new ChoiceResult(kv.Key, kv.Value)).ToArray(),
            CostM = metrics.CostM,
            ScheduleDays = metrics.ScheduleDays,
            SuccessEstimate = metrics.Success.Success,
            MajorCount = majors,
            Variant = variant,
        };
    }
}
