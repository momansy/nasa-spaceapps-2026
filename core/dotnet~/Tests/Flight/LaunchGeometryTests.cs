using System;
using MissionForge.Core.Flight;
using Xunit;

namespace MissionForge.Core.Tests.Flight
{
    public class LaunchGeometryTests
    {
        [Fact]
        public void RotationBoostMatchesLatitudeFormula()
        {
            Assert.Equal(465, LaunchGeometry.EastwardRotationBoostMs(Body.Earth, 0), 12);
            Assert.Equal(0, LaunchGeometry.EastwardRotationBoostMs(Body.Earth, Math.PI / 2), 10);
            // 465*cos(28.5°) = 408.7 m/s.
            Assert.InRange(LaunchGeometry.EastwardRotationBoostMs(Body.Earth, Degrees(28.5)), 408, 410);
        }

        [Fact]
        public void DirectAzimuthAndRotationLossBehaveAtBounds()
        {
            var latitude = Degrees(28.5);
            Assert.Equal(Math.PI / 2, LaunchGeometry.LaunchAzimuthRad(latitude, latitude), 10);
            Assert.Equal(0, LaunchGeometry.LaunchAzimuthRad(latitude, Math.PI / 2), 10);
            Assert.Equal(0, LaunchGeometry.InclinationDeltaVPenaltyMs(Body.Earth, latitude, latitude, 7800), 10);
            Assert.Equal(LaunchGeometry.EastwardRotationBoostMs(Body.Earth, latitude),
                LaunchGeometry.InclinationDeltaVPenaltyMs(Body.Earth, latitude, Math.PI / 2, 7800), 10);
        }

        [Fact]
        public void LowerThanSiteInclinationUsesDisclosedDoglegPenalty()
        {
            var latitude = Degrees(28.5);
            // 2*7800*sin(28.5°/2) = about 3842 m/s idealized plane change.
            var penaltyMs = LaunchGeometry.InclinationDeltaVPenaltyMs(Body.Earth, latitude, 0, 7800);
            Assert.InRange(penaltyMs, 3830, 3850);
            Assert.Throws<ArgumentOutOfRangeException>(() => LaunchGeometry.LaunchAzimuthRad(latitude, 0));
        }

        private static double Degrees(double degrees) => degrees * Math.PI / 180;
    }
}
