using System;
using System.Collections.Generic;
using MissionForge.EndScreens.Sources;
using MissionForge.UI;
using UnityEngine;
using UnityEngine.UIElements;

namespace MissionForge.Screens.Debrief
{
    /// <summary>
    /// Binds a <see cref="DebriefView"/> to the Debrief UXML: hero, the 11.3 formula with each term counting up in turn
    /// (reduced motion: values appear at once), objectives, recovery chips, failure card, timeline strip, awards and facts.
    /// Pure presentation: every number arrives computed.
    /// </summary>
    public sealed class DebriefPanels
    {
        public const string ContinueButton = "btn-continue";
        public const string CodexButton = "btn-codex";
        public const string SettingsButton = "btn-settings";
        public const string ReplayButton = "btn-replay";
        public const string InvestigateButton = "btn-investigate";
        public const string RetryButton = "btn-retry";

        /// <summary>Delay between two formula terms starting their count-up, ms (game_value presentation timing).</summary>
        public const int TermStaggerMs = 220;
        /// <summary>Count-up length of one term, ms.</summary>
        public const int TermCountMs = 700;

        private readonly VisualElement _root;
        private readonly List<IVisualElementScheduledItem> _running = new List<IVisualElementScheduledItem>();
        private readonly TimelineStrip _timeline;

        public DebriefPanels(VisualElement root)
        {
            _root = root;
            VisualElement track = root.Q("timeline-track");
            _timeline = new TimelineStrip();
            track?.Add(_timeline);
        }

        public void Bind(DebriefView view, EndText text, IReadOnlyList<string> fixtureIds, Action<string> pickFixture)
        {
            foreach (IVisualElementScheduledItem item in _running) item?.Pause();
            _running.Clear();

            BindRehearsal(view, text, fixtureIds, pickFixture);
            BindHero(view, text);
            BindBreakdown(view, text);
            BindObjectives(view, text);
            BindTimeline(view, text);
            BindAwards(view, text);
            BindFacts(view, text);
        }

        public void SetButton(string name, string label, bool visible, string icon)
        {
            Button b = _root.Q<Button>(name);
            if (b == null) return;
            b.text = label;
            MfButtons.WithIcon(b, icon);
            b.EnableInClassList("mf-end-hidden", !visible);
            b.focusable = visible;
        }

        private void BindRehearsal(DebriefView view, EndText text, IReadOnlyList<string> fixtureIds, Action<string> pickFixture)
        {
            // T063: fixture data always carries the REHEARSAL label (release builds too); the picker stays a dev tool.
            bool show = view.IsRehearsal && (Application.isEditor || Debug.isDebugBuild);
            _root.Q("rehearsal-tag")?.EnableInClassList("mf-end-rehearsal--hidden", !view.IsRehearsal);
            SetText("rehearsal-text", text["ui.host.debrief.rehearsal"]);

            VisualElement picker = _root.Q("fixture-picker");
            picker?.EnableInClassList("mf-end-hidden", !show);
            MfSegmented seg = _root.Q<MfSegmented>("fixture-seg");
            if (seg == null) return;
            var options = new List<(string, string)>();
            foreach (string id in fixtureIds) options.Add((id, text["ui.host.debrief.fixture." + id]));
            seg.SetOptions("fixture", options.ToArray());
            seg.Select(view.FixtureId);
            seg.Clicked -= OnFixture;
            _pick = pickFixture;
            seg.Clicked += OnFixture;
        }

        private Action<string> _pick;

        private void OnFixture(string id) => _pick?.Invoke(id);

        private void BindHero(DebriefView view, EndText text)
        {
            SetText("grade-letter", view.Grade);
            SetText("grade-caption", text["ui.host.debrief.grade"]);
            SetText("grade-title", text[view.GradeTitleKey]);
            SetText("contract-name", text[view.ContractNameKey] + " · " + text["assist_level." + view.AssistLevelId + ".name"]);

            VisualElement plate = _root.Q("grade-plate");
            bool gold = view.Grade == "S" || view.Grade == "A";
            plate?.EnableInClassList("mf-debrief__grade-plate--gold", gold);
            plate?.EnableInClassList("mf-debrief__grade-plate--fails", view.Outcome == "Failure");
            if (plate != null)
            {
                plate.Q<MfIcon>("grade-crown")?.RemoveFromHierarchy();
                if (gold)
                {
                    var crown = new MfIcon { name = "grade-crown", kind = "crown" };
                    crown.AddToClassList("mf-icon--32");
                    crown.style.color = new StyleColor(MfPalette.Sunlight);
                    crown.style.position = Position.Absolute;
                    crown.style.top = -18;
                    plate.Add(crown);
                }
                MfMotion.Celebrate(plate);
            }

            VisualElement chip = _root.Q("outcome-chip");
            MfIcon icon = _root.Q<MfIcon>("outcome-icon");
            string status = view.Outcome == "Success" ? "good" : view.Outcome == "Partial" ? "warn" : "bad";
            chip?.EnableInClassList("mf-chip--good", status == "good");
            chip?.EnableInClassList("mf-chip--warn", status == "warn");
            chip?.EnableInClassList("mf-chip--bad", status == "bad");
            if (icon != null) icon.kind = status == "good" ? "meets" : status == "warn" ? "marginal" : "fails";
            SetText("outcome-text", text["ui.host.debrief.outcome." + view.Outcome]);
        }

        private void BindBreakdown(DebriefView view, EndText text)
        {
            SetText("total-caption", text["ui.host.debrief.score.total"]);
            SetText("total-unit", text["ui.host.debrief.unit.points"]);
            SetText("breakdown-title", text["ui.host.debrief.score.title"]);
            SetText("breakdown-note", text["ui.host.debrief.score.formula"]);
            SetText("kp-value", text.Format("ui.host.debrief.kp.chip", view.KpEarned));

            VisualElement list = _root.Q("breakdown");
            if (list == null) return;
            list.Clear();
            string pts = text["ui.host.debrief.unit.points"];
            int index = 0;
            foreach (ScoreTermView term in view.Terms)
            {
                Label value = AddTerm(list, index == 0 ? "" : "+", text[term.NameKey], pts, term.Points <= 0.0 ? "mf-debrief-term--zero" : null);
                CountTo(value, term.Points, index);
                index++;
            }
            Label sub = AddTerm(list, "=", text["ui.host.debrief.score.subtotal"], pts, "mf-debrief-term--sub");
            CountTo(sub, view.Subtotal, index++);
            Label diff = AddTerm(list, "×", text.Format("ui.host.debrief.score.difficulty", text["assist_level." + view.AssistLevelId + ".name"]), "", "mf-debrief-term--mult");
            diff.text = EndText.Multiplier(view.DifficultyMult);
            Label boost = AddTerm(list, "×", text["ui.host.debrief.score.boosts"], "", "mf-debrief-term--mult");
            boost.text = EndText.Multiplier(view.BoostMult);

            Label total = _root.Q<Label>("total-value");
            if (total != null) CountTo(total, view.Total, index + 1);
        }

        private void CountTo(Label label, double value, int order)
        {
            label.text = EndText.Points(0);
            if (MfMotion.Reduced)
            {
                label.text = EndText.Points(value);
                return;
            }
            IVisualElementScheduledItem start = label.schedule.Execute(() =>
            {
                IVisualElementScheduledItem run = MfMotion.CountUp(label, 0, value, EndText.Points, TermCountMs);
                if (run != null) _running.Add(run);
            }).StartingIn(order * TermStaggerMs);
            _running.Add(start);
        }

        private static Label AddTerm(VisualElement list, string op, string name, string unit, string modifier)
        {
            var row = new VisualElement();
            row.AddToClassList("mf-debrief-term");
            if (modifier != null) row.AddToClassList(modifier);
            var opLabel = new Label(op);
            opLabel.AddToClassList("mf-debrief-term__op");
            var nameLabel = new Label(name);
            nameLabel.AddToClassList("mf-debrief-term__name");
            var value = new Label();
            value.AddToClassList("mf-debrief-term__value");
            row.Add(opLabel);
            row.Add(nameLabel);
            row.Add(value);
            if (!string.IsNullOrEmpty(unit))
            {
                var unitLabel = new Label(unit);
                unitLabel.AddToClassList("mf-unit");
                unitLabel.AddToClassList("mf-debrief-term__unit");
                row.Add(unitLabel);
            }
            list.Add(row);
            return value;
        }

        private void BindObjectives(DebriefView view, EndText text)
        {
            SetText("objectives-title", text["ui.host.debrief.objectives.title"]);
            VisualElement list = _root.Q("objectives");
            if (list != null)
            {
                list.Clear();
                string pts = text["ui.host.debrief.unit.points"];
                int i = 0;
                foreach (ObjectiveView o in view.Objectives)
                {
                    var row = new VisualElement();
                    row.AddToClassList("mf-debrief-objective");
                    row.AddToClassList(o.Met ? "mf-debrief-objective--met" : "mf-debrief-objective--missed");
                    var badge = new MfStatusBadge();
                    badge.Set(o.Met ? MfStatus.Meets : MfStatus.Fails, text[o.Met ? "ui.host.debrief.objectives.met" : "ui.host.debrief.objectives.not_met"]);
                    var head = new VisualElement();
                    head.AddToClassList("mf-debrief-objective__head");
                    var kind = new Label(text["ui.host.debrief.objectives.kind." + o.Kind]);
                    kind.AddToClassList("mf-debrief-objective__kind");
                    var points = new Label(MfText.WithUnit("+" + EndText.Points(o.Points), pts)) { enableRichText = true };
                    points.AddToClassList("mf-debrief-objective__points");
                    head.Add(badge);
                    head.Add(kind);
                    head.Add(points);
                    var name = new Label(string.IsNullOrEmpty(o.TextKey) ? o.Id : text[o.TextKey]);
                    name.AddToClassList("mf-debrief-objective__name");
                    name.AddToClassList("mf-debrief-objective__text");
                    row.Add(head);
                    row.Add(name);
                    list.Add(row);
                    MfMotion.Enter(row, i++);
                }
            }

            VisualElement recovery = _root.Q("recovery");
            if (recovery != null)
            {
                recovery.Clear();
                if (view.Crewed && view.Outcome != "Failure") recovery.Add(Chip("users", text["ui.host.debrief.recovery.crew"], "mf-chip--good"));
                if (view.CapsuleRecovered) recovery.Add(Chip("shield-check", text["ui.host.debrief.recovery.capsule"], "mf-chip--good"));
                if (view.BoosterRecovered) recovery.Add(Chip("rocket", text["ui.host.debrief.recovery.booster"], "mf-chip--good"));
            }

            VisualElement card = _root.Q("failure-card");
            card?.EnableInClassList("mf-end-hidden", view.Failure == null);
            if (view.Failure != null)
            {
                SetText("failure-title", text["ui.host.debrief.failure.title"]);
                string mode = text["ui.host.debrief.failure_mode." + view.Failure.FailureModeId];
                string phase = string.IsNullOrEmpty(view.Failure.FlightPhaseId) ? "" : text["flight_phase." + view.Failure.FlightPhaseId + ".name"];
                SetText("failure-what", text.Format("ui.host.debrief.failure.at", string.IsNullOrEmpty(phase) ? mode : mode + " · " + phase, EndText.Seconds(view.Failure.AtS)));
                SetText("failure-next", text["ui.host.debrief.failure.next"]);
            }
        }

        public static VisualElement Chip(string icon, string label, string modifier)
        {
            var chip = new VisualElement();
            chip.AddToClassList("mf-chip");
            if (modifier != null) chip.AddToClassList(modifier);
            var i = new MfIcon { kind = icon };
            var l = new Label(label);
            l.AddToClassList("mf-chip__label");
            chip.Add(i);
            chip.Add(l);
            return chip;
        }

        private void BindTimeline(DebriefView view, EndText text)
        {
            SetText("timeline-title", text["ui.host.debrief.timeline.title"] + "  ·  0–" + EndText.Seconds(view.MissionLengthS) + " " + text["ui.host.debrief.unit.seconds"]);
            _timeline.Set(view, text);

            VisualElement legend = _root.Q("timeline-legend");
            if (legend == null) return;
            legend.Clear();
            foreach (TimelineKind kind in new[] { TimelineKind.Phase, TimelineKind.Minigame, TimelineKind.Boost, TimelineKind.GoodCall, TimelineKind.Anomaly, TimelineKind.Failure })
            {
                if (kind == TimelineKind.Failure && view.Failure == null) continue;
                var item = new VisualElement();
                item.AddToClassList("mf-debrief-legend");
                var icon = new MfIcon { kind = TimelineStrip.IconFor(kind) };
                icon.style.color = new StyleColor(TimelineStrip.ColourFor(kind, "gold"));
                var label = new Label(text["ui.host.debrief.timeline.legend." + TimelineStrip.LegendKey(kind)]);
                label.AddToClassList("mf-label");
                item.Add(icon);
                item.Add(label);
                legend.Add(item);
            }
        }

        private void BindAwards(DebriefView view, EndText text)
        {
            SetText("awards-title", text["ui.host.debrief.awards.title"]);
            SetText("awards-subtitle", text["ui.host.debrief.awards.subtitle"]);
            VisualElement list = _root.Q("awards");
            if (list == null) return;
            list.Clear();
            list.EnableInClassList("mf-debrief__awards--wide", view.Awards.Count <= 4);
            int i = 0;
            foreach (PlayerAwardsView pa in view.Awards)
            {
                var card = new VisualElement();
                card.AddToClassList("mf-debrief-award");
                var avatar = new AvatarBadge();
                avatar.AddToClassList("mf-debrief-award__avatar");
                avatar.SetIdentity(pa.Player.AvatarId, pa.Player.Nickname);
                var body = new VisualElement();
                body.AddToClassList("mf-debrief-award__text");
                var name = new Label(MfText.Escape(pa.Player.Nickname));
                name.AddToClassList("mf-debrief-award__name");
                body.Add(name);
                foreach (string award in pa.AwardIds)
                {
                    var badge = new VisualElement();
                    badge.AddToClassList("mf-debrief-award__badge");
                    badge.Add(new MfIcon { kind = "award" });
                    var a = new Label(text["award." + award + ".name"]);
                    a.AddToClassList("mf-debrief-award__award");
                    badge.Add(a);
                    body.Add(badge);
                }
                card.Add(avatar);
                card.Add(body);
                list.Add(card);
                MfMotion.Enter(card, i++);
            }
        }

        private void BindFacts(DebriefView view, EndText text)
        {
            SetText("facts-title", text["ui.host.debrief.facts.title"]);
            VisualElement list = _root.Q("facts");
            if (list == null) return;
            list.Clear();
            if (view.Facts.Count == 0)
            {
                var empty = new Label(text["ui.host.debrief.facts.empty"]);
                empty.AddToClassList("mf-label");
                list.Add(empty);
                return;
            }
            foreach (FactView f in view.Facts) list.Add(FactCard(f, text));
        }

        /// <summary>A fact with its topic, text, citation and (while unverified) the "source being checked" badge.</summary>
        public static VisualElement FactCard(FactView f, EndText text)
        {
            var card = new VisualElement();
            card.AddToClassList("mf-debrief-fact");
            var topic = new Label(text[f.TopicKey]);
            topic.AddToClassList("mf-debrief-fact__topic");
            var body = new Label(text[f.TextKey]);
            body.AddToClassList("mf-debrief-fact__text");
            var source = new Label(text.Format("ui.host.debrief.facts.source", text[f.SourceKey]));
            source.AddToClassList("mf-debrief-fact__source");
            card.Add(topic);
            card.Add(body);
            card.Add(source);
            if (f.NeedsBadge) card.Add(CheckingBadge(text));
            return card;
        }

        public static VisualElement CheckingBadge(EndText text)
        {
            var badge = new VisualElement { name = "fact-checking" };
            badge.AddToClassList("mf-end-checking");
            badge.Add(new MfIcon { kind = "hourglass" });
            badge.Add(new Label(text["ui.host.debrief.facts.checking"]));
            return badge;
        }

        private void SetText(string name, string value)
        {
            Label l = _root.Q<Label>(name);
            if (l != null) l.text = value;
        }
    }
}
