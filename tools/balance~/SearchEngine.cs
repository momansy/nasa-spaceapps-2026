using MissionForge.Core.Build;
using MissionForge.Core.Data;

namespace MissionForge.Balance;

public sealed class SearchEngine
{
    private static readonly string[] CoupledSlotOrder =
    {
        Slots.LaunchSite,
        Slots.Capsule,
        Slots.Lander,
        Slots.HeatShield,
        Slots.LaunchEscape,
        Slots.Fairing,
        Slots.UpperStageEngine,
        Slots.UpperStageEngineCount,
        Slots.UpperStageTank,
        Slots.StageSeparation,
        Slots.FirstStageEngine,
        Slots.FirstStageEngineCount,
        Slots.FirstStageTank,
        Slots.StructuralMaterial,
        Slots.StrapOnBoosters,
        Slots.BoosterRecovery,
    };

    private readonly GameCatalog _catalog;
    private readonly int _maxEvals;
    private readonly ulong _seed;
    private readonly int _optionLimit;

    public SearchEngine(GameCatalog catalog, int maxEvals, ulong seed, int optionLimit = int.MaxValue)
    {
        _catalog = catalog;
        _maxEvals = maxEvals;
        _seed = seed;
        _optionLimit = optionLimit;
    }

    public ContractResult Search(ContractDef contract)
    {
        var result = new ContractResult
        {
            ContractId = contract.Id,
            ContractName = contract.Name,
            BudgetM = contract.BudgetM,
            DeadlineDays = contract.ScheduleDays,
        };
        var votes = VoteOptions.VotesFor(contract);
        var bySlot = votes.ToDictionary(v => v.Slot, StringComparer.Ordinal);
        var coupled = CoupledSlotOrder.Where(bySlot.ContainsKey).ToArray();
        var seen = new HashSet<string>(StringComparer.Ordinal);

        void Walk(BuildState build, int depth)
        {
            if (result.Evaluated >= _maxEvals)
            {
                result.Capped = true;
                return;
            }

            if (depth == coupled.Length)
            {
                if (CostLowerBoundExceedsBudget(build, votes, contract))
                {
                    result.CostLowerBoundPrunes++;
                    return;
                }
                EvaluateVariant(FillOtherSlots(build, votes, reliable: false), "cheapest", result, seen);
                if (result.Evaluated < _maxEvals)
                    EvaluateVariant(FillOtherSlots(build, votes, reliable: true), "most_reliable", result, seen);
                else result.Capped = true;
                return;
            }

            var slot = coupled[depth];
            var options = VoteOptions.Offered(build, _catalog, slot).Take(_optionLimit).ToArray();
            foreach (var part in options)
            {
                var next = build.WithChoice(slot, part.Id);
                var issues = Validator.Validate(next, _catalog, ValidationMode.Partial);
                if (Validator.HasBlocker(issues))
                {
                    result.PartialBlockerPrunes++;
                    continue;
                }
                Walk(next, depth + 1);
                if (result.Capped) return;
            }
        }

        Walk(BuildState.New(contract.Id, _seed), 0);
        return result;
    }

    private BuildState FillOtherSlots(BuildState build, IReadOnlyList<ContractVote> votes, bool reliable)
    {
        foreach (var vote in votes)
        {
            if (build.Has(vote.Slot)) continue;
            var offered = VoteOptions.Offered(build, _catalog, vote.Slot).Take(_optionLimit).ToArray();
            if (offered.Length == 0) continue;

            PartDef best = offered[0];
            double bestScore = reliable
                ? Dashboard.Compute(build.WithChoice(vote.Slot, best.Id), _catalog).Success.Success
                : Dashboard.Compute(build.WithChoice(vote.Slot, best.Id), _catalog).CostM;
            for (var i = 1; i < offered.Length; i++)
            {
                var candidate = offered[i];
                var metrics = Dashboard.Compute(build.WithChoice(vote.Slot, candidate.Id), _catalog);
                var score = reliable ? metrics.Success.Success : metrics.CostM;
                var better = reliable ? score > bestScore + 1e-12 : score < bestScore - 1e-12;
                if (better || (Math.Abs(score - bestScore) <= 1e-12 &&
                               string.CompareOrdinal(candidate.Id, best.Id) < 0))
                {
                    best = candidate;
                    bestScore = score;
                }
            }
            build = build.WithChoice(vote.Slot, best.Id);
        }
        return build;
    }

    private void EvaluateVariant(BuildState build, string variant, ContractResult result, HashSet<string> seen)
    {
        var signature = string.Join("|", build.Choices.OrderBy(kv => kv.Key, StringComparer.Ordinal)
            .Select(kv => kv.Key + "=" + kv.Value));
        if (!seen.Add(signature)) return;

        result.Evaluated++;
        var metrics = Dashboard.Compute(build, _catalog);
        var issues = Validator.Validate(build, _catalog, ValidationMode.Complete);
        var valid = !Validator.HasBlocker(issues)
                    && metrics.Budget.RemainingM >= -1e-9
                    && metrics.Budget.TotalDays <= metrics.Budget.DeadlineDays + 1e-9;
        if (!valid) return;

        result.Valid++;
        var majors = issues.Count(issue => issue.Severity == Severity.Major);
        result.ValidBuilds.Add(BuildResultFactory.From(build, metrics, majors, variant));
    }

    private bool CostLowerBoundExceedsBudget(
        BuildState build,
        IReadOnlyList<ContractVote> votes,
        ContractDef contract)
    {
        var partialCost = Dashboard.Compute(build, _catalog).CostM;
        var assuranceFactor = 1.0;
        if (!build.Has(Slots.MissionAssurance))
        {
            var assuranceVote = votes.FirstOrDefault(v => v.Slot == Slots.MissionAssurance);
            if (assuranceVote != null)
            {
                var offered = VoteOptions.Offered(build, _catalog, assuranceVote.Slot);
                if (offered.Count > 0)
                    assuranceFactor = 1 + offered.Min(p => p.Stats.CostFraction);
            }
        }

        // Deliberately omit all remaining positive part costs. This is a conservative lower bound:
        // it only prunes when already-selected hardware cannot fit even after the largest assurance discount.
        return partialCost * assuranceFactor > contract.BudgetM + 1e-9;
    }
}
