using System;
using System.Linq;
using MissionForge.Core.Build;
using MissionForge.Core.Flight.Mission;
using MissionForge.Core.Tests.Data;
using Xunit;

namespace MissionForge.Core.Tests.Flight.Mission
{
    public class AbortTests
    {
        private static void StepUntil(MissionSim sim, Func<bool> done, PilotInput? input = null, int max = 3_000_000)
        {
            input ??= new PilotInput();
            for (var i = 0; i < max && !done() && sim.Result == null; i++) sim.Step(input);
        }

        [Fact]
        public void Catalog_loads_the_five_modes_and_rejects_bad_data()
        {
            var catalog = AbortCatalog.Load(DesignFixture.RealFiles()["abort_modes.json"]);
            Assert.Equal(new[] { "pad_abort", "ascent_abort", "abort_to_orbit", "return_to_launch_site", "early_return" },
                catalog.Modes.Select(m => m.Id).ToArray());
            Assert.True(catalog.Find("pad_abort")!.RequiresEscapeSystem);
            Assert.Throws<MissionForge.Core.Data.CatalogException>(() => AbortCatalog.Load("{}"));
            Assert.Throws<MissionForge.Core.Data.CatalogException>(() => AbortCatalog.Load("not json"));
        }

        [Fact]
        public void Pad_abort_needs_an_escape_system_and_saves_the_crew()
        {
            var c1 = PhaseDriverTests.Setup(); c1.Aborts = AbortCatalog.Load(DesignFixture.RealFiles()["abort_modes.json"]);
            var uncrewed = PhaseDriverTests.Sim(c1);
            StepUntil(uncrewed, () => uncrewed.Phase == "F2");
            Assert.DoesNotContain("pad_abort", uncrewed.AvailableAborts());
            Assert.False(uncrewed.Abort("pad_abort"));

            var sim = ContractFlightTests.Create("C4", ContractFlightTests.CleanSeed("C4"));
            StepUntil(sim, () => sim.Phase == "F2");
            Assert.Contains("pad_abort", sim.AvailableAborts());
            Assert.True(sim.Abort("pad_abort"));
            Assert.Equal(MissionOutcome.Failure, sim.Result!.Outcome);
            Assert.Equal(1, sim.Result.Metrics["crew_safe"]);
            Assert.Empty(sim.Step(new PilotInput())); // the result is final
        }

        [Fact]
        public void Ascent_abort_is_offered_only_inside_the_tower_envelope()
        {
            var sim = ContractFlightTests.Create("C4", ContractFlightTests.CleanSeed("C4"));
            StepUntil(sim, () => sim.Phase == "F4");
            Assert.Contains("ascent_abort", sim.AvailableAborts());
            StepUntil(sim, () => sim.MetS > 155 || sim.Phase == "F6");
            Assert.DoesNotContain("ascent_abort", sim.AvailableAborts()); // the tower leaves the vehicle after 150 s
        }

        [Fact]
        public void Pilot_called_ascent_abort_splashes_the_capsule_down_with_the_crew_safe()
        {
            var sim = ContractFlightTests.Create("C4", ContractFlightTests.CleanSeed("C4"));
            StepUntil(sim, () => sim.Phase == "F4");
            var events = sim.Step(new PilotInput { Main = new CraftInput { AbortId = "ascent_abort", ThrottleFraction = 1 } });
            Assert.Contains(events, e => e.Kind == "abort" && e.Id == "ascent_abort");
            Assert.Equal(MissionOutcome.Failure, sim.Result!.Outcome);
            Assert.Equal("ascent_abort", sim.Result.FailureMode);
            Assert.Equal(1, sim.Result.Metrics["crew_safe"]);
            Assert.Equal(1, sim.Result.Metrics["capsule_recovered"]);
        }

        [Fact]
        public void Abort_to_orbit_needs_late_ascent_delta_v_and_ends_as_a_partial_success()
        {
            var sim = ContractFlightTests.Create("C8", ContractFlightTests.CleanSeed("C8"));
            StepUntil(sim, () => sim.Phase == "F7");
            Assert.DoesNotContain("abort_to_orbit", sim.AvailableAborts()); // apoapsis is still too low
            StepUntil(sim, () => sim.AvailableAborts().Contains("abort_to_orbit") || sim.Phase == "F8");
            Assert.Contains("abort_to_orbit", sim.AvailableAborts());
            Assert.True(sim.Abort("abort_to_orbit"));
            Assert.Equal("F8", sim.Phase);
            Assert.Null(sim.Result); // the flight goes on from the lower orbit
            ContractFlightTests.Fly(sim);
            Assert.Equal(MissionOutcome.Partial, sim.Result!.Outcome);
            Assert.Equal("abort_to_orbit", sim.Result.FailureMode);
            Assert.True(sim.Result.Metrics["orbit_altitude_km"] > 100);
        }

        [Fact]
        public void Early_return_deorbits_a_crewed_capsule_for_a_partial_success()
        {
            var sim = ContractFlightTests.Create("C4", ContractFlightTests.CleanSeed("C4"));
            StepUntil(sim, () => sim.Phase == "F8");
            Assert.Contains("early_return", sim.AvailableAborts());
            Assert.True(sim.Abort("early_return"));
            Assert.Equal("F9", sim.Phase);
            ContractFlightTests.Fly(sim);
            Assert.Equal(MissionOutcome.Partial, sim.Result!.Outcome);
            Assert.Equal("early_return", sim.Result.FailureMode);
            Assert.Equal(1, sim.Result.Metrics["crew_safe"]);
            Assert.Equal(1, sim.Result.Metrics["capsule_recovered"]);
        }

        [Fact]
        public void Return_to_launch_site_needs_a_recoverable_booster()
        {
            var expendable = PhaseDriverTests.Setup(); expendable.Aborts = AbortCatalog.Load(DesignFixture.RealFiles()["abort_modes.json"]);
            var c1 = PhaseDriverTests.Sim(expendable);
            var input = new PilotInput { Main = new CraftInput { ThrottleFraction = 1 } };
            for (var i = 0; i < 1400; i++) c1.Step(input);
            Assert.Equal("F3", c1.Phase);
            Assert.DoesNotContain("return_to_launch_site", c1.AvailableAborts());

            var c8 = ContractFlightTests.Create("C8", ContractFlightTests.CleanSeed("C8"));
            StepUntil(c8, () => c8.Phase == "F3");
            Assert.Contains("return_to_launch_site", c8.AvailableAborts());
            Assert.True(c8.Abort("return_to_launch_site"));
            Assert.Equal(MissionOutcome.Failure, c8.Result!.Outcome);
        }

        [Fact]
        public void The_escape_system_fires_by_itself_when_the_vehicle_breaks_up_in_its_envelope()
        {
            ulong seed = 0;
            for (ulong s = 1; s < 4000 && seed == 0; s++)
            {
                var spec = FlightVehicleSpec.FromBuild(ContractFlightTests.FlightBuild("C4", s), MissionFixture.Catalog);
                var model = new FailureModel(spec, null);
                var records = model.Roll("liftoff").Concat(model.Roll("maxq")).ToList();
                if (records.Any(r => r.Fatal && r.Mode == "engine_shutdown")
                    && !model.Roll("ignition").Any(r => r.MissionImpact)) seed = s;
            }
            Assert.NotEqual(0UL, seed);
            var sim = ContractFlightTests.Create("C4", seed);
            var events = ContractFlightTests.Fly(sim);
            Assert.Equal(MissionOutcome.Failure, sim.Result!.Outcome);
            Assert.Contains(events, e => e.Kind == "abort" && e.Id == "ascent_abort");
            Assert.Equal(1, sim.Result.Metrics["crew_safe"]);
        }
    }
}
