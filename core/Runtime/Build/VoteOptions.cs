#nullable enable
using System;
using System.Collections.Generic;
using MissionForge.Core.Data;

namespace MissionForge.Core.Build
{
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
                if (!vote.AcceptsStage(p)) continue;
                if (!Applicable(build, catalog, p)) continue;
                result.Add(p);
                if (result.Count == MaxOptions) break;
            }
            return result;
        }

        /// <summary>
        /// Build-dependent applicability of a part for a vote slot: <see cref="Applicable(BuildState, GameCatalog, PartDef)"/> plus the stage
        /// check of <see cref="ContractVote.AcceptsStage"/> (engine-count parts belong to one stage).
        /// </summary>
        public static bool Applicable(BuildState build, GameCatalog catalog, string slot, PartDef p)
        {
            var vote = catalog.Contract(build.ContractId).VoteFor(slot);
            if (vote != null && !vote.AcceptsStage(p)) return false;
            return Applicable(build, catalog, p);
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
        /// uses Emergency Funding (+10% of the contract budget). Throws <see cref="InvalidOperationException"/> if the option cannot win and
        /// <see cref="ArgumentException"/> when an engine-count part of the other stage is committed.
        /// </summary>
        public static BuildState Commit(BuildState build, GameCatalog catalog, string slot, string partId)
        {
            var voteDef = catalog.Contract(build.ContractId).VoteFor(slot);
            if (voteDef != null && catalog.Parts.TryGetValue(partId, out var candidate) && !voteDef.AcceptsStage(candidate))
                throw new ArgumentException($"Part '{partId}' (stage '{candidate.Stats.Stage ?? "none"}') does not belong to vote '{slot}' (stage '{voteDef.Stage}').", nameof(partId));
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
