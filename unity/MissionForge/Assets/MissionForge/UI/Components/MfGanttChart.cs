using System.Collections.Generic;
using UnityEngine;
using UnityEngine.UIElements;

namespace MissionForge.UI
{
    /// <summary>One bar of a Gantt row, in days from the programme start.</summary>
    public readonly struct MfGanttBar
    {
        public MfGanttBar(int row, double startDay, double endDay, bool critical, string label, bool test = false)
        {
            Row = row;
            StartDay = startDay;
            EndDay = endDay;
            Critical = critical;
            Label = label;
            Test = test;
        }

        public int Row { get; }
        public double StartDay { get; }
        public double EndDay { get; }
        public bool Critical { get; }
        public string Label { get; }
        public bool Test { get; }
    }

    /// <summary>
    /// Gantt timeline (VISUAL_TARGET 3.1): 32 px rows with radius 4. Critical path = solid fill, 2 px Sunlight outline and
    /// a chevron pattern; slack = hollow dotted outline from launch-ready to the deadline; the deadline is a labelled
    /// Fails-coloured line; a "now" marker. Row names and bar labels are child Labels so they use the theme fonts.
    /// </summary>
    [UxmlElement]
    public partial class MfGanttChart : VisualElement
    {
        /// <summary>Row geometry in px (tokens.json dataviz.gantt_*, game_value).</summary>
        private const float RowHeight = 32f, RowGap = 8f, BarRadius = 4f, AxisHeight = 40f;
        /// <summary>Base row-name font size (the label token at 100 % text); geometry scales with the resolved size.</summary>
        private const float BaseLabelPx = 24f;
        /// <summary>Text scale (1 at 100 % text, 2 at 200 %): rows, the deadline band and the axis grow with the labels.</summary>
        private float _scale = 1f;
        private float RowH => RowHeight * _scale;
        private float Band => DeadlineBand * _scale;
        private float Axis => AxisHeight * _scale;
        /// <summary>Bars narrower than this carry their label outside, after the bar end (px, game_value).</summary>
        private const float InsideLabelMinWidth = 90f, OutsideLabelMinWidth = 60f;

        private readonly List<MfGanttBar> _bars = new List<MfGanttBar>();
        private readonly List<string> _rows = new List<string>();
        private readonly VisualElement _labels = new VisualElement { pickingMode = PickingMode.Ignore };
        /// <summary>Hidden row-name label kept in the tree so its font is resolved when row names are measured.</summary>
        private readonly Label _probe = new Label { pickingMode = PickingMode.Ignore };
        /// <summary>Hidden bar-label probe: critical-bar chevrons start after the measured label, never under it.</summary>
        private readonly Label _barProbe = new Label { pickingMode = PickingMode.Ignore };
        private readonly Dictionary<int, float> _chevronStart = new Dictionary<int, float>();
        private readonly Label _tickProbe = new Label { pickingMode = PickingMode.Ignore };
        private readonly Label _nowProbe = new Label { pickingMode = PickingMode.Ignore };
        private double _axisDays = 1, _deadline = -1, _launchReady = -1, _now = -1, _tickDays = 30;
        private string _deadlineText = "", _nowText = "", _axisUnit = "";
        /// <summary>Band above the rows for the deadline label (px, game_value); the label never meets bars, slack or "now".</summary>
        private const float DeadlineBand = 30f;
        /// <summary>Gap between the row-name column and the plot; the row names never take more than this share of the width.</summary>
        private const float GutterGap = 12f, MaxGutterShare = 0.45f;
        private float _gutter = 200f;
        private bool _rtl;

        public MfGanttChart()
        {
            AddToClassList("mf-gantt");
            pickingMode = PickingMode.Ignore;
            _labels.AddToClassList("mf-fill");
            Add(_labels);
            _probe.AddToClassList("mf-gantt__row");
            _probe.style.visibility = Visibility.Hidden;
            _probe.style.width = StyleKeyword.Auto;
            Add(_probe);
            _barProbe.AddToClassList("mf-gantt__bar");
            _barProbe.style.visibility = Visibility.Hidden;
            _barProbe.style.position = Position.Absolute;
            Add(_barProbe);
            foreach ((Label probe, string cls) in new[] { (_tickProbe, "mf-gantt__tick"), (_nowProbe, "mf-gantt__now") })
            {
                probe.AddToClassList(cls);
                probe.style.visibility = Visibility.Hidden;
                Add(probe);
            }
            generateVisualContent += Draw;
            RegisterCallback<GeometryChangedEvent>(_ => Relabel());
        }

        /// <summary>
        /// Minimum width of the row-name gutter in px (default 200). The gutter widens to fit the longest row name (up to
        /// 45 % of the chart) so names are never truncated.
        /// </summary>
        public float Gutter { get; set; } = 200f;

        private bool HasDeadlineLabel => _deadline >= 0 && !string.IsNullOrEmpty(_deadlineText);
        private float Top => HasDeadlineLabel ? Band : 0f;

        public void Set(IReadOnlyList<string> rowNames, IReadOnlyList<MfGanttBar> bars, double axisDays, double launchReadyDay,
            double deadlineDay, string deadlineText, double nowDay = -1, string nowText = null, double tickDays = 30, bool rtl = false,
            string axisUnit = null)
        {
            _rows.Clear();
            _rows.AddRange(rowNames);
            _bars.Clear();
            _bars.AddRange(bars);
            _axisDays = System.Math.Max(1, axisDays);
            _launchReady = launchReadyDay;
            _deadline = deadlineDay;
            _deadlineText = deadlineText ?? "";
            _now = nowDay;
            _nowText = nowText ?? "";
            _tickDays = tickDays <= 0 ? 30 : tickDays;
            _rtl = rtl;
            _axisUnit = axisUnit ?? "";
            style.minHeight = Top + _rows.Count * (RowH + RowGap) + Axis;
            Relabel();
            MarkDirtyRepaint();
        }

        private Rect Plot
        {
            get
            {
                Rect r = contentRect;
                float w = Mathf.Max(10f, r.width - _gutter);
                return new Rect(_rtl ? r.xMin : r.xMin + _gutter, r.yMin, w, r.height);
            }
        }

        private float X(double day)
        {
            Rect p = Plot;
            float f = Mathf.Clamp01((float)(day / _axisDays));
            return _rtl ? p.xMax - f * p.width : p.xMin + f * p.width;
        }

        private float RowY(int row) => Top + row * (RowH + RowGap);

        private void Draw(MeshGenerationContext ctx)
        {
            Rect r = contentRect;
            if (r.width < 40f || _rows.Count == 0) return;
            Painter2D p = ctx.painter2D;
            Rect plot = Plot;
            float bottom = RowY(_rows.Count) - RowGap;

            for (int row = 0; row < _rows.Count; row++)
            {
                MfDraw.FillRoundedRect(p, new Rect(plot.xMin, RowY(row), plot.width, RowH), BarRadius, MfPalette.WithAlpha(MfPalette.Ceramic, 0.06f));
            }

            for (int i = 0; i < _bars.Count; i++)
            {
                MfGanttBar b = _bars[i];
                if (b.Row < 0 || b.Row >= _rows.Count) continue;
                float x0 = X(b.StartDay), x1 = X(b.EndDay);
                var bar = new Rect(Mathf.Min(x0, x1), RowY(b.Row) + 3f, Mathf.Max(4f, Mathf.Abs(x1 - x0)), RowH - 6f);
                if (b.Critical)
                {
                    MfDraw.FillRoundedRect(p, bar, BarRadius, b.Test ? MfPalette.Sunlight : MfPalette.Signal);
                    Chevrons(p, bar, _chevronStart.TryGetValue(i, out float from) ? from : float.NaN);
                    MfDraw.StrokeRoundedRect(p, bar, BarRadius, MfPalette.Sunlight, 2f);
                }
                else
                {
                    MfDraw.FillRoundedRect(p, bar, BarRadius, MfPalette.WithAlpha(b.Test ? MfPalette.Sunlight : MfPalette.Ocean, 0.85f));
                }
            }

            // Slack: hollow dotted outline between launch-ready and the deadline, on the last row.
            if (_launchReady >= 0 && _deadline > _launchReady)
            {
                float a = X(_launchReady), b = X(_deadline);
                var slack = new Rect(Mathf.Min(a, b), RowY(_rows.Count - 1) + 5f, Mathf.Abs(b - a), RowH - 10f);
                DottedRect(p, slack, MfPalette.Meets);
            }

            // Axis ticks.
            for (double d = 0; d <= _axisDays + 0.01; d += _tickDays)
            {
                float x = X(d);
                MfDraw.Line(p, new Vector2(x, bottom + 4f), new Vector2(x, bottom + 10f), MfPalette.WithAlpha(MfPalette.Ceramic, 0.35f), 1.5f);
            }

            if (_now >= 0)
            {
                float x = X(_now);
                // Line through the rows, capped by a triangle pointing at the axis where its "Today" label sits.
                MfDraw.Line(p, new Vector2(x, Top - 4f), new Vector2(x, bottom + 4f), MfPalette.Ceramic, 2f);
                MfDraw.Triangle(p, new Vector2(x, bottom + 3f), 7f, -1f, MfPalette.Ceramic);
            }

            if (_deadline >= 0)
            {
                // The deadline line rises into the label band so its label (drawn above the rows) stays attached.
                float x = X(_deadline);
                MfDraw.Line(p, new Vector2(x, HasDeadlineLabel ? 2f : -6f), new Vector2(x, bottom + 12f), MfPalette.Fails, 3f);
            }
        }

        /// <summary>Chevron pattern (») in Space over a critical bar: pattern, not colour alone.</summary>
        private void Chevrons(Painter2D p, Rect bar, float labelEnd)
        {
            Rect inner = MfDraw.Inset(bar, BarRadius + 2f);
            if (!float.IsNaN(labelEnd))
            {
                // Chevrons run only on the side of the label away from its text (left-to-right: after it; RTL: before it).
                if (_rtl) inner.xMax = Mathf.Min(inner.xMax, labelEnd);
                else inner.xMin = Mathf.Max(inner.xMin, labelEnd);
            }
            if (inner.width < 10f) return;
            p.strokeColor = MfPalette.WithAlpha(MfPalette.Space, 0.55f);
            p.lineWidth = 2f;
            p.lineCap = LineCap.Butt;
            float h = inner.height * 0.32f, cy = inner.center.y;
            for (float x = inner.xMin + 4f; x + h < inner.xMax; x += 14f)
            {
                p.BeginPath();
                p.MoveTo(new Vector2(x, cy - h));
                p.LineTo(new Vector2(x + h, cy));
                p.LineTo(new Vector2(x, cy + h));
                p.Stroke();
            }
        }

        private static void DottedRect(Painter2D p, Rect r, Color c)
        {
            p.fillColor = c;
            const float step = 8f, dot = 1.6f;
            for (float x = r.xMin; x <= r.xMax; x += step)
            {
                Dot(p, new Vector2(x, r.yMin), dot);
                Dot(p, new Vector2(x, r.yMax), dot);
            }
            for (float y = r.yMin + step; y < r.yMax; y += step)
            {
                Dot(p, new Vector2(r.xMin, y), dot);
                Dot(p, new Vector2(r.xMax, y), dot);
            }
        }

        private static void Dot(Painter2D p, Vector2 c, float radius)
        {
            p.BeginPath();
            p.Arc(c, radius, 0f, 360f);
            p.Fill();
        }

        private void Relabel()
        {
            _labels.Clear();
            _chevronStart.Clear();
            float px = _probe.resolvedStyle.fontSize;
            float scale = float.IsNaN(px) || px <= 0f ? 1f : Mathf.Max(1f, px / BaseLabelPx);
            if (!Mathf.Approximately(scale, _scale))
            {
                _scale = scale;
                style.minHeight = Top + _rows.Count * (RowH + RowGap) + Axis;
            }
            Rect r = contentRect;
            if (r.width < 40f) return;
            var names = new List<Label>(_rows.Count);
            float widest = 0f;
            for (int row = 0; row < _rows.Count; row++)
            {
                var name = new Label(_rows[row]) { pickingMode = PickingMode.Ignore };
                name.AddToClassList("mf-gantt__row");
                _labels.Add(name);
                names.Add(name);
                widest = Mathf.Max(widest, MeasuredWidth(_rows[row]));
            }
            _gutter = Mathf.Max(Gutter, Mathf.Min(widest + GutterGap, r.width * MaxGutterShare));
            for (int row = 0; row < names.Count; row++)
            {
                Label name = names[row];
                name.style.top = RowY(row);
                name.style.height = RowH;
                if (_rtl) name.style.right = 0; else name.style.left = 0;
                name.style.width = _gutter - GutterGap;
            }
            for (int i = 0; i < _bars.Count; i++)
            {
                MfGanttBar b = _bars[i];
                if (string.IsNullOrEmpty(b.Label) || b.Row < 0 || b.Row >= _rows.Count) continue;
                float x0 = Mathf.Min(X(b.StartDay), X(b.EndDay)), w = Mathf.Abs(X(b.EndDay) - X(b.StartDay));
                var label = new Label(b.Label) { pickingMode = PickingMode.Ignore };
                label.AddToClassList("mf-gantt__bar");
                label.style.top = RowY(b.Row);
                label.style.height = RowH;
                if (w >= InsideLabelMinWidth)
                {
                    label.EnableInClassList("mf-gantt__bar--critical", b.Critical);
                    label.style.left = x0 + 10f;
                    label.style.maxWidth = w - 16f;
                    if (b.Critical)
                    {
                        float textW = Mathf.Min(w - 16f, BarLabelWidth(b.Label));
                        _chevronStart[i] = _rtl ? x0 + w - 10f - textW - 8f : x0 + 10f + textW + 8f;
                        if (_rtl) { label.style.left = StyleKeyword.Auto; label.style.right = r.width - (x0 + w) + 10f; }
                    }
                }
                else
                {
                    // Short bars (a few days of lead time) keep their name: it sits after the bar end, in the row.
                    Rect plot = Plot;
                    float room = _rtl ? x0 - plot.xMin - 8f : plot.xMax - (x0 + Mathf.Max(4f, w)) - 8f;
                    if (room < OutsideLabelMinWidth) continue;
                    // Only over an empty stretch of track: never on top of another bar in the row or the slack outline.
                    float textW = Mathf.Min(room, BarLabelWidth(b.Label));
                    float end = x0 + Mathf.Max(4f, w);
                    Vector2 span = _rtl ? new Vector2(x0 - 8f - textW, x0 - 8f) : new Vector2(end + 8f, end + 8f + textW);
                    if (OverlapsOtherBar(i, b.Row, span)) continue;
                    label.AddToClassList("mf-gantt__bar--outside");
                    if (_rtl) label.style.right = r.width - x0 + 8f;
                    else label.style.left = x0 + Mathf.Max(4f, w) + 8f;
                    label.style.maxWidth = room;
                }
                _labels.Add(label);
            }
            if (HasDeadlineLabel)
            {
                // Above the rows, beside the top of the deadline line, on the side with more room: it can never meet
                // the bars, the slack outline or the "now" label (which sits under the axis).
                var dl = new Label(_deadlineText) { pickingMode = PickingMode.Ignore };
                dl.AddToClassList("mf-gantt__deadline");
                float x = X(_deadline);
                bool labelLeftOfLine = x > Plot.xMin + Plot.width * 0.5f;
                if (labelLeftOfLine) dl.style.right = r.width - x + 8f; else dl.style.left = x + 8f;
                dl.style.top = 0f;
                _labels.Add(dl);
            }
            // Axis: a day number under every tick (the last carries the unit). The tick under "now" is labelled with the
            // now text instead, so the two never overprint.
            float axisTop = RowY(_rows.Count) - RowGap + 12f * _scale;
            bool nowLabelled = _now >= 0 && !string.IsNullOrEmpty(_nowText);
            // Placed label extents (x0, x1): a tick label that would touch one already placed (or "Today") is skipped.
            var taken = new List<Vector2>();
            if (nowLabelled)
            {
                float nx = X(_now), nw = TextWidth(_nowProbe, _nowText);
                taken.Add(_rtl ? new Vector2(nx - nw, nx) : new Vector2(nx, nx + nw));
            }
            double lastTick = System.Math.Floor((_axisDays + 0.01) / _tickDays) * _tickDays;
            for (double d = 0; d <= _axisDays + 0.01; d += _tickDays)
            {
                if (nowLabelled && System.Math.Abs(d - _now) < _tickDays * 0.5) continue;
                bool last = System.Math.Abs(d - lastTick) < 0.01;
                string text = MfMotion.Number(d, 0) + (last && _axisUnit.Length > 0 ? "\u00A0" + _axisUnit : "");
                var tick = new Label(text) { pickingMode = PickingMode.Ignore };
                tick.AddToClassList("mf-gantt__tick");
                tick.style.top = axisTop;
                float x = X(d), tw = TextWidth(_tickProbe, text);
                // The last label ends at its tick (RTL: starts at it) so it stays inside the chart; the others centre.
                Vector2 span = last ? (_rtl ? new Vector2(x, x + tw) : new Vector2(x - tw, x)) : new Vector2(x - tw * 0.5f, x + tw * 0.5f);
                bool clash = false;
                foreach (Vector2 t in taken) if (span.x < t.y + 6f && span.y > t.x - 6f) { clash = true; break; }
                if (clash) continue;
                taken.Add(span);
                tick.style.left = span.x;
                _labels.Add(tick);
            }
            if (nowLabelled)
            {
                var now = new Label(_nowText) { pickingMode = PickingMode.Ignore };
                now.AddToClassList("mf-gantt__now");
                float x = X(_now);
                if (_rtl) now.style.right = r.width - x; else now.style.left = x;
                now.style.top = axisTop;
                _labels.Add(now);
            }
            MarkDirtyRepaint();
        }

        /// <summary>True when <paramref name="span"/> (x0, x1) meets another bar in <paramref name="row"/>, or the slack outline on the last row.</summary>
        private bool OverlapsOtherBar(int index, int row, Vector2 span)
        {
            for (int j = 0; j < _bars.Count; j++)
            {
                if (j == index || _bars[j].Row != row) continue;
                float a = Mathf.Min(X(_bars[j].StartDay), X(_bars[j].EndDay)), b = Mathf.Max(X(_bars[j].StartDay), X(_bars[j].EndDay));
                if (span.x < b && span.y > a) return true;
            }
            if (row == _rows.Count - 1 && _launchReady >= 0 && _deadline > _launchReady)
            {
                float a = Mathf.Min(X(_launchReady), X(_deadline)), b = Mathf.Max(X(_launchReady), X(_deadline));
                if (span.x < b && span.y > a) return true;
            }
            return false;
        }

        /// <summary>Single-line width of a bar label in the resolved bar font.</summary>
        private float BarLabelWidth(string text) => TextWidth(_barProbe, text);

        /// <summary>Single-line width of <paramref name="text"/> in <paramref name="probe"/>'s resolved font.</summary>
        private static float TextWidth(Label probe, string text)
        {
            if (string.IsNullOrEmpty(text)) return 0f;
            Vector2 size = probe.MeasureTextSize(text, 0f, MeasureMode.Undefined, 0f, MeasureMode.Undefined);
            return float.IsNaN(size.x) ? 0f : Mathf.Ceil(size.x);
        }

        /// <summary>Single-line width of a row name in the resolved row font.</summary>
        private float MeasuredWidth(string text)
        {
            if (string.IsNullOrEmpty(text)) return 0f;
            Vector2 size = _probe.MeasureTextSize(text, 0f, MeasureMode.Undefined, 0f, MeasureMode.Undefined);
            return float.IsNaN(size.x) ? 0f : Mathf.Ceil(size.x);
        }
    }
}
