using UnityEngine;
using UnityEngine.UIElements;

namespace MissionForge.UI
{
    /// <summary>
    /// Small vector status icon drawn with Painter2D so status is never carried by colour alone.
    /// Kinds: check, warn, cross, dot, ring, signal.
    /// </summary>
    [UxmlElement]
    public partial class MfIcon : VisualElement
    {
        private string _kind = "dot";
        private Color _tint = MfPalette.Text;

        [UxmlAttribute]
        public string kind
        {
            get => _kind;
            set { _kind = value; MarkDirtyRepaint(); }
        }

        public Color Tint
        {
            get => _tint;
            set { _tint = value; MarkDirtyRepaint(); }
        }

        public MfIcon()
        {
            style.width = 26;
            style.height = 26;
            style.flexShrink = 0;
            pickingMode = PickingMode.Ignore;
            generateVisualContent += Draw;
        }

        private void Draw(MeshGenerationContext ctx)
        {
            Rect r = contentRect;
            float s = Mathf.Min(r.width, r.height);
            if (s <= 1f) return;
            Vector2 c = r.center;
            Painter2D p = ctx.painter2D;
            p.strokeColor = _tint;
            p.fillColor = _tint;
            p.lineWidth = Mathf.Max(2.5f, s * 0.14f);
            p.lineCap = LineCap.Round;
            p.lineJoin = LineJoin.Round;

            switch (_kind)
            {
                case "check":
                    p.BeginPath();
                    p.MoveTo(c + new Vector2(-0.32f, 0.02f) * s);
                    p.LineTo(c + new Vector2(-0.08f, 0.26f) * s);
                    p.LineTo(c + new Vector2(0.34f, -0.24f) * s);
                    p.Stroke();
                    break;
                case "warn":
                    p.BeginPath();
                    p.MoveTo(c + new Vector2(0f, -0.36f) * s);
                    p.LineTo(c + new Vector2(0.38f, 0.32f) * s);
                    p.LineTo(c + new Vector2(-0.38f, 0.32f) * s);
                    p.ClosePath();
                    p.Stroke();
                    p.BeginPath();
                    p.MoveTo(c + new Vector2(0f, -0.10f) * s);
                    p.LineTo(c + new Vector2(0f, 0.10f) * s);
                    p.Stroke();
                    break;
                case "cross":
                    p.BeginPath();
                    p.MoveTo(c + new Vector2(-0.28f, -0.28f) * s);
                    p.LineTo(c + new Vector2(0.28f, 0.28f) * s);
                    p.MoveTo(c + new Vector2(0.28f, -0.28f) * s);
                    p.LineTo(c + new Vector2(-0.28f, 0.28f) * s);
                    p.Stroke();
                    break;
                case "ring":
                    p.BeginPath();
                    p.Arc(c, s * 0.30f, 0f, 360f);
                    p.Stroke();
                    break;
                case "signal":
                    for (int i = 0; i < 3; i++)
                    {
                        float h = s * (0.22f + 0.22f * i);
                        float x = c.x + (i - 1) * s * 0.28f;
                        p.BeginPath();
                        p.MoveTo(new Vector2(x, c.y + s * 0.34f));
                        p.LineTo(new Vector2(x, c.y + s * 0.34f - h));
                        p.Stroke();
                    }
                    break;
                default:
                    p.BeginPath();
                    p.Arc(c, s * 0.24f, 0f, 360f);
                    p.Fill();
                    break;
            }
        }
    }
}
