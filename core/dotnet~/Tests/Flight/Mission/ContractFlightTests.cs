using System;
using System.Collections.Generic;
using System.Linq;
using MissionForge.Core.Build;
using MissionForge.Core.Data;
using MissionForge.Core.Flight;
using MissionForge.Core.Flight.Mission;
using MissionForge.Core.Tests.Data;
using Xunit;
using Xunit.Abstractions;

namespace MissionForge.Core.Tests.Flight.Mission
{
    /// <summary>Flies the fixture builds of C0 and C3-C8 under the full autopilot (steps 5, 6 and 8).</summary>
    public class ContractFlightTests
    {
        private readonly ITestOutputHelper output;
        public ContractFlightTests(ITestOutputHelper output) { this.output = output; }

        public static Func<ulong, BuildState> Fixture(string id) => id switch
        {
            "C0" => ContractFixtures.C0, "C3" => ContractFixtures.C3, "C4" => ContractFixtures.C4,
            "C5" => ContractFixtures.C5, "C6" => ContractFixtures.C6, "C7" => ContractFixtures.C7,
            "C8" => ContractFixtures.C8, _ => throw new ArgumentException(id)
        };

        /// <summary>First seed whose keyed random draws give no mission-affecting failure.</summary>
        public static ulong CleanSeed(string id)
        {
            for (ulong seed = 1; seed < 500; seed++)
            {
                var spec = FlightVehicleSpec.FromBuild(FlightBuild(id, seed), MissionFixture.Catalog);
                var model = new FailureModel(spec, null);
                var impact = false;
                foreach (var cp in FailureModel.AllCheckpoints)
                    impact |= model.Roll(cp).Any(r => r.Kind == "failure" && r.MissionImpact);
                impact |= model.RollPogo("staging").Any(r => r.MissionImpact);
                if (!impact) return seed;
            }
            throw new InvalidOperationException("no clean seed for " + id);
        }

        /// <summary>
        /// The fixture build as flown. C6's fixture pairs a 110 kN hydrolox upper stage with a ~300 t stack (thrust-to-weight
        /// 0.04), which no autopilot can insert into orbit; the flight tests swap in the methalox vacuum engine.
        /// </summary>
        public static BuildState FlightBuild(string id, ulong seed)
        {
            var build = Fixture(id)(seed);
            return id == "C6" ? build.WithChoice(Slots.UpperStageEngine, "eng_methalox_vacuum") : build;
        }

        public static MissionSetup Setup(string id, ulong seed) => new MissionSetup
        {
            Seed = seed, Contract = MissionFixture.Catalog.Contract(id), FullAutopilot = true,
            Phases = FlightPhaseCatalog.Load(DesignFixture.RealFiles()["flight_phases.json"]),
            Aborts = AbortCatalog.Load(DesignFixture.RealFiles()["abort_modes.json"]),
            Assists = AssistLevelCatalog.Load(DesignFixture.RealFiles()["assist_levels.json"]),
            // The fixture stacks have thin Δv margins; this boost (a game_value modifier) pays for the autopilot's losses.
            Modifiers = new FlightModifiers { DeltaVBonusFraction = 0.15 }
        };

        public static MissionSim Create(string id, ulong seed, Action<MissionSetup>? tweak = null)
        {
            var setup = Setup(id, seed); tweak?.Invoke(setup);
            return MissionSim.Create(FlightVehicleSpec.FromBuild(FlightBuild(id, seed), MissionFixture.Catalog), setup);
        }

        public static List<FlightEvent> Fly(MissionSim sim, int maxSteps = 3_000_000, double warp = 1000)
        {
            var all = new List<FlightEvent>();
            var input = new PilotInput { RequestedWarpFactor = warp };
            for (var i = 0; i < maxSteps && sim.Result == null; i++) all.AddRange(sim.Step(input));
            return all;
        }

        public static string Describe(MissionSim sim, List<FlightEvent> events) =>
            $"{sim.Result?.Outcome} mode={sim.Result?.FailureMode} phase={sim.Result?.FailurePhase} slot={sim.Result?.FailureSlot} " +
            string.Join(" ", (sim.Result?.Metrics ?? new Dictionary<string, double>()).Select(m => $"{m.Key}={m.Value:G6}")) +
            "\n  events: " + string.Join(", ", events.Where(e => e.Kind != "minigame_cue" && e.Kind != "fact_moment")
                .Select(e => $"{e.Kind}:{e.Id}@{e.MetS:F0}"));

        private static FlightResult FlyClean(string id, out List<FlightEvent> events, out MissionSim sim, Action<MissionSetup>? tweak = null)
        {
            sim = Create(id, CleanSeed(id), tweak);
            events = Fly(sim);
            Assert.NotNull(sim.Result);
            return sim.Result!;
        }

        [Fact]
        public void C0_ballistic_shot_reaches_100_km_and_the_package_lands_under_parachutes()
        {
            var r = FlyClean("C0", out var events, out _);
            Assert.Equal(MissionOutcome.Success, r.Outcome);
            Assert.True(r.Metrics["apogee_km"] >= 100, "contract needs apogee >= 100 km");
            Assert.Equal(1, r.Metrics["payload_recovered"]);
            Assert.InRange(r.Metrics["touchdown_speed_m_s"], 0, 12);
            Assert.True(r.Metrics["peak_heat_flux_w_m2"] < 1e5, "a 100 km lob needs no heat shield");
            Assert.Contains(events, e => e.Kind == "deploy" && e.Id == "drogue");
            Assert.Contains(events, e => e.Kind == "deploy" && e.Id == "main");
        }

        [Fact]
        public void C4_entry_has_sane_peak_heating_and_g_and_a_blackout_window()
        {
            var r = FlyClean("C4", out var events, out _);
            output.WriteLine($"peak flux {r.Metrics["peak_heat_flux_w_m2"]:E3} W/m2, peak g {r.Metrics["peak_g_load"]:F2}");
            Assert.Equal(MissionOutcome.Success, r.Outcome);
            // Apollo-class LEO return: 0.3-5 MW/m2 stagnation heating (Sutton-Graves), 3-12 g ballistic.
            Assert.InRange(r.Metrics["peak_heat_flux_w_m2"], 3e5, 5e6);
            Assert.InRange(r.Metrics["peak_g_load"], 3, 12);
            Assert.InRange(r.Metrics["touchdown_speed_m_s"], 0, 12);
            Assert.Equal(1, r.Metrics["crew_safe"]);
            Assert.Equal(1, r.Metrics["capsule_recovered"]);
            var kinds = events.Where(e => e.Kind == "blackout" || e.Kind == "phase_entered").Select(e => e.Kind + ":" + e.Id).ToList();
            Assert.True(kinds.IndexOf("blackout:on") < kinds.IndexOf("blackout:off"));
            Assert.True(kinds.IndexOf("phase_entered:F11") < kinds.IndexOf("blackout:off"));
            Assert.True(kinds.IndexOf("phase_entered:F9") < kinds.IndexOf("phase_entered:F10"));
        }

        [Fact]
        public void C5_transfer_reaches_the_geostationary_transfer_apogee_with_a_warped_coast()
        {
            var r = FlyClean("C5", out var events, out var sim);
            Assert.Equal(MissionOutcome.Success, r.Outcome);
            Assert.InRange(r.Metrics["apogee_km"], 35700, 35900);
            Assert.True(r.Metrics["transfer_dv_available_m_s"] >= r.Metrics["transfer_dv_required_m_s"]);
            Assert.Equal(1, r.Metrics["payload_deployed"]);
            Assert.Contains(events, e => e.Kind == "transfer_burn");
        }

        [Fact]
        public void C6_lunar_flyby_is_a_scripted_coast_then_a_fast_entry_and_recovery()
        {
            var r = FlyClean("C6", out var events, out _);
            Assert.Equal(MissionOutcome.Success, r.Outcome);
            Assert.Equal(1, r.Metrics["lunar_flyby_completed"]);
            Assert.Equal(1, r.Metrics["capsule_recovered"]);
            Assert.Equal(1, r.Metrics["crew_safe"]);
            Assert.Contains(events, e => e.Kind == "cinematic_coast" && e.Id == "lunar_flyby");
            Assert.InRange(r.Metrics["peak_heat_flux_w_m2"], 2e6, 3e7); // ~11 km/s return is far hotter than LEO
            Assert.InRange(r.Metrics["peak_g_load"], 3, 15);
        }

        [Fact]
        public void C7_enters_at_Mars_and_the_lander_touches_down_softly()
        {
            var r = FlyClean("C7", out var events, out var sim);
            Assert.Equal(MissionOutcome.Success, r.Outcome);
            Assert.Equal(1, r.Metrics["lander_landed_safely"]);
            Assert.InRange(r.Metrics["touchdown_speed_m_s"], 0, 3);
            Assert.Contains(events, e => e.Kind == "cinematic_coast" && e.Id == "mars_cruise");
            Assert.InRange(sim.State.RadiusM, Body.Mars.RadiusM - 1000, Body.Mars.RadiusM + 1000); // landed on Mars, not Earth
        }

        [Fact]
        public void An_under_rated_shield_burns_through_on_a_lunar_return()
        {
            var seed = CleanSeed("C6");
            var build = FlightBuild("C6", seed).WithChoice(Slots.HeatShield, "tps_reusable_ceramic_tiles");
            var setup = Setup("C6", seed);
            var sim = MissionSim.Create(FlightVehicleSpec.FromBuild(build, MissionFixture.Catalog), setup);
            var events = Fly(sim);
            Assert.Equal(MissionOutcome.Failure, sim.Result!.Outcome);
            Assert.Equal("burn_through", sim.Result.FailureMode);
            Assert.Equal("heat_shield", sim.Result.FailureSlot);
            Assert.Equal("F10", sim.Result.FailurePhase);
        }

        [Fact]
        public void Full_mission_hash_is_identical_for_identical_build_seed_and_inputs()
        {
            string Hash()
            {
                var sim = Create("C4", CleanSeed("C4"));
                var sha = System.Security.Cryptography.SHA256.Create();
                var input = new PilotInput { RequestedWarpFactor = 1000 };
                var text = new System.Text.StringBuilder();
                for (var i = 0; i < 3_000_000 && sim.Result == null; i++)
                {
                    var events = sim.Step(input);
                    text.Append(Newtonsoft.Json.JsonConvert.SerializeObject(events));
                    if (i % 97 == 0) text.Append(Newtonsoft.Json.JsonConvert.SerializeObject(sim.Snapshot()));
                }
                return Convert.ToBase64String(sha.ComputeHash(System.Text.Encoding.UTF8.GetBytes(text.ToString())));
            }
            Assert.Equal(Hash(), Hash());
        }

        [Fact]
        public void C8_booster_lands_at_two_metres_per_second_or_less_under_the_autopilot()
        {
            var r = FlyClean("C8", out var events, out var sim);
            output.WriteLine($"touchdown {r.Metrics["booster_touchdown_speed_m_s"]:F2} m/s, error {r.Metrics["booster_landing_error_km"]:F2} km");
            Assert.Equal(MissionOutcome.Success, r.Outcome);
            Assert.Equal(1, r.Metrics["booster_landed"]);
            Assert.Equal(1, r.Metrics["booster_recovered"]);
            Assert.InRange(r.Metrics["booster_touchdown_speed_m_s"], 0, 2);
            Assert.InRange(r.Metrics["booster_landing_error_km"], 0, MissionSim.BoosterLandingZoneRadiusKm);
            var f7b = events.Where(e => e.Phase == "F7b").Select(e => e.Kind + ":" + e.Id).ToList();
            Assert.Contains("phase_entered:F7b", f7b);
            Assert.Contains("minigame_cue:MG-24", f7b);
            Assert.Contains("booster_touchdown:landed", f7b);
            Assert.True(events.First(e => e.Id == "F7b").MetS < events.First(e => e.Kind == "booster_touchdown").MetS);
            Assert.True(events.First(e => e.Kind == "booster_touchdown").MetS < events.First(e => e.Id == "F8").MetS,
                "the booster is down before the payload reaches orbit operations");
        }

        [Fact]
        public void The_booster_is_a_second_state_visible_in_the_hud_and_its_reserve_is_spent_on_burns()
        {
            var sim = Create("C8", CleanSeed("C8"));
            var input = new PilotInput();
            while (sim.Snapshot().Booster == null && sim.Result == null) sim.Step(input);
            var first = sim.Snapshot().Booster!;
            Assert.True(first.AltitudeKm > 50);
            Assert.InRange(first.PropellantPct, 99, 100.0001);
            var minimum = 100.0;
            while (sim.Snapshot().Booster!.Landed == false && sim.Phase != "F8" && sim.Result == null)
            { sim.Step(input); minimum = Math.Min(minimum, sim.Snapshot().Booster!.PropellantPct); }
            Assert.True(minimum < 70, "boostback, entry and landing burns spend the reserve");
            Assert.True(minimum >= 0);
        }

        [Fact]
        public void A_second_pilot_who_sends_nothing_loses_the_booster_but_the_mission_continues()
        {
            var sim = Create("C8", CleanSeed("C8"), setup => setup.BoosterAutopilot = false);
            var events = Fly(sim);
            Assert.Equal(MissionOutcome.Success, sim.Result!.Outcome);
            Assert.Contains(events, e => e.Phase == "F7b" && e.Kind == "failure" && e.Id == "booster_landing_failure");
            Assert.Equal(0, sim.Result.Metrics["booster_landed"]);
            Assert.True(sim.Result.Metrics["booster_touchdown_speed_m_s"] > 20);
        }

        [Fact]
        public void A_second_pilot_can_fly_the_landing_burn_by_hand()
        {
            var sim = Create("C8", CleanSeed("C8"), setup => setup.BoosterAutopilot = false);
            var main = new PilotInput { RequestedWarpFactor = 1 };
            var landed = false;
            for (var i = 0; i < 3_000_000 && sim.Result == null; i++)
            {
                var b = sim.Snapshot().Booster;
                // Simple pilot: full throttle in the last 350 m, otherwise coast; hold both craft's throttle range valid.
                main.Booster.ThrottleFraction = b != null && b.AltitudeKm < 0.35 && b.VerticalSpeedMs < -30 ? 1 : 0;
                sim.Step(main);
                if (b != null && b.Landed) landed = true;
            }
            Assert.NotNull(sim.Result);
            Assert.True(sim.Result!.Metrics["booster_touchdown_speed_m_s"] < 60, "hand-flown burn slows the booster");
            _ = landed;
        }
    }
}
