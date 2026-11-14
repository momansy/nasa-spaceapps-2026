using UnityEngine;
using UnityEngine.UIElements;

namespace MissionForge.UI
{
    /// <summary>
    /// Toast (e4), modal (e3) and tooltip / "explain" popover. Built from Surfaces.uss classes; timings follow the
    /// motion tokens (enter 320 ms, exit 220 ms) and reduced motion turns them into short fades (Motion.uss).
    /// </summary>
    public static class MfOverlays
    {
        /// <summary>Exit transition length in ms (tokens.json motion.exit, game_value).</summary>
        private const int ExitMs = 220;

        /// <summary>Shows a toast in the bottom-right stack of <paramref name="root"/> and removes it after <paramref name="seconds"/>.</summary>
        public static VisualElement Toast(VisualElement root, string text, MfStatus status = MfStatus.Info, float seconds = 4f)
        {
            VisualElement stack = root.Q<VisualElement>(className: "mf-toast-stack");
            if (stack == null)
            {
                stack = new VisualElement { pickingMode = PickingMode.Ignore };
                stack.AddToClassList("mf-toast-stack");
                root.Add(stack);
            }
            var toast = new VisualElement { pickingMode = PickingMode.Ignore };
            toast.AddToClassList("mf-toast");
            toast.AddToClassList(status switch
            {
                MfStatus.Meets => "mf-toast--meets",
                MfStatus.Marginal => "mf-toast--marginal",
                MfStatus.Fails => "mf-toast--fails",
                _ => "mf-toast--info",
            });
            MfElevation.Attach(toast, 4);
            var icon = new MfIcon { kind = status == MfStatus.Info || status == MfStatus.Pending ? "info" : MfStatusBadge.IconFor(status) };
            icon.AddToClassList("mf-toast__icon");
            var label = new Label(text) { pickingMode = PickingMode.Ignore };
            label.AddToClassList("mf-toast__text");
            toast.Add(icon);
            toast.Add(label);
            stack.Add(toast);
            toast.schedule.Execute(() => toast.AddToClassList("mf-toast--in")).StartingIn(16);
            toast.schedule.Execute(() => toast.AddToClassList("mf-toast--out")).StartingIn((long)(seconds * 1000f));
            toast.schedule.Execute(() => toast.RemoveFromHierarchy()).StartingIn((long)(seconds * 1000f) + ExitMs + 30);
            return toast;
        }

        /// <summary>A modal with a title, body and action row; returns the scrim (call Close to dismiss).</summary>
        public static VisualElement Modal(VisualElement root, string title, string body, params Button[] actions)
        {
            var scrim = new VisualElement();
            scrim.AddToClassList("mf-scrim");
            var modal = new VisualElement();
            modal.AddToClassList("mf-modal");
            MfElevation.Attach(modal, 3);
            var t = new Label(title);
            t.AddToClassList("mf-h2");
            var b = new Label(body);
            b.AddToClassList("mf-body");
            b.style.marginTop = 16;
            var row = new VisualElement();
            row.AddToClassList("mf-modal__actions");
            foreach (Button a in actions) row.Add(a);
            modal.Add(t);
            modal.Add(b);
            modal.Add(row);
            scrim.Add(modal);
            root.Add(scrim);
            scrim.schedule.Execute(() => scrim.AddToClassList("mf-scrim--shown")).StartingIn(16);
            if (actions.Length > 0) actions[actions.Length - 1].schedule.Execute(() => actions[actions.Length - 1].Focus()).StartingIn(40);
            return scrim;
        }

        public static void Close(VisualElement scrim)
        {
            if (scrim == null) return;
            scrim.RemoveFromClassList("mf-scrim--shown");
            scrim.schedule.Execute(() => scrim.RemoveFromHierarchy()).StartingIn(ExitMs + 30);
        }

        /// <summary>Explain popover anchored under <paramref name="anchor"/> inside <paramref name="root"/>.</summary>
        public static VisualElement Explain(VisualElement root, VisualElement anchor, string title, string text)
        {
            var tip = new VisualElement { pickingMode = PickingMode.Ignore };
            tip.AddToClassList("mf-tooltip");
            MfElevation.Attach(tip, 4);
            var caret = new VisualElement { pickingMode = PickingMode.Ignore };
            caret.AddToClassList("mf-tooltip__caret");
            var t = new Label(title) { pickingMode = PickingMode.Ignore };
            t.AddToClassList("mf-tooltip__title");
            var b = new Label(text) { pickingMode = PickingMode.Ignore };
            b.AddToClassList("mf-tooltip__text");
            tip.Add(caret);
            tip.Add(t);
            tip.Add(b);
            root.Add(tip);
            Rect a = root.WorldToLocal(anchor.worldBound);
            tip.style.left = a.xMin;
            tip.style.top = a.yMax + 14f;
            return tip;
        }
    }

    /// <summary>Elevation shadows: a first child with the 9-slice sprite of level e1-e4 (Surfaces.uss).</summary>
    public static class MfElevation
    {
        public const string ShadowClass = "mf-shadow";

        public static void Attach(VisualElement target, int level)
        {
            level = Mathf.Clamp(level, 1, 4);
            VisualElement existing = null;
            foreach (VisualElement child in target.hierarchy.Children())
            {
                if (child.ClassListContains(ShadowClass)) { existing = child; break; }
            }
            if (existing == null)
            {
                existing = new VisualElement { name = "shadow", pickingMode = PickingMode.Ignore };
                existing.AddToClassList(ShadowClass);
                target.hierarchy.Insert(0, existing);
            }
            for (int i = 1; i <= 4; i++) existing.EnableInClassList(ShadowClass + "--e" + i, i == level);
        }
    }

    /// <summary>e1 card with its shadow (UXML: &lt;mf:MfCard elevation="1"&gt;). Add .mf-card--flat inside glass.</summary>
    [UxmlElement]
    public partial class MfCard : VisualElement
    {
        private int _elevation = 1;

        public MfCard()
        {
            AddToClassList("mf-card");
            MfElevation.Attach(this, _elevation);
        }

        [UxmlAttribute]
        public int elevation
        {
            get => _elevation;
            set
            {
                _elevation = value;
                if (value <= 0)
                {
                    foreach (VisualElement c in hierarchy.Children()) if (c.ClassListContains(MfElevation.ShadowClass)) c.style.display = DisplayStyle.None;
                    return;
                }
                MfElevation.Attach(this, value);
            }
        }
    }

    /// <summary>Skeleton block with a static shimmer band (Surfaces.uss), followed by an explicit message elsewhere.</summary>
    [UxmlElement]
    public partial class MfSkeleton : VisualElement
    {
        public MfSkeleton()
        {
            AddToClassList("mf-skeleton");
            pickingMode = PickingMode.Ignore;
            var shine = new VisualElement { pickingMode = PickingMode.Ignore };
            shine.AddToClassList("mf-skeleton__shine");
            Add(shine);
        }
    }

    /// <summary>Designed empty state: an icon and a localised message ("Waiting for the first vote").</summary>
    [UxmlElement]
    public partial class MfEmptyState : VisualElement
    {
        private readonly MfIcon _icon;
        private readonly Label _text;

        public MfEmptyState()
        {
            AddToClassList("mf-empty");
            pickingMode = PickingMode.Ignore;
            _icon = new MfIcon { kind = "hourglass" };
            _icon.AddToClassList("mf-empty__icon");
            _text = new Label { pickingMode = PickingMode.Ignore };
            _text.AddToClassList("mf-empty__text");
            Add(_icon);
            Add(_text);
        }

        [UxmlAttribute] public string text { get => _text.text; set => _text.text = value; }
        [UxmlAttribute] public string icon { get => _icon.kind; set => _icon.kind = value; }
    }
}
