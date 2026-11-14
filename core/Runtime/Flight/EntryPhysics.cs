using System;

namespace MissionForge.Core.Flight
{
    /// <summary>Atmospheric-entry heating and crew-load calculations in SI units (design section 8.2).</summary>
    public static class EntryPhysics
    {
        /// <summary>Earth Sutton–Graves coefficient in SI, approximately 1.74e-4 (physical empirical value).</summary>
        public const double EarthSuttonGravesCoefficientKgSqrtPerM = 1.74e-4;

        /// <summary>Sutton–Graves convective heat flux in W/m²: k sqrt(rho/rn) v³.</summary>
        public static double HeatFluxWm2(double densityKgM3, double noseRadiusM, double airSpeedMs,
            double coefficientKgSqrtPerM = EarthSuttonGravesCoefficientKgSqrtPerM)
        {
            FlightGuard.Nonnegative(densityKgM3, nameof(densityKgM3));
            FlightGuard.Positive(noseRadiusM, nameof(noseRadiusM));
            FlightGuard.Nonnegative(airSpeedMs, nameof(airSpeedMs));
            FlightGuard.Nonnegative(coefficientKgSqrtPerM, nameof(coefficientKgSqrtPerM));
            return coefficientKgSqrtPerM * Math.Sqrt(densityKgM3 / noseRadiusM) * airSpeedMs * airSpeedMs * airSpeedMs;
        }

        /// <summary>Advances integrated heat load in J/m² with trapezoidal integration over elapsed time in s.</summary>
        public static double IntegrateHeatLoadJm2(double currentHeatLoadJm2, double previousHeatFluxWm2,
            double currentHeatFluxWm2, double elapsedS)
        {
            FlightGuard.Nonnegative(currentHeatLoadJm2, nameof(currentHeatLoadJm2));
            FlightGuard.Nonnegative(previousHeatFluxWm2, nameof(previousHeatFluxWm2));
            FlightGuard.Nonnegative(currentHeatFluxWm2, nameof(currentHeatFluxWm2));
            FlightGuard.Nonnegative(elapsedS, nameof(elapsedS));
            return currentHeatLoadJm2 + 0.5 * (previousHeatFluxWm2 + currentHeatFluxWm2) * elapsedS;
        }

        /// <summary>Dimensionless g-load from non-gravitational acceleration components in m/s².</summary>
        public static double GLoadUnitless(double nonGravitationalAccelerationXMs2, double nonGravitationalAccelerationYMs2)
        {
            FlightGuard.Finite(nonGravitationalAccelerationXMs2, nameof(nonGravitationalAccelerationXMs2));
            FlightGuard.Finite(nonGravitationalAccelerationYMs2, nameof(nonGravitationalAccelerationYMs2));
            return Math.Sqrt(nonGravitationalAccelerationXMs2 * nonGravitationalAccelerationXMs2 +
                nonGravitationalAccelerationYMs2 * nonGravitationalAccelerationYMs2) / PhysicalConstants.StandardGravityMs2;
        }

        /// <summary>Flight-path angle in rad, positive outward from the local horizontal, in [-π/2, π/2].</summary>
        public static double FlightPathAngleRad(FlightState state)
        {
            if (state == null) throw new ArgumentNullException(nameof(state));
            var r = state.RadiusM;
            var radialVelocityMs = (state.PositionXM * state.VelocityXMs + state.PositionYM * state.VelocityYMs) / r;
            var tangentialVelocityMs = (state.PositionXM * state.VelocityYMs - state.PositionYM * state.VelocityXMs) / r;
            return Math.Atan2(radialVelocityMs, Math.Abs(tangentialVelocityMs));
        }
    }
}
