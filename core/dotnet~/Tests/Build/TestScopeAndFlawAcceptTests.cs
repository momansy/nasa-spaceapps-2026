using System.Linq;
using MissionForge.Core.Build;
using MissionForge.Core.Data;
using MissionForge.Core.Tests.Data;
using Xunit;

namespace MissionForge.Core.Tests.Build
{
    /// <summary>T010 steps 3 and 4: the real-data test scope <c>any_part</c> and "fly as-is" on Test Failure.</summary>
    public class TestScopeAndFlawAcceptTests
    {
        private static readonly GameCatalog Real = DesignFixture.Catalog();
        private const string Qual = "component_qualification";

        [Fact]
        public void Any_part_scope_offers_component_qualification_only_for_parts_with_a_reliability()
        {
            Assert.Equal(new[] { "any_part" }, Real.Test(Qual).AppliesTo);
            var b = BuildState.New("C1", 1)
                .WithChoice(Slots.Avionics, "avi_commercial_single")       // has a reliability
                .WithChoice(Slots.FirstStageTank, "tank_s");               // a tank: no reliability of its own
            Assert.NotNull(TestCampaign.Offer(b, Real, Qual, Slots.Avionics));
            Assert.Null(TestCampaign.Offer(b, Real, Qual, Slots.FirstStageTank));
            Assert.Contains(TestCampaign.Available(b, Real), o => o.Test.Id == Qual && o.TargetCategory == Slots.Avionics);
        }

        /// <summary>A build whose first-stage engine has a hidden flaw that component qualification reveals (seed searched below).</summary>
        private static (BuildState build, ulong seed) FlawRevealedBuild()
        {
            var engine = Real.Part("eng_kerolox_workhorse");
            for (ulong seed = 1; seed < 500; seed++)
            {
                if (!ReliabilityModel.Hidden(seed, engine).HasFlaw) continue;
                var b = BuildState.New("C1", seed).WithChoice(Slots.FirstStageEngine, engine.Id);
                var outcome = TestCampaign.Run(b, Real, Qual, Slots.FirstStageEngine, minigameTier: 4);
                if (outcome.FlawRevealed) return (outcome.Build, seed);
            }
            throw new Xunit.Sdk.XunitException("no seed below 500 reveals a flaw");
        }

        [Fact]
        public void Fly_as_is_accepts_the_flaw_everywhere_but_keeps_the_true_reliability_penalty()
        {
            var (revealed, seed) = FlawRevealedBuild();
            Assert.Equal(new[] { Slots.FirstStageEngine }, TestCampaign.OpenFlaws(revealed));
            Assert.True(AnomalyConditions.Holds("flaw_revealed", new Vehicle(revealed, Real)));
            Assert.Contains(DesignReview.Run(ReviewKind.Pdr, revealed, Real).Issues, i => i.RuleId == DesignReview.FlawRule);
            var trueBefore = ReliabilityModel.TrueSuccess(new Vehicle(revealed, Real)).Success;

            var drawn = AnomalyDeck.DrawSpecific(revealed, Real, "test_failure");
            Assert.Equal(Slots.FirstStageEngine, drawn.TargetCategory);
            var accepted = AnomalyDeck.Respond(drawn.Build, Real, "test_failure", "fly_as_is");

            Assert.True(accepted.HasFlag("flaw_accepted:" + Slots.FirstStageEngine));
            Assert.True(TestCampaign.IsFlawAccepted(accepted, Slots.FirstStageEngine));
            Assert.Empty(TestCampaign.OpenFlaws(accepted));
            Assert.False(AnomalyConditions.Holds("flaw_revealed", new Vehicle(accepted, Real)));
            Assert.DoesNotContain(DesignReview.Run(ReviewKind.Pdr, accepted, Real).Issues, i => i.RuleId == DesignReview.FlawRule);
            Assert.DoesNotContain(DesignReview.Run(ReviewKind.Frr, accepted, Real).Issues, i => i.RuleId == DesignReview.FlawRule);
            // Test Failure cannot be drawn again for the accepted flaw.
            Assert.DoesNotContain(AnomalyDeck.Weights(accepted, Real), w => w.Card.Id == "test_failure" && w.Weight > 0);

            // The hidden truth is untouched: still flawed, flaw not fixed → the true success keeps its penalty.
            var cond = accepted.Condition(Slots.FirstStageEngine);
            Assert.True(cond.FlawRevealed);
            Assert.False(cond.FlawFixed);
            var trueAfter = ReliabilityModel.TrueSuccess(new Vehicle(accepted, Real)).Success;
            Assert.Equal(trueBefore, trueAfter, 12);
            var fixedBuild = TestCampaign.FixFlaw(revealed, Real, Slots.FirstStageEngine);
            Assert.True(ReliabilityModel.TrueSuccess(new Vehicle(fixedBuild, Real)).Success > trueAfter);
            Assert.True(seed > 0);
        }

        [Fact]
        public void Other_responses_do_not_accept_the_flaw()
        {
            var (revealed, _) = FlawRevealedBuild();
            var drawn = AnomalyDeck.DrawSpecific(revealed, Real, "test_failure");
            var fixedBuild = AnomalyDeck.Respond(drawn.Build, Real, "test_failure", "fix");
            Assert.False(TestCampaign.IsFlawAccepted(fixedBuild, Slots.FirstStageEngine));
            Assert.Empty(TestCampaign.OpenFlaws(fixedBuild)); // fixed instead
        }
    }
}
