using System;
using MissionForge.Core.Flight;
using Xunit;

namespace MissionForge.Core.Tests.Flight
{
    public class EntryPhysicsTests
    {
        [Fact]
        public void BallisticEntryHeatingIsInSaneMegawattRange()
        {
            // At rho=.0005 kg/m³, rn=1 m and v=7800 m/s:
            // 1.74e-4 * sqrt(.0005) * 7800³ = 1.846 MW/m².
            var heatFluxWm2 = EntryPhysics.HeatFluxWm2(0.0005, 1, 7800);
            Assert.InRange(heatFluxWm2, 1_840_000, 1_850_000);
            Assert.InRange(heatFluxWm2, 100_000, 10_000_000);
        }

        [Fact]
        public void HeatLoadUsesTrapezoidalIntegration()
        {
            // 5 s ramp from 1 to 3 MW/m² adds average 2 MW/m² * 5 s = 10 MJ/m².
            Assert.Equal(12_000_000, EntryPhysics.IntegrateHeatLoadJm2(2_000_000, 1_000_000, 3_000_000, 5));
        }

        [Fact]
        public void GLoadAndFlightPathAngleHaveExpectedGeometry()
        {
            Assert.Equal(5, EntryPhysics.GLoadUnitless(3 * PhysicalConstants.StandardGravityMs2, 4 * PhysicalConstants.StandardGravityMs2), 12);
            var r = Body.Earth.RadiusM + 120_000;
            Assert.Equal(0, EntryPhysics.FlightPathAngleRad(new FlightState(r, 0, 0, 7500, 1000)), 12);
            Assert.Equal(-Math.PI / 2, EntryPhysics.FlightPathAngleRad(new FlightState(r, 0, -1000, 0, 1000)), 12);
            Assert.Equal(Math.PI / 4, EntryPhysics.FlightPathAngleRad(new FlightState(r, 0, 1000, 1000, 1000)), 12);
        }
    }
}
