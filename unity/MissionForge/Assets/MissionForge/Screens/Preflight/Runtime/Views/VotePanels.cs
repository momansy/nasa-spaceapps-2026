using System;
using System.Collections.Generic;
using MissionForge.Screens.BuildBay;
using MissionForge.UI;
using UnityEngine;
using UnityEngine.UIElements;

namespace MissionForge.Screens.Preflight
{
    /// <summary>One option as drawn: the card / tile, its tally fill and the badges it can carry.</summary>
    public sealed class OptionView
    {
        public VisualElement Root;
        public VisualElement TallyFill;
        public Label Count;
        public Label Badge;
        public Label Name;
        public VisualElement Voters;
    }

    /// <summary>
    /// Shared body of the vote panels (T027 step 2): title, stage chip, timer ring from the server clock, voted avatars, a
    /// card or tile per option with live or hidden tallies, a coin-flip animation for <c>COIN_FLIP</c> results and the
    /// solo-mode note. Built only from a <see cref="VoteRoundModel"/> (server messages), never from local state.
    /// </summary>
    public abstract class VotePanelBase : VisualElement
    {
        private readonly PreflightText _text;
        private readonly List<OptionView> _views = new List<OptionView>();
        private readonly Label _title = PfUi.Lbl("", "pf-vote__title");
        private readonly Label _why = PfUi.Lbl("", "pf-vote__why");
        private readonly Label _stage = PfUi.Lbl("", "pf-vote__stage");
        private readonly Label _note = PfUi.Lbl("", "pf-vote__note");
        private readonly MfRadialGauge _timer = new MfRadialGauge();
        private readonly VisualElement _voters = PfUi.El("pf-vote__voters");
        private readonly VisualElement _options;
        private readonly VisualElement _result = PfUi.El("pf-vote__result");
        private readonly Label _resultTitle = PfUi.Lbl("", "pf-vote__result-title");
        private readonly Label _resultMethod = PfUi.Lbl("", "pf-vote__result-method");
        private readonly VisualElement _coin = PfUi.El("pf-coin");
        private string _roundId;
        private string _stageName;
        private int _totalMs;
        private IVisualElementScheduledItem _coinAnim;

        protected VotePanelBase(PreflightText text, string optionsClass)
        {
            _text = text;
            AddToClassList("pf-vote");
            VisualElement head = PfUi.El("pf-vote__head");
            VisualElement headText = PfUi.El("pf-vote__headtext");
            headText.Add(_title);
            headText.Add(_why);
            _timer.AddToClassList("mf-gauge--s");
            head.Add(headText);
            head.Add(_timer);
            Add(head);
            VisualElement meta = PfUi.El("pf-vote__meta");
            meta.Add(_stage);
            meta.Add(_voters);
            Add(meta);
            Add(_note);
            _options = PfUi.El(optionsClass);
            Add(_options);
            _coin.Add(PfUi.Lbl("", "pf-coin__face"));
            _result.Add(_coin);
            VisualElement resultText = PfUi.El("pf-vote__result-text");
            resultText.Add(_resultTitle);
            resultText.Add(_resultMethod);
            _result.Add(resultText);
            Add(_result);
            PfUi.Show(_result, false);
        }

        protected PreflightText Text => _text;

        /// <summary>False in narrow review columns: the round's "why" line is left out (the screen explains it already).</summary>
        public bool ShowWhy { get; set; } = true;
        protected abstract OptionView Build(OptionState option, VoteRoundModel round);
        protected abstract void Update(OptionView view, OptionState option, VoteRoundModel round);

        /// <summary>Redraws from the round model. <paramref name="seats"/> names the voters; <paramref name="secondsLeft"/> is null while untimed or the clock is unknown.</summary>
        public void Refresh(VoteRoundModel round, IReadOnlyList<Seat> seats, int? secondsLeft, long nowMs, bool reducedMotion)
        {
            if (round.RoundId == null) return;
            if (round.RoundId != _roundId)
            {
                _roundId = round.RoundId;
                _options.Clear();
                _views.Clear();
                _title.text = _text.Get(round.TitleKey ?? "ui.buildbay.vote.title");
                _why.text = round.WhyKey != null ? _text.Get(round.WhyKey) : "";
                PfUi.Show(_why, ShowWhy && round.WhyKey != null);
                foreach (OptionState o in round.Options)
                {
                    OptionView v = Build(o, round);
                    _views.Add(v);
                    _options.Add(v.Root);
                }
                PfUi.Show(_result, false);
                _stageName = null;
            }

            if (round.Stage != _stageName)
            {
                _stageName = round.Stage;
                _totalMs = round.EndsAtMs.HasValue ? (int)Math.Max(1, round.EndsAtMs.Value - round.StartedAtMs) : 0;
            }
            _stage.text = round.Cancelled ? _text.Get("ui.buildbay.vote.cancelled") : _text.Stage(round.Stage);

            // Timer ring: remaining fraction from the server-clock deadline; hidden until the clock offset is known.
            bool timed = secondsLeft.HasValue && round.EndsAtMs.HasValue;
            PfUi.Show(_timer, timed);
            if (timed)
            {
                float left = Mathf.Clamp01((float)(round.EndsAtMs.Value - nowMs) / Math.Max(1, _totalMs));
                _timer.Set(left, secondsLeft.Value <= 3 ? MfStatus.Fails : MfStatus.Info, secondsLeft.Value.ToString(), _text.Get("ui.buildbay.unit.s"));
            }

            _note.text = round.Solo ? _text.Get("ui.buildbay.vote.solo") : round.TalliesHidden && round.Stage != "RESULT" && round.Stage != "CLOSED" ? _text.Get("ui.buildbay.vote.hidden") : "";
            PfUi.Show(_note, _note.text.Length > 0);

            DrawVoters(round, seats);
            int maxCount = 1;
            foreach (OptionState o in round.Options) if (o.Count.HasValue) maxCount = Math.Max(maxCount, o.Count.Value);
            for (int i = 0; i < _views.Count && i < round.Options.Count; i++)
            {
                OptionState o = round.Options[i];
                OptionView v = _views[i];
                bool winner = round.WinnerId == o.Id;
                v.Root.EnableInClassList("pf-option--winner", winner);
                v.Root.EnableInClassList("pf-option--out", !o.Candidate && !winner);
                v.Root.EnableInClassList("pf-option--leading", round.LeadingOptionId == o.Id && round.WinnerId == null);
                if (v.TallyFill != null) PfUi.Fill(v.TallyFill, o.Count.HasValue ? o.Count.Value / (float)Math.Max(1, Math.Max(maxCount, round.VoterCount)) : 0f);
                if (v.Count != null)
                {
                    v.Count.text = o.Count.HasValue ? o.Count.Value + " " + _text.Get("ui.buildbay.vote.votes") : "";
                    PfUi.Show(v.Count, o.Count.HasValue);
                }
                if (v.Badge != null)
                {
                    string badge = winner ? _text.Get("ui.buildbay.vote.winner") : round.LeadingOptionId == o.Id && round.WinnerId == null ? _text.Get("ui.buildbay.vote.leading") : "";
                    v.Badge.text = badge;
                    PfUi.Show(v.Badge, badge.Length > 0);
                }
                Update(v, o, round);
            }
            DrawResult(round, reducedMotion);
        }

        private void DrawVoters(VoteRoundModel round, IReadOnlyList<Seat> seats)
        {
            _voters.Clear();
            if (round.VoterCount == 0) return;
            _voters.Add(PfUi.Lbl(_text.Format("ui.buildbay.vote.voted", round.VotedIds.Count, round.VoterCount), "pf-vote__voted"));
            foreach (string id in round.VotedIds)
            {
                string name = id;
                if (seats != null) foreach (Seat s in seats) if (s.PlayerId == id) name = s.Name;
                var badge = new AvatarBadge();
                badge.AddToClassList("pf-avatar");
                badge.SetIdentity(id, name);
                _voters.Add(badge);
            }
        }

        private void DrawResult(VoteRoundModel round, bool reducedMotion)
        {
            bool done = round.WinnerId != null;
            PfUi.Show(_result, done);
            if (!done) return;
            OptionState w = round.Option(round.WinnerId);
            _resultTitle.text = w != null ? _text.OptionName(round, w) : round.WinnerId;
            _resultMethod.text = _text.Method(round.Method);
            bool coin = round.Method == "COIN_FLIP";
            PfUi.Show(_coin, coin);
            if (coin && _coinAnim == null)
            {
                Label face = _coin.Q<Label>();
                int frames = 0;
                _coinAnim = schedule.Execute(() =>
                {
                    frames++;
                    float spin = reducedMotion ? 1f : Mathf.Abs(Mathf.Cos(frames * 0.35f));
                    _coin.style.scale = new Scale(new Vector2(1f, Mathf.Max(0.08f, spin)));
                    face.text = frames < 18 && !reducedMotion ? (frames % 2 == 0 ? "A" : "B") : (w != null && _text.OptionName(round, w).Length > 0 ? _text.OptionName(round, w).Substring(0, 1) : "");
                }).Every(40).Until(() => frames >= 22 || reducedMotion);
            }
        }
    }

    /// <summary>CHOICE-profile cards (CONTRACT, REWORK_CATEGORY): one card per option with a caller-supplied body and a tally bar.</summary>
    public sealed class ChoiceVotePanel : VotePanelBase
    {
        private readonly Func<OptionState, VoteRoundModel, VisualElement> _body;

        public ChoiceVotePanel(PreflightText text, Func<OptionState, VoteRoundModel, VisualElement> body) : base(text, "pf-cards")
        {
            _body = body;
        }

        protected override OptionView Build(OptionState option, VoteRoundModel round)
        {
            VisualElement card = PfUi.Focusable(PfUi.El("pf-card"));
            var v = new OptionView { Root = card };
            VisualElement top = PfUi.El("pf-card__top");
            v.Name = PfUi.Lbl(Text.OptionName(round, option), "pf-card__name");
            v.Badge = PfUi.Lbl("", "pf-badge");
            top.Add(v.Name);
            top.Add(v.Badge);
            card.Add(top);
            VisualElement body = _body?.Invoke(option, round);
            if (body != null) card.Add(body);
            VisualElement bar = PfUi.El("pf-tally");
            v.TallyFill = PfUi.El("pf-tally__fill");
            bar.Add(v.TallyFill);
            card.Add(bar);
            v.Count = PfUi.Lbl("", "pf-card__count");
            card.Add(v.Count);
            return v;
        }

        protected override void Update(OptionView view, OptionState option, VoteRoundModel round)
        {
        }
    }

    /// <summary>QUICK-profile tiles (TEST, REVIEW, ANOMALY): two or three large options with a detail line and a tally.</summary>
    public sealed class QuickVotePanel : VotePanelBase
    {
        private readonly Func<OptionState, string> _detail;

        public QuickVotePanel(PreflightText text, Func<OptionState, string> detail = null) : base(text, "pf-tiles")
        {
            _detail = detail;
        }

        protected override OptionView Build(OptionState option, VoteRoundModel round)
        {
            VisualElement tile = PfUi.Focusable(PfUi.El("pf-tile"));
            var v = new OptionView { Root = tile };
            v.Name = PfUi.Lbl(Text.OptionName(round, option), "pf-tile__name");
            tile.Add(v.Name);
            string detail = _detail?.Invoke(option);
            if (!string.IsNullOrEmpty(detail)) tile.Add(PfUi.Lbl(detail, "pf-tile__detail"));
            VisualElement bar = PfUi.El("pf-tally");
            v.TallyFill = PfUi.El("pf-tally__fill");
            bar.Add(v.TallyFill);
            tile.Add(bar);
            VisualElement foot = PfUi.El("pf-tile__foot");
            v.Count = PfUi.Lbl("", "pf-card__count");
            v.Badge = PfUi.Lbl("", "pf-badge");
            foot.Add(v.Count);
            foot.Add(v.Badge);
            tile.Add(foot);
            return v;
        }

        protected override void Update(OptionView view, OptionState option, VoteRoundModel round)
        {
        }
    }
}
