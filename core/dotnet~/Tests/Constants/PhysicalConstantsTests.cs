using System;
using Xunit;

namespace MissionForge.Core.Tests.Constants
{
    public class PhysicalConstantsTests
    {
        [Fact]
        public void Values_match_design_section_8_1()
        {
            Assert.Equal(9.80665, PhysicalConstants.StandardGravityMs2);
            Assert.Equal(3.986e14, PhysicalConstants.EarthMuM3S2);
            Assert.Equal(6_371_000.0, PhysicalConstants.EarthMeanRadiusM);
            Assert.Equal(465.0, PhysicalConstants.EarthEquatorRotationSpeedMs);
            Assert.Equal(1.225, PhysicalConstants.SeaLevelAirDensityKgM3);
            Assert.Equal(8_500.0, PhysicalConstants.EarthScaleHeightM);
            Assert.Equal(100_000.0, PhysicalConstants.KarmanLineAltitudeM);
            Assert.Equal(120_000.0, PhysicalConstants.EntryInterfaceAltitudeM);
            Assert.Equal(4.283e13, PhysicalConstants.MarsMuM3S2);
            Assert.Equal(3_390_000.0, PhysicalConstants.MarsRadiusM);
            Assert.Equal(0.020, PhysicalConstants.MarsSurfaceDensityKgM3);
            Assert.Equal(11_000.0, PhysicalConstants.MarsScaleHeightM);
        }

        [Fact]
        public void Earth_surface_gravity_is_consistent_with_mu_and_radius()
        {
            // g = mu / r^2 = 3.986e14 / (6.371e6)^2 = 3.986e14 / 4.0589641e13 = 9.8202 m/s^2,
            // within 0.2% of standard gravity (the mean radius is not the reference radius of g0).
            double surfaceGravityMs2 = PhysicalConstants.EarthMuM3S2
                / (PhysicalConstants.EarthMeanRadiusM * PhysicalConstants.EarthMeanRadiusM);

            Assert.InRange(surfaceGravityMs2, 9.80, 9.84);
        }

        [Fact]
        public void Low_earth_orbit_speed_is_about_7_8_km_per_second()
        {
            // Circular speed at 400 km: sqrt(mu / r) = sqrt(3.986e14 / 6.771e6) = sqrt(5.8869e7) = 7672.6 m/s.
            // The design quotes "about 7.8 km/s" for low Earth orbit (sections 9.1 and 19).
            double radiusM = PhysicalConstants.EarthMeanRadiusM + 400_000.0;
            double speedMs = Math.Sqrt(PhysicalConstants.EarthMuM3S2 / radiusM);

            Assert.InRange(speedMs, 7600.0, 7800.0);
        }

        [Fact]
        public void Mars_surface_gravity_is_about_3_7_metres_per_second_squared()
        {
            // g = 4.283e13 / (3.39e6)^2 = 4.283e13 / 1.14921e13 = 3.727 m/s^2.
            double surfaceGravityMs2 = PhysicalConstants.MarsMuM3S2
                / (PhysicalConstants.MarsRadiusM * PhysicalConstants.MarsRadiusM);

            Assert.InRange(surfaceGravityMs2, 3.70, 3.75);
        }

        [Fact]
        public void Launch_site_boosts_of_design_section_7_1_follow_from_the_equator_speed()
        {
            // 465 m/s x cos(latitude), rounded to the nearest m/s as printed in the design table.
            Assert.Equal(463.0, Math.Round(BoostMs(5.0)));
            Assert.Equal(409.0, Math.Round(BoostMs(28.5)));
            Assert.Equal(382.0, Math.Round(BoostMs(34.7)));
            Assert.Equal(323.0, Math.Round(BoostMs(46.0)));
        }

        [Fact]
        public void Altitudes_and_scale_heights_are_ordered_sensibly()
        {
            Assert.True(PhysicalConstants.EntryInterfaceAltitudeM > PhysicalConstants.KarmanLineAltitudeM);
            Assert.True(PhysicalConstants.KarmanLineAltitudeM > PhysicalConstants.EarthScaleHeightM);
            Assert.True(PhysicalConstants.MarsSurfaceDensityKgM3 < PhysicalConstants.SeaLevelAirDensityKgM3);
            Assert.True(PhysicalConstants.MarsRadiusM < PhysicalConstants.EarthMeanRadiusM);
        }

        private static double BoostMs(double latitudeDeg)
        {
            return PhysicalConstants.EarthEquatorRotationSpeedMs * Math.Cos(latitudeDeg * Math.PI / 180.0);
        }
    }
}
