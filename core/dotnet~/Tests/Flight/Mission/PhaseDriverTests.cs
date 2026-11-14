using System;
using System.Linq;
using MissionForge.Core.Flight.Mission;
using MissionForge.Core.Tests.Data;
using Newtonsoft.Json;
using Xunit;

namespace MissionForge.Core.Tests.Flight.Mission
{
    public class PhaseDriverTests
    {
        public static MissionSetup Setup() => new MissionSetup
        {
            Seed = 2026, Contract = MissionFixture.Catalog.Contract("C1"),
            Phases = FlightPhaseCatalog.Load(DesignFixture.RealFiles()["flight_phases.json"])
        };
        public static MissionSim Sim(MissionSetup? setup = null) => MissionSim.Create(
            FlightVehicleSpec.FromBuild(MissionFixture.C1(), MissionFixture.Catalog), setup ?? Setup());

        [Fact]
        public void Countdown_catalog_cues_hold_down_and_liftoff_are_ordered()
        {
            var sim = Sim();
            Assert.Equal(-10, sim.Snapshot().MetS);
            var input = new PilotInput();
            var events = Enumerable.Range(0, 1500).SelectMany(_ => sim.Step(input)).ToArray();
            Assert.Equal(new[] { "F0", "F1", "F2" }, events.Where(e => e.Kind == "phase_entered").Select(e => e.Id));
            Assert.Contains(events, e => e.Kind == "minigame_cue" && e.Id == "MG-08b");
            Assert.Equal(0, sim.Snapshot().AltitudeKm, 8);
            input.Main.ThrottleFraction = 1;
            Assert.Contains(sim.Step(input), e => e.Kind == "phase_entered" && e.Id == "F3");
            for (var i = 0; i < 1200; i++) sim.Step(input);
            Assert.True(sim.Snapshot().AltitudeKm > 0.1);
            Assert.InRange(sim.InclinationDeg, 97.599999, 97.600001);
            Assert.Equal(5, sim.Snapshot().Channels.Count);
            Assert.True(sim.Snapshot().StageDeltaVMs["first"] > 0);
        }
        [Fact]
        public void Same_inputs_produce_bit_identical_snapshots_and_events()
        {
            var a = Sim(); var b = Sim();
            for (var i = 0; i < 2000; i++)
            {
                var input = new PilotInput { Main = new CraftInput { ThrottleFraction = i > 1250 ? 1 : 0 } };
                Assert.Equal(JsonConvert.SerializeObject(a.Step(input)), JsonConvert.SerializeObject(b.Step(input)));
                Assert.Equal(JsonConvert.SerializeObject(a.Snapshot()), JsonConvert.SerializeObject(b.Snapshot()));
            }
        }
        [Fact]
        public void Invalid_controls_and_mismatched_build_seed_are_rejected()
        {
            var setup = Setup(); setup.Seed++;
            Assert.Throws<ArgumentException>(() => Sim(setup));
            Assert.Throws<ArgumentOutOfRangeException>(() => Sim().Step(new PilotInput
                { Main = new CraftInput { ThrottleFraction = double.NaN } }));
        }
    }
}
