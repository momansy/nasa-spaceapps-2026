namespace MissionForge.Core.Flight
{
    /// <summary>Sea-level and vacuum engine performance with isothermal pressure interpolation (design section 8.2).</summary>
    public sealed class EngineModel
    {
        /// <summary>Creates an engine model from sea-level/vacuum thrust in N and specific impulse in s.</summary>
        public EngineModel(double thrustSlN, double thrustVacN, double ispSlS, double ispVacS)
        {
            FlightGuard.Nonnegative(thrustSlN, nameof(thrustSlN));
            FlightGuard.Nonnegative(thrustVacN, nameof(thrustVacN));
            FlightGuard.Positive(ispSlS, nameof(ispSlS));
            FlightGuard.Positive(ispVacS, nameof(ispVacS));
            if (thrustVacN < thrustSlN) throw new System.ArgumentOutOfRangeException(nameof(thrustVacN));
            if (ispVacS < ispSlS) throw new System.ArgumentOutOfRangeException(nameof(ispVacS));
            ThrustSlN = thrustSlN;
            ThrustVacN = thrustVacN;
            IspSlS = ispSlS;
            IspVacS = ispVacS;
        }

        /// <summary>Sea-level thrust in N.</summary>
        public double ThrustSlN { get; }
        /// <summary>Vacuum thrust in N.</summary>
        public double ThrustVacN { get; }
        /// <summary>Sea-level specific impulse in s.</summary>
        public double IspSlS { get; }
        /// <summary>Vacuum specific impulse in s.</summary>
        public double IspVacS { get; }

        /// <summary>Thrust in N at dimensionless pressure ratio p/p0, clamped to [0,1].</summary>
        public double ThrustN(double pressureRatioUnitless) => Interpolate(ThrustSlN, ThrustVacN, pressureRatioUnitless);

        /// <summary>Specific impulse in s at dimensionless pressure ratio p/p0, clamped to [0,1].</summary>
        public double IspS(double pressureRatioUnitless) => Interpolate(IspSlS, IspVacS, pressureRatioUnitless);

        /// <summary>Mass flow in kg/s at dimensionless pressure ratio p/p0.</summary>
        public double MassFlowKgS(double pressureRatioUnitless)
        {
            var thrustN = ThrustN(pressureRatioUnitless);
            return thrustN / (IspS(pressureRatioUnitless) * PhysicalConstants.StandardGravityMs2);
        }

        private static double Interpolate(double seaLevel, double vacuum, double pressureRatioUnitless)
        {
            FlightGuard.Finite(pressureRatioUnitless, nameof(pressureRatioUnitless));
            var p = System.Math.Max(0.0, System.Math.Min(1.0, pressureRatioUnitless));
            return vacuum - (vacuum - seaLevel) * p;
        }
    }
}
