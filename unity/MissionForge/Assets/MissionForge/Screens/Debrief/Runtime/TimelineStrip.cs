using System.Collections.Generic;
using MissionForge.EndScreens.Sources;
using MissionForge.UI;
using UnityEngine;
using UnityEngine.UIElements;

namespace MissionForge.Screens.Debrief
{
    /// <summary>
    /// Mission timeline strip of the debrief: phase ticks with names along the top lane, then minigame tiers, boosts, Good
    /// Calls, anomalies and the failure point as icons on the event lane, positioned by mission elapsed time. Every mark
    /// combines an icon shape, a colour and (for tiers and the failure) a word, never colour alone.
    /// </summary>
    public sealed class TimelineStrip : VisualElement
    {
        /// <summary>Approximate advance of one character of a 24 px label, px (used to keep labels from touching).</summary>
        public const float LabelCharPx = 12.5f;
        /// <summary>Space kept between two labels on one row, px.</summary>
        public const float LabelGapPx = 16f;
        /// <summary>Height of the axis line from the top of the strip at 100 % text, px.</summary>
        public const float AxisPx = 70f;

        private DebriefView _view;
        private EndText _text;
        private float _laidOutWidth = -1f;

        public TimelineStrip()
        {
            AddToClassList("mf-debrief-strip");
            style.position = Position.Absolute;
            style.left = 20;
            style.right = 20;
            style.top = 0;
            style.bottom = 0;
            pickingMode = PickingMode.Ignore;
            RegisterCallback<GeometryChangedEvent>(_ => Relayout());
        }

        public void Set(DebriefView view, EndText text)
        {
            _view = view;
            _text = text;
            _laidOutWidth = -1f;
            Relayout();
        }

        private void Relayout()
        {
            float width = resolvedStyle.width;
            if (_view == null || float.IsNaN(width) || width <= 1f || Mathf.Abs(width - _laidOutWidth) < 0.5f) return;
            _laidOutWidth = width;
            Clear();
            double length = _view.MissionLengthS;
            foreach (TimelineEventView e in _view.Timeline) if (e.TimeS > length) length = e.TimeS;
            if (length <= 0.0) length = 1.0;
            float scale = MfAccessibility.Text200 ? 2f : 1f;

            var axis = new VisualElement();
            axis.style.position = Position.Absolute;
            axis.style.left = 0;
            axis.style.right = 0;
            axis.style.top = AxisPx * scale;
            axis.style.height = 2;
            axis.style.backgroundColor = new StyleColor(MfPalette.WithAlpha(MfPalette.Ceramic, 0.32f));
            Add(axis);

            // Phase names alternate between two rows above the axis; event captions between two rows below it. A label is
            // dropped (its tick or icon stays) when it would touch the previous label of both rows.
            var phaseEnd = new[] { float.MinValue, float.MinValue };
            var eventEnd = new[] { float.MinValue, float.MinValue };
            foreach (TimelineEventView e in _view.Timeline)
            {
                float x = (float)(e.TimeS / length);
                float px = x * width;
                if (e.Kind == TimelineKind.Phase)
                {
                    string name = _text[e.LabelKey];
                    float w = name.Length * LabelCharPx * scale;
                    int row = Fit(phaseEnd, px, px + w, width);
                    AddPhase(x, row >= 0 ? name : null, row, scale);
                    if (row >= 0) phaseEnd[row] = px + w;
                    continue;
                }
                string caption = null;
                if (e.Kind == TimelineKind.Minigame && e.TierId != null) caption = _text["tier." + e.TierId + ".name"];
                if (e.Kind == TimelineKind.Failure) caption = "T+" + EndText.Seconds(e.TimeS) + " " + _text["ui.host.debrief.unit.seconds"];
                int captionRow = -1;
                if (caption != null)
                {
                    float w = caption.Length * LabelCharPx * scale;
                    captionRow = Fit(eventEnd, px - w / 2f, px + w / 2f, width);
                    if (captionRow < 0 && e.Kind == TimelineKind.Failure) captionRow = 1;
                    if (captionRow >= 0) eventEnd[captionRow] = px + w / 2f;
                    else caption = null;
                }
                AddEvent(x, e.Kind, e.TierId, caption, captionRow, scale);
            }
        }

        /// <summary>The first row (0 or 1) where a label spanning <paramref name="from"/>..<paramref name="to"/> px fits, or -1.</summary>
        private static int Fit(float[] rowEnds, float from, float to, float width)
        {
            if (to > width + 40f) return -1;
            for (int row = 0; row < rowEnds.Length; row++)
            {
                if (from >= rowEnds[row] + LabelGapPx) return row;
            }
            return -1;
        }

        private void AddPhase(float x, string label, int row, float scale)
        {
            var tick = new VisualElement();
            tick.style.position = Position.Absolute;
            tick.style.left = new Length(x * 100f, LengthUnit.Percent);
            float tickTop = (row == 1 ? 36f : 6f) * scale;
            tick.style.top = tickTop;
            tick.style.height = AxisPx * scale - tickTop;
            tick.style.width = 2;
            tick.style.backgroundColor = new StyleColor(MfPalette.WithAlpha(MfPalette.Ceramic, 0.56f));
            Add(tick);
            if (string.IsNullOrEmpty(label)) return;
            var l = new Label(label);
            l.AddToClassList("mf-label");
            l.style.position = Position.Absolute;
            l.style.left = new Length(x * 100f, LengthUnit.Percent);
            l.style.top = (row == 1 ? 30f : 0f) * scale;
            l.style.marginLeft = 2;
            l.style.paddingLeft = 4;
            l.style.paddingRight = 4;
            l.style.backgroundColor = new StyleColor(MfPalette.Console);
            l.style.whiteSpace = WhiteSpace.NoWrap;
            Add(l);
        }

        private void AddEvent(float x, TimelineKind kind, string tier, string caption, int row, float scale)
        {
            var icon = new MfIcon { kind = IconFor(kind) };
            icon.AddToClassList("mf-icon--32");
            icon.style.position = Position.Absolute;
            icon.style.left = new Length(x * 100f, LengthUnit.Percent);
            icon.style.top = AxisPx * scale;
            icon.style.translate = new Translate(new Length(-50, LengthUnit.Percent), new Length(-50, LengthUnit.Percent));
            icon.style.color = new StyleColor(ColourFor(kind, tier));
            icon.style.backgroundColor = new StyleColor(MfPalette.Space);
            icon.style.borderTopLeftRadius = 16;
            icon.style.borderTopRightRadius = 16;
            icon.style.borderBottomLeftRadius = 16;
            icon.style.borderBottomRightRadius = 16;
            Add(icon);
            if (caption == null) return;
            var l = new Label(caption);
            l.AddToClassList("mf-label");
            l.style.position = Position.Absolute;
            l.style.left = new Length(x * 100f, LengthUnit.Percent);
            l.style.translate = new Translate(new Length(-50, LengthUnit.Percent), 0);
            l.style.top = (row <= 0 ? 90f : 114f) * scale;
            l.style.whiteSpace = WhiteSpace.NoWrap;
            l.style.color = new StyleColor(kind == TimelineKind.Failure ? MfPalette.Fails : MfPalette.Ceramic);
            Add(l);
        }

        public static string IconFor(TimelineKind kind)
        {
            switch (kind)
            {
                case TimelineKind.Phase: return "flag";
                case TimelineKind.Minigame: return "star";
                case TimelineKind.Boost: return "zap";
                case TimelineKind.GoodCall: return "check-circle-2";
                case TimelineKind.Anomaly: return "triangle-alert";
                case TimelineKind.Failure: return "x-octagon";
                default: return "circle";
            }
        }

        public static Color ColourFor(TimelineKind kind, string tier)
        {
            switch (kind)
            {
                case TimelineKind.Minigame: return tier == "gold" || tier == "platinum" ? MfPalette.Sunlight : MfPalette.Ceramic;
                case TimelineKind.Boost: return MfPalette.Signal;
                case TimelineKind.GoodCall: return MfPalette.Meets;
                case TimelineKind.Anomaly: return MfPalette.Marginal;
                case TimelineKind.Failure: return MfPalette.Fails;
                default: return MfPalette.Ceramic;
            }
        }

        public static string LegendKey(TimelineKind kind)
        {
            switch (kind)
            {
                case TimelineKind.GoodCall: return "good_call";
                default: return kind.ToString().ToLowerInvariant();
            }
        }

        /// <summary>Marks of <paramref name="view"/> of one kind (used by tests and evidence).</summary>
        public static int Count(DebriefView view, TimelineKind kind)
        {
            int n = 0;
            foreach (TimelineEventView e in view.Timeline) if (e.Kind == kind) n++;
            return n;
        }
    }
}
