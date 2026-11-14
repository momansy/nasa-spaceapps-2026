using System;

namespace MissionForge.Core.Flight
{
    /// <summary>Classical two-body elements for a state in the two-dimensional orbital plane.</summary>
    public sealed class OrbitalElements
    {
        internal OrbitalElements(double semiMajorAxisM, double eccentricityUnitless, double periapsisRadiusM,
            double apoapsisRadiusM, double periodS, double trueAnomalyRad, double periapsisLongitudeRad,
            double specificEnergyJkg)
        {
            SemiMajorAxisM = semiMajorAxisM;
            EccentricityUnitless = eccentricityUnitless;
            PeriapsisRadiusM = periapsisRadiusM;
            ApoapsisRadiusM = apoapsisRadiusM;
            PeriodS = periodS;
            TrueAnomalyRad = trueAnomalyRad;
            PeriapsisLongitudeRad = periapsisLongitudeRad;
            SpecificEnergyJkg = specificEnergyJkg;
        }

        /// <summary>Semi-major axis in m, negative for a hyperbolic orbit.</summary>
        public double SemiMajorAxisM { get; }
        /// <summary>Orbital eccentricity, dimensionless.</summary>
        public double EccentricityUnitless { get; }
        /// <summary>Periapsis radius from body center in m.</summary>
        public double PeriapsisRadiusM { get; }
        /// <summary>Apoapsis radius in m, positive infinity for an unbound orbit.</summary>
        public double ApoapsisRadiusM { get; }
        /// <summary>Orbital period in s, positive infinity for an unbound orbit.</summary>
        public double PeriodS { get; }
        /// <summary>True anomaly in rad in [0, 2π).</summary>
        public double TrueAnomalyRad { get; }
        /// <summary>Inertial longitude of periapsis in rad.</summary>
        public double PeriapsisLongitudeRad { get; }
        /// <summary>Specific orbital energy in J/kg.</summary>
        public double SpecificEnergyJkg { get; }
    }

    /// <summary>Two-body orbital calculations and analytic elliptic Kepler coast propagation.</summary>
    public static class OrbitalMechanics
    {
        /// <summary>Returns classical planar elements from an inertial state and gravitational parameter in m³/s².</summary>
        public static OrbitalElements Elements(FlightState state, double muM3S2)
        {
            if (state == null) throw new ArgumentNullException(nameof(state));
            FlightGuard.Positive(muM3S2, nameof(muM3S2));
            var r = state.RadiusM;
            if (r <= 0) throw new ArgumentOutOfRangeException(nameof(state), "Position must be outside the body center.");
            var v2 = state.VelocityXMs * state.VelocityXMs + state.VelocityYMs * state.VelocityYMs;
            var rv = state.PositionXM * state.VelocityXMs + state.PositionYM * state.VelocityYMs;
            var energy = 0.5 * v2 - muM3S2 / r;
            if (Math.Abs(energy) < 1e-15) throw new ArgumentOutOfRangeException(nameof(state), "Parabolic state has no finite semi-major axis.");
            var a = -muM3S2 / (2 * energy);
            var ex = ((v2 - muM3S2 / r) * state.PositionXM - rv * state.VelocityXMs) / muM3S2;
            var ey = ((v2 - muM3S2 / r) * state.PositionYM - rv * state.VelocityYMs) / muM3S2;
            var e = Math.Sqrt(ex * ex + ey * ey);
            var periapsis = a * (1 - e);
            var bound = a > 0 && e < 1;
            var apoapsis = bound ? a * (1 + e) : double.PositiveInfinity;
            var period = bound ? 2 * Math.PI * Math.Sqrt(a * a * a / muM3S2) : double.PositiveInfinity;
            double periapsisLongitude;
            double trueAnomaly;
            if (e < 1e-12)
            {
                periapsisLongitude = 0;
                trueAnomaly = NormalizeRad(Math.Atan2(state.PositionYM, state.PositionXM));
            }
            else
            {
                periapsisLongitude = Math.Atan2(ey, ex);
                var dot = (ex * state.PositionXM + ey * state.PositionYM) / (e * r);
                var cross = (ex * state.PositionYM - ey * state.PositionXM) / (e * r);
                trueAnomaly = NormalizeRad(Math.Atan2(cross, Math.Max(-1, Math.Min(1, dot))));
            }

            return new OrbitalElements(a, e, periapsis, apoapsis, period, trueAnomaly, periapsisLongitude, energy);
        }

        /// <summary>Propagates an unpowered bound vacuum coast analytically by elapsed time in s.</summary>
        public static FlightState PropagateElliptic(FlightState state, double muM3S2, double elapsedS)
        {
            FlightGuard.Finite(elapsedS, nameof(elapsedS));
            var elements = Elements(state, muM3S2);
            if (!(elements.SemiMajorAxisM > 0) || !(elements.EccentricityUnitless < 1))
                throw new ArgumentOutOfRangeException(nameof(state), "Analytic coast currently requires a bound elliptic orbit.");
            var a = elements.SemiMajorAxisM;
            var e = elements.EccentricityUnitless;
            var theta = elements.TrueAnomalyRad;
            var eccentricAnomaly = 2 * Math.Atan2(Math.Sqrt(1 - e) * Math.Sin(theta / 2), Math.Sqrt(1 + e) * Math.Cos(theta / 2));
            var meanAnomaly = eccentricAnomaly - e * Math.Sin(eccentricAnomaly);
            var meanMotionRadS = Math.Sqrt(muM3S2 / (a * a * a));
            var targetMeanAnomaly = meanAnomaly + meanMotionRadS * elapsedS;
            var solvedE = SolveEccentricAnomaly(targetMeanAnomaly, e);
            var cosE = Math.Cos(solvedE);
            var sinE = Math.Sin(solvedE);
            var oneMinusE2 = Math.Sqrt(1 - e * e);
            var perifocalXM = a * (cosE - e);
            var perifocalYM = a * oneMinusE2 * sinE;
            var radiusM = a * (1 - e * cosE);
            var speedFactor = Math.Sqrt(muM3S2 * a) / radiusM;
            var perifocalVelocityXMs = -speedFactor * sinE;
            var perifocalVelocityYMs = speedFactor * oneMinusE2 * cosE;
            var cosW = Math.Cos(elements.PeriapsisLongitudeRad);
            var sinW = Math.Sin(elements.PeriapsisLongitudeRad);
            return new FlightState(
                cosW * perifocalXM - sinW * perifocalYM,
                sinW * perifocalXM + cosW * perifocalYM,
                cosW * perifocalVelocityXMs - sinW * perifocalVelocityYMs,
                sinW * perifocalVelocityXMs + cosW * perifocalVelocityYMs,
                state.MassKg);
        }

        /// <summary>Circular orbital speed sqrt(mu/r) in m/s.</summary>
        public static double CircularSpeedMs(double muM3S2, double radiusM)
        {
            FlightGuard.Positive(muM3S2, nameof(muM3S2));
            FlightGuard.Positive(radiusM, nameof(radiusM));
            return Math.Sqrt(muM3S2 / radiusM);
        }

        /// <summary>Escape speed sqrt(2mu/r) in m/s.</summary>
        public static double EscapeSpeedMs(double muM3S2, double radiusM) => Math.Sqrt(2) * CircularSpeedMs(muM3S2, radiusM);

        /// <summary>Total ideal two-impulse Hohmann transfer delta-v in m/s between circular radii in m.</summary>
        public static double HohmannTransferDeltaVMs(double muM3S2, double initialRadiusM, double finalRadiusM)
        {
            FlightGuard.Positive(muM3S2, nameof(muM3S2));
            FlightGuard.Positive(initialRadiusM, nameof(initialRadiusM));
            FlightGuard.Positive(finalRadiusM, nameof(finalRadiusM));
            var aTransferM = 0.5 * (initialRadiusM + finalRadiusM);
            var initialCircularMs = Math.Sqrt(muM3S2 / initialRadiusM);
            var finalCircularMs = Math.Sqrt(muM3S2 / finalRadiusM);
            var transferAtInitialMs = Math.Sqrt(muM3S2 * (2 / initialRadiusM - 1 / aTransferM));
            var transferAtFinalMs = Math.Sqrt(muM3S2 * (2 / finalRadiusM - 1 / aTransferM));
            return Math.Abs(transferAtInitialMs - initialCircularMs) + Math.Abs(finalCircularMs - transferAtFinalMs);
        }

        private static double SolveEccentricAnomaly(double meanAnomalyRad, double e)
        {
            var wrappedM = NormalizeSignedRad(meanAnomalyRad);
            var eccentricAnomaly = e < 0.8 ? wrappedM : Math.PI * Math.Sign(wrappedM == 0 ? 1 : wrappedM);
            for (var i = 0; i < 15; i++)
                eccentricAnomaly -= (eccentricAnomaly - e * Math.Sin(eccentricAnomaly) - wrappedM) / (1 - e * Math.Cos(eccentricAnomaly));
            return eccentricAnomaly;
        }

        private static double NormalizeRad(double angleRad)
        {
            var result = angleRad % (2 * Math.PI);
            return result < 0 ? result + 2 * Math.PI : result;
        }

        private static double NormalizeSignedRad(double angleRad)
        {
            var result = NormalizeRad(angleRad);
            return result > Math.PI ? result - 2 * Math.PI : result;
        }
    }
}
