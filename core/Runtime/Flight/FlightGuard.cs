using System;

namespace MissionForge.Core.Flight
{
    internal static class FlightGuard
    {
        internal static void Finite(double value, string name)
        {
            if (double.IsNaN(value) || double.IsInfinity(value))
                throw new ArgumentOutOfRangeException(name, "Must be finite.");
        }

        internal static void Positive(double value, string name)
        {
            Finite(value, name);
            if (value <= 0) throw new ArgumentOutOfRangeException(name, "Must be positive.");
        }

        internal static void Nonnegative(double value, string name)
        {
            Finite(value, name);
            if (value < 0) throw new ArgumentOutOfRangeException(name, "Must be nonnegative.");
        }

        internal static void Range(double value, double minimum, double maximum, string name)
        {
            Finite(value, name);
            if (value < minimum || value > maximum) throw new ArgumentOutOfRangeException(name);
        }
    }
}
