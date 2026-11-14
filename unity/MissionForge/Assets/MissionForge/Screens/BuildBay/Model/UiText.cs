using System;
using System.Collections.Generic;
using System.Globalization;

namespace MissionForge.Screens.BuildBay
{
    /// <summary>
    /// Player-visible text for the Build Bay: every label comes from <c>data/strings/en*.json</c> by key, numbers are
    /// formatted here with tabular-friendly invariant formats, a true minus sign (U+2212) and a unit.
    /// </summary>
    public sealed class UiText
    {
        public const char Minus = '−';

        private readonly Func<string, string> _lookup;

        public UiText(Func<string, string> lookup)
        {
            _lookup = lookup ?? throw new ArgumentNullException(nameof(lookup));
        }

        /// <summary>From a flat key › text table (Core's <c>GameCatalog.Strings</c> or the data service's merge).</summary>
        public static UiText From(IReadOnlyDictionary<string, string> table) =>
            new UiText(key => table != null && table.TryGetValue(key, out string text) ? text : null);

        /// <summary>The text for <paramref name="key"/>, or the key in brackets so a missing string is visible.</summary>
        public string Get(string key) => GlyphSafe(_lookup(key) ?? "[" + key + "]");

        /// <summary>
        /// The bundled UI fonts (IBM Plex Sans / Mono and Oxanium Latin subsets in UI/Fonts) have no Greek capital
        /// delta and Plex Sans has no right arrow; a WebGL build has no system fallback, so these would render as
        /// missing-glyph boxes. They are spelled out for display. Follow-up: a font subset with Greek (UI owner).
        /// </summary>
        public static string GlyphSafe(string text)
        {
            if (string.IsNullOrEmpty(text) || (text.IndexOf('\u0394') < 0 && text.IndexOf('\u2192') < 0)) return text;
            return text.Replace("\u0394v", "delta-v").Replace("\u0394", "delta ").Replace("\u2192", "\u203A");
        }

        public bool Has(string key) => _lookup(key) != null;

        public string Format(string key, params object[] args) =>
            string.Format(CultureInfo.InvariantCulture, Get(key), args);

        // ---------------------------------------------------------------- numbers

        public static string Number(double value, int decimals)
        {
            string s = Math.Abs(value).ToString("#,0." + new string('0', Math.Max(0, decimals)), CultureInfo.InvariantCulture);
            if (decimals <= 0) s = Math.Abs(value).ToString("#,0", CultureInfo.InvariantCulture);
            bool negative = Math.Round(value, Math.Max(0, decimals)) < 0;
            return negative ? Minus + s : s;
        }

        /// <summary>Signed number for deltas: "+1.2", "−0.4", "±0".</summary>
        public static string Signed(double value, int decimals)
        {
            double rounded = Math.Round(value, Math.Max(0, decimals));
            if (rounded == 0) return "±0";
            return (rounded > 0 ? "+" : "") + Number(value, decimals);
        }

        public string WithUnit(string number, string unitKey) => number + " " + Get(unitKey);
    }
}
