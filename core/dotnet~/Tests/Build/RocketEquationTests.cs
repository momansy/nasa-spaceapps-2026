using System;
using MissionForge.Core.Build;
using Xunit;

namespace MissionForge.Core.Tests.Build
{
    public class RocketEquationTests
    {
        [Fact]
        public void DeltaV_matches_hand_computed_value()
        {
            // Isp = 311 s (Kerolox Workhorse, vacuum), m0 = 100 000 kg, mf = 25 000 kg.
            //   Isp * g0        = 311 * 9.80665          = 3049.86815 m/s
            //   ln(m0 / mf)     = ln(4)                  = 1.3862943611...
            //   delta-v         = 3049.86815 * 1.3862943611
            //                   = 3000 * 1.3862943611    = 4158.8830834
            //                   +   49.86815 * 1.3862943611 =   69.1319351
            //                   = 4228.0150185 m/s, which is 4228.01502 to five decimals
            double deltaVMs = RocketEquation.DeltaVMs(311.0, 100_000.0, 25_000.0);

            Assert.Equal(4228.01502, deltaVMs, 5);
        }

        [Fact]
        public void DeltaV_with_mass_ratio_e_equals_exhaust_velocity()
        {
            // ln(e) = 1, so delta-v = Isp * g0 = 300 * 9.80665 = 2941.995 m/s.
            double deltaVMs = RocketEquation.DeltaVMs(300.0, 1000.0 * Math.E, 1000.0);

            Assert.Equal(2941.995, deltaVMs, 9);
        }

        [Fact]
        public void DeltaV_is_zero_when_no_propellant_is_burned()
        {
            Assert.Equal(0.0, RocketEquation.DeltaVMs(311.0, 5000.0, 5000.0));
        }

        [Fact]
        public void DeltaV_grows_with_diminishing_returns()
        {
            // Doubling the mass ratio adds the same delta-v each time (logarithm), design section 12.3.
            double first = RocketEquation.DeltaVMs(300.0, 2000.0, 1000.0);
            double second = RocketEquation.DeltaVMs(300.0, 4000.0, 1000.0);

            Assert.Equal(2.0 * first, second, 9);
        }

        [Theory]
        [InlineData(0.0, 100.0, 50.0)]
        [InlineData(-1.0, 100.0, 50.0)]
        [InlineData(double.NaN, 100.0, 50.0)]
        [InlineData(double.PositiveInfinity, 100.0, 50.0)]
        [InlineData(300.0, 100.0, 0.0)]
        [InlineData(300.0, 100.0, -5.0)]
        [InlineData(300.0, 100.0, double.NaN)]
        [InlineData(300.0, 40.0, 50.0)]
        [InlineData(300.0, double.NaN, 50.0)]
        [InlineData(300.0, double.PositiveInfinity, 50.0)]
        public void DeltaV_rejects_invalid_arguments(double ispS, double m0Kg, double mfKg)
        {
            Assert.Throws<ArgumentOutOfRangeException>(() => RocketEquation.DeltaVMs(ispS, m0Kg, mfKg));
        }

        [Fact]
        public void LiftoffTwr_matches_hand_computed_value()
        {
            // Three Kerolox Workhorse engines at sea level: 3 * 850 kN = 2 550 000 N.
            // Vehicle mass 200 t = 200 000 kg.
            //   weight = 200 000 * 9.80665 = 1 961 330 N
            //   TWR    = 2 550 000 / 1 961 330 = 1.3001382
            double twr = RocketEquation.LiftoffTwr(2_550_000.0, 200_000.0);

            Assert.Equal(1.3001382, twr, 7);
        }

        [Fact]
        public void LiftoffTwr_is_exactly_one_when_thrust_equals_weight()
        {
            double massKg = 1000.0;
            double weightN = massKg * PhysicalConstants.StandardGravityMs2;

            Assert.Equal(1.0, RocketEquation.LiftoffTwr(weightN, massKg), 12);
        }

        [Theory]
        [InlineData(-1.0, 1000.0)]
        [InlineData(double.NaN, 1000.0)]
        [InlineData(double.PositiveInfinity, 1000.0)]
        [InlineData(1000.0, 0.0)]
        [InlineData(1000.0, -1.0)]
        [InlineData(1000.0, double.NaN)]
        public void LiftoffTwr_rejects_invalid_arguments(double thrustSlN, double massKg)
        {
            Assert.Throws<ArgumentOutOfRangeException>(() => RocketEquation.LiftoffTwr(thrustSlN, massKg));
        }
    }
}
