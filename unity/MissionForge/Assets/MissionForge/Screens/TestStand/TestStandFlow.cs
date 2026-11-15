using System.Threading.Tasks;
using MissionForge.App;
using MissionForge.Core.Build;
using MissionForge.Core.Data;

namespace MissionForge.Screens.TestStand
{
    /// <summary>
    /// Entry point the Build Bay director awaits when <c>PreflightSchedule.After</c> names a test (T027 interface):
    /// <c>var result = await TestStandFlow.RunAsync(app.Flow, build, offer);</c> shows <c>MF_TestStand</c>, runs the TEST vote,
    /// the test and (on a revealed flaw) the Test Failure vote, and completes with the new build when the screen hands back
    /// to the Build Bay. <see cref="MinigameTier"/> is where T026's MinigameDirector puts the tier of the test's minigame
    /// (MG-03 / MG-04 / MG-06) before the run; it stays 0 without T026.
    /// </summary>
    public static class TestStandFlow
    {
        private static TaskCompletionSource<(BuildState build, TestOutcome outcome)> s_pending;

        /// <summary>The offer the next Test Stand screen runs (set by <see cref="RunAsync"/>).</summary>
        public static TestOffer PendingOffer { get; private set; }

        /// <summary>Minigame tier passed to <c>TestCampaign.Run</c> (0 = no minigame / no T026).</summary>
        public static int MinigameTier { get; set; }

        public static Task<(BuildState build, TestOutcome outcome)> RunAsync(SceneFlow flow, BuildState build, TestOffer offer)
        {
            MissionContext.Build = build;
            PendingOffer = offer;
            s_pending = new TaskCompletionSource<(BuildState, TestOutcome)>(TaskCreationOptions.RunContinuationsAsynchronously);
            if (flow == null || !flow.ShowWithinPhase(ScreenId.TestStand)) s_pending.TrySetResult((build, null));
            return s_pending.Task;
        }

        internal static void Complete(BuildState build, TestOutcome outcome)
        {
            PendingOffer = null;
            MinigameTier = 0;
            s_pending?.TrySetResult((build, outcome));
            s_pending = null;
        }
    }
}
