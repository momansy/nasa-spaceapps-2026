using System;
using MissionForge.Net;
using UnityEngine.UIElements;

namespace MissionForge.Screens.BuildBay
{
    /// <summary>
    /// Accessibility state of the Build Bay (design 16): right-to-left layout, 200 % text, high contrast and reduced
    /// motion. Sources, later ones win: room settings (<c>settings.state</c>: language and a11y flags), then
    /// command-line overrides for evidence and demos (<c>-mfRtl -mfText200 -mfHighContrast -mfReducedMotion</c>).
    /// </summary>
    public sealed class BayAccessibility
    {
        public bool RightToLeft;
        public bool Text200;
        public bool HighContrast;
        public bool ReducedMotion;

        public event Action Changed;

        /// <summary>Languages laid out right to left.</summary>
        public static bool IsRtlLanguage(string lang)
        {
            if (string.IsNullOrEmpty(lang)) return false;
            string l = lang.ToLowerInvariant();
            return l.StartsWith("ar") || l.StartsWith("he") || l.StartsWith("fa") || l.StartsWith("ur");
        }

        public void FromRoom(RoomSettingsDto settings)
        {
            if (settings == null) return;
            RightToLeft = IsRtlLanguage(settings.Lang);
            if (settings.A11y != null)
            {
                HighContrast = settings.A11y.HighContrast;
                ReducedMotion = settings.A11y.ReducedMotion;
            }
            ApplyCommandLine();
            Changed?.Invoke();
        }

        public void ApplyCommandLine()
        {
            if (BuildBayScreen.Flag("-mfRtl")) RightToLeft = true;
            if (BuildBayScreen.Flag("-mfText200")) Text200 = true;
            if (BuildBayScreen.Flag("-mfHighContrast")) HighContrast = true;
            if (BuildBayScreen.Flag("-mfReducedMotion")) ReducedMotion = true;
        }

        public void Set(bool rtl, bool text200, bool highContrast, bool reducedMotion)
        {
            RightToLeft = rtl;
            Text200 = text200;
            HighContrast = highContrast;
            ReducedMotion = reducedMotion;
            Changed?.Invoke();
        }

        public void ApplyTo(VisualElement screen)
        {
            if (screen == null) return;
            screen.EnableInClassList("bb-rtl", RightToLeft);
            screen.EnableInClassList("bb-text-200", Text200);
            screen.EnableInClassList("bb-hc", HighContrast);
            screen.EnableInClassList("bb-reduced-motion", ReducedMotion);
            // T031 design-system modes (UI/DESIGN_SYSTEM.md): the same switches under the shared mf-* names.
            screen.EnableInClassList("mf-rtl", RightToLeft);
            screen.EnableInClassList("mf-text-200", Text200);
            screen.EnableInClassList("mf-hc", HighContrast);
            screen.EnableInClassList(MissionForge.UI.MfMotion.ReducedClass, ReducedMotion);
            MissionForge.UI.MfMotion.Reduced = ReducedMotion;
            MissionForge.UI.MfGlassPanel.ForceOpaque = HighContrast;
        }
    }
}
