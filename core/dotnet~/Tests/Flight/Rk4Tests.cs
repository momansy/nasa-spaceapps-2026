using MissionForge.Core.Flight;
using Xunit;

namespace MissionForge.Core.Tests.Flight
{
    public class Rk4Tests
    {
        [Fact]
        public void VerticalCoastMatchesClosedFormConstantGravity()
        {
            var state = new FlightState(0, 1000, 0, 100, 10);
            FlightDerivative ConstantGravity(double timeS, FlightState s) =>
                new FlightDerivative(s.VelocityXMs, s.VelocityYMs, 0, -9.80665, 0);
            var timeS = 0.0;
            for (var i = 0; i < 1200; i++)
            {
                state = Rk4Integrator.Step(state, timeS, ConstantGravity);
                timeS += Rk4Integrator.FixedStepS;
            }

            // y = 1000 + 100*10 - .5*9.80665*10² = 1509.6675 m; vy = 1.9335 m/s.
            Assert.Equal(1509.6675, state.PositionYM, 8);
            Assert.Equal(1.9335, state.VelocityYMs, 8);
        }

        [Fact]
        public void TwoPhysicalRunsAreBitIdentical()
        {
            var dynamics = new FlightDynamics(Body.Earth);
            var control = new FlightControl(new EngineModel(760000, 822000, 282, 311), 0.8, 1, 0, 10, 10000);
            var a = new FlightState(Body.Earth.RadiusM + 100, 0, 0, 465, 20000);
            var b = new FlightState(Body.Earth.RadiusM + 100, 0, 0, 465, 20000);
            for (var i = 0; i < 100; i++)
            {
                a = dynamics.Step(a, i * Rk4Integrator.FixedStepS, control);
                b = dynamics.Step(b, i * Rk4Integrator.FixedStepS, control);
            }

            Assert.Equal(a.PositionXM, b.PositionXM);
            Assert.Equal(a.PositionYM, b.PositionYM);
            Assert.Equal(a.VelocityXMs, b.VelocityXMs);
            Assert.Equal(a.VelocityYMs, b.VelocityYMs);
            Assert.Equal(a.MassKg, b.MassKg);
            Assert.True(a.MassKg < 20000);
        }

        [Fact]
        public void RotatingAtmosphereHasNoDragAtCorotation()
        {
            var body = Body.Earth;
            var state = new FlightState(body.RadiusM, 0, 0, body.EquatorRotationSpeedMs, 1000);
            var dynamics = new FlightDynamics(body);
            var coast = new FlightControl(null, 0, 0, 0, 100, 1000);
            var derivative = dynamics.Derivative(0, state, coast);
            Assert.Equal(-body.GravityMs2(body.RadiusM), derivative.AccelerationXMs2, 12);
            Assert.Equal(0, derivative.AccelerationYMs2, 12);
        }

        [Fact]
        public void FinalPoweredStepStopsExactlyAtDryMass()
        {
            var body = new Body(1, 1, 0, 1, 0, 1);
            var dynamics = new FlightDynamics(body);
            var engine = new EngineModel(1000, 1000, 100, 100);
            var control = new FlightControl(engine, 1, 1, 0, 0, 1000);
            var result = dynamics.Step(new FlightState(1000, 0, 0, 1, 1000.001), 0, control);
            Assert.Equal(1000, result.MassKg, 12);
        }
    }
}
