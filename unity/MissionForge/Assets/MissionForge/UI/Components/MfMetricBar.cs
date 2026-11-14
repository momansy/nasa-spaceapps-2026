using UnityEngine;
using UnityEngine.UIElements;

namespace MissionForge.UI
{
    /// <summary>
    /// Metric bar (VISUAL_TARGET 3.1): 12 px bar with radius 6 on a Ceramic-10 % track; the fill pattern follows the
    /// status (Meets solid, Marginal 45° hatch, Fails cross-hatch); a requirement marker (2 px line with a triangle cap
    /// and a label); an optional uncertainty band; and the "if chosen" ghost delta, a Signal-40 % segment with an
    /// arrow, a signed value and a unit. All fractions are 0..1 of the bar's scale, supplied by the caller.
    /// </summary>
    [UxmlElement]
    public partial class MfMetricBar : VisualElement
    {
        /// <summary>Bar geometry in px (tokens.json dataviz, game_value).</summary>
        private const float BarHeight = 12f, BarRadius = 6f, MarkerWidth = 2f, CapSize = 7f;
        /// <summary>
        /// Compact bars sit at the bottom of their own box so the marker and its cap stay inside it and never run into
        /// the detail line below (RUBRIC U6); regular bars keep a 9 px top for the label above the cap.
        /// </summary>
        private float BarTop => ClassListContains(CompactClass) ? Mathf.Max(0f, contentRect.height - BarHeight) : 9f;
        /// <summary>Compact rows (dense dashboards) draw labels elsewhere and keep only the bar, marker and ghost.</summary>
        public const string CompactClass = "mf-metricbar--compact";

        private float _value, _requirement = -1f, _ghost = -1f, _bandLow = -1f, _bandHigh = -1f;
        private MfStatus _status = MfStatus.Info;
        private bool _rtl;
        private readonly Label _requirementLabel;
        private readonly Label _ghostLabel;

        public MfMetricBar()
        {
            AddToClassList("mf-metricbar");
            pickingMode = PickingMode.Ignore;
            _requirementLabel = new Label { pickingMode = PickingMode.Ignore };
            _requirementLabel.AddToClassList("mf-metricbar__req");
            _ghostLabel = new Label { pickingMode = PickingMode.Ignore };
            _ghostLabel.AddToClassList("mf-metricbar__ghost");
            Add(_requirementLabel);
            Add(_ghostLabel);
            generateVisualContent += Draw;
            RegisterCallback<GeometryChangedEvent>(_ => PlaceLabels());
            Refresh();
        }

        [UxmlAttribute] public float value { get => _value; set { _value = Mathf.Clamp01(value); Refresh(); } }
        [UxmlAttribute] public float requirement { get => _requirement; set { _requirement = value; Refresh(); } }
        [UxmlAttribute] public float ghost { get => _ghost; set { _ghost = value; Refresh(); } }
        [UxmlAttribute] public MfStatus status { get => _status; set { _status = value; Refresh(); } }
        [UxmlAttribute] public string requirementText { get => _requirementLabel.text; set { _requirementLabel.text = value; Refresh(); } }
        [UxmlAttribute] public string ghostText { get => _ghostLabel.text; set { _ghostLabel.text = value; Refresh(); } }

        /// <summary>Sets everything at once (one repaint).</summary>
        public void Set(float value01, MfStatus status, float requirement01, string requirementText, float ghost01, string ghostText,
            float bandLow = -1f, float bandHigh = -1f, bool rtl = false)
        {
            _value = Mathf.Clamp01(value01);
            _status = status;
            _requirement = requirement01;
            _requirementLabel.text = requirementText ?? "";
            _ghost = ghost01;
            _ghostLabel.text = ghostText ?? "";
            _bandLow = bandLow;
            _bandHigh = bandHigh;
            _rtl = rtl;
            Refresh();
        }

        private bool HasRequirement => _requirement >= 0f && _requirement <= 1f;
        private bool HasGhost => _ghost >= 0f && Mathf.Abs(_ghost - _value) > 0.002f;

        private void Refresh()
        {
            _requirementLabel.style.display = HasRequirement && !string.IsNullOrEmpty(_requirementLabel.text) ? DisplayStyle.Flex : DisplayStyle.None;
            _ghostLabel.style.display = HasGhost && !string.IsNullOrEmpty(_ghostLabel.text) ? DisplayStyle.Flex : DisplayStyle.None;
            PlaceLabels();
            MarkDirtyRepaint();
        }

        private float X(float f, Rect r) => _rtl ? r.xMax - f * r.width : r.xMin + f * r.width;

        private void PlaceLabels()
        {
            Rect r = contentRect;
            if (r.width < 4f) return;
            // Requirement label sits under the marker's cap, on whichever side has more room.
            if (HasRequirement)
            {
                float x = X(_requirement, r);
                bool rightSide = (x - r.xMin) < r.width * 0.55f;
                // Clear of the cap's half-width (CapSize * 0.6) plus a 4 px gap, so the text never touches the triangle.
                float gap = CapSize * 0.6f + 4f;
                _requirementLabel.style.left = rightSide ? x + gap : StyleKeyword.Auto;
                _requirementLabel.style.right = rightSide ? StyleKeyword.Auto : (r.xMax - x) + gap;
                _requirementLabel.EnableInClassList("mf-metricbar__req--left", !rightSide);
            }
            if (HasGhost)
            {
                float gx = X(_ghost, r);
                bool rightSide = gx < r.xMin + r.width * 0.6f;
                _ghostLabel.style.left = rightSide ? gx + 6f : StyleKeyword.Auto;
                _ghostLabel.style.right = rightSide ? StyleKeyword.Auto : (r.xMax - gx) + 6f;
            }
        }

        private void Draw(MeshGenerationContext ctx)
        {
            Rect r = contentRect;
            if (r.width < 4f) return;
            Painter2D p = ctx.painter2D;
            var track = new Rect(r.xMin, BarTop, r.width, BarHeight);
            MfDraw.FillRoundedRect(p, track, BarRadius, MfPalette.WithAlpha(MfPalette.Ceramic, 0.10f));

            Color colour = MfDraw.StatusColour(_status);
            // A real zero against a requirement still draws a one-radius stub in the status pattern, so a Marginal or
            // Fails row never shows the bare grey track that reads as a stand-in bar (VISUAL_TARGET 3.1).
            bool zeroStub = _value <= 0f && (_status == MfStatus.Marginal || _status == MfStatus.Fails);
            if (_status != MfStatus.Pending && (_value > 0f || zeroStub))
            {
                float w = Mathf.Max(BarHeight * (zeroStub ? 1.5f : 1f), _value * r.width);
                var fill = new Rect(_rtl ? r.xMax - w : r.xMin, BarTop, w, BarHeight);
                MfDraw.StatusFill(p, fill, BarRadius, _status == MfStatus.Info ? MfStatus.Meets : _status,
                    _status == MfStatus.Info ? MfPalette.WithAlpha(MfPalette.Signal, 0.7f) : colour);
            }

            if (_bandLow >= 0f && _bandHigh > _bandLow)
            {
                float a = X(_bandLow, r), b = X(_bandHigh, r);
                var band = new Rect(Mathf.Min(a, b), BarTop - 3f, Mathf.Abs(b - a), BarHeight + 6f);
                MfDraw.StrokeRoundedRect(p, band, 3f, MfPalette.Ceramic, 1.5f);
            }

            if (HasGhost)
            {
                float a = X(_value, r), b = X(_ghost, r);
                var ghost = new Rect(Mathf.Min(a, b), BarTop, Mathf.Abs(b - a), BarHeight);
                MfDraw.FillRoundedRect(p, ghost, 2f, MfPalette.WithAlpha(MfPalette.Signal, 0.40f));
                MfDraw.StrokeRoundedRect(p, ghost, 2f, MfPalette.Signal, 1.5f);
                // Arrow head at the ghost end, pointing in the direction of the change.
                float dir = Mathf.Sign(b - a);
                p.fillColor = MfPalette.Signal;
                p.BeginPath();
                p.MoveTo(new Vector2(b + dir * 6f, BarTop + BarHeight * 0.5f));
                p.LineTo(new Vector2(b - dir * 2f, BarTop - 3f));
                p.LineTo(new Vector2(b - dir * 2f, BarTop + BarHeight + 3f));
                p.ClosePath();
                p.Fill();
            }

            if (HasRequirement)
            {
                float x = X(_requirement, r);
                if (ClassListContains(CompactClass))
                {
                    // Inside the box: the line spans it top to bottom and the cap points down onto the bar.
                    float cap = Mathf.Clamp(BarTop, 3f, 6f);
                    MfDraw.Line(p, new Vector2(x, 0f), new Vector2(x, r.height), MfPalette.Ceramic, MarkerWidth);
                    MfDraw.Triangle(p, new Vector2(x, cap), cap, 1f, MfPalette.Ceramic);
                }
                else
                {
                    MfDraw.Line(p, new Vector2(x, BarTop - 6f), new Vector2(x, BarTop + BarHeight + 4f), MfPalette.Ceramic, MarkerWidth);
                    MfDraw.Triangle(p, new Vector2(x, BarTop + BarHeight + 4f), CapSize, -1f, MfPalette.Ceramic);
                }
            }
        }
    }
}
