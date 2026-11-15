using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using MissionForge.App;
using MissionForge.Core.Build;
using MissionForge.Core.Data;
using MissionForge.Screens.BuildBay;
using MissionForge.Screens.Preflight;
using MissionForge.UI;
using UnityEngine;
using UnityEngine.UIElements;

namespace MissionForge.Screens.Review
{
    /// <summary>
    /// Controller of <c>MF_FlightReadinessReview</c> (design 14.1 #8, 6.9; T027 step 5). Runs Core's
    /// <see cref="DesignReview.Run"/> (FRR) and shows the readiness summary (dashboard headline numbers, open issues by
    /// severity). Any Blocker: "Rework required" and a REWORK_CATEGORY vote, then BUILD. Otherwise the GO/NO-GO ritual:
    /// a console board in call order, <c>poll.open</c> → <c>poll.call</c> → <c>poll.answered</c> → <c>poll.result</c> from the
    /// room server, and Core's <see cref="FrrPoll.Record"/> decides: GO (countdown), discuss 15 s and re-poll, or a REVIEW
    /// vote offering Rework. Never recomputes a rule; the rehearsal driver only feeds synthetic envelopes.
    /// </summary>
    public sealed class FrrScreen : PreflightScreen
    {
        /// <summary>Console call order (design 6.9, protocol section 8).</summary>
        public static readonly string[] CallOrder = { "BOOSTER", "STRUCT", "GUIDO", "FIDO", "EECOM", "INCO", "PAYLOAD", "RETRO", "PM", "FLIGHT" };
        /// <summary>Per-console answer window, ms (protocol section 8; game_value).</summary>
        public const int PerCallMs = 5000;
        /// <summary>The "GO for launch" moment before the countdown opens, s (game_value).</summary>
        public const float GoHoldSeconds = 4f;
        /// <summary>How long "Rework required" stays readable before the category vote opens, s (game_value).</summary>
        public const float ReworkNoticeSeconds = 4f;

        private FrrViews _views;
        private BuildState _build;
        private ReviewReport _report;
        private DashboardMetrics _dash;
        private ContractDef _contract;
        private FrrPoll _poll = FrrPoll.Start;
        private QuickVotePanel _quick;
        private ChoiceVotePanel _choice;
        private float _discussionEndsAt = -1f;
        private bool _leaving;

        /// <summary>What the screen is doing now (evidence and tests).</summary>
        public string Stage { get; private set; } = "BOOT";
        public PollOutcome? LastOutcome { get; private set; }
        /// <summary>One line per poll round: console counts and Core's outcome (evidence log).</summary>
        public readonly List<string> Outcomes = new List<string>();
        /// <summary>Wait before reopening a rejected poll, s (game_value).</summary>
        public const float PollRetrySeconds = 3f;

        protected override void OnReady()
        {
            string contractId = MissionContext.ContractId ?? PreflightArgs.Value("-mfContract") ?? "C1";
            if (!Catalog.Contracts.TryGetValue(contractId, out _contract))
            {
                Debug.LogError("[MissionForge] FRR: unknown contract " + contractId);
                return;
            }
            _build = IsRehearsal ? RehearsalBuild(contractId) : MissionContext.Build;
            if (_build == null)
            {
                Debug.LogError("[MissionForge] FRR: no build to review (the Build Bay has not handed one over).");
                return;
            }
            _report = DesignReview.Run(ReviewKind.Frr, _build, Catalog);
            _dash = Dashboard.Compute(_build, Catalog);
            _views = new FrrViews(Screen, Text, A11y);
            _views.BuildHeader(IsRehearsal);
            _views.BuildSummary(_dash, _report, _contract);
            _views.BuildBoard(Roles(), r => ReadinessItem(r));
            AnnouncePhase("FRR", null, "FRR");
            if (_report.Blockers > 0) _ = Guarded(ReworkRequiredAsync());
            else _ = Guarded(PollRoundAsync(1));
        }

        protected override void OnTick()
        {
            if (_views == null || Session == null) return;
            _views.RefreshBoard(Session.Poll, Session.Channel, Session.PollSecondsLeft, Session.ServerNowMs);
            _quick?.Refresh(Session.Round, Session.Channel.Seats, Session.SecondsLeft, Session.ServerNowMs, A11y.ReducedMotion);
            _choice?.Refresh(Session.Round, Session.Channel.Seats, Session.SecondsLeft, Session.ServerNowMs, A11y.ReducedMotion);
            if (_discussionEndsAt >= 0f) _views.SetDiscussionSeconds(Mathf.Max(0, Mathf.CeilToInt(_discussionEndsAt - Time.unscaledTime)));
        }

        // ------------------------------------------------------------------ poll

        private async Task PollRoundAsync(int round)
        {
            if (Session == null) return;
            Stage = "POLL";
            _views.ShowBoard();
            string[] order = Roles();
            PollResult result = null;
            for (int attempt = 0; attempt <= MaxReopens && result == null; attempt++)
            {
                if (Session == null) return;
                result = await Session.RunPollAsync(PreflightSession.NewId("frr"), "FRR", round, order, PerCallMs);
                if (result == null && Session != null)
                {
                    // Rejected by the room (e.g. paused): wait, then open the round again.
                    float wait = Time.unscaledTime + PollRetrySeconds;
                    while (Session != null && Time.unscaledTime < wait) await Task.Yield();
                }
            }
            if (Session == null) return;
            if (result == null)
            {
                Debug.LogError("[MissionForge] FRR: the room rejected the GO/NO-GO poll " + (MaxReopens + 1) + " times.");
                return;
            }
            result.CountConsoles(out int go, out int noGo);
            (PollOutcome outcome, FrrPoll next) = _poll.Record(go, noGo);
            _poll = next;
            LastOutcome = outcome;
            Outcomes.Add("round " + round + ": " + go + " GO, " + noGo + " NO-GO → " + outcome);
            switch (outcome)
            {
                case PollOutcome.Go:
                    Go(result);
                    break;
                case PollOutcome.DiscussAndRepoll:
                    await DiscussAsync(result);
                    await PollRoundAsync(round + 1);
                    break;
                case PollOutcome.ReworkOffered:
                    await ReworkOfferedAsync(result);
                    break;
            }
        }

        private void Go(PollResult result)
        {
            Stage = "GO";
            _views.ShowGo();
            PreflightEvents.RaiseFrrConcluded(PollOutcome.Go, result);
            Leave(GamePhase.Countdown, GoHoldSeconds);
        }

        /// <summary>15 s discussion (Core's <see cref="FrrPoll.DiscussionSeconds"/>) with the NO-GO consoles and the open issues.</summary>
        private async Task DiscussAsync(PollResult result)
        {
            Stage = "DISCUSS";
            var noGo = new List<string>();
            foreach (PollEntryState e in result.Answers) if (e.Answer == PollAnswer.NoGo) noGo.AddRange(e.Roles);
            _views.ShowDiscussion(noGo, _report);
            _discussionEndsAt = Time.unscaledTime + (float)FrrPoll.DiscussionSeconds * DiscussionScale();
            while (Session != null && Time.unscaledTime < _discussionEndsAt) await Task.Yield();
            _discussionEndsAt = -1f;
            _views.HideDiscussion();
        }

        /// <summary>Second NO-GO round: a REVIEW vote offering Rework (and Pass only when the report allows it).</summary>
        private async Task ReworkOfferedAsync(PollResult result)
        {
            Stage = "REWORK_OFFERED";
            _quick = new QuickVotePanel(Text, o => o.Id == PreflightVotes.Pass ? Text.Get("ui.host.frr.pass_detail") : Text.Get("ui.host.frr.rework_detail")) { ShowWhy = false };
            _views.ShowVote(_quick, _report.PassAllowed ? null : Text.Get("ui.host.review.pass_blocked"));
            string winner = await DecideAsync("frr-review", id => PreflightVotes.ReviewRound(id, _report, Seed()), PreflightVotes.Rework);
            if (Session == null || winner == null) return;
            _quick = null;
            if (winner == PreflightVotes.Pass)
            {
                Go(result);
                return;
            }
            await ReworkCategoryAsync();
        }

        // ------------------------------------------------------------------ rework

        private async Task ReworkRequiredAsync()
        {
            Stage = "REWORK_REQUIRED";
            // A Blocker that only says "no part chosen" is finished in the Build Bay by voting that category: no rework fee.
            string undecided = OnlyUndecidedBlocker();
            _views.ShowReworkRequired(_report, undecided != null);
            float until = Time.unscaledTime + ReworkNoticeSeconds;
            while (Session != null && Time.unscaledTime < until) await Task.Yield();
            if (Session == null) return;
            if (undecided != null)
            {
                MissionContext.Build = _build;
                MissionContext.ReworkCategory = undecided;
                PreflightEvents.RaiseReviewClosed(ReviewKind.Frr, false);
                Stage = "TO_BUILD";
                Leave(GamePhase.Build, 0.5f);
                return;
            }
            await ReworkCategoryAsync();
        }

        private async Task ReworkCategoryAsync()
        {
            if (Session == null) return;
            Stage = "REWORK_CATEGORY";
            List<string> slots = ReworkSlots();
            _choice = new ChoiceVotePanel(Text, (opt, round) => PfUi.Lbl(Text.Format("ui.host.review.rework.cost",
                Text.Money(opt.CostM), Text.Days(BuildConstants.ReworkBaseDays)), "pf-meta")) { ShowWhy = false };
            _views.ShowVote(_choice, null);
            string category = await DecideAsync("frr-rework", id => PreflightVotes.ReworkCategory(id, ReviewKind.Frr, _build, Catalog, slots, Seed()),
                slots.Count > 0 ? slots[0] : null);
            if (Session == null) return;
            _choice = null;
            if (category != null && _build.Has(category))
            {
                MissionContext.Build = DesignReview.Rework(_build, Catalog, ReviewKind.Frr, category);
                MissionContext.ReworkCategory = category;
            }
            PreflightEvents.RaiseReviewClosed(ReviewKind.Frr, false);
            Stage = "TO_BUILD";
            Leave(GamePhase.Build, 2f);
        }

        private List<string> ReworkSlots() => ReviewSlots.For(_report, _build, Catalog);

        /// <summary>The undecided category when every Blocker is Core's "no part chosen" (rev_incomplete), else null.</summary>
        private string OnlyUndecidedBlocker()
        {
            string slot = null;
            foreach (ValidationIssue i in _report.Issues)
            {
                if (i.Severity != Severity.Blocker) continue;
                if (i.RuleId != DesignReview.IncompleteRule || i.Args == null || !i.Args.TryGetValue("category", out string c)) return null;
                slot ??= c;
            }
            return slot;
        }

        private async Task Guarded(Task t)
        {
            try { await t; }
            catch (Exception e) { Debug.LogError("[MissionForge] FRR: " + e); }
        }

        // ------------------------------------------------------------------ helpers

        private void Leave(GamePhase next, float afterSeconds) => _ = LeaveAsync(next, afterSeconds);

        private async Task LeaveAsync(GamePhase next, float afterSeconds)
        {
            if (_leaving) return;
            _leaving = true;
            float until = Time.unscaledTime + afterSeconds;
            while (Session != null && Time.unscaledTime < until) await Task.Yield();
            if (Session == null || PreflightArgs.Flag("-mfStayOnScreen") || App?.Flow == null) return;
            await NavigateAsync(() => App != null && App.Flow.GoToPhase(next));
        }

        /// <summary>Roles in the room, in call order (all ten when no seat list is known).</summary>
        private string[] Roles()
        {
            var inRoom = new HashSet<string>();
            if (Session != null) foreach (Seat s in Session.Channel.Seats) foreach (string r in s.Roles) inRoom.Add(r);
            var order = new List<string>();
            foreach (string r in CallOrder) if (inRoom.Count == 0 || inRoom.Contains(r)) order.Add(r);
            return order.ToArray();
        }

        /// <summary>The one-line readiness item of a console, filled with Core's dashboard numbers (units included).</summary>
        private string ReadinessItem(string role)
        {
            string key = "ui.host.frr.item." + role;
            switch (role)
            {
                case "BOOSTER": return _dash.LiftoffTwr.HasValue ? Text.Format(key, UiText.Number(_dash.LiftoffTwr.Value, 2)) : Text.Get(key + ".none");
                case "GUIDO": return Text.Format(key, Text.KmPerS(_dash.TotalDvMps), Text.KmPerS(_dash.DvRequiredMps));
                case "FIDO": return Text.Format(key, Text.Get("contract." + _contract.Id + ".destination"));
                case "EECOM": return _dash.PowerSunlitW.HasValue ? Text.Format(key, UiText.Number(_dash.PowerSunlitW.Value, 0), UiText.Number(_dash.PowerLoadW, 0)) : Text.Get(key + ".none");
                case "INCO": return _dash.DownlinkGbPerDay.HasValue ? Text.Format(key, UiText.Number(_dash.DownlinkGbPerDay.Value, 1)) : Text.Get(key + ".none");
                case "PAYLOAD": return Text.Format(key, UiText.Number(_contract.PayloadMassKg, 0));
                case "STRUCT": return _dash.StabilityMarginCalibers.HasValue ? Text.Format(key, UiText.Number(_dash.StabilityMarginCalibers.Value, 1)) : Text.Get(key + ".none");
                case "PM": return Text.Format(key, Text.Money(_dash.Budget.RemainingM), Text.Days(_dash.ScheduleDays), Text.Days(_contract.ScheduleDays));
                case "FLIGHT": return Text.Format(key, Text.Percent(_dash.Success.Success), Text.Percent(_dash.Success.BandHalfWidth));
                default: return Text.Get(key);
            }
        }

        private uint Seed() => (uint)(MissionContext.Seed & 0xffffffff);

        /// <summary>Rehearsal pacing only: shortens the 15 s discussion when <c>-mfRehearsalPace</c> is below 1 (evidence runs).</summary>
        private float DiscussionScale() => IsRehearsal ? Mathf.Clamp(PreflightArgs.Float("-mfRehearsalPace", 1f), 0.1f, 1f) : 1f;

        /// <summary>
        /// Rehearsal fixture (editor and MF_REHEARSAL builds): the handed-over build (or a new one) with the remaining votes
        /// decided by Core's seeded picker, or with the last vote left open when <c>-mfFrrBlocker</c> forces a Blocker.
        /// </summary>
        private BuildState RehearsalBuild(string contractId)
        {
#if UNITY_EDITOR || MF_REHEARSAL
            BuildState start = MissionContext.Build ?? BuildState.New(contractId, MissionContext.Seed);
            return PreflightArgs.Flag("-mfFrrBlocker") ? RehearsalBuilds.AllButLast(start, Catalog) : RehearsalBuilds.Continue(start, Catalog);
#else
            return null;
#endif
        }
    }
}
