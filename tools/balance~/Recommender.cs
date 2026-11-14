using System.Globalization;
using MissionForge.Core.Build;
using MissionForge.Core.Data;

namespace MissionForge.Balance;

/// <summary>
/// Turns a balance run into recommended data changes (brief T012 step 6). Recommendations only: nothing here
/// writes to <c>data/</c>. Every rule is derived from numbers of the run so the reason can be checked.
/// </summary>
public static class Recommender
{
    /// <summary>A budget or deadline is "never binding" when the safest valid build uses less than this fraction. game_value.</summary>
    public const double NonBindingFraction = 0.8;
    /// <summary>Proposed budget or deadline as a fraction of the safest build's cost or days, so it no longer fits. game_value.</summary>
    public const double TighteningFraction = 0.9;
    /// <summary>Displayed success at or above which the success axis no longer separates builds. game_value.</summary>
    public const double SaturatedSuccess = 0.999;

    public static List<Recommendation> Recommend(
        IReadOnlyList<ContractResult> contracts, IReadOnlyList<UnusedPart> unused, GameCatalog catalog, ulong seed)
    {
        var list = new List<Recommendation>();
        list.AddRange(FailingContracts(contracts, catalog));
        list.AddRange(TruncatedVotes(unused, catalog));
        list.AddRange(AssuranceSaturation(contracts, catalog, seed));
        list.AddRange(NonBindingLimits(contracts));
        list.AddRange(UnusedCoupledParts(contracts, unused, catalog));
        list.AddRange(DominatedFillParts(unused, catalog));
        return list;
    }

    // ---- 1. Contracts that fail a rule
    private static IEnumerable<Recommendation> FailingContracts(IReadOnlyList<ContractResult> contracts, GameCatalog catalog)
    {
        foreach (var c in contracts.Where(c => !c.Pass))
        {
            if (c.Dominant)
            {
                var lone = c.ParetoFront[0];
                yield return new Recommendation("data/contracts.json", c.ContractId, "(dominant architecture)",
                    lone.Architecture.ToString(), "make a second architecture competitive",
                    $"Only `{lone.Architecture}` is on the Pareto front ({Money(lone.CostM)}, {Days(lone.ScheduleDays)}, {Pct(lone.SuccessEstimate)}). " +
                    "Lower the cost or lead time of the runner-up's first-stage engine, or raise the dominant engine's cost.");
                continue;
            }
            var needed = c.MinCostByArchitecture.Values.OrderBy(x => x).Skip(2).Cast<double?>().FirstOrDefault();
            var reasons = string.Join(", ", c.InvalidReasons.Concat(c.PruneReasons).OrderByDescending(kv => kv.Value).Take(3)
                .Select(kv => $"{kv.Key} {kv.Value}"));
            yield return new Recommendation("data/contracts.json", c.ContractId, "budget_M / schedule_days / votes",
                $"{Num(c.BudgetM)} $M, {Num(c.DeadlineDays)} days", needed.HasValue ? $"review (3rd architecture at {Money(needed.Value)})" : "review",
                $"Only {c.ArchitectureCount} architectures have a valid build (need {BalanceAnalysis.RequiredArchitectures}). Most frequent rejections: {reasons}.");
        }
    }

    // ---- 2. Parts never offered because a vote shows at most VoteOptions.MaxOptions options
    private static IEnumerable<Recommendation> TruncatedVotes(IReadOnlyList<UnusedPart> unused, GameCatalog catalog)
    {
        foreach (var u in unused.Where(u => u.Reason.StartsWith("never offered", StringComparison.Ordinal)))
        {
            var part = catalog.Part(u.Id);
            var truncated = new List<string>();
            foreach (var contract in catalog.Contracts.Values.OrderBy(c => c.Id, StringComparer.Ordinal))
            {
                if (!part.OfferedFor(contract.Id)) continue;
                foreach (var vote in VoteOptions.VotesFor(contract).Where(v => v.OptionIds.Contains(u.Id) && v.AcceptsStage(part)))
                {
                    var eligible = vote.OptionIds.Select(catalog.Part)
                        .Where(p => p.OfferedFor(contract.Id) && vote.AcceptsStage(p)).Select(p => p.Id).ToList();
                    var index = eligible.IndexOf(u.Id);
                    if (index >= VoteOptions.MaxOptions && !vote.ExplicitOptions)
                        truncated.Add($"{contract.Id} (position {index + 1} of {eligible.Count})");
                }
            }
            if (truncated.Count == 0)
            {
                yield return new Recommendation($"data/parts/{part.Category}.json", u.Id, "contracts",
                    "no contract offers it", "list the contracts that should offer it",
                    "No evaluated vote offers this part, so it can never be chosen.");
                continue;
            }
            yield return new Recommendation("data/contracts.json", string.Join(", ", truncated.Select(t => t.Split(' ')[0])),
                $"votes[{Slots.ForCategory(part.Category).FirstOrDefault() ?? part.Category}].options",
                "none (all category parts, first 5 shown)", $"explicit list that includes `{u.Id}`",
                $"`{u.Id}` is offered for these contracts but is cut by the {VoteOptions.MaxOptions}-option limit of design 6.2 " +
                $"({string.Join("; ", truncated)}), so players never see it. Give the vote an explicit options list " +
                $"(or move the part earlier in data/parts/{part.Category}.json).");
        }
    }

    // ---- 3. Mission assurance that pushes displayed success to the cap
    private static IEnumerable<Recommendation> AssuranceSaturation(IReadOnlyList<ContractResult> contracts, GameCatalog catalog, ulong seed)
    {
        var lifted = new List<(string Contract, string Part, double With, double Without)>();
        foreach (var c in contracts)
        {
            var top = c.HighestSuccess;
            if (top == null || top.SuccessEstimate < SaturatedSuccess) continue;
            var assurance = top.Choices.FirstOrDefault(x => x.Slot == Slots.MissionAssurance);
            if (assurance == null) continue;
            var bonusPart = catalog.Part(assurance.PartId);
            if (bonusPart.Stats.ReliabilityBonus <= 0) continue;
            var build = BuildState.New(c.ContractId, seed);
            foreach (var choice in top.Choices)
                build = build.WithChoice(choice.Slot, choice.Slot == Slots.MissionAssurance ? NeutralAssurance(catalog, build, c.ContractId) ?? choice.PartId : choice.PartId);
            var without = Dashboard.Compute(build, catalog).Success.Success;
            lifted.Add((c.ContractId, assurance.PartId, top.SuccessEstimate, without));
        }
        foreach (var group in lifted.GroupBy(x => x.Part))
        {
            var part = catalog.Part(group.Key);
            if (group.Count() < 3) continue;
            var bonus = part.Stats.ReliabilityBonus;
            var detail = string.Join("; ", group.Select(x => $"{x.Contract} {Pct(x.Without)} → {Pct(x.With)}"));
            yield return new Recommendation($"data/parts/{part.Category}.json", group.Key, "modifiers[reliability add].value",
                Num(bonus), Num(bonus / 2),
                $"The safest build of {group.Count()} contracts reaches ≥ {Pct(SaturatedSuccess)} displayed success only through this +{Num(bonus)} per-part bonus, " +
                $"which lifts most parts to the {Pct(BuildConstants.MaxReliability)} cap, so the expensive-and-safe archetype looks the same everywhere " +
                $"(displayed success without → with it: {detail}). Halving the bonus keeps the trade-off visible.");
        }
    }

    private static string? NeutralAssurance(GameCatalog catalog, BuildState build, string contractId)
    {
        var offered = VoteOptions.Offered(build, catalog, Slots.MissionAssurance);
        return offered.FirstOrDefault(p => p.Stats.ReliabilityBonus == 0 && p.Stats.CostFraction == 0)?.Id;
    }

    // ---- 4. Budgets and deadlines that never bind
    private static IEnumerable<Recommendation> NonBindingLimits(IReadOnlyList<ContractResult> contracts)
    {
        foreach (var c in contracts)
        {
            var top = c.HighestSuccess;
            if (top == null) continue;
            if (top.CostM < NonBindingFraction * c.BudgetM)
            {
                var proposed = RoundUp(TighteningFraction * top.CostM, 5);
                var fit = c.MinCostByArchitecture.Values.Count(x => x <= proposed + 1e-9);
                if (fit >= BalanceAnalysis.RequiredArchitectures)
                    yield return new Recommendation("data/contracts.json", c.ContractId, "budget_M", Num(c.BudgetM), Num(proposed),
                        $"The budget never binds: the safest valid build costs {Money(top.CostM)} ({Pct(top.CostM / c.BudgetM)} of the budget) and the cheapest {Money(c.Cheapest!.CostM)}. " +
                        $"At {Money(proposed)} the safest configuration no longer fits while {fit} architectures still do. " +
                        "Keep headroom for tests, anomalies and reviews during the build (not modeled here) before applying.");
            }
            if (top.ScheduleDays < NonBindingFraction * c.DeadlineDays)
            {
                var proposed = RoundUp(TighteningFraction * top.ScheduleDays, 5);
                var fit = c.MinDaysByArchitecture.Values.Count(x => x <= proposed + 1e-9);
                if (fit >= BalanceAnalysis.RequiredArchitectures)
                    yield return new Recommendation("data/contracts.json", c.ContractId, "schedule_days", Num(c.DeadlineDays), Num(proposed),
                        $"The deadline never binds: the safest valid build launches on day {Num(top.ScheduleDays)} ({Pct(top.ScheduleDays / c.DeadlineDays)} of the deadline). " +
                        $"At {Days(proposed)} it would slip while {fit} architectures still make it. Keep headroom for test days (not modeled here).");
            }
        }
    }

    // ---- 5. Propulsion-coupled parts that are valid but never on a front
    private static IEnumerable<Recommendation> UnusedCoupledParts(
        IReadOnlyList<ContractResult> contracts, IReadOnlyList<UnusedPart> unused, GameCatalog catalog)
    {
        foreach (var u in unused.Where(u => BalanceAnalysis.IsCoupledCategory(u.Category)
                                             && u.Reason.StartsWith("in valid builds", StringComparison.Ordinal)))
        {
            var part = catalog.Part(u.Id);
            // Rivals: same-category parts on the all-build fronts of the contracts where this part is valid,
            // ignoring "none" options (no cost, lead or integration), which are not substitutes.
            var contexts = contracts.Where(c => c.ValidPartIds.Contains(u.Id)).ToList();
            var rivalIds = contexts.SelectMany(c => c.AllBuildFront).SelectMany(b => b.Choices)
                .Select(x => x.PartId).ToHashSet(StringComparer.Ordinal);
            var rivals = catalog.PartsInOrder.Where(p => p.Category == part.Category && p.Id != part.Id && rivalIds.Contains(p.Id)
                                                         && (p.CostM > 0 || p.LeadDays > 0 || p.IntegDays > 0)).ToList();
            if (rivals.Count == 0) continue;
            // Closest substitutes: the rivals sharing the most identical stats (e.g. the same fairing diameter).
            var best = rivals.Max(r => SharedStats(part, r));
            rivals = rivals.Where(r => SharedStats(part, r) == best).ToList();
            var rec = CheapestFix(part, rivals, $"data/parts/{part.Category}.json",
                $"Valid in {string.Join(", ", contexts.Select(c => c.ContractId))} but on none of their Pareto fronts, where the closest substitute " +
                $"`{string.Join("`, `", rivals.Select(r => r.Id))}` is chosen instead");
            if (rec != null) yield return rec;
        }
    }

    // ---- 6. Fill-vote parts dominated inside their own vote on part-level game values
    private static IEnumerable<Recommendation> DominatedFillParts(IReadOnlyList<UnusedPart> unused, GameCatalog catalog)
    {
        foreach (var u in unused.Where(u => !BalanceAnalysis.IsCoupledCategory(u.Category)
                                             && !u.Reason.StartsWith("never offered", StringComparison.Ordinal)))
        {
            var part = catalog.Part(u.Id);
            var dominator = catalog.PartsInOrder.FirstOrDefault(p => p.Category == part.Category && p.Id != part.Id && PartDominates(p, part));
            if (dominator == null) continue;
            var rec = CheapestFix(part, new[] { dominator }, $"data/parts/{part.Category}.json",
                $"Dominated inside its vote by `{dominator.Id}` (no worse on cost, lead, integration, mass and reliability)");
            if (rec != null) yield return rec;
        }
    }

    /// <summary>Part-level dominance on game values: cost, lead, integration, mass ↓ and reliability ↑, strictly better on one.</summary>
    private static bool PartDominates(PartDef a, PartDef b)
    {
        var ra = a.Reliability ?? 1;
        var rb = b.Reliability ?? 1;
        var noWorse = a.CostM <= b.CostM && a.LeadDays <= b.LeadDays && a.IntegDays <= b.IntegDays && a.MassKg <= b.MassKg && ra >= rb;
        var better = a.CostM < b.CostM || a.LeadDays < b.LeadDays || a.IntegDays < b.IntegDays || a.MassKg < b.MassKg || ra > rb;
        return noWorse && better && SameStats(a, b);
    }

    private static int SharedStats(PartDef a, PartDef b) =>
        a.Stats.Raw.Count(kv => b.Stats.Raw.TryGetValue(kv.Key, out var v) && Math.Abs(v - kv.Value) < 1e-9)
        + a.Stats.Text.Count(kv => b.Stats.Text.TryGetValue(kv.Key, out var t) && t == kv.Value);

    /// <summary>Only compare parts whose functional stats agree (a fill part's other stats, e.g. power or data rate, may justify it).</summary>
    private static bool SameStats(PartDef a, PartDef b)
    {
        var fa = a.Stats.Raw;
        var fb = b.Stats.Raw;
        var ta = a.Stats.Text;
        var tb = b.Stats.Text;
        return fa.Count == fb.Count && fa.All(kv => fb.TryGetValue(kv.Key, out var v) && Math.Abs(v - kv.Value) < 1e-9)
               && ta.Count == tb.Count && ta.All(kv => tb.TryGetValue(kv.Key, out var t) && t == kv.Value);
    }

    /// <summary>Proposes matching the closest rival on the single game value where the part loses most.</summary>
    private static Recommendation? CheapestFix(PartDef part, IReadOnlyList<PartDef> rivals, string file, string why)
    {
        var file2 = file;
        var bestCost = rivals.Min(r => r.CostM);
        var bestLead = rivals.Min(r => r.LeadDays);
        var bestInteg = rivals.Min(r => r.IntegDays);
        var bestRel = rivals.Max(r => r.Reliability ?? 0);
        var gaps = new List<(double Gap, string Field, string Current, string Proposed, string Rival)>();
        if (part.CostM > bestCost && part.CostM > 0)
            gaps.Add(((part.CostM - bestCost) / part.CostM, "game.cost_M", Money(part.CostM), Money(bestCost), RivalOf(rivals, r => r.CostM == bestCost)));
        if (part.LeadDays > bestLead && part.LeadDays > 0)
            gaps.Add(((part.LeadDays - bestLead) / part.LeadDays, "game.lead_days", Days(part.LeadDays), Days(bestLead), RivalOf(rivals, r => r.LeadDays == bestLead)));
        if (part.IntegDays > bestInteg && part.IntegDays > 0)
            gaps.Add(((part.IntegDays - bestInteg) / part.IntegDays, "game.integ_days", Days(part.IntegDays), Days(bestInteg), RivalOf(rivals, r => r.IntegDays == bestInteg)));
        if (part.Reliability.HasValue && part.Reliability < bestRel)
            gaps.Add(((bestRel - part.Reliability.Value) * 10, "game.reliability", Num(part.Reliability.Value), Num(bestRel), RivalOf(rivals, r => (r.Reliability ?? 0) == bestRel)));
        if (gaps.Count == 0)
        {
            return new Recommendation(file2, part.Id, "(no single field)", "—", "playtest",
                $"{why}; it is not worse than `{string.Join("`, `", rivals.Select(r => r.Id))}` on cost, lead, integration or reliability, so its losses come from mass, Δv or multipliers. Review its stats or its strength in the flight phase.");
        }
        var g = gaps.OrderByDescending(x => x.Gap).ThenBy(x => x.Field, StringComparer.Ordinal).First();
        return new Recommendation(file2, part.Id, g.Field, g.Current, g.Proposed,
            $"{why}. Its largest deficit is {g.Field.Replace("game.", "", StringComparison.Ordinal)} against `{g.Rival}`; matching it gives the part a niche. " +
            "If the part is meant to be justified by a rule Core does not check yet (e.g. endurance, reuse), add that rule instead.");
    }

    private static string RivalOf(IReadOnlyList<PartDef> rivals, Func<PartDef, bool> match) =>
        rivals.FirstOrDefault(match)?.Id ?? rivals[0].Id;

    private static double RoundUp(double value, double step) => Math.Ceiling(value / step - 1e-9) * step;
    private static string Num(double value) => value.ToString("0.####", CultureInfo.InvariantCulture);
    private static string Money(double value) => value.ToString("0.##", CultureInfo.InvariantCulture) + " $M";
    private static string Days(double value) => value.ToString("0.#", CultureInfo.InvariantCulture) + " days";
    private static string Pct(double value) => (value * 100).ToString("0.##", CultureInfo.InvariantCulture) + "%";
}
