using System;
using System.Linq;
using MissionForge.Core.Build;
using MissionForge.Core.Data;
using Xunit;

namespace MissionForge.Core.Tests.Build
{
    /// <summary>Design reviews PDR / CDR / FRR, rework and the FRR GO/NO-GO poll (design 6.9). Catalog: <see cref="AnomalyReviewFixture"/>.</summary>
    public class ReviewTests
    {
        private static readonly GameCatalog Catalog = AnomalyReviewFixture.Catalog();

        private static BuildState Full(string contract = AnomalyReviewFixture.C1, string instrument = "inst_camera", string comms = "comm_good") =>
            AnomalyReviewFixture.FullBuild(contract: contract, instrument: instrument, comms: comms);

        private static ValidationIssue? Find(ReviewReport r, string ruleId) => r.Issues.SingleOrDefault(i => i.RuleId == ruleId);

        /// <summary>Adds a plain ledger line (money or days) to push the build over budget or past the deadline.</summary>
        private static BuildState Spend(BuildState b, double costM, double days) =>
            b.WithLedger(new LedgerEntry(LedgerKind.Anomaly, "test_overrun", costM, days));

        [Fact]
        public void RulesFor_pdr_is_propulsion_only_and_cdr_frr_check_everything()
        {
            Assert.Equal(new[] { ValidationRules.LiftoffTwr, ValidationRules.TotalDv, ValidationRules.UpperRestarts, ValidationRules.BoilOff },
                DesignReview.RulesFor(ReviewKind.Pdr));
            Assert.Equal(ValidationRules.All, DesignReview.RulesFor(ReviewKind.Cdr));
            Assert.Equal(ValidationRules.All, DesignReview.RulesFor(ReviewKind.Frr));
        }

        [Fact]
        public void Reference_build_passes_every_review_with_no_issues()
        {
            foreach (var kind in new[] { ReviewKind.Pdr, ReviewKind.Cdr, ReviewKind.Frr })
            {
                var r = DesignReview.Run(kind, Full(), Catalog);
                Assert.Equal(kind, r.Kind);
                Assert.Empty(r.Issues);
                Assert.True(r.PassAllowed);
            }
        }

        [Fact]
        public void Pdr_ignores_non_propulsion_rules_that_cdr_reports()
        {
            // Instrument 10 GB/day vs weak radio 0.5 GB/pass × 6 passes = 3 GB/day → data budget Minor (design 6.11).
            var b = Full(comms: "comm_weak");
            Assert.Null(Find(DesignReview.Run(ReviewKind.Pdr, b, Catalog), ValidationRules.DataBudget));
            var cdr = DesignReview.Run(ReviewKind.Cdr, b, Catalog);
            Assert.Equal(Severity.Minor, Find(cdr, ValidationRules.DataBudget)!.Severity);
            Assert.Equal(1, cdr.Minors);
            Assert.True(cdr.PassAllowed);
        }

        [Fact]
        public void Frr_adds_a_blocker_for_every_undecided_vote_but_cdr_does_not()
        {
            var b = Full().WithoutChoice(Slots.Avionics);
            Assert.Null(Find(DesignReview.Run(ReviewKind.Cdr, b, Catalog), DesignReview.IncompleteRule));

            var frr = DesignReview.Run(ReviewKind.Frr, b, Catalog);
            var issue = Find(frr, DesignReview.IncompleteRule)!;
            Assert.Equal(Severity.Blocker, issue.Severity);
            Assert.Equal("No part chosen for avionics.", issue.Text);
            Assert.Equal(Slots.Avionics, issue.Args["category"]);
            Assert.Equal("review." + DesignReview.IncompleteRule, issue.TextKey);
            Assert.False(frr.PassAllowed); // any Blocker forces Rework at FRR
        }

        [Fact]
        public void Over_budget_is_major_at_pdr_and_cdr_and_a_blocker_at_frr()
        {
            // Parts $28 M + $80 M overrun = $108 M against $100 M → over by $8 M.
            var b = Spend(Full(), 80, 0);
            foreach (var kind in new[] { ReviewKind.Pdr, ReviewKind.Cdr })
            {
                var issue = Find(DesignReview.Run(kind, b, Catalog), DesignReview.BudgetRule)!;
                Assert.Equal(Severity.Major, issue.Severity);
                Assert.Equal("Over budget by $8 M.", issue.Text);
                Assert.Equal("8", issue.Args["amount_M"]);
            }
            var frr = DesignReview.Run(ReviewKind.Frr, b, Catalog);
            Assert.Equal(Severity.Blocker, Find(frr, DesignReview.BudgetRule)!.Severity);
            Assert.False(frr.PassAllowed);
        }

        [Fact]
        public void Schedule_slip_is_major_with_monthly_windows_and_a_blocker_with_mars_windows()
        {
            // 260 days + 200 = 460 > 400 deadline: overrun 60 days.
            //   C1 (30-day windows): ceil(60 / 30) = 2 slips = 60 days → Major.
            var c1 = Find(DesignReview.Run(ReviewKind.Cdr, Spend(Full(), 0, 200), Catalog), DesignReview.ScheduleRule)!;
            Assert.Equal(Severity.Major, c1.Severity);
            Assert.Equal("The launch slips 60 days to the next window.", c1.Text);

            //   C7 (780-day Mars windows): 1 slip = 780 days, mission-ending → Blocker.
            var mars = Find(DesignReview.Run(ReviewKind.Cdr, Spend(Full(AnomalyReviewFixture.Mars), 0, 200), Catalog), DesignReview.ScheduleRule)!;
            Assert.Equal(Severity.Blocker, mars.Severity);
            Assert.Equal("780", mars.Args["days"]);
        }

        [Fact]
        public void A_mission_ending_slip_cannot_be_passed_at_pdr_or_cdr_because_no_later_vote_fixes_it()
        {
            // Every vote is decided and the design is flyable; only the schedule Blocker remains. Later votes
            // cannot remove it, so the team must Rework (design 6.9; Reviews.cs: "budget/schedule blockers are not part votes").
            var b = Spend(Full(AnomalyReviewFixture.Mars), 0, 200);
            foreach (var kind in new[] { ReviewKind.Pdr, ReviewKind.Cdr })
            {
                var r = DesignReview.Run(kind, b, Catalog);
                Assert.Equal(1, r.Blockers);
                Assert.False(r.BlockersFixableByLaterVotes);
                Assert.False(r.PassAllowed);
            }
        }

        [Fact]
        public void Pdr_blocker_that_a_later_vote_can_fix_still_allows_pass()
        {
            // First engine and tank decided, engine count not yet: one engine assumed.
            //   mass = 1000 payload + 2000 engine + 5000 tank dry + 100 000 prop = 108 000 kg
            //   TWR  = 1 000 kN / (108 000 × 9.80665) = 0.944 ≤ 1 → Blocker; voting 2 engines later fixes it.
            var open = BuildState.New(AnomalyReviewFixture.C1, 1)
                .WithChoice(Slots.FirstStageEngine, "eng_single")
                .WithChoice(Slots.FirstStageTank, "tank_first");
            var pdr = DesignReview.Run(ReviewKind.Pdr, open, Catalog);
            Assert.Equal(Severity.Blocker, Find(pdr, ValidationRules.LiftoffTwr)!.Severity);
            Assert.True(pdr.BlockersFixableByLaterVotes);
            Assert.True(pdr.PassAllowed);

            // With one engine already voted, nothing later can fix it.
            var stuck = DesignReview.Run(ReviewKind.Pdr, open.WithChoice(Slots.FirstStageEngineCount, "cnt_1"), Catalog);
            Assert.Equal(1, stuck.Blockers);
            Assert.False(stuck.BlockersFixableByLaterVotes);
            Assert.False(stuck.PassAllowed);
        }

        [Fact]
        public void Low_estimated_success_is_major_at_cdr_and_frr_but_not_pdr()
        {
            // Untested parts show their base reliability: 0.99⁵ × 0.75 (risky instrument)
            //   = 0.950990 × 0.75 = 0.713243 → 71.3% < 80%.
            var b = Full(instrument: "inst_risky");
            Assert.Null(Find(DesignReview.Run(ReviewKind.Pdr, b, Catalog), DesignReview.SuccessRule));
            foreach (var kind in new[] { ReviewKind.Cdr, ReviewKind.Frr })
            {
                var issue = Find(DesignReview.Run(kind, b, Catalog), DesignReview.SuccessRule)!;
                Assert.Equal(Severity.Major, issue.Severity);
                Assert.Equal("71.3", issue.Args["pct"]);
            }
            // 0.99⁶ = 94.1% (reference build) is above the threshold.
            Assert.Null(Find(DesignReview.Run(ReviewKind.Cdr, Full(), Catalog), DesignReview.SuccessRule));
        }

        [Fact]
        public void An_unfixed_revealed_flaw_is_major_in_every_review_until_fixed()
        {
            var flawed = AnomalyReviewFixture.WithRevealedFlaw(Full(), Slots.FirstStageEngine);
            foreach (var kind in new[] { ReviewKind.Pdr, ReviewKind.Cdr, ReviewKind.Frr })
            {
                var issue = Find(DesignReview.Run(kind, flawed, Catalog), DesignReview.FlawRule)!;
                Assert.Equal(Severity.Major, issue.Severity);
                Assert.Equal(Slots.FirstStageEngine, issue.Args["category"]);
                Assert.Equal("A known flaw in first_stage_engine is not fixed.", issue.Text);
            }
            var fixedBuild = TestCampaign.FixFlaw(flawed, Catalog, Slots.FirstStageEngine);
            Assert.Null(Find(DesignReview.Run(ReviewKind.Frr, fixedBuild, Catalog), DesignReview.FlawRule));
        }

        [Fact]
        public void Issues_are_sorted_blockers_then_majors_then_minors()
        {
            // FRR: weak radio (Minor), open flaw (Major), over budget and missing avionics (2 Blockers).
            var b = AnomalyReviewFixture.WithRevealedFlaw(Spend(Full(comms: "comm_weak"), 80, 0), Slots.FirstStageEngine)
                .WithoutChoice(Slots.Avionics);
            var r = DesignReview.Run(ReviewKind.Frr, b, Catalog);
            Assert.Equal(2, r.Blockers);
            Assert.Equal(1, r.Majors);
            Assert.Equal(1, r.Minors);
            Assert.Equal(new[] { Severity.Blocker, Severity.Blocker, Severity.Major, Severity.Minor }, r.Issues.Select(i => i.Severity));
            Assert.Equal(DesignReview.FlawRule, r.Issues[2].RuleId);
            Assert.Equal(ValidationRules.DataBudget, r.Issues[3].RuleId);
        }

        [Theory]
        [InlineData(Slots.FirstStageEngine, 3.0)]  // $5 M × 2 engines × 0.30
        [InlineData(Slots.UpperStageEngine, 0.9)]  // $3 M × 1 engine × 0.30
        [InlineData(Slots.PayloadInstrument, 3.0)] // $10 M × 0.30
        [InlineData(Slots.Avionics, 0.6)]          // $2 M × 0.30
        [InlineData(Slots.FirstStageTank, 0.3)]    // $1 M × material 1.0 × 0.30
        public void Rework_fee_is_thirty_percent_of_the_replaced_parts_cost(string slot, double feeM)
        {
            Assert.Equal(feeM, DesignReview.ReworkFeeM(Full(), Catalog, slot), 12);
        }

        [Fact]
        public void Rework_charges_the_fee_and_two_days_and_reopens_the_slot()
        {
            var b = Full();
            var r = DesignReview.Rework(b, Catalog, ReviewKind.Cdr, Slots.FirstStageEngine);
            var entry = r.Ledger.Last();
            Assert.Equal(LedgerKind.Rework, entry.Kind);
            Assert.Equal("rework:cdr:first_stage_engine", entry.SourceId);
            Assert.Equal(3.0, entry.CostM, 12);
            Assert.Equal(BuildConstants.ReworkBaseDays, entry.Days);
            Assert.Equal(Slots.FirstStageEngine, entry.Category);
            Assert.Equal(Slots.FirstStageEngine, r.ReopenedCategory);
            Assert.Equal(Slots.FirstStageEngine, VoteOptions.NextVote(r, Catalog));
            Assert.Equal("eng_single", r.Choice(Slots.FirstStageEngine)); // old part stays until the re-vote

            var d = Dashboard.Compute(r, Catalog).Budget;
            Assert.Equal(31.0, d.TotalCostM, 9); // 28 + 3
            Assert.Equal(262.0, d.TotalDays, 9); // 260 + 2

            Assert.Throws<InvalidOperationException>(() =>
                DesignReview.ReworkFeeM(b.WithoutChoice(Slots.Avionics), Catalog, Slots.Avionics));
        }

        [Fact]
        public void CompleteRework_replaces_the_part_resets_its_condition_and_closes_the_vote()
        {
            var flawed = AnomalyReviewFixture.WithRevealedFlaw(Full(), Slots.FirstStageEngine);
            var reopened = DesignReview.Rework(flawed, Catalog, ReviewKind.Frr, Slots.FirstStageEngine);
            var done = DesignReview.CompleteRework(reopened, Catalog, "eng_plain");
            Assert.Equal("eng_plain", done.Choice(Slots.FirstStageEngine));
            Assert.Null(done.ReopenedCategory);
            Assert.Empty(TestCampaign.OpenFlaws(done));
            Assert.Null(Find(DesignReview.Run(ReviewKind.Frr, done, Catalog), DesignReview.FlawRule));

            // Parts 28 − old engines $5 M × 2 + new engines $4 M × 2 = 26; + fee 3 = 29.
            Assert.Equal(29.0, Dashboard.Compute(done, Catalog).Budget.TotalCostM, 9);
        }

        [Fact]
        public void CompleteRework_rejects_a_part_of_the_wrong_category_and_needs_an_open_vote()
        {
            var b = Full();
            Assert.Throws<InvalidOperationException>(() => DesignReview.CompleteRework(b, Catalog, "eng_plain")); // nothing reopened

            var tank = DesignReview.Rework(b, Catalog, ReviewKind.Pdr, Slots.UpperStageTank);
            Assert.Throws<InvalidOperationException>(() => DesignReview.CompleteRework(tank, Catalog, "eng_plain"));
            // A per-stage slot takes its category's parts: upper_stage_tank_size ← tank_size.
            var redone = DesignReview.CompleteRework(tank, Catalog, "tank_upper");
            Assert.Null(redone.ReopenedCategory);

            var engine = DesignReview.Rework(b, Catalog, ReviewKind.Cdr, Slots.FirstStageEngine);
            Assert.Throws<InvalidOperationException>(() => DesignReview.CompleteRework(engine, Catalog, "eng_upper")); // upper-stage engine
        }

        [Fact]
        public void Frr_poll_go_proceeds_any_no_go_repolls_and_two_no_go_rounds_offer_rework()
        {
            Assert.Equal(15.0, FrrPoll.DiscussionSeconds);
            var start = FrrPoll.Start;
            Assert.Equal(0, start.NoGoRounds);

            var (go, afterGo) = start.Record(goVotes: 6, noGoVotes: 0);
            Assert.Equal(PollOutcome.Go, go);
            Assert.Equal(0, afterGo.NoGoRounds);

            var (first, p1) = start.Record(5, 1);
            Assert.Equal(PollOutcome.DiscussAndRepoll, first);
            Assert.Equal(1, p1.NoGoRounds);
            Assert.Equal(0, start.NoGoRounds); // immutable

            // Re-poll after discussion: all GO → proceed.
            Assert.Equal(PollOutcome.Go, p1.Record(6, 0).outcome);

            // Re-poll still NO-GO → Rework option opens automatically, and stays offered.
            var (second, p2) = p1.Record(4, 2);
            Assert.Equal(PollOutcome.ReworkOffered, second);
            Assert.Equal(BuildConstants.FrrNoGoRoundsForRework, p2.NoGoRounds);
            Assert.Equal(PollOutcome.ReworkOffered, p2.Record(5, 1).outcome);

            Assert.Throws<ArgumentOutOfRangeException>(() => start.Record(-1, 0));
            Assert.Throws<ArgumentOutOfRangeException>(() => start.Record(3, -1));
        }
    }
}
