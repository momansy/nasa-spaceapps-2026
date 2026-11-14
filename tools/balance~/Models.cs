using MissionForge.Core.Build;

namespace MissionForge.Balance;

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
    public required Architecture Architecture { get; init; }
    public required IReadOnlyList<ChoiceResult> Choices { get; init; }
    public required double CostM { get; init; }
    public required double ScheduleDays { get; init; }
    public required double SuccessEstimate { get; init; }
    public required int MajorCount { get; init; }
    public required string Variant { get; init; }
}

public sealed record ChoiceResult(string Slot, string PartId);

public sealed class ContractResult
{
    public required string ContractId { get; init; }
    public required string ContractName { get; init; }
    public required double BudgetM { get; init; }
    public required double DeadlineDays { get; init; }
    public int Evaluated { get; set; }
    public int Valid { get; set; }
    public bool Capped { get; set; }
    public int PartialBlockerPrunes { get; set; }
    public int CostLowerBoundPrunes { get; set; }
    public List<BuildResult> ValidBuilds { get; } = new();
    public List<BuildResult> ArchitectureBest { get; set; } = new();
    public List<BuildResult> ParetoFront { get; set; } = new();
    public BuildResult? Cheapest { get; set; }
    public BuildResult? HighestSuccess { get; set; }
    public BuildResult? BestReusable { get; set; }
    public bool Dominant => ParetoFront.Count == 1;
    public List<Architecture> NearDominant { get; set; } = new();
    public int ArchitectureCount => ArchitectureBest.Count;
    public bool ArchitecturePass => ArchitectureCount >= 3;
    public bool DominancePass => !Dominant;
    public bool Pass => ArchitecturePass && DominancePass;
}

public sealed record Recommendation(
    string File,
    string PartId,
    string Field,
    string CurrentValue,
    string ProposedValue,
    string Reason);

public sealed class BalanceReport
{
    public required string Commit { get; init; }
    public required ulong Seed { get; init; }
    public required int MaxEvalsPerContract { get; init; }
    public required List<ContractResult> Contracts { get; init; }
    public required List<string> UnusedPartIds { get; init; }
    public required List<Recommendation> Recommendations { get; init; }
}

internal static class BuildResultFactory
{
    public static BuildResult From(BuildState build, DashboardMetrics metrics, int majors, string variant)
    {
        string Choice(string slot) => build.Choice(slot) ?? "none";
        var recovery = Choice(MissionForge.Core.Data.Slots.BoosterRecovery);
        var family = recovery.Contains("propulsive", StringComparison.Ordinal) ? "propulsive"
            : recovery.Contains("parachute", StringComparison.Ordinal) ? "parachute"
            : "expendable";
        return new BuildResult
        {
            Architecture = new Architecture(
                Choice(MissionForge.Core.Data.Slots.FirstStageEngine),
                Choice(MissionForge.Core.Data.Slots.UpperStageEngine),
                family,
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
