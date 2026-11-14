using System;
using MissionForge.Core.Flight;
using Xunit;

namespace MissionForge.Core.Tests.Flight
{
    public class ForcesTests
    {
        [Fact]
        public void MachTableInterpolatesAndPeaksAtOne()
        {
            Assert.Equal(0.20, Aerodynamics.DragCoefficientUnitless(0), 12);
            Assert.Equal(0.50, Aerodynamics.DragCoefficientUnitless(1), 12);
            Assert.Equal(0.45, Aerodynamics.DragCoefficientUnitless(1.1), 12);
            Assert.Equal(0.22, Aerodynamics.DragCoefficientUnitless(20), 12);
        }

        [Fact]
        public void DynamicPressureAndDragMatchHandCalculation()
        {
            // q = .5 * 1.225 * 100² = 6125 Pa; D = q * .3 * 10 = 18375 N.
            Assert.Equal(6125, Aerodynamics.DynamicPressurePa(1.225, 100), 9);
            Assert.Equal(18375, Aerodynamics.DragN(1.225, 100, 0.3, 10), 9);
        }

        [Fact]
        public void EngineInterpolatesAtPressureAndComputesMassFlow()
        {
            var engine = new EngineModel(760_000, 822_000, 282, 311);
            Assert.Equal(760_000, engine.ThrustN(1));
            Assert.Equal(822_000, engine.ThrustN(0));
            Assert.Equal(791_000, engine.ThrustN(0.5));
            Assert.Equal(296.5, engine.IspS(0.5));
            // mdot = 791000 / (296.5 * 9.80665) = 272.10 kg/s.
            Assert.Equal(791_000 / (296.5 * PhysicalConstants.StandardGravityMs2), engine.MassFlowKgS(0.5), 12);
        }

        [Fact]
        public void ForceInputsAreValidated()
        {
            Assert.Throws<ArgumentOutOfRangeException>(() => Aerodynamics.DynamicPressurePa(-1, 1));
            Assert.Throws<ArgumentOutOfRangeException>(() => Aerodynamics.DragCoefficientUnitless(double.NaN));
            Assert.Throws<ArgumentOutOfRangeException>(() => new EngineModel(2, 1, 1, 1));
            Assert.Throws<ArgumentOutOfRangeException>(() => new EngineModel(1, 2, 2, 1));
        }
    }
}
