namespace MissionForge.Core.Flight
{
    /// <summary>Vehicle state in the two-dimensional inertial orbital plane; all fields use SI units.</summary>
    public sealed class FlightState
    {
        /// <summary>Creates a state from position in m, velocity in m/s and mass in kg.</summary>
        public FlightState(double positionXM, double positionYM, double velocityXMs, double velocityYMs, double massKg)
        {
            FlightGuard.Finite(positionXM, nameof(positionXM));
            FlightGuard.Finite(positionYM, nameof(positionYM));
            FlightGuard.Finite(velocityXMs, nameof(velocityXMs));
            FlightGuard.Finite(velocityYMs, nameof(velocityYMs));
            FlightGuard.Positive(massKg, nameof(massKg));
            PositionXM = positionXM;
            PositionYM = positionYM;
            VelocityXMs = velocityXMs;
            VelocityYMs = velocityYMs;
            MassKg = massKg;
        }

        /// <summary>Inertial x position in m.</summary>
        public double PositionXM { get; }
        /// <summary>Inertial y position in m.</summary>
        public double PositionYM { get; }
        /// <summary>Inertial x velocity in m/s.</summary>
        public double VelocityXMs { get; }
        /// <summary>Inertial y velocity in m/s.</summary>
        public double VelocityYMs { get; }
        /// <summary>Vehicle mass in kg.</summary>
        public double MassKg { get; }
        /// <summary>Planet-center distance in m.</summary>
        public double RadiusM => System.Math.Sqrt(PositionXM * PositionXM + PositionYM * PositionYM);
        /// <summary>Inertial speed in m/s.</summary>
        public double SpeedMs => System.Math.Sqrt(VelocityXMs * VelocityXMs + VelocityYMs * VelocityYMs);
    }

    /// <summary>Time derivative of a <see cref="FlightState"/> with explicit SI unit suffixes.</summary>
    public sealed class FlightDerivative
    {
        /// <summary>Creates a derivative from velocity, acceleration and mass rate.</summary>
        public FlightDerivative(double velocityXMs, double velocityYMs, double accelerationXMs2, double accelerationYMs2, double massRateKgS)
        {
            FlightGuard.Finite(velocityXMs, nameof(velocityXMs));
            FlightGuard.Finite(velocityYMs, nameof(velocityYMs));
            FlightGuard.Finite(accelerationXMs2, nameof(accelerationXMs2));
            FlightGuard.Finite(accelerationYMs2, nameof(accelerationYMs2));
            FlightGuard.Finite(massRateKgS, nameof(massRateKgS));
            VelocityXMs = velocityXMs;
            VelocityYMs = velocityYMs;
            AccelerationXMs2 = accelerationXMs2;
            AccelerationYMs2 = accelerationYMs2;
            MassRateKgS = massRateKgS;
        }

        /// <summary>x position derivative in m/s.</summary>
        public double VelocityXMs { get; }
        /// <summary>y position derivative in m/s.</summary>
        public double VelocityYMs { get; }
        /// <summary>x velocity derivative in m/s².</summary>
        public double AccelerationXMs2 { get; }
        /// <summary>y velocity derivative in m/s².</summary>
        public double AccelerationYMs2 { get; }
        /// <summary>Mass derivative in kg/s, normally nonpositive.</summary>
        public double MassRateKgS { get; }
    }

    /// <summary>Deterministic state-derivative function evaluated at time in s.</summary>
    public delegate FlightDerivative FlightDerivativeFunction(double timeS, FlightState state);
}
