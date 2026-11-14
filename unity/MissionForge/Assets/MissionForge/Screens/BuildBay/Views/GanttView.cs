using System.Collections.Generic;
using MissionForge.Core.Build;
using MissionForge.UI;
using UnityEngine;
using UnityEngine.UIElements;

namespace MissionForge.Screens.BuildBay
{
    /// <summary>
    /// Integration Timeline Gantt (design 6.1, 6.4) drawn with Painter2D. Critical-path bars carry a diagonal hatch
    /// and a heavy outline (pattern, not colour alone); slack is a bracket between launch-ready and the deadline;
    /// the deadline is a dashed vertical line. Labels are child Labels so they use the theme fonts.
    /// </summary>
    [UxmlElement]
    public partial class GanttView : VisualElement
    {
        private const float LaneGap = 6f;
        private const float AxisHeight = 22f;
        private const float LaneLabelWidth = 150f;

        private GanttModel _model;
        private readonly VisualElement _labels = new VisualElement { pickingMode = PickingMode.Ignore };
        private string _deadlineText = "", _slackText = "", _criticalText = "";
        private bool _rtl;

        public GanttView()
        {
            pickingMode = PickingMode.Ignore;
            _labels.style.position = Position.Absolute;
            _labels.style.left = 0; _labels.style.right = 0; _labels.style.top = 0; _labels.style.bottom = 0;
            Add(_labels);
            generateVisualContent += Draw;
            RegisterCallback<GeometryChangedEvent>(_ => Relabel());
        }

        public void SetModel(GanttModel model, string deadlineText, string slackText, string criticalText, bool rtl)
        {
            _model = model;
            _deadlineText = deadlineText ?? "";
            _slackText = slackText ?? "";
            _criticalText = criticalText ?? "";
            _rtl = rtl;
            Relabel();
            MarkDirtyRepaint();
        }

        private float LaneHeight => Mathf.Max(8f, (contentRect.height - AxisHeight - LaneGap) / 2f);

        private float XFor(double day)
        {
            float x = _model.X(day);
            if (_rtl) return (1f - x) * (contentRect.width - LaneLabelWidth);
            return LaneLabelWidth + x * (contentRect.width - LaneLabelWidth);
        }

        private void Draw(MeshGenerationContext ctx)
        {
            if (_model == null || contentRect.width < 10f) return;
            Painter2D p = ctx.painter2D;
            float laneH = LaneHeight;

            // Lane backgrounds.
            for (int lane = 0; lane < 2; lane++)
            {
                float y = lane * (laneH + LaneGap);
                Fill(p, new Rect(_rtl ? 0 : LaneLabelWidth, y, contentRect.width - LaneLabelWidth, laneH), new Color(MfPalette.Space.r, MfPalette.Space.g, MfPalette.Space.b, 0.65f));
            }

            // Bars: procurement bars overlap from day 0, so they are drawn longest first, thinner as they get shorter.
            var procure = new List<GanttBar>();
            foreach (GanttBar b in _model.Bars) if (b.Lane == TimelineViewModel.ProcureLane) procure.Add(b);
            procure.Sort((a, b) => (b.EndDay - b.StartDay).CompareTo(a.EndDay - a.StartDay));
            for (int i = 0; i < procure.Count; i++)
            {
                float inset = Mathf.Min(laneH * 0.35f, i * 1.6f);
                DrawBar(p, procure[i], 0f + inset, laneH - 2 * inset);
            }
            foreach (GanttBar b in _model.Bars)
            {
                if (b.Lane != TimelineViewModel.SerialLane) continue;
                DrawBar(p, b, laneH + LaneGap, laneH);
            }

            // Axis ticks every 30 days.
            float axisY = 2 * laneH + LaneGap + 2f;
            p.strokeColor = new Color(MfPalette.Text.r, MfPalette.Text.g, MfPalette.Text.b, 0.35f);
            p.lineWidth = 1.5f;
            for (double d = 0; d <= _model.AxisDays + 0.1; d += TimelineViewModel.TickDays)
            {
                float x = XFor(d);
                Line(p, new Vector2(x, axisY), new Vector2(x, axisY + 6f));
            }

            // Slack bracket between launch-ready and the deadline.
            if (_model.TotalDays > 0)
            {
                float x0 = XFor(_model.TotalDays), x1 = XFor(_model.DeadlineDays);
                Color slack = _model.SlackDays >= 0 ? MfPalette.Meets : MfPalette.Fails;
                p.strokeColor = slack;
                p.lineWidth = 3f;
                float y = laneH + LaneGap + laneH * 0.5f;
                Line(p, new Vector2(x0, y), new Vector2(x1, y));
                Line(p, new Vector2(x0, y - 7), new Vector2(x0, y + 7));
                Line(p, new Vector2(x1, y - 7), new Vector2(x1, y + 7));
            }

            // Deadline: dashed line (pattern) across both lanes.
            float xd = XFor(_model.DeadlineDays);
            p.strokeColor = MfPalette.Sunlight;
            p.lineWidth = 3f;
            for (float y = -2f; y < axisY; y += 10f) Line(p, new Vector2(xd, y), new Vector2(xd, Mathf.Min(y + 6f, axisY)));
        }

        private void DrawBar(Painter2D p, GanttBar b, float y, float h)
        {
            float x0 = XFor(b.StartDay), x1 = XFor(b.EndDay);
            if (x1 < x0) (x0, x1) = (x1, x0);
            var r = new Rect(x0, y, Mathf.Max(2f, x1 - x0), h);
            Color fill = b.Critical ? MfPalette.Signal : MfPalette.Ocean;
            if (b.Kind == StepKind.Test) fill = MfPalette.Sunlight;
            Fill(p, r, new Color(fill.r, fill.g, fill.b, b.Critical ? 0.85f : 0.55f));
            if (!b.Critical) return;
            // Hatch: diagonal stripes in Space over the critical bar, then a heavy outline.
            p.strokeColor = new Color(MfPalette.Space.r, MfPalette.Space.g, MfPalette.Space.b, 0.75f);
            p.lineWidth = 2f;
            for (float s = r.xMin - r.height; s < r.xMax; s += 9f)
            {
                Vector2 a = new Vector2(Mathf.Max(s, r.xMin), r.yMax - Mathf.Max(0, r.xMin - s));
                Vector2 c = new Vector2(Mathf.Min(s + r.height, r.xMax), r.yMin + Mathf.Max(0, s + r.height - r.xMax));
                Line(p, a, c);
            }
            p.strokeColor = MfPalette.Text;
            p.lineWidth = 2f;
            p.BeginPath();
            p.MoveTo(new Vector2(r.xMin, r.yMin));
            p.LineTo(new Vector2(r.xMax, r.yMin));
            p.LineTo(new Vector2(r.xMax, r.yMax));
            p.LineTo(new Vector2(r.xMin, r.yMax));
            p.ClosePath();
            p.Stroke();
        }

        private void Relabel()
        {
            _labels.Clear();
            if (_model == null || contentRect.width < 10f) return;
            float laneH = LaneHeight;
            float axisY = 2 * laneH + LaneGap + 6f;
            for (int lane = 0; lane < _model.LaneNames.Count && lane < 2; lane++)
            {
                AddLabel(_model.LaneNames[lane], _rtl ? contentRect.width - LaneLabelWidth + 6f : 4f, lane * (laneH + LaneGap) + laneH * 0.5f - 11f, "bb-gantt__lane");
            }
            // Longest procurement item and every serial step wider than 70 px get a name.
            GanttBar longest = default;
            bool any = false;
            foreach (GanttBar b in _model.Bars)
            {
                if (b.Lane == TimelineViewModel.ProcureLane && (!any || b.EndDay > longest.EndDay)) { longest = b; any = true; }
                if (b.Lane == TimelineViewModel.SerialLane && XFor(b.EndDay) - XFor(b.StartDay) > 70f)
                    AddLabel(b.Label, Mathf.Min(XFor(b.StartDay), XFor(b.EndDay)) + 4f, laneH + LaneGap + 2f, "bb-gantt__bar-label");
            }
            if (any) AddLabel(longest.Label, Mathf.Min(XFor(longest.StartDay), XFor(longest.EndDay)) + 8f, laneH * 0.5f - 11f, "bb-gantt__bar-label");
        }

        private void AddLabel(string text, float x, float y, string cls)
        {
            if (string.IsNullOrEmpty(text)) return;
            var l = new Label(text) { pickingMode = PickingMode.Ignore };
            l.AddToClassList("bb-gantt__label");
            l.AddToClassList(cls);
            l.style.left = x;
            l.style.top = y;
            _labels.Add(l);
        }

        private static void Fill(Painter2D p, Rect r, Color c)
        {
            p.fillColor = c;
            p.BeginPath();
            p.MoveTo(new Vector2(r.xMin, r.yMin));
            p.LineTo(new Vector2(r.xMax, r.yMin));
            p.LineTo(new Vector2(r.xMax, r.yMax));
            p.LineTo(new Vector2(r.xMin, r.yMax));
            p.ClosePath();
            p.Fill();
        }

        private static void Line(Painter2D p, Vector2 a, Vector2 b)
        {
            p.BeginPath();
            p.MoveTo(a);
            p.LineTo(b);
            p.Stroke();
        }
    }

    /// <summary>
    /// Budget bar: spent (solid Ceramic), the leading option's extra cost (Signal with hatch), remaining (outline),
    /// and an over-budget overflow in Fails with a heavy border. Values in $M from Core's BudgetSchedule.
    /// </summary>
    [UxmlElement]
    public partial class BudgetBarView : VisualElement
    {
        private double _budget, _spent, _preview;

        public BudgetBarView()
        {
            pickingMode = PickingMode.Ignore;
            generateVisualContent += Draw;
        }

        public void SetValues(double budgetM, double spentM, double previewDeltaM)
        {
            _budget = budgetM;
            _spent = spentM;
            _preview = previewDeltaM;
            MarkDirtyRepaint();
        }

        private void Draw(MeshGenerationContext ctx)
        {
            Rect r = contentRect;
            if (r.width < 4f || _budget <= 0) return;
            Painter2D p = ctx.painter2D;
            double scale = System.Math.Max(_budget, _spent + System.Math.Max(0, _preview)) * 1.02;
            float W(double m) => (float)(m / scale) * r.width;

            Rect(p, new Rect(0, 0, W(_budget), r.height), new Color(MfPalette.Space.r, MfPalette.Space.g, MfPalette.Space.b, 0.9f), true);
            float spentW = W(System.Math.Min(_spent, _budget));
            Rect(p, new Rect(0, 0, spentW, r.height), MfPalette.Text, true);
            if (_spent > _budget) Rect(p, new Rect(W(_budget), 0, W(_spent - _budget), r.height), MfPalette.Fails, true);
            if (System.Math.Abs(_preview) > 1e-6)
            {
                float x0 = W(_spent), w = W(System.Math.Abs(_preview));
                if (_preview < 0) x0 -= w;
                var pr = new Rect(x0, 0, w, r.height);
                Rect(p, pr, MfPalette.Signal, true);
                p.strokeColor = MfPalette.Space;
                p.lineWidth = 2f;
                for (float s = pr.xMin - pr.height; s < pr.xMax; s += 8f)
                {
                    p.BeginPath();
                    p.MoveTo(new Vector2(Mathf.Max(s, pr.xMin), pr.yMax - Mathf.Max(0, pr.xMin - s)));
                    p.LineTo(new Vector2(Mathf.Min(s + pr.height, pr.xMax), pr.yMin + Mathf.Max(0, s + pr.height - pr.xMax)));
                    p.Stroke();
                }
            }
            // Budget limit marker.
            p.strokeColor = MfPalette.Sunlight;
            p.lineWidth = 3f;
            p.BeginPath();
            p.MoveTo(new Vector2(W(_budget), -3));
            p.LineTo(new Vector2(W(_budget), r.height + 3));
            p.Stroke();
            p.strokeColor = new Color(MfPalette.Text.r, MfPalette.Text.g, MfPalette.Text.b, 0.4f);
            p.lineWidth = 1f;
            p.BeginPath();
            p.MoveTo(new Vector2(0, 0)); p.LineTo(new Vector2(W(_budget), 0)); p.LineTo(new Vector2(W(_budget), r.height)); p.LineTo(new Vector2(0, r.height)); p.ClosePath();
            p.Stroke();
        }

        private static void Rect(Painter2D p, Rect r, Color c, bool fill)
        {
            p.fillColor = c;
            p.BeginPath();
            p.MoveTo(new Vector2(r.xMin, r.yMin));
            p.LineTo(new Vector2(r.xMax, r.yMin));
            p.LineTo(new Vector2(r.xMax, r.yMax));
            p.LineTo(new Vector2(r.xMin, r.yMax));
            p.ClosePath();
            if (fill) p.Fill();
        }
    }
}
