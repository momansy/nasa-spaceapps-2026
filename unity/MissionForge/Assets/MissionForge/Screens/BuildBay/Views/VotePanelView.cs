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
        private readonly Label _category, _roundLabel, _note;
        private readonly MfRadialGauge _timer;
        private readonly MfPhaseStepper _stages;
        private readonly MfTallyBar _tally;
        private readonly VisualElement _options, _feed;
        private readonly MfEmptyState _idle;
        private string _timerStage;
        private int _timerTotal;
        private VoteRoundModel _model;
        private IBayVoteChannel _channel;

        public VotePanelView(VisualElement screen, UiText text, BuildBayScreen owner)
        {
            _text = text;
            _screen = owner;
            _category = screen.Q<Label>("vote-category");
            _roundLabel = screen.Q<Label>("vote-round");
            _timer = screen.Q<MfRadialGauge>("vote-timer");
            _note = screen.Q<Label>("vote-note");
            _stages = screen.Q<MfPhaseStepper>("vote-stage-strip");
            _tally = screen.Q<MfTallyBar>("vote-tally");
            _options = screen.Q<VisualElement>("vote-options");
            _feed = screen.Q<VisualElement>("vote-feed");
            _idle = screen.Q<MfEmptyState>("vote-idle");
            if (_options is ScrollView scroll) MfScrollFade.Attach(scroll);
        }

        public void ShowIdle(bool done)
        {
            _model = null;
            _roundLabel.text = _text.Get("ui.buildbay.vote.title");
            _category.text = _text.Get(done ? "ui.buildbay.vote.done" : "ui.buildbay.vote.idle");
            _timer.EnableInClassList("bb-hidden", true);
            MfMotion.Pulse(_timer, false);
            _note.text = "";
            _stages.Clear();
            _tally.style.display = DisplayStyle.None;
            _options.Clear();
            _feed.Clear();
            if (_idle != null)
            {
                _idle.text = _text.Get(done ? "ui.buildbay.vote.done" : "ui.buildbay.vote.idle");
                _idle.icon = done ? "circle-check" : "hourglass";
                _idle.style.display = DisplayStyle.Flex;
            }
        }

        /// <summary>Updates the timer from the server clock (called every frame).</summary>
        public void Tick(long serverNowMs)
        {
            if (_model == null || !_model.IsOpen || _channel == null || !_channel.HasClock)
            {
                _timer.EnableInClassList("bb-hidden", true);
                MfMotion.Pulse(_timer, false);
                return;
            }
            int? left = VoteClock.SecondsLeft(_model.EndsAtMs, serverNowMs);
            _timer.EnableInClassList("bb-hidden", !left.HasValue);
            if (!left.HasValue) return;
            // The ring's full sweep is the longest time seen in this stage (the server sends only the end time).
            if (_timerStage != _model.Stage) { _timerStage = _model.Stage; _timerTotal = 0; }
            _timerTotal = Math.Max(_timerTotal, Math.Max(1, left.Value));
            bool urgent = left.Value <= UrgentSeconds && (_model.Stage == "VOTE" || _model.Stage == "RUNOFF");
            _timer.Set((float)left.Value / _timerTotal, urgent ? MfStatus.Fails : MfStatus.Info,
                left.Value.ToString(System.Globalization.CultureInfo.InvariantCulture), _text.Get("ui.buildbay.unit.s"),
                (float)UrgentSeconds / _timerTotal);
            _timer.EnableInClassList("bb-timer--urgent", urgent);
            MfMotion.Pulse(_timer, urgent);
        }

        public void Show(VoteRoundModel model, IBayVoteChannel channel)
        {
            _model = model;
            _channel = channel;
            if (_idle != null) _idle.style.display = DisplayStyle.None;
            Header();
            Stages();
            Tally();
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
            var shown = new List<string>(_model.PlanStages);
            if (_model.Stage != null && !shown.Contains(_model.Stage) && _model.Stage != "CLOSED") shown.Add(_model.Stage);
            shown.Sort((a, b) => Array.IndexOf(StageOrder, a).CompareTo(Array.IndexOf(StageOrder, b)));
            var labels = new List<string>(shown.Count);
            foreach (string st in shown) labels.Add(_text.Get("ui.buildbay.stage." + st.ToLowerInvariant()));
            _stages.SetSteps(labels);
            int current = Array.IndexOf(StageOrder, _model.Stage);
            for (int i = 0; i < shown.Count; i++)
            {
                int idx = Array.IndexOf(StageOrder, shown[i]);
                _stages.SetState(i, shown[i] == _model.Stage ? MfStepState.Current
                    : current > idx || _model.Stage == "CLOSED" ? MfStepState.Done : MfStepState.Locked);
            }
        }

        /// <summary>One tally segment per option with its letter and voter dots; hidden while tallies are hidden.</summary>
        private void Tally()
        {
            bool hidden = _model.TalliesHidden && _model.WinnerId == null;
            int cast = 0;
            foreach (OptionState o in _model.Options) cast += Math.Max(0, o.Count ?? 0);
            // Before the first vote the note above already says "0 of N voted": no empty stand-in bar (VISUAL_TARGET 3.1).
            _tally.style.display = hidden || cast == 0 ? DisplayStyle.None : DisplayStyle.Flex;
            if (hidden || cast == 0) return;
            var segments = new List<MfTallySegment>(_model.Options.Count);
            for (int i = 0; i < _model.Options.Count; i++)
            {
                OptionState o = _model.Options[i];
                segments.Add(new MfTallySegment(Letters[Math.Min(i, Letters.Length - 1)], o.Count ?? 0,
                    _model.WinnerId == null && _model.LeadingOptionId == o.Id, _model.WinnerId == o.Id));
            }
            _tally.emptyText = _text.Format("ui.buildbay.vote.voted", 0, _model.VoterCount);
            _tally.Set(segments);
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
            Label key = Text(letter, "bb-card__key");
            int seriesIndex = Array.IndexOf(Letters, letter);
            key.style.backgroundColor = MfPalette.Series[Math.Max(0, seriesIndex) % MfPalette.Series.Length];
            head.Add(key);
            string name = part != null ? part.Name : o.LabelKey != null ? _text.Get(o.LabelKey) : o.Id;
            head.Add(Text(name, "bb-card__name"));
            if (winner) head.Add(Icon("award", MfPalette.Sunlight, "bb-card__state"));
            if (_model.TalliesHidden && _model.WinnerId == null) head.Add(Icon("eye-off", MfPalette.Muted, "bb-card__state"));
            else if (o.Count.HasValue) head.Add(Text(o.Count.Value.ToString(), "bb-card__count"));
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
            if (part != null && part.Maturity != Maturity.Proven) badges.Add(Badge("marginal", _text.Get("ui.buildbay.vote.hidden_risk"), "bb-badge--risk"));
            if (o.OverBudgetByM > 0) badges.Add(Badge("fails", _text.Format("ui.buildbay.vote.over_budget", DashboardViewModel.Money(o.OverBudgetByM)), "bb-badge--bad"));
            if (o.WillNotFly) badges.Add(Badge(o.FixExists ? "marginal" : "fails", _text.Get(o.FixExists ? "ui.buildbay.vote.fix_exists" : "ui.buildbay.vote.will_not_fly"), o.FixExists ? "bb-badge--warn" : "bb-badge--bad"));
            if (o.OverScheduleByDays > 0) badges.Add(Badge("marginal", _text.Format("ui.buildbay.vote.late", UiText.Number(o.OverScheduleByDays, 0) + "\u2009" + _text.Get("ui.buildbay.unit.days")), "bb-badge--warn"));
            foreach (TagItem t in o.Tags)
            {
                string who = t.Role != null && _text.Has("role." + t.Role + ".name") ? _text.Get("role." + t.Role + ".name") : _channel?.PlayerName(t.PlayerId) ?? t.PlayerId;
                bool concern = t.Tag == "CONCERN";
                badges.Add(Badge(concern ? "marginal" : "user", who + " \u00B7 " + _text.Get(VoteRoundModel.TagKey(t.Tag)), concern ? "bb-badge--concern" : "bb-badge--tag"));
            }
            if (o.Vetoed) badges.Add(Badge("fails", _text.Format("ui.buildbay.vote.vetoed", _channel?.PlayerName(o.VetoedBy) ?? o.VetoedBy), "bb-badge--bad"));
            if (badges.childCount > 0) card.Add(badges);

            var deltas = Row("bb-card__row");
            foreach (DeltaItem d in o.Deltas)
            {
                string label = DeltaLabel(d);
                if (label == null) continue;
                var chip = Text(MfText.TrueMinus(label), "bb-delta");
                chip.AddToClassList(d.Rating == "GOOD" ? "bb-delta--good" : d.Rating == "BAD" ? "bb-delta--bad" : "bb-delta--neutral");
                deltas.Add(chip);
            }
            // Only when at least one delta is shown: an "If chosen" label with nothing after it reads as missing data.
            if (deltas.childCount > 0)
            {
                deltas.Insert(0, Text(_text.Get("ui.buildbay.vote.if_chosen"), "bb-card__line"));
                card.Add(deltas);
            }

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
                string icon;
                if (f.Kind == "veto") { line = _text.Format("ui.buildbay.vote.vetoed", who) + target; icon = "fails"; }
                else if (f.Kind == "tag") { line = who + " (" + f.Role + "): " + _text.Get(f.Key) + target; icon = f.Key == "role_tag.concern.name" ? "marginal" : "user"; }
                else { line = _text.Format("ui.buildbay.ping.from", who, f.Key != null ? _text.Get(f.Key) : "") + target; icon = "radio"; }
                var item = Row("bb-feed__item");
                item.AddToClassList("bb-feed__item--" + f.Kind);
                var mark = new MfIcon { kind = icon };
                mark.AddToClassList("bb-feed__icon");
                item.Add(mark);
                item.Add(Text(line, "bb-feed__text"));
                _feed.Add(item);
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

        /// <summary>Badge with a status/identity icon shape (no letter or punctuation glyphs standing in for icons).</summary>
        private static VisualElement Badge(string icon, string text, string cls)
        {
            VisualElement b = Row("bb-card__badge");
            b.AddToClassList(cls);
            var mark = new MfIcon { kind = icon };
            mark.AddToClassList("bb-card__badge-icon");
            b.Add(mark);
            b.Add(Text(text, "bb-card__badge-text"));
            return b;
        }

        private static MfIcon Icon(string kind, UnityEngine.Color tint, string cls)
        {
            var i = new MfIcon { kind = kind, Tint = tint };
            i.AddToClassList(cls);
            return i;
        }
    }
}
