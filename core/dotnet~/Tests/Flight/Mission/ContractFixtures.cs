using System;
using System.Collections.Generic;
using System.Linq;
using MissionForge.Core.Build;
using MissionForge.Core.Data;
using MissionForge.Core.Flight.Mission;
using Xunit;
using Xunit.Abstractions;

namespace MissionForge.Core.Tests.Flight.Mission
{
    /// <summary>
    /// Complete BuildStates for the contracts other than C1 (C1 lives in <see cref="MissionFixture"/>).
    /// Every vote slot of the contract is chosen from the parts the contract offers. Propulsion was found by
    /// brute-forcing the offered engine / count / tank / separation / material / strap-on options for a build
    /// with no Blocker, lift-off TWR above 1.2 and Δv at least 3% over the contract requirement (cheapest first).
    /// C0 is a design-table special case: it returns a payload but has no heat shield vote, so
    /// <c>return_heat_shield</c> is a known Blocker that no C0 build can clear (see validation_rules.json notes).
    /// </summary>
    public static class ContractFixtures
    {
        /// <summary>C0 Hello Space: small suborbital sounding rocket, 100 kg science package, parachute recovery.</summary>
        public static BuildState C0(ulong seed = 2026) => BuildState.New("C0", seed)
            .WithChoice(Slots.LaunchSite, "site_subtropical_coast")
            .WithChoice(Slots.Fairing, "fairing_small")
            .WithChoice(Slots.UpperStageEngine, "eng_hypergolic_storable")
            .WithChoice(Slots.UpperStageEngineCount, "engcount_upper_1")
            .WithChoice(Slots.UpperStageTank, "tank_xs")
            .WithChoice(Slots.StageSeparation, "sep_pyro_bolts_springs")
            .WithChoice(Slots.FirstStageEngine, "eng_kerolox_workhorse")
            .WithChoice(Slots.FirstStageEngineCount, "engcount_first_1")
            .WithChoice(Slots.FirstStageTank, "tank_xs")
            .WithChoice(Slots.StructuralMaterial, "mat_aluminum_2219")
            .WithChoice(Slots.StrapOnBoosters, "strap_none")
            .WithChoice(Slots.BoosterRecovery, "brec_parachute_splashdown")
            .WithChoice(Slots.Avionics, "avi_commercial_single")
            .WithChoice(Slots.Navigation, "nav_imu_gnss")
            .WithChoice(Slots.AeroControl, "aero_fins")
            .WithChoice(Slots.Rcs, "rcs_cold_gas")
            .WithChoice(Slots.PowerSystem, "pwr_primary_batteries")
            .WithChoice(Slots.Communications, "comm_uhf")
            .WithChoice(Slots.MissionAssurance, "assur_standard");

        /// <summary>C3 Station Resupply: standard capsule, ablative shield, parachute splashdown recovery.</summary>
        public static BuildState C3(ulong seed = 2026) => BuildState.New("C3", seed)
            .WithChoice(Slots.LaunchSite, "site_subtropical_coast")
            .WithChoice(Slots.Capsule, "cap_standard")
            .WithChoice(Slots.HeatShield, "tps_avcoat_ablator")
            .WithChoice(Slots.CapsuleRecovery, "crec_parachutes_splashdown")
            .WithChoice(Slots.UpperStageEngine, "eng_kerolox_vacuum")
            .WithChoice(Slots.UpperStageEngineCount, "engcount_upper_1")
            .WithChoice(Slots.UpperStageTank, "tank_l")
            .WithChoice(Slots.StageSeparation, "sep_hot_staging")
            .WithChoice(Slots.FirstStageEngine, "eng_methalox_full_flow")
            .WithChoice(Slots.FirstStageEngineCount, "engcount_first_3")
            .WithChoice(Slots.FirstStageTank, "tank_m")
            .WithChoice(Slots.StructuralMaterial, "mat_aluminum_2219")
            .WithChoice(Slots.StrapOnBoosters, "strap_none")
            .WithChoice(Slots.BoosterRecovery, "brec_expendable")
            .WithChoice(Slots.Avionics, "avi_triple_redundant_commercial")
            .WithChoice(Slots.Navigation, "nav_imu_gnss_star_tracker")
            .WithChoice(Slots.AeroControl, "aero_gimbal_only")
            .WithChoice(Slots.Rcs, "rcs_bipropellant")
            .WithChoice(Slots.PowerSystem, "pwr_deployable_solar_liion")
            .WithChoice(Slots.Communications, "comm_s_band")
            .WithChoice(Slots.MissionAssurance, "assur_standard");

        /// <summary>C4 Crew to Orbit: crewed standard capsule, escape tower, ablative shield, parachute splashdown.</summary>
        public static BuildState C4(ulong seed = 2026) => BuildState.New("C4", seed)
            .WithChoice(Slots.LaunchSite, "site_subtropical_coast")
            .WithChoice(Slots.Capsule, "cap_standard")
            .WithChoice(Slots.LifeSupport, "ls_regenerative")
            .WithChoice(Slots.HeatShield, "tps_avcoat_ablator")
            .WithChoice(Slots.CapsuleRecovery, "crec_parachutes_splashdown")
            .WithChoice(Slots.LaunchEscape, "les_escape_tower")
            .WithChoice(Slots.UpperStageEngine, "eng_methalox_vacuum")
            .WithChoice(Slots.UpperStageEngineCount, "engcount_upper_1")
            .WithChoice(Slots.UpperStageTank, "tank_l")
            .WithChoice(Slots.StageSeparation, "sep_hot_staging")
            .WithChoice(Slots.FirstStageEngine, "eng_methalox_full_flow")
            .WithChoice(Slots.FirstStageEngineCount, "engcount_first_3")
            .WithChoice(Slots.FirstStageTank, "tank_m")
            .WithChoice(Slots.StructuralMaterial, "mat_aluminum_2219")
            .WithChoice(Slots.StrapOnBoosters, "strap_none")
            .WithChoice(Slots.BoosterRecovery, "brec_expendable")
            .WithChoice(Slots.Avionics, "avi_triple_redundant_commercial")
            .WithChoice(Slots.Navigation, "nav_imu_gnss_star_tracker")
            .WithChoice(Slots.AeroControl, "aero_gimbal_only")
            .WithChoice(Slots.Rcs, "rcs_bipropellant")
            .WithChoice(Slots.PowerSystem, "pwr_deployable_solar_liion")
            .WithChoice(Slots.Communications, "comm_s_band")
            .WithChoice(Slots.MissionAssurance, "assur_standard");

        /// <summary>C5 Geostationary Transfer: 4 t comsat to GTO with a restartable kerolox upper stage.</summary>
        public static BuildState C5(ulong seed = 2026) => BuildState.New("C5", seed)
            .WithChoice(Slots.LaunchSite, "site_equatorial_spaceport")
            .WithChoice(Slots.PayloadPower, "satpwr_large_deployable_array")
            .WithChoice(Slots.PayloadAttitude, "adcs_reaction_wheels_star_tracker")
            .WithChoice(Slots.Fairing, "fairing_large")
            .WithChoice(Slots.UpperStageEngine, "eng_kerolox_vacuum")
            .WithChoice(Slots.UpperStageEngineCount, "engcount_upper_1")
            .WithChoice(Slots.UpperStageTank, "tank_m")
            .WithChoice(Slots.StageSeparation, "sep_hot_staging")
            .WithChoice(Slots.FirstStageEngine, "eng_methalox_full_flow")
            .WithChoice(Slots.FirstStageEngineCount, "engcount_first_3")
            .WithChoice(Slots.FirstStageTank, "tank_m")
            .WithChoice(Slots.StructuralMaterial, "mat_aluminum_2219")
            .WithChoice(Slots.StrapOnBoosters, "strap_none")
            .WithChoice(Slots.BoosterRecovery, "brec_expendable")
            .WithChoice(Slots.Avionics, "avi_radiation_hardened")
            .WithChoice(Slots.Navigation, "nav_imu_gnss")
            .WithChoice(Slots.AeroControl, "aero_gimbal_only")
            .WithChoice(Slots.Rcs, "rcs_bipropellant")
            .WithChoice(Slots.PowerSystem, "pwr_deployable_solar_liion")
            .WithChoice(Slots.Communications, "comm_x_band")
            .WithChoice(Slots.MissionAssurance, "assur_standard");

        /// <summary>
        /// C6 Lunar Flyby and Return: deep-space capsule, PICA shield (12 km/s rating vs 11 km/s entry),
        /// escape tower, parachute recovery. Needs two heavy solid strap-ons plus an XL core to reach 12.6 km/s.
        /// </summary>
        public static BuildState C6(ulong seed = 2026) => BuildState.New("C6", seed)
            .WithChoice(Slots.LaunchSite, "site_subtropical_coast")
            .WithChoice(Slots.Capsule, "cap_deep_space")
            .WithChoice(Slots.LifeSupport, "ls_regenerative")
            .WithChoice(Slots.HeatShield, "tps_pica_ablator")
            .WithChoice(Slots.CapsuleRecovery, "crec_parachutes_splashdown")
            .WithChoice(Slots.LaunchEscape, "les_escape_tower")
            .WithChoice(Slots.UpperStageEngine, "eng_hydrolox_vacuum")
            .WithChoice(Slots.UpperStageEngineCount, "engcount_upper_1")
            .WithChoice(Slots.UpperStageTank, "tank_xl")
            .WithChoice(Slots.StageSeparation, "sep_hot_staging")
            .WithChoice(Slots.FirstStageEngine, "eng_methalox_full_flow")
            .WithChoice(Slots.FirstStageEngineCount, "engcount_first_5")
            .WithChoice(Slots.FirstStageTank, "tank_xl")
            .WithChoice(Slots.StructuralMaterial, "mat_aluminum_2219")
            .WithChoice(Slots.StrapOnBoosters, "strap_2_heavy_solid")
            .WithChoice(Slots.BoosterRecovery, "brec_expendable")
            .WithChoice(Slots.Avionics, "avi_rad_hard_backup")
            .WithChoice(Slots.Navigation, "nav_imu_gnss_star_tracker")
            .WithChoice(Slots.AeroControl, "aero_gimbal_only")
            .WithChoice(Slots.Rcs, "rcs_bipropellant")
            .WithChoice(Slots.PowerSystem, "pwr_deployable_solar_liion")
            .WithChoice(Slots.Communications, "comm_x_band")
            .WithChoice(Slots.MissionAssurance, "assur_standard");

        /// <summary>C7 Mars Lander: legged lander (chute + legs EDL) on a methalox/kerolox L-class stack.</summary>
        public static BuildState C7(ulong seed = 2026) => BuildState.New("C7", seed)
            .WithChoice(Slots.LaunchSite, "site_equatorial_spaceport")
            .WithChoice(Slots.Lander, "lander_legged")
            .WithChoice(Slots.Fairing, "fairing_standard")
            .WithChoice(Slots.UpperStageEngine, "eng_kerolox_vacuum")
            .WithChoice(Slots.UpperStageEngineCount, "engcount_upper_1")
            .WithChoice(Slots.UpperStageTank, "tank_l")
            .WithChoice(Slots.StageSeparation, "sep_hot_staging")
            .WithChoice(Slots.FirstStageEngine, "eng_methalox_full_flow")
            .WithChoice(Slots.FirstStageEngineCount, "engcount_first_5")
            .WithChoice(Slots.FirstStageTank, "tank_l")
            .WithChoice(Slots.StructuralMaterial, "mat_aluminum_2219")
            .WithChoice(Slots.StrapOnBoosters, "strap_none")
            .WithChoice(Slots.BoosterRecovery, "brec_expendable")
            .WithChoice(Slots.Avionics, "avi_rad_hard_backup")
            .WithChoice(Slots.Navigation, "nav_imu_gnss_star_tracker")
            .WithChoice(Slots.AeroControl, "aero_gimbal_only")
            .WithChoice(Slots.Rcs, "rcs_bipropellant")
            .WithChoice(Slots.PowerSystem, "pwr_deployable_solar_liion")
            .WithChoice(Slots.Communications, "comm_x_band")
            .WithChoice(Slots.MissionAssurance, "assur_standard");

        /// <summary>C8 Reusable Booster: 10 t to LEO with propulsive RTLS recovery (needs grid fins).</summary>
        public static BuildState C8(ulong seed = 2026) => BuildState.New("C8", seed)
            .WithChoice(Slots.LaunchSite, "site_subtropical_coast")
            .WithChoice(Slots.Fairing, "fairing_standard")
            .WithChoice(Slots.UpperStageEngine, "eng_kerolox_vacuum")
            .WithChoice(Slots.UpperStageEngineCount, "engcount_upper_1")
            .WithChoice(Slots.UpperStageTank, "tank_m")
            .WithChoice(Slots.StageSeparation, "sep_hot_staging")
            .WithChoice(Slots.FirstStageEngine, "eng_methalox_full_flow")
            .WithChoice(Slots.FirstStageEngineCount, "engcount_first_3")
            .WithChoice(Slots.FirstStageTank, "tank_m")
            .WithChoice(Slots.StructuralMaterial, "mat_aluminum_2219")
            .WithChoice(Slots.StrapOnBoosters, "strap_none")
            .WithChoice(Slots.BoosterRecovery, "brec_propulsive_rtls")
            .WithChoice(Slots.Avionics, "avi_commercial_single")
            .WithChoice(Slots.Navigation, "nav_imu_gnss")
            .WithChoice(Slots.AeroControl, "aero_grid_fins")
            .WithChoice(Slots.Rcs, "rcs_cold_gas")
            .WithChoice(Slots.PowerSystem, "pwr_deployable_solar_liion")
            .WithChoice(Slots.Communications, "comm_s_band")
            .WithChoice(Slots.MissionAssurance, "assur_standard");
    }

    public class ContractFixtureTests
    {
        private readonly ITestOutputHelper _out;
        public ContractFixtureTests(ITestOutputHelper output) { _out = output; }

        public static IEnumerable<object[]> Fixtures() => new[]
        {
            new object[] { "C0" }, new object[] { "C3" }, new object[] { "C4" }, new object[] { "C5" },
            new object[] { "C6" }, new object[] { "C7" }, new object[] { "C8" },
        };

        private static BuildState Build(string id) => id switch
        {
            "C0" => ContractFixtures.C0(),
            "C3" => ContractFixtures.C3(),
            "C4" => ContractFixtures.C4(),
            "C5" => ContractFixtures.C5(),
            "C6" => ContractFixtures.C6(),
            "C7" => ContractFixtures.C7(),
            "C8" => ContractFixtures.C8(),
            _ => throw new ArgumentOutOfRangeException(nameof(id)),
        };

        [Theory]
        [MemberData(nameof(Fixtures))]
        public void Fixture_builds_a_flight_spec_with_every_vote_chosen(string id)
        {
            var catalog = MissionFixture.Catalog;
            var build = Build(id);
            var spec = FlightVehicleSpec.FromBuild(build, catalog);
            var dashboard = Dashboard.Compute(build, catalog);
            var vehicle = new Vehicle(build, catalog);
            var contract = catalog.Contract(id);

            _out.WriteLine($"{id}: liftoff mass {spec.LiftoffMassKg:F0} kg, total dv {dashboard.TotalDvMps:F0} m/s " +
                           $"(stages {dashboard.StagesDvMps:F0}), required {contract.DvRequiredMps:F0} m/s, " +
                           $"liftoff TWR {dashboard.LiftoffTwr:F2}, liftoff thrust {vehicle.LiftoffThrustSlN / 1000:F0} kN");
            foreach (var issue in Validator.Validate(build, catalog)) _out.WriteLine("  " + issue);

            Assert.True(spec.LiftoffMassKg > 0);
            Assert.NotNull(dashboard.LiftoffTwr);
            Assert.True(dashboard.LiftoffTwr > 1.2, $"{id} TWR {dashboard.LiftoffTwr}");
            Assert.True(dashboard.TotalDvMps >= contract.DvRequiredMps, $"{id} dv {dashboard.TotalDvMps} < {contract.DvRequiredMps}");

            foreach (var vote in contract.Votes)
            {
                Assert.True(build.Has(vote.Slot), $"{id} missing vote {vote.Slot}");
                var offered = VoteOptions.Offered(BuildState.New(id, 2026), catalog, vote.Slot);
                Assert.Contains(offered, p => p.Id == build.Choice(vote.Slot));
            }
        }

        [Fact]
        public void Fixtures_have_the_contract_specific_parts()
        {
            Assert.Equal("les_escape_tower", ContractFixtures.C4().Choice(Slots.LaunchEscape));
            Assert.Equal("crec_parachutes_splashdown", ContractFixtures.C3().Choice(Slots.CapsuleRecovery));
            Assert.Equal("tps_pica_ablator", ContractFixtures.C6().Choice(Slots.HeatShield));
            Assert.Equal("brec_propulsive_rtls", ContractFixtures.C8().Choice(Slots.BoosterRecovery));
            Assert.Equal("aero_grid_fins", ContractFixtures.C8().Choice(Slots.AeroControl));
            Assert.Equal("lander_legged", ContractFixtures.C7().Choice(Slots.Lander));
        }

        [Fact]
        public void Fixtures_honour_the_seed()
        {
            Assert.Equal(7UL, ContractFixtures.C8(7).Seed);
        }
    }
}
