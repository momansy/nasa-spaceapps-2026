using UnityEngine;
using UnityEngine.UIElements;

namespace MissionForge.UI
{
    /// <summary>
    /// The MissionForge emblem: a hexagonal forged nut (engineering), a launch delta (flight)
    /// and an orbit with one satellite. Vector-drawn, so it is crisp at any size.
    /// </summary>
    [UxmlElement]
    public partial class LogoMark : VisualElement
    {
        private const int OrbitSegments = 56;
        private const float OrbitTiltDeg = -24f;

        public LogoMark()
        {
            style.width = 132;
            style.height = 132;
            style.flexShrink = 0;
            pickingMode = PickingMode.Ignore;
            generateVisualContent += Draw;
        }

        private static Vector2 OrbitPoint(Vector2 c, float s, float t)
        {
            float a = t * Mathf.PI * 2f;
            var local = new Vector2(Mathf.Cos(a) * 0.60f * s, Mathf.Sin(a) * 0.19f * s);
            float tilt = OrbitTiltDeg * Mathf.Deg2Rad;
            return c + new Vector2(
                local.x * Mathf.Cos(tilt) - local.y * Mathf.Sin(tilt),
                local.x * Mathf.Sin(tilt) + local.y * Mathf.Cos(tilt));
        }

        private void Draw(MeshGenerationContext ctx)
        {
            Rect r = contentRect;
            float s = Mathf.Min(r.width, r.height);
            if (s <= 2f) return;
            Vector2 c = r.center;
            Painter2D p = ctx.painter2D;
            p.lineCap = LineCap.Round;
            p.lineJoin = LineJoin.Round;

            // Far half of the orbit, behind the nut.
            p.strokeColor = new Color(MfPalette.Accent.r, MfPalette.Accent.g, MfPalette.Accent.b, 0.45f);
            p.lineWidth = s * 0.028f;
            p.BeginPath();
            for (int i = 0; i <= OrbitSegments / 2; i++)
            {
                Vector2 pt = OrbitPoint(c, s, 0.5f + i / (float)OrbitSegments);
                if (i == 0) p.MoveTo(pt); else p.LineTo(pt);
            }
            p.Stroke();

            // Hexagonal nut.
            p.strokeColor = MfPalette.Text;
            p.lineWidth = s * 0.058f;
            p.BeginPath();
            for (int i = 0; i < 6; i++)
            {
                float a = (60f * i - 90f) * Mathf.Deg2Rad;
                Vector2 pt = c + new Vector2(Mathf.Cos(a), Mathf.Sin(a)) * s * 0.36f;
                if (i == 0) p.MoveTo(pt); else p.LineTo(pt);
            }
            p.ClosePath();
            p.Stroke();

            // Launch delta.
            p.fillColor = MfPalette.Forge;
            p.BeginPath();
            p.MoveTo(c + new Vector2(0f, -0.22f) * s);
            p.LineTo(c + new Vector2(0.15f, 0.17f) * s);
            p.LineTo(c + new Vector2(0f, 0.08f) * s);
            p.LineTo(c + new Vector2(-0.15f, 0.17f) * s);
            p.ClosePath();
            p.Fill();

            // Near half of the orbit, in front of the nut.
            p.strokeColor = MfPalette.Accent;
            p.lineWidth = s * 0.034f;
            p.BeginPath();
            for (int i = 0; i <= OrbitSegments / 2; i++)
            {
                Vector2 pt = OrbitPoint(c, s, i / (float)OrbitSegments);
                if (i == 0) p.MoveTo(pt); else p.LineTo(pt);
            }
            p.Stroke();

            // Satellite.
            p.fillColor = MfPalette.Text;
            p.BeginPath();
            p.Arc(OrbitPoint(c, s, 0.93f), s * 0.045f, 0f, 360f);
            p.Fill();
        }
    }
}
