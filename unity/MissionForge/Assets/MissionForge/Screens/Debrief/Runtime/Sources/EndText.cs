using System;
using System.Globalization;

namespace MissionForge.EndScreens.Sources
{
    /// <summary>
    /// String-table access and number formatting for the end screens. Text comes from data/strings through the lookup the
    /// screen passes in (GameStrings.Get); numbers are formatted here and never computed.
    /// </summary>
    public sealed class EndText
    {
        private readonly Func<string, string> _lookup;

        public EndText(Func<string, string> lookup)
        {
            _lookup = lookup ?? (k => "[" + k + "]");
        }

        /// <summary>The text of <paramref name="key"/> (the table shows "[key]" for a missing key).</summary>
        public string this[string key] => string.IsNullOrEmpty(key) ? "" : _lookup(key);

        public string Format(string key, params object[] args) => string.Format(CultureInfo.InvariantCulture, this[key], args);

        /// <summary>Whole points with thousands separators: 8172 → "8,172".</summary>
        public static string Points(double points) => Math.Round(points, MidpointRounding.AwayFromZero).ToString("N0", CultureInfo.InvariantCulture);

        /// <summary>Multiplier with two decimals: 1.25 → "×1.25".</summary>
        public static string Multiplier(double value) => "×" + value.ToString("0.00", CultureInfo.InvariantCulture);

        /// <summary>Seconds with one decimal when needed: 74.2 → "74.2", 90 → "90".</summary>
        public static string Seconds(double s) => s.ToString("0.#", CultureInfo.InvariantCulture);

        /// <summary>Generic number with up to <paramref name="decimals"/> decimals.</summary>
        public static string Number(double v, int decimals) => v.ToString("N" + decimals, CultureInfo.InvariantCulture);
    }
}
