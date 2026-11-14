using MissionForge.Core.Data;

namespace MissionForge.Balance;

public static class BalanceAnalysis
{
    public static void Analyze(ContractResult result)
    {
        result.ArchitectureBest = result.ValidBuilds
            .GroupBy(build => build.Architecture)
            .Select(group => group.OrderBy(build => BalancedRegret(build, result))
                .ThenByDescending(build => build.SuccessEstimate)
                .ThenBy(build => build.CostM)
                .ThenBy(build => build.ScheduleDays)
                .ThenBy(BuildSignature, StringComparer.Ordinal)
                .First())
            .OrderBy(build => build.Architecture.ToString(), StringComparer.Ordinal)
            .ToList();

        result.ParetoFront = ParetoFront(result.ArchitectureBest)
            .OrderBy(build => build.CostM)
            .ThenBy(build => build.ScheduleDays)
            .ThenByDescending(build => build.SuccessEstimate)
            .ThenBy(BuildSignature, StringComparer.Ordinal)
            .ToList();

        result.Cheapest = result.ValidBuilds.OrderBy(build => build.CostM)
            .ThenByDescending(build => build.SuccessEstimate).ThenBy(BuildSignature, StringComparer.Ordinal).FirstOrDefault();
        result.HighestSuccess = result.ValidBuilds.OrderByDescending(build => build.SuccessEstimate)
            .ThenBy(build => build.CostM).ThenBy(BuildSignature, StringComparer.Ordinal).FirstOrDefault();
        result.BestReusable = result.ValidBuilds
            .Where(build => build.Architecture.RecoveryFamily != "expendable")
            .OrderByDescending(build => build.SuccessEstimate).ThenBy(build => build.CostM)
            .ThenBy(BuildSignature, StringComparer.Ordinal).FirstOrDefault();

        if (result.ArchitectureBest.Count > 0)
        {
            var bestCost = result.ArchitectureBest.Min(build => build.CostM);
            var bestDays = result.ArchitectureBest.Min(build => build.ScheduleDays);
            var bestSuccess = result.ArchitectureBest.Max(build => build.SuccessEstimate);
            result.NearDominant = result.ArchitectureBest
                .Where(build => build.CostM <= bestCost * 1.02 + 1e-9
                                && build.ScheduleDays <= bestDays * 1.02 + 1e-9
                                && build.SuccessEstimate + 1e-9 >= bestSuccess * 0.98)
                .Select(build => build.Architecture)
                .Distinct()
                .OrderBy(architecture => architecture.ToString(), StringComparer.Ordinal)
                .ToList();
        }
    }

    public static IReadOnlyList<BuildResult> ParetoFront(IReadOnlyList<BuildResult> builds)
    {
        return builds.Where(candidate => !builds.Any(other => !ReferenceEquals(candidate, other)
            && other.CostM <= candidate.CostM + 1e-9
            && other.ScheduleDays <= candidate.ScheduleDays + 1e-9
            && other.SuccessEstimate + 1e-9 >= candidate.SuccessEstimate
            && (other.CostM < candidate.CostM - 1e-9
                || other.ScheduleDays < candidate.ScheduleDays - 1e-9
                || other.SuccessEstimate > candidate.SuccessEstimate + 1e-9)))
            .ToArray();
    }

    public static List<string> UnusedParts(IEnumerable<ContractResult> contracts, GameCatalog catalog)
    {
        var used = contracts.SelectMany(contract => contract.ParetoFront)
            .SelectMany(build => build.Choices).Select(choice => choice.PartId)
            .ToHashSet(StringComparer.Ordinal);
        return catalog.PartsInOrder.Select(part => part.Id).Where(id => !used.Contains(id))
            .OrderBy(id => id, StringComparer.Ordinal).ToList();
    }

    public static List<Recommendation> Recommend(IReadOnlyList<string> unused, GameCatalog catalog)
    {
        var recommendations = new List<Recommendation>();
        foreach (var id in unused)
        {
            var part = catalog.Part(id);
            var file = $"data/parts/{part.Category}.json";
            if (part.CostM > 0)
            {
                recommendations.Add(new Recommendation(file, id, "game.cost_M",
                    $"{part.CostM:0.###} $M", $"{part.CostM * 0.9:0.###} $M",
                    "Unused on every observed contract Pareto front; test a 10% cost reduction to create a clearer trade-off."));
            }
            else if (part.Reliability.HasValue)
            {
                var proposed = Math.Min(0.999, part.Reliability.Value + 0.005);
                recommendations.Add(new Recommendation(file, id, "game.reliability",
                    $"{part.Reliability.Value:0.####}", $"{proposed:0.####}",
                    "Unused on every observed contract Pareto front; test a +0.5 percentage-point reliability niche."));
            }
            else if (part.LeadDays > 0)
            {
                recommendations.Add(new Recommendation(file, id, "game.lead_days",
                    $"{part.LeadDays:0.###} days", $"{part.LeadDays * 0.9:0.###} days",
                    "Unused on every observed contract Pareto front; test a 10% procurement lead-time reduction."));
            }
            if (recommendations.Count == 12) break;
        }
        return recommendations;
    }

    private static double BalancedRegret(BuildResult build, ContractResult contract) =>
        build.CostM / Math.Max(1, contract.BudgetM)
        + build.ScheduleDays / Math.Max(1, contract.DeadlineDays)
        + (1 - build.SuccessEstimate);

    private static string BuildSignature(BuildResult build) =>
        string.Join("|", build.Choices.Select(choice => choice.Slot + "=" + choice.PartId));
}
