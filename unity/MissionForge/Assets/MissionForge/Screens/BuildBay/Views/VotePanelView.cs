using System;
using System.Collections.Generic;
using MissionForge.Core.Build;
using MissionForge.Core.Data;
using MissionForge.UI;
using UnityEngine.UIElements;

namespace MissionForge.Screens.BuildBay
{
    /// <summary>
    /// The vote panel (design 6.1 right, 14.3 Part Card): category, round counter, server-clock timer, stage strip,
    /// and one card per option with name, key stats with units, drawbacks always visible, hidden-risk badge, "if
    /// chosen" deltas (arrow, sign, unit), live tally (or hidden), role tags, vetoes struck through; then the feed of
    /// pings, tags and vetoes. Non-PART rounds (TEST, ANOMALY, REVIEW…) render generically from their labels.
    /// </summary>
    public sealed class VotePanelView
    {
        private static readonly string[] Letters = { "A", "B", "C", "D", "E", "F", "G", "H", "I", "J" };
        private static readonly string[] StageOrder = { "REVEAL", "PREDICT", "INSPECT", "VOTE", "RUNOFF", "TIEBREAK_TRIVIA", "TIEBREAK_PICK", "RESULT" };
        /// <summary>Seconds left at which the timer turns urgent (shape: it also grows; colour is not alone). game_value.</summary>
        private const int UrgentSeconds = 5;

        private readonly UiText _text;
        private readonly BuildBayScreen _screen;
        private readonly Label _category, _roundLabel, _timerValue, _timerUnit, _note;
        private readonly VisualElement _timer, _stages, _options, _feed;
        private VoteRoundModel _model;
        private IBayVoteChannel _channel;

        public VotePanelView(VisualElement screen, UiText text, BuildBayScreen owner)
        {
            _text = text;
            _screen = owner;
            _category = screen.Q<Label>("vote-category");
            _roundLabel = screen.Q<Label>("vote-round");
            _timer = screen.Q<VisualElement>("vote-timer");
            _timerValue = screen.Q<Label>("vote-timer-value");
            _timerUnit = screen.Q<Label>("vote-timer-unit");
            _note = screen.Q<Label>("vote-note");
            _stages = screen.Q<VisualElement>("vote-stage-strip");
            _options = screen.Q<VisualElement>("vote-options");
            _feed = screen.Q<VisualElement>("vote-feed");
            _timerUnit.text = text.Get("ui.buildbay.unit.s");
        }

        public void ShowIdle(bool done)
        {
            _model = null;
            _roundLabel.text = _text.Get("ui.buildbay.vote.title");
            _category.text = _text.Get(done ? "ui.buildbay.vote.done" : "ui.buildbay.vote.idle");
            _timer.EnableInClassList("bb-hidden", true);
            _note.text = "";
            _stages.Clear();
            _options.Clear();
            _feed.Clear();
        }

        /// <summary>Updates the timer from the server clock (called every frame).</summary>
        public void Tick(long serverNowMs)
        {
            if (_model == null || !_model.IsOpen || _channel == null || !_channel.HasClock)
            {
                _timer.EnableInClassList("bb-hidden", true);
                return;
            }
            int? left = VoteClock.SecondsLeft(_model.EndsAtMs, serverNowMs);
            _timer.EnableInClassList("bb-hidden", !left.HasValue);
            if (!left.HasValue) return;
            _timerValue.text = left.Value.ToString(System.Globalization.CultureInfo.InvariantCulture);
            _timer.EnableInClassList("bb-timer--urgent", left.Value <= UrgentSeconds && (_model.Stage == "VOTE" || _model.Stage == "RUNOFF"));
        }

        public void Show(VoteRoundModel model, IBayVoteChannel channel)
        {
            _model = model;
            _channel = channel;
            Header();
            Stages();
            Options();
            Feed();
        }

        private void Header()
        {
            BuildBaySession s = _screen.Session;
            int total = s.Votes.Count, decided = 0;
            foreach (ContractVote v in s.Votes) if (s.Build.Has(v.Slot)) decided++;
            bool committed = _model.SubjectId != null && s.Build.Has(_model.SubjectId);
            int index = Math.Min(total, decided + (committed ? 0 : 1));
            _roundLabel.text = _model.Kind == "PART"
                ? _text.Format("ui.buildbay.vote.round", index, total)
                : _text.Get("ui.buildbay.round." + (_model.Kind ?? "").ToLowerInvariant());
            _category.text = _model.TitleKey != null ? _text.Get(_model.TitleKey) : (_model.SubjectId ?? "");

            string note;
            if (_model.Cancelled) note = _text.Get("ui.buildbay.vote.cancelled");
            else if (_model.WinnerId != null)
            {
                note = _text.Get("ui.buildbay.vote.method." + (_model.Method ?? "plurality").ToLowerInvariant());
                if (_model.EmergencyFunding) note += " · " + _text.Get("ui.buildbay.vote.emergency_funding");
            }
            else if (_model.Solo) note = _text.Get("ui.buildbay.vote.solo");
            else
            {
                note = _text.Format("ui.buildbay.vote.voted", _model.VotedIds.Count, _model.VoterCount);
                if (_model.TalliesHidden) note += " · " + _text.Get("ui.buildbay.vote.hidden");
            }
            _note.text = note;
        }

        private void Stages()
        {
            _stages.Clear();
            var shown = new List<string>(_model.PlanStages);
            if (_model.Stage != null && !shown.Contains(_model.Stage) && _model.Stage != "CLOSED") shown.Add(_model.Stage);
            shown.Sort((a, b) => Array.IndexOf(StageOrder, a).CompareTo(Array.IndexOf(StageOrder, b)));
            int current = Array.IndexOf(StageOrder, _model.Stage);
            foreach (string st in shown)
            {
                var chip = new Label(_text.Get("ui.buildbay.stage." + st.ToLowerInvariant()));
                chip.AddToClassList("bb-stagechip");
                int idx = Array.IndexOf(StageOrder, st);
                chip.EnableInClassList("bb-stagechip--current", st == _model.Stage);
                chip.EnableInClassList("bb-stagechip--done", current > idx || _model.Stage == "CLOSED");
                _stages.Add(chip);
            }
        }

        private void Options()
        {
            _options.Clear();
            int max = 0;
            foreach (OptionState o in _model.Options) if (o.Count.HasValue) max = Math.Max(max, o.Count.Value);
            for (int i = 0; i < _model.Options.Count; i++) _options.Add(Card(_model.Options[i], Letters[Math.Min(i, Letters.Length - 1)], max));
        }

        private VisualElement Card(OptionState o, string letter, int maxCount)
        {
            GameCatalog catalog = _screen.Session.Catalog;
            PartDef part = o.PartId != null && catalog.Parts.TryGetValue(o.PartId, out PartDef p) ? p : null;
            var card = new VisualElement { name = "option-" + o.Id };
            card.AddToClassList("bb-card");
            bool winner = _model.WinnerId == o.Id;
            card.EnableInClassList("bb-card--winner", winner);
            card.EnableInClassList("bb-card--leading", !winner && _model.WinnerId == null && _model.LeadingOptionId == o.Id);
            card.EnableInClassList("bb-card--vetoed", o.Vetoed);
            card.EnableInClassList("bb-card--out", !o.Candidate && !o.Vetoed && _model.WinnerId == null);

            var head = Row("bb-card__head");
            head.Add(Text(letter, "bb-card__key"));
            string name = part != null ? part.Name : o.LabelKey != null ? _text.Get(o.LabelKey) : o.Id;
            head.Add(Text(name, "bb-card__name"));
            string count = _model.TalliesHidden && _model.WinnerId == null ? "—" : o.Count.HasValue ? o.Count.Value.ToString() : "";
            head.Add(Text(count, "bb-card__count"));
            card.Add(head);

            if (part != null)
            {
                card.Add(Text(StatsLine(part), "bb-card__line"));
                var drawbacks = new List<string>();
                for (int d = 1; d <= 3; d++) if (_text.Has("part." + part.Id + ".drawback." + d)) drawbacks.Add(_text.Get("part." + part.Id + ".drawback." + d));
                string drawback = drawbacks.Count > 0 ? string.Join(" \u00B7 ", drawbacks) : null;
                if (drawback != null) card.Add(Text(_text.Get("ui.buildbay.vote.drawbacks") + ": " + drawback, "bb-card__drawback"));
            }

            var badges = Row("bb-card__row");
            if (part != null && part.Maturity != Maturity.Proven) badges.Add(Badge("! " + _text.Get("ui.buildbay.vote.hidden_risk"), "bb-badge--risk"));
            if (o.OverBudgetByM > 0) badges.Add(Badge(_text.Format("ui.buildbay.vote.over_budget", DashboardViewModel.Money(o.OverBudgetByM)), "bb-badge--bad"));
            if (o.WillNotFly) badges.Add(Badge("× " + _text.Get(o.FixExists ? "ui.buildbay.vote.fix_exists" : "ui.buildbay.vote.will_not_fly"), o.FixExists ? "bb-badge--warn" : "bb-badge--bad"));
            if (o.OverScheduleByDays > 0) badges.Add(Badge(_text.Format("ui.buildbay.vote.late", UiText.Number(o.OverScheduleByDays, 0) + " " + _text.Get("ui.buildbay.unit.days")), "bb-badge--warn"));
            foreach (TagItem t in o.Tags)
            {
                string who = t.Role != null && _text.Has("role." + t.Role + ".name") ? _text.Get("role." + t.Role + ".name") : _channel?.PlayerName(t.PlayerId) ?? t.PlayerId;
                badges.Add(Badge((t.Tag == "CONCERN" ? "! " : "• ") + who + " · " + _text.Get(VoteRoundModel.TagKey(t.Tag)), t.Tag == "CONCERN" ? "bb-badge--concern" : "bb-badge--tag"));
            }
            if (o.Vetoed) badges.Add(Badge(_text.Format("ui.buildbay.vote.vetoed", _channel?.PlayerName(o.VetoedBy) ?? o.VetoedBy), "bb-badge--bad"));
            if (badges.childCount > 0) card.Add(badges);

            if (o.Deltas.Count > 0)
            {
                var deltas = Row("bb-card__row");
                deltas.Add(Text(_text.Get("ui.buildbay.vote.if_chosen"), "bb-card__line"));
                foreach (DeltaItem d in o.Deltas)
                {
                    string label = DeltaLabel(d);
                    if (label == null) continue;
                    var chip = Text(label, "bb-delta");
                    chip.AddToClassList(d.Rating == "GOOD" ? "bb-delta--good" : d.Rating == "BAD" ? "bb-delta--bad" : "bb-delta--neutral");
                    deltas.Add(chip);
                }
                card.Add(deltas);
            }

            var tally = new VisualElement();
            tally.AddToClassList("bb-card__tally");
            var fill = new VisualElement();
            fill.AddToClassList("bb-card__tally-fill");
            float frac = maxCount > 0 && o.Count.HasValue ? (float)o.Count.Value / Math.Max(1, _model.VoterCount) : 0f;
            fill.style.width = Length.Percent(Math.Min(1f, frac) * 100f);
            tally.Add(fill);
            card.Add(tally);

            if (o.Vetoed)
            {
                var strike = new VisualElement();
                strike.AddToClassList("bb-card__strike");
                card.Add(strike);
            }
            return card;
        }

        /// <summary>"Thrust 845 kN · Isp 311 s · 0.47 t · $6.0 M · 45 days · 98.5 % ±1" with the stats the category has.</summary>
        private string StatsLine(PartDef p)
        {
            var bits = new List<string>();
            double? thrust = p.Stats.ThrustSlN ?? p.Stats.ThrustVacN;
            if (thrust.HasValue) bits.Add(UiText.Number(thrust.Value / 1000.0, 0) + " " + _text.Get("ui.buildbay.unit.kn"));
            double? isp = p.Stats.IspVacS;
            if (isp.HasValue) bits.Add(UiText.Number(isp.Value, 0) + " " + _text.Get("ui.buildbay.unit.s"));
            if (p.MassKg > 0) bits.Add(UiText.Number(p.MassKg / 1000.0, p.MassKg < 10000 ? 2 : 1) + " " + _text.Get("ui.buildbay.unit.t"));
            if (p.CostM > 0) bits.Add(DashboardViewModel.Money(p.CostM));
            if (p.LeadDays > 0) bits.Add(UiText.Number(p.LeadDays, 0) + " " + _text.Get("ui.buildbay.unit.days"));
            if (p.Reliability.HasValue)
            {
                double band = BuildConstants.BandHalfWidth(p.Maturity) * 100; // Core's maturity band half-width
                bits.Add(UiText.Number(p.Reliability.Value * 100, 1) + " % ±" + UiText.Number(band, 0) + " %");
            }
            return string.Join(" · ", bits);
        }

        private string DeltaLabel(DeltaItem d)
        {
            switch (d.Metric)
            {
                case "TOTAL_DV_MS": return Arrow(d.Delta, 0, "ui.buildbay.delta.dv", "ui.buildbay.unit.m_s");
                case "COST_M": return Arrow(d.Delta, 1, "ui.buildbay.delta.cost", "ui.buildbay.unit.money_m");
                case "SCHEDULE_DAYS": return Arrow(d.Delta, 0, "ui.buildbay.delta.schedule", "ui.buildbay.unit.days");
                default: return null; // the card shows Δv, cost and schedule; the dashboard shows the rest for the leader
            }
        }

        private string Arrow(double delta, int decimals, string nameKey, string unitKey)
        {
            if (Math.Round(delta, decimals) == 0) return null;
            return (delta > 0 ? "↑" : "↓") + " " + _text.Get(nameKey) + " " + UiText.Signed(delta, decimals) + " " + _text.Get(unitKey);
        }

        private void Feed()
        {
            _feed.Clear();
            foreach (FeedItem f in _model.Feed)
            {
                string who = _channel?.PlayerName(f.PlayerId) ?? f.PlayerId;
                string target = f.OptionId != null && _screen.Session.Catalog.Parts.TryGetValue(f.OptionId, out PartDef p) ? " › " + p.Name : "";
                string line;
                if (f.Kind == "veto") line = "× " + _text.Format("ui.buildbay.vote.vetoed", who) + target;
                else if (f.Kind == "tag") line = (f.Key == "role_tag.concern.name" ? "! " : "• ") + who + " (" + f.Role + "): " + _text.Get(f.Key) + target;
                else line = _text.Format("ui.buildbay.ping.from", who, f.Key != null ? _text.Get(f.Key) : "") + target;
                var label = Text(line, "bb-feed__item");
                label.AddToClassList("bb-feed__item--" + f.Kind);
                _feed.Add(label);
            }
        }

        private static VisualElement Row(string cls)
        {
            var v = new VisualElement();
            v.AddToClassList(cls);
            return v;
        }

        private static Label Text(string text, string cls)
        {
            var l = new Label(text);
            l.AddToClassList(cls);
            return l;
        }

        private static Label Badge(string text, string cls)
        {
            Label l = Text(text, "bb-card__badge");
            l.AddToClassList(cls);
            return l;
        }
    }
}
