using UnityEngine;
using UnityEngine.UIElements;

namespace MissionForge.UI
{
    /// <summary>
    /// Seat and avatar card for the lobby roster. Occupied: helmet avatar, name, role chip. Away: dimmed with a
    /// wifi-off shape and word (not opacity alone). Empty: a designed "waiting" state (dotted helmet outline with a
    /// user-plus icon and a localised message), never a mono "Seat 05 open". Enter motion via .mf-seat--in.
    /// </summary>
    [UxmlElement]
    public partial class MfSeatCard : VisualElement
    {
        private readonly VisualElement _slot;
        private readonly AvatarBadge _avatar;
        private readonly MfIcon _waitingIcon;
        private readonly Label _name;
        private readonly VisualElement _chip;
        private readonly MfIcon _chipIcon;
        private readonly Label _chipLabel;
        private readonly Label _waiting;

        public MfSeatCard()
        {
            AddToClassList("mf-seat");
            pickingMode = PickingMode.Ignore;

            _slot = new VisualElement { pickingMode = PickingMode.Ignore };
            _slot.AddToClassList("mf-seat__avatar");
            _slot.generateVisualContent += DrawPlaceholder;
            _avatar = new AvatarBadge();
            _avatar.AddToClassList("mf-fill");
            _waitingIcon = new MfIcon { kind = "user-plus" };
            _waitingIcon.AddToClassList("mf-seat__waiting-icon");
            _slot.Add(_avatar);
            _slot.Add(_waitingIcon);

            _name = new Label { pickingMode = PickingMode.Ignore };
            _name.AddToClassList("mf-seat__name");
            _chip = new VisualElement { pickingMode = PickingMode.Ignore };
            _chip.AddToClassList("mf-chip");
            _chip.AddToClassList("mf-seat__role");
            _chipIcon = new MfIcon { kind = "user" };
            _chipIcon.AddToClassList("mf-icon--24");
            _chipLabel = new Label { pickingMode = PickingMode.Ignore };
            _chipLabel.AddToClassList("mf-chip__label");
            _chip.Add(_chipIcon);
            _chip.Add(_chipLabel);
            _waiting = new Label { pickingMode = PickingMode.Ignore };
            _waiting.AddToClassList("mf-seat__waiting");

            Add(_slot);
            Add(_name);
            Add(_chip);
            Add(_waiting);
            SetEmpty("");
        }

        public bool IsEmpty => ClassListContains("mf-seat--empty");

        /// <summary>Empty seat: the designed waiting state with <paramref name="waitingText"/> (from strings).</summary>
        public void SetEmpty(string waitingText)
        {
            AddToClassList("mf-seat--empty");
            RemoveFromClassList("mf-seat--away");
            _waiting.text = waitingText;
            Show(false);
            _slot.MarkDirtyRepaint();
        }

        /// <summary>Occupied seat. <paramref name="roleText"/> null shows <paramref name="noRoleText"/> as a muted chip.</summary>
        public void SetPlayer(string avatarId, string nickname, string roleText, string noRoleText, bool connected, string awayText)
        {
            RemoveFromClassList("mf-seat--empty");
            EnableInClassList("mf-seat--away", !connected);
            _avatar.SetIdentity(avatarId, nickname);
            _name.text = MfText.Escape(nickname);
            bool hasRole = !string.IsNullOrEmpty(roleText);
            _chipLabel.text = !connected ? awayText : hasRole ? roleText : noRoleText;
            _chip.EnableInClassList("mf-chip--role", connected && hasRole);
            _chip.EnableInClassList("mf-chip--muted", !connected || !hasRole);
            _chipIcon.kind = !connected ? "wifi-off" : hasRole ? "user" : "hourglass";
            _chipIcon.Tint = !connected || !hasRole ? MfPalette.Muted : MfPalette.Ceramic;
            Show(true);
            _slot.MarkDirtyRepaint();
        }

        private void Show(bool occupied)
        {
            _avatar.style.display = occupied ? DisplayStyle.Flex : DisplayStyle.None;
            _waitingIcon.style.display = occupied ? DisplayStyle.None : DisplayStyle.Flex;
            _name.style.display = occupied ? DisplayStyle.Flex : DisplayStyle.None;
            _chip.style.display = occupied ? DisplayStyle.Flex : DisplayStyle.None;
            _waiting.style.display = occupied ? DisplayStyle.None : DisplayStyle.Flex;
        }

        /// <summary>Dotted helmet outline for the empty state.</summary>
        private void DrawPlaceholder(MeshGenerationContext ctx)
        {
            if (!IsEmpty) return;
            Rect r = _slot.contentRect;
            float s = Mathf.Min(r.width, r.height);
            if (s < 8f) return;
            Painter2D p = ctx.painter2D;
            p.fillColor = MfPalette.WithAlpha(MfPalette.Ceramic, 0.06f);
            p.BeginPath();
            p.Arc(r.center, s * 0.46f, 0f, 360f);
            p.Fill();
            p.fillColor = MfPalette.WithAlpha(MfPalette.Ceramic, 0.40f);
            const int dots = 36;
            for (int i = 0; i < dots; i++)
            {
                float a = i * Mathf.PI * 2f / dots;
                p.BeginPath();
                p.Arc(r.center + new Vector2(Mathf.Cos(a), Mathf.Sin(a)) * s * 0.46f, 1.8f, 0f, 360f);
                p.Fill();
            }
        }
    }
}
