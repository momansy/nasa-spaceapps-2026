#if UNITY_EDITOR || MF_REHEARSAL
using MissionForge.Core.Build;
using MissionForge.Core.Data;
using MissionForge.Screens.BuildBay;
using MissionForge.Screens.Preflight;

namespace MissionForge.Screens.TestStand
{
    /// <summary>
    /// Rehearsal fixture of the Test Stand (editor and MF_REHEARSAL builds): continues the build with Core's seeded picker
    /// and stops at the first test Core offers. <c>-mfTest &lt;testId&gt;</c> asks for a particular test (e.g.
    /// <c>engine_hot_fire</c>); <c>-mfTestFlaw</c> picks the first offer whose Core run reveals a flaw, so the Test Failure
    /// card can be shown. Without either, the offer is the one <see cref="PreflightSchedule.After"/> names. Data, not logic.
    /// </summary>
    internal static class TestStandRehearsal
    {
        private const int MaxVotes = 128;
        /// <summary>How many further session seeds <c>-mfTestFlaw</c> tries when the first build has no revealable flaw.</summary>
        private const int FlawSeedSearch = 64;

        public static (BuildState build, TestOffer offer) Fixture(GameCatalog catalog, BuildState start)
        {
            if (!PreflightArgs.Flag("-mfTestFlaw")) return Search(catalog, start, PreflightArgs.Value("-mfTest"), false);
            for (ulong k = 0; k < FlawSeedSearch; k++)
            {
                BuildState seeded = k == 0 ? start : BuildState.New(start.ContractId, start.Seed + k);
                (BuildState b, TestOffer o) = Search(catalog, seeded, PreflightArgs.Value("-mfTest"), true);
                if (o != null && TestCampaign.Run(b, catalog, o.Test.Id, o.TargetCategory).FlawRevealed) return (b, o);
            }
            return Search(catalog, start, PreflightArgs.Value("-mfTest"), false);
        }

        private static (BuildState build, TestOffer offer) Search(GameCatalog catalog, BuildState start, string wanted, bool flaw)
        {
            BuildState b = start;
            for (int i = 0; i < MaxVotes; i++)
            {
                string slot = VoteOptions.NextVote(b, catalog);
                if (slot == null) break;
                string pick = SeededBuilds.Pick(b, catalog, slot, i);
                if (pick == null) break;
                b = VoteOptions.Commit(b, catalog, slot, pick);

                if (wanted == null && !flaw)
                {
                    Interlude next = PreflightSchedule.After(b, catalog, slot);
                    if (next.Kind == InterludeKind.TestOffer) return (b, next.Offer);
                    continue;
                }
                foreach (TestOffer o in TestCampaign.Available(b, catalog))
                {
                    if (o.TargetCategory == TestCampaign.VehicleTarget) continue;
                    if (wanted != null && o.Test.Id != wanted) continue;
                    if (flaw && !TestCampaign.Run(b, catalog, o.Test.Id, o.TargetCategory).FlawRevealed) continue;
                    return (b, o);
                }
            }
            if (flaw) return (b, null);
            foreach (TestOffer o in TestCampaign.Available(b, catalog)) return (b, o);
            return (b, null);
        }
    }
}
#endif
