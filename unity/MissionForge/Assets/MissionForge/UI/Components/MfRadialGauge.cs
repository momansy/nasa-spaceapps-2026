using UnityEngine;
using UnityEngine.UIElements;

namespace MissionForge.UI
{
    /// <summary>
    /// Radial gauge and timer ring (VISUAL_TARGET 3.1): a 270° arc with a 12 px stroke, a threshold tick, and the
    /// status glyph at the arc end. A child label shows the value (kpi style) and an optional unit/caption.
    /// Timer mode: value = seconds left / total; the ring turns Fails-coloured and pulses (MfMotion) in the last 5 s.
    /// </summary>
    [UxmlElement]
    public partial class MfRadialGauge : VisualElement
    {
        /// <summary>Arc sweep and stroke (tokens.json dataviz, game_value).</summary>
        private const float SweepDeg = 270f, StartDeg = 135f, Stroke = 12f;

        private float _value, _threshold = -1f;
        private MfStatus _status = MfStatus.Info;
        private readonly Label _valueLabel;
        private readonly Label _captionLabel;
        private readonly MfIcon _endIcon;

        public MfRadialGauge()
        {
            AddToClassList("mf-gauge");
            pickingMode = PickingMode.Ignore;
            _valueLabel = new Label { pickingMode = PickingMode.Ignore };
            _valueLabel.AddToClassList("mf-gauge__value");
            _captionLabel = new Label { pickingMode = PickingMode.Ignore };
            _captionLabel.AddToClassList("mf-gauge__caption");
            _endIcon = new MfIcon { pickingMode = PickingMode.Ignore };
            _endIcon.AddToClassList("mf-gauge__glyph");
            Add(_valueLabel);
            Add(_captionLabel);
            Add(_endIcon);
            generateVisualContent += Draw;
            RegisterCallback<GeometryChangedEvent>(_ => PlaceGlyph());
        }

        [UxmlAttribute] public float value { get => _value; set { _value = Mathf.Clamp01(value); PlaceGlyph(); MarkDirtyRepaint(); } }
        [UxmlAttribute] public float threshold { get => _threshold; set { _threshold = value; MarkDirtyRepaint(); } }
        [UxmlAttribute] public MfStatus status { get => _status; set { _status = value; ApplyStatus(); } }
        [UxmlAttribute] public string text { get => _valueLabel.text; set => _valueLabel.text = value; }
        [UxmlAttribute] public string caption { get => _captionLabel.text; set { _captionLabel.text = value; _captionLabel.style.display = string.IsNullOrEmpty(value) ? DisplayStyle.None : DisplayStyle.Flex; } }

        public void Set(float value01, MfStatus s, string valueText, string captionText, float threshold01 = -1f)
        {
            _value = Mathf.Clamp01(value01);
            _threshold = threshold01;
            text = valueText;
            caption = captionText;
            status = s;
            PlaceGlyph();
            MarkDirtyRepaint();
        }

        private void ApplyStatus()
        {
            _endIcon.kind = MfStatusBadge.IconFor(_status);
            _endIcon.Tint = MfDraw.StatusColour(_status);
            _endIcon.style.display = _status == MfStatus.Info || _status == MfStatus.Pending ? DisplayStyle.None : DisplayStyle.Flex;
            EnableInClassList("mf-gauge--fails", _status == MfStatus.Fails);
            EnableInClassList("mf-gauge--marginal", _status == MfStatus.Marginal);
            MarkDirtyRepaint();
        }

        private float Radius(Rect r) => Mathf.Min(r.width, r.height) * 0.5f - Stroke * 0.5f - 2f;

        private static Vector2 Polar(Vector2 c, float radius, float deg)
        {
            float a = deg * Mathf.Deg2Rad;
            return c + new Vector2(Mathf.Cos(a), Mathf.Sin(a)) * radius;
        }

        private void PlaceGlyph()
        {
            Rect r = contentRect;
            if (r.width < 8f) return;
            Vector2 at = Polar(r.center, Radius(r), StartDeg + SweepDeg * _value);
            float s = _endIcon.resolvedStyle.width > 0 ? _endIcon.resolvedStyle.width : 26f;
            _endIcon.style.left = at.x - s * 0.5f;
            _endIcon.style.top = at.y - s * 0.5f;
        }

        private void Draw(MeshGenerationContext ctx)
        {
            Rect r = contentRect;
            if (r.width < 8f) return;
            Painter2D p = ctx.painter2D;
            Vector2 c = r.center;
            float radius = Radius(r);
            p.lineCap = LineCap.Round;
            p.lineWidth = Stroke;

            p.strokeColor = MfPalette.WithAlpha(MfPalette.Ceramic, 0.10f);
            p.BeginPath();
            p.Arc(c, radius, StartDeg, StartDeg + SweepDeg);
            p.Stroke();

            if (_value > 0.001f)
            {
                p.strokeColor = _status == MfStatus.Info || _status == MfStatus.Pending ? MfPalette.Signal : MfDraw.StatusColour(_status);
                p.BeginPath();
                p.Arc(c, radius, StartDeg, StartDeg + SweepDeg * _value);
                p.Stroke();
            }

            if (_threshold >= 0f && _threshold <= 1f)
            {
                float deg = StartDeg + SweepDeg * _threshold;
                MfDraw.Line(p, Polar(c, radius - Stroke, deg), Polar(c, radius + Stroke, deg), MfPalette.Ceramic, 2f);
            }
        }
    }
}
