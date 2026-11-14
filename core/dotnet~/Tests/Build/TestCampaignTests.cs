using System;
using System.Collections.Generic;
using System.Linq;
using MissionForge.Core.Build;
using MissionForge.Core.Data;
using Xunit;

namespace MissionForge.Core.Tests.Build
{
    /// <summary>
    /// Testing campaign (design 6.5 flaws, 6.6 tests): costs, schedule days, band narrowing, reliability bonus,
    /// seeded flaw reveal, flaw fixing and risk flags. Catalog built in code; no file I/O.
    /// </summary>
    public class TestCampaignTests
    {
        private const ulong Seed = 777UL;

        private const string Qual = "test_component_qual";
        private const string HotFire = "test_engine_hot_fire";
        private const string HotFireSure = "test_engine_hot_fire_sure";
        private const string StaticFire = "test_static_fire";
        private const string WetDress = "test_wet_dress";
        private const string Pogo = "test_pogo";
        private const string Sil = "test_sil_sure";
        private const string Blind = "test_blind";

        // ------------------------------------------------------------------ fixture

        private static PartStats Stats(Dictionary<string, double>? numbers = null) =>
            new PartStats(numbers ?? new Dictionary<string, double>());

        private static GameCatalog Catalog()
        {
            var parts = new List<PartDef>
            {
                new PartDef("eng_main", PartCategories.FirstStageEngine, "eng_main", 1000, 20, 30, 5, 0.98, Maturity.Proven,
                    Stats(new Dictionary<string, double> { ["thrust_sl_kN"] = 1000, ["thrust_vac_kN"] = 1100, ["isp_sl_s"] = 300, ["isp_vac_s"] = 330 }),
                    propellant: "RP1_LOX"),
                new PartDef("upr_eng", PartCategories.UpperStageEngine, "upr_eng", 500, 10, 30, 5, 0.99, Maturity.Proven,
                    Stats(new Dictionary<string, double> { ["thrust_vac_kN"] = 100, ["isp_vac_s"] = 340 }), propellant: "RP1_LOX"),
                new PartDef("count_3", PartCategories.EngineCount, "count_3", 0, 0, 0, 3, null, Maturity.Proven,
                    Stats(new Dictionary<string, double> { ["engine_count"] = 3, ["reliability_modifier"] = -0.003 })),
                new PartDef("tank_100", PartCategories.TankSize, "tank_100", 0, 1, 10, 2, null, Maturity.Proven,
                    Stats(new Dictionary<string, double> { ["first_stage_propellant_t"] = 100, ["upper_stage_propellant_t"] = 20 })),
                new PartDef("tank_1000", PartCategories.TankSize, "tank_1000", 0, 1, 10, 2, null, Maturity.Proven,
                    Stats(new Dictionary<string, double> { ["first_stage_propellant_t"] = 1000 })),
                new PartDef("tank_2000", PartCategories.TankSize, "tank_2000", 0, 1, 10, 2, null, Maturity.Proven,
                    Stats(new Dictionary<string, double> { ["first_stage_propellant_t"] = 2000 })),
                new PartDef("avi_single", PartCategories.Avionics, "avi_single", 10, 8, 10, 2, 0.97, Maturity.Mature),
                new PartDef("avi_cheap", PartCategories.Avionics, "avi_cheap", 10, 2, 10, 2, 0.97, Maturity.Mature),
                new PartDef("site_ksc", PartCategories.LaunchSite, "site_ksc", 0, 0, 0, 0, null, Maturity.Proven),
            };
            var tests = new[]
            {
                // Component qualification: any part, 5% of part cost, 3 days, band ×0.5 (design 6.6).
                new TestDef { Id = Qual, AppliesTo = new[] { "any" }, CostKind = TestCostKind.PartFraction, CostPartFraction = 0.05, Days = 3, BandScale = 0.5, RevealChance = 0.8 },
                // Engine hot-fire: engines, 10% of engine cost, 7 days, +1% reliability.
                new TestDef { Id = HotFire, AppliesTo = new[] { "engine" }, CostKind = TestCostKind.PartFraction, CostPartFraction = 0.10, Days = 7, ReliabilityBonus = 0.01, RevealChance = 0.8, ClearsRisks = new[] { "combustion_instability" } },
                // Same, but always reveals a present flaw (to isolate the flaw mechanics from the roll).
                new TestDef { Id = HotFireSure, AppliesTo = new[] { "engine" }, CostKind = TestCostKind.PartFraction, CostPartFraction = 0.10, Days = 7, ReliabilityBonus = 0.01, RevealChance = 1.0 },
                // Static fire: stages, $2–8 M by stage propellant, 5 days.
                new TestDef { Id = StaticFire, AppliesTo = new[] { "stage" }, CostKind = TestCostKind.StageScaled, CostM = 2, CostMaxM = 8, Days = 5 },
                // Wet dress rehearsal: whole vehicle, $3 M, 4 days.
                new TestDef { Id = WetDress, AppliesTo = new[] { "vehicle" }, CostKind = TestCostKind.Fixed, CostM = 3, Days = 4 },
                // Pogo suppression test: first stage, $1 M, 2 days, removes pogo risk.
                new TestDef { Id = Pogo, AppliesTo = new[] { "first_stage" }, CostKind = TestCostKind.Fixed, CostM = 1, Days = 2, ClearsRisks = new[] { "pogo" } },
                // Software-in-the-loop on avionics, $1 M, 3 days, always reveals a present flaw.
                new TestDef { Id = Sil, AppliesTo = new[] { "avionics" }, CostKind = TestCostKind.Fixed, CostM = 1, Days = 3, RevealChance = 1.0, ClearsRisks = new[] { "software_fault" } },
                // A test that never reveals anything.
                new TestDef { Id = Blind, AppliesTo = new[] { "avionics" }, CostKind = TestCostKind.Fixed, CostM = 1, Days = 1, RevealChance = 0.0 },
            };
            var contracts = new[] { new ContractDef("C1", "Test orbit", 1000, 9400, 200, 365, votes: Array.Empty<ContractVote>()) };
            return new GameCatalog(parts, contracts, tests: tests);
        }

        private static readonly GameCatalog Cat = Catalog();

        private static Vehicle V(BuildState b) => new Vehicle(b, Cat);

        private static BuildState Rocket(ulong seed = Seed, string tank = "tank_100") => BuildState.New("C1", seed)
            .WithChoice(Slots.FirstStageEngine, "eng_main")
            .WithChoice(Slots.FirstStageEngineCount, "count_3")
            .WithChoice(Slots.FirstStageTank, tank);

        private static BuildState Avionics(ulong seed, string part = "avi_single") =>
            BuildState.New("C1", seed).WithChoice(Slots.Avionics, part);

        private static ulong FindSeed(Func<ulong, bool> predicate)
        {
            for (ulong s = 1; s < 100_000; s++) if (predicate(s)) return s;
            throw new InvalidOperationException("No seed found.");
        }

        private static bool Flawed(ulong seed, string partId) => ReliabilityModel.Hidden(seed, Cat.Part(partId)).HasFlaw;

        // ------------------------------------------------------------------ component qualification

        [Fact]
        public void Component_qualification_halves_the_band_and_moves_the_estimate_toward_the_truth()
        {
            var seed = FindSeed(s => !Flawed(s, "avi_single"));
            var b0 = Avionics(seed);
            var pos = ReliabilityModel.Hidden(seed, Cat.Part("avi_single")).BandPosition;

            var outcome = TestCampaign.Run(b0, Cat, Qual, Slots.Avionics);
            var v = V(outcome.Build);
            var (est, band) = ReliabilityModel.Displayed(v, Slots.Avionics);
            var truth = ReliabilityModel.True(v, Slots.Avionics);

            // Mature band ±0.03 × 0.5 = ±0.015
            Assert.Equal(0.015, band, 12);
            // truth = 0.97 + pos · 0.03; estimate = truth + (0.97 − truth) · 0.5 = 0.97 + pos · 0.015
            Assert.Equal(0.97 + pos * 0.03, truth, 12);
            Assert.Equal(0.97 + pos * 0.015, est, 12);
            Assert.InRange(truth, est - band - 1e-12, est + band + 1e-12);

            // Cost = 5% of $8 M = $0.4 M; 3 days; recorded in the ledger against the slot.
            var entry = Assert.Single(outcome.Build.Ledger);
            Assert.Equal(LedgerKind.Test, entry.Kind);
            Assert.Equal(Qual, entry.SourceId);
            Assert.Equal(0.4, entry.CostM, 12);
            Assert.Equal(3, entry.Days);
            Assert.Equal(Slots.Avionics, entry.Category);
            Assert.Equal(1, outcome.Build.Condition(Slots.Avionics).TestsRun);
        }

        [Fact]
        public void Two_band_narrowing_tests_multiply()
        {
            // Qualification (×0.5) and then a different test with band scale 1 leave ×0.5; the scale is a product.
            var seed = FindSeed(s => !Flawed(s, "avi_single"));
            var b = TestCampaign.Run(Avionics(seed), Cat, Qual, Slots.Avionics).Build;
            b = TestCampaign.Run(b, Cat, Blind, Slots.Avionics).Build;
            Assert.Equal(0.5, b.Condition(Slots.Avionics).BandScale, 12);
            Assert.Equal(2, b.Condition(Slots.Avionics).TestsRun);
            Assert.Equal(new[] { Qual, Blind }, b.Condition(Slots.Avionics).TestIds.ToArray());
        }

        [Fact]
        public void Component_qualification_is_not_offered_for_parts_without_reliability()
        {
            var b = Rocket().WithChoice(Slots.LaunchSite, "site_ksc");
            Assert.Null(TestCampaign.Offer(b, Cat, Qual, Slots.LaunchSite));
            Assert.Null(TestCampaign.Offer(b, Cat, Qual, Slots.FirstStageTank));
            Assert.NotNull(TestCampaign.Offer(b, Cat, Qual, Slots.FirstStageEngine));
        }

        // ------------------------------------------------------------------ hot-fire

        [Fact]
        public void Hot_fire_costs_ten_percent_of_one_engine_and_adds_one_percent()
        {
            var seed = FindSeed(s => !Flawed(s, "eng_main"));
            var b0 = Rocket(seed);
            var truthBefore = ReliabilityModel.True(V(b0), Slots.FirstStageEngine);

            var offer = TestCampaign.Offer(b0, Cat, HotFire, Slots.FirstStageEngine)!;
            // 10% of one $20 M engine = $2 M (not of the 3-engine cluster); 7 days
            Assert.Equal(2.0, offer.CostM, 12);
            Assert.Equal(7, offer.Days);
            Assert.Equal("eng_main", offer.TargetPartId);

            var outcome = TestCampaign.Run(b0, Cat, HotFire, Slots.FirstStageEngine);
            var v = V(outcome.Build);
            var (est, band) = ReliabilityModel.Displayed(v, Slots.FirstStageEngine);
            // Band unchanged (scale 1): ±0.01; estimate 0.98 + 0.01 = 0.99; truth also +0.01
            Assert.Equal(0.01, band, 12);
            Assert.Equal(0.99, est, 12);
            Assert.Equal(truthBefore + 0.01, ReliabilityModel.True(v, Slots.FirstStageEngine), 12);
            Assert.Equal(2.0, outcome.Build.Ledger.Single().CostM, 12);
            Assert.True(TestCampaign.RiskCleared(outcome.Build, "combustion_instability"));
        }

        [Fact]
        public void Cost_multiplier_scales_the_price()
        {
            // BOOSTER's Hot-Fire Discount: $2 M × 0.5 = $1 M
            var outcome = TestCampaign.Run(Rocket(), Cat, HotFire, Slots.FirstStageEngine, costMultiplier: 0.5);
            Assert.Equal(1.0, outcome.Build.Ledger.Single().CostM, 12);
        }

        [Fact]
        public void Hot_fire_is_offered_on_every_chosen_engine_and_nothing_else()
        {
            var b = Rocket()
                .WithChoice(Slots.UpperStageEngine, "upr_eng")
                .WithChoice(Slots.Avionics, "avi_single");
            var hot = TestCampaign.Available(b, Cat).Where(o => o.Test.Id == HotFire).ToList();
            Assert.Equal(new[] { Slots.FirstStageEngine, Slots.UpperStageEngine }, hot.Select(o => o.TargetCategory).ToArray());
            // Upper engine: 10% of $10 M = $1 M
            Assert.Equal(1.0, hot[1].CostM, 12);
            // Avionics are not an engine: no offer, and Run refuses.
            Assert.Null(TestCampaign.Offer(b, Cat, HotFire, Slots.Avionics));
            Assert.Throws<InvalidOperationException>(() => TestCampaign.Run(b, Cat, HotFire, Slots.Avionics));

            // Offers are sorted by test ID, then target.
            var all = TestCampaign.Available(b, Cat);
            var sorted = all.OrderBy(o => o.Test.Id, StringComparer.Ordinal)
                .ThenBy(o => o.TargetCategory, StringComparer.Ordinal).ToList();
            Assert.Equal(sorted, all);
        }

        // ------------------------------------------------------------------ once per target

        [Fact]
        public void A_test_cannot_run_twice_on_the_same_target()
        {
            var b = TestCampaign.Run(Rocket(), Cat, HotFire, Slots.FirstStageEngine).Build;
            Assert.Null(TestCampaign.Offer(b, Cat, HotFire, Slots.FirstStageEngine));
            Assert.DoesNotContain(TestCampaign.Available(b, Cat), o => o.Test.Id == HotFire && o.TargetCategory == Slots.FirstStageEngine);
            Assert.Throws<InvalidOperationException>(() => TestCampaign.Run(b, Cat, HotFire, Slots.FirstStageEngine));
            // A different test on the same part is still allowed.
            Assert.NotNull(TestCampaign.Offer(b, Cat, Qual, Slots.FirstStageEngine));
        }

        [Fact]
        public void Wet_dress_runs_once_on_the_whole_vehicle()
        {
            // Needs a first stage engine.
            Assert.Null(TestCampaign.Offer(Avionics(Seed), Cat, WetDress, TestCampaign.VehicleTarget));

            var b0 = Rocket();
            Assert.False(TestCampaign.HasRun(b0, WetDress));
            var offer = TestCampaign.Offer(b0, Cat, WetDress, TestCampaign.VehicleTarget)!;
            Assert.Null(offer.TargetPartId);
            Assert.Equal(3.0, offer.CostM, 12);
            Assert.Equal(4, offer.Days);

            var outcome = TestCampaign.Run(b0, Cat, WetDress, TestCampaign.VehicleTarget);
            Assert.False(outcome.FlawRevealed);
            Assert.True(TestCampaign.HasRun(outcome.Build, WetDress));
            Assert.Null(TestCampaign.Offer(outcome.Build, Cat, WetDress, TestCampaign.VehicleTarget));
            Assert.Throws<InvalidOperationException>(() => TestCampaign.Run(outcome.Build, Cat, WetDress, TestCampaign.VehicleTarget));
            var entry = Assert.Single(outcome.Build.Ledger);
            Assert.Equal(3.0, entry.CostM, 12);
            Assert.Equal(4, entry.Days);
        }

        [Fact]
        public void HasRun_reports_part_tests()
        {
            var b0 = Rocket();
            Assert.False(TestCampaign.HasRun(b0, Qual));
            var b1 = TestCampaign.Run(b0, Cat, Qual, Slots.FirstStageEngine).Build;
            Assert.True(TestCampaign.HasRun(b1, Qual));
            Assert.False(TestCampaign.HasRun(b1, HotFire));
            // The original build is untouched (immutable).
            Assert.False(TestCampaign.HasRun(b0, Qual));
        }

        // ------------------------------------------------------------------ seeded reveal roll

        [Fact]
        public void Reveal_roll_is_deterministic_from_the_seed()
        {
            var b0 = Rocket();
            var a = TestCampaign.Run(b0, Cat, HotFire, Slots.FirstStageEngine);
            var b = TestCampaign.Run(b0, Cat, HotFire, Slots.FirstStageEngine);
            Assert.Equal(a.Roll, b.Roll);
            Assert.Equal(a.FlawRevealed, b.FlawRevealed);
            // roll = Uniform(seed, "test", "<test>/<part>", tests already run on the slot)
            Assert.Equal(BuildRandom.Uniform(Seed, BuildRandom.TestStream, HotFire + "/eng_main", 0), a.Roll);
            Assert.Equal(0.8, a.RevealChance, 12);

            // The second test on the same slot uses index 1.
            var c = TestCampaign.Run(a.Build, Cat, Qual, Slots.FirstStageEngine);
            Assert.Equal(BuildRandom.Uniform(Seed, BuildRandom.TestStream, Qual + "/eng_main", 1), c.Roll);

            // A different seed gives a different roll.
            Assert.NotEqual(a.Roll, TestCampaign.Run(Rocket(Seed + 1), Cat, HotFire, Slots.FirstStageEngine).Roll);
        }

        [Fact]
        public void Minigame_tier_raises_the_reveal_chance_up_to_one()
        {
            // 0.8 + 2 tiers · 0.05 = 0.9
            Assert.Equal(0.9, TestCampaign.Run(Rocket(), Cat, HotFire, Slots.FirstStageEngine, minigameTier: 2).RevealChance, 12);
            // 0.8 + 4 · 0.05 = 1.0
            Assert.Equal(1.0, TestCampaign.Run(Rocket(), Cat, HotFire, Slots.FirstStageEngine, minigameTier: 4).RevealChance, 12);
            // 1.0 + 4 · 0.05 = 1.2 → capped at 1
            Assert.Equal(1.0, TestCampaign.Run(Rocket(), Cat, HotFireSure, Slots.FirstStageEngine, minigameTier: 4).RevealChance, 12);
        }

        [Fact]
        public void Revealed_iff_flaw_present_and_roll_below_chance()
        {
            // Over many seeds the outcome follows the rule exactly.
            for (ulong s = 1; s <= 400; s++)
            {
                var o = TestCampaign.Run(Avionics(s), Cat, Qual, Slots.Avionics);
                Assert.Equal(Flawed(s, "avi_single") && o.Roll < 0.8, o.FlawRevealed);
                Assert.Equal(o.FlawRevealed, TestCampaign.OpenFlaws(o.Build).Contains(Slots.Avionics));
            }
        }

        // ------------------------------------------------------------------ flaws and fixes

        [Fact]
        public void Revealed_flaw_lowers_the_estimate_and_fixing_restores_it()
        {
            // Deterministic search for a seed where the Mature avionics carry a hidden flaw.
            var seed = FindSeed(s => Flawed(s, "avi_single"));
            var pos = ReliabilityModel.Hidden(seed, Cat.Part("avi_single")).BandPosition;
            var b0 = Avionics(seed);

            var outcome = TestCampaign.Run(b0, Cat, Sil, Slots.Avionics); // reveal chance 1
            Assert.True(outcome.FlawRevealed);
            var b1 = outcome.Build;
            Assert.True(b1.HasFlag("flaw_revealed:" + Slots.Avionics));
            Assert.Equal(new[] { Slots.Avionics }, TestCampaign.OpenFlaws(b1).ToArray());
            Assert.True(TestCampaign.RiskCleared(b1, "software_fault"));

            // Untested band scale 1: estimate = 0.97 − 0.03 penalty = 0.94; truth = 0.97 + pos · 0.03 − 0.03
            var v1 = V(b1);
            Assert.Equal(0.94, ReliabilityModel.Displayed(v1, Slots.Avionics).estimate, 12);
            Assert.Equal(0.94 + pos * 0.03, ReliabilityModel.True(v1, Slots.Avionics), 12);

            // Fix: max(20% · $8 M = $1.6 M, $1 M) = $1.6 M, 3 days
            var b2 = TestCampaign.FixFlaw(b1, Cat, Slots.Avionics);
            var fix = b2.Ledger.Last();
            Assert.Equal(LedgerKind.FlawFix, fix.Kind);
            Assert.Equal("fix:avi_single", fix.SourceId);
            Assert.Equal(1.6, fix.CostM, 12);
            Assert.Equal(3, fix.Days);
            Assert.Empty(TestCampaign.OpenFlaws(b2));

            var v2 = V(b2);
            Assert.Equal(0.97, ReliabilityModel.Displayed(v2, Slots.Avionics).estimate, 12);
            Assert.Equal(0.97 + pos * 0.03, ReliabilityModel.True(v2, Slots.Avionics), 12);

            // Nothing left to fix.
            Assert.Throws<InvalidOperationException>(() => TestCampaign.FixFlaw(b2, Cat, Slots.Avionics));
        }

        [Fact]
        public void Hot_fire_reveals_a_proven_engine_flaw()
        {
            // Proven parts carry a flaw 5% of the time; find one deterministically.
            var seed = FindSeed(s => Flawed(s, "eng_main"));
            var outcome = TestCampaign.Run(Rocket(seed), Cat, HotFireSure, Slots.FirstStageEngine);
            Assert.True(outcome.FlawRevealed);
            // estimate = 0.98 + 0.01 hot-fire − 0.03 flaw = 0.96
            Assert.Equal(0.96, ReliabilityModel.Displayed(V(outcome.Build), Slots.FirstStageEngine).estimate, 12);
            // Fix: max(20% · $20 M = $4 M, $1 M) = $4 M → back to 0.99
            var fixedBuild = TestCampaign.FixFlaw(outcome.Build, Cat, Slots.FirstStageEngine);
            Assert.Equal(4.0, fixedBuild.Ledger.Last().CostM, 12);
            Assert.Equal(0.99, ReliabilityModel.Displayed(V(fixedBuild), Slots.FirstStageEngine).estimate, 12);
        }

        [Fact]
        public void Unrevealed_flaw_lowers_the_truth_but_not_the_estimate()
        {
            var seed = FindSeed(s => Flawed(s, "avi_single"));
            var pos = ReliabilityModel.Hidden(seed, Cat.Part("avi_single")).BandPosition;
            var outcome = TestCampaign.Run(Avionics(seed), Cat, Blind, Slots.Avionics); // reveal chance 0
            Assert.False(outcome.FlawRevealed);
            Assert.Empty(TestCampaign.OpenFlaws(outcome.Build));
            var v = V(outcome.Build);
            Assert.Equal(0.97, ReliabilityModel.Displayed(v, Slots.Avionics).estimate, 12);
            Assert.Equal(0.97 + pos * 0.03 - 0.03, ReliabilityModel.True(v, Slots.Avionics), 12);
            Assert.Throws<InvalidOperationException>(() => TestCampaign.FixFlaw(outcome.Build, Cat, Slots.Avionics));
        }

        [Fact]
        public void A_part_without_a_flaw_never_reveals_one()
        {
            var seed = FindSeed(s => !Flawed(s, "avi_single"));
            var outcome = TestCampaign.Run(Avionics(seed), Cat, Sil, Slots.Avionics, minigameTier: 4);
            Assert.False(outcome.FlawRevealed);
            Assert.Empty(TestCampaign.OpenFlaws(outcome.Build));
        }

        [Theory]
        [InlineData("avi_single", 1.6)] // 20% · $8 M = $1.6 M
        [InlineData("avi_cheap", 1.0)]  // 20% · $2 M = $0.4 M → minimum $1 M
        [InlineData("eng_main", 4.0)]   // 20% · $20 M = $4 M
        public void Fix_cost_is_twenty_percent_with_a_one_million_floor(string partId, double expected)
        {
            Assert.Equal(expected, TestCampaign.FixCostM(Cat.Part(partId)), 12);
        }

        [Fact]
        public void Replacing_a_part_drops_its_open_flaw()
        {
            var seed = FindSeed(s => Flawed(s, "avi_single"));
            var b1 = TestCampaign.Run(Avionics(seed), Cat, Sil, Slots.Avionics).Build;
            Assert.Single(TestCampaign.OpenFlaws(b1));
            var b2 = b1.WithChoice(Slots.Avionics, "avi_cheap");
            Assert.Empty(TestCampaign.OpenFlaws(b2));
            // The new part has a fresh condition: the test can run again on the slot.
            Assert.NotNull(TestCampaign.Offer(b2, Cat, Sil, Slots.Avionics));
        }

        // ------------------------------------------------------------------ risks and range prices

        [Fact]
        public void Pogo_test_clears_the_pogo_risk_only()
        {
            var b0 = Rocket();
            Assert.False(TestCampaign.RiskCleared(b0, "pogo"));
            var b1 = TestCampaign.Run(b0, Cat, Pogo, Slots.FirstStageEngine).Build;
            Assert.True(TestCampaign.RiskCleared(b1, "pogo"));
            Assert.True(b1.HasFlag(TestCampaign.RiskClearedPrefix + "pogo"));
            Assert.False(TestCampaign.RiskCleared(b1, "software_fault"));
            // first_stage only: not offered on the upper engine
            var withUpper = b0.WithChoice(Slots.UpperStageEngine, "upr_eng");
            Assert.Null(TestCampaign.Offer(withUpper, Cat, Pogo, Slots.UpperStageEngine));
        }

        [Theory]
        [InlineData("tank_100", 2.6)]   // 100 t / 1,000 t = 0.1 → 2 + (8 − 2) · 0.1 = 2.6
        [InlineData("tank_1000", 8.0)]  // 1,000 t / 1,000 t = 1 → 8
        [InlineData("tank_2000", 8.0)]  // 2,000 t → scale clamped to 1 → 8
        public void Static_fire_cost_scales_with_first_stage_propellant(string tank, double expected)
        {
            var offer = TestCampaign.Offer(Rocket(Seed, tank), Cat, StaticFire, Slots.FirstStageEngine)!;
            Assert.Equal(expected, offer.CostM, 12);
            Assert.Equal(5, offer.Days);
        }

        [Fact]
        public void Static_fire_cost_on_the_upper_stage_uses_upper_propellant()
        {
            var b = BuildState.New("C1", Seed)
                .WithChoice(Slots.UpperStageEngine, "upr_eng")
                .WithChoice(Slots.UpperStageTank, "tank_100");
            // 20 t / 1,000 t = 0.02 → 2 + 6 · 0.02 = 2.12
            Assert.Equal(2.12, TestCampaign.Offer(b, Cat, StaticFire, Slots.UpperStageEngine)!.CostM, 12);
        }
    }
}
