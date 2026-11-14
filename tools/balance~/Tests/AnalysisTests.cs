using Xunit;

namespace MissionForge.Balance.Tests;

public sealed class AnalysisTests
{
    [Fact]
    public void Pareto_front_removes_dominated_builds()
    {
        var cheap = Build("cheap", 10, 20, 0.90);
        var dominated = Build("dominated", 11, 21, 0.89);
        var safe = Build("safe", 14, 22, 0.97);

        var front = BalanceAnalysis.ParetoFront(new[] { cheap, dominated, safe });

        Assert.Contains(cheap, front);
        Assert.Contains(safe, front);
        Assert.DoesNotContain(dominated, front);
    }

    [Fact]
    public void Pareto_front_keeps_equal_builds()
    {
        var a = Build("a", 10, 20, 0.9);
        var b = Build("b", 10, 20, 0.9);
        Assert.Equal(2, BalanceAnalysis.ParetoFront(new[] { a, b }).Count);
    }

    [Fact]
    public void Incremental_front_matches_batch_front()
    {
        var builds = new[]
        {
            Build("a", 10, 30, 0.80), Build("b", 12, 25, 0.85), Build("c", 13, 26, 0.84),
            Build("d", 9, 40, 0.70), Build("e", 20, 20, 0.95), Build("f", 21, 21, 0.94),
        };
        var incremental = new List<BuildResult>();
        foreach (var build in builds) BalanceAnalysis.InsertIntoFront(incremental, build);

        var batch = BalanceAnalysis.ParetoFront(builds);
        Assert.Equal(batch.Select(x => x.Architecture.FirstStageEngine).OrderBy(x => x),
            incremental.Select(x => x.Architecture.FirstStageEngine).OrderBy(x => x));
    }

    [Fact]
    public void Offer_groups_builds_by_architecture_tuple()
    {
        var result = Contract();
        result.Offer(Build("a", 50, 100, 0.9));
        result.Offer(Build("a", 51, 99, 0.91));
        result.Offer(Build("b", 55, 110, 0.92));
        result.Offer(Build("a", 50, 100, 0.9, recovery: "propulsive"));

        BalanceAnalysis.Analyze(result);

        Assert.Equal(4, result.Valid);
        Assert.Equal(3, result.ArchitectureCount);
        Assert.True(result.ArchitecturePass);
    }

    [Fact]
    public void One_architecture_alone_on_the_front_is_dominant()
    {
        var result = Contract();
        result.Offer(Build("best", 40, 90, 0.95));
        result.Offer(Build("worse", 50, 100, 0.90));
        result.Offer(Build("worst", 60, 110, 0.85));

        BalanceAnalysis.Analyze(result);

        Assert.True(result.Dominant);
        Assert.False(result.Pass);
        Assert.Single(result.ParetoFront);
        Assert.Equal("best", result.ParetoFront[0].Architecture.FirstStageEngine);
    }

    [Fact]
    public void Near_dominant_flags_architectures_within_two_percent_on_every_axis()
    {
        var result = Contract();
        result.Offer(Build("cheap", 50, 100, 0.90));
        result.Offer(Build("safe", 50.5, 101, 0.95));
        result.Offer(Build("slow", 50, 150, 0.80));

        BalanceAnalysis.Analyze(result);

        Assert.False(result.Dominant);
        Assert.Equal(new[] { "safe" }, result.NearDominant.Select(a => a.FirstStageEngine));
    }

    [Fact]
    public void Archetypes_pick_cheapest_safest_and_reusable()
    {
        var result = Contract();
        result.Offer(Build("cheap", 40, 120, 0.80));
        result.Offer(Build("safe", 80, 150, 0.97));
        result.Offer(Build("reuse", 60, 130, 0.90, recovery: "parachute"));

        BalanceAnalysis.Analyze(result);

        Assert.Equal("cheap", result.Cheapest!.Architecture.FirstStageEngine);
        Assert.Equal("safe", result.HighestSuccess!.Architecture.FirstStageEngine);
        Assert.Equal("reuse", result.BestReusable!.Architecture.FirstStageEngine);
    }

    [Theory]
    [InlineData("brec_expendable", "expendable")]
    [InlineData("brec_parachute_splashdown", "parachute")]
    [InlineData("brec_propulsive_rtls", "propulsive")]
    [InlineData("brec_propulsive_drone_ship", "propulsive")]
    [InlineData(null, "expendable")]
    public void Recovery_families(string? partId, string family) =>
        Assert.Equal(family, BuildResultFactory.RecoveryFamily(partId));

    private static ContractResult Contract() => new()
    {
        ContractId = "C1",
        ContractName = "Earth Watch",
        BudgetM = 90,
        DeadlineDays = 180,
    };

    private static BuildResult Build(string engine, double cost, double days, double success, string recovery = "expendable") => new()
    {
        Architecture = new Architecture(engine, "upper", recovery, "none"),
        Choices = new[] { new ChoiceResult("first_stage_engine", engine), new ChoiceResult("cost", cost.ToString("R")) },
        CostM = cost,
        ScheduleDays = days,
        SuccessEstimate = success,
        MajorCount = 0,
        Variant = "test",
    };
}
