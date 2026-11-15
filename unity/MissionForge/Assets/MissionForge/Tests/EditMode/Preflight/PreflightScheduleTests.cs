using System.Collections.Generic;
using MissionForge.Core.Build;
using MissionForge.Core.Data;
using MissionForge.Screens.BuildBay;
using NUnit.Framework;

namespace MissionForge.Screens.Preflight.Tests
{
    public sealed class PreflightScheduleTests
    {
        private static BuildState Commit(BuildState b, int round, out string slot)
        {
            slot = VoteOptions.NextVote(b, PreflightTestCatalog.Catalog);
            return VoteOptions.Commit(b, PreflightTestCatalog.Catalog, slot, SeededBuilds.Pick(b, PreflightTestCatalog.Catalog, slot, round));
        }

        /// <summary>Drains the interludes after one commit the way a director does; returns them in order.</summary>
        private static List<string> Drain(ref BuildState b, string slot)
        {
            var log = new List<string>();
            string committed = slot;
            for (int guard = 0; guard < 12; guard++)
            {
                Interlude i = PreflightSchedule.After(b, PreflightTestCatalog.Catalog, committed);
                committed = null;
                if (i.Kind == InterludeKind.None) break;
                log.Add(i.ToString());
                if (i.Kind == InterludeKind.TestOffer) b = PreflightSchedule.MarkTestOffered(b, i.Offer);
                else b = PreflightSchedule.MarkReviewDone(b, i.Review);
            }
            return log;
        }

        [Test]
        public void C1_OffersAtMostOneTestPerCommitAndOnePdrAndOneCdr()
        {
            BuildState b = BuildState.New("C1", PreflightTestCatalog.Seed);
            var all = new List<string>();
            int round = 0;
            while (VoteOptions.NextVote(b, PreflightTestCatalog.Catalog) != null)
            {
                b = Commit(b, round++, out string slot);
                List<string> step = Drain(ref b, slot);
                int tests = step.FindAll(s => s.StartsWith("Test:")).Count;
                Assert.LessOrEqual(tests, 2, "at most one part test per commit (plus the wet dress rehearsal after the last): " + string.Join(",", step));
                all.AddRange(step);
            }
            Assert.AreEqual(1, all.FindAll(s => s == "Review:Pdr").Count, string.Join(" | ", all));
            Assert.AreEqual(1, all.FindAll(s => s == "Review:Cdr").Count, string.Join(" | ", all));
            Assert.Less(all.IndexOf("Review:Pdr"), all.IndexOf("Review:Cdr"));
            TestContext.WriteLine("C1 interludes: " + string.Join(" | ", all));
        }

        [Test]
        public void PdrWaitsForPropulsionVotes_AndCdrComesLast()
        {
            BuildState b = BuildState.New("C1", PreflightTestCatalog.Seed);
            int round = 0;
            int avionicsIndex = Slots.VoteOrder.IndexOf(Slots.Avionics);
            while (true)
            {
                string next = VoteOptions.NextVote(b, PreflightTestCatalog.Catalog);
                if (next == null) break;
                bool propulsionLeft = Slots.VoteOrder.IndexOf(next) < avionicsIndex && Slots.PropulsionGroup.Contains(next);
                b = Commit(b, round++, out string slot);
                List<string> step = Drain(ref b, slot);
                if (propulsionLeft && VoteOptions.NextVote(b, PreflightTestCatalog.Catalog) is string n && Slots.VoteOrder.IndexOf(n) < avionicsIndex)
                    CollectionAssert.DoesNotContain(step, "Review:Pdr", "PDR must wait while propulsion votes remain (after " + slot + ")");
            }
            Assert.IsTrue(PreflightSchedule.ReviewDone(b, ReviewKind.Cdr));
            Assert.AreEqual(Interlude.None.Kind, PreflightSchedule.After(b, PreflightTestCatalog.Catalog, null).Kind);
        }

        [Test]
        public void WetDressRehearsal_IsOfferedOnce_JustBeforeCdr()
        {
            BuildState b = BuildState.New("C1", PreflightTestCatalog.Seed);
            int round = 0;
            var tail = new List<string>();
            while (VoteOptions.NextVote(b, PreflightTestCatalog.Catalog) != null)
            {
                b = Commit(b, round++, out string slot);
                tail = Drain(ref b, slot);
            }
            int wet = tail.FindIndex(s => s.StartsWith("Test:wet_dress_rehearsal"));
            int cdr = tail.IndexOf("Review:Cdr");
            Assert.GreaterOrEqual(wet, 0, string.Join(" | ", tail));
            Assert.Less(wet, cdr, "the wet dress rehearsal comes before CDR");
            Assert.AreEqual(1, tail.FindAll(s => s.StartsWith("Test:wet_dress_rehearsal")).Count);
        }

        [Test]
        public void SkippedTest_IsNotOfferedAgain()
        {
            BuildState b = BuildState.New("C1", PreflightTestCatalog.Seed);
            int round = 0;
            while (VoteOptions.NextVote(b, PreflightTestCatalog.Catalog) != null)
            {
                b = Commit(b, round++, out string slot);
                Interlude i = PreflightSchedule.After(b, PreflightTestCatalog.Catalog, slot);
                if (i.Kind != InterludeKind.TestOffer) { b = DrainAll(b); continue; }
                BuildState marked = PreflightSchedule.MarkTestOffered(b, i.Offer);
                Interlude again = PreflightSchedule.After(marked, PreflightTestCatalog.Catalog, slot);
                if (again.Kind == InterludeKind.TestOffer)
                    Assert.AreNotEqual(i.Offer.Test.Id, again.Offer.Test.Id);
                return;
            }
            Assert.Inconclusive("no part test was offered on this seeded C1 build");
        }

        private static BuildState DrainAll(BuildState b)
        {
            Drain(ref b, null);
            return b;
        }
    }

    internal static class ListExtensions
    {
        public static int IndexOf(this IReadOnlyList<string> list, string value)
        {
            for (int i = 0; i < list.Count; i++) if (list[i] == value) return i;
            return -1;
        }

        public static bool Contains(this IReadOnlyList<string> list, string value) => list.IndexOf(value) >= 0;
    }
}
