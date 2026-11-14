using System;
using System.Linq;
using MissionForge.Core.Build;
using MissionForge.Core.Data;
using MissionForge.Core.Flight.Mission;
using MissionForge.Core.Tests.Data;
using Xunit;

namespace MissionForge.Core.Tests.Flight.Mission
{
    public static class MissionFixture
    {
        public static readonly GameCatalog Catalog = DesignFixture.Catalog();
        // Appendix A after PDR tank upgrade; choices copied from C1WalkthroughTests.
        public static BuildState C1(ulong seed = 2026) => BuildState.New("C1", seed)
            .WithChoice(Slots.LaunchSite, "site_west_coast_polar_range")
            .WithChoice(Slots.PayloadInstrument, "inst_multispectral_imager")
            .WithChoice(Slots.PayloadPower, "satpwr_deployable_solar_wings")
            .WithChoice(Slots.PayloadAttitude, "adcs_reaction_wheels_star_tracker")
            .WithChoice(Slots.Fairing, "fairing_small")
            .WithChoice(Slots.UpperStageEngine, "eng_kerolox_vacuum")
            .WithChoice(Slots.UpperStageEngineCount, "engcount_upper_1")
            .WithChoice(Slots.UpperStageTank, "tank_m")
            .WithChoice(Slots.StageSeparation, "sep_pyro_bolts_springs")
            .WithChoice(Slots.FirstStageEngine, "eng_kerolox_workhorse")
            .WithChoice(Slots.FirstStageEngineCount, "engcount_first_3")
            .WithChoice(Slots.FirstStageTank, "tank_s")
            .WithChoice(Slots.StructuralMaterial, "mat_aluminum_2219")
            .WithChoice(Slots.StrapOnBoosters, "strap_none")
            .WithChoice(Slots.BoosterRecovery, "brec_expendable")
            .WithChoice(Slots.Avionics, "avi_commercial_single")
            .WithChoice(Slots.Navigation, "nav_imu_gnss")
            .WithChoice(Slots.AeroControl, "aero_gimbal_only")
            .WithChoice(Slots.Rcs, "rcs_cold_gas")
            .WithChoice(Slots.PowerSystem, "pwr_deployable_solar_liion")
            .WithChoice(Slots.Communications, "comm_x_band")
            .WithChoice(Slots.MissionAssurance, "assur_standard");
    }
    public class VehicleSpecTests
    {
        [Fact]
        public void AppendixA_matches_dashboard_and_hand_checked_masses_and_delta_v()
        {
            var build = MissionFixture.C1();
            var spec = FlightVehicleSpec.FromBuild(build, MissionFixture.Catalog);
            var dashboard = Dashboard.Compute(build, MissionFixture.Catalog);
            Assert.Equal(191803, spec.LiftoffMassKg, 6);
            Assert.Equal(63793, spec.Stages[1].InitialMassKg, 6);
            Assert.Equal(2856.91, spec.Stages[0].IdealDeltaVMs, 1);
            Assert.Equal(9632.34, spec.Stages[1].IdealDeltaVMs, 1);
            Assert.Equal(dashboard.TotalMassKg, spec.LiftoffMassKg);
            Assert.Equal(dashboard.StagesDvMps, spec.IdealDeltaVMs);
            for (var i = 0; i < spec.Stages.Count; i++)
            {
                var stage = spec.Stages[i];
                Assert.Equal(dashboard.Phases[i].InitialMassKg, stage.InitialMassKg);
                Assert.Equal(dashboard.Phases[i].FinalMassKg, stage.FinalMassKg);
                var dv = stage.EffectiveIspS * 9.80665 * Math.Log(stage.InitialMassKg / stage.FinalMassKg);
                Assert.InRange(dv / dashboard.Phases[i].DvMps, 0.995, 1.005);
            }
            Assert.Equal(2550000, spec.Stages[0].Engine.ThrustSlN);
            Assert.Equal(400, spec.FairingMassKg);
            Assert.Equal(7410, spec.FirstDryMassKg);
            Assert.Equal(3600, spec.UpperDryMassKg);
            Assert.Equal(8010, spec.Stages[0].JettisonMassKg);
            Assert.Equal(spec.LiftoffMassKg, spec.PayloadMassKg + spec.FirstDryMassKg
                + spec.UpperDryMassKg + spec.FairingMassKg + 200 + spec.Stages.Sum(s => s.PropellantMassKg));
        }
        [Fact]
        public void Unfueled_vehicle_is_rejected() => Assert.Throws<ArgumentException>(() =>
            FlightVehicleSpec.FromBuild(BuildState.New("C1", 1), MissionFixture.Catalog));

        [Theory]
        [InlineData("strap_2_small_solid")]
        [InlineData("strap_2_liquid_side")]
        public void Parallel_boosters_preserve_stack_mass_and_combined_thrust(string boosters)
        {
            var build = MissionFixture.C1().WithChoice(Slots.StrapOnBoosters, boosters);
            var v = new Vehicle(build, MissionFixture.Catalog);
            var spec = FlightVehicleSpec.FromBuild(build, MissionFixture.Catalog);
            Assert.Equal("boosters", spec.Stages[0].Id);
            Assert.Equal(v.LiftoffThrustSlN, spec.Stages[0].Engine.ThrustSlN);
            Assert.Equal(v.FirstEngineCount, spec.Stages[0].EngineCount);
            var mass = spec.LiftoffMassKg;
            foreach (var stage in spec.Stages)
            {
                Assert.Equal(stage.InitialMassKg, mass, 6);
                mass -= stage.PropellantMassKg + stage.JettisonMassKg;
            }
            Assert.Equal(spec.PayloadMassKg + spec.UpperDryMassKg, mass, 6);
            Assert.Equal(Dashboard.Compute(build, MissionFixture.Catalog).StagesDvMps, spec.IdealDeltaVMs);
        }
    }
}
