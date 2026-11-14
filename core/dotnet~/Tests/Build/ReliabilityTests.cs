using System;
using System.Collections.Generic;
using System.Linq;
using MissionForge.Core.Build;
using MissionForge.Core.Data;
using Xunit;

namespace MissionForge.Core.Tests.Build
{
    /// <summary>
    /// Reliability model: redundancy (design 6.5, 6.7, 7.13), engine clusters and engine-out (6.5, 7.6),
    /// hidden true reliability inside the maturity band (6.5, 7.0), mission assurance (7.20) and the
    /// mission success estimate (6.3, 6.5). All catalogs are built in code; no file I/O.
    /// </summary>
    public class ReliabilityTests
    {
        private const ulong Seed = 20261004UL;
        private const double G0 = 9.80665;

        // ------------------------------------------------------------------ fixture

        private static PartStats Stats(Dictionary<string, double>? numbers = null, Dictionary<string, string>? text = null) =>
            new PartStats(numbers ?? new Dictionary<string, double>(), text ?? new Dictionary<string, string>());

        private static PartDef Engine(string id, double thrustSlKn, double reliability = 0.98, Maturity maturity = Maturity.Proven) =>
            new PartDef(id, PartCategories.FirstStageEngine, id, 1000, 20, 30, 5, reliability, maturity,
                Stats(new Dictionary<string, double>
                {
                    ["thrust_sl_kN"] = thrustSlKn, ["thrust_vac_kN"] = thrustSlKn * 1.1,
                    ["isp_sl_s"] = 300, ["isp_vac_s"] = 330,
                }), propellant: "RP1_LOX");

        private static PartDef UpperEngine(string id, double thrustVacKn) =>
            new PartDef(id, PartCategories.UpperStageEngine, id, 500, 10, 30, 5, 0.99, Maturity.Proven,
                Stats(new Dictionary<string, double> { ["thrust_vac_kN"] = thrustVacKn, ["isp_vac_s"] = 340 }),
                propellant: "RP1_LOX");

        private static PartDef Count(string id, int n, string? engineOut, double modifier = 0)
        {
            var text = new Dictionary<string, string>();
            if (engineOut != null) text["engine_out_capability"] = engineOut;
            return new PartDef(id, PartCategories.EngineCount, id, 0, 0, 0, 0, null, Maturity.Proven,
                Stats(new Dictionary<string, double> { ["engine_count"] = n, ["reliability_modifier"] = modifier }, text));
        }

        private static PartDef Simple(string id, string category, double reliability, Maturity maturity, double costM = 2,
            Dictionary<string, double>? numbers = null) =>
            new PartDef(id, category, id, 10, costM, 10, 2, reliability, maturity, Stats(numbers));

        private static GameCatalog Catalog()
        {
            var parts = new List<PartDef>
            {
                Engine("eng_main", 1000),
                Engine("eng_weak", 500),
                UpperEngine("upr_eng", 100),
                UpperEngine("upr_eng_weak", 50),
                Count("count_1", 1, "no"),
                Count("count_3", 3, "partial", -0.003),
                Count("count_3_no", 3, "no", -0.003),
                Count("count_3_nofield", 3, null, -0.003),
                Count("count_2_up", 2, "yes"),
                new PartDef("tank_100", PartCategories.TankSize, "tank_100", 0, 1, 10, 2, null, Maturity.Proven,
                    Stats(new Dictionary<string, double> { ["first_stage_propellant_t"] = 100, ["upper_stage_propellant_t"] = 20 })),
                new PartDef("srb_pair", PartCategories.StrapOnBooster, "srb_pair", 10_000, 5, 10, 2, null, Maturity.Proven,
                    Stats(new Dictionary<string, double> { ["thrust_sl_each_kN"] = 500, ["booster_count"] = 2 })),
                Simple("avi_single", PartCategories.Avionics, 0.97, Maturity.Mature, 8),
                Simple("avi_triple_unit", PartCategories.Avionics, 0.992, Maturity.Proven, 3,
                    new Dictionary<string, double> { ["unit_reliability"] = 0.97, ["redundancy"] = 3 }),
                Simple("avi_dual_unit", PartCategories.Avionics, 0.9991, Maturity.Proven, 2,
                    new Dictionary<string, double> { ["unit_reliability"] = 0.97, ["redundancy"] = 2 }),
                Simple("avi_triple_system", PartCategories.Avionics, 0.992, Maturity.Proven, 3,
                    new Dictionary<string, double> { ["computer_count"] = 3 }),
                Simple("nav_mature", PartCategories.NavigationSensor, 0.99, Maturity.Mature),
                Simple("nav_proven", PartCategories.NavigationSensor, 0.99, Maturity.Proven),
                Simple("nav_new", PartCategories.NavigationSensor, 0.99, Maturity.New),
                new PartDef("ma_faster", PartCategories.MissionAssurance, "ma_faster", 0, 0, 0, 0, null, Maturity.Proven,
                    Stats(new Dictionary<string, double> { ["band_scale"] = 1.5, ["cost_fraction"] = -0.15 })),
                new PartDef("ma_standard", PartCategories.MissionAssurance, "ma_standard", 0, 0, 0, 0, null, Maturity.Proven),
                new PartDef("ma_class_a", PartCategories.MissionAssurance, "ma_class_a", 0, 0, 0, 0, null, Maturity.Proven,
                    Stats(new Dictionary<string, double> { ["band_scale"] = 0.5, ["reliability_bonus"] = 0.01 })),
            };
            // Contract payload 1,000 kg; no votes needed for the reliability model.
            var contracts = new[] { new ContractDef("C1", "Test orbit", 1000, 9400, 200, 365, votes: Array.Empty<ContractVote>()) };
            return new GameCatalog(parts, contracts);
        }

        private static readonly GameCatalog Cat = Catalog();

        private static Vehicle V(BuildState b) => new Vehicle(b, Cat);

        private static BuildState First(string engine, string count, ulong seed = Seed) =>
            BuildState.New("C1", seed)
                .WithChoice(Slots.FirstStageEngine, engine)
                .WithChoice(Slots.FirstStageEngineCount, count)
                .WithChoice(Slots.FirstStageTank, "tank_100");

        /// <summary>First deterministic seed (from 1) for which the predicate holds.</summary>
        private static ulong FindSeed(Func<ulong, bool> predicate)
        {
            for (ulong s = 1; s < 100_000; s++) if (predicate(s)) return s;
            throw new InvalidOperationException("No seed found.");
        }

        // ------------------------------------------------------------------ 1. redundancy

        [Theory]
        [InlineData(1, 0.97)]       // n = 1: the unit itself
        [InlineData(2, 0.9991)]     // 1 − (1 − 0.97)^2 = 1 − 0.0009 = 0.9991
        [InlineData(3, 0.999973)]   // 1 − (1 − 0.97)^3 = 1 − 0.000027 = 0.999973
        public void Redundant_is_one_minus_all_units_failing(int n, double expected)
        {
            Assert.Equal(expected, ReliabilityModel.Redundant(0.97, n), 12);
        }

        [Fact]
        public void Per_unit_avionics_enter_the_estimate_as_redundant_units()
        {
            var v = V(BuildState.New("C1", Seed).WithChoice(Slots.Avionics, "avi_triple_unit"));
            Assert.True(ReliabilityModel.IsPerUnit(v.Part(Slots.Avionics)!));

            // Untested Proven unit: displayed unit estimate = unit_reliability 0.97, band ±0.01.
            var (unit, unitBand) = ReliabilityModel.Displayed(v, Slots.Avionics);
            Assert.Equal(0.97, unit, 12);
            Assert.Equal(0.01, unitBand, 12);

            var item = Assert.Single(ReliabilityModel.Estimate(v).Items);
            Assert.Equal(3, item.Units);
            // R_sys = 1 − (1 − 0.97)^3 = 0.999973 (not the data's printed 0.992)
            Assert.Equal(0.999973, item.Reliability, 12);
            // dR_sys/dR = n·(1 − R)^(n−1) = 3 · 0.03^2 = 0.0027; band = 0.0027 · 0.01 = 0.000027
            Assert.Equal(0.000027, item.BandHalfWidth, 12);
        }

        [Fact]
        public void System_value_avionics_are_not_compounded_again()
        {
            // computer_count = 3 but no unit_reliability: 0.992 is already the system value (design 7.13).
            var v = V(BuildState.New("C1", Seed).WithChoice(Slots.Avionics, "avi_triple_system"));
            Assert.False(ReliabilityModel.IsPerUnit(v.Part(Slots.Avionics)!));
            var item = Assert.Single(ReliabilityModel.Estimate(v).Items);
            Assert.Equal(1, item.Units);
            Assert.Equal(0.992, item.Reliability, 12);
        }

        // ------------------------------------------------------------------ 2. engine clusters

        [Fact]
        public void Cluster_without_engine_out_needs_every_engine()
        {
            // 0.98^3 = 0.941192
            Assert.Equal(0.941192, ReliabilityModel.Cluster(0.98, 3, false), 12);
            // 0.98^9 = 0.833747762...
            Assert.Equal(Math.Pow(0.98, 9), ReliabilityModel.Cluster(0.98, 9, false), 12);
            Assert.Equal(1.0, ReliabilityModel.Cluster(0.98, 0, false));
        }

        [Fact]
        public void Cluster_with_engine_out_survives_one_failure()
        {
            // 0.98^3 + 3 · 0.98^2 · 0.02 = 0.941192 + 3 · 0.9604 · 0.02 = 0.941192 + 0.057624 = 0.998816
            Assert.Equal(0.998816, ReliabilityModel.Cluster(0.98, 3, true), 12);
            // A single engine cannot be engine-out: still r.
            Assert.Equal(0.98, ReliabilityModel.Cluster(0.98, 1, true), 12);
        }

        [Fact]
        public void ClusterSlope_is_the_derivative_of_Cluster()
        {
            // No engine-out: d(r^n)/dr = n·r^(n−1) = 3 · 0.9604 = 2.8812
            Assert.Equal(2.8812, ReliabilityModel.ClusterSlope(0.98, 3, false), 12);
            // Engine-out: n(n−1)·r^(n−2)·(1 − r) = 6 · 0.98 · 0.02 = 0.1176
            Assert.Equal(0.1176, ReliabilityModel.ClusterSlope(0.98, 3, true), 12);

            const double h = 1e-6;
            foreach (var eo in new[] { false, true })
            {
                var numeric = (ReliabilityModel.Cluster(0.98 + h, 5, eo) - ReliabilityModel.Cluster(0.98 - h, 5, eo)) / (2 * h);
                Assert.Equal(numeric, ReliabilityModel.ClusterSlope(0.98, 5, eo), 6);
            }
        }

        [Fact]
        public void Cluster_item_adds_the_count_option_reliability_modifier()
        {
            // Engine-out capable (TWR shown in the engine-out tests): 0.998816 − 0.003 = 0.995816
            var strong = ReliabilityModel.Estimate(V(First("eng_main", "count_3")));
            var item = Assert.Single(strong.Items);
            Assert.Equal("first_stage_cluster", item.Id);
            Assert.Equal(3, item.Units);
            Assert.True(item.EngineOutCapable);
            Assert.Equal(0.995816, item.Reliability, 12);
            // band = |slope| · b = 0.1176 · 0.01 = 0.001176; one item, so the estimate band equals it
            Assert.Equal(0.001176, item.BandHalfWidth, 12);
            Assert.Equal(0.001176, strong.BandHalfWidth, 12);

            // Not engine-out capable (TWR too low with one out): 0.941192 − 0.003 = 0.938192
            var weak = Assert.Single(ReliabilityModel.Estimate(V(First("eng_weak", "count_3"))).Items);
            Assert.False(weak.EngineOutCapable);
            Assert.Equal(0.938192, weak.Reliability, 12);
        }

        // ------------------------------------------------------------------ 3. engine-out capability

        [Fact]
        public void Engine_out_needs_at_least_two_engines()
        {
            Assert.False(ReliabilityModel.EngineOutCapable(V(First("eng_main", "count_1")), true));
            // No engine at all
            Assert.False(ReliabilityModel.EngineOutCapable(V(BuildState.New("C1", Seed)), true));
        }

        [Fact]
        public void Engine_out_is_off_when_the_count_option_says_no()
        {
            // Plenty of thrust (TWR 1.87 with one out) but the option forbids it.
            Assert.False(ReliabilityModel.EngineOutCapable(V(First("eng_main", "count_3_no")), true));
        }

        [Fact]
        public void Engine_out_is_allowed_when_the_count_option_has_no_field()
        {
            Assert.True(ReliabilityModel.EngineOutCapable(V(First("eng_main", "count_3_nofield")), true));
        }

        [Fact]
        public void First_stage_engine_out_requires_liftoff_twr_above_one_on_remaining_engines()
        {
            var strong = V(First("eng_main", "count_3"));
            // m0 = payload 1,000 + engines 3 · 1,000 + tank dry 0.05 · 100,000 + propellant 100,000 = 109,000 kg
            Assert.Equal(109_000, strong.Mass.TotalKg, 6);
            // Engine out: 3 · 1,000 kN · 2/3 = 2,000 kN; W = 109,000 · 9.80665 = 1,068,924.85 N
            // TWR = 2,000,000 / 1,068,924.85 = 1.871 > 1  → capable
            Assert.Equal(1.871039, strong.FirstThrustSlN * 2 / 3 / (strong.Mass.TotalKg * G0), 6);
            Assert.True(ReliabilityModel.EngineOutCapable(strong, true));

            var weak = V(First("eng_weak", "count_3"));
            // All engines: 1,500 kN / 1,068,924.85 N = 1.403 (it flies),
            // engine out: 1,000 kN / 1,068,924.85 N = 0.9355 ≤ 1 → not capable
            Assert.Equal(1.403279, weak.FirstThrustSlN / (weak.Mass.TotalKg * G0), 6);
            Assert.Equal(0.935519, weak.FirstThrustSlN * 2 / 3 / (weak.Mass.TotalKg * G0), 6);
            Assert.False(ReliabilityModel.EngineOutCapable(weak, true));
        }

        [Fact]
        public void First_stage_engine_out_counts_strap_on_booster_thrust()
        {
            var v = V(First("eng_weak", "count_3").WithChoice(Slots.StrapOnBoosters, "srb_pair"));
            // m0 = 109,000 + 2 boosters · 10,000 kg gross = 129,000 kg; W = 1,265,057.85 N
            Assert.Equal(129_000, v.Mass.TotalKg, 6);
            // Engine out: 1,500 kN · 2/3 + 2 · 500 kN = 2,000 kN; TWR = 2,000,000 / 1,265,057.85 = 1.581 > 1
            Assert.Equal(1.580955, (v.FirstThrustSlN * 2 / 3 + v.BoostersThrustSlN) / (v.Mass.TotalKg * G0), 6);
            Assert.True(ReliabilityModel.EngineOutCapable(v, true));
        }

        [Fact]
        public void Upper_stage_engine_out_requires_twr_of_at_least_0_3()
        {
            BuildState Upper(string engine) => BuildState.New("C1", Seed)
                .WithChoice(Slots.UpperStageEngine, engine)
                .WithChoice(Slots.UpperStageEngineCount, "count_2_up")
                .WithChoice(Slots.UpperStageTank, "tank_100");

            var strong = V(Upper("upr_eng"));
            // Stack = payload 1,000 + engines 2 · 500 + tank dry 0.05 · 20,000 + propellant 20,000 = 23,000 kg
            Assert.Equal(23_000, strong.UpperStackMassKg, 6);
            // Engine out: 2 · 100 kN · 1/2 = 100 kN; TWR = 100,000 / (23,000 · 9.80665 = 225,552.95) = 0.4434 ≥ 0.3
            Assert.Equal(0.443355, strong.UpperThrustVacN / 2 / (strong.UpperStackMassKg * G0), 6);
            Assert.True(ReliabilityModel.EngineOutCapable(strong, false));

            var weak = V(Upper("upr_eng_weak"));
            // Engine out: 50 kN; TWR = 50,000 / 225,552.95 = 0.2217 < 0.3 → not capable
            Assert.Equal(0.221677, weak.UpperThrustVacN / 2 / (weak.UpperStackMassKg * G0), 6);
            Assert.False(ReliabilityModel.EngineOutCapable(weak, false));
        }

        // ------------------------------------------------------------------ 4. hidden true reliability

        [Fact]
        public void Hidden_truth_is_drawn_from_seed_and_part_id()
        {
            var part = Cat.Part("nav_mature");
            var a = ReliabilityModel.Hidden(Seed, part);
            var b = ReliabilityModel.Hidden(Seed, part);
            Assert.Equal(a.BandPosition, b.BandPosition);
            Assert.Equal(a.HasFlaw, b.HasFlaw);

            // Position = 2u − 1 with u = Uniform(seed, "reliability", id, 0); flaw when Uniform(…, 1) < FlawChance.
            var u = BuildRandom.Uniform(Seed, BuildRandom.ReliabilityStream, "nav_mature", 0);
            var f = BuildRandom.Uniform(Seed, BuildRandom.ReliabilityStream, "nav_mature", 1);
            Assert.Equal(2 * u - 1, a.BandPosition, 15);
            Assert.Equal(f < BuildConstants.FlawChance(Maturity.Mature), a.HasFlaw);
        }

        [Fact]
        public void Hidden_truth_differs_between_seeds_and_between_parts()
        {
            var part = Cat.Part("nav_mature");
            var positions = new HashSet<double>();
            for (ulong s = 1; s <= 20; s++) positions.Add(ReliabilityModel.Hidden(s, part).BandPosition);
            Assert.Equal(20, positions.Count);

            Assert.NotEqual(ReliabilityModel.Hidden(Seed, Cat.Part("nav_mature")).BandPosition,
                ReliabilityModel.Hidden(Seed, Cat.Part("nav_proven")).BandPosition);
        }

        [Theory]
        [InlineData("nav_proven", 0.01)]
        [InlineData("nav_mature", 0.03)]
        [InlineData("nav_new", 0.06)]
        public void True_reliability_stays_inside_the_maturity_band(string partId, double halfWidth)
        {
            var part = Cat.Part(partId);
            for (ulong s = 1; s <= 300; s++)
            {
                var v = V(BuildState.New("C1", s).WithChoice(Slots.Navigation, partId));
                var h = ReliabilityModel.Hidden(s, part);
                Assert.InRange(h.BandPosition, -1.0, 1.0);
                // true = base + position · half-width (− flaw penalty while a hidden flaw is unfixed)
                var clean = 0.99 + h.BandPosition * halfWidth;
                var expected = h.HasFlaw ? clean - BuildConstants.FlawReliabilityPenalty : clean;
                // Nothing is perfect: values above 99.99% are clamped (0.99 + 0.06 would exceed 1).
                expected = Math.Min(BuildConstants.MaxReliability, expected);
                Assert.Equal(expected, ReliabilityModel.True(v, Slots.Navigation), 12);
                Assert.InRange(clean, 0.99 - halfWidth, 0.99 + halfWidth);
            }
        }

        [Fact]
        public void Flaw_rate_follows_maturity()
        {
            // 2,000 seeds; expected 5% / 12% / 25% (BuildConstants.FlawChance). σ ≤ √(0.25·0.75/2000) ≈ 0.0097.
            foreach (var (id, chance) in new[] { ("nav_proven", 0.05), ("nav_mature", 0.12), ("nav_new", 0.25) })
            {
                var part = Cat.Part(id);
                var flaws = 0;
                for (ulong s = 1; s <= 2000; s++) if (ReliabilityModel.Hidden(s, part).HasFlaw) flaws++;
                Assert.InRange(flaws / 2000.0, chance - 0.03, chance + 0.03);
            }
        }

        [Fact]
        public void Hidden_truth_does_not_depend_on_choice_order()
        {
            var a = BuildState.New("C1", Seed)
                .WithChoice(Slots.Avionics, "avi_single")
                .WithChoice(Slots.Navigation, "nav_new")
                .WithChoice(Slots.FirstStageEngine, "eng_main");
            var b = BuildState.New("C1", Seed)
                .WithChoice(Slots.FirstStageEngine, "eng_main")
                .WithChoice(Slots.Navigation, "nav_new")
                .WithChoice(Slots.Avionics, "avi_single");
            foreach (var slot in new[] { Slots.Avionics, Slots.Navigation, Slots.FirstStageEngine })
                Assert.Equal(ReliabilityModel.True(V(a), slot), ReliabilityModel.True(V(b), slot));
            Assert.Equal(ReliabilityModel.TrueSuccess(V(a)).Success, ReliabilityModel.TrueSuccess(V(b)).Success);
        }

        [Theory]
        [InlineData("nav_proven", 0.01)]
        [InlineData("nav_mature", 0.03)]
        [InlineData("nav_new", 0.06)]
        public void Displayed_estimate_is_the_base_value_until_tested(string partId, double halfWidth)
        {
            var part = Cat.Part(partId);
            // A seed where the part has a hidden flaw: the display still shows the base value.
            var seed = FindSeed(s => ReliabilityModel.Hidden(s, part).HasFlaw);
            var v = V(BuildState.New("C1", seed).WithChoice(Slots.Navigation, partId));
            var (est, band) = ReliabilityModel.Displayed(v, Slots.Navigation);
            Assert.Equal(0.99, est, 12);
            Assert.Equal(halfWidth, band, 12);
            // …while the truth carries the flaw penalty of 0.03.
            var h = ReliabilityModel.Hidden(seed, part);
            Assert.Equal(0.99 + h.BandPosition * halfWidth - 0.03, ReliabilityModel.True(v, Slots.Navigation), 12);
        }

        [Fact]
        public void Displayed_throws_when_the_slot_is_empty()
        {
            Assert.Throws<InvalidOperationException>(() => ReliabilityModel.Displayed(V(BuildState.New("C1", Seed)), Slots.Avionics));
        }

        [Fact]
        public void Faster_cheaper_widens_the_band_by_half()
        {
            var part = Cat.Part("nav_mature");
            var seed = FindSeed(s => !ReliabilityModel.Hidden(s, part).HasFlaw);
            var v = V(BuildState.New("C1", seed).WithChoice(Slots.Navigation, "nav_mature").WithChoice(Slots.MissionAssurance, "ma_faster"));
            Assert.Equal(1.5, ReliabilityModel.AssuranceBandScale(v), 12);
            var (est, band) = ReliabilityModel.Displayed(v, Slots.Navigation);
            // ±3% × 1.5 = ±4.5%
            Assert.Equal(0.045, band, 12);
            Assert.Equal(0.99, est, 12);
            // The truth range is widened too: true = 0.99 + position · 0.045
            Assert.Equal(0.99 + ReliabilityModel.Hidden(seed, part).BandPosition * 0.045, ReliabilityModel.True(v, Slots.Navigation), 12);
        }

        [Fact]
        public void Class_a_halves_the_band_and_adds_one_percent_to_every_part()
        {
            var part = Cat.Part("nav_mature");
            var seed = FindSeed(s => !ReliabilityModel.Hidden(s, part).HasFlaw);
            var v = V(BuildState.New("C1", seed).WithChoice(Slots.Navigation, "nav_mature").WithChoice(Slots.MissionAssurance, "ma_class_a"));
            Assert.Equal(0.01, ReliabilityModel.AssuranceBonus(v), 12);
            var (est, band) = ReliabilityModel.Displayed(v, Slots.Navigation);
            // ±3% × 0.5 = ±1.5%; estimate 0.99 + 0.01 = 1.00 → clamped to MaxReliability 0.9999
            Assert.Equal(0.015, band, 12);
            Assert.Equal(BuildConstants.MaxReliability, est, 12);

            var avi = Cat.Part("avi_single");
            var seed2 = FindSeed(s => !ReliabilityModel.Hidden(s, avi).HasFlaw);
            var v2 = V(BuildState.New("C1", seed2).WithChoice(Slots.Avionics, "avi_single").WithChoice(Slots.MissionAssurance, "ma_class_a"));
            var (est2, band2) = ReliabilityModel.Displayed(v2, Slots.Avionics);
            // 0.97 + 0.01 = 0.98; band 0.03 · 0.5 = 0.015; truth = 0.97 + position · 0.015 + 0.01
            Assert.Equal(0.98, est2, 12);
            Assert.Equal(0.015, band2, 12);
            Assert.Equal(0.97 + ReliabilityModel.Hidden(seed2, avi).BandPosition * 0.015 + 0.01, ReliabilityModel.True(v2, Slots.Avionics), 12);

            // Standard assurance (no stats) changes nothing.
            var std = V(BuildState.New("C1", seed2).WithChoice(Slots.Avionics, "avi_single").WithChoice(Slots.MissionAssurance, "ma_standard"));
            Assert.Equal((0.97, 0.03), Round(ReliabilityModel.Displayed(std, Slots.Avionics)));
        }

        private static (double, double) Round((double a, double b) t) => (Math.Round(t.a, 12), Math.Round(t.b, 12));

        // ------------------------------------------------------------------ 6. mission success estimate

        private static BuildState EstimateBuild(ulong seed) => First("eng_main", "count_1", seed)
            .WithChoice(Slots.Avionics, "avi_dual_unit")
            .WithChoice(Slots.Navigation, "nav_mature");

        [Fact]
        public void Estimate_is_the_product_of_items_with_a_quadrature_band()
        {
            var e = ReliabilityModel.Estimate(V(EstimateBuild(Seed)));
            Assert.Equal(new[] { "first_stage_cluster", "avionics", "navigation_sensor" }, e.Items.Select(i => i.Id).ToArray());
            Assert.Equal(new[] { "ascent", "all", "all" }, e.Items.Select(i => i.Phase).ToArray());

            // Items: engine 0.98 (1 engine, ±0.01); dual avionics 1 − 0.03^2 = 0.9991 (±2·0.03·0.01 = ±0.0006);
            //        navigation 0.99 (Mature ±0.03).
            Assert.Equal(0.98, e.Items[0].Reliability, 12);
            Assert.Equal(0.01, e.Items[0].BandHalfWidth, 12);
            Assert.Equal(0.9991, e.Items[1].Reliability, 12);
            Assert.Equal(0.0006, e.Items[1].BandHalfWidth, 12);
            Assert.Equal(0.99, e.Items[2].Reliability, 12);
            Assert.Equal(0.03, e.Items[2].BandHalfWidth, 12);

            // Success = 0.98 · 0.9991 · 0.99 = 0.979118 · 0.99 = 0.96932682
            Assert.Equal(0.96932682, e.Success, 12);
            // Relative variance = (0.01/0.98)^2 + (0.0006/0.9991)^2 + (0.03/0.99)^2
            //                   = 0.000104123 + 0.000000361 + 0.000918274 = 0.001022758
            // Band = 0.96932682 · √0.001022758 = 0.96932682 · 0.0319806 = 0.0309996
            Assert.Equal(0.0309996, e.BandHalfWidth, 6);
            Assert.Equal(0.96932682 - e.BandHalfWidth, e.Low, 12);
            // High = min(1, 0.96932682 + 0.0309996 = 1.0003264) = 1
            Assert.Equal(1.0, e.High, 12);
        }

        [Fact]
        public void TrueSuccess_multiplies_the_hidden_truths_and_has_no_band()
        {
            var v = V(EstimateBuild(Seed));
            var t = ReliabilityModel.TrueSuccess(v);
            Assert.Equal(0.0, t.BandHalfWidth);

            var engine = ReliabilityModel.True(v, Slots.FirstStageEngine);
            var aviUnit = ReliabilityModel.True(v, Slots.Avionics);
            var nav = ReliabilityModel.True(v, Slots.Navigation);
            var expected = ReliabilityModel.Cluster(engine, 1, false) * ReliabilityModel.Redundant(aviUnit, 2) * nav;
            Assert.Equal(expected, t.Success, 12);
            // The truth is not the displayed estimate.
            Assert.NotEqual(ReliabilityModel.Estimate(v).Success, t.Success);
        }

        [Fact]
        public void Empty_build_has_success_one()
        {
            var e = ReliabilityModel.Estimate(V(BuildState.New("C1", Seed)));
            Assert.Empty(e.Items);
            Assert.Equal(1.0, e.Success);
            Assert.Equal(0.0, e.BandHalfWidth);
        }
    }
}
