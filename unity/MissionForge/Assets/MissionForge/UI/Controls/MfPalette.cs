using UnityEngine;

namespace MissionForge.UI
{
    /// <summary>
    /// Colours used from code. Mirrors the custom properties in MissionForgeTheme.uss.
    /// Status colours are always paired with an icon (design section 14.4).
    /// </summary>
    public static class MfPalette
    {
        public static readonly Color Text = new Color32(236, 242, 252, 255);
        public static readonly Color TextDim = new Color32(160, 176, 202, 255);
        public static readonly Color Accent = new Color32(92, 200, 255, 255);
        public static readonly Color Forge = new Color32(255, 138, 61, 255);
        public static readonly Color Good = new Color32(53, 208, 165, 255);
        public static readonly Color Warn = new Color32(255, 197, 61, 255);
        public static readonly Color Bad = new Color32(255, 93, 115, 255);
        public static readonly Color Ink = new Color32(8, 13, 24, 255);

        /// <summary>Okabe-Ito categorical palette: distinguishable under common colour-vision deficiencies.</summary>
        public static readonly Color[] Categorical =
        {
            new Color32(230, 159, 0, 255),
            new Color32(86, 180, 233, 255),
            new Color32(0, 158, 115, 255),
            new Color32(240, 228, 66, 255),
            new Color32(0, 114, 178, 255),
            new Color32(213, 94, 0, 255),
            new Color32(204, 121, 167, 255),
            new Color32(196, 204, 220, 255),
        };

        /// <summary>Stable (process-independent) hash so the same avatar id always gets the same colour.</summary>
        public static int StableHash(string text)
        {
            unchecked
            {
                uint hash = 2166136261;
                if (text != null)
                {
                    foreach (char c in text)
                    {
                        hash ^= c;
                        hash *= 16777619;
                    }
                }
                return (int)(hash & 0x7fffffff);
            }
        }

        public static Color CategoricalFor(string key) => Categorical[StableHash(key) % Categorical.Length];
    }
}
