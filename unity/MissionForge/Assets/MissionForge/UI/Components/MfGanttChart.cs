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
        private const float RowHeight = 32f, RowGap = 8f, BarRadius = 4f, AxisHeight = 28f;

        private readonly List<MfGanttBar> _bars = new List<MfGanttBar>();
        private readonly List<string> _rows = new List<string>();
        private readonly VisualElement _labels = new VisualElement { pickingMode = PickingMode.Ignore };
        private double _axisDays = 1, _deadline = -1, _launchReady = -1, _now = -1, _tickDays = 30;
        private string _deadlineText = "", _nowText = "";
        private const float NowLabelClearance = 220f;
        private const float NowLabelLineOffset = 28f;
        private bool _rtl;

        public MfGanttChart()
        {
            AddToClassList("mf-gantt");
            pickingMode = PickingMode.Ignore;
            _labels.AddToClassList("mf-fill");
            Add(_labels);
            generateVisualContent += Draw;
            RegisterCallback<GeometryChangedEvent>(_ => Relabel());
        }

        /// <summary>Width of the row-name gutter in px; USS can override with --mf-gantt-gutter (default 200).</summary>
        public float Gutter { get; set; } = 200f;

        public void Set(IReadOnlyList<string> rowNames, IReadOnlyList<MfGanttBar> bars, double axisDays, double launchReadyDay,
            double deadlineDay, string deadlineText, double nowDay = -1, string nowText = null, double tickDays = 30, bool rtl = false)
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
            style.minHeight = _rows.Count * (RowHeight + RowGap) + AxisHeight;
            Relabel();
            MarkDirtyRepaint();
        }

        private Rect Plot
        {
            get
            {
                Rect r = contentRect;
                float w = Mathf.Max(10f, r.width - Gutter);
                return new Rect(_rtl ? r.xMin : r.xMin + Gutter, r.yMin, w, r.height);
            }
        }

        private float X(double day)
        {
            Rect p = Plot;
            float f = Mathf.Clamp01((float)(day / _axisDays));
            return _rtl ? p.xMax - f * p.width : p.xMin + f * p.width;
        }

        private static float RowY(int row) => row * (RowHeight + RowGap);

        private void Draw(MeshGenerationContext ctx)
        {
            Rect r = contentRect;
            if (r.width < 40f || _rows.Count == 0) return;
            Painter2D p = ctx.painter2D;
            Rect plot = Plot;
            float bottom = RowY(_rows.Count) - RowGap;

            for (int row = 0; row < _rows.Count; row++)
            {
                MfDraw.FillRoundedRect(p, new Rect(plot.xMin, RowY(row), plot.width, RowHeight), BarRadius, MfPalette.WithAlpha(MfPalette.Ceramic, 0.06f));
            }

            foreach (MfGanttBar b in _bars)
            {
                if (b.Row < 0 || b.Row >= _rows.Count) continue;
                float x0 = X(b.StartDay), x1 = X(b.EndDay);
                var bar = new Rect(Mathf.Min(x0, x1), RowY(b.Row) + 3f, Mathf.Max(4f, Mathf.Abs(x1 - x0)), RowHeight - 6f);
                if (b.Critical)
                {
                    MfDraw.FillRoundedRect(p, bar, BarRadius, b.Test ? MfPalette.Sunlight : MfPalette.Signal);
                    Chevrons(p, bar);
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
                var slack = new Rect(Mathf.Min(a, b), RowY(_rows.Count - 1) + 5f, Mathf.Abs(b - a), RowHeight - 10f);
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
                MfDraw.Line(p, new Vector2(x, -4f), new Vector2(x, bottom + 4f), MfPalette.Ceramic, 2f);
                MfDraw.Triangle(p, new Vector2(x, 2f), 8f, 1f, MfPalette.Ceramic);
            }

            if (_deadline >= 0)
            {
                float x = X(_deadline);
                MfDraw.Line(p, new Vector2(x, -6f), new Vector2(x, bottom + 12f), MfPalette.Fails, 3f);
            }
        }

        /// <summary>Chevron pattern (») in Space over a critical bar: pattern, not colour alone.</summary>
        private static void Chevrons(Painter2D p, Rect bar)
        {
            Rect inner = MfDraw.Inset(bar, BarRadius + 2f);
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
            Rect r = contentRect;
            if (r.width < 40f) return;
            for (int row = 0; row < _rows.Count; row++)
            {
                var name = new Label(_rows[row]) { pickingMode = PickingMode.Ignore };
                name.AddToClassList("mf-gantt__row");
                name.style.top = RowY(row);
                if (_rtl) name.style.right = 0; else name.style.left = 0;
                name.style.width = Gutter - 12f;
                _labels.Add(name);
            }
            foreach (MfGanttBar b in _bars)
            {
                if (string.IsNullOrEmpty(b.Label) || b.Row < 0 || b.Row >= _rows.Count) continue;
                float x0 = Mathf.Min(X(b.StartDay), X(b.EndDay)), w = Mathf.Abs(X(b.EndDay) - X(b.StartDay));
                if (w < 90f) continue;
                var label = new Label(b.Label) { pickingMode = PickingMode.Ignore };
                label.AddToClassList("mf-gantt__bar");
                label.EnableInClassList("mf-gantt__bar--critical", b.Critical);
                label.style.left = x0 + 10f;
                label.style.top = RowY(b.Row);
                label.style.maxWidth = w - 16f;
                _labels.Add(label);
            }
            if (_deadline >= 0 && !string.IsNullOrEmpty(_deadlineText))
            {
                var dl = new Label(_deadlineText) { pickingMode = PickingMode.Ignore };
                dl.AddToClassList("mf-gantt__deadline");
                float x = X(_deadline);
                bool leftSide = !_rtl ? x > Plot.xMin + Plot.width * 0.5f : x > Plot.xMin + Plot.width * 0.5f;
                if (leftSide) dl.style.right = r.width - x + 8f; else dl.style.left = x + 8f;
                dl.style.top = RowY(_rows.Count) - RowGap + 6f;
                _labels.Add(dl);
            }
            if (_now >= 0 && !string.IsNullOrEmpty(_nowText))
            {
                var now = new Label(_nowText) { pickingMode = PickingMode.Ignore };
                now.AddToClassList("mf-gantt__now");
                now.style.left = X(_now) + 8f;
                // Both labels sit on the axis line; when the markers are close, drop "now" one text line lower so
                // the two never overlap (game_value spacing: 220 px clearance, 28 px line).
                bool crowded = _deadline >= 0 && !string.IsNullOrEmpty(_deadlineText) && Mathf.Abs(X(_now) - X(_deadline)) < NowLabelClearance;
                now.style.top = RowY(_rows.Count) - RowGap + 6f + (crowded ? NowLabelLineOffset : 0f);
                _labels.Add(now);
            }
        }
    }
}
