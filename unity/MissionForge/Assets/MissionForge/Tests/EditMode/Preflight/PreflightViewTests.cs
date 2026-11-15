using System.Collections.Generic;
using MissionForge.Core.Build;
using MissionForge.Core.Data;
using MissionForge.Screens.BuildBay;
using MissionForge.Screens.Review;
using Newtonsoft.Json.Linq;
using NUnit.Framework;

namespace MissionForge.Screens.Preflight.Tests
{
    /// <summary>
    /// T027 view-model tests: contract cards and CAPCOM lines from Core's contract data, review report → view mapping
    /// identical to <see cref="DesignReview.Run"/>, rework category choices, vote payloads, server-clock timers and the
    /// rehearsal driver's option lean. The real catalog (data/) is loaded through <see cref="PreflightTestCatalog"/>.
    /// </summary>
    public sealed class PreflightViewTests
    {
        private static GameCatalog Catalog => PreflightTestCatalog.Catalog;
        private static PreflightText Text => PreflightText.From(Catalog.Strings);

        private static BuildState FullC1(out BuildState beforeLast)
        {
            BuildState b = BuildState.New("C1", PreflightTestCatalog.Seed);
            beforeLast = b;
            for (int i = 0; i < 128; i++)
            {
                string slot = VoteOptions.NextVote(b, Catalog);
                if (slot == null) break;
                beforeLast = b;
                b = VoteOptions.Commit(b, Catalog, slot, SeededBuilds.Pick(b, Catalog, slot, i));
            }
            return b;
        }

        [Test]
        public void ContractCard_C1_ShowsCoreNumbersWithUnits()
        {
            ContractDef c1 = Catalog.Contracts["C1"];
            ContractBriefing b = ContractBriefing.From(c1, Text);

            Assert.AreEqual(3, b.Facts.Count);
            StringAssert.Contains("9.70", b.Facts[0].Value, "Δv from Core (9,700 m/s) in km/s");
            StringAssert.Contains(Text.Get("ui.buildbay.unit.km_s"), b.Facts[0].Value);
            StringAssert.Contains("90", b.Facts[1].Value);
            StringAssert.Contains(Text.Get("ui.buildbay.unit.money_m"), b.Facts[1].Value);
            StringAssert.Contains("180", b.Facts[2].Value);
            StringAssert.Contains(Text.Get("ui.buildbay.unit.days"), b.Facts[2].Value);
            Assert.AreEqual("primary", b.Objectives[0].Kind);
            Assert.IsTrue(b.Constraints.Exists(s => s.Contains("97.6")), "inclination constraint from the contract data");
        }

        [Test]
        public void CapcomLines_C1IsWrittenInFull_OtherContractsUseTheFilledTemplate()
        {
            IReadOnlyList<string> c1 = ContractBriefing.From(Catalog.Contracts["C1"], Text).CapcomLines(Text);
            Assert.GreaterOrEqual(c1.Count, 5);
            foreach (string line in c1) StringAssert.DoesNotContain("{", line, "every placeholder filled");

            ContractBriefing c2 = ContractBriefing.From(Catalog.Contracts["C2"], Text);
            IReadOnlyList<string> t = c2.CapcomLines(Text);
            Assert.IsTrue(t.Count > 0);
            StringAssert.Contains(c2.Name, t[0]);
            foreach (string line in t) StringAssert.DoesNotContain("{", line);
        }

        [Test]
        public void Difficulty_IsShapeLevelFromContractNumbers()
        {
            Assert.AreEqual(1, ContractBriefing.DifficultyOf(Catalog.Contracts["C0"]));
            Assert.AreEqual(2, ContractBriefing.DifficultyOf(Catalog.Contracts["C1"]));
        }

        [Test]
        public void FrrReport_ForTheViews_IsExactlyCoreDesignReview()
        {
            BuildState full = FullC1(out BuildState shortOne);
            ReviewReport clean = DesignReview.Run(ReviewKind.Frr, full, Catalog);
            ReviewReport blocked = DesignReview.Run(ReviewKind.Frr, shortOne, Catalog);

            Assert.AreEqual(0, clean.Blockers, string.Join("; ", clean.Issues));
            Assert.Greater(blocked.Blockers, 0);
            Assert.IsFalse(blocked.PassAllowed, "FRR never passes a Blocker");

            // The REVIEW vote payload follows the report: PASS only when Core allows it.
            JObject open = PreflightVotes.ReviewRound("r1", blocked, 7);
            var ids = new List<string>();
            foreach (JToken o in (JArray)open["options"]) ids.Add((string)o["id"]);
            CollectionAssert.AreEqual(new[] { PreflightVotes.Rework }, ids);
            JObject openClean = PreflightVotes.ReviewRound("r2", clean, 7);
            Assert.AreEqual(PreflightVotes.Pass, (string)openClean["options"][0]["id"]);

            // Issue text: the category id is shown by its player-facing name.
            ValidationIssue incomplete = blocked.Issues[0];
            string text = FrrViews.IssueText(incomplete, Text);
            string slot = incomplete.Args["category"];
            StringAssert.Contains(Text.Get("vote." + slot + ".name"), text);
        }

        [Test]
        public void ReworkChoices_FallBackToHighestFees_AndCarryCoreFees()
        {
            BuildState full = FullC1(out BuildState shortOne);
            ReviewReport blocked = DesignReview.Run(ReviewKind.Frr, shortOne, Catalog);
            List<string> slots = ReviewSlots.For(blocked, shortOne, Catalog);

            Assert.AreEqual(ReviewSlots.FallbackCount, slots.Count, "the undecided category cannot be reworked, so the fallback applies");
            for (int i = 1; i < slots.Count; i++)
                Assert.GreaterOrEqual(DesignReview.ReworkFeeM(shortOne, Catalog, slots[i - 1]), DesignReview.ReworkFeeM(shortOne, Catalog, slots[i]));

            JObject open = PreflightVotes.ReworkCategory("rw", ReviewKind.Frr, shortOne, Catalog, slots, 3);
            JArray options = (JArray)open["options"];
            Assert.AreEqual(slots.Count, options.Count);
            Assert.AreEqual(System.Math.Round(DesignReview.ReworkFeeM(shortOne, Catalog, slots[0]), 4), (double)options[0]["costM"], 1e-9);
        }

        [Test]
        public void Timer_UsesServerClockWithOffset()
        {
            long local = 1_000_000;
            long server = VoteClock.ServerNowMs(local, 2500.4);
            Assert.AreEqual(1_002_500, server);
            Assert.AreEqual(5, VoteClock.SecondsLeft(server + 4200, server), "rounds up to whole seconds");
            Assert.AreEqual(0, VoteClock.SecondsLeft(server - 10, server));
            Assert.IsNull(VoteClock.SecondsLeft(null, server));
        }

        [Test]
        public void RehearsalLean_ListsTheOptionFirst_WithoutChangingTheSet()
        {
            var channel = new PreflightRehearsalChannel(1, 4, 1f, () => 0) { LeanOptionId = PreflightVotes.Rework };
            var opened = new List<JObject>();
            channel.Received += (type, d) => { if (type == "vote.opened") opened.Add(d); };
            BuildState full = FullC1(out _);
            ReviewReport clean = DesignReview.Run(ReviewKind.Cdr, full, Catalog);
            channel.Send("vote.open", PreflightVotes.ReviewRound("lean", clean, 1));
            channel.Tick();
            Assert.AreEqual(1, opened.Count);
            JArray options = (JArray)opened[0]["options"];
            Assert.AreEqual(PreflightVotes.Rework, (string)options[0]["id"]);
            Assert.AreEqual(2, options.Count);
        }

        [Test]
        public void TestStandOutcome_IsCoreTestCampaignRun_ForTheSameSeed()
        {
            BuildState full = FullC1(out _);
            TestOffer offer = null;
            foreach (TestOffer o in TestCampaign.Available(full, Catalog))
                if (o.TargetCategory != TestCampaign.VehicleTarget) { offer = o; break; }
            Assert.IsNotNull(offer, "a part test is available on the C1 build");

            // The screen marks the offer, then runs Core's test: marking must not change Core's seeded roll.
            BuildState marked = PreflightSchedule.MarkTestOffered(full, offer);
            TestOutcome viaScreen = TestCampaign.Run(marked, Catalog, offer.Test.Id, offer.TargetCategory, 0);
            TestOutcome direct = TestCampaign.Run(full, Catalog, offer.Test.Id, offer.TargetCategory, 0);
            Assert.AreEqual(direct.Roll, viaScreen.Roll);
            Assert.AreEqual(direct.RevealChance, viaScreen.RevealChance);
            Assert.AreEqual(direct.FlawRevealed, viaScreen.FlawRevealed);

            // Cost and days shown on the results card are the offer's, and they land in Core's budget.
            DashboardMetrics before = Dashboard.Compute(marked, Catalog);
            DashboardMetrics after = Dashboard.Compute(viaScreen.Build, Catalog);
            Assert.AreEqual(before.Budget.TotalCostM + offer.CostM, after.Budget.TotalCostM, 1e-6);
            Assert.LessOrEqual(after.Success.BandHalfWidth, before.Success.BandHalfWidth + 1e-12, "a test never widens the band");
        }
    }
}
