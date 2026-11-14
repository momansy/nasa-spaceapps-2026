using UnityEngine;
using UnityEngine.UIElements;

namespace MissionForge.UI
{
    /// <summary>Painter2D helpers shared by the data-visualisation components (rounded rects, hatches, markers).</summary>
    public static class MfDraw
    {
        public static void RoundedRectPath(Painter2D p, Rect r, float radius)
        {
            float rad = Mathf.Max(0f, Mathf.Min(radius, Mathf.Min(r.width, r.height) * 0.5f));
            p.BeginPath();
            if (rad <= 0.01f)
            {
                p.MoveTo(new Vector2(r.xMin, r.yMin));
                p.LineTo(new Vector2(r.xMax, r.yMin));
                p.LineTo(new Vector2(r.xMax, r.yMax));
                p.LineTo(new Vector2(r.xMin, r.yMax));
                p.ClosePath();
                return;
            }
            p.MoveTo(new Vector2(r.xMin + rad, r.yMin));
            p.LineTo(new Vector2(r.xMax - rad, r.yMin));
            p.ArcTo(new Vector2(r.xMax, r.yMin), new Vector2(r.xMax, r.yMin + rad), rad);
            p.LineTo(new Vector2(r.xMax, r.yMax - rad));
            p.ArcTo(new Vector2(r.xMax, r.yMax), new Vector2(r.xMax - rad, r.yMax), rad);
            p.LineTo(new Vector2(r.xMin + rad, r.yMax));
            p.ArcTo(new Vector2(r.xMin, r.yMax), new Vector2(r.xMin, r.yMax - rad), rad);
            p.LineTo(new Vector2(r.xMin, r.yMin + rad));
            p.ArcTo(new Vector2(r.xMin, r.yMin), new Vector2(r.xMin + rad, r.yMin), rad);
            p.ClosePath();
        }

        public static void FillRoundedRect(Painter2D p, Rect r, float radius, Color c)
        {
            if (r.width <= 0.5f || r.height <= 0.5f) return;
            p.fillColor = c;
            RoundedRectPath(p, r, radius);
            p.Fill();
        }

        public static void StrokeRoundedRect(Painter2D p, Rect r, float radius, Color c, float width)
        {
            if (r.width <= 0.5f || r.height <= 0.5f) return;
            p.strokeColor = c;
            p.lineWidth = width;
            RoundedRectPath(p, r, radius);
            p.Stroke();
        }

        public static void Line(Painter2D p, Vector2 a, Vector2 b, Color c, float width)
        {
            p.strokeColor = c;
            p.lineWidth = width;
            p.BeginPath();
            p.MoveTo(a);
            p.LineTo(b);
            p.Stroke();
        }

        /// <summary>45° stripes clipped to <paramref name="r"/> (rising when <paramref name="rising"/>), spacing in px.</summary>
        public static void Hatch(Painter2D p, Rect r, float spacing, Color c, float width, bool rising = true)
        {
            if (r.width <= 1f || r.height <= 1f) return;
            p.strokeColor = c;
            p.lineWidth = width;
            p.lineCap = LineCap.Butt;
            float h = r.height;
            for (float s = r.xMin - h; s < r.xMax; s += spacing)
            {
                // Line from (s, yMax) to (s + h, yMin) for rising; mirrored for falling. Clip to [xMin, xMax].
                float x0 = s, x1 = s + h;
                float cx0 = Mathf.Max(x0, r.xMin), cx1 = Mathf.Min(x1, r.xMax);
                if (cx1 <= cx0) continue;
                float y0 = rising ? r.yMax - (cx0 - x0) : r.yMin + (cx0 - x0);
                float y1 = rising ? r.yMax - (cx1 - x0) : r.yMin + (cx1 - x0);
                p.BeginPath();
                p.MoveTo(new Vector2(cx0, y0));
                p.LineTo(new Vector2(cx1, y1));
                p.Stroke();
            }
        }

        /// <summary>Status fill pattern (VISUAL_TARGET 3.1 bars): Meets solid, Marginal 45° hatch, Fails cross-hatch.</summary>
        public static void StatusFill(Painter2D p, Rect r, float radius, MfStatus status, Color colour)
        {
            if (r.width <= 0.5f) return;
            switch (status)
            {
                case MfStatus.Marginal:
                    FillRoundedRect(p, r, radius, MfPalette.WithAlpha(colour, 0.35f));
                    Hatch(p, Inset(r, radius), 7f, colour, 2.5f);
                    StrokeRoundedRect(p, r, radius, colour, 1.5f);
                    break;
                case MfStatus.Fails:
                    FillRoundedRect(p, r, radius, MfPalette.WithAlpha(colour, 0.30f));
                    Rect inner = Inset(r, radius);
                    Hatch(p, inner, 7f, colour, 2f);
                    Hatch(p, inner, 7f, colour, 2f, false);
                    StrokeRoundedRect(p, r, radius, colour, 1.5f);
                    break;
                default:
                    FillRoundedRect(p, r, radius, colour);
                    break;
            }
        }

        /// <summary>The rect without its rounded end caps, so hatches never poke out of the corners.</summary>
        public static Rect Inset(Rect r, float radius)
        {
            float k = Mathf.Min(radius * 0.6f, r.width * 0.25f);
            return new Rect(r.xMin + k, r.yMin, Mathf.Max(0f, r.width - 2 * k), r.height);
        }

        /// <summary>Filled triangle with its tip at <paramref name="tip"/> pointing up (dir −1) or down (+1).</summary>
        public static void Triangle(Painter2D p, Vector2 tip, float size, float dir, Color c)
        {
            p.fillColor = c;
            p.BeginPath();
            p.MoveTo(tip);
            p.LineTo(tip + new Vector2(-size * 0.6f, -dir * size));
            p.LineTo(tip + new Vector2(size * 0.6f, -dir * size));
            p.ClosePath();
            p.Fill();
        }

        public static Color StatusColour(MfStatus s) => s switch
        {
            MfStatus.Meets => MfPalette.Meets,
            MfStatus.Marginal => MfPalette.Marginal,
            MfStatus.Fails => MfPalette.Fails,
            MfStatus.Info => MfPalette.Signal,
            _ => MfPalette.Muted,
        };
    }
}
