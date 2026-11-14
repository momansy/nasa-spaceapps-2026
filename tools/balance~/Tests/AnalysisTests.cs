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
    public void Analyze_groups_builds_by_architecture_tuple()
    {
        var result = new ContractResult
        {
            ContractId = "C1",
            ContractName = "Earth Watch",
            BudgetM = 90,
            DeadlineDays = 180,
        };
        result.ValidBuilds.Add(Build("a", 50, 100, 0.9));
        result.ValidBuilds.Add(Build("a", 51, 99, 0.91));
        result.ValidBuilds.Add(Build("b", 55, 110, 0.92));

        BalanceAnalysis.Analyze(result);

        Assert.Equal(2, result.ArchitectureCount);
    }

    private static BuildResult Build(string engine, double cost, double days, double success) => new()
    {
        Architecture = new Architecture(engine, "upper", "expendable", "none"),
        Choices = new[] { new ChoiceResult("first_stage_engine", engine) },
        CostM = cost,
        ScheduleDays = days,
        SuccessEstimate = success,
        MajorCount = 0,
        Variant = "test",
    };
}
