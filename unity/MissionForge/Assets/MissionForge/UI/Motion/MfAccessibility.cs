using System;
using UnityEngine;
using UnityEngine.UIElements;

namespace MissionForge.UI
{
    /// <summary>
    /// Host-wide accessibility modes of the design system: right-to-left (.mf-rtl), 200 % text (.mf-text-200),
    /// high contrast (.mf-hc: opaque panels, no imagery behind text) and reduced motion (.mf-reduced-motion). The classes
    /// go on every UIDocument root so every sheet reacts. The settings screen (later task) calls <see cref="Set"/>;
    /// for demos and evidence the flags -mfRtl, -mfText200, -mfHighContrast and -mfReducedMotion (or ?mfRtl in WebGL)
    /// switch them on at start-up.
    /// </summary>
    public static class MfAccessibility
    {
        public const string RtlClass = "mf-rtl";
        public const string Text200Class = "mf-text-200";
        public const string HighContrastClass = "mf-hc";

        public static bool RightToLeft { get; private set; }
        public static bool Text200 { get; private set; }
        public static bool HighContrast { get; private set; }

        public static event Action Changed;

        public static void Set(bool rtl, bool text200, bool highContrast, bool reducedMotion)
        {
            RightToLeft = rtl;
            Text200 = text200;
            HighContrast = highContrast;
            MfMotion.Reduced = reducedMotion;
            MfGlassPanel.ForceOpaque = highContrast;
            ApplyToAll();
            Changed?.Invoke();
        }

        /// <summary>Applies the current modes to one panel root (call when a UIDocument is (re)created).</summary>
        public static void ApplyTo(VisualElement root)
        {
            if (root == null) return;
            root.EnableInClassList(RtlClass, RightToLeft);
            root.EnableInClassList(Text200Class, Text200);
            root.EnableInClassList(HighContrastClass, HighContrast);
            MfMotion.ApplyTo(root);
        }

        public static void ApplyToAll()
        {
            foreach (UIDocument doc in UnityEngine.Object.FindObjectsByType<UIDocument>(FindObjectsInactive.Exclude))
            {
                ApplyTo(doc.rootVisualElement);
            }
        }

        public static bool AnyActive => RightToLeft || Text200 || HighContrast || MfMotion.Reduced;

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
        private static void FromCommandLine()
        {
            bool rtl = Flag("-mfRtl"), t200 = Flag("-mfText200"), hc = Flag("-mfHighContrast"), rm = Flag("-mfReducedMotion");
            if (!(rtl || t200 || hc || rm)) return;
            Set(rtl, t200, hc, rm);
            // Screens load additively after start-up: keep re-applying to new documents.
            var go = new GameObject("MfAccessibility") { hideFlags = HideFlags.HideAndDontSave };
            UnityEngine.Object.DontDestroyOnLoad(go);
            go.AddComponent<Reapplier>();
        }

        private static bool Flag(string name)
        {
            if (Array.IndexOf(Environment.GetCommandLineArgs(), name) >= 0) return true;
            string url = Application.absoluteURL ?? "";
            return url.Contains("?" + name.TrimStart('-')) || url.Contains("&" + name.TrimStart('-'));
        }

        private sealed class Reapplier : MonoBehaviour
        {
            private float _next;

            private void Update()
            {
                if (Time.unscaledTime < _next) return;
                _next = Time.unscaledTime + 0.25f;
                ApplyToAll();
            }
        }
    }
}
