using System.Collections.Generic;
using MissionForge.Core.Build;
using MissionForge.Core.Data;
using MissionForge.Screens.Preflight;
using MissionForge.UI;
using UnityEngine;
using UnityEngine.UIElements;

namespace MissionForge.Screens.Review
{
    /// <summary>
    /// Presentation of the Flight Readiness Review (T027 step 5): readiness summary, the console board (one tile per role
    /// in call order), the called-console highlight with its answer timer, the callout subtitle ("GUIDO: GO"), the NO-GO
    /// discussion and the GO moment. Answer states never rely on colour: GO = check-circle + "GO" + solid Meets border,
    /// NO-GO = octagon + "NO-GO" + Fails border, no answer = minus + "No answer" + muted border, waiting = outlined circle.
    /// </summary>
    public sealed class FrrViews
    {
        private readonly VisualElement _screen;
        private readonly PreflightText _text;
        private readonly PreflightA11y _a11y;
        private readonly Dictionary<string, Tile> _tiles = new Dictionary<string, Tile>();
        private VisualElement _board;
        private VisualElement _overlay;
        private Label _callout;
        private Label _discussTimer;
        private string _lastCalloutKey;

        private sealed class Tile
        {
            public VisualElement Root;
            public MfIcon Icon;
            public Label State;
            public Label Who;
            public VisualElement TimerFill;
            public string Answer = "";
        }

        public FrrViews(VisualElement screen, PreflightText text, PreflightA11y a11y)
        {
            _screen = screen;
            _text = text;
            _a11y = a11y;
        }

        public void BuildHeader(bool rehearsal)
        {
            VisualElement head = _screen.Q<VisualElement>("pf-head");
            head.Clear();
            VisualElement kicker = PfUi.El("pf-kicker");
            kicker.Add(PfUi.Lbl(_text.Get("ui.host.frr.lifecycle"), "pf-lifecycle"));
            head.Add(kicker);
            head.Add(PfUi.Lbl(_text.Get("ui.host.frr.title"), "pf-title"));
            head.Add(PfUi.Lbl(_text.Get("ui.host.frr.subtitle"), "pf-meta"));
            VisualElement tag = _screen.Q<VisualElement>("pf-rehearsal-host");
            tag.Clear();
#if UNITY_EDITOR || MF_REHEARSAL
            if (rehearsal) tag.Add(PfUi.RehearsalBanner(_text, _text.Get("ui.host.frr.rehearsal")));
#endif
        }

        /// <summary>Readiness summary: Core's dashboard headline numbers and the FRR report's issues by severity.</summary>
        public void BuildSummary(DashboardMetrics d, ReviewReport report, ContractDef contract)
        {
            VisualElement panel = _screen.Q<VisualElement>("pf-summary");
            panel.Clear();
            panel.Add(PfUi.Lbl(_text.Get("ui.host.frr.summary"), "pf-section__title"));
            AddKpi(panel, _text.Get("ui.host.frr.kpi.dv"), _text.KmPerS(d.TotalDvMps) + " / " + _text.KmPerS(d.DvRequiredMps),
                Signed(d.DvMarginFraction * 100.0) + " " + _text.Get("ui.buildbay.unit.percent"), d.DvMarginFraction >= 0 ? "meets" : "fails");
            AddKpi(panel, _text.Get("ui.host.frr.kpi.success"), _text.Percent(d.Success.Success),
                "± " + _text.Percent(d.Success.BandHalfWidth), d.Success.Success >= DesignReview.LowSuccessThreshold ? "meets" : "marginal");
            AddKpi(panel, _text.Get("ui.host.frr.kpi.budget"), _text.Money(d.Budget.TotalCostM) + " / " + _text.Money(d.Budget.BudgetM),
                _text.Format("ui.host.frr.kpi.left", _text.Money(d.Budget.RemainingM)), d.Budget.RemainingM >= 0 ? "meets" : "fails");
            AddKpi(panel, _text.Get("ui.host.frr.kpi.schedule"), _text.Days(d.ScheduleDays) + " / " + _text.Days(contract.ScheduleDays),
                d.Budget.Slips > 0 ? _text.Format("ui.host.frr.kpi.slips", d.Budget.Slips) : _text.Get("ui.host.frr.kpi.on_time"), d.Budget.Slips > 0 ? "marginal" : "meets");

            VisualElement sev = PfUi.El("pf-sevcounts");
            sev.Add(SeverityChip(Severity.Blocker, report.Blockers));
            sev.Add(SeverityChip(Severity.Major, report.Majors));
            sev.Add(SeverityChip(Severity.Minor, report.Minors));
            panel.Add(sev);
            VisualElement issues = PfUi.El("pf-issues");
            int shown = 0;
            foreach (ValidationIssue i in report.Issues)
            {
                if (shown++ >= 5) break;
                issues.Add(IssueRow(i, _text));
            }
            if (report.Issues.Count == 0) issues.Add(PfUi.Lbl(_text.Get("ui.host.frr.no_issues"), "pf-meta"));
            panel.Add(issues);
        }

        public void BuildBoard(string[] roles, System.Func<string, string> item)
        {
            _board = _screen.Q<VisualElement>("pf-board");
            _board.Clear();
            _tiles.Clear();
            foreach (string role in roles)
            {
                var t = new Tile { Root = PfUi.El("pf-console", "pf-console--waiting") };
                VisualElement top = PfUi.El("pf-console__top");
                top.Add(PfUi.Lbl(role, "pf-console__code"));
                t.Icon = new MfIcon { kind = "circle" };
                t.Icon.AddToClassList("pf-console__icon");
                top.Add(t.Icon);
                t.Root.Add(top);
                t.Root.Add(PfUi.Lbl(_text.RoleName(role), "pf-console__name"));
                t.Root.Add(PfUi.Lbl(item(role), "pf-console__item"));
                VisualElement foot = PfUi.El("pf-console__foot");
                t.State = PfUi.Lbl(_text.Get("ui.host.frr.state.waiting"), "pf-console__state");
                t.Who = PfUi.Lbl("", "pf-console__who");
                foot.Add(t.State);
                foot.Add(t.Who);
                t.Root.Add(foot);
                VisualElement bar = PfUi.El("pf-console__timer");
                t.TimerFill = PfUi.El("pf-console__timer-fill");
                bar.Add(t.TimerFill);
                t.Root.Add(bar);
                _tiles[role] = t;
                _board.Add(t.Root);
            }
            _callout = _screen.Q<Label>("pf-callout");
            _callout.text = "";
            _overlay = _screen.Q<VisualElement>("pf-overlay");
            PfUi.Show(_overlay, false);
        }

        /// <summary>Redraws the console tiles from the poll model (server messages only).</summary>
        public void RefreshBoard(PollModel poll, IPreflightChannel channel, int? secondsLeft, long nowMs)
        {
            if (poll == null || poll.PollId == null) return;
            foreach (KeyValuePair<string, Tile> kv in _tiles)
            {
                string role = kv.Key;
                Tile t = kv.Value;
                string answer = poll.AnswerOf(role) ?? "";
                bool called = poll.IsBeingCalled(role);
                t.Root.EnableInClassList("pf-console--called", called);
                if (called)
                {
                    t.Who.text = NameOf(channel, poll.CalledPlayerId);
                    float frac = poll.CallEndsAtMs.HasValue ? Mathf.Clamp01((poll.CallEndsAtMs.Value - nowMs) / (float)Mathf.Max(1, poll.PerCallMs)) : 0f;
                    PfUi.Fill(t.TimerFill, frac);
                }
                else PfUi.Fill(t.TimerFill, 0f);
                if (answer == t.Answer && !called) continue;
                if (answer != t.Answer)
                {
                    t.Answer = answer;
                    SetAnswer(t, answer, called);
                    if (answer.Length > 0) Callout(role, answer);
                }
                else if (called && answer.Length == 0)
                {
                    t.State.text = _text.Get("ui.host.frr.state.called");
                }
            }
        }

        private void SetAnswer(Tile t, string answer, bool called)
        {
            t.Root.EnableInClassList("pf-console--waiting", answer.Length == 0);
            t.Root.EnableInClassList("pf-console--go", answer == PollAnswer.Go);
            t.Root.EnableInClassList("pf-console--nogo", answer == PollAnswer.NoGo);
            t.Root.EnableInClassList("pf-console--noanswer", answer == PollAnswer.NoAnswer);
            t.Icon.kind = answer == PollAnswer.Go ? "meets" : answer == PollAnswer.NoGo ? "fails" : answer == PollAnswer.NoAnswer ? "minus" : "circle";
            t.State.text = answer == PollAnswer.Go ? _text.Get("ui.host.frr.state.go")
                : answer == PollAnswer.NoGo ? _text.Get("ui.host.frr.state.nogo")
                : answer == PollAnswer.NoAnswer ? _text.Get("ui.host.frr.state.noanswer")
                : _text.Get(called ? "ui.host.frr.state.called" : "ui.host.frr.state.waiting");
            if (answer.Length > 0 && !_a11y.ReducedMotion) MfMotion.Enter(t.Icon);
        }

        private void Callout(string role, string answer)
        {
            string key = role + answer;
            if (key == _lastCalloutKey) return;
            _lastCalloutKey = key;
            string word = answer == PollAnswer.Go ? _text.Get("ui.host.frr.state.go") : answer == PollAnswer.NoGo ? _text.Get("ui.host.frr.state.nogo") : _text.Get("ui.host.frr.state.noanswer");
            _callout.text = _text.Format("ui.host.frr.callout", role, word);
            _callout.EnableInClassList("pf-callout--nogo", answer == PollAnswer.NoGo);
        }

        /// <summary>Resets the tiles for a new poll round.</summary>
        public void ShowBoard()
        {
            foreach (Tile t in _tiles.Values)
            {
                t.Answer = "";
                SetAnswer(t, "", false);
                t.Who.text = "";
            }
            _callout.text = "";
            _lastCalloutKey = null;
            PfUi.Show(_overlay, false);
            PfUi.Show(_board, true);
        }

        public void ShowGo()
        {
            Overlay("pf-overlay--go", "meets", _text.Get("ui.host.frr.go.title"), _text.Get("ui.host.frr.go.body"), null);
        }

        public void ShowDiscussion(List<string> noGoRoles, ReviewReport report)
        {
            VisualElement extra = PfUi.El("pf-discuss");
            foreach (string role in noGoRoles)
            {
                VisualElement row = PfUi.El("pf-discuss__row");
                var icon = new MfIcon { kind = "fails" };
                icon.AddToClassList("pf-sev__icon");
                row.Add(icon);
                row.Add(PfUi.Lbl(role + " · " + _text.RoleName(role), "pf-discuss__role"));
                extra.Add(row);
            }
            int n = 0;
            foreach (ValidationIssue i in report.Issues)
            {
                if (n++ >= 3) break;
                extra.Add(IssueRow(i, _text));
            }
            _discussTimer = PfUi.Lbl("", "pf-discuss__timer");
            extra.Add(_discussTimer);
            Overlay("pf-overlay--nogo", "fails", _text.Get("ui.host.frr.discuss.title"), _text.Get("ui.host.frr.discuss.body"), extra);
        }

        public void SetDiscussionSeconds(int s)
        {
            if (_discussTimer != null) _discussTimer.text = _text.Format("ui.host.frr.discuss.repoll_in", _text.Seconds(s));
        }

        public void HideDiscussion() => PfUi.Show(_overlay, false);

        public void ShowReworkRequired(ReviewReport report, bool finishInBay)
        {
            VisualElement extra = PfUi.El("pf-discuss");
            foreach (ValidationIssue i in report.Issues) if (i.Severity == Severity.Blocker) extra.Add(IssueRow(i, _text));
            Overlay("pf-overlay--nogo", "fails", _text.Get("ui.host.frr.rework_required.title"),
                _text.Get(finishInBay ? "ui.host.frr.rework_required.finish_body" : "ui.host.frr.rework_required.body"), extra);
        }

        /// <summary>Puts a vote panel in place of the console board (REVIEW or REWORK_CATEGORY).</summary>
        public void ShowVote(VisualElement panel, string note)
        {
            PfUi.Show(_overlay, false);
            _board.Clear();
            if (note != null) _board.Add(PfUi.Lbl(note, "pf-vote__note"));
            _board.Add(panel);
            _board.AddToClassList("pf-board--vote");
        }

        private void Overlay(string cls, string icon, string title, string body, VisualElement extra)
        {
            _overlay.Clear();
            _overlay.RemoveFromClassList("pf-overlay--go");
            _overlay.RemoveFromClassList("pf-overlay--nogo");
            _overlay.AddToClassList(cls);
            var card = new MfGlassPanel();
            card.AddToClassList("mf-glass");
            card.AddToClassList("pf-overlay__card");
            var i = new MfIcon { kind = icon };
            i.AddToClassList("pf-overlay__icon");
            card.Add(i);
            card.Add(PfUi.Lbl(title, "pf-overlay__title"));
            card.Add(PfUi.Lbl(body, "pf-overlay__body"));
            if (extra != null) card.Add(extra);
            _overlay.Add(card);
            PfUi.Show(_overlay, true);
            if (!_a11y.ReducedMotion) MfMotion.Enter(card);
        }

        private void AddKpi(VisualElement panel, string label, string value, string detail, string status)
        {
            VisualElement row = PfUi.El("pf-kpi", "pf-kpi--" + status);
            var icon = new MfIcon { kind = status };
            icon.AddToClassList("pf-kpi__icon");
            row.Add(icon);
            VisualElement text = PfUi.El("pf-kpi__text");
            text.Add(PfUi.Lbl(label, "pf-fact__label"));
            text.Add(PfUi.Lbl(value, "pf-kpi__value"));
            row.Add(text);
            row.Add(PfUi.Lbl(detail, "pf-kpi__detail"));
            panel.Add(row);
        }

        private VisualElement SeverityChip(Severity s, int count)
        {
            string name = s == Severity.Blocker ? "blocker" : s == Severity.Major ? "major" : "minor";
            VisualElement chip = PfUi.El("pf-sevchip", "pf-sev--" + name);
            var icon = new MfIcon { kind = SeverityIcon(s) };
            icon.AddToClassList("pf-sev__icon");
            chip.Add(icon);
            chip.Add(PfUi.Lbl(count + " " + _text.Get("ui.host.review.severity." + name), "pf-sevchip__label"));
            return chip;
        }

        /// <summary>Blocker = octagon (Fails), Major = triangle (Marginal), Minor = outlined circle.</summary>
        public static string SeverityIcon(Severity s) => s == Severity.Blocker ? "fails" : s == Severity.Major ? "marginal" : "circle";

        public static VisualElement IssueRow(ValidationIssue i, PreflightText t)
        {
            string name = i.Severity == Severity.Blocker ? "blocker" : i.Severity == Severity.Major ? "major" : "minor";
            VisualElement row = PfUi.El("pf-issue", "pf-sev--" + name);
            var icon = new MfIcon { kind = SeverityIcon(i.Severity) };
            icon.AddToClassList("pf-sev__icon");
            row.Add(icon);
            VisualElement text = PfUi.El("pf-issue__text");
            text.Add(PfUi.Lbl(t.Get("ui.host.review.severity." + name), "pf-issue__sev"));
            text.Add(PfUi.Lbl(IssueText(i, t), "pf-issue__body"));
            row.Add(text);
            return row;
        }

        /// <summary>The issue's explanation: its strings key when translated, else Core's English text (args carry units).</summary>
        public static string IssueText(ValidationIssue i, PreflightText t)
        {
            string s = i.TextKey != null && t.Has(i.TextKey) ? t.Get(i.TextKey) : i.Text;
            if (i.Args != null)
                foreach (KeyValuePair<string, string> a in i.Args)
                {
                    string v = a.Key == "category" && t.Has("vote." + a.Value + ".name") ? t.Get("vote." + a.Value + ".name") : a.Value;
                    s = s.Replace("{" + a.Key + "}", v);
                    if (a.Key == "category" && v != a.Value) s = s.Replace(a.Value, v); // Core's English text arrives pre-filled
                }
            return s;
        }

        private static string NameOf(IPreflightChannel channel, string playerId)
        {
            if (channel == null || playerId == null) return "";
            foreach (Seat s in channel.Seats) if (s.PlayerId == playerId) return s.Name;
            return playerId;
        }

        private static string Signed(double v) => (v >= 0 ? "+" : "−") + MissionForge.Screens.BuildBay.UiText.Number(System.Math.Abs(v), 1);
    }
}
