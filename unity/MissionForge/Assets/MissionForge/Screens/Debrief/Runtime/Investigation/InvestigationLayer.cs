using System;
using System.Collections.Generic;
using System.Linq;
using MissionForge.Core.Session;
using MissionForge.EndScreens.Investigation;
using MissionForge.EndScreens.Sources;
using MissionForge.UI;
using UnityEngine;
using UnityEngine.UIElements;

namespace MissionForge.Screens.Debrief
{
    /// <summary>
    /// Host view of MG-28 (design 9.9.2–4): clue cards with their owners, the chain of evidence, the four cause options with
    /// live votes, then the reveal: the root cause, its real-world parallel (Codex lesson entry), the Lessons Learned card
    /// from Core <see cref="LessonsLearned.For"/>, and Retry.
    /// </summary>
    public sealed class InvestigationLayer
    {
        private readonly VisualElement _host;
        private readonly EndText _text;
        private readonly InvestigationHost _run;
        private readonly IReadOnlyDictionary<string, DebriefPlayer> _players;
        private readonly CodexEntryView _lessonEntry;
        private readonly Action _back, _openCodex, _retry;
        private VisualElement _cards, _chain, _right, _actions;
        private Label _timer, _voted;
        private IVisualElementScheduledItem _tick;
        private bool _revealed;

        public InvestigationLayer(VisualElement host, InvestigationHost run, IReadOnlyDictionary<string, DebriefPlayer> players, CodexEntryView lessonEntry,
            EndText text, Action back, Action openCodex, Action retry)
        {
            _host = host;
            _run = run;
            _players = players;
            _lessonEntry = lessonEntry;
            _text = text;
            _back = back;
            _openCodex = openCodex;
            _retry = retry;
        }

        public bool Revealed => _revealed;

        public void Open()
        {
            _host.Clear();
            var panel = new MfGlassPanel();
            panel.AddToClassList("mf-glass");
            panel.AddToClassList("mf-end-panel");
            panel.AddToClassList("mf-layer");
            _host.Add(panel);

            var head = new VisualElement();
            head.AddToClassList("mf-layer__head");
            var titles = new VisualElement();
            titles.AddToClassList("mf-layer__titles");
            titles.Add(L(_text["minigame.MG-28.name"], "mf-h2"));
            titles.Add(L(_text["ui.host.debrief.investigation.sub"], "mf-label"));
            head.Add(titles);
            _voted = L("", "mf-label");
            _voted.AddToClassList("mf-inv__voted");
            head.Add(_voted);
            _timer = L("", "mf-kpi");
            _timer.AddToClassList("mf-inv__timer");
            _timer.enableRichText = true;
            head.Add(_timer);
            panel.Add(head);

            var body = new VisualElement();
            body.AddToClassList("mf-inv__body");
            var cardsCol = Column("mf-inv__cards-col", _text["ui.host.debrief.investigation.clues"]);
            var scroll = new ScrollView(ScrollViewMode.Vertical) { horizontalScrollerVisibility = ScrollerVisibility.Hidden, verticalScrollerVisibility = ScrollerVisibility.Hidden };
            scroll.AddToClassList("mf-inv__scroll");
            _cards = new VisualElement();
            _cards.AddToClassList("mf-inv__cards");
            scroll.Add(_cards);
            cardsCol.Add(scroll);
            MfScrollFade.Attach(scroll);
            var chainCol = Column("mf-inv__chain-col", _text["ui.host.debrief.investigation.chain"]);
            _chain = new VisualElement();
            _chain.AddToClassList("mf-inv__chain");
            chainCol.Add(Scrolled(_chain));
            var rightCol = new VisualElement();
            rightCol.AddToClassList("mf-inv__right");
            _right = new VisualElement();
            rightCol.Add(Scrolled(_right));
            body.Add(cardsCol);
            body.Add(chainCol);
            body.Add(rightCol);
            panel.Add(body);

            var actions = new VisualElement();
            _actions = actions;
            actions.AddToClassList("mf-layer__actions");
            var note = L(_run.IsRehearsal ? _text["ui.host.debrief.investigation.rehearsal"] : _text["ui.host.debrief.investigation.live"], "mf-label");
            note.AddToClassList("mf-layer__note");
            actions.Add(note);
            actions.Add(Btn("btn-inv-back", _text["ui.host.debrief.replay.back"], "chevron-left", "mf-btn--ghost", _back));
            actions.Add(Btn("btn-inv-lock", _text["ui.host.debrief.investigation.lock"], "lock", "mf-btn--secondary", () => _run.LockNow()));
            panel.Add(actions);

            _run.Changed += OnChanged;
            Render();
            _tick = panel.schedule.Execute(() =>
            {
                _run.Tick();
                _timer.text = MfText.WithUnit(Mathf.CeilToInt((float)_run.SecondsLeft).ToString(), _text["ui.host.debrief.unit.seconds"]);
            }).Every(50);
        }

        public void Close()
        {
            _tick?.Pause();
            _run.Changed -= OnChanged;
            _host.Clear();
        }

        private void OnChanged(InvestigationState _) => Render();

        private void Render()
        {
            InvestigationState st = _run.State;
            InvestigationSetup s = _run.Setup;
            _voted.text = _text.Format("ui.host.debrief.investigation.voted", st.Votes.Count, s.PlayerIds.Count);
            RenderCards(s, st);
            RenderChain(s, st);
            if (st.Locked) Reveal(s, st);
            else RenderCauses(s, st);
        }

        private void RenderCards(InvestigationSetup s, InvestigationState st)
        {
            _cards.Clear();
            for (int i = 0; i < s.Clues.Length; i++)
            {
                Clue clue = s.Table.Clues[s.Clues[i]];
                bool onChain = st.Chain.Contains(i);
                VisualElement card = ClueCard(clue, i, onChain);
                string owner = s.PlayerIds.Count > 0 ? s.PlayerIds[s.OwnerSlot(i)] : null;
                if (owner != null && _players.TryGetValue(owner, out DebriefPlayer p))
                {
                    card.Add(Avatar(p, "mf-inv-card__owner"));
                }
                if (st.Locked)
                {
                    int truePlace = Array.IndexOf(s.TrueChain, i);
                    card.EnableInClassList("mf-inv-card--evidence", truePlace >= 0);
                }
                _cards.Add(card);
            }
        }

        private VisualElement ClueCard(Clue clue, int index, bool onChain)
        {
            var card = new VisualElement { name = "clue-" + index };
            card.AddToClassList("mf-inv-card");
            card.EnableInClassList("mf-inv-card--placed", onChain);
            var head = new VisualElement();
            head.AddToClassList("mf-inv-card__head");
            var icon = new MfIcon { kind = ChannelIcon(clue.Channel) };
            icon.AddToClassList("mf-inv-card__icon");
            head.Add(icon);
            head.Add(L(_text["ui.host.debrief.clue_channel." + clue.Channel] + " · " + _text["ui.host.debrief.clue_pattern." + clue.Pattern], "mf-inv-card__channel"));
            card.Add(head);
            card.Add(L(_text["ui.host.debrief.clue." + clue.Id], "mf-inv-card__text"));
            card.Add(L(_text["flight_phase." + clue.Phase + ".name"], "mf-inv-card__phase"));
            return card;
        }

        private void RenderChain(InvestigationSetup s, InvestigationState st)
        {
            _chain.Clear();
            for (int place = 0; place < s.ChainLen; place++)
            {
                var slot = new VisualElement { name = "chain-" + place };
                slot.AddToClassList("mf-inv-place");
                var num = L((place + 1).ToString(), "mf-inv-place__num");
                slot.Add(num);
                int idx = st.Chain[place];
                if (idx < 0)
                {
                    slot.AddToClassList("mf-inv-place--empty");
                    slot.Add(L(_text["ui.host.debrief.investigation.empty_place"], "mf-inv-place__empty"));
                }
                else
                {
                    Clue clue = s.Table.Clues[s.Clues[idx]];
                    var text = new VisualElement();
                    text.AddToClassList("mf-inv-place__text");
                    text.Add(L(_text["ui.host.debrief.clue_channel." + clue.Channel] + " · " + _text["ui.host.debrief.clue_pattern." + clue.Pattern], "mf-inv-card__channel"));
                    text.Add(L(_text["ui.host.debrief.clue." + clue.Id], "mf-inv-place__clue"));
                    slot.Add(text);
                    if (st.Locked)
                    {
                        bool right = s.TrueChain[place] == idx;
                        slot.AddToClassList(right ? "mf-inv-place--right" : "mf-inv-place--wrong");
                        var mark = new MfIcon { kind = right ? "meets" : "fails" };
                        mark.AddToClassList("mf-inv-place__mark");
                        slot.Add(mark);
                    }
                }
                _chain.Add(slot);
                if (place < s.ChainLen - 1)
                {
                    var arrow = new MfIcon { kind = "arrow-down" };
                    arrow.AddToClassList("mf-inv-place__arrow");
                    _chain.Add(arrow);
                }
            }
        }

        private void RenderCauses(InvestigationSetup s, InvestigationState st)
        {
            _right.Clear();
            _right.Add(L(_text["ui.host.debrief.investigation.causes"], "mf-h3"));
            int[] counts = st.VoteCounts;
            int leading = InvestigationReducer.Leading(st);
            for (int o = 0; o < InvestigationSetup.OptionCount; o++)
            {
                var row = new VisualElement { name = "cause-" + o };
                row.AddToClassList("mf-inv-cause");
                row.EnableInClassList("mf-inv-cause--leading", o == leading);
                var key = L(((char)('1' + o)).ToString(), "mf-tag");
                key.AddToClassList("mf-tag--key");
                row.Add(key);
                var text = new VisualElement();
                text.AddToClassList("mf-inv-cause__text");
                text.Add(L(_text["ui.host.debrief.failure_mode." + s.OptionIds[o]], "mf-inv-cause__name"));
                var voters = new VisualElement();
                voters.AddToClassList("mf-inv-cause__voters");
                foreach (KeyValuePair<string, int> v in st.Votes.Where(v => v.Value == o))
                {
                    if (!_players.TryGetValue(v.Key, out DebriefPlayer p)) continue;
                    voters.Add(Avatar(p, "mf-inv-cause__voter"));
                }
                text.Add(voters);
                row.Add(text);
                row.Add(L(counts[o].ToString(), "mf-inv-cause__count"));
                _right.Add(row);
            }
        }

        private void Reveal(InvestigationSetup s, InvestigationState st)
        {
            _right.Clear();
            _right.AddToClassList("mf-inv__right--reveal");
            int right = st.Votes.Values.Count(v => v == s.CauseCorrect);
            bool found = right > 0;
            if (!_revealed && found) MfMotion.Celebrate(_right);
            _revealed = true;

            var root = new VisualElement { name = "reveal-root" };
            root.AddToClassList("mf-inv-reveal");
            root.EnableInClassList("mf-inv-reveal--missed", !found);
            var head = new VisualElement();
            head.AddToClassList("mf-inv-reveal__head");
            head.Add(new MfIcon { kind = found ? "check-circle-2" : "info" });
            head.Add(L(_text[found ? "ui.host.debrief.investigation.root_cause" : "ui.host.debrief.investigation.root_cause_missed"], "mf-label"));
            root.Add(head);
            root.Add(L(_text["ui.host.debrief.failure_mode." + s.RootCauseId], "mf-h3"));
            root.Add(L(_text.Format("ui.host.debrief.investigation.found_by", right, s.PlayerIds.Count), "mf-label"));
            _right.Add(root);

            if (_lessonEntry != null && _lessonEntry.Facts.Count > 0)
            {
                var parallel = new VisualElement { name = "reveal-parallel" };
                parallel.AddToClassList("mf-inv-parallel");
                parallel.Add(L(_text["ui.host.codex.parallel"], "mf-label mf-label--strong"));
                foreach (FactView f in _lessonEntry.Facts)
                {
                    parallel.Add(L(_text[f.TextKey], "mf-inv-parallel__text"));
                    parallel.Add(L(_text.Format("ui.host.debrief.facts.source", _text[f.SourceKey]), "mf-inv-parallel__source"));
                    if (f.NeedsBadge) parallel.Add(DebriefPanels.CheckingBadge(_text));
                }
                _right.Add(parallel);
            }

            LessonCard lesson = LessonsLearned.For(s.RootCauseId);
            var card = new VisualElement { name = "lesson-card" };
            card.AddToClassList("mf-inv-lesson");
            var lh = new VisualElement();
            lh.AddToClassList("mf-inv-lesson__head");
            lh.Add(new MfIcon { kind = "award" });
            lh.Add(L(_text["ui.host.debrief.lesson.title"], "mf-inv-lesson__title"));
            card.Add(lh);
            foreach (LessonEffect e in lesson.Effects)
            {
                string line = e.Kind == LessonEffectKind.BuildFlag
                    ? _text.Format("ui.host.debrief.lesson.risk_cleared", _text["ui.host.debrief.failure_mode." + s.RootCauseId])
                    : _text.Format("ui.host.debrief.lesson.free_test", _text["test." + e.Value + ".name"]);
                var row = new VisualElement();
                row.AddToClassList("mf-inv-lesson__row");
                row.Add(new MfIcon { kind = e.Kind == LessonEffectKind.BuildFlag ? "shield-check" : "wrench" });
                row.Add(L(line, "mf-inv-lesson__text"));
                card.Add(row);
            }
            _right.Add(card);

            if (_actions.Q<Button>("btn-inv-retry") == null)
            {
                _actions.Q<Button>("btn-inv-lock")?.AddToClassList("mf-end-hidden");
                _actions.Add(Btn("btn-inv-codex", _text["ui.host.debrief.investigation.open_codex"], "book-open", "mf-btn--secondary", _openCodex));
                Button retry = Btn("btn-inv-retry", _text["ui.host.debrief.btn.retry"], "wrench", "mf-btn--primary", _retry);
                _actions.Add(retry);
                retry.Focus();
            }
        }

        private static ScrollView Scrolled(VisualElement content)
        {
            var scroll = new ScrollView(ScrollViewMode.Vertical) { horizontalScrollerVisibility = ScrollerVisibility.Hidden, verticalScrollerVisibility = ScrollerVisibility.Hidden };
            scroll.AddToClassList("mf-inv__scroll");
            scroll.Add(content);
            MfScrollFade.Attach(scroll);
            return scroll;
        }

        private static AvatarBadge Avatar(DebriefPlayer p, string cls)
        {
            var b = new AvatarBadge();
            b.AddToClassList(cls);
            b.SetIdentity(p.AvatarId, p.Nickname);
            Label initial = b.Q<Label>();
            if (initial != null)
            {
                initial.AddToClassList("mf-inv-avatar__initial");
                initial.style.marginTop = 1;
            }
            return b;
        }

        private VisualElement Column(string cls, string title)
        {
            var col = new VisualElement();
            col.AddToClassList(cls);
            col.Add(L(title, "mf-h3"));
            return col;
        }

        public static string ChannelIcon(string channel)
        {
            switch (channel)
            {
                case "pressure": return "gauge";
                case "temperature": return "thermometer";
                case "vibration": return "wind";
                case "software_log":
                case "log": return "list-checks";
                case "thrust": return "flame";
                case "attitude": return "crosshair";
                case "power": return "zap";
                case "load": return "weight";
                case "comms": return "radio";
                case "sensor": return "scan-line";
                case "timing": return "timer";
                default: return "circle";
            }
        }

        private static Label L(string text, string classes)
        {
            var l = new Label(text);
            foreach (string c in classes.Split(' ')) l.AddToClassList(c);
            return l;
        }

        private static Button Btn(string name, string text, string icon, string variant, Action click)
        {
            var b = new Button(click) { name = name, text = text };
            b.AddToClassList("mf-btn");
            b.AddToClassList("mf-btn--l");
            b.AddToClassList(variant);
            MfButtons.WithIcon(b, icon);
            return b;
        }
    }
}
