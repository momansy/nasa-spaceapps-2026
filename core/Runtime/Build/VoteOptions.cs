#nullable enable
using System;
using System.Collections.Generic;
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
        /// <summary>Number of complete builds evaluated.</summary>
        public int Evaluations { get; }
        /// <summary>A completed build without Blockers, when one was found (useful for the AI Flight Director hint).</summary>
        public BuildState? Example { get; }
    }

    /// <summary>Searches whether the remaining votes can still make the vehicle flyable (design 4.2).</summary>
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
        /// never worse for Δv and TWR; the rest are searched depth-first with a cap of
        /// <paramref name="maxEvaluations"/> complete builds.
        /// </summary>
        public static FixCheck Run(BuildState build, GameCatalog catalog, int maxEvaluations = BuildConstants.FixSearchMaxEvaluations)
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
                    if (p.OfferedFor(contract.Id)) options.Add(p);
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

        /// <summary>Tries the most capable options first: more thrust, more engines, then lighter.</summary>
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
                c = x.MassKg.CompareTo(y.MassKg);
                return c != 0 ? c : string.CompareOrdinal(x.Id, y.Id);
            });
            return sorted;
        }
    }

    /// <summary>One option of a vote round as shown on Part Cards (design 4.2, 14.3).</summary>
    public sealed class VoteOption
    {
        internal VoteOption(PartDef part, OptionPreview preview, double overBudgetM, double overScheduleDays,
            bool canUseEmergencyFunding, IReadOnlyList<ValidationIssue> blockers, FixCheck? fix)
        {
            Part = part;
            Preview = preview;
            OverBudgetM = overBudgetM;
            OverScheduleDays = overScheduleDays;
            CanUseEmergencyFunding = canUseEmergencyFunding;
            Blockers = blockers;
            Fix = fix;
        }

        /// <summary>The part.</summary>
        public PartDef Part { get; }
        /// <summary>"If chosen" dashboard and deltas.</summary>
        public OptionPreview Preview { get; }
        /// <summary>Amount by which this option would exceed the remaining budget, $M (0 when affordable). Red banner "Over budget by $X M".</summary>
        public double OverBudgetM { get; }
        /// <summary>Days by which this option would push the launch past the deadline (0 when on time).</summary>
        public double OverScheduleDays { get; }
        /// <summary>Within budget and schedule.</summary>
        public bool Affordable => OverBudgetM <= 0 && OverScheduleDays <= 0;
        /// <summary>PM's Emergency Funding is still available and would cover the overrun.</summary>
        public bool CanUseEmergencyFunding { get; }
        /// <summary>Over budget: choosing it triggers Emergency Funding (only possible when <see cref="CanUseEmergencyFunding"/>).</summary>
        public bool RequiresEmergencyFunding => OverBudgetM > 0;
        /// <summary>Blockers the option causes with the decided parts ("Will not fly" warning).</summary>
        public IReadOnlyList<ValidationIssue> Blockers { get; }
        /// <summary>Shows the "Will not fly" warning.</summary>
        public bool WillNotFly => Blockers.Count > 0;
        /// <summary>Fix-exists search result; null when the option has no Blocker.</summary>
        public FixCheck? Fix { get; }
        /// <summary>
        /// May win the vote: flyable or fixable by a later vote, and affordable or covered by Emergency Funding
        /// (design 4.2). Schedule overruns are allowed (they slip the launch) but are shown in red.
        /// </summary>
        public bool CanWin => (!WillNotFly || (Fix?.Exists ?? false)) && (OverBudgetM <= 0 || CanUseEmergencyFunding);
    }

    /// <summary>Which options a contract offers per vote, with affordability and flyability (design 4.2, 6.2).</summary>
    public static class VoteOptions
    {
        /// <summary>Flag set once PM's Emergency Funding has been used.</summary>
        public const string EmergencyFundingUsedFlag = "emergency_funding_used";

        /// <summary>Emergency Funding size as a fraction of the contract budget. game_value (design 3.3: +10%).</summary>
        public const double EmergencyFundingFraction = 0.10;

        /// <summary>Minimum options per vote (design 6.2).</summary>
        public const int MinOptions = 3;
        /// <summary>Maximum options per vote (design 6.2).</summary>
        public const int MaxOptions = 5;

        /// <summary>
        /// The votes this contract runs, in order, skipping categories that do not apply to the build
        /// (escape system only for crewed contracts, booster recovery only with a first stage…).
        /// </summary>
        public static IReadOnlyList<ContractVote> VotesFor(ContractDef contract)
        {
            var list = new List<ContractVote>();
            foreach (var v in contract.Votes)
            {
                if (v.Slot == Slots.LaunchEscape && !contract.Crewed) continue;
                if (v.OptionIds.Count == 0) continue; // nothing to choose from: the vote is skipped (design 6.2)
                list.Add(v);
            }
            return list;
        }

        /// <summary>The next category to vote on (a reopened category first), or null when the build is complete.</summary>
        public static string? NextVote(BuildState build, GameCatalog catalog)
        {
            if (build.ReopenedCategory != null) return build.ReopenedCategory;
            foreach (var v in VotesFor(catalog.Contract(build.ContractId)))
                if (!build.Has(v.Slot)) return v.Slot;
            return null;
        }

        /// <summary>
        /// Part IDs offered for a category: the contract's list filtered to parts offered for this contract and
        /// applicable to the build, at most <see cref="MaxOptions"/>. Fewer than <see cref="MinOptions"/> are
        /// returned only when the data offers fewer.
        /// </summary>
        public static IReadOnlyList<PartDef> Offered(BuildState build, GameCatalog catalog, string slot)
        {
            var contract = catalog.Contract(build.ContractId);
            var vote = contract.VoteFor(slot);
            var result = new List<PartDef>();
            if (vote == null) return result;
            foreach (var id in vote.OptionIds)
            {
                var p = catalog.Part(id);
                if (!p.OfferedFor(contract.Id)) continue;
                if (!Applicable(build, catalog, p)) continue;
                result.Add(p);
                if (result.Count == MaxOptions) break;
            }
            return result;
        }

        /// <summary>Build-dependent applicability (e.g. liquid side boosters need a first stage; escape only when crewed).</summary>
        public static bool Applicable(BuildState build, GameCatalog catalog, PartDef p)
        {
            var contract = catalog.Contract(build.ContractId);
            if (p.Category == Slots.LaunchEscape && !contract.Crewed) return false;
            if (p.HasTag("mirror_first_stage") && !build.Has(Slots.FirstStageEngine)) return false;
            if (p.HasTag("crewed_only") && !contract.Crewed) return false;
            if (p.HasTag("uncrewed_only") && contract.Crewed) return false;
            return true;
        }

        /// <summary>Builds the full option views for a vote round: preview, affordability, Will-not-fly and fix check.</summary>
        /// <param name="build">Current build (not changed).</param>
        /// <param name="catalog">Catalog.</param>
        /// <param name="slot">Vote slot (see <see cref="Slots"/>).</param>
        /// <param name="runFixSearch">Run the fix-exists search for options that cause a Blocker.</param>
        public static IReadOnlyList<VoteOption> For(BuildState build, GameCatalog catalog, string slot, bool runFixSearch = true)
        {
            var before = Dashboard.Compute(build, catalog);
            var contract = catalog.Contract(build.ContractId);
            var emergencyAvailable = !build.HasFlag(EmergencyFundingUsedFlag);
            var emergencyM = contract.BudgetM * EmergencyFundingFraction;
            var list = new List<VoteOption>();
            foreach (var p in Offered(build, catalog, slot))
            {
                var preview = Preview.Of(build, catalog, slot, p, before);
                var m = preview.Metrics;
                var overBudget = Math.Max(0, -m.Budget.RemainingM);
                var overSchedule = Math.Max(0, -m.Budget.SlackDays);
                var canFund = emergencyAvailable && overBudget > 0 && overBudget <= emergencyM;
                var after = build.WithChoice(slot, p.Id);
                var issues = Validator.Validate(new Vehicle(after, catalog), m, catalog, ValidationMode.Partial);
                var blockers = new List<ValidationIssue>();
                foreach (var i in issues) if (i.Severity == Severity.Blocker) blockers.Add(i);
                FixCheck? fix = null;
                if (blockers.Count > 0 && runFixSearch) fix = FixSearch.Run(after, catalog);
                list.Add(new VoteOption(p, preview, overBudget, overSchedule, canFund, blockers, fix));
            }
            return list;
        }

        /// <summary>
        /// Resolves a vote: records the winning part, counts the vote, and, when the option is over budget,
        /// uses Emergency Funding (+10% of the contract budget). Throws if the option cannot win.
        /// </summary>
        public static BuildState Commit(BuildState build, GameCatalog catalog, string slot, string partId)
        {
            var options = For(build, catalog, slot);
            VoteOption? chosen = null;
            foreach (var o in options) if (o.Part.Id == partId) chosen = o;
            if (chosen == null) throw new InvalidOperationException($"Part '{partId}' is not offered for '{slot}'.");
            if (!chosen.CanWin) throw new InvalidOperationException($"Part '{partId}' cannot win: will not fly with no fix, or over budget without Emergency Funding.");
            var next = build.WithVoteResolved(slot, partId);
            if (chosen.RequiresEmergencyFunding) next = UseEmergencyFunding(next, catalog);
            return next;
        }

        /// <summary>Uses PM's once-per-mission Emergency Funding: +10% of the contract budget (design 3.3).</summary>
        public static BuildState UseEmergencyFunding(BuildState build, GameCatalog catalog)
        {
            if (build.HasFlag(EmergencyFundingUsedFlag)) throw new InvalidOperationException("Emergency Funding was already used.");
            var contract = catalog.Contract(build.ContractId);
            return build
                .WithLedger(new LedgerEntry(LedgerKind.Budget, "emergency_funding", 0, 0, contract.BudgetM * EmergencyFundingFraction))
                .WithFlag(EmergencyFundingUsedFlag);
        }
    }
}
