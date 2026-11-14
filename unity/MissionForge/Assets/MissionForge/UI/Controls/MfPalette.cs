using UnityEngine;

namespace MissionForge.UI
{
    /// <summary>
    /// Colours used from code. Mirrors the custom properties in MissionForgeTheme.uss
    /// (assets/media/style/STYLE_GUIDE.md, "Palette and accessible status language").
    /// All values are sRGB and are artistic game_value choices, not measured reflectances.
    /// Status colours are always paired with a shape, a border treatment and a label
    /// (design section 14.4); never encode status with hue alone.
    /// </summary>
    public static class MfPalette
    {
        // ---- Style-guide tokens (game_value artistic choices) ----
        /// <summary>#071522 background, title negative space, dark scrims.</summary>
        public static readonly Color Space = new Color32(0x07, 0x15, 0x22, 255);
        /// <summary>#112B40 opaque HUD and phone card surfaces.</summary>
        public static readonly Color Console = new Color32(0x11, 0x2B, 0x40, 255);
        /// <summary>#176887 decorative environment accent. Not for small text or a sole control boundary.</summary>
        public static readonly Color Ocean = new Color32(0x17, 0x68, 0x87, 255);
        /// <summary>#E8EEF0 main UI text and readable silhouettes. Use instead of pure white.</summary>
        public static readonly Color Ceramic = new Color32(0xE8, 0xEE, 0xF0, 255);
        /// <summary>#55C5CD selection and focus. Never signals success on its own.</summary>
        public static readonly Color Signal = new Color32(0x55, 0xC5, 0xCD, 255);
        /// <summary>#FFCE83 sun rims, small practical lights, celebration highlights.</summary>
        public static readonly Color Sunlight = new Color32(0xFF, 0xCE, 0x83, 255);
        /// <summary>#B6C7D3 secondary text on Space or Console.</summary>
        public static readonly Color Muted = new Color32(0xB6, 0xC7, 0xD3, 255);
        /// <summary>#77D6A1 status Meets: check inside circle, solid border, label "Meets".</summary>
        public static readonly Color Meets = new Color32(0x77, 0xD6, 0xA1, 255);
        /// <summary>#FFD166 status Marginal: exclamation inside triangle, notched border, label "Marginal".</summary>
        public static readonly Color Marginal = new Color32(0xFF, 0xD1, 0x66, 255);
        /// <summary>#FF8F8F status Fails: cross inside octagon, heavy/double border, label "Fails".</summary>
        public static readonly Color Fails = new Color32(0xFF, 0x8F, 0x8F, 255);

        /// <summary>#A5B4FC categorical series 3 (VISUAL_TARGET 3.1 proposal; contrast in evidence/T031/contrast.md).</summary>
        public static readonly Color Periwinkle = new Color32(0xA5, 0xB4, 0xFC, 255);
        /// <summary>#F4A6C6 categorical series 4 (VISUAL_TARGET 3.1 proposal; contrast in evidence/T031/contrast.md).</summary>
        public static readonly Color Rose = new Color32(0xF4, 0xA6, 0xC6, 255);
        /// <summary>Data-viz series in order (tokens.json dataviz.series). Each series is also told apart by letter or pattern.</summary>
        public static readonly Color[] Series = { Signal, Sunlight, Periwinkle, Rose };

        /// <summary>Same colour with another alpha.</summary>
        public static Color WithAlpha(Color c, float a) => new Color(c.r, c.g, c.b, a);

        /// <summary>QR modules. Dark = Space; light stays pure white for scanner contrast (never used for text).</summary>
        public static readonly Color32 QrDark = new Color32(0x07, 0x15, 0x22, 255);
        public static readonly Color32 QrLight = new Color32(255, 255, 255, 255);

        // ---- Legacy aliases kept so existing callers compile; prefer the tokens above ----
        public static readonly Color Text = Ceramic;
        public static readonly Color TextDim = Muted;
        public static readonly Color Accent = Signal;
        public static readonly Color Forge = Sunlight;
        public static readonly Color Good = Meets;
        public static readonly Color Warn = Marginal;
        public static readonly Color Bad = Fails;
        public static readonly Color Ink = Space;

        /// <summary>Okabe-Ito categorical palette: distinguishable under common colour-vision deficiencies.
        /// Used for avatar suits only (identity, not status), so it sits outside the style-guide tokens.</summary>
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
