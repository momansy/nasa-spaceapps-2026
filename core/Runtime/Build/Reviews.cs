#nullable enable
using System;
using System.Collections.Generic;
using System.Globalization;
using MissionForge.Core.Data;

namespace MissionForge.Core.Build
{
    /// <summary>Design reviews (design 6.9, NASA lifecycle 2.3).</summary>
    public enum ReviewKind
    {
        /// <summary>Preliminary Design Review, after the propulsion votes.</summary>
        Pdr,
        /// <summary>Critical Design Review, after the subsystem votes.</summary>
        Cdr,
        /// <summary>Flight Readiness Review, before launch (includes the GO/NO-GO poll).</summary>
        Frr,
    }

    /// <summary>Automatic review findings, grouped by severity.</summary>
    public sealed class ReviewReport
    {
        internal ReviewReport(ReviewKind kind, IReadOnlyList<ValidationIssue> issues, bool fixable)
        {
            Kind = kind;
            Issues = issues;
            BlockersFixableByLaterVotes = fixable;
        }

        /// <summary>Which review.</summary>
        public ReviewKind Kind { get; }
        /// <summary>All issues, Blockers first, then Major, then Minor.</summary>
        public IReadOnlyList<ValidationIssue> Issues { get; }
        /// <summary>Blocker count ("can't fly").</summary>
        public int Blockers => Count(Severity.Blocker);
        /// <summary>Major count ("high risk").</summary>
        public int Majors => Count(Severity.Major);
        /// <summary>Minor count.</summary>
        public int Minors => Count(Severity.Minor);
        /// <summary>At PDR/CDR: remaining votes can still remove every Blocker.</summary>
        public bool BlockersFixableByLaterVotes { get; }
        /// <summary>
        /// The team may vote Pass: no Blockers, or (PDR/CDR only) Blockers that later votes can still fix.
        /// At FRR any Blocker forces Rework.
        /// </summary>
        public bool PassAllowed => Blockers == 0 || (Kind != ReviewKind.Frr && BlockersFixableByLaterVotes);

        private int Count(Severity s)
        {
            int n = 0;
            foreach (var i in Issues) if (i.Severity == s) n++;
            return n;
        }
    }

    /// <summary>Outcome of one GO/NO-GO poll round at FRR.</summary>
    public enum PollOutcome
    {
        /// <summary>Every console said GO: proceed to countdown.</summary>
        Go,
        /// <summary>At least one NO-GO: 15 s discussion, then re-poll.</summary>
        DiscussAndRepoll,
        /// <summary>Second NO-GO round: a Rework option opens automatically.</summary>
        ReworkOffered,
    }

    /// <summary>The FRR GO/NO-GO poll state (design 6.9). Immutable.</summary>
    public sealed class FrrPoll
    {
        /// <summary>A poll with no rounds yet.</summary>
        public static readonly FrrPoll Start = new FrrPoll(0);

        private FrrPoll(int noGoRounds) { NoGoRounds = noGoRounds; }

        /// <summary>Rounds that had at least one NO-GO.</summary>
        public int NoGoRounds { get; }

        /// <summary>Discussion time before a re-poll, s. game_value (design 6.9).</summary>
        public const double DiscussionSeconds = 15;

        /// <summary>Records one poll round and returns the outcome with the new poll state.</summary>
        public (PollOutcome outcome, FrrPoll next) Record(int goVotes, int noGoVotes)
        {
            if (goVotes < 0 || noGoVotes < 0) throw new ArgumentOutOfRangeException(nameof(goVotes));
            if (noGoVotes == 0) return (PollOutcome.Go, this);
            var next = new FrrPoll(NoGoRounds + 1);
            return (next.NoGoRounds >= BuildConstants.FrrNoGoRoundsForRework ? PollOutcome.ReworkOffered : PollOutcome.DiscussAndRepoll, next);
        }
    }

    /// <summary>Design reviews: automatic checks, Pass/Rework, rework cost (design 6.9).</summary>
    public static class DesignReview
    {
        /// <summary>Rule IDs of the extra review checks beyond design 6.11.</summary>
        public const string BudgetRule = "rev_over_budget";
        /// <summary>Schedule slip check.</summary>
        public const string ScheduleRule = "rev_schedule_slip";
        /// <summary>Low mission success check.</summary>
        public const string SuccessRule = "rev_low_success";
        /// <summary>Unfixed revealed flaw check.</summary>
        public const string FlawRule = "rev_open_flaw";
        /// <summary>Undecided vote check.</summary>
        public const string IncompleteRule = "rev_incomplete";

        /// <summary>Estimated success below this is a Major review finding. game_value (decision).</summary>
        public const double LowSuccessThreshold = 0.80;

        /// <summary>Validation rules each review checks. PDR: propulsion; CDR: + subsystems; FRR: everything.</summary>
        public static IReadOnlyList<string> RulesFor(ReviewKind kind) => kind switch
        {
            ReviewKind.Pdr => new[] { ValidationRules.LiftoffTwr, ValidationRules.TotalDv, ValidationRules.UpperRestarts, ValidationRules.BoilOff },
            _ => ValidationRules.All,
        };

        /// <summary>
        /// Runs the automatic checks of a review. PDR and CDR judge the decided parts (partial mode) and run
        /// the fix-exists search for Blockers; FRR judges the build as it would fly. Adds review checks for budget,
        /// schedule slip, low estimated success (&lt; 80%), unfixed revealed flaws and (FRR) undecided votes.
        /// </summary>
        public static ReviewReport Run(ReviewKind kind, BuildState build, GameCatalog catalog)
        {
            var v = new Vehicle(build, catalog);
            var d = Dashboard.Compute(v);
            var mode = kind == ReviewKind.Frr ? ValidationMode.Complete : ValidationMode.Partial;
            var rules = new HashSet<string>(RulesFor(kind));
            var issues = new List<ValidationIssue>();
            foreach (var i in Validator.Validate(v, d, catalog, mode)) if (rules.Contains(i.RuleId)) issues.Add(i);

            var args = new Dictionary<string, string>();
            if (d.Budget.RemainingM < 0)
                issues.Add(Issue(BudgetRule, kind == ReviewKind.Frr ? Severity.Blocker : Severity.Major,
                    "Over budget by ${amount_M} M.", ("amount_M", F(-d.Budget.RemainingM))));
            if (d.Budget.Slips > 0)
                issues.Add(Issue(ScheduleRule, d.Budget.SlipIsMissionEnding ? Severity.Blocker : Severity.Major,
                    "The launch slips {days} days to the next window.", ("days", F(d.Budget.SlipDays))));
            if (kind != ReviewKind.Pdr && d.Success.Success < LowSuccessThreshold)
                issues.Add(Issue(SuccessRule, Severity.Major,
                    "Estimated mission success is only {pct}%.", ("pct", F(d.Success.Success * 100))));
            foreach (var cat in TestCampaign.OpenFlaws(build))
                issues.Add(Issue(FlawRule, Severity.Major, "A known flaw in {category} is not fixed.", ("category", cat)));
            if (kind == ReviewKind.Frr)
            {
                foreach (var vote in VoteOptions.VotesFor(v.Contract))
                    if (!build.Has(vote.Slot))
                        issues.Add(Issue(IncompleteRule, Severity.Blocker, "No part chosen for {category}.", ("category", vote.Slot)));
            }

            issues.Sort((a, b) => b.Severity.CompareTo(a.Severity));
            bool fixable = true;
            if (kind != ReviewKind.Frr && Validator.HasBlocker(issues))
            {
                // Only design-rule blockers can be fixed by later votes; budget/schedule blockers are not part votes,
                // so any of them makes the blockers unfixable (the fix search does not judge budget or schedule).
                var designRules = new HashSet<string>(ValidationRules.All);
                foreach (var i in issues)
                    if (i.Severity == Severity.Blocker && !designRules.Contains(i.RuleId)) fixable = false;
                if (fixable) fixable = FixSearch.Run(build, catalog).Exists;
            }
            return new ReviewReport(kind, issues, fixable);
        }

        /// <summary>
        /// Rework fee to replace the part in a category, $M: 30% of the replaced part's cost (design 6.9; game value).
        /// The new part's own cost replaces the old part's cost in the parts total.
        /// </summary>
        public static double ReworkFeeM(BuildState build, GameCatalog catalog, string category)
        {
            var id = build.Choice(category) ?? throw new InvalidOperationException($"Nothing chosen in '{category}' to rework.");
            var v = new Vehicle(build, catalog);
            return BudgetScheduleModel.PartCostM(v, category, catalog.Part(id)) * BuildConstants.ReworkFeeFraction;
        }

        /// <summary>
        /// Opens a category for re-vote: charges the re-integration fee and <see cref="BuildConstants.ReworkBaseDays"/>
        /// days now; the new part's integration days are added when it is chosen. The old part stays on the
        /// vehicle until the re-vote replaces it.
        /// </summary>
        public static BuildState Rework(BuildState build, GameCatalog catalog, ReviewKind kind, string category)
        {
            var fee = ReworkFeeM(build, catalog, category);
            return build
                .WithLedger(new LedgerEntry(LedgerKind.Rework, "rework:" + kind.ToString().ToLowerInvariant() + ":" + category, fee,
                    BuildConstants.ReworkBaseDays, 0, category))
                .WithReopened(category);
        }

        /// <summary>
        /// Completes a rework re-vote: replaces the part (resetting its test condition). The new part's
        /// integration days are part of the normal serial chain, so they count once.
        /// </summary>
        public static BuildState CompleteRework(BuildState build, GameCatalog catalog, string newPartId)
        {
            var part = catalog.Part(newPartId);
            var slot = build.ReopenedCategory ?? throw new InvalidOperationException("No vote is open for rework.");
            if (Slots.CategoryOf(slot) != part.Category)
                throw new InvalidOperationException($"Part '{newPartId}' ({part.Category}) cannot fill the reopened vote '{slot}'.");
            return build.WithChoice(slot, newPartId);
        }

        private static ValidationIssue Issue(string rule, Severity severity, string text, params (string key, string value)[] args)
        {
            var a = new Dictionary<string, string>();
            foreach (var (k, val) in args) { a[k] = val; text = text.Replace("{" + k + "}", val); }
            return new ValidationIssue(rule, severity, "review." + rule, text, a);
        }

        private static string F(double x) => x.ToString("0.#", CultureInfo.InvariantCulture);
    }
}
