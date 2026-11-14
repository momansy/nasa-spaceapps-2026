#nullable enable
using System;
using System.Collections.Generic;
using System.Linq;
using MissionForge.Core.Data;

namespace MissionForge.Core.Build
{
    /// <summary>Result of the "a later vote can fix it" search (design 4.2).</summary>
    public sealed class FixCheck
    {
        internal FixCheck(bool exists, bool inconclusive, int evaluations, BuildState? example)
        {
            Exists = exists;
            Inconclusive = inconclusive;
            Evaluations = evaluations;
            Example = example;
        }

        /// <summary>Some choice of the remaining votes removes every Blocker (true when the search was inconclusive).</summary>
        public bool Exists { get; }
        /// <summary>The search hit its evaluation cap before deciding; <see cref="Exists"/> is then optimistically true.</summary>
        public bool Inconclusive { get; }
        /// <summary>
        /// Number of vehicle evaluations (one <see cref="Vehicle"/> resolve plus its flight metrics and validation) the search made:
        /// complete builds and the optimistic bound checks of <see cref="FixSearch.Run"/>. For <see cref="FixSearch.RunExhaustive"/>
        /// it is the number of complete builds.
        /// </summary>
        public int Evaluations { get; }
        /// <summary>A completed build without Blockers, when one was found (useful for the AI Flight Director hint).</summary>
        public BuildState? Example { get; }
    }

    /// <summary>
    /// Searches whether the remaining votes can still make the vehicle flyable (design 4.2).
    /// <see cref="Run"/> is a pruned branch-and-bound search that decides the same question as
    /// <see cref="RunExhaustive"/> (the original depth-first enumeration, kept as the reference) in far fewer evaluations.
    /// </summary>
    public static class FixSearch
    {
        private static readonly HashSet<string> Coupled = new HashSet<string>(Slots.PropulsionGroup)
        {
            Slots.Fairing, Slots.LaunchEscape, Slots.HeatShield, Slots.AeroControl,
            Slots.PayloadInstrument, Slots.PayloadPower, Slots.PayloadAttitude, Slots.Capsule,
            Slots.LifeSupport, Slots.Lander, Slots.CapsuleRecovery, Slots.LaunchSite,
        };

        /// <summary>
        /// True when some assignment of the contract's still-undecided votes yields a build with no Blocker.
        /// Votes that only add mass (avionics, comms, power…) are filled with their lightest option, which is
        /// never worse for Δv and TWR. The remaining votes are searched depth-first with pruning, and the search
        /// stops after <paramref name="maxEvaluations"/> vehicle evaluations (then <see cref="FixCheck.Inconclusive"/>).
        /// </summary>
        /// <remarks>
        /// Pruning never removes a build the exhaustive search would accept, so <see cref="FixCheck.Exists"/> is the same:
        /// <list type="bullet">
        /// <item>A branch is cut as soon as a rule that later votes cannot change is broken (two incompatible parts, a requirement whose
        /// slots are all decided, too few upper-stage starts, a payload wider than a chosen fairing: the payload only grows).</item>
        /// <item>Lift-off TWR and Δv are monotone in the masses that payload-side votes add, so with the propulsion decided they are
        /// bounded optimistically by leaving the undecided payload-side votes empty. The material, booster recovery, launch site and
        /// separation system, which only scale mass or add Δv, are bounded by their best option.</item>
        /// <item>A payload-side assignment whose masses are all at least those of a known failing assignment (same rule-relevant parts) is skipped.</item>
        /// </list>
        /// </remarks>
        public static FixCheck Run(BuildState build, GameCatalog catalog, int maxEvaluations = BuildConstants.FixSearchMaxEvaluations)
        {
            var prep = Prepare(build, catalog);
            return new PrunedSearch(catalog, prep.contract, prep.start, prep.search, maxEvaluations).Run();
        }

        /// <summary>
        /// The original exhaustive depth-first search (no pruning): up to <paramref name="maxEvaluations"/> complete builds, a few
        /// seconds at the default cap. Kept as the reference that <see cref="Run"/> is tested against.
        /// </summary>
        public static FixCheck RunExhaustive(BuildState build, GameCatalog catalog, int maxEvaluations = BuildConstants.FixSearchMaxEvaluations)
        {
            var (contract, b, search) = Prepare(build, catalog);
            int evals = 0;
            BuildState? found = null;
            bool capped = false;
            bool Dfs(BuildState s, int i)
            {
                if (evals >= maxEvaluations) { capped = true; return false; }
                if (i == search.Count)
                {
                    evals++;
                    var v = new Vehicle(s, catalog);
                    var issues = Validator.Validate(v, Dashboard.ComputeFlightCore(v), catalog, ValidationMode.Complete);
                    if (!Validator.HasBlocker(issues)) { found = s; return true; }
                    return false;
                }
                foreach (var o in search[i].options)
                {
                    if (Dfs(s.WithChoice(search[i].slot, o.Id), i + 1)) return true;
                    if (capped) return false;
                }
                return false;
            }

            var ok = Dfs(b, 0);
            return new FixCheck(ok || capped, capped && !ok, evals, found);
        }

        /// <summary>Fills the votes that only add mass with their lightest option and lists the coupled votes still to search.</summary>
        private static (ContractDef contract, BuildState start, List<(string slot, IReadOnlyList<PartDef> options)> search) Prepare(
            BuildState build, GameCatalog catalog)
        {
            var contract = catalog.Contract(build.ContractId);
            var search = new List<(string slot, IReadOnlyList<PartDef> options)>();
            var b = build;
            foreach (var vote in VoteOptions.VotesFor(contract))
            {
                if (build.Has(vote.Slot)) continue;
                var options = new List<PartDef>();
                foreach (var id in vote.OptionIds)
                {
                    var p = catalog.Part(id);
                    if (p.OfferedFor(contract.Id) && vote.AcceptsStage(p)) options.Add(p);
                }
                if (options.Count == 0) continue;
                if (Coupled.Contains(vote.Slot))
                {
                    search.Add((vote.Slot, Order(options)));
                }
                else
                {
                    var lightest = options[0];
                    foreach (var o in options) if (o.MassKg < lightest.MassKg) lightest = o;
                    b = b.WithChoice(vote.Slot, lightest.Id);
                }
            }
            return (contract, b, search);
        }

        /// <summary>Tries the most capable options first: more thrust, more engines, more propellant, then lighter.</summary>
        private static IReadOnlyList<PartDef> Order(List<PartDef> options)
        {
            var sorted = new List<PartDef>(options);
            sorted.Sort((x, y) =>
            {
                var tx = (x.Stats.ThrustSlN ?? x.Stats.ThrustVacN ?? 0) * (x.Stats.Count ?? 1);
                var ty = (y.Stats.ThrustSlN ?? y.Stats.ThrustVacN ?? 0) * (y.Stats.Count ?? 1);
                var c = ty.CompareTo(tx);
                if (c != 0) return c;
                // Engine-count options carry no thrust of their own: rank them by the count itself.
                c = (y.Stats.Count ?? 1).CompareTo(x.Stats.Count ?? 1);
                if (c != 0) return c;
                // Tanks: more propellant first.
                c = Math.Max(y.Stats.FirstStagePropellantKg ?? 0, y.Stats.UpperStagePropellantKg ?? 0)
                    .CompareTo(Math.Max(x.Stats.FirstStagePropellantKg ?? 0, x.Stats.UpperStagePropellantKg ?? 0));
                if (c != 0) return c;
                c = x.MassKg.CompareTo(y.MassKg);
                return c != 0 ? c : string.CompareOrdinal(x.Id, y.Id);
            });
            return sorted;
        }

        /// <summary>The branch-and-bound search behind <see cref="Run"/>.</summary>
        private sealed class PrunedSearch
        {
            // Core slots in search order: the upper stack, the first stage, the boosters, then the "modifier" slots whose
            // numeric effect is a plain scale (material), a Δv bonus or cost (separation, recovery) or a Δv offset (site).
            private static readonly string[] CoreOrder =
            {
                Slots.UpperStageEngine, Slots.UpperStageEngineCount, Slots.UpperStageTank,
                Slots.FirstStageEngine, Slots.FirstStageEngineCount, Slots.FirstStageTank,
                Slots.StrapOnBoosters,
                Slots.StageSeparation, Slots.StructuralMaterial, Slots.BoosterRecovery, Slots.LaunchSite,
            };
            private static readonly HashSet<string> Modifiers = new HashSet<string>
            {
                Slots.StageSeparation, Slots.StructuralMaterial, Slots.BoosterRecovery, Slots.LaunchSite,
            };

            private readonly GameCatalog _catalog;
            private readonly ContractDef _contract;
            private readonly BuildState _start;
            private readonly int _max;
            private readonly List<(string slot, IReadOnlyList<PartDef> options)> _core = new List<(string, IReadOnlyList<PartDef>)>();
            private readonly List<(string slot, IReadOnlyList<PartDef> options)> _payload = new List<(string, IReadOnlyList<PartDef>)>();
            private Dictionary<string, List<PartDef>> _optimistic = new Dictionary<string, List<PartDef>>();
            private List<(string slot, IReadOnlyList<PartDef> options)> _live = new List<(string, IReadOnlyList<PartDef>)>();
            private readonly HashSet<string> _ruleRelevant = new HashSet<string>();
            private readonly Dictionary<string, List<double[]>> _failedMasses = new Dictionary<string, List<double[]>>();
            private int _evals;
            private bool _capped;

            public PrunedSearch(GameCatalog catalog, ContractDef contract, BuildState start,
                List<(string slot, IReadOnlyList<PartDef> options)> search, int maxEvaluations)
            {
                _catalog = catalog;
                _contract = contract;
                _start = start;
                _max = maxEvaluations;
                foreach (var slot in CoreOrder)
                    foreach (var s in search) if (s.slot == slot) _core.Add(s);
                foreach (var s in search)
                    if (Array.IndexOf(CoreOrder, s.slot) < 0)
                        _payload.Add((s.slot, s.options.OrderBy(p => p.MassKg).ThenBy(p => p.Id, StringComparer.Ordinal).ToList()));
                foreach (var p in catalog.Parts.Values)
                {
                    if (p.Rules.Count == 0) continue;
                    foreach (var r in p.Rules)
                    {
                        if (r.Kind != "requires_part" && r.Kind != "requires_any_part" && r.Kind != "incompatible_with_part") continue;
                        _ruleRelevant.Add(p.Id);
                        foreach (var id in r.Parts) _ruleRelevant.Add(id);
                    }
                }
            }

            public FixCheck Run()
            {
                if (Locked(_start)) return new FixCheck(false, false, 0, null);

                // Necessary condition: with every undecided payload-side vote left empty (never heavier than any option),
                // some propulsion choice must still satisfy lift-off TWR and Δv.
                var relaxed = CoreSearch(_start, exact: false, out _);
                if (_capped) return Finish(false, null);
                if (!relaxed) return Finish(false, null);

                var ok = PayloadSearch(_start, 0, out var example);
                return Finish(ok, example);
            }

            private FixCheck Finish(bool ok, BuildState? example) => new FixCheck(ok || _capped, _capped && !ok, _evals, example);

            // ------------------------------------------------------------ payload-side votes

            private bool PayloadSearch(BuildState s, int i, out BuildState? example)
            {
                example = null;
                if (i == _payload.Count) return PayloadLeaf(s, out example);
                foreach (var o in _payload[i].options)
                {
                    var next = s.WithChoice(_payload[i].slot, o.Id);
                    if (Locked(next)) continue;
                    if (PayloadSearch(next, i + 1, out example)) return true;
                    if (_capped) return false;
                }
                return false;
            }

            private bool PayloadLeaf(BuildState s, out BuildState? example)
            {
                example = null;
                var v = new Vehicle(s, _catalog);
                var masses = new[] { v.Mass.PayloadKg, v.Mass.JettisonedAtStagingKg, v.Mass.FirstExtrasKg };
                var key = RuleKey(s);
                if (_failedMasses.TryGetValue(key, out var failed))
                    foreach (var f in failed)
                        if (masses[0] >= f[0] && masses[1] >= f[1] && masses[2] >= f[2]) return false; // heavier than a known failure
                if (CoreSearch(s, exact: true, out example)) return true;
                if (_capped) return false;
                if (!_failedMasses.TryGetValue(key, out failed)) _failedMasses[key] = failed = new List<double[]>();
                failed.Add(masses);
                return false;
            }

            /// <summary>The payload-side parts whose rules involve other parts: the only way the payload side can change the propulsion search apart from mass.</summary>
            private string RuleKey(BuildState s)
            {
                var ids = new List<string>();
                foreach (var (slot, _) in _payload)
                {
                    var id = s.Choice(slot);
                    if (id != null && _ruleRelevant.Contains(id)) ids.Add(id);
                }
                foreach (var kv in s.Choices)
                    if (_ruleRelevant.Contains(kv.Value) && !ids.Contains(kv.Value) && Array.IndexOf(CoreOrder, kv.Key) < 0) ids.Add(kv.Value);
                ids.Sort(StringComparer.Ordinal);
                return string.Join("|", ids);
            }

            // ------------------------------------------------------------ propulsion votes

            private bool CoreSearch(BuildState s, bool exact, out BuildState? example)
            {
                example = null;
                // Forward check: drop every option that already breaks a rule no later vote can repair given the decided parts
                // (e.g. a propulsive recovery when the aero vote did not pick grid fins). No evaluation is spent on this.
                _live = new List<(string, IReadOnlyList<PartDef>)>();
                _optimistic = new Dictionary<string, List<PartDef>>();
                foreach (var (slot, options) in _core)
                {
                    if (s.Has(slot)) { _live.Add((slot, options)); continue; }
                    var kept = options.Where(o => !Locked(s.WithChoice(slot, o.Id))).ToList();
                    if (kept.Count == 0) return false;
                    _live.Add((slot, kept));
                    if (Modifiers.Contains(slot)) _optimistic[slot] = Optimistic(slot, kept);
                }
                return CoreDfs(s, 0, exact, out example);
            }

            private bool CoreDfs(BuildState s, int i, bool exact, out BuildState? example)
            {
                example = null;
                // Next undecided core slot.
                while (i < _live.Count && s.Has(_live[i].slot)) i++;
                if (i == _live.Count) return CoreLeaf(s, exact, out example);
                var (slot, options) = _live[i];
                foreach (var o in options)
                {
                    if (_evals >= _max) { _capped = true; return false; }
                    var next = s.WithChoice(slot, o.Id);
                    if (Locked(next)) continue;
                    if (!Modifiers.Contains(slot) && AllMainDecided(next, i))
                    {
                        // Main propulsion decided: bound the numeric blockers with the best option of every undecided modifier.
                        if (!NumericsOk(Optimistic(next))) { if (_capped) return false; continue; }
                    }
                    else if (Modifiers.Contains(slot) && !NumericsOk(Optimistic(next)))
                    {
                        if (_capped) return false;
                        continue;
                    }
                    if (CoreDfs(next, i + 1, exact, out example)) return true;
                    if (_capped) return false;
                }
                return false;
            }

            /// <summary>True when every non-modifier core slot after position <paramref name="i"/> is decided.</summary>
            private bool AllMainDecided(BuildState s, int i)
            {
                for (int k = i + 1; k < _live.Count; k++)
                    if (!Modifiers.Contains(_live[k].slot) && !s.Has(_live[k].slot)) return false;
                return true;
            }

            private bool CoreLeaf(BuildState s, bool exact, out BuildState? example)
            {
                example = null;
                if (_evals >= _max) { _capped = true; return false; }
                _evals++;
                var v = new Vehicle(s, _catalog);
                var issues = Validator.Validate(v, Dashboard.ComputeFlightCore(v), _catalog, ValidationMode.Complete);
                foreach (var issue in issues)
                {
                    if (issue.Severity != Severity.Blocker) continue;
                    if (exact) return false;
                    if (issue.RuleId == ValidationRules.LiftoffTwr || issue.RuleId == ValidationRules.TotalDv) return false;
                }
                example = exact ? s : null;
                return true;
            }

            /// <summary>Fills every undecided modifier slot with its optimistic option (see <see cref="Optimistic(string, IReadOnlyList{PartDef})"/>).</summary>
            private IEnumerable<BuildState> OptimisticStates(BuildState s)
            {
                var states = new List<BuildState> { s };
                foreach (var kv in _optimistic)
                {
                    if (s.Has(kv.Key)) continue;
                    var next = new List<BuildState>();
                    foreach (var st in states)
                        foreach (var p in kv.Value) next.Add(st.WithChoice(kv.Key, p.Id));
                    states = next;
                }
                return states;
            }

            private IReadOnlyList<BuildState> Optimistic(BuildState s) => OptimisticStates(s).ToList();

            /// <summary>True when lift-off TWR and Δv are not Blockers for at least one of the optimistic states.</summary>
            private bool NumericsOk(IReadOnlyList<BuildState> states)
            {
                foreach (var st in states)
                {
                    if (_evals >= _max) { _capped = true; return true; }
                    _evals++;
                    var v = new Vehicle(st, _catalog);
                    var issues = Validator.Validate(v, Dashboard.ComputeFlightCore(v), _catalog, ValidationMode.Complete);
                    var fail = false;
                    foreach (var i in issues)
                        if (i.Severity == Severity.Blocker && (i.RuleId == ValidationRules.LiftoffTwr || i.RuleId == ValidationRules.TotalDv)) { fail = true; break; }
                    if (!fail) return true;
                }
                return false;
            }

            /// <summary>
            /// Options of a modifier slot that can be the best one for the numeric blockers: the lowest dry-mass multiplier (material),
            /// the lowest Δv reserve (recovery), the highest launch-site Δv gain, or the Pareto set of (lighter, larger Δv bonus)
            /// for the separation system. Any other effect of these parts (cost, days, rules) is not a numeric blocker.
            /// </summary>
            private List<PartDef> Optimistic(string slot, IReadOnlyList<PartDef> options)
            {
                switch (slot)
                {
                    case Slots.StructuralMaterial:
                        return new List<PartDef> { options.OrderBy(p => p.Stats.DryMassMultiplier).First() };
                    case Slots.BoosterRecovery:
                        return new List<PartDef> { options.OrderBy(p => p.Stats.DvCostFraction).First() };
                    case Slots.LaunchSite:
                        return new List<PartDef>
                        {
                            options.OrderByDescending(p => { var (boost, plane) = Dashboard.SiteEffects(p, _contract); return boost - plane; }).First(),
                        };
                    default: // separation system
                        return options.Where(p => !options.Any(q => q != p && q.MassKg <= p.MassKg && q.Stats.DvBonusFraction >= p.Stats.DvBonusFraction &&
                                                                 (q.MassKg < p.MassKg || q.Stats.DvBonusFraction > p.Stats.DvBonusFraction))).ToList();
                }
            }

            // ------------------------------------------------------------ rules that later votes cannot change

            /// <summary>
            /// True when the chosen parts already break a Blocker rule that no later vote can repair: incompatible parts, a part
            /// requirement whose slots are all decided, too few upper-stage starts, or a payload wider than the chosen fairing
            /// (more payload parts can only widen it). Mirrors <see cref="Validator"/> in partial mode.
            /// </summary>
            private bool Locked(BuildState s)
            {
                var c = _contract;
                var chosen = new HashSet<string>(s.Choices.Values);
                foreach (var kv in s.Choices)
                {
                    if (!_catalog.Parts.TryGetValue(kv.Value, out var part)) continue;
                    foreach (var r in part.Rules)
                    {
                        if (r.Kind == "incompatible_with_part")
                        {
                            foreach (var id in r.Parts) if (chosen.Contains(id)) return true;
                        }
                        else if (r.Kind == "requires_part" || r.Kind == "requires_any_part")
                        {
                            bool met = false, decidable = true;
                            foreach (var id in r.Parts)
                            {
                                if (chosen.Contains(id)) { met = true; break; }
                                if (!_catalog.Parts.TryGetValue(id, out var other)) continue;
                                foreach (var slot in Slots.ForCategory(other.Category))
                                    if (!s.Has(slot) && c.VoteFor(slot) != null) decidable = false;
                            }
                            if (!met && decidable) return true;
                        }
                    }
                }

                var upper = s.Choice(Slots.UpperStageEngine);
                if (upper != null && _catalog.Parts.TryGetValue(upper, out var engine) && 1 + (engine.Stats.Restarts ?? 0) < c.RequiredUpperStageStarts)
                    return true;

                var fairingId = s.Choice(Slots.Fairing);
                if (fairingId != null && _catalog.Parts.TryGetValue(fairingId, out var fairing) && fairing.Stats.DiameterM.HasValue)
                {
                    double? payloadD = c.PayloadDiameterM;
                    if (!payloadD.HasValue)
                        foreach (var kv in s.Choices)
                            if (Slots.IsPayload(kv.Key) && _catalog.Parts.TryGetValue(kv.Value, out var pp) && pp.Stats.DiameterM.HasValue)
                                payloadD = Math.Max(payloadD ?? 0, pp.Stats.DiameterM.Value);
                    if (payloadD.HasValue && payloadD.Value > fairing.Stats.DiameterM.Value) return true;
                }
                return false;
            }
        }
    }
}
