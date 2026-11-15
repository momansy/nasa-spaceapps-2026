using System.Threading.Tasks;
using MissionForge.App;
using MissionForge.Core.Build;
using MissionForge.Core.Data;
using MissionForge.Screens.Preflight;
using UnityEngine;

namespace MissionForge.Screens.TestStand
{
    /// <summary>
    /// T063: the Build Bay hook of the Preflight README ("Build Bay hook"), registered as
    /// <see cref="MissionContext.StartInterlude"/>. It lives here because this assembly already references Preflight and the
    /// Build Bay; the Build Bay cannot reference it back. After each committed vote it asks <see cref="PreflightSchedule.After"/>
    /// for the next interlude and opens the Test Stand (<see cref="TestStandFlow.RunAsync"/>) or the Design Review. Both
    /// screens mark the interlude in the build, write <see cref="MissionContext.Build"/> and hand back to the Build Bay, which
    /// resumes from that build and calls the hook again with no slot until nothing is due.
    /// </summary>
    public static class BuildBayInterludes
    {
        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.SubsystemRegistration)]
        private static void Register() => MissionContext.StartInterlude = Start;

        /// <summary>Returns true when a screen swap to an interlude started; false when nothing is due.</summary>
        public static bool Start(BuildState build, GameCatalog catalog, string committedSlot)
        {
            if (build == null || catalog == null) return false;
            SceneFlow flow = AppRoot.Instance != null ? AppRoot.Instance.Flow : null;
            for (string slot = committedSlot; ; slot = null)
            {
                Interlude next = PreflightSchedule.After(build, catalog, slot);
                MissionContext.Build = build;
                if (next.Kind == InterludeKind.None) return false;
                if (next.Kind == InterludeKind.TestOffer)
                {
                    Task<(BuildState build, TestOutcome outcome)> run = TestStandFlow.RunAsync(flow, build, next.Offer);
                    if (!run.IsCompleted) return true;
                    // The Test Stand could not open (flow busy or missing): count the offer as made so the bay is not stuck.
                    Debug.LogWarning("[MissionForge] Build Bay: the Test Stand could not open for " + next + "; the offer is skipped.");
                    build = PreflightSchedule.MarkTestOffered(build, next.Offer);
                    continue;
                }
                if (flow != null && flow.ShowWithinPhase(ScreenId.DesignReview)) return true;
                Debug.LogWarning("[MissionForge] Build Bay: the Design Review could not open for " + next + "; it is skipped.");
                build = PreflightSchedule.MarkReviewDone(build, next.Review);
            }
        }
    }
}
