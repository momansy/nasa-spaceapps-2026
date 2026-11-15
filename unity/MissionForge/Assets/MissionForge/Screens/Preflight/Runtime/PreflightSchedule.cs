using System;
using System.Collections.Generic;
using MissionForge.Core.Build;
using MissionForge.Core.Data;

namespace MissionForge.Screens.Preflight
{
    /// <summary>What happens between two build votes.</summary>
    public enum InterludeKind
    {
        None,
        /// <summary>A test is offered (Test Stand).</summary>
        TestOffer,
        /// <summary>A PDR or CDR (Design Review).</summary>
        Review,
    }

    /// <summary>The next pre-flight interlude (<see cref="PreflightSchedule.After"/>). The FRR is a phase, not an interlude.</summary>
    public sealed class Interlude
    {
        public static readonly Interlude None = new Interlude(InterludeKind.None, null, default);

        private Interlude(InterludeKind kind, TestOffer offer, ReviewKind review)
        {
            Kind = kind;
            Offer = offer;
            Review = review;
        }

        public InterludeKind Kind { get; }
        public TestOffer Offer { get; }
        public ReviewKind Review { get; }

        public static Interlude TestOffer(TestOffer offer) => new Interlude(InterludeKind.TestOffer, offer ?? throw new ArgumentNullException(nameof(offer)), default);
        public static Interlude ForReview(ReviewKind kind) => new Interlude(InterludeKind.Review, null, kind);

        public override string ToString() => Kind == InterludeKind.TestOffer ? "Test:" + Offer.Test.Id + "@" + Offer.TargetCategory
            : Kind == InterludeKind.Review ? "Review:" + Review : "None";
    }

    /// <summary>
    /// Decides which interlude follows a committed vote (T027). Every rule is a <c>game_value</c> decision (README.md):
    /// <list type="bullet">
    /// <item>At most one test per committed vote: the first test, in <c>data/tests.json</c> order, that applies to the
    /// part just committed and that has neither run nor been offered. Generic any-part tests (component qualification)
    /// are not scheduled automatically (28 votes would each stop for one). Engine and stage tests are offered once
    /// per slot (stage tests when the stage's tank is chosen, i.e. the stage is complete); every other test once per
    /// mission, at the first slot it applies to.</item>
    /// <item>PDR once the next vote is Avionics (6.2 step 16) or later, or no votes remain; CDR when no votes remain.</item>
    /// <item>Whole-vehicle tests (wet dress rehearsal) are offered once, just before CDR.</item>
    /// </list>
    /// Callers loop: run the named interlude, mark it (<see cref="MarkTestOffered"/>, <see cref="MarkReviewDone"/>),
    /// and call <see cref="After"/> again with <c>committedSlot = null</c> until it returns <see cref="Interlude.None"/>.
    /// </summary>
    public static class PreflightSchedule
    {
        public const string OfferedFlagPrefix = "preflight_offered:";
        public const string ReviewDoneFlagPrefix = "preflight_review_done:";

        public static Interlude After(BuildState build, GameCatalog catalog, string committedSlot)
        {
            if (build == null) throw new ArgumentNullException(nameof(build));
            if (catalog == null) throw new ArgumentNullException(nameof(catalog));

            if (!string.IsNullOrEmpty(committedSlot))
            {
                TestOffer offer = PartTestFor(build, catalog, committedSlot);
                if (offer != null) return Interlude.TestOffer(offer);
            }

            string next = VoteOptions.NextVote(build, catalog);
            bool noneRemain = next == null;
            bool propulsionDecided = noneRemain || IndexOf(next) >= IndexOf(Slots.Avionics);
            if (propulsionDecided && !ReviewDone(build, ReviewKind.Pdr)) return Interlude.ForReview(ReviewKind.Pdr);

            if (noneRemain)
            {
                TestOffer wet = VehicleTestFor(build, catalog);
                if (wet != null) return Interlude.TestOffer(wet);
                if (!ReviewDone(build, ReviewKind.Cdr)) return Interlude.ForReview(ReviewKind.Cdr);
            }
            return Interlude.None;
        }

        /// <summary>Records that a test was offered, taken or skipped, so it is not offered again.</summary>
        public static BuildState MarkTestOffered(BuildState build, TestOffer offer) =>
            build.WithFlag(OfferedFlag(offer.Test.Id, offer.TargetCategory == TestCampaign.VehicleTarget ? TestCampaign.VehicleTarget : OnceKey(offer.Test, offer.TargetCategory)));

        public static BuildState MarkReviewDone(BuildState build, ReviewKind kind) =>
            build.WithFlag(ReviewDoneFlagPrefix + kind.ToString().ToLowerInvariant());

        public static bool ReviewDone(BuildState build, ReviewKind kind) =>
            build.HasFlag(ReviewDoneFlagPrefix + kind.ToString().ToLowerInvariant());

        private static string OfferedFlag(string testId, string target) => OfferedFlagPrefix + testId + ":" + target;

        private static TestOffer PartTestFor(BuildState build, GameCatalog catalog, string slot)
        {
            foreach (TestDef test in catalog.Tests.Values)
            {
                if (IsGeneric(test) || IsVehicleTest(test)) continue;
                if (build.HasFlag(OfferedFlag(test.Id, OnceKey(test, slot)))) continue;
                if (RequiresFinishedStage(test) && !IsTankSlot(slot)) continue; // "full stage on the pad": the stage is complete at its tank vote
                TestOffer offer = TestCampaign.Offer(build, catalog, test.Id, slot);
                if (offer != null) return offer;
            }
            return null;
        }

        /// <summary>Per-stage hardware tests may be offered once per slot; every other test once per mission (game_value).</summary>
        private static string OnceKey(TestDef t, string slot) => IsPerStage(t) ? slot : "mission";

        private static bool IsPerStage(TestDef t)
        {
            foreach (string g in t.AppliesTo) if (g == "engine" || g == "stage" || g == "first_stage") return true;
            return false;
        }

        private static bool RequiresFinishedStage(TestDef t)
        {
            foreach (string g in t.AppliesTo) if (g == "stage" || g == "first_stage") return true;
            return false;
        }

        private static bool IsTankSlot(string slot) => slot == Slots.FirstStageTank || slot == Slots.UpperStageTank;

        private static TestOffer VehicleTestFor(BuildState build, GameCatalog catalog)
        {
            foreach (TestDef test in catalog.Tests.Values)
            {
                if (!IsVehicleTest(test)) continue;
                if (build.HasFlag(OfferedFlag(test.Id, TestCampaign.VehicleTarget))) continue;
                TestOffer offer = TestCampaign.Offer(build, catalog, test.Id, TestCampaign.VehicleTarget);
                if (offer != null) return offer;
            }
            return null;
        }

        private static bool IsGeneric(TestDef t)
        {
            foreach (string g in t.AppliesTo) if (g == "any" || g == "any_part") return true;
            return false;
        }

        private static bool IsVehicleTest(TestDef t)
        {
            foreach (string g in t.AppliesTo) if (g == "vehicle") return true;
            return false;
        }

        private static int IndexOf(string slot)
        {
            for (int i = 0; i < Slots.VoteOrder.Count; i++) if (Slots.VoteOrder[i] == slot) return i;
            return int.MaxValue;
        }
    }
}
