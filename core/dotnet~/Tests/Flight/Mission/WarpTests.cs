using System;
using System.Linq;
using MissionForge.Core.Flight;
using MissionForge.Core.Flight.Mission;
using Xunit;
using Xunit.Abstractions;

namespace MissionForge.Core.Tests.Flight.Mission
{
    public class WarpTests
    {
        private readonly ITestOutputHelper output;
        public WarpTests(ITestOutputHelper output) { this.output = output; }

        private static MissionSim OrbitSim(double operationsS, out MissionSetup setup)
        {
            setup = PhaseDriverTests.Setup(); setup.FullAutopilot = true; setup.OrbitalOperationsDurationS = operationsS;
            return PhaseDriverTests.Sim(setup);
        }
        private static int RunToF8(MissionSim sim, double requestedWarp)
        {
            var steps = 0;
            var input = new PilotInput { RequestedWarpFactor = requestedWarp };
            while (sim.Phase != "F8" && sim.Result == null && steps < 400000) { sim.Step(input); steps++; }
            return steps;
        }

        [Fact]
        public void Warp_stays_one_while_powered_or_below_70_km_whatever_is_requested()
        {
            var sim = OrbitSim(6000, out _);
            var input = new PilotInput { RequestedWarpFactor = 1000 };
            for (var i = 0; i < 200000 && sim.Phase != "F8"; i++)
            {
                sim.Step(input);
                Assert.Equal(1, sim.Snapshot().WarpFactor);
            }
            Assert.Equal("F8", sim.Phase);
        }

        [Fact]
        public void Coast_warp_is_kepler_exact_and_far_cheaper_than_real_time()
        {
            var slow = OrbitSim(5400, out _); var fast = OrbitSim(5400, out _);
            RunToF8(slow, 1); RunToF8(fast, 1000);
            var slowSteps = 0; var fastSteps = 0;
            var slowIn = new PilotInput { RequestedWarpFactor = 1 }; var fastIn = new PilotInput { RequestedWarpFactor = 1000 };
            while (slow.Result == null && slowSteps < 800000) { slow.Step(slowIn); slowSteps++; }
            while (fast.Result == null && fastSteps < 800000) { fast.Step(fastIn); fastSteps++; }
            output.WriteLine($"1x: {slowSteps} steps; 1000x: {fastSteps} steps");
            Assert.NotNull(fast.Result);
            Assert.True(fastSteps * 100 < slowSteps, "warp must cut the number of steps by two orders of magnitude");
            Assert.Equal(slow.MetS, fast.MetS, 1);
            // Same orbit after 5,400 s: RK4 and Kepler agree on the elements; the true anomaly agrees to a few km.
            var mu = Body.Earth.MuM3S2;
            var a = OrbitalMechanics.Elements(slow.State, mu); var b = OrbitalMechanics.Elements(fast.State, mu);
            Assert.InRange(Math.Abs(a.SemiMajorAxisM - b.SemiMajorAxisM), 0, 100);
            Assert.InRange(Math.Abs(slow.State.PositionXM - fast.State.PositionXM), 0, 20000);
        }

        [Fact]
        public void Minigames_slow_time_to_one_tenth()
        {
            var normal = PhaseDriverTests.Sim(); var bullet = PhaseDriverTests.Sim();
            var n = new PilotInput(); var b = new PilotInput { MinigameActive = true };
            for (var i = 0; i < 1000; i++) { normal.Step(n); bullet.Step(b); }
            Assert.Equal(0.1, bullet.Snapshot().WarpFactor);
            // 1,000 held steps advance 100 fixed steps: MET moves exactly one tenth as far.
            var dN = normal.Snapshot().MetS + 10; var dB = bullet.Snapshot().MetS + 10;
            Assert.Equal(dN / 10, dB, 6);
        }
    }
}
