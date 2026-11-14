using System;

namespace MissionForge.Core.Flight
{
    /// <summary>Scalar aerodynamic calculations in SI units (design section 8.2).</summary>
    public static class Aerodynamics
    {
        // game_value table: a deliberately broad transonic peak for readable Max-Q gameplay.
        private static readonly double[] MachPoints = { 0.0, 0.8, 1.0, 1.2, 2.0, 5.0 };
        private static readonly double[] CdPoints = { 0.20, 0.25, 0.50, 0.40, 0.30, 0.22 };

        /// <summary>Drag coefficient (dimensionless) from the game-value Mach table, linearly interpolated and endpoint-clamped.</summary>
        public static double DragCoefficientUnitless(double machUnitless)
        {
            FlightGuard.Nonnegative(machUnitless, nameof(machUnitless));
            for (var i = 1; i < MachPoints.Length; i++)
            {
                if (machUnitless <= MachPoints[i])
                {
                    var t = (machUnitless - MachPoints[i - 1]) / (MachPoints[i] - MachPoints[i - 1]);
                    return CdPoints[i - 1] + t * (CdPoints[i] - CdPoints[i - 1]);
                }
            }

            return CdPoints[CdPoints.Length - 1];
        }

        /// <summary>Dynamic pressure q = 1/2 rho v² in Pa for density in kg/m³ and air-relative speed in m/s.</summary>
        public static double DynamicPressurePa(double densityKgM3, double airSpeedMs)
        {
            FlightGuard.Nonnegative(densityKgM3, nameof(densityKgM3));
            FlightGuard.Nonnegative(airSpeedMs, nameof(airSpeedMs));
            return 0.5 * densityKgM3 * airSpeedMs * airSpeedMs;
        }

        /// <summary>Drag magnitude D = q Cd A in N for reference area in m².</summary>
        public static double DragN(double densityKgM3, double airSpeedMs, double dragCoefficientUnitless, double referenceAreaM2)
        {
            FlightGuard.Nonnegative(dragCoefficientUnitless, nameof(dragCoefficientUnitless));
            FlightGuard.Nonnegative(referenceAreaM2, nameof(referenceAreaM2));
            return DynamicPressurePa(densityKgM3, airSpeedMs) * dragCoefficientUnitless * referenceAreaM2;
        }
    }
}
