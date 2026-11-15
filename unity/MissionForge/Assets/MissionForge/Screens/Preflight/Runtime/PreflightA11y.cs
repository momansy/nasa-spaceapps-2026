using System;
using MissionForge.Net;
using UnityEngine.UIElements;

namespace MissionForge.Screens.Preflight
{
    /// <summary>
    /// Accessibility state of the pre-flight screens (design 16): right-to-left, 200 % text, high contrast, reduced motion.
    /// Sources, later ones win: room settings (language and a11y flags), then command-line overrides
    /// (<c>-mfRtl -mfText200 -mfHighContrast -mfReducedMotion</c>) used for evidence and demos.
    /// </summary>
    public sealed class PreflightA11y
    {
        public bool RightToLeft;
        public bool Text200;
        public bool HighContrast;
        public bool ReducedMotion;

        public event Action Changed;

        public void FromRoom(RoomSettingsDto settings)
        {
            if (settings != null)
            {
                RightToLeft = MissionForge.Screens.BuildBay.BayAccessibility.IsRtlLanguage(settings.Lang);
                if (settings.A11y != null)
                {
                    HighContrast = settings.A11y.HighContrast;
                    ReducedMotion = settings.A11y.ReducedMotion;
                }
            }
            ApplyCommandLine();
            Changed?.Invoke();
        }

        public void ApplyCommandLine()
        {
            if (PreflightArgs.Flag("-mfRtl")) RightToLeft = true;
            if (PreflightArgs.Flag("-mfText200")) Text200 = true;
            if (PreflightArgs.Flag("-mfHighContrast")) HighContrast = true;
            if (PreflightArgs.Flag("-mfReducedMotion")) ReducedMotion = true;
        }

        /// <summary>Marks the screen element with the shared design-system modes plus the pre-flight ones.</summary>
        public void ApplyTo(VisualElement screen)
        {
            if (screen == null) return;
            screen.EnableInClassList("mf-rtl", RightToLeft);
            screen.EnableInClassList("mf-text-200", Text200);
            screen.EnableInClassList("mf-hc", HighContrast);
            screen.EnableInClassList(MissionForge.UI.MfMotion.ReducedClass, ReducedMotion);
            MissionForge.UI.MfMotion.Reduced = ReducedMotion;
            MissionForge.UI.MfGlassPanel.ForceOpaque = HighContrast;
        }
    }

    /// <summary>Command-line (editor, standalone) or page-URL (WebGL) arguments for demos, rehearsal and evidence.</summary>
    public static class PreflightArgs
    {
        public static string Value(string name)
        {
            string[] args = Environment.GetCommandLineArgs();
            for (int i = 0; i < args.Length - 1; i++) if (args[i] == name) return args[i + 1];
            return Query(name);
        }

        public static bool Flag(string name) => Array.IndexOf(Environment.GetCommandLineArgs(), name) >= 0 || Query(name) != null;

        public static float Float(string name, float fallback) =>
            float.TryParse(Value(name), System.Globalization.NumberStyles.Float, System.Globalization.CultureInfo.InvariantCulture, out float v) ? v : fallback;

        private static string Query(string name)
        {
#if UNITY_WEBGL && !UNITY_EDITOR
            string url = UnityEngine.Application.absoluteURL ?? "";
            int q = url.IndexOf('?');
            if (q < 0) return null;
            string key = name.TrimStart('-');
            foreach (string pair in url.Substring(q + 1).Split('&'))
            {
                string[] kv = pair.Split('=');
                if (kv[0] == key) return kv.Length > 1 ? Uri.UnescapeDataString(kv[1]) : "";
            }
#endif
            return null;
        }
    }
}
