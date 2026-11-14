using MissionForge.Core.Data;

namespace MissionForge.Balance;

public static class BalanceAnalysis
{
    /// <summary>Near-dominance tolerance: within 2% of the best on every axis (brief T012).</summary>
    public const double NearDominantFraction = 0.02;
    /// <summary>Required number of architectures with a valid build (design 17.10, 18.1).</summary>
    public const int RequiredArchitectures = 3;

    private const double Tolerance = 1e-9;

    /// <summary>Finalizes a contract: architecture representatives, Pareto front and dominance flags.</summary>
    public static void Analyze(ContractResult result)
    {
        result.ArchitectureBest = result.BestByArchitecture
            .OrderBy(build => build.Architecture.ToString(), StringComparer.Ordinal)
            .ToList();

        result.ParetoFront = ParetoFront(result.ArchitectureBest)
            .OrderBy(build => build.CostM)
            .ThenBy(build => build.ScheduleDays)
            .ThenByDescending(build => build.SuccessEstimate)
            .ThenBy(build => build.Signature, StringComparer.Ordinal)
            .ToList();

        result.NearDominant = new List<Architecture>();
        if (result.ArchitectureBest.Count > 1)
        {
            var bestCost = result.ArchitectureBest.Min(build => build.CostM);
            var bestDays = result.ArchitectureBest.Min(build => build.ScheduleDays);
            var bestSuccess = result.ArchitectureBest.Max(build => build.SuccessEstimate);
            result.NearDominant = result.ArchitectureBest
                .Where(build => build.CostM <= bestCost * (1 + NearDominantFraction) + Tolerance
                                && build.ScheduleDays <= bestDays * (1 + NearDominantFraction) + Tolerance
                                && build.SuccessEstimate + Tolerance >= bestSuccess * (1 - NearDominantFraction))
                .Select(build => build.Architecture)
                .OrderBy(architecture => architecture.ToString(), StringComparer.Ordinal)
                .ToList();
        }

        result.AllBuildFrontArchitectures = result.AllBuildFront
            .Select(build => build.Architecture)
            .Distinct()
            .OrderBy(architecture => architecture.ToString(), StringComparer.Ordinal)
            .ToList();
    }

    /// <summary>Pareto front on cost ↓, schedule ↓ and displayed success ↑ (weak dominance, strict on one axis).</summary>
    public static IReadOnlyList<BuildResult> ParetoFront(IReadOnlyList<BuildResult> builds) =>
        builds.Where(candidate => !builds.Any(other => !ReferenceEquals(candidate, other) && Dominates(other, candidate)))
            .ToArray();

    public static bool Dominates(BuildResult a, BuildResult b) =>
        a.CostM <= b.CostM + Tolerance
        && a.ScheduleDays <= b.ScheduleDays + Tolerance
        && a.SuccessEstimate + Tolerance >= b.SuccessEstimate
        && (a.CostM < b.CostM - Tolerance
            || a.ScheduleDays < b.ScheduleDays - Tolerance
            || a.SuccessEstimate > b.SuccessEstimate + Tolerance);

    private static bool SameMetrics(BuildResult a, BuildResult b) =>
        Math.Abs(a.CostM - b.CostM) <= Tolerance
        && Math.Abs(a.ScheduleDays - b.ScheduleDays) <= Tolerance
        && Math.Abs(a.SuccessEstimate - b.SuccessEstimate) <= Tolerance;

    /// <summary>Incremental Pareto front of every valid build; identical metrics keep one build per architecture.</summary>
    public static void InsertIntoFront(List<BuildResult> front, BuildResult build)
    {
        foreach (var member in front)
        {
            if (Dominates(member, build)) return;
            if (SameMetrics(member, build) && member.Architecture == build.Architecture) return;
        }
        front.RemoveAll(member => Dominates(build, member));
        front.Add(build);
    }

    /// <summary>
    /// Decision (T012): one representative per architecture, the build with the lowest balanced normalized regret
    /// <c>cost / budget + days / deadline + (1 − displayed success)</c>. Negative when <paramref name="a"/> is better.
    /// </summary>
    public static int CompareRepresentative(BuildResult a, BuildResult b, double budgetM, double deadlineDays)
    {
        var c = BalancedRegret(a, budgetM, deadlineDays).CompareTo(BalancedRegret(b, budgetM, deadlineDays));
        if (c != 0) return c;
        c = b.SuccessEstimate.CompareTo(a.SuccessEstimate);
        if (c != 0) return c;
        c = a.CostM.CompareTo(b.CostM);
        if (c != 0) return c;
        c = a.ScheduleDays.CompareTo(b.ScheduleDays);
        return c != 0 ? c : string.CompareOrdinal(a.Signature, b.Signature);
    }

    /// <summary>Cheapest first, then higher success, then signature.</summary>
    public static int CompareCheapest(BuildResult a, BuildResult b)
    {
        var c = a.CostM.CompareTo(b.CostM);
        if (c != 0) return c;
        c = b.SuccessEstimate.CompareTo(a.SuccessEstimate);
        return c != 0 ? c : string.CompareOrdinal(a.Signature, b.Signature);
    }

    /// <summary>Highest displayed success first, then cheaper, then signature.</summary>
    public static int CompareSafest(BuildResult a, BuildResult b)
    {
        var c = b.SuccessEstimate.CompareTo(a.SuccessEstimate);
        if (c != 0) return c;
        c = a.CostM.CompareTo(b.CostM);
        return c != 0 ? c : string.CompareOrdinal(a.Signature, b.Signature);
    }

    public static double BalancedRegret(BuildResult build, double budgetM, double deadlineDays) =>
        build.CostM / Math.Max(1, budgetM)
        + build.ScheduleDays / Math.Max(1, deadlineDays)
        + (1 - build.SuccessEstimate);

    /// <summary>
    /// Decision (T012): a part "has a reason to exist" (design 18.1) when it appears in a build on the Pareto front
    /// of all valid builds (cost ↓, days ↓, displayed success ↑) of at least one contract. The front of all builds
    /// is used, not only the architecture representatives, because the representative rule favours cheap builds
    /// and would list every premium part as unused.
    /// </summary>
    public static List<UnusedPart> UnusedParts(IReadOnlyList<ContractResult> contracts, GameCatalog catalog)
    {
        var onFront = contracts.SelectMany(contract => contract.AllBuildFront)
            .SelectMany(build => build.Choices).Select(choice => choice.PartId)
            .ToHashSet(StringComparer.Ordinal);
        var offered = contracts.SelectMany(c => c.OfferedPartIds).ToHashSet(StringComparer.Ordinal);
        var valid = contracts.SelectMany(c => c.ValidPartIds).ToHashSet(StringComparer.Ordinal);

        return catalog.PartsInOrder
            .Where(part => !onFront.Contains(part.Id))
            .Select(part => new UnusedPart(part.Id, part.Category, Reason(part)))
            .OrderBy(part => part.Category, StringComparer.Ordinal)
            .ThenBy(part => part.Id, StringComparer.Ordinal)
            .ToList();

        string Reason(PartDef part)
        {
            if (!offered.Contains(part.Id)) return "never offered by an evaluated vote";
            var fill = !IsCoupledCategory(part.Category);
            if (!valid.Contains(part.Id))
                return fill ? "offered, but neither the cheapest nor the most reliable option of its vote in any valid build (fill vote: middle options are not searched)"
                            : "offered, but in no valid build";
            return "in valid builds, but on no all-build Pareto front";
        }
    }

    /// <summary>True when the category fills a propulsion-coupled vote searched exhaustively.</summary>
    public static bool IsCoupledCategory(string category)
    {
        var coupled = new HashSet<string>(SearchEngine.StratumSlots.Concat(SearchEngine.InnerSlots), StringComparer.Ordinal);
        return Slots.ForCategory(category).Any(coupled.Contains);
    }
}
