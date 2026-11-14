using System;
using System.Collections.Generic;
using System.Linq;
using MissionForge.Core.Build;
using MissionForge.Core.Data;
using Xunit;

namespace MissionForge.Core.Tests.Build
{
    /// <summary>
    /// Every Readiness Dashboard metric of GAME_DESIGN.md 6.3 on a small vehicle with round numbers, so each
    /// expected value can be checked by hand (arithmetic in the comments). g0 = 9.80665 m/s².
    /// </summary>
    public class DashboardTests
    {
        private const double G0 = 9.80665;

        private static PartStats S(params (string k, double v)[] n) =>
            new PartStats(n.ToDictionary(x => x.k, x => x.v));

        private static PartStats S2((string k, double v)[] n, params (string k, string v)[] t) =>
            new PartStats(n.ToDictionary(x => x.k, x => x.v), t.ToDictionary(x => x.k, x => x.v));

        /// <summary>
        /// Reference vehicle: 1 000 kg payload; upper stage 100 kN / 350 s / 0.5 t on a 10 t tank; first stage
        /// 3 × (1 000 kN SL, 1 100 kN vac, 300 / 340 s, 1 t) on a 100 t tank; kerolox structural ratio 0.05.
        /// </summary>
        private static GameCatalog Catalog(double? inclination = null, bool returning = false, double? entrySpeed = null,
            bool satellite = false)
        {
            var parts = new List<PartDef>
            {
                new PartDef("e1", PartCategories.FirstStageEngine, "E1", 1000, 2, 30, 2, 0.99, Maturity.Proven,
                    S(("thrust_sl_kN", 1000), ("thrust_vac_kN", 1100), ("isp_sl_s", 300), ("isp_vac_s", 340)), "RP1_LOX"),
                new PartDef("u1", PartCategories.UpperStageEngine, "U1", 500, 3, 20, 3, 0.98, Maturity.Proven,
                    S(("thrust_vac_kN", 100), ("isp_vac_s", 350), ("restarts", 3)), "RP1_LOX"),
                new PartDef("kick", PartCategories.UpperStageEngine, "Kick", 120, 2, 0, 0, 0.992, Maturity.Proven,
                    S(("thrust_vac_kN", 68), ("isp_vac_s", 290), ("fixed_propellant_t", 2), ("restarts", 0)), "SOLID"),
                new PartDef("n1", PartCategories.EngineCount, "1", 0, 0, 0, 0, null, Maturity.Proven,
                    S2(new[] { ("engine_count", 1.0) }, ("stage", "first"), ("engine_out_capability", "no"))),
                new PartDef("n3", PartCategories.EngineCount, "3", 0, 0, 0, 3, null, Maturity.Proven,
                    S2(new[] { ("engine_count", 3.0), ("reliability_modifier", -0.003) }, ("stage", "first"), ("engine_out_capability", "partial"))),
                new PartDef("u_n1", PartCategories.EngineCount, "1", 0, 0, 0, 0, null, Maturity.Proven,
                    S2(new[] { ("engine_count", 1.0) }, ("stage", "upper"))),
                new PartDef("tank", PartCategories.TankSize, "T", 0, 0, 0, 0, null, Maturity.Proven,
                    S(("first_stage_propellant_t", 100), ("upper_stage_propellant_t", 10))),
                new PartDef("alli", PartCategories.StructuralMaterial, "Al-Li", 0, 0, 0, 4, null, Maturity.Proven,
                    S(("dry_mass_multiplier", 0.88), ("cost_multiplier", 1.4))),
                new PartDef("rtls", PartCategories.BoosterRecovery, "RTLS", 0, 0, 0, 0, null, Maturity.Proven,
                    S(("dv_cost_fraction", 0.15), ("refund_fraction", 0.6))),
                new PartDef("hot", PartCategories.SeparationSystem, "Hot", 600, 0, 0, 0, 0.985, Maturity.Proven,
                    S(("dv_bonus_fraction", 0.015))),
                new PartDef("site285", PartCategories.LaunchSite, "Cape", 0, 10, 5, 0, null, Maturity.Proven, S(("latitude_deg", 28.5))),
                new PartDef("solid2", PartCategories.StrapOnBooster, "2 solids", 49_000, 6, 0, 0, null, Maturity.Proven,
                    S(("booster_count", 2), ("thrust_sl_each_kN", 1600), ("burn_time_s", 90))),
                new PartDef("liquid2", PartCategories.StrapOnBooster, "2 liquid", 0, 0, 0, 15, null, Maturity.Proven,
                    S(("booster_count", 2), ("cost_first_stage_mult", 2)), tags: new[] { "mirror_first_stage" }),
                new PartDef("fins", PartCategories.AeroControl, "Fins", 0, 0, 0, 0, null, Maturity.Proven, S(), tags: new[] { "fins" }),
                new PartDef("shield", PartCategories.HeatShield, "PICA", 900, 10, 0, 0, null, Maturity.Proven, S(("max_entry_speed_km_s", 12))),
                new PartDef("inst", PartCategories.Instrument, "SAR", 45, 20, 0, 0, null, Maturity.Proven,
                    S(("power_W", 300), ("data_GB_per_day", 25))),
                new PartDef("cells", PartCategories.SatellitePower, "Body cells", 3, 0, 0, 0, null, Maturity.Proven, S(("generation_avg_W", 40))),
                new PartDef("relay", PartCategories.Communications, "Relay", 0, 3, 0, 0, null, Maturity.Proven,
                    S2(Array.Empty<(string, double)>(), ("continuous_coverage", "true"))),
                new PartDef("sband", PartCategories.Communications, "S", 0, 0, 0, 0, null, Maturity.Proven, S(("data_rate_GB_per_pass", 0.2))),
            };
            var votes = new List<ContractVote>
            {
                new ContractVote(PartCategories.LaunchSite, new[] { "site285" }),
                new ContractVote(PartCategories.UpperStageEngine, new[] { "u1", "kick" }),
                new ContractVote(PartCategories.EngineCount, new[] { "u_n1" }, stage: "upper"),
                new ContractVote(PartCategories.TankSize, new[] { "tank" }, stage: "upper"),
                new ContractVote(PartCategories.SeparationSystem, new[] { "hot" }),
                new ContractVote(PartCategories.FirstStageEngine, new[] { "e1" }),
                new ContractVote(PartCategories.EngineCount, new[] { "n1", "n3" }, stage: "first"),
                new ContractVote(PartCategories.TankSize, new[] { "tank" }, stage: "first"),
                new ContractVote(PartCategories.StructuralMaterial, new[] { "alli" }),
                new ContractVote(PartCategories.StrapOnBooster, new[] { "solid2", "liquid2" }),
                new ContractVote(PartCategories.BoosterRecovery, new[] { "rtls" }),
                new ContractVote(PartCategories.AeroControl, new[] { "fins" }),
                new ContractVote(PartCategories.Communications, new[] { "relay", "sband" }),
            };
            if (returning) votes.Add(new ContractVote(PartCategories.HeatShield, new[] { "shield" }));
            if (satellite)
            {
                votes.Add(new ContractVote(PartCategories.Instrument, new[] { "inst" }));
                votes.Add(new ContractVote(PartCategories.SatellitePower, new[] { "cells" }));
            }
            var contract = new ContractDef("T", "Test", 1000, 9000, 100, 200, votes, inclinationDeg: inclination,
                returning: returning, entrySpeedMps: entrySpeed);
            return new GameCatalog(parts, new[] { contract });
        }

        private static BuildState Base() => BuildState.New("T", 7)
            .WithChoice(Slots.UpperStageEngine, "u1").WithChoice(Slots.UpperStageEngineCount, "u_n1").WithChoice(Slots.UpperStageTank, "tank")
            .WithChoice(Slots.FirstStageEngine, "e1").WithChoice(Slots.FirstStageEngineCount, "n3").WithChoice(Slots.FirstStageTank, "tank");

        [Fact]
        public void Total_mass_includes_dry_tank_mass_from_structural_ratios()
        {
            var d = Dashboard.Compute(Base(), Catalog());
            // Upper tank dry = 10 000 kg × 0.05 = 500 kg; first tank dry = 100 000 × 0.05 = 5 000 kg.
            Assert.Equal(500.0, d.Mass.UpperTankDryKg, 9);
            Assert.Equal(5_000.0, d.Mass.FirstTankDryKg, 9);
            // 1 000 payload + 500 upper engine + 500 + 10 000 + 3 × 1 000 engines + 5 000 + 100 000 = 120 000 kg
            Assert.Equal(120_000.0, d.TotalMassKg, 9);
        }

        [Fact]
        public void Liftoff_and_upper_stage_TWR()
        {
            var d = Dashboard.Compute(Base(), Catalog());
            // Lift-off: 3 × 1 000 000 N / (120 000 kg × 9.80665) = 3 000 000 / 1 176 798 = 2.54929
            Assert.Equal(2.54929, d.LiftoffTwr!.Value, 5);
            Assert.Equal(TwrStatus.High, d.LiftoffTwrStatus);
            // Upper: 100 000 N / ((1 000 + 500 + 500 + 10 000) kg × 9.80665) = 100 000 / 117 679.8 = 0.84976
            Assert.Equal(0.84976, d.UpperStageTwr!.Value, 5);
            Assert.False(d.UpperStageTwrWarning);
        }

        [Fact]
        public void Upper_stage_TWR_below_0_3_warns()
        {
            // Kick motor: 68 000 N / ((1 000 + 120 + 2 000) kg × 9.80665) = 68 000 / 30 596.7 = 2.2224 — no warning.
            // With the 100 t-tank first stage single engine only the lift-off TWR changes, so check the flag on a
            // heavier upper stack instead: U1 on the 10 t tank with a 30 t payload contract would be 100 000 /
            // (42 000 × 9.80665) = 0.243 < 0.3. Here: the kick motor's own TWR is high.
            var kick = Base().WithChoice(Slots.UpperStageEngine, "kick");
            var d = Dashboard.Compute(kick, Catalog());
            Assert.Equal(2_000.0, d.Mass.UpperPropellantKg, 9);   // fixed 2 t; the tank vote is ignored
            Assert.Equal(0.0, d.Mass.UpperTankDryKg, 9);
            Assert.Equal(68_000.0 / (3_120.0 * G0), d.UpperStageTwr!.Value, 9);

            var heavy = new GameCatalog(Catalog().Parts.Values, new[]
            {
                new ContractDef("T", "Heavy", 30_000, 9000, 100, 200, Catalog().Contract("T").Votes.ToList()),
            });
            var dh = Dashboard.Compute(Base(), heavy);
            // 100 000 / ((30 000 + 500 + 500 + 10 000) × 9.80665) = 100 000 / 402 072.7 = 0.24871
            Assert.Equal(0.24871, dh.UpperStageTwr!.Value, 5);
            Assert.True(dh.UpperStageTwrWarning);
        }

        [Fact]
        public void Delta_v_per_stage_with_effective_Isp()
        {
            var d = Dashboard.Compute(Base(), Catalog());
            // First stage: Isp_eff = 300 + 0.5 × (340 − 300) = 320 s; Δv = 320 × 9.80665 × ln(120 000 / 20 000)
            //   = 3 138.128 × 1.791759 = 5 622.77 m/s
            var first = d.Phases.Single(p => p.Id == "first");
            Assert.Equal(320.0, first.IspEffS, 9);
            Assert.Equal(5622.77, first.DvMps, 2);
            // Upper: 350 × 9.80665 × ln(12 000 / 2 000) = 3 432.3275 × 1.791759 = 6 149.91 m/s
            var upper = d.Phases.Single(p => p.Id == "upper");
            Assert.Equal(6149.91, upper.DvMps, 2);
            Assert.Equal(11772.68, d.TotalDvMps, 2);
            // Margin vs 9 000 m/s: (11 772.68 − 9 000) / 9 000 = 0.30808
            Assert.Equal(0.30808, d.DvMarginFraction, 5);
        }

        [Fact]
        public void Launch_site_rotation_boost_and_plane_change()
        {
            // 465 m/s × cos(28.5°) = 465 × 0.878817 = 408.65 m/s for an ISS-like 51.6° target (no plane change).
            var d = Dashboard.Compute(Base().WithChoice(Slots.LaunchSite, "site285"), Catalog(inclination: 51.6));
            Assert.Equal(408.65, d.RotationBoostMps, 2);
            Assert.Equal(0.0, d.PlaneChangePenaltyMps);
            Assert.Equal(11772.68 + 408.65, d.TotalDvMps, 1);

            // 20° target from 28.5°: plane change 2 × 7 800 × sin(8.5° / 2) = 15 600 × 0.074108 = 1 156.09 m/s.
            var low = Dashboard.Compute(Base().WithChoice(Slots.LaunchSite, "site285"), Catalog(inclination: 20));
            Assert.Equal(1156.09, low.PlaneChangePenaltyMps, 2);

            // Polar / retrograde (≥ 90°): no eastward boost.
            Assert.Equal(0.0, Dashboard.SiteEffects(28.5, 97.6).boostMps);
        }

        [Fact]
        public void Material_multiplier_scales_dry_tank_mass()
        {
            var d = Dashboard.Compute(Base().WithChoice(Slots.StructuralMaterial, "alli"), Catalog());
            // Al-Li 0.88×: first tank 100 000 × 0.05 × 0.88 = 4 400 kg, upper 10 000 × 0.05 × 0.88 = 440 kg.
            Assert.Equal(4_400.0, d.Mass.FirstTankDryKg, 9);
            Assert.Equal(440.0, d.Mass.UpperTankDryKg, 9);
            // Total 120 000 − 600 − 60 = 119 340 kg; first-stage Δv = 320 × 9.80665 × ln(119 340 / 19 340) = 5 710.77 m/s
            Assert.Equal(119_340.0, d.TotalMassKg, 9);
            Assert.Equal(5710.77, d.Phases.Single(p => p.Id == "first").DvMps, 2);
        }

        [Fact]
        public void Booster_recovery_costs_a_fraction_of_first_stage_delta_v()
        {
            var d = Dashboard.Compute(Base().WithChoice(Slots.BoosterRecovery, "rtls"), Catalog());
            // RTLS −15 % of the first-stage Δv: 0.15 × 5 622.77 = 843.42 m/s
            Assert.Equal(843.42, d.RecoveryDvCostMps, 2);
            Assert.Equal(11772.68 - 843.42, d.TotalDvMps, 1);
        }

        [Fact]
        public void Hot_staging_adds_one_and_a_half_percent()
        {
            var d = Dashboard.Compute(Base().WithChoice(Slots.StageSeparation, "hot"), Catalog());
            // The 600 kg vented interstage changes the stage masses, so recompute: total 120 600 kg.
            //   Δv1 = 320 g0 ln(120 600 / 20 600) = 3 138.128 × 1.767189 = 5 545.66 m/s; Δv2 unchanged 6 149.91 m/s
            //   bonus = 0.015 × (5 545.66 + 6 149.91) = 175.43 m/s
            var stages = d.Phases.Sum(p => p.DvMps);
            Assert.Equal(5545.66, d.Phases.Single(p => p.Id == "first").DvMps, 2);
            Assert.Equal(175.43, d.HotStagingBonusMps, 2);
            Assert.Equal(stages * 1.015, d.TotalDvMps, 6);
        }

        [Fact]
        public void Strap_on_solids_burn_as_a_parallel_stage()
        {
            var d = Dashboard.Compute(Base().WithChoice(Slots.StrapOnBoosters, "solid2"), Catalog());
            // Lift-off: (3 × 1 000 + 2 × 1 600) kN = 6 200 000 N over 218 000 kg → TWR = 6 200 000 / (218 000 g0) = 2.90011
            Assert.Equal(218_000.0, d.TotalMassKg, 9);
            Assert.Equal(2.90011, d.LiftoffTwr!.Value, 5);
            // Boosters: propellant 2 × 49 000 × 0.88 = 86 240 kg, Isp 250 / 280 s (data has none: Core defaults), burn 90 s.
            //   core ṁ = 3 300 000 / (340 g0) = 989.7246 kg/s, booster ṁ = 3 200 000 / (280 g0) = 1 165.3900 kg/s
            //   core propellant used in 90 s = 89 075.21 kg; Isp_eff = (989.72 × 320 + 1 165.39 × 265) / 2 155.11 = 290.2584 s
            //   Δv_b = 290.2584 g0 ln(218 000 / (218 000 − 86 240 − 89 075.21)) = 2 846.48 × ln(5.10720) = 4 641.59 m/s
            var b = d.Phases.Single(p => p.Id == "boosters");
            Assert.Equal(90.0, b.BurnTimeS, 9);
            Assert.Equal(290.2584, b.IspEffS, 4);
            Assert.Equal(4641.59, b.DvMps, 2);
            // Then drop 2 × 49 000 × 0.12 = 11 760 kg of casings: core continues from 30 924.79 kg with 10 924.79 kg left:
            //   Δv = 320 g0 ln(30 924.79 / 20 000) = 3 138.128 × 0.435824 = 1 367.68 m/s
            Assert.Equal(1367.68, d.Phases.Single(p => p.Id == "first").DvMps, 2);
        }

        [Fact]
        public void Liquid_side_boosters_mirror_the_first_stage()
        {
            var d = Dashboard.Compute(Base().WithChoice(Slots.StrapOnBoosters, "liquid2"), Catalog());
            // Two copies of the first stage: thrust 3 × 3 000 kN = 9 000 kN; mass 120 000 + 2 × 108 000 = 336 000 kg.
            Assert.Equal(336_000.0, d.TotalMassKg, 9);
            Assert.Equal(9_000_000.0 / (336_000.0 * G0), d.LiftoffTwr!.Value, 9);
            // Core and side boosters are identical and burn out together (simplification: no core throttle-down), so
            // the whole first stage is one parallel phase: 3 × 100 t propellant, Isp_eff 320 s,
            //   Δv = 320 g0 ln(336 000 / 36 000) = 3 138.128 × 2.233592 = 7 009.30 m/s, then 2 × 8 000 kg of boosters drop.
            var phase = d.Phases.Single(p => p.Id != "upper");
            Assert.Equal("boosters", phase.Id);
            Assert.Equal(7009.30, phase.DvMps, 2);
        }

        [Fact]
        public void Entry_speed_rating_comes_from_the_heat_shield()
        {
            var c = Catalog(returning: true, entrySpeed: 11_000);
            var d = Dashboard.Compute(Base().WithChoice(Slots.HeatShield, "shield"), c);
            Assert.Equal(12_000.0, d.MaxEntrySpeedRatingMps);  // 12 km/s × 1000
            Assert.Equal(11_000.0, d.ContractEntrySpeedMps);
            Assert.Null(Dashboard.Compute(Base(), Catalog()).MaxEntrySpeedRatingMps);
        }

        [Fact]
        public void Power_balance_goes_negative_in_eclipse_with_SAR_on_body_cells()
        {
            var b = Base().WithChoice(Slots.PayloadInstrument, "inst").WithChoice(Slots.PayloadPower, "cells");
            var d = Dashboard.Compute(b, Catalog(satellite: true));
            // Load = 20 W bus + 300 W SAR = 320 W. Sunlit generation = 40 × 90 / 55 = 65.45 W → −254.55 W.
            // Nothing to store, nothing continuous: eclipse balance = −320 W.
            Assert.Equal(320.0, d.PowerLoadW, 9);
            Assert.Equal(-254.55, d.PowerSunlitW!.Value, 2);
            Assert.Equal(-320.0, d.PowerEclipseW!.Value, 9);
        }

        [Fact]
        public void Data_budget_with_ground_passes_and_relay()
        {
            var c = Catalog(satellite: true);
            var b = Base().WithChoice(Slots.PayloadInstrument, "inst");
            // S-band: 0.2 GB/pass × 6 passes/day = 1.2 GB/day < 25 GB/day generated.
            var s = Dashboard.Compute(b.WithChoice(Slots.Communications, "sband"), c);
            Assert.Equal(25.0, s.DataGeneratedGbPerDay);
            Assert.Equal(1.2, s.DownlinkGbPerDay!.Value, 9);
            // Relay network: continuous coverage = 40 GB/day (game value).
            var r = Dashboard.Compute(b.WithChoice(Slots.Communications, "relay"), c);
            Assert.Equal(BuildConstants.RelayDownlinkGbPerDay, r.DownlinkGbPerDay!.Value, 9);
        }

        [Fact]
        public void Stability_compares_centre_of_pressure_with_centre_of_mass()
        {
            var d = Dashboard.Compute(Base(), Catalog());
            // Body 3.7 m (no fairing): area 10.7521 m²; nose 5.55 m; tanks (bulk kerolox 1 030 kg/m³):
            //   upper 10 000 / 1 030 / 10.7521 = 0.9030 m, first 100 000 / 1 030 / 10.7521 = 9.0296 m; interstage 1.85 m.
            //   Length 17.3326 m. CoM = Σ m·x / Σ m = 12.2286 m from the nose tip.
            //   CoP: nose 2/rad at 0.466 × 5.55 = 2.5863 m, body 0.12 × 11.7826 / 3.7 = 0.38214/rad at 11.4413 m
            //   → (2 × 2.5863 + 0.38214 × 11.4413) / 2.38214 = 4.0068 m. Margin (4.0068 − 12.2286) / 3.7 = −2.2221 cal.
            Assert.Equal(17.3326, d.VehicleLengthM!.Value, 4);
            Assert.Equal(12.2286, d.CenterOfMassM!.Value, 4);
            Assert.Equal(4.0068, d.CenterOfPressureM!.Value, 4);
            Assert.Equal(-2.2221, d.StabilityMarginCalibers!.Value, 4);
            Assert.Equal(StabilityStatus.ReliesOnGimbal, d.Stability);

            // Fins (9/rad at 17.3326 − 1.85 = 15.4826 m) pull the CoP aft of the CoM: margin +0.2303 → Marginal.
            var f = Dashboard.Compute(Base().WithChoice(Slots.AeroControl, "fins"), Catalog());
            Assert.Equal(0.2303, f.StabilityMarginCalibers!.Value, 4);
            Assert.Equal(StabilityStatus.Marginal, f.Stability);
        }

        [Fact]
        public void Cost_schedule_and_success_are_on_the_dashboard()
        {
            var d = Dashboard.Compute(Base(), Catalog());
            // Cost: engines 3 × 2 + upper 3 + tanks (100 + 10) t × 0.02 $M/t = 2.2 → 11.2 $M.
            Assert.Equal(11.2, d.CostM, 9);
            // Schedule: max lead 30 + integration (3 upper + 2 first engine + 3 for three engines) = 38 days.
            Assert.Equal(38.0, d.ScheduleDays, 9);
            // Success: displayed estimates before any test equal the base values:
            //   first cluster 0.99³ − 0.003 (engine-out does not hold: 2 × 1 000 kN / (120 000 g0) = 1.70 > 1, and the
            //   option is "partial", so engine-out holds) → 0.99³ + 3 × 0.99² × 0.01 − 0.003 = 0.999702 − 0.003 = 0.996702
            //   upper 0.98 → product 0.976768
            Assert.True(d.FirstStageEngineOut);
            Assert.Equal(0.996702 * 0.98, d.Success.Success, 6);
            Assert.True(d.Success.BandHalfWidth > 0);
        }

        [Fact]
        public void Dashboard_never_mutates_the_build_and_undecided_parts_are_absent()
        {
            var b = Base();
            var before = b.Choices.Count;
            Dashboard.Compute(b.WithChoice(Slots.StrapOnBoosters, "solid2"), Catalog());
            Assert.Equal(before, b.Choices.Count);
            Assert.Null(b.Choice(Slots.StrapOnBoosters));

            var empty = Dashboard.Compute(BuildState.New("T", 1), Catalog());
            Assert.Null(empty.LiftoffTwr);
            Assert.Equal(TwrStatus.Unknown, empty.LiftoffTwrStatus);
            Assert.Equal(0.0, empty.TotalDvMps);
            Assert.Equal(1000.0, empty.TotalMassKg); // only the contract payload
        }

        [Fact]
        public void Engineering_breakthrough_bonus_adds_to_the_engine_stage()
        {
            var b = Base();
            b = b.WithCondition(Slots.UpperStageEngine, b.Condition(Slots.UpperStageEngine).With(dvBonusFraction: 0.02));
            var d = Dashboard.Compute(b, Catalog());
            // +2 % of the upper-stage Δv: 0.02 × 6 149.91 = 123.00 m/s
            Assert.Equal(123.00, d.EngineBonusDvMps, 2);
        }
    }
}
