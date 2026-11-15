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
    /// Controller of <c>MF_DesignReview</c> (design 14.1 #7, 6.9; T027 step 6): the PDR or CDR. Shows the checklist of the
    /// rules Core's review checks (<see cref="DesignReview.RulesFor"/> plus the review checks for budget, schedule, success
    /// and open flaws), each ticked or flagged with the worst severity found; issues grouped Blocker / Major / Minor with
    /// their explanation; the "Blockers can still be fixed by later votes" note. Then a REVIEW quick vote (PASS omitted
    /// with its reason when <see cref="ReviewReport.PassAllowed"/> is false); Rework → REWORK_CATEGORY vote over the decided
    /// categories the issues name (fee from <see cref="DesignReview.ReworkFeeM"/>, +days) → <see cref="DesignReview.Rework"/>
    /// → back to the Build Bay with the reopened category in <see cref="MissionContext.ReworkCategory"/>.
    /// The kind comes from the build (PDR until it is done, then CDR) or <c>-mfReview PDR|CDR</c> for demos.
    /// </summary>
    public sealed class DesignReviewScreen : PreflightScreen
    {
        /// <summary>Time to read the findings before the vote opens, s (game_value editorial pacing).</summary>
        public const float ReadSeconds = 5f;
        /// <summary>Hold on the outcome before returning to the Build Bay, s (game_value).</summary>
        public const float OutcomeHoldSeconds = 3f;

        private static readonly string[] ReviewChecks = { DesignReview.BudgetRule, DesignReview.ScheduleRule, DesignReview.SuccessRule, DesignReview.FlawRule };

        private BuildState _build;
        private ReviewReport _report;
        private ReviewKind _kind;
        private VisualElement _votes;
        private QuickVotePanel _quick;
        private ChoiceVotePanel _choice;

        public string Stage { get; private set; } = "BOOT";
        public ReviewKind Kind => _kind;
        public ReviewReport Report => _report;

        protected override void OnReady()
        {
            string contractId = MissionContext.ContractId ?? PreflightArgs.Value("-mfContract") ?? "C1";
            _kind = ResolveKind();
            _build = IsRehearsal ? RehearsalBuild(contractId, _kind) : MissionContext.Build;
            if (_build == null)
            {
                Debug.LogError("[MissionForge] Design Review: no build to review (the Build Bay has not handed one over).");
                return;
            }
            _report = DesignReview.Run(_kind, _build, Catalog);
            BuildHeader();
            BuildChecklist();
            BuildIssues();
            _votes = Screen.Q<VisualElement>("pf-review-vote");
            AnnouncePhase("BUILD", "REVIEW", _kind == ReviewKind.Pdr ? "PDR" : "CDR");
            _ = Guarded(RunAsync());
        }

        protected override void OnTick()
        {
            if (Session == null) return;
            _quick?.Refresh(Session.Round, Session.Channel.Seats, Session.SecondsLeft, Session.ServerNowMs, A11y.ReducedMotion);
            _choice?.Refresh(Session.Round, Session.Channel.Seats, Session.SecondsLeft, Session.ServerNowMs, A11y.ReducedMotion);
        }

        private ReviewKind ResolveKind()
        {
            string forced = PreflightArgs.Value("-mfReview");
            if (string.Equals(forced, "CDR", StringComparison.OrdinalIgnoreCase)) return ReviewKind.Cdr;
            if (string.Equals(forced, "PDR", StringComparison.OrdinalIgnoreCase)) return ReviewKind.Pdr;
            BuildState b = MissionContext.Build;
            return b != null && PreflightSchedule.ReviewDone(b, ReviewKind.Pdr) ? ReviewKind.Cdr : ReviewKind.Pdr;
        }

        // ------------------------------------------------------------------ flow

        private async Task RunAsync()
        {
            Stage = "READ";
            float until = Time.unscaledTime + ReadSeconds * (IsRehearsal ? Mathf.Clamp(PreflightArgs.Float("-mfRehearsalPace", 1f), 0.1f, 1f) : 1f);
            while (Session != null && Time.unscaledTime < until) await Task.Yield();
            if (Session == null) return;

            Stage = "VOTE";
            _quick = new QuickVotePanel(Text, o => o.Id == PreflightVotes.Pass ? Text.Get("ui.host.review.pass_detail") : Text.Get("ui.host.review.rework_detail"));
            _votes.Clear();
            if (!_report.PassAllowed) _votes.Add(PfUi.Lbl(Text.Get("ui.host.review.pass_blocked"), "pf-vote__note", "pf-review__passnote"));
            _votes.Add(_quick);
            // Pass is offered only when Core allows it; with Rework as the only option there is no vote (protocol: 2–10 options).
            string fallback = _report.PassAllowed ? PreflightVotes.Pass : PreflightVotes.Rework;
            string winner = await DecideAsync("review", id => PreflightVotes.ReviewRound(id, _report, Seed()), fallback);
            if (Session == null || winner == null) return;
            _quick = null;

            if (winner == PreflightVotes.Pass)
            {
                Close(PreflightSchedule.MarkReviewDone(_build, _kind), true, null);
                return;
            }
            await ReworkAsync();
        }

        private async Task ReworkAsync()
        {
            Stage = "REWORK_CATEGORY";
            List<string> slots = ReviewSlots.For(_report, _build, Catalog);
            _choice = new ChoiceVotePanel(Text, (opt, round) => PfUi.Lbl(Text.Format("ui.host.review.rework.cost",
                Text.Money(opt.CostM), Text.Days(BuildConstants.ReworkBaseDays)), "pf-meta")) { ShowWhy = false };
            _votes.Clear();
            _votes.Add(_choice);
            string category = await DecideAsync("review-rework", id => PreflightVotes.ReworkCategory(id, _kind, _build, Catalog, slots, Seed()),
                slots.Count > 0 ? slots[0] : null);
            if (Session == null) return;
            _choice = null;
            BuildState next = _build;
            if (category != null && _build.Has(category)) next = DesignReview.Rework(_build, Catalog, _kind, category);
            Close(PreflightSchedule.MarkReviewDone(next, _kind), false, category);
        }

        private void Close(BuildState build, bool passed, string reworkCategory)
        {
            Stage = passed ? "PASSED" : "REWORK";
            MissionContext.Build = build;
            MissionContext.ReworkCategory = reworkCategory;
            ShowOutcome(passed, reworkCategory);
            PreflightEvents.RaiseReviewClosed(_kind, passed);
            _ = BackToBayAsync();
        }

        private async Task BackToBayAsync()
        {
            float until = Time.unscaledTime + OutcomeHoldSeconds;
            while (Session != null && Time.unscaledTime < until) await Task.Yield();
            if (Session == null || PreflightArgs.Flag("-mfStayOnScreen") || App?.Flow == null) return;
            await NavigateAsync(() => App != null && App.Flow.ShowWithinPhase(ScreenId.BuildBay));
        }

        // ------------------------------------------------------------------ views

        private string KindKey => _kind == ReviewKind.Pdr ? "pdr" : _kind == ReviewKind.Cdr ? "cdr" : "frr";

        private void BuildHeader()
        {
            VisualElement head = Screen.Q<VisualElement>("pf-head");
            head.Clear();
            VisualElement kicker = PfUi.El("pf-kicker");
            kicker.Add(PfUi.Lbl(Text.Get("ui.host.review.lifecycle." + KindKey), "pf-lifecycle"));
            head.Add(kicker);
            head.Add(PfUi.Lbl(Text.Get("ui.host.review.title." + KindKey), "pf-title"));
            head.Add(PfUi.Lbl(Text.Get("ui.host.review.subtitle." + KindKey), "pf-meta"));
            VisualElement tag = Screen.Q<VisualElement>("pf-rehearsal-host");
            tag.Clear();
#if UNITY_EDITOR || MF_REHEARSAL
            if (IsRehearsal) tag.Add(PfUi.RehearsalBanner(Text, Text.Get("ui.host.review.rehearsal")));
#endif
        }

        /// <summary>Checklist: every rule the review checks, ticked (Meets) or flagged with the worst severity found.</summary>
        private void BuildChecklist()
        {
            VisualElement list = Screen.Q<VisualElement>("pf-checklist");
            list.Clear();
            list.Add(PfUi.Lbl(Text.Get("ui.host.review.checklist"), "pf-section__title"));
            var rules = new List<string>(DesignReview.RulesFor(_kind));
            foreach (string r in ReviewChecks)
                if (r != DesignReview.SuccessRule || _kind != ReviewKind.Pdr) rules.Add(r);
            foreach (string rule in rules)
            {
                Severity? worst = null;
                foreach (ValidationIssue i in _report.Issues)
                    if (i.RuleId == rule && (worst == null || i.Severity > worst.Value)) worst = i.Severity;
                string sev = worst == null ? "pass" : worst == Severity.Blocker ? "blocker" : worst == Severity.Major ? "major" : "minor";
                VisualElement row = PfUi.El("pf-check", "pf-sev--" + sev);
                var icon = new MfIcon { kind = worst == null ? "meets" : FrrViews.SeverityIcon(worst.Value) };
                icon.AddToClassList("pf-sev__icon");
                row.Add(icon);
                row.Add(PfUi.Lbl(RuleName(rule), "pf-check__name"));
                row.Add(PfUi.Lbl(worst == null ? Text.Get("ui.host.review.check.pass") : Text.Get("ui.host.review.severity." + sev), "pf-check__state"));
                list.Add(row);
            }
        }

        /// <summary>The check as a positive statement (ui.host.review.rule.*), else Core's rule name.</summary>
        private string RuleName(string rule)
        {
            string positive = "ui.host.review.rule." + rule;
            if (Text.Has(positive)) return Text.Get(positive);
            string key = "validation_rule." + rule + ".name";
            return Text.Has(key) ? Text.Get(key) : rule;
        }

        private void BuildIssues()
        {
            VisualElement panel = Screen.Q<VisualElement>("pf-findings");
            panel.Clear();
            panel.Add(PfUi.Lbl(Text.Get("ui.host.review.findings"), "pf-section__title"));
            VisualElement counts = PfUi.El("pf-sevcounts");
            foreach (Severity s in new[] { Severity.Blocker, Severity.Major, Severity.Minor })
            {
                int n = s == Severity.Blocker ? _report.Blockers : s == Severity.Major ? _report.Majors : _report.Minors;
                string name = s == Severity.Blocker ? "blocker" : s == Severity.Major ? "major" : "minor";
                VisualElement chip = PfUi.El("pf-sevchip", "pf-sev--" + name);
                var icon = new MfIcon { kind = FrrViews.SeverityIcon(s) };
                icon.AddToClassList("pf-sev__icon");
                chip.Add(icon);
                chip.Add(PfUi.Lbl(n + " " + Text.Get("ui.host.review.severity." + name), "pf-sevchip__label"));
                counts.Add(chip);
            }
            panel.Add(counts);
            if (_report.Blockers > 0 && _report.BlockersFixableByLaterVotes && _kind != ReviewKind.Frr)
                panel.Add(PfUi.Lbl(Text.Get("ui.host.review.fixable_later"), "pf-review__fixable"));
            if (_report.Issues.Count == 0)
            {
                VisualElement clean = PfUi.El("pf-review__clean");
                var icon = new MfIcon { kind = "meets" };
                icon.AddToClassList("pf-review__clean-icon");
                clean.Add(icon);
                clean.Add(PfUi.Lbl(Text.Get("ui.host.review.clean"), "pf-review__clean-text"));
                panel.Add(clean);
                return;
            }
            foreach (ValidationIssue i in _report.Issues) panel.Add(FrrViews.IssueRow(i, Text));
        }

        private void ShowOutcome(bool passed, string category)
        {
            _votes.Clear();
            VisualElement card = PfUi.El("pf-review__outcome", passed ? "pf-review__outcome--pass" : "pf-review__outcome--rework");
            var icon = new MfIcon { kind = passed ? "meets" : "wrench" };
            icon.AddToClassList("pf-review__outcome-icon");
            card.Add(icon);
            VisualElement text = PfUi.El("pf-review__outcome-text");
            text.Add(PfUi.Lbl(Text.Get(passed ? "ui.host.review.outcome.pass" : "ui.host.review.outcome.rework"), "pf-review__outcome-title"));
            if (!passed && category != null)
                text.Add(PfUi.Lbl(Text.Format("ui.host.review.outcome.reopened", Text.Has("vote." + category + ".name") ? Text.Get("vote." + category + ".name") : category,
                    Text.Money(DesignReview.ReworkFeeM(_build, Catalog, category)), Text.Days(BuildConstants.ReworkBaseDays)), "pf-meta"));
            card.Add(text);
            _votes.Add(card);
            if (!A11y.ReducedMotion) MfMotion.Enter(card);
        }

        private async Task Guarded(Task t)
        {
            try { await t; }
            catch (Exception e) { Debug.LogError("[MissionForge] Design Review: " + e); }
        }

        private uint Seed() => (uint)(MissionContext.Seed & 0xffffffff);

        /// <summary>
        /// Rehearsal fixtures (editor and MF_REHEARSAL builds), continuing the handed-over build with Core's seeded picker.
        /// PDR: decided up to Avionics (6.2 step 16). CDR: every vote decided; with <c>-mfReviewMajor</c>, Core's own tests are run on the decided parts in catalog order
        /// until one reveals a flaw, which is left open (an open flaw is a Major finding). Data, not logic.
        /// </summary>
        private BuildState RehearsalBuild(string contractId, ReviewKind kind)
        {
#if UNITY_EDITOR || MF_REHEARSAL
            BuildState start = MissionContext.Build ?? BuildState.New(contractId, MissionContext.Seed);
            int avionics = RehearsalBuilds.VoteIndex(Slots.Avionics);
            BuildState build = kind == ReviewKind.Pdr
                ? RehearsalBuilds.Continue(start, Catalog, slot => RehearsalBuilds.VoteIndex(slot) >= avionics)
                : RehearsalBuilds.Continue(start, Catalog);
            if (kind == ReviewKind.Cdr && PreflightArgs.Flag("-mfReviewMajor"))
            {
                build = PreflightSchedule.MarkReviewDone(build, ReviewKind.Pdr);
                foreach (TestOffer offer in TestCampaign.Available(build, Catalog))
                {
                    if (offer.TargetCategory == TestCampaign.VehicleTarget) continue;
                    TestOutcome outcome = TestCampaign.Run(build, Catalog, offer.Test.Id, offer.TargetCategory);
                    build = outcome.Build;
                    if (outcome.FlawRevealed) break;
                }
            }
            return build;
#else
            return null;
#endif
        }
    }
}
