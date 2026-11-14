using System;
using MissionForge.Core.Flight;
using Xunit;

namespace MissionForge.Core.Tests.Flight
{
    public class BodyTests
    {
        [Fact]
        public void BuiltInBodiesUseSharedPhysicalConstants()
        {
            Assert.Equal(PhysicalConstants.EarthMuM3S2, Body.Earth.MuM3S2);
            Assert.Equal(PhysicalConstants.EarthMeanRadiusM, Body.Earth.RadiusM);
            Assert.Equal(PhysicalConstants.SeaLevelAirDensityKgM3, Body.Earth.SurfaceDensityKgM3);
            Assert.Equal(PhysicalConstants.EarthScaleHeightM, Body.Earth.ScaleHeightM);
            Assert.Equal(PhysicalConstants.EarthEquatorRotationSpeedMs, Body.Earth.EquatorRotationSpeedMs);
            Assert.Equal(PhysicalConstants.MarsMuM3S2, Body.Mars.MuM3S2);
            Assert.Equal(PhysicalConstants.MarsRadiusM, Body.Mars.RadiusM);
            Assert.Equal(PhysicalConstants.MarsSurfaceDensityKgM3, Body.Mars.SurfaceDensityKgM3);
            Assert.Equal(PhysicalConstants.MarsScaleHeightM, Body.Mars.ScaleHeightM);
            // Mars: 4.283e13 / 3390000² = 3.7269 m/s²; rounded game rotation 240/R.
            Assert.Equal(4.283e13 / (3390000.0 * 3390000), Body.Mars.GravityMs2(Body.Mars.RadiusM), 12);
            Assert.Equal(240.0 / 3390000, Body.Mars.RotationRateRadS);
            Assert.Equal(1, Body.Earth.PressureRatioUnitless(0));
            Assert.Equal(0, Body.Earth.MachUnitless(0));
        }

        [Theory]
        [InlineData(1)]
        [InlineData(2)]
        public void DensityAndPressureAtScaleHeights(double heights)
        {
            foreach (var body in new[] { Body.Earth, Body.Mars })
            {
                // rho(H)=rho0/e, rho(2H)=rho0/e²; pressure shares the isothermal ratio.
                Assert.Equal(body.SurfaceDensityKgM3 * Math.Exp(-heights), body.DensityKgM3(heights * body.ScaleHeightM), 12);
                Assert.Equal(Math.Exp(-heights), body.PressureRatioUnitless(heights * body.ScaleHeightM), 12);
            }
        }

        [Fact]
        public void GravitySoundRotationAndBelowGroundConvention()
        {
            // 3.986e14 / 6371000² = 9.8202396 m/s²; omega=465/6371000 rad/s.
            Assert.Equal(9.8202396, Body.Earth.GravityMs2(Body.Earth.RadiusM), 6);
            Assert.Equal(Body.Earth.GravityMs2(Body.Earth.RadiusM) / 4, Body.Earth.GravityMs2(2 * Body.Earth.RadiusM), 12);
            Assert.Equal(465.0 / 6371000, Body.Earth.RotationRateRadS, 14);
            Assert.Equal(2, Body.Earth.MachUnitless(680));
            Assert.Equal(1, Body.Mars.MachUnitless(240));
            Assert.Equal(1, Body.Earth.PressureRatioUnitless(-100));
            Assert.Equal(1.225, Body.Earth.DensityKgM3(-100));
            Assert.Equal(0, new Body(1, 1, 0, 1, 0, 1).PressureRatioUnitless(0));
        }

        [Fact]
        public void RejectsNonphysicalAndNonfiniteInputs()
        {
            Assert.Throws<ArgumentOutOfRangeException>(() => Body.Earth.GravityMs2(0));
            Assert.Throws<ArgumentOutOfRangeException>(() => Body.Earth.MachUnitless(-1));
            Assert.Throws<ArgumentOutOfRangeException>(() => Body.Earth.DensityKgM3(double.NaN));
            Assert.Throws<ArgumentOutOfRangeException>(() => new Body(1, 0, 0, 1, 0, 1));
            Assert.Throws<ArgumentOutOfRangeException>(() => new Body(1, 1, -1, 1, 0, 1));
            Assert.Throws<ArgumentOutOfRangeException>(() => new Body(1, 1, 0, 1, double.PositiveInfinity, 1));
        }
    }
}
