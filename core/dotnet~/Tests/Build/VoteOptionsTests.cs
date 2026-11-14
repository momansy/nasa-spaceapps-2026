using System;
using System.Collections.Generic;
using System.Linq;
using MissionForge.Core.Build;
using MissionForge.Core.Data;
using Xunit;
using F = MissionForge.Core.Tests.Build.ValidationVoteFixtures;

namespace MissionForge.Core.Tests.Build
{
    public class VoteOptionsTests
    {
        // ------------------------------------------------------------ fixtures

        /// <summary>Propulsion-only contract: Δv 8 500 m/s, generous budget and schedule.</summary>
        private static GameCatalog FlightCatalog() => F.Catalog(
            new ContractDef("C1", "Flight", 1000, 8500, 1000, 1000, F.PropulsionVotes()));

        /// <summary>
        /// Budget contract: $100 M, 180 days, fairing vote first. Fairings (cost $M, lead d, integ d):
        /// small 20/30/5, mid 105/30/5 (over by 5), huge 125/30/5 (over by 25), slow 10/200/5 (late by 25 d).
        /// Propulsion votes keep TWR and Δv undecided, so Partial validation has nothing to say.
        /// </summary>
        private static GameCatalog BudgetCatalog()
        {
            var parts = F.StandardParts();
            parts.Add(F.Part("fair_small", PartCategories.Fairing, 1000, 20, 30, 5));
            parts.Add(F.Part("fair_mid", PartCategories.Fairing, 1000, 105, 30, 5));
            parts.Add(F.Part("fair_huge", PartCategories.Fairing, 1000, 125, 30, 5));
            parts.Add(F.Part("fair_slow", PartCategories.Fairing, 1000, 10, 200, 5));
            var votes = new List<ContractVote> { F.Vote(Slots.Fairing, "fair_small", "fair_mid", "fair_huge", "fair_slow") };
            votes.AddRange(F.PropulsionVotes());
            return new GameCatalog(parts, new[] { new ContractDef("C1", "Budget", 1000, 8500, 100, 180, votes) });
        }

        private static VoteOption Option(IReadOnlyList<VoteOption> options, string id) => options.Single(o => o.Part.Id == id);

        // ------------------------------------------------------------ FixSearch (design 4.2)

        [Fact]
        public void FixSearch_finds_engine_count_that_fixes_low_twr()
        {
            // Workhorse on tank M with the count undecided flies as one engine: TWR 0.27 → Blocker now.
            var cat = FlightCatalog();
            var build = F.TwoStage("C1");
            Assert.True(Validator.HasBlocker(Validator.Validate(build, cat)));

            // Nine engines: TWR 2.39, Δv 13 469 m/s ≥ 8 500 → no Blocker.
            var fix = FixSearch.Run(build, cat);
            Assert.True(fix.Exists);
            Assert.False(fix.Inconclusive);
            Assert.NotNull(fix.Example);
            Assert.Equal(F.Count9, fix.Example!.Choice(Slots.FirstStageEngineCount));
            Assert.False(Validator.HasBlocker(Validator.Validate(fix.Example, cat)));
            Assert.False(build.Has(Slots.FirstStageEngineCount)); // input untouched
        }

        [Fact]
        public void FixSearch_tries_more_engines_first()
        {
            // Order(): "most capable options first: more thrust, more engines, then lighter". Engine-count options
            // carry no thrust, so the count itself must rank them: 9 engines is tried first and fixes TWR at once.
            var fix = FixSearch.Run(F.TwoStage("C1"), FlightCatalog());
            Assert.Equal(1, fix.Evaluations);
        }

        [Fact]
        public void FixSearch_reports_no_fix_when_no_remaining_vote_can_help()
        {
            // Electric-Pump Mini on tank M: even 9 × 24 kN = 216 kN against ≈ 322 t gives TWR 0.068.
            var build = F.TwoStage("C1", firstEngine: F.EPumpMini);
            var fix = FixSearch.Run(build, FlightCatalog());
            Assert.False(fix.Exists);
            Assert.False(fix.Inconclusive);
            Assert.Equal(3, fix.Evaluations); // counts 1, 3 and 9 all fail
            Assert.Null(fix.Example);
        }

        [Fact]
        public void FixSearch_is_optimistic_and_inconclusive_when_capped()
        {
            var build = F.TwoStage("C1", firstEngine: F.EPumpMini);
            var fix = FixSearch.Run(build, FlightCatalog(), maxEvaluations: 1);
            Assert.True(fix.Exists);
            Assert.True(fix.Inconclusive);
            Assert.Equal(1, fix.Evaluations);
            Assert.Null(fix.Example);
        }

        // ------------------------------------------------------------ VotesFor / NextVote / Offered / Applicable

        [Fact]
        public void VotesFor_skips_escape_vote_when_uncrewed_and_votes_without_options()
        {
            // The RCS vote lists nothing and the catalog has no RCS part, so it has no options at all.
            ContractDef Make(string id, bool crewed) => new ContractDef(id, id, 1000, 9000, 100, 100, new[]
            {
                F.Vote(Slots.LaunchEscape, F.EscapeTower),
                F.Vote(Slots.Rcs),
                F.Vote(Slots.UpperStageEngine, F.KeroloxVac, F.HydroloxVac),
            }, crewed: crewed);
            var cat = new GameCatalog(F.StandardParts(), new[] { Make("C1", false), Make("C4", true) });

            Assert.Equal(new[] { Slots.UpperStageEngine }, VoteOptions.VotesFor(cat.Contract("C1")).Select(v => v.Slot));
            Assert.Equal(new[] { Slots.LaunchEscape, Slots.UpperStageEngine }, VoteOptions.VotesFor(cat.Contract("C4")).Select(v => v.Slot));
        }

        [Fact]
        public void NextVote_follows_contract_order_and_returns_reopened_slot_first()
        {
            var cat = BudgetCatalog();
            var b = BuildState.New("C1", 1);
            Assert.Equal(Slots.Fairing, VoteOptions.NextVote(b, cat));

            b = b.WithChoice(Slots.Fairing, "fair_small");
            Assert.Equal(Slots.UpperStageEngine, VoteOptions.NextVote(b, cat));

            var done = F.TwoStage("C1", count: F.Count9).WithChoice(Slots.Fairing, "fair_small");
            Assert.Null(VoteOptions.NextVote(done, cat));
            Assert.Equal(Slots.Fairing, VoteOptions.NextVote(done.WithReopened(Slots.Fairing), cat));
        }

        [Fact]
        public void Offered_filters_by_contract_and_applicability_and_caps_at_five()
        {
            // Eight fairings: f2 only for C4, f3 crewed_only, f4 uncrewed_only.
            var parts = F.StandardParts();
            for (int i = 1; i <= 8; i++)
            {
                var id = "f" + i;
                parts.Add(F.Part(id, PartCategories.Fairing, 1000, 5, 10, 1,
                    contracts: i == 2 ? new[] { "C4" } : null,
                    tags: i == 3 ? new[] { "crewed_only" } : i == 4 ? new[] { "uncrewed_only" } : null));
            }
            var ids = Enumerable.Range(1, 8).Select(i => "f" + i).ToArray();
            var cat = new GameCatalog(parts, new[]
            {
                new ContractDef("C1", "Uncrewed", 1000, 9000, 100, 100, new[] { F.Vote(Slots.Fairing, ids) }),
                new ContractDef("C4", "Crewed", 1000, 9000, 100, 100, new[] { F.Vote(Slots.Fairing, ids) }, crewed: true),
            });

            // C1: f2 (other contract) and f3 (crewed only) dropped → f1 f4 f5 f6 f7, f8 cut by the cap of 5.
            Assert.Equal(new[] { "f1", "f4", "f5", "f6", "f7" },
                VoteOptions.Offered(BuildState.New("C1", 1), cat, Slots.Fairing).Select(p => p.Id));
            // C4: f4 (uncrewed only) dropped → f1 f2 f3 f5 f6.
            Assert.Equal(new[] { "f1", "f2", "f3", "f5", "f6" },
                VoteOptions.Offered(BuildState.New("C4", 1), cat, Slots.Fairing).Select(p => p.Id));
            // No vote for the slot → nothing offered.
            Assert.Empty(VoteOptions.Offered(BuildState.New("C1", 1), cat, Slots.Rcs));
        }

        [Fact]
        public void Applicable_rejects_liquid_side_boosters_without_first_stage_and_escape_when_uncrewed()
        {
            var parts = F.StandardParts();
            var lsb = F.Part("boost_liquid_side", PartCategories.StrapOnBooster, 0, 0, 0, 0,
                new Dictionary<string, double> { ["booster_count"] = 2 }, tags: new[] { "mirror_first_stage" });
            parts.Add(lsb);
            var cat = new GameCatalog(parts, new[] { new ContractDef("C1", "C1", 1000, 9000, 100, 100, F.PropulsionVotes()) });
            var empty = BuildState.New("C1", 1);

            Assert.False(VoteOptions.Applicable(empty, cat, lsb));
            Assert.True(VoteOptions.Applicable(empty.WithChoice(Slots.FirstStageEngine, F.Workhorse), cat, lsb));
            Assert.False(VoteOptions.Applicable(empty, cat, cat.Part(F.EscapeTower)));
        }

        // ------------------------------------------------------------ For(): affordability and flyability

        [Fact]
        public void For_reports_budget_and_schedule_overruns()
        {
            var cat = BudgetCatalog();
            var options = VoteOptions.For(BuildState.New("C1", 1), cat, Slots.Fairing);
            Assert.Equal(new[] { "fair_small", "fair_mid", "fair_huge", "fair_slow" }, options.Select(o => o.Part.Id));

            // small: $20 M of $100 M, 30 + 5 = 35 d of 180 d
            var small = Option(options, "fair_small");
            Assert.Equal(0, small.OverBudgetM);
            Assert.Equal(0, small.OverScheduleDays);
            Assert.True(small.Affordable);
            Assert.True(small.CanWin);
            Assert.False(small.WillNotFly);
            Assert.Null(small.Fix);
            Assert.Equal(Slots.Fairing, small.Preview.Category);

            // mid: 100 − 105 = −5 → "Over budget by $5 M"; Emergency Funding = 10% of 100 = $10 M covers it
            var mid = Option(options, "fair_mid");
            Assert.Equal(5, mid.OverBudgetM, 9);
            Assert.False(mid.Affordable);
            Assert.True(mid.RequiresEmergencyFunding);
            Assert.True(mid.CanUseEmergencyFunding);
            Assert.True(mid.CanWin);

            // huge: over by $25 M > $10 M of Emergency Funding → cannot win
            var huge = Option(options, "fair_huge");
            Assert.Equal(25, huge.OverBudgetM, 9);
            Assert.False(huge.CanUseEmergencyFunding);
            Assert.False(huge.CanWin);

            // slow: 200 + 5 = 205 d vs 180 d → 25 d late; schedule overruns may still win (they slip the launch)
            var slow = Option(options, "fair_slow");
            Assert.Equal(0, slow.OverBudgetM);
            Assert.Equal(25, slow.OverScheduleDays, 9);
            Assert.False(slow.Affordable);
            Assert.True(slow.CanWin);
        }

        [Fact]
        public void For_over_budget_option_cannot_win_once_Emergency_Funding_is_used()
        {
            var cat = BudgetCatalog();
            var used = VoteOptions.UseEmergencyFunding(BuildState.New("C1", 1), cat);
            // Budget is now 110: mid ($105 M) is affordable, huge ($125 M) is over by 15 with no funding left.
            var options = VoteOptions.For(used, cat, Slots.Fairing);
            Assert.True(Option(options, "fair_mid").Affordable);
            var huge = Option(options, "fair_huge");
            Assert.Equal(15, huge.OverBudgetM, 9);
            Assert.False(huge.CanUseEmergencyFunding);
            Assert.False(huge.CanWin);
        }

        [Fact]
        public void For_marks_will_not_fly_and_allows_win_only_if_a_later_vote_fixes_it()
        {
            // Upper stage and Workhorse decided, count undecided; voting on the first-stage tank.
            var cat = FlightCatalog();
            var options = VoteOptions.For(F.TwoStage("C1", firstTank: null), cat, Slots.FirstStageTank);

            // XS: 40 920 kg, TWR 2.12, Δv 8 789 ≥ 8 500 → flies.
            var xs = Option(options, F.TankXs);
            Assert.False(xs.WillNotFly);
            Assert.Null(xs.Fix);

            // M: TWR 0.27 with one engine → Will not fly, but the later count vote (9 engines) fixes it.
            var m = Option(options, F.TankM);
            Assert.True(m.WillNotFly);
            Assert.Equal(ValidationRules.LiftoffTwr, Assert.Single(m.Blockers).RuleId);
            Assert.True(m.Fix!.Exists);
            Assert.True(m.CanWin);
        }

        [Fact]
        public void For_will_not_fly_without_fix_cannot_win()
        {
            // Count vote reopened with tank M already decided: no later vote can raise the thrust.
            var cat = FlightCatalog();
            var options = VoteOptions.For(F.TwoStage("C1"), cat, Slots.FirstStageEngineCount);

            var one = Option(options, F.Count1);   // TWR 0.27
            Assert.True(one.WillNotFly);
            Assert.False(one.Fix!.Exists);
            Assert.False(one.CanWin);
            var three = Option(options, F.Count3); // TWR 0.80
            Assert.False(three.CanWin);
            var nine = Option(options, F.Count9);  // TWR 2.39
            Assert.False(nine.WillNotFly);
            Assert.True(nine.CanWin);

            // Without the fix search a blocked option cannot win either.
            var noSearch = VoteOptions.For(F.TwoStage("C1", firstTank: null), cat, Slots.FirstStageTank, runFixSearch: false);
            var m = Option(noSearch, F.TankM);
            Assert.Null(m.Fix);
            Assert.False(m.CanWin);
        }

        // ------------------------------------------------------------ Commit / Emergency Funding

        [Fact]
        public void Commit_affordable_option_records_the_vote_without_Emergency_Funding()
        {
            var cat = BudgetCatalog();
            var b0 = BuildState.New("C1", 1);
            var b1 = VoteOptions.Commit(b0, cat, Slots.Fairing, "fair_small");

            Assert.Equal("fair_small", b1.Choice(Slots.Fairing));
            Assert.Equal(1, b1.VotesCompleted);
            Assert.False(b1.HasFlag(VoteOptions.EmergencyFundingUsedFlag));
            Assert.Empty(b1.Ledger);
            Assert.False(b0.Has(Slots.Fairing)); // immutable input
        }

        [Fact]
        public void Commit_over_budget_option_uses_Emergency_Funding()
        {
            var cat = BudgetCatalog();
            var b1 = VoteOptions.Commit(BuildState.New("C1", 1), cat, Slots.Fairing, "fair_mid");

            Assert.Equal("fair_mid", b1.Choice(Slots.Fairing));
            Assert.True(b1.HasFlag(VoteOptions.EmergencyFundingUsedFlag));
            var entry = Assert.Single(b1.Ledger);
            Assert.Equal(LedgerKind.Budget, entry.Kind);
            Assert.Equal(10, entry.BudgetDeltaM, 9); // +10% of $100 M
            var budget = Dashboard.Compute(b1, cat).Budget;
            Assert.Equal(110, budget.BudgetM, 9);
            Assert.Equal(5, budget.RemainingM, 9);   // 110 − 105
        }

        [Fact]
        public void Commit_throws_for_options_that_cannot_win_or_are_not_offered()
        {
            var cat = BudgetCatalog();
            var b0 = BuildState.New("C1", 1);
            Assert.Throws<InvalidOperationException>(() => VoteOptions.Commit(b0, cat, Slots.Fairing, "fair_huge"));
            Assert.Throws<InvalidOperationException>(() => VoteOptions.Commit(b0, cat, Slots.Fairing, F.Fairing4m));

            var used = VoteOptions.UseEmergencyFunding(b0, cat);
            Assert.Throws<InvalidOperationException>(() => VoteOptions.UseEmergencyFunding(used, cat));

            var flight = FlightCatalog();
            Assert.Throws<InvalidOperationException>(() => VoteOptions.Commit(F.TwoStage("C1"), flight, Slots.FirstStageEngineCount, F.Count1));
            Assert.Equal(F.Count9, VoteOptions.Commit(F.TwoStage("C1"), flight, Slots.FirstStageEngineCount, F.Count9)
                .Choice(Slots.FirstStageEngineCount));
        }
    }
}
