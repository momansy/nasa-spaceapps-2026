using System.Diagnostics;
using MissionForge.Core.Flight.Mission;
using MissionForge.Core.Tests.Data;
using Xunit;
using Xunit.Abstractions;

namespace MissionForge.Core.Tests.Flight.Mission
{
    public class AutopilotTests
    {
        private readonly ITestOutputHelper output;
        public AutopilotTests(ITestOutputHelper output) { this.output = output; }
        [Fact]
        public void C1_no_input_full_autopilot_reaches_orbit_in_under_five_seconds()
        {
            var setup = PhaseDriverTests.Setup(); setup.FullAutopilot = true;
            var sim = PhaseDriverTests.Sim(setup);
            var clock = Stopwatch.StartNew();
            var input = new PilotInput();
            for (var i = 0; i < 180000 && sim.Result == null; i++) sim.Step(input);
            clock.Stop();
            var hud = sim.Snapshot();
            output.WriteLine($"{sim.Phase}: MET {hud.MetS:R} s; altitude {hud.AltitudeKm:R} km; peri {hud.PeriapsisKm:R} km; apo {hud.ApoapsisKm:R} km; runtime {clock.Elapsed.TotalSeconds:R} s");
            Assert.NotNull(sim.Result);
            Assert.Equal(MissionOutcome.Success, sim.Result!.Outcome);
            Assert.True(hud.PeriapsisKm > 150);
            Assert.True(clock.Elapsed.TotalSeconds < 5);
        }
        [Fact]
        public void Cadet_does_not_automatically_throttle_or_launch_and_engineer_has_cue()
        {
            var setup = PhaseDriverTests.Setup();
            setup.Assists = AssistLevelCatalog.Load(DesignFixture.RealFiles()["assist_levels.json"]);
            setup.AssistLevelId = "cadet";
            var sim = PhaseDriverTests.Sim(setup);
            for (var i = 0; i < 1500; i++) sim.Step(new PilotInput());
            Assert.Equal("F2", sim.Phase);
            Assert.Null(sim.Snapshot().TargetPitchDeg);
            setup.AssistLevelId = "engineer";
            Assert.NotNull(PhaseDriverTests.Sim(setup).Snapshot().TargetPitchDeg);
            setup.AssistLevelId = "flight_director";
            Assert.Null(PhaseDriverTests.Sim(setup).Snapshot().TargetPitchDeg);
        }
    }
}
