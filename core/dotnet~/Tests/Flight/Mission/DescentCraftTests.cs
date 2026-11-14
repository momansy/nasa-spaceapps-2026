using System;
using MissionForge.Core.Flight;
using MissionForge.Core.Flight.Mission;
using Xunit;

namespace MissionForge.Core.Tests.Flight.Mission
{
    public class DescentCraftTests
    {
        private static FlightState Fall(double altitudeM, double airSpeedMs, double massKg) =>
            new FlightState(Body.Earth.RadiusM + altitudeM, 0, -airSpeedMs, Body.Earth.RotationRateRadS * (Body.Earth.RadiusM + altitudeM), massKg);

        [Fact]
        public void Main_chute_reaches_its_design_sink_speed_and_inflation_limits_the_shock()
        {
            var craft = new DescentCraft(Body.Earth, 10, 1.8, 3000, 1e9, null);
            craft.DeployMain();
            var s = Fall(2000, 100, 3000); var peak = 0.0;
            for (var i = 0; i < 120 * 90; i++) { s = craft.Step(s, i / 120.0, 0); peak = Math.Max(peak, craft.GLoadUnitless); }
            Assert.InRange(craft.AirSpeedMs(s), 6, 12);
            Assert.InRange(peak, 1, 15); // a 100 m/s opening stays survivable because the canopy inflates over 10 s
        }

        [Fact]
        public void Shield_turned_away_triples_the_heating()
        {
            double Load(bool forward)
            {
                var craft = new DescentCraft(Body.Earth, 10, 1.8, 3000, 1e9, null) { ShieldForward = forward };
                var s = Fall(80000, 7600, 3000);
                for (var i = 0; i < 120 * 60; i++) s = craft.Step(s, i / 120.0, 0);
                return craft.PeakHeatFluxWm2;
            }
            Assert.Equal(DescentCraft.MisalignedHeatMultiplier, Load(false) / Load(true), 3);
        }

        [Fact]
        public void Terminal_burn_waits_for_the_suicide_burn_point_then_lands_softly()
        {
            var thrust = 3 * 9.81 * 2000.0;
            var craft = new DescentCraft(Body.Earth, 8, 1.6, 1800, 1e9, new EngineModel(thrust, thrust, 250, 250));
            craft.DeployMain();
            var s = Fall(600, 20, 2000);
            Assert.Equal(0, craft.TerminalThrottle(s, 1));
            for (var i = 0; i < 120 * 120 && craft.AltitudeM(s) > 0; i++)
                s = craft.Step(s, i / 120.0, craft.TerminalThrottle(s, 1));
            Assert.True(craft.AirSpeedMs(s) < 3);
            Assert.True(s.MassKg < 2000 && s.MassKg >= 1800 - 1e-6);
        }

        [Fact]
        public void Step_is_robust_to_odd_pilot_input_and_inert_after_the_mission_ends()
        {
            var sim = PhaseDriverTests.Sim();
            var weird = new PilotInput { RequestedWarpFactor = double.NaN, MinigameActive = false,
                Main = new CraftInput { AbortId = "no_such_abort", PitchRad = 12345 } };
            for (var i = 0; i < 2000; i++) sim.Step(weird);
            Assert.Equal(1, sim.Snapshot().WarpFactor);
            var negative = new PilotInput { RequestedWarpFactor = -50 };
            sim.Step(negative);
            Assert.Equal(1, sim.Snapshot().WarpFactor);
            Assert.Throws<ArgumentNullException>(() => sim.Step(null!));
            var done = ContractFlightTests.Create("C0", ContractFlightTests.CleanSeed("C0"));
            ContractFlightTests.Fly(done);
            Assert.NotNull(done.Result);
            Assert.Empty(done.Step(new PilotInput()));
            Assert.False(done.Abort("pad_abort"));
        }
    }
}
