using System;
using System.Globalization;

namespace MissionForge.Screens.Flight
{
    /// <summary>
    /// Display conversions for the flight HUD (design 9.6). Pure functions, SI in, display unit out; every HUD number
    /// goes through here so it always carries a unit. Rounding choices are presentation (game_value), not physics.
    /// </summary>
    public static class FlightUnits
    {
        public const double StandardGravityMs2 = 9.80665; // physical (CGPM 1901)

        public static double MetresToKm(double m) => m / 1000.0;
        public static double PascalToKpa(double pa) => pa / 1000.0;
        public static double RadToDeg(double rad) => rad * 180.0 / Math.PI;
        public static double FractionToPercent(double f) => f * 100.0;

        private static readonly CultureInfo Inv = CultureInfo.InvariantCulture;

        /// <summary>Altitude: metres below 10 km ("850 m"), then km with one decimal ("402.3 km").</summary>
        public static (string value, string unit) Altitude(double m)
        {
            if (double.IsNaN(m)) return ("–", "km");
            if (Math.Abs(m) < 10000) return (Math.Round(m).ToString("0", Inv), "m");
            return (MetresToKm(m).ToString("0.0", Inv), "km");
        }

        /// <summary>Speed in m/s, no decimals, thousands separated with a thin space.</summary>
        public static (string value, string unit) Speed(double ms) => (Grouped(Math.Round(ms)), "m/s");

        public static (string value, string unit) VerticalSpeed(double ms) => (Signed(Math.Round(ms)), "m/s");

        public static (string value, string unit) DynamicPressure(double pa) => (PascalToKpa(pa).ToString("0.0", Inv), "kPa");

        public static (string value, string unit) GLoad(double g) => (g.ToString("0.0", Inv), "g");

        public static (string value, string unit) Percent(double fraction01) =>
            (Math.Round(FractionToPercent(Math.Max(0, fraction01))).ToString("0", Inv), "%");

        public static (string value, string unit) Degrees(double rad) => (RadToDeg(rad).ToString("0.0", Inv), "°");

        /// <summary>Apsis altitude in km, or "—" when Core reports it undefined.</summary>
        public static (string value, string unit) Apsis(double m)
        {
            if (double.IsNaN(m) || double.IsInfinity(m)) return ("—", "km");
            return (Grouped(Math.Round(MetresToKm(m))), "km");
        }

        /// <summary>Mission clock: "T−00:10" before lift-off, "T+01:02" after (U+2212 minus).</summary>
        public static string MissionClock(double metS)
        {
            string sign = metS < 0 ? "T−" : "T+";
            double a = Math.Abs(metS);
            if (metS < 0) a = Math.Ceiling(a - 1e-9);
            int total = (int)Math.Floor(a);
            int h = total / 3600, m = total / 60 % 60, s = total % 60;
            return h > 0
                ? sign + h.ToString("00", Inv) + ":" + m.ToString("00", Inv) + ":" + s.ToString("00", Inv)
                : sign + m.ToString("00", Inv) + ":" + s.ToString("00", Inv);
        }

        /// <summary>Whole number with a thin-space thousands separator ("7 812").</summary>
        public static string Grouped(double v)
        {
            string s = Math.Abs(v).ToString("#,0", Inv).Replace(",", " ");
            return v < 0 ? "−" + s : s;
        }

        public static string Signed(double v)
        {
            if (v > 0) return "+" + Grouped(v);
            return Grouped(v);
        }
    }
}
