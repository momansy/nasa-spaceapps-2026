using System;
using MissionForge.Screens.BuildBay;
using MissionForge.UI;
using UnityEngine;
using UnityEngine.UIElements;

namespace MissionForge.Screens.Preflight
{
    /// <summary>Small element factories and shared widgets of the pre-flight screens (classes in UI/Preflight.uss).</summary>
    public static class PfUi
    {
        public static VisualElement El(params string[] classes)
        {
            var e = new VisualElement();
            foreach (string c in classes) if (!string.IsNullOrEmpty(c)) e.AddToClassList(c);
            return e;
        }

        public static Label Lbl(string text, params string[] classes)
        {
            var l = new Label(text) { pickingMode = PickingMode.Ignore };
            foreach (string c in classes) if (!string.IsNullOrEmpty(c)) l.AddToClassList(c);
            return l;
        }

        /// <summary>A focusable control: keyboard / gamepad focus shows the Signal outline (USS <c>:focus</c>), Enter / Submit invokes.</summary>
        public static VisualElement Focusable(VisualElement e, Action onSubmit = null)
        {
            e.focusable = true;
            e.tabIndex = 0;
            e.AddToClassList("pf-focusable");
            if (onSubmit != null)
            {
                e.RegisterCallback<ClickEvent>(_ => onSubmit());
                e.RegisterCallback<NavigationSubmitEvent>(_ => onSubmit());
            }
            return e;
        }

        public static Button Btn(string text, string kind, Action click)
        {
            var b = new Button(click) { text = text };
            b.AddToClassList("mf-btn");
            b.AddToClassList("mf-btn--" + kind);
            b.AddToClassList("mf-btn--m");
            return b;
        }

        /// <summary>Hidden rehearsal label (editor / MF_REHEARSAL builds only).</summary>
        public static VisualElement RehearsalBanner(PreflightText t, string detail)
        {
            VisualElement row = El("pf-rehearsal");
            row.Add(Lbl(t.Get("ui.host.rehearsal"), "mf-chip__label", "pf-rehearsal__title"));
            row.Add(Lbl(detail, "pf-rehearsal__detail"));
            return row;
        }

        public static void Show(VisualElement e, bool shown) => e.style.display = shown ? DisplayStyle.Flex : DisplayStyle.None;

        /// <summary>Scale-based fill (compositor friendly): fraction 0..1 from the start edge.</summary>
        public static void Fill(VisualElement fill, float fraction)
        {
            float f = Mathf.Clamp01(fraction);
            fill.style.scale = new Scale(new Vector2(f, 1f));
        }

        /// <summary>The label shown beside a lifecycle step (design 2.3).</summary>
        public static string Lifecycle(PreflightText t, string step) => t.Get("ui.host.lifecycle." + step);
    }
}
