using MissionForge.Core.Build;
using MissionForge.Core.Data;

namespace MissionForge.Balance;

/// <summary>
/// Searches part combinations of one contract through Core's real build rules (brief T012).
/// Propulsion-coupled votes are enumerated depth-first with sound pruning; the other votes are filled with a
/// cheapest and a most-reliable variant. Deterministic for the same catalog, seed and evaluation cap.
/// </summary>
public sealed class SearchEngine
{
    /// <summary>
    /// Architecture-defining coupled votes, decided first. Each surviving combination is one search stratum,
    /// so a capped search still samples every architecture instead of only the first branch of the tree.
    /// </summary>
    public static readonly string[] StratumSlots =
    {
        Slots.FirstStageEngine,
        Slots.UpperStageEngine,
        Slots.StrapOnBoosters,
        Slots.BoosterRecovery,
    };

    /// <summary>
    /// The other coupled votes, in decision order. Core judges lift-off TWR once the first-stage engine and tank
    /// are decided and Δv once both engines and tanks are decided, treating undecided votes as absent. A Partial
    /// Blocker is a sound reason to prune only if no undecided vote could still raise TWR or Δv. So every vote
    /// whose absence is *pessimistic* comes before the tanks: launch site (rotation boost), material (dry-mass
    /// multiplier below 1), engine counts (thrust; core propellant split with strap-ons) and separation
    /// (hot-staging Δv bonus). The votes after the tanks (capsule, lander, heat shield, escape system) only add
    /// payload or jettisoned mass, which lowers TWR and Δv, so their absence is optimistic. The fairing goes first:
    /// its fit rule depends on diameter only, and it is decided (exact) for every later check.
    /// Structural material precedes the tanks so tank cost × material multiplier is final in the cost bound.
    /// </summary>
    public static readonly string[] InnerSlots =
    {
        Slots.Fairing,
        Slots.LaunchSite,
        Slots.StructuralMaterial,
        Slots.FirstStageEngineCount,
        Slots.FirstStageTank,
        Slots.StageSeparation,
        Slots.UpperStageEngineCount,
        Slots.UpperStageTank,
        Slots.Capsule,
        Slots.Lander,
        Slots.HeatShield,
        Slots.LaunchEscape,
    };

    private const double Epsilon = 1e-9;
    /// <summary>Partial-build checks allowed per evaluation of a stratum's share, in each of the count and sample phases.</summary>
    private const long NodeBudgetPerEval = 4;
    /// <summary>Partial-build checks always allowed per stratum and phase.</summary>
    private const long MinNodeBudget = 2000;
    private long _nodeStop = long.MaxValue;

    private readonly GameCatalog _catalog;
    private readonly int _maxEvals;
    private readonly ulong _seed;
    private readonly int _optionLimit;
    private readonly bool _relaxBudget;
    private readonly bool _relaxSchedule;
    private readonly Dictionary<string, (string Slot, string PartId)[]> _fillMemo = new(StringComparer.Ordinal);
    private readonly HashSet<string> _ruleParts = new(StringComparer.Ordinal);

    // Per-search state.
    private ContractDef _contract = null!;
    private IReadOnlyList<ContractVote> _votes = Array.Empty<ContractVote>();
    private string[] _stratumSlots = Array.Empty<string>();
    private string[] _innerSlots = Array.Empty<string>();
    private string[] _fillSlots = Array.Empty<string>();
    private double _assuranceCostFactor = 1;
    private double _assuranceDaysFactor = 1;
    private Dictionary<string, double> _minNegativeIntegDays = new(StringComparer.Ordinal);
    private ContractResult _result = null!;
    private Dictionary<string, bool> _nodeMemo = new(StringComparer.Ordinal);

    /// <param name="catalog">Loaded catalog.</param>
    /// <param name="maxEvals">Maximum complete builds evaluated for one contract.</param>
    /// <param name="seed">Build seed (BuildState) and sampling seed.</param>
    /// <param name="optionLimit">Test hook: use only the first N offered options of every vote.</param>
    /// <param name="relaxBudget">Diagnostic: ignore the budget (pruning and validity), to find what each architecture needs.</param>
    /// <param name="relaxSchedule">Diagnostic: ignore the deadline (pruning and validity).</param>
    public SearchEngine(GameCatalog catalog, int maxEvals, ulong seed, int optionLimit = int.MaxValue,
        bool relaxBudget = false, bool relaxSchedule = false)
    {
        _relaxBudget = relaxBudget;
        _relaxSchedule = relaxSchedule;
        // Parts named by a data part rule (17.5: requires_part, requires_any_part, incompatible_with_part).
        foreach (var part in catalog.PartsInOrder)
            foreach (var rule in part.Rules)
                if (rule.Kind == "requires_part" || rule.Kind == "requires_any_part" || rule.Kind == "incompatible_with_part")
                {
                    _ruleParts.Add(part.Id);
                    foreach (var id in rule.Parts) _ruleParts.Add(id);
                }
        _catalog = catalog;
        _maxEvals = maxEvals;
        _seed = seed;
        _optionLimit = optionLimit;
    }

    public ContractResult Search(ContractDef contract)
    {
        Prepare(contract);
        var result = _result;

        // 1. Strata: every architecture-defining combination that survives sound pruning.
        var strata = new List<(BuildState Build, string Key)>();
        void Strata(BuildState build, string key, int depth)
        {
            if (depth == _stratumSlots.Length)
            {
                strata.Add((build, key));
                return;
            }
            foreach (var part in OfferedOptions(build, _stratumSlots[depth]))
            {
                var next = build.WithChoice(_stratumSlots[depth], part.Id);
                var nextKey = key + "|" + part.Id;
                if (NodeOk(next, nextKey)) Strata(next, nextKey, depth + 1);
            }
        }
        Strata(BuildState.New(contract.Id, _seed), "", 0);
        result.Strata = strata.Count;

        // 2. Each stratum gets an equal share of the remaining evaluation budget. A stratum whose subtree fits its
        //    share is enumerated exhaustively; a larger one is sampled with seeded random descents.
        for (var i = 0; i < strata.Count; i++)
        {
            var remaining = _maxEvals - result.Evaluated;
            var share = remaining / (strata.Count - i);
            var leafLimit = Math.Max(1, share / 2); // each leaf costs at most two evaluations
            _nodeMemo = new Dictionary<string, bool>(StringComparer.Ordinal);

            var leaves = new List<BuildState>();
            _nodeStop = result.NodeChecks + Math.Max(MinNodeBudget, NodeBudgetPerEval * share);
            var complete = CollectLeaves(strata[i].Build, strata[i].Key, 0, leaves, leafLimit);
            if (complete)
            {
                result.ExhaustiveStrata++;
                foreach (var leaf in leaves)
                {
                    if (result.Evaluated >= _maxEvals)
                    {
                        result.Capped = true;
                        break;
                    }
                    EvaluateLeaf(leaf);
                }
            }
            else
            {
                // The subtree has more leaves than the share allows: sample it until the share is spent.
                result.SampledStrata++;
                result.Capped = true;
                var stop = Math.Min(_maxEvals, result.Evaluated + Math.Max(1, share));
                var nodeStop = result.NodeChecks + Math.Max(MinNodeBudget, NodeBudgetPerEval * share);
                SampleLeaves(strata[i].Build, strata[i].Key, i,
                    () => result.Evaluated < stop && result.NodeChecks < nodeStop, EvaluateLeaf);
            }
        }

        _nodeMemo = new Dictionary<string, bool>(StringComparer.Ordinal);
        return result;
    }

    /// <summary>
    /// Fills the non-coupled votes of a build greedily in vote order with the option that gives the lowest
    /// displayed total cost (<paramref name="reliable"/> false) or the highest displayed success (true), skipping
    /// options that break a data part rule with the parts already chosen (Core Partial validation:
    /// <c>part_requirement</c>, <c>part_incompatible</c>), e.g. propulsive booster landing needs grid fins.
    /// Memoized on the offered option sets plus the coupled parts named by part rules: in Core the cost of a
    /// non-propulsion part is additive and context free and displayed success is a product of per-part factors,
    /// so the greedy choice depends on nothing else. Fill parts also add payload mass; that effect is judged when
    /// the complete build is validated, not optimized here.
    /// </summary>
    public BuildState Fill(BuildState build, bool reliable)
    {
        var offered = new List<IReadOnlyList<PartDef>>(_fillSlots.Length);
        var key = new System.Text.StringBuilder(reliable ? "R" : "C");
        foreach (var kv in build.Choices.Where(kv => _ruleParts.Contains(kv.Value)).OrderBy(kv => kv.Key, StringComparer.Ordinal))
            key.Append('|').Append(kv.Key).Append('=').Append(kv.Value);
        foreach (var slot in _fillSlots)
        {
            var options = OfferedOptions(build, slot);
            offered.Add(options);
            key.Append('|');
            foreach (var p in options) key.Append(p.Id).Append(',');
        }

        var memoKey = key.ToString();
        if (!_fillMemo.TryGetValue(memoKey, out var choices))
        {
            var filled = build;
            var list = new List<(string, string)>();
            for (var s = 0; s < _fillSlots.Length; s++)
            {
                var slot = _fillSlots[s];
                var ranked = offered[s]
                    .Select(candidate =>
                    {
                        var metrics = Dashboard.Compute(filled.WithChoice(slot, candidate.Id), _catalog);
                        return (Part: candidate, Score: reliable ? -metrics.Success.Success : metrics.CostM);
                    })
                    .OrderBy(x => Math.Round(x.Score, 12))
                    .ThenBy(x => x.Part.Id, StringComparer.Ordinal)
                    .Select(x => x.Part)
                    .ToArray();
                if (ranked.Length == 0) continue;
                var pick = ranked.FirstOrDefault(candidate => !BreaksPartRule(filled.WithChoice(slot, candidate.Id))) ?? ranked[0];
                filled = filled.WithChoice(slot, pick.Id);
                list.Add((slot, pick.Id));
            }
            choices = list.ToArray();
            _fillMemo[memoKey] = choices;
        }

        foreach (var (slot, partId) in choices) build = build.WithChoice(slot, partId);
        return build;
    }

    private bool BreaksPartRule(BuildState build)
    {
        if (!build.Choices.Values.Any(_ruleParts.Contains)) return false;
        foreach (var issue in Validator.Validate(build, _catalog, ValidationMode.Partial))
            if (issue.Severity == Severity.Blocker
                && (issue.RuleId == ValidationRules.PartRequirement || issue.RuleId == ValidationRules.PartIncompatible))
                return true;
        return false;
    }

    /// <summary>Brief's validity rule: no Complete-mode Blocker, budget remaining ≥ 0, launch no later than the deadline.</summary>
    public bool IsValid(BuildState build, out DashboardMetrics metrics, out IReadOnlyList<ValidationIssue> issues)
    {
        var vehicle = new Vehicle(build, _catalog);
        metrics = Dashboard.Compute(vehicle);
        issues = Validator.Validate(vehicle, metrics, _catalog, ValidationMode.Complete);
        return !Validator.HasBlocker(issues)
               && (_relaxBudget || metrics.Budget.RemainingM >= -Epsilon)
               && (_relaxSchedule || metrics.Budget.TotalDays <= metrics.Budget.DeadlineDays + Epsilon);
    }

    /// <summary>The coupled votes of a contract in decision order (strata first, then inner slots).</summary>
    public IReadOnlyList<string> CoupledSlots(ContractDef contract)
    {
        Prepare(contract);
        return _stratumSlots.Concat(_innerSlots).ToArray();
    }

    /// <summary>The non-coupled votes of a contract in vote order.</summary>
    public IReadOnlyList<string> FillSlots(ContractDef contract)
    {
        Prepare(contract);
        return _fillSlots;
    }

    /// <summary>Offered options of a vote (Core <c>VoteOptions.Offered</c>), limited by the test hook.</summary>
    public IReadOnlyList<PartDef> OfferedOptions(BuildState build, string slot)
    {
        var offered = VoteOptions.Offered(build, _catalog, slot);
        if (_optionLimit < offered.Count) offered = offered.Take(_optionLimit).ToArray();
        if (_result != null)
            foreach (var p in offered) _result.OfferedPartIds.Add(p.Id);
        return offered;
    }

    private void Prepare(ContractDef contract)
    {
        _contract = contract;
        _nodeStop = long.MaxValue;
        _votes = VoteOptions.VotesFor(contract);
        var voted = new HashSet<string>(_votes.Select(v => v.Slot), StringComparer.Ordinal);
        _stratumSlots = StratumSlots.Where(voted.Contains).ToArray();
        _innerSlots = InnerSlots.Where(voted.Contains).ToArray();
        var coupled = new HashSet<string>(_stratumSlots.Concat(_innerSlots), StringComparer.Ordinal);
        _fillSlots = _votes.Select(v => v.Slot).Where(s => !coupled.Contains(s)).ToArray();

        // Lower-bound factors: the most favourable mission-assurance adjustment still on offer (7.20).
        _assuranceCostFactor = 1;
        _assuranceDaysFactor = 1;
        var probe = BuildState.New(contract.Id, _seed);
        if (voted.Contains(Slots.MissionAssurance))
        {
            var assurance = VoteOptions.Offered(probe, _catalog, Slots.MissionAssurance);
            if (assurance.Count > 0)
            {
                _assuranceCostFactor = Math.Min(1, 1 + assurance.Min(p => p.Stats.CostFraction));
                _assuranceDaysFactor = Math.Min(1, 1 + assurance.Min(p => p.Stats.DaysFraction));
            }
        }

        // Most negative integration days any option of an undecided vote could still add (stainless steel −5 d).
        _minNegativeIntegDays = new Dictionary<string, double>(StringComparer.Ordinal);
        foreach (var vote in _votes)
        {
            var min = 0.0;
            foreach (var id in vote.OptionIds)
            {
                var p = _catalog.Part(id);
                min = Math.Min(min, p.IntegDays + p.Stats.ExtraIntegDays);
            }
            _minNegativeIntegDays[vote.Slot] = min;
        }

        _result = new ContractResult
        {
            ContractId = contract.Id,
            ContractName = contract.Name,
            BudgetM = contract.BudgetM,
            DeadlineDays = contract.ScheduleDays,
        };
    }

    /// <summary>
    /// Checks a partial build: no Partial-mode Blocker, and the cost and schedule lower bounds fit. Both bounds
    /// only use quantities that can grow as votes are decided: part costs are non-negative and use counts ≥ 1;
    /// the bound applies the largest assurance discount; schedule uses the longest lead so far plus decided
    /// integration days plus the most negative integration any undecided vote could add.
    /// </summary>
    private bool NodeOk(BuildState build, string key)
    {
        if (_nodeMemo.TryGetValue(key, out var ok)) return ok;
        _result.NodeChecks++;
        var vehicle = new Vehicle(build, _catalog);
        var metrics = Dashboard.Compute(vehicle);
        var issues = Validator.Validate(vehicle, metrics, _catalog, ValidationMode.Partial);
        ok = true;
        var blocker = issues.FirstOrDefault(i => i.Severity == Severity.Blocker);
        if (blocker != null)
        {
            _result.PartialBlockerPrunes++;
            Increment(_result.PruneReasons, "blocker:" + blocker.RuleId);
            ok = false;
        }
        else if (!_relaxBudget && metrics.Budget.PartsCostM * _assuranceCostFactor > metrics.Budget.BudgetM + Epsilon)
        {
            _result.CostLowerBoundPrunes++;
            Increment(_result.PruneReasons, "cost_lower_bound");
            ok = false;
        }
        else if (!_relaxSchedule)
        {
            var futureNegative = _votes.Where(v => !build.Has(v.Slot)).Sum(v => _minNegativeIntegDays[v.Slot]);
            var daysLowerBound = (metrics.Budget.MaxLeadDays + metrics.Budget.IntegrationDays + futureNegative) * _assuranceDaysFactor;
            if (daysLowerBound > metrics.Budget.DeadlineDays + Epsilon)
            {
                _result.ScheduleLowerBoundPrunes++;
                Increment(_result.PruneReasons, "schedule_lower_bound");
                ok = false;
            }
        }
        _nodeMemo[key] = ok;
        return ok;
    }

    /// <summary>Depth-first enumeration of a stratum's leaves; false when more than <paramref name="limit"/> exist.</summary>
    private bool CollectLeaves(BuildState build, string key, int depth, List<BuildState> leaves, int limit)
    {
        if (_result.NodeChecks >= _nodeStop) return false;
        if (depth == _innerSlots.Length)
        {
            if (leaves.Count >= limit) return false;
            leaves.Add(build);
            return true;
        }
        var slot = _innerSlots[depth];
        foreach (var part in OfferedOptions(build, slot))
        {
            var next = build.WithChoice(slot, part.Id);
            var nextKey = key + "|" + part.Id;
            if (!NodeOk(next, nextKey)) continue;
            if (!CollectLeaves(next, nextKey, depth + 1, leaves, limit)) return false;
        }
        return true;
    }

    /// <summary>
    /// Seeded random descents through a stratum: each descent shuffles the offered options at every level and
    /// returns the first leaf that survives pruning. Distinct leaves are passed to <paramref name="visit"/> while
    /// <paramref name="more"/> holds; dead branches are remembered, and a long run of repeats ends the sampling.
    /// </summary>
    private void SampleLeaves(BuildState root, string rootKey, int stratumIndex, Func<bool> more, Action<BuildState> visit)
    {
        const int maxRepeatsInARow = 1000;
        var rng = new SplitMix64(_seed ^ StableHash(_contract.Id) ^ ((ulong)(stratumIndex + 1) * 0x9E3779B97F4A7C15UL));
        var dead = new HashSet<string>(StringComparer.Ordinal);
        var seen = new HashSet<string>(StringComparer.Ordinal);
        var repeats = 0;

        (BuildState Build, string Key)? Descend(BuildState build, string key, int depth)
        {
            if (depth == _innerSlots.Length) return (build, key);
            var slot = _innerSlots[depth];
            var options = OfferedOptions(build, slot).ToArray();
            rng.Shuffle(options);
            foreach (var part in options)
            {
                var next = build.WithChoice(slot, part.Id);
                var nextKey = key + "|" + part.Id;
                if (dead.Contains(nextKey) || !NodeOk(next, nextKey)) continue;
                var leaf = Descend(next, nextKey, depth + 1);
                if (leaf != null) return leaf;
                dead.Add(nextKey);
            }
            return null;
        }

        while (more() && repeats < maxRepeatsInARow)
        {
            var leaf = Descend(root, rootKey, 0);
            if (leaf == null) break; // every branch is dead
            if (!seen.Add(leaf.Value.Key))
            {
                repeats++;
                continue;
            }
            repeats = 0;
            visit(leaf.Value.Build);
        }
    }

    private void EvaluateLeaf(BuildState coupled)
    {
        _result.LeavesVisited++;
        var cheap = Fill(coupled, reliable: false);
        var reliable = Fill(coupled, reliable: true);
        var same = cheap.Choices.Count == reliable.Choices.Count
                   && cheap.Choices.All(kv => reliable.Choice(kv.Key) == kv.Value);
        Evaluate(cheap, same ? "cheapest=most_reliable" : "cheapest");
        if (!same && _result.Evaluated < _maxEvals) Evaluate(reliable, "most_reliable");
        else if (!same) _result.Capped = true;
    }

    private void Evaluate(BuildState build, string variant)
    {
        _result.Evaluated++;
        var valid = IsValid(build, out var metrics, out var issues);
        if (!valid)
        {
            var blocker = issues.FirstOrDefault(i => i.Severity == Severity.Blocker);
            if (blocker != null) Increment(_result.InvalidReasons, "blocker:" + blocker.RuleId);
            else if (metrics.Budget.RemainingM < -Epsilon) Increment(_result.InvalidReasons, "over_budget");
            else Increment(_result.InvalidReasons, "over_schedule");
            return;
        }
        var majors = issues.Count(issue => issue.Severity == Severity.Major);
        _result.Offer(BuildResultFactory.From(build, metrics, majors, variant));
    }

    private static void Increment(SortedDictionary<string, int> counts, string key) =>
        counts[key] = counts.TryGetValue(key, out var n) ? n + 1 : 1;

    private static ulong StableHash(string text)
    {
        var hash = 14695981039346656037UL; // FNV-1a 64
        foreach (var ch in text)
        {
            hash ^= ch;
            hash *= 1099511628211UL;
        }
        return hash;
    }
}

/// <summary>SplitMix64: small deterministic PRNG, identical on every platform and runtime.</summary>
internal sealed class SplitMix64
{
    private ulong _state;

    public SplitMix64(ulong seed) => _state = seed;

    public ulong Next()
    {
        var z = _state += 0x9E3779B97F4A7C15UL;
        z = (z ^ (z >> 30)) * 0xBF58476D1CE4E5B9UL;
        z = (z ^ (z >> 27)) * 0x94D049BB133111EBUL;
        return z ^ (z >> 31);
    }

    public void Shuffle<T>(T[] items)
    {
        for (var i = items.Length - 1; i > 0; i--)
        {
            var j = (int)(Next() % (ulong)(i + 1));
            (items[i], items[j]) = (items[j], items[i]);
        }
    }
}
