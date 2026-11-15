using System;
using System.Threading.Tasks;
using MissionForge.App;
using MissionForge.Core.Build;
using MissionForge.Core.Data;
using MissionForge.Screens.BuildBay;
using MissionForge.Screens.Preflight;
using MissionForge.UI;
using UnityEngine;
using UnityEngine.UIElements;

namespace MissionForge.Screens.TestStand
{
    /// <summary>
    /// Controller of <c>MF_TestStand</c> (design 14.1 #6, 6.6, 6.8; T027 step 7). The offered test comes from Core
    /// (<see cref="PreflightSchedule.After"/> → <see cref="TestCampaign.Offer"/>). A TEST quick vote ("Run engine hot-fire:
    /// $X M, +N days" / Skip); on Run, the test cell runs and Core's <see cref="TestCampaign.Run"/> decides (minigame tier 0
    /// without T026's MinigameDirector). The results card shows cost, days, the uncertainty band before → after from
    /// <see cref="Dashboard.Compute"/> as two bars, the reliability bonus, risks cleared and either "No flaw found" or
    /// "Flaw revealed" with the reveal chance. A revealed flaw opens the Test Failure response vote
    /// (<see cref="AnomalyDeck.DrawSpecific"/> → <see cref="AnomalyDeck.Respond"/>). Test failures are engineering findings.
    /// </summary>
    public sealed class TestStandScreen : PreflightScreen
    {
        public const string TestFailureCard = "test_failure";
        /// <summary>Test cell run time on screen, s (game_value editorial pacing; reduced motion: instant).</summary>
        public const float CellSeconds = 4f;
        /// <summary>Hold on the results before returning to the Build Bay, s (game_value).</summary>
        public const float ResultsHoldSeconds = 5f;

        private BuildState _build;
        private TestOffer _offer;
        private TestStandViews _views;
        private QuickVotePanel _quick;

        public string Stage { get; private set; } = "BOOT";
        public TestOutcome Outcome { get; private set; }

        protected override void OnReady()
        {
            string contractId = MissionContext.ContractId ?? PreflightArgs.Value("-mfContract") ?? "C1";
            _build = MissionContext.Build;
            _offer = TestStandFlow.PendingOffer;
#if UNITY_EDITOR || MF_REHEARSAL
            if (IsRehearsal && _offer == null) (_build, _offer) = TestStandRehearsal.Fixture(Catalog, _build ?? BuildState.New(contractId, MissionContext.Seed));
#endif
            if (_build == null || _offer == null)
            {
                Debug.LogError("[MissionForge] Test Stand: no test was offered (the Build Bay has not handed one over).");
                return;
            }
            _views = new TestStandViews(Screen, Text, A11y, Catalog);
            _views.BuildHeader(_offer, IsRehearsal);
            AnnouncePhase("BUILD", "TEST", null);
            _ = Guarded(RunAsync());
        }

        protected override void OnTick()
        {
            if (Session == null) return;
            _quick?.Refresh(Session.Round, Session.Channel.Seats, Session.SecondsLeft, Session.ServerNowMs, A11y.ReducedMotion);
            _views?.Tick(Time.unscaledDeltaTime);
        }

        private async Task RunAsync()
        {
            Stage = "OFFER";
            string testName = Text.Get("test." + _offer.Test.Id + ".name");
            _quick = new QuickVotePanel(Text, o => o.Id == PreflightVotes.Test
                ? Text.Format("ui.host.test.run_detail", testName, Text.Money(_offer.CostM), Text.Days(_offer.Days))
                : Text.Get("ui.host.test.skip_detail"));
            _views.ShowVote(_quick);
            string winner = await DecideAsync("test", id => PreflightVotes.TestOfferRound(id, _offer, Seed()), PreflightVotes.Skip);
            if (Session == null || winner == null) return;
            _quick = null;
            BuildState marked = PreflightSchedule.MarkTestOffered(_build, _offer);
            if (winner != PreflightVotes.Test)
            {
                Finish(marked, null);
                return;
            }

            Stage = "RUNNING";
            int tier = TestStandFlow.MinigameTier; // T026 MinigameDirector would set this; 0 without it
            DashboardMetrics before = Dashboard.Compute(marked, Catalog);
            TestOutcome outcome = TestCampaign.Run(marked, Catalog, _offer.Test.Id, _offer.TargetCategory, tier);
            DashboardMetrics after = Dashboard.Compute(outcome.Build, Catalog);
            Outcome = outcome;
            _views.ShowCell(_offer);
            float until = Time.unscaledTime + (A11y.ReducedMotion ? 0.3f : CellSeconds * Pace());
            while (Session != null && Time.unscaledTime < until) await Task.Yield();
            if (Session == null) return;

            Stage = "RESULTS";
            _views.ShowResults(_offer, outcome, before, after);
            PreflightEvents.RaiseTestCompleted(outcome);
            BuildState next = outcome.Build;
            if (outcome.FlawRevealed) next = await TestFailureAsync(next);
            if (Session == null) return;
            Finish(next, outcome);
        }

        /// <summary>Test Failure card: fix (+$ +days) / fly as-is / swap part, decided by a quick vote, applied by Core.</summary>
        private async Task<BuildState> TestFailureAsync(BuildState build)
        {
            float read = Time.unscaledTime + 3f * Pace();
            while (Session != null && Time.unscaledTime < read) await Task.Yield();
            if (Session == null) return build;
            Stage = "TEST_FAILURE";
            AnomalyDraw draw = AnomalyDeck.DrawSpecific(build, Catalog, TestFailureCard);
            _quick = new QuickVotePanel(Text, o => _views.ResponseDetail(draw, o.Id));
            _views.ShowFailureVote(_quick, draw);
            string response = await DecideAsync("test-failure", id => PreflightVotes.TestFailure(id, draw.Card, Seed()),
                draw.Card.Responses[draw.Card.Responses.Count - 1].Id);
            if (Session == null || response == null) return build;
            _quick = null;
            BuildState next = AnomalyDeck.Respond(draw.Build, Catalog, draw.Card.Id, response, draw.TargetCategory);
            if (response == "swap_part" && draw.TargetCategory != null) MissionContext.ReworkCategory = draw.TargetCategory;
            Stage = "RESPONDED:" + response;
            _views.ShowResponse(response);
            return next;
        }

        private void Finish(BuildState build, TestOutcome outcome)
        {
            MissionContext.Build = build;
            TestStandFlow.Complete(build, outcome);
            if (outcome == null) Stage = "SKIPPED";
            _ = BackToBayAsync();
        }

        private async Task BackToBayAsync()
        {
            float until = Time.unscaledTime + ResultsHoldSeconds * Pace();
            while (Session != null && Time.unscaledTime < until) await Task.Yield();
            if (Session == null || PreflightArgs.Flag("-mfStayOnScreen") || App?.Flow == null) return;
            Stage = "DONE";
            await NavigateAsync(() => App != null && App.Flow.ShowWithinPhase(ScreenId.BuildBay));
        }

        private async Task Guarded(Task t)
        {
            try { await t; }
            catch (Exception e) { Debug.LogError("[MissionForge] Test Stand: " + e); }
        }

        private float Pace() => IsRehearsal ? Mathf.Clamp(PreflightArgs.Float("-mfRehearsalPace", 1f), 0.1f, 1f) : 1f;
        private uint Seed() => (uint)(MissionContext.Seed & 0xffffffff);
    }
}
