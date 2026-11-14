using UnityEngine;
using UnityEngine.UIElements;

namespace MissionForge.UI
{
    /// <summary>
    /// Player avatar: an astronaut helmet in the player's suit colour with their initial on the visor.
    /// Colour comes from a colour-blind-safe categorical palette keyed by the avatar id, and the
    /// initial means identity never depends on colour alone.
    /// </summary>
    [UxmlElement]
    public partial class AvatarBadge : VisualElement
    {
        private readonly Label _initial;
        private Color _suit = MfPalette.Categorical[1];

        public AvatarBadge()
        {
            pickingMode = PickingMode.Ignore;
            style.alignItems = Align.Center;
            style.justifyContent = Justify.Center;
            _initial = new Label("?") { pickingMode = PickingMode.Ignore };
            _initial.AddToClassList("mf-num");
            _initial.style.fontSize = 44;
            _initial.style.color = MfPalette.Text;
            _initial.style.marginTop = 4;
            Add(_initial);
            generateVisualContent += Draw;
        }

        /// <summary>Sets the suit colour from the avatar id and the visor initial from the nickname.</summary>
        public void SetIdentity(string avatarId, string nickname)
        {
            _suit = MfPalette.CategoricalFor(string.IsNullOrEmpty(avatarId) ? nickname : avatarId);
            _initial.text = string.IsNullOrEmpty(nickname) ? "?" : nickname.Substring(0, 1).ToUpperInvariant();
            MarkDirtyRepaint();
        }

        private void Draw(MeshGenerationContext ctx)
        {
            Rect r = contentRect;
            float s = Mathf.Min(r.width, r.height);
            if (s <= 2f) return;
            Vector2 c = r.center;
            Painter2D p = ctx.painter2D;

            // Helmet shell.
            p.fillColor = _suit;
            p.BeginPath();
            p.Arc(c, s * 0.48f, 0f, 360f);
            p.Fill();

            // Neck ring.
            p.strokeColor = new Color(1f, 1f, 1f, 0.85f);
            p.lineWidth = s * 0.035f;
            p.BeginPath();
            p.Arc(c, s * 0.48f, 0f, 360f);
            p.Stroke();

            // Visor.
            p.fillColor = new Color(0.02f, 0.04f, 0.09f, 0.94f);
            p.BeginPath();
            p.Arc(c + new Vector2(0f, s * 0.02f), s * 0.33f, 0f, 360f);
            p.Fill();

            // Visor highlight.
            p.strokeColor = new Color(1f, 1f, 1f, 0.55f);
            p.lineWidth = s * 0.03f;
            p.lineCap = LineCap.Round;
            p.BeginPath();
            p.Arc(c + new Vector2(0f, s * 0.02f), s * 0.26f, 200f, 255f);
            p.Stroke();
        }
    }
}
