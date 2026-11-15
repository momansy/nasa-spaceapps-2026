using UnityEngine;
using UnityEngine.UIElements;

namespace MissionForge.Screens.Campaign
{
    /// <summary>
    /// A mission patch: a flat-topped hexagon with a coloured rim, an inner orbit ring and a centred label. Used for the
    /// agency patch and each mission in the hall. The status is never colour alone: callers add a status icon and a word.
    /// </summary>
    public sealed class HexPatch : VisualElement
    {
        private readonly Label _label;
        private Color _rim = Color.white;
        private Color _fill = new Color(0f, 0f, 0f, 0.4f);
        private float _rimWidth = 4f;
        private bool _ring = true;

        public HexPatch()
        {
            pickingMode = PickingMode.Ignore;
            _label = new Label { pickingMode = PickingMode.Ignore };
            _label.style.position = Position.Absolute;
            _label.style.left = 0;
            _label.style.right = 0;
            _label.style.top = 0;
            _label.style.bottom = 0;
            _label.style.unityTextAlign = TextAnchor.MiddleCenter;
            _label.style.marginLeft = 0;
            _label.style.marginRight = 0;
            _label.style.paddingLeft = 0;
            _label.style.paddingRight = 0;
            Add(_label);
            generateVisualContent += Draw;
        }

        public Label Label => _label;

        public void Set(string text, Color rim, Color fill, float rimWidth, bool ring)
        {
            _label.text = text;
            _rim = rim;
            _fill = fill;
            _rimWidth = rimWidth;
            _ring = ring;
            MarkDirtyRepaint();
        }

        private void Draw(MeshGenerationContext ctx)
        {
            Rect r = contentRect;
            if (r.width < 4f || r.height < 4f) return;
            Vector2 c = r.center;
            float radius = Mathf.Min(r.width, r.height) * 0.5f - _rimWidth;
            Painter2D p = ctx.painter2D;
            p.BeginPath();
            for (int i = 0; i < 6; i++)
            {
                float a = Mathf.Deg2Rad * (60f * i);
                var v = new Vector2(c.x + radius * Mathf.Cos(a), c.y + radius * Mathf.Sin(a));
                if (i == 0) p.MoveTo(v); else p.LineTo(v);
            }
            p.ClosePath();
            p.fillColor = _fill;
            p.Fill();
            p.strokeColor = _rim;
            p.lineWidth = _rimWidth;
            p.Stroke();
            if (!_ring) return;
            p.BeginPath();
            p.Arc(c, radius * 0.72f, 200f, 520f);
            p.strokeColor = new Color(_rim.r, _rim.g, _rim.b, 0.45f);
            p.lineWidth = Mathf.Max(1.5f, _rimWidth * 0.5f);
            p.Stroke();
        }
    }
}
