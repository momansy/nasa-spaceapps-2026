using System.Globalization;

namespace MissionForge.UI
{
    /// <summary>
    /// Number and unit typography (VISUAL_TARGET 3.1): units at 70 % size in Muted after a thin space, sharing the
    /// number's baseline (rich text keeps them on one line box), and a true minus sign (U+2212) for negatives.
    /// </summary>
    public static class MfText
    {
        public const char ThinSpace = ' ';
        public const char Minus = '−';
        /// <summary>Muted #B6C7D3 as a rich-text colour (tokens.json color.muted).</summary>
        public const string MutedHex = "#B6C7D3";

        /// <summary>"9,718<size=70%><color=#B6C7D3> m/s</color></size>" (thin space, unit at 70 % in Muted).</summary>
        public static string WithUnit(string value, string unit)
        {
            if (string.IsNullOrEmpty(unit)) return TrueMinus(value);
            return TrueMinus(value) + "<size=70%><color=" + MutedHex + ">" + ThinSpace + Escape(unit) + "</color></size>";
        }

        /// <summary>Replaces a leading ASCII hyphen-minus (and "−" lookalikes in "+/-") with U+2212.</summary>
        public static string TrueMinus(string value)
        {
            if (string.IsNullOrEmpty(value)) return value;
            if (value[0] == '-') return Minus + value.Substring(1);
            return value.Replace(" -", " " + Minus);
        }

        /// <summary>Signed number with a true minus and an explicit plus, invariant digits with group separators.</summary>
        public static string Signed(double v, int decimals)
        {
            string body = System.Math.Abs(v).ToString("N" + decimals, CultureInfo.InvariantCulture);
            if (System.Math.Round(v, decimals) == 0) return body;
            return (v > 0 ? "+" : Minus.ToString()) + body;
        }

        /// <summary>Rich-text tags in player names or strings must not render as markup.</summary>
        public static string Escape(string text) => string.IsNullOrEmpty(text) ? text : text.Replace("<", "<​");
    }
}
