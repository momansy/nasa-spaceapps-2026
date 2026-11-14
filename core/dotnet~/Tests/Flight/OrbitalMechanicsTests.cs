using System;
using MissionForge.Core.Flight;
using Xunit;

namespace MissionForge.Core.Tests.Flight
{
    public class OrbitalMechanicsTests
    {
        [Fact]
        public void CircularOrbitAt400KmMatchesTextbookValues()
        {
            var r = Body.Earth.RadiusM + 400_000;
            var v = OrbitalMechanics.CircularSpeedMs(Body.Earth.MuM3S2, r);
            var state = new FlightState(r, 0, 0, v, 1000);
            var elements = OrbitalMechanics.Elements(state, Body.Earth.MuM3S2);
            // sqrt(3.986e14 / 6.771e6) = 7672.59 m/s; T = 2π sqrt(r³/mu) = 5544.9 s = 92.42 min.
            Assert.InRange(v, 7672, 7673);
            Assert.InRange(elements.PeriodS / 60, 92.4, 92.5);
            Assert.Equal(r, elements.PeriapsisRadiusM, 5);
            Assert.Equal(r, elements.ApoapsisRadiusM, 5);
            Assert.True(elements.EccentricityUnitless < 1e-12);
            Assert.Equal(Math.Sqrt(2) * v, OrbitalMechanics.EscapeSpeedMs(Body.Earth.MuM3S2, r), 9);
        }

        [Fact]
        public void KeplerFullPeriodReturnsToInitialState()
        {
            var r = Body.Earth.RadiusM + 400_000;
            var state = new FlightState(r, 0, 0, OrbitalMechanics.CircularSpeedMs(Body.Earth.MuM3S2, r), 1000);
            var period = OrbitalMechanics.Elements(state, Body.Earth.MuM3S2).PeriodS;
            var result = OrbitalMechanics.PropagateElliptic(state, Body.Earth.MuM3S2, period);
            Assert.InRange(Math.Abs(result.PositionXM - state.PositionXM), 0, 1e-6);
            Assert.InRange(Math.Abs(result.PositionYM - state.PositionYM), 0, 1e-6);
            Assert.InRange(Math.Abs(result.VelocityXMs - state.VelocityXMs), 0, 1e-9);
            Assert.InRange(Math.Abs(result.VelocityYMs - state.VelocityYMs), 0, 1e-9);
        }

        [Fact]
        public void Rk4TracksKeplerAcrossOneOrbitAndConservesEnergy()
        {
            var mu = Body.Earth.MuM3S2;
            var r = Body.Earth.RadiusM + 400_000;
            var initial = new FlightState(r, 0, 0, OrbitalMechanics.CircularSpeedMs(mu, r), 1000);
            var period = OrbitalMechanics.Elements(initial, mu).PeriodS;
            var steps = (int)Math.Round(period / Rk4Integrator.FixedStepS);
            var elapsed = steps * Rk4Integrator.FixedStepS;
            var integrated = initial;
            FlightDerivative Gravity(double timeS, FlightState s)
            {
                var radius = s.RadiusM;
                var factor = -mu / (radius * radius * radius);
                return new FlightDerivative(s.VelocityXMs, s.VelocityYMs, factor * s.PositionXM, factor * s.PositionYM, 0);
            }
            for (var i = 0; i < steps; i++) integrated = Rk4Integrator.Step(integrated, i * Rk4Integrator.FixedStepS, Gravity);
            var analytic = OrbitalMechanics.PropagateElliptic(initial, mu, elapsed);
            var positionErrorM = Math.Sqrt(Math.Pow(integrated.PositionXM - analytic.PositionXM, 2) + Math.Pow(integrated.PositionYM - analytic.PositionYM, 2));
            var e0 = OrbitalMechanics.Elements(initial, mu).SpecificEnergyJkg;
            var e1 = OrbitalMechanics.Elements(integrated, mu).SpecificEnergyJkg;
            Assert.InRange(positionErrorM, 0, 0.1); // stated switch tolerance: 0.1 m over one 400 km orbit.
            Assert.InRange(Math.Abs((e1 - e0) / e0), 0, 1e-10);
        }

        [Fact]
        public void HohmannLeoToGeoMatchesTextbookDeltaV()
        {
            var leoM = Body.Earth.RadiusM + 400_000;
            var geoM = 42_164_000.0;
            // Standard two-impulse ideal LEO-to-GEO transfer is about 3.85 km/s.
            var deltaVMs = OrbitalMechanics.HohmannTransferDeltaVMs(Body.Earth.MuM3S2, leoM, geoM);
            Assert.InRange(deltaVMs, 3840, 3860);
        }
    }
}
