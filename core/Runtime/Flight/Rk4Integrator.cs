using System;

namespace MissionForge.Core.Flight
{
    /// <summary>Classical fixed-step RK4 for powered and atmospheric flight (design section 8.2).</summary>
    public static class Rk4Integrator
    {
        /// <summary>Fixed simulation step in s, exactly 1/120.</summary>
        public const double FixedStepS = 1.0 / 120.0;

        /// <summary>Advances one fixed 1/120 s step from time in s using a deterministic derivative.</summary>
        public static FlightState Step(FlightState state, double timeS, FlightDerivativeFunction derivative)
        {
            if (state == null) throw new ArgumentNullException(nameof(state));
            if (derivative == null) throw new ArgumentNullException(nameof(derivative));
            FlightGuard.Finite(timeS, nameof(timeS));
            var h = FixedStepS;
            var k1 = derivative(timeS, state);
            var k2 = derivative(timeS + h * 0.5, Add(state, k1, h * 0.5));
            var k3 = derivative(timeS + h * 0.5, Add(state, k2, h * 0.5));
            var k4 = derivative(timeS + h, Add(state, k3, h));
            return new FlightState(
                state.PositionXM + h / 6.0 * (k1.VelocityXMs + 2 * k2.VelocityXMs + 2 * k3.VelocityXMs + k4.VelocityXMs),
                state.PositionYM + h / 6.0 * (k1.VelocityYMs + 2 * k2.VelocityYMs + 2 * k3.VelocityYMs + k4.VelocityYMs),
                state.VelocityXMs + h / 6.0 * (k1.AccelerationXMs2 + 2 * k2.AccelerationXMs2 + 2 * k3.AccelerationXMs2 + k4.AccelerationXMs2),
                state.VelocityYMs + h / 6.0 * (k1.AccelerationYMs2 + 2 * k2.AccelerationYMs2 + 2 * k3.AccelerationYMs2 + k4.AccelerationYMs2),
                state.MassKg + h / 6.0 * (k1.MassRateKgS + 2 * k2.MassRateKgS + 2 * k3.MassRateKgS + k4.MassRateKgS));
        }

        private static FlightState Add(FlightState state, FlightDerivative derivative, double stepS) => new FlightState(
            state.PositionXM + derivative.VelocityXMs * stepS,
            state.PositionYM + derivative.VelocityYMs * stepS,
            state.VelocityXMs + derivative.AccelerationXMs2 * stepS,
            state.VelocityYMs + derivative.AccelerationYMs2 * stepS,
            state.MassKg + derivative.MassRateKgS * stepS);
    }
}
