using System;
using MissionForge.UI;
using UnityEngine;
using UnityEngine.SceneManagement;

namespace MissionForge.Settings
{
    /// <summary>
    /// Applies <see cref="HostPreferences"/> to the running host without touching any other screen: the design system's
    /// root classes (.mf-rtl, .mf-text-200, .mf-hc, .mf-reduced-motion) go on every UIDocument root through
    /// <see cref="MfAccessibility"/>, again on every scene that loads, and the master volume drives the AudioListener.
    /// The evidence flags (-mfRtl, -mfText200, -mfHighContrast, -mfReducedMotion) win at start-up.
    /// </summary>
    public static class HostPreferencesRuntime
    {
        private static bool _hooked;

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
        private static void Boot()
        {
            HostPreferences prefs = HostPreferences.Current;
            Hook(prefs);
            // The -mf* evidence flags win at start-up, in the editor and development builds only.
            if (!HasEvidenceFlags() && !prefs.IsDefault) Apply(prefs);
        }

        /// <summary>Subscribes to a (new) preferences instance so changes apply at once.</summary>
        public static void Hook(HostPreferences prefs)
        {
            if (prefs == null) return;
            prefs.Changed -= Apply;
            prefs.Changed += Apply;
            if (_hooked) return;
            _hooked = true;
            SceneManager.sceneLoaded += (_, __) => MfAccessibility.ApplyToAll();
        }

        public static void Apply(HostPreferences prefs)
        {
            if (prefs == null) return;
            MfAccessibility.Set(prefs.RightToLeft, prefs.LargeText, prefs.HighContrast, prefs.ReducedMotion);
            AudioListener.volume = prefs.MasterVolume;
        }

        private static bool HasEvidenceFlags()
        {
            if (!Application.isEditor && !Debug.isDebugBuild) return false;
            string[] args = Environment.GetCommandLineArgs();
            foreach (string flag in new[] { "-mfRtl", "-mfText200", "-mfHighContrast", "-mfReducedMotion" })
            {
                if (Array.IndexOf(args, flag) >= 0) return true;
            }
            return false;
        }
    }
}
