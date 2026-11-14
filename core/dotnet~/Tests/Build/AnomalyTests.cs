using System;
using System.Collections.Generic;
using System.Linq;
using MissionForge.Core.Build;
using MissionForge.Core.Data;
using Xunit;

namespace MissionForge.Core.Tests.Build
{
    /// <summary>
    /// Hand-built catalog shared by the anomaly (design 6.8) and design-review (design 6.9) tests.
    ///
    /// Reference build (<see cref="FullBuild"/>, contract C1, all parts Proven):
    ///   payload stack  = 1000 (contract) + 200 (instrument) + 50 (avionics) + 30 (comms)   = 1 280 kg
    ///   upper stage    = 500 (engine) + 20 000 × 0.05 (kerolox tank dry) = 1 000 + 20 000 prop
    ///   upper stack    = 1 280 + 500 + 1 000 + 20 000                                      = 22 780 kg
    ///   first stage    = 2 × 2 000 (engines) + 100 000 × 0.05 (tank dry) + 100 000 prop
    ///   lift-off mass  = 22 780 + 4 000 + 5 000 + 100 000                                  = 131 780 kg
    ///   lift-off TWR   = 2 × 1 000 kN / (131 780 kg × 9.80665)                              = 1.55
    ///   parts cost     = 0 + 10 + 3×1 + 1 + 5×2 + 0 + 1 + 2 + 1                             = $28 M of $100 M
    ///   schedule       = max lead 200 (first engine) + Σ integ (0+10+10+5+20+0+5+5+5 = 60) = 260 of 400 days
    ///   success        = 0.99² (2-engine cluster, no engine-out) × 0.99 (upper) × 0.99³ (instrument,
    ///                    avionics, comms)                                                   = 0.99⁶ = 0.9415
    /// </summary>
    internal static class AnomalyReviewFixture
    {
        public const string C1 = "C1";
        public const string Mars = "C7";
        public const double BudgetM = 100.0;
        public const double ScheduleDays = 400.0;

        // Card IDs (design 6.8 table, one card per row).
        public const string SupplierDelay = "supplier_delay";
        public const string BudgetCut = "budget_cut";
        public const string TestFailure = "test_failure";
        public const string WeatherFront = "weather_front";
        public const string Breakthrough = "engineering_breakthrough";
        public const string RangeConflict = "range_conflict";
        public const string PayloadOverweight = "payload_overweight";
        public const string SoftwareBug = "software_bug";
        public const string Contamination = "contamination";
        public const string EngineerSick = "engineer_sick";
        public const string HeliumShortage = "helium_shortage";
        public const string LightningSeason = "lightning_season";

        public const string SoftwareTest = "software_in_the_loop";
        public const string VehicleTest = "integrated_vehicle_test";

        private static readonly Dictionary<string, double> EngineStats = new Dictionary<string, double>
        {
            ["thrust_sl_kN"] = 1000, ["thrust_vac_kN"] = 1100, ["isp_sl_s"] = 280, ["isp_vac_s"] = 310,
        };

        private static readonly Dictionary<string, double> UpperEngineStats = new Dictionary<string, double>
        {
            ["thrust_vac_kN"] = 100, ["isp_vac_s"] = 340, ["restarts"] = 1,
        };

        private static PartDef Part(string id, string category, double massKg, double costM, double leadDays, double integDays,
            double? reliability, Dictionary<string, double>? numbers = null, Dictionary<string, string>? text = null,
            string? propellant = null, string[]? tags = null, Dictionary<string, double>? anomalyWeights = null) =>
            new PartDef(id, category, id, massKg, costM, leadDays, integDays, reliability, Maturity.Proven,
                new PartStats(numbers ?? new Dictionary<string, double>(), text), propellant,
                tags: tags, anomalyWeights: anomalyWeights);

        public static List<PartDef> Parts() => new List<PartDef>
        {
            Part("site_coastal", PartCategories.LaunchSite, 0, 0, 0, 0, null,
                new Dictionary<string, double> { ["latitude_deg"] = 28.5 }, tags: new[] { "coastal", "busy_range", "subtropical" }),
            Part("site_inland", PartCategories.LaunchSite, 0, 0, 0, 0, null,
                new Dictionary<string, double> { ["latitude_deg"] = 40 }),
            Part("inst_camera", PartCategories.Instrument, 200, 10, 100, 10, 0.99,
                new Dictionary<string, double> { ["data_GB_per_day"] = 10 }),
            Part("inst_risky", PartCategories.Instrument, 200, 10, 100, 10, 0.75,
                new Dictionary<string, double> { ["data_GB_per_day"] = 10 }),
            Part("eng_upper", PartCategories.UpperStageEngine, 500, 3, 150, 10, 0.99,
                new Dictionary<string, double>(UpperEngineStats), propellant: "RP1_LOX"),
            Part("eng_pressure", PartCategories.UpperStageEngine, 500, 3, 150, 10, 0.99,
                new Dictionary<string, double>(UpperEngineStats), propellant: "RP1_LOX",
                tags: new[] { "pressure_fed" }, anomalyWeights: new Dictionary<string, double> { [HeliumShortage] = 2 }),
            Part("tank_upper", PartCategories.TankSize, 0, 1, 30, 5, null,
                new Dictionary<string, double> { ["upper_stage_propellant_t"] = 20 }, new Dictionary<string, string> { ["stage"] = "upper" }),
            // Single-source engine: tag (card trigger ×2) and data rule anomaly_weight ×2.
            Part("eng_single", PartCategories.FirstStageEngine, 2000, 5, 200, 20, 0.99,
                new Dictionary<string, double>(EngineStats), propellant: "RP1_LOX",
                tags: new[] { "single_source" }, anomalyWeights: new Dictionary<string, double> { [SupplierDelay] = 2 }),
            // Data rule only (no tag): ×3.
            Part("eng_rule", PartCategories.FirstStageEngine, 2000, 4, 200, 20, 0.99,
                new Dictionary<string, double>(EngineStats), propellant: "RP1_LOX",
                anomalyWeights: new Dictionary<string, double> { [SupplierDelay] = 3 }),
            Part("eng_plain", PartCategories.FirstStageEngine, 2000, 4, 200, 20, 0.99,
                new Dictionary<string, double>(EngineStats), propellant: "RP1_LOX"),
            Part("cnt_1", PartCategories.EngineCount, 0, 0, 0, 0, null,
                new Dictionary<string, double> { ["engine_count"] = 1 }, new Dictionary<string, string> { ["stage"] = "first" }),
            Part("cnt_2", PartCategories.EngineCount, 0, 0, 0, 0, null,
                new Dictionary<string, double> { ["engine_count"] = 2 }, new Dictionary<string, string> { ["stage"] = "first" }),
            Part("tank_first", PartCategories.TankSize, 0, 1, 30, 5, null,
                new Dictionary<string, double> { ["first_stage_propellant_t"] = 100 }, new Dictionary<string, string> { ["stage"] = "first" }),
            Part("avi_basic", PartCategories.Avionics, 50, 2, 60, 5, 0.99),
            Part("comm_good", PartCategories.Communications, 30, 1, 40, 5, 0.99,
                new Dictionary<string, double> { ["data_rate_GB_per_pass"] = 5 }),   // 5 × 6 passes = 30 GB/day
            Part("comm_weak", PartCategories.Communications, 30, 1, 40, 5, 0.99,
                new Dictionary<string, double> { ["data_rate_GB_per_pass"] = 0.5 }), // 0.5 × 6 = 3 GB/day < 10
        };

        private static List<ContractVote> Votes() => new List<ContractVote>
        {
            new ContractVote(PartCategories.LaunchSite, new[] { "site_coastal", "site_inland" }),
            new ContractVote(PartCategories.Instrument, new[] { "inst_camera", "inst_risky" }),
            new ContractVote(PartCategories.UpperStageEngine, new[] { "eng_upper", "eng_pressure" }),
            new ContractVote(PartCategories.TankSize, new[] { "tank_upper" }, stage: "upper"),
            new ContractVote(PartCategories.FirstStageEngine, new[] { "eng_single", "eng_rule", "eng_plain" }),
            new ContractVote(PartCategories.EngineCount, new[] { "cnt_1", "cnt_2" }, stage: "first"),
            new ContractVote(PartCategories.TankSize, new[] { "tank_first" }, stage: "first"),
            new ContractVote(PartCategories.Avionics, new[] { "avi_basic" }),
            new ContractVote(PartCategories.Communications, new[] { "comm_good", "comm_weak" }),
        };

        public static List<ContractDef> Contracts() => new List<ContractDef>
        {
            new ContractDef(C1, "Earth Observation", 1000, 9400, BudgetM, ScheduleDays, Votes(), science: true),
            // Mars-like: a missed deadline waits 780 days for the next window (mission-ending slip).
            new ContractDef(Mars, "Mars", 1000, 9400, BudgetM, ScheduleDays, Votes(), launchWindowIntervalDays: 780),
        };

        public static List<TestDef> Tests() => new List<TestDef>
        {
            new TestDef { Id = SoftwareTest, Name = "Software-in-the-loop", AppliesTo = new[] { "avionics" },
                CostKind = TestCostKind.Fixed, CostM = 1, Days = 5, ClearsRisks = new[] { "software_fault" } },
            new TestDef { Id = VehicleTest, Name = "Integrated vehicle test", AppliesTo = new[] { "vehicle" },
                CostKind = TestCostKind.Fixed, CostM = 2, Days = 4 },
        };

        private static AnomalyTrigger T(string condition, double multiplier) => new AnomalyTrigger { Condition = condition, Multiplier = multiplier };

        private static AnomalyResponse R(string id, EffectDef effect) => new AnomalyResponse { Id = id, Effect = effect };

        /// <summary>The twelve cards of design 6.8. Weights and multipliers are test values.</summary>
        public static List<AnomalyDef> Cards() => new List<AnomalyDef>
        {
            new AnomalyDef { Id = SupplierDelay, BaseWeight = 1, Target = "single_source_part",
                Triggers = new[] { T("single_source", 2) },
                Responses = new[] { R("expedite", new EffectDef { CostM = 4 }), R("accept", new EffectDef { LeadDays = 12 }),
                    R("swap", new EffectDef { ReopenCategory = EffectDef.ReopenTarget }) } },
            new AnomalyDef { Id = BudgetCut, BaseWeight = 1, Triggers = new[] { T("campaign", 3) },
                OnDraw = new EffectDef { BudgetFraction = -0.10 },
                Responses = new[] { R("cut_test", EffectDef.None), R("downgrade", new EffectDef { ReopenCategory = Slots.PayloadInstrument }),
                    R("emergency", new EffectDef { UsesEmergencyFunding = true }) } },
            new AnomalyDef { Id = TestFailure, BaseWeight = 5, RequiresCondition = "flaw_revealed", Target = "flawed_part",
                Responses = new[] { R("fix", new EffectDef { FixesFlaw = true, CostPartFraction = 0.2, Days = 3 }),
                    R("fly_as_is", new EffectDef { ReliabilityDelta = -0.02 }),
                    R("swap", new EffectDef { ReopenCategory = EffectDef.ReopenTarget }) } },
            new AnomalyDef { Id = WeatherFront, BaseWeight = 1, Triggers = new[] { T("coastal_site", 2) },
                Responses = new[] { R("move_earlier", new EffectDef { CostM = 2 }), R("accept_scrub", new EffectDef { AddFlags = new[] { "scrub_risk" } }) } },
            new AnomalyDef { Id = Breakthrough, BaseWeight = 0.5, Target = "engine",
                Responses = new[] { R("dv_bonus", new EffectDef { DvBonusFraction = 0.02 }), R("faster", new EffectDef { Days = -5 }) } },
            new AnomalyDef { Id = RangeConflict, BaseWeight = 1, Triggers = new[] { T("busy_site", 2) },
                Responses = new[] { R("priority", new EffectDef { CostM = 2 }), R("slip", new EffectDef { Days = 5 }) } },
            new AnomalyDef { Id = PayloadOverweight, BaseWeight = 1, Target = "payload", Triggers = new[] { T("payload_contract", 1.5) },
                Responses = new[] { R("remove_instrument", new EffectDef { ReopenCategory = Slots.PayloadInstrument }),
                    R("accept_margin", new EffectDef { MassKg = 150 }),
                    R("bigger_tank", new EffectDef { ReopenCategory = Slots.UpperStageTank }) } },
            new AnomalyDef { Id = SoftwareBug, BaseWeight = 1, Triggers = new[] { T(AnomalyConditions.TestSkippedPrefix + SoftwareTest, 3) },
                Responses = new[] { R("patch", new EffectDef { Days = 3 }),
                    R("workaround", new EffectDef { AddFlags = new[] { "guaranteed_alarm_minigame" } }) } },
            new AnomalyDef { Id = Contamination, BaseWeight = 1, Target = "payload", Triggers = new[] { T("science_payload", 3) },
                Responses = new[] { R("clean", new EffectDef { CostM = 1, Days = 2, MinigameId = "MG-05" }),
                    R("accept", new EffectDef { SciencePenaltyFraction = -0.2 }) } },
            new AnomalyDef { Id = EngineerSick, BaseWeight = 1, Triggers = new[] { T("random", 1) },
                Responses = new[] { R("overtime", new EffectDef { CostM = 1.5 }), R("slip", new EffectDef { Days = 3 }) } },
            new AnomalyDef { Id = HeliumShortage, BaseWeight = 0.5, Target = "pressure_fed_part", Triggers = new[] { T("pressure_fed", 4) },
                Responses = new[] { R("premium", new EffectDef { CostM = 2 }), R("switch_pressurant", new EffectDef { MassKg = 40 }) } },
            new AnomalyDef { Id = LightningSeason, BaseWeight = 1, Triggers = new[] { T("subtropical_site", 2) },
                Responses = new[] { R("accept", new EffectDef { AddFlags = new[] { "scrub_risk" } }), R("protect", new EffectDef { CostM = 1 }) } },
        };

        public static GameCatalog Catalog(bool reversed = false)
        {
            var parts = Parts();
            var cards = Cards();
            if (reversed) { parts.Reverse(); cards.Reverse(); }
            // GameCatalog.CheckReferences rejects EffectDef.ReopenTarget ("@target") as an unknown category, so the
            // "swap part" responses are loaded without it and set afterwards (EffectDef is mutable). See the report.
            var swaps = new List<EffectDef>();
            foreach (var c in cards)
                foreach (var r in c.Responses)
                    if (r.Effect.ReopenCategory == EffectDef.ReopenTarget) { r.Effect.ReopenCategory = null; swaps.Add(r.Effect); }
            var catalog = new GameCatalog(parts, Contracts(), Tests(), cards);
            foreach (var e in swaps) e.ReopenCategory = EffectDef.ReopenTarget;
            return catalog;
        }

        /// <summary>The reference build's (slot, part) choices in vote order.</summary>
        public static (string slot, string part)[] FullChoices(string firstEngine = "eng_single", string upperEngine = "eng_upper",
            string site = "site_coastal", string instrument = "inst_camera", string comms = "comm_good") => new[]
        {
            (Slots.LaunchSite, site),
            (Slots.PayloadInstrument, instrument),
            (Slots.UpperStageEngine, upperEngine),
            (Slots.UpperStageTank, "tank_upper"),
            (Slots.FirstStageEngine, firstEngine),
            (Slots.FirstStageEngineCount, "cnt_2"),
            (Slots.FirstStageTank, "tank_first"),
            (Slots.Avionics, "avi_basic"),
            (Slots.Communications, comms),
        };

        public static BuildState FullBuild(ulong seed = 1, string contract = C1, string firstEngine = "eng_single",
            string upperEngine = "eng_upper", string site = "site_coastal", string instrument = "inst_camera", string comms = "comm_good")
        {
            var b = BuildState.New(contract, seed);
            foreach (var (slot, part) in FullChoices(firstEngine, upperEngine, site, instrument, comms)) b = b.WithChoice(slot, part);
            return b;
        }

        /// <summary>Marks the part in a slot as having a revealed, unfixed flaw (as a test would).</summary>
        public static BuildState WithRevealedFlaw(BuildState b, string slot) =>
            b.WithCondition(slot, b.Condition(slot).With(flawRevealed: true));
    }

    public class AnomalyTests
    {
        private static readonly GameCatalog Catalog = AnomalyReviewFixture.Catalog();

        private static double WeightOf(BuildState b, string cardId, GameCatalog? catalog = null) =>
            AnomalyDeck.Weights(b, catalog ?? Catalog).Single(w => w.Card.Id == cardId).Weight;

        private static BuildState AfterVotes(BuildState b, int votes)
        {
            for (int i = 0; i < votes; i++) b = b.WithVoteResolved(Slots.LaunchSite, "site_coastal");
            return b;
        }

        // ------------------------------------------------------------------ draw timing

        [Fact]
        public void DrawChance_default_spacing_is_zero_before_three_votes_then_thirds_up_to_certain_at_five()
        {
            // min 3, max 5: chance = (votes − 3 + 1) / (5 − 3 + 1) = (votes − 2) / 3 for 3 ≤ votes < 5.
            Assert.Equal(0.0, AnomalyDeck.DrawChance(0));
            Assert.Equal(0.0, AnomalyDeck.DrawChance(2));
            Assert.Equal(1.0 / 3.0, AnomalyDeck.DrawChance(3), 12);
            Assert.Equal(2.0 / 3.0, AnomalyDeck.DrawChance(4), 12);
            Assert.Equal(1.0, AnomalyDeck.DrawChance(5));
            Assert.Equal(1.0, AnomalyDeck.DrawChance(9));
        }

        [Fact]
        public void DrawChance_with_custom_spacing_rises_linearly_from_min_to_max()
        {
            // min 2, max 6: chance = (votes − 2 + 1) / (6 − 2 + 1) = (votes − 1) / 5.
            Assert.Equal(0.0, AnomalyDeck.DrawChance(1, 2, 6));
            Assert.Equal(0.2, AnomalyDeck.DrawChance(2, 2, 6), 12);
            Assert.Equal(0.6, AnomalyDeck.DrawChance(4, 2, 6), 12);
            Assert.Equal(0.8, AnomalyDeck.DrawChance(5, 2, 6), 12);
            Assert.Equal(1.0, AnomalyDeck.DrawChance(6, 2, 6));
            // The default overload is the custom one with BuildConstants 3–5.
            for (int v = 0; v < 8; v++)
                Assert.Equal(AnomalyDeck.DrawChance(v, BuildConstants.AnomalyMinVotesBetween, BuildConstants.AnomalyMaxVotesBetween),
                    AnomalyDeck.DrawChance(v));
        }

        [Fact]
        public void ShouldDraw_is_never_before_three_votes_always_at_five_and_seeded_in_between()
        {
            int atThree = 0, atFour = 0;
            const int seeds = 3000;
            for (ulong seed = 1; seed <= seeds; seed++)
            {
                var b = BuildState.New(AnomalyReviewFixture.C1, seed);
                Assert.False(AnomalyDeck.ShouldDraw(AfterVotes(b, 2)));
                Assert.True(AnomalyDeck.ShouldDraw(AfterVotes(b, 5), Catalog)); // catalog without draw spacing → 3–5
                if (AnomalyDeck.ShouldDraw(AfterVotes(b, 3))) atThree++;
                if (AnomalyDeck.ShouldDraw(AfterVotes(b, 4))) atFour++;
            }
            // Expected 3000/3 = 1000 and 3000·2/3 = 2000; binomial σ = √(3000·⅓·⅔) ≈ 25.8, tolerance ≈ 5σ.
            Assert.InRange(atThree, 870, 1130);
            Assert.InRange(atFour, 1870, 2130);
            // Same build, same answer.
            var same = AfterVotes(BuildState.New(AnomalyReviewFixture.C1, 42), 3);
            Assert.Equal(AnomalyDeck.ShouldDraw(same), AnomalyDeck.ShouldDraw(same));
        }

        [Fact]
        public void MaybeDraw_waits_for_three_votes_and_a_draw_resets_the_vote_counter()
        {
            var b = AnomalyReviewFixture.FullBuild();
            Assert.Null(AnomalyDeck.MaybeDraw(AfterVotes(b, 2), Catalog));

            var five = AfterVotes(b, 5);
            var draw = AnomalyDeck.MaybeDraw(five, Catalog);
            Assert.NotNull(draw);
            Assert.Equal(0, draw!.Build.VotesSinceAnomaly);
            Assert.Equal(5, draw.Build.VotesCompleted);
            Assert.Equal(new[] { draw.Card.Id }, draw.Build.AnomaliesDrawn);
            // Right after a card nothing is drawn until three more votes.
            Assert.Null(AnomalyDeck.MaybeDraw(AfterVotes(draw.Build, 2), Catalog));
        }

        // ------------------------------------------------------------------ weights

        [Fact]
        public void Weights_are_base_weight_times_trigger_multipliers_sorted_by_card_id()
        {
            // Reference build: coastal/busy/subtropical site, single-source engine, science contract C1 with an
            // instrument vote, no tests run, no flaw, not a campaign.
            var weights = AnomalyDeck.Weights(AnomalyReviewFixture.FullBuild(), Catalog);
            var expected = new (string id, double w)[]
            {
                (AnomalyReviewFixture.BudgetCut, 1),           // campaign ×3 does not hold
                (AnomalyReviewFixture.Contamination, 3),       // 1 × 3 science payload
                (AnomalyReviewFixture.EngineerSick, 1),        // 1 × 1 random ("engineer_" < "engineeri": '_' 95 < 'i' 105)
                (AnomalyReviewFixture.Breakthrough, 0.5),      // engineering_breakthrough: base 0.5, no trigger
                (AnomalyReviewFixture.HeliumShortage, 0.5),    // no pressure-fed part
                (AnomalyReviewFixture.LightningSeason, 2),     // 1 × 2 subtropical site
                (AnomalyReviewFixture.PayloadOverweight, 1.5), // 1 × 1.5 payload contract
                (AnomalyReviewFixture.RangeConflict, 2),       // 1 × 2 busy site
                (AnomalyReviewFixture.SoftwareBug, 3),         // 1 × 3 software test skipped
                (AnomalyReviewFixture.SupplierDelay, 4),       // 1 × 2 single_source trigger × 2 part rule
                (AnomalyReviewFixture.TestFailure, 0),         // requires a revealed flaw
                (AnomalyReviewFixture.WeatherFront, 2),        // 1 × 2 coastal site
            };
            Assert.Equal(expected.Select(e => e.id), weights.Select(w => w.Card.Id)); // ordinal ID order
            for (int i = 0; i < expected.Length; i++) Assert.Equal(expected[i].w, weights[i].Weight, 12);
        }

        [Fact]
        public void Site_campaign_and_pressure_fed_triggers_only_apply_when_their_condition_holds()
        {
            var inland = AnomalyReviewFixture.FullBuild(site: "site_inland");
            Assert.Equal(1, WeightOf(inland, AnomalyReviewFixture.WeatherFront));    // no coastal ×2
            Assert.Equal(1, WeightOf(inland, AnomalyReviewFixture.RangeConflict));   // no busy range ×2
            Assert.Equal(1, WeightOf(inland, AnomalyReviewFixture.LightningSeason)); // no subtropical ×2

            // Campaign mode: budget cut 1 × 3 = 3.
            Assert.Equal(3, WeightOf(AnomalyReviewFixture.FullBuild().WithFlag("campaign"), AnomalyReviewFixture.BudgetCut));

            // Pressure-fed upper engine: helium 0.5 base × 4 trigger × 2 part rule = 4.
            var pressure = AnomalyReviewFixture.FullBuild(upperEngine: "eng_pressure");
            Assert.Equal(4, WeightOf(pressure, AnomalyReviewFixture.HeliumShortage), 12);

            // Non-science contract: contamination back to its base weight 1.
            Assert.Equal(1, WeightOf(AnomalyReviewFixture.FullBuild(contract: AnomalyReviewFixture.Mars), AnomalyReviewFixture.Contamination));
        }

        [Fact]
        public void Part_anomaly_weight_rules_multiply_the_card_weight()
        {
            // Supplier Delay: base 1; single_source trigger ×2; part rule anomaly_weight.
            Assert.Equal(1, WeightOf(AnomalyReviewFixture.FullBuild(firstEngine: "eng_plain"), AnomalyReviewFixture.SupplierDelay)); // 1
            Assert.Equal(3, WeightOf(AnomalyReviewFixture.FullBuild(firstEngine: "eng_rule"), AnomalyReviewFixture.SupplierDelay));  // 1 × 3 (rule only)
            Assert.Equal(4, WeightOf(AnomalyReviewFixture.FullBuild(firstEngine: "eng_single"), AnomalyReviewFixture.SupplierDelay)); // 1 × 2 × 2
        }

        [Fact]
        public void Drawn_cards_weigh_zero_but_event_cards_with_a_required_condition_recur()
        {
            var b = AnomalyReviewFixture.FullBuild();
            var drawn = AnomalyDeck.DrawSpecific(b, Catalog, AnomalyReviewFixture.WeatherFront).Build;
            Assert.Equal(0, WeightOf(drawn, AnomalyReviewFixture.WeatherFront));
            Assert.Equal(2, WeightOf(drawn, AnomalyReviewFixture.RangeConflict)); // other cards untouched

            // Test Failure: 0 without a revealed flaw, base 5 with one, still 5 after being drawn.
            Assert.Equal(0, WeightOf(b, AnomalyReviewFixture.TestFailure));
            var flawed = AnomalyReviewFixture.WithRevealedFlaw(b, Slots.FirstStageEngine);
            Assert.Equal(5, WeightOf(flawed, AnomalyReviewFixture.TestFailure));
            var failureDrawn = AnomalyDeck.DrawSpecific(flawed, Catalog, AnomalyReviewFixture.TestFailure);
            Assert.Equal(Slots.FirstStageEngine, failureDrawn.TargetCategory);
            Assert.Equal(5, WeightOf(failureDrawn.Build, AnomalyReviewFixture.TestFailure));

            // Fixing the flaw closes the condition again.
            var fixedBuild = AnomalyDeck.Respond(failureDrawn.Build, Catalog, AnomalyReviewFixture.TestFailure, "fix");
            Assert.Empty(TestCampaign.OpenFlaws(fixedBuild));
            Assert.Equal(0, WeightOf(fixedBuild, AnomalyReviewFixture.TestFailure));
        }

        [Fact]
        public void Test_skipped_condition_stops_holding_once_the_test_has_run()
        {
            var b = AnomalyReviewFixture.FullBuild();
            var v = new Vehicle(b, Catalog);
            Assert.True(AnomalyConditions.Holds("test_skipped:" + AnomalyReviewFixture.SoftwareTest, v));
            Assert.True(AnomalyConditions.Holds("skipped_software_test", v));
            Assert.Equal(3, WeightOf(b, AnomalyReviewFixture.SoftwareBug)); // 1 × 3

            // Part-level test on the avionics slot.
            var tested = TestCampaign.Run(b, Catalog, AnomalyReviewFixture.SoftwareTest, Slots.Avionics).Build;
            var tv = new Vehicle(tested, Catalog);
            Assert.False(AnomalyConditions.Holds("test_skipped:" + AnomalyReviewFixture.SoftwareTest, tv));
            Assert.False(AnomalyConditions.Holds("skipped_software_test", tv)); // risk software_fault cleared
            Assert.Equal(1, WeightOf(tested, AnomalyReviewFixture.SoftwareBug)); // trigger no longer multiplies

            // Vehicle-level test (recorded as a flag, not on a part condition).
            Assert.True(AnomalyConditions.Holds("test_skipped:" + AnomalyReviewFixture.VehicleTest, v));
            var vehicleTested = TestCampaign.Run(b, Catalog, AnomalyReviewFixture.VehicleTest, TestCampaign.VehicleTarget).Build;
            Assert.False(AnomalyConditions.Holds("test_skipped:" + AnomalyReviewFixture.VehicleTest, new Vehicle(vehicleTested, Catalog)));

            // Unknown conditions are false.
            Assert.False(AnomalyConditions.Holds("no_such_condition", v));
        }

        [Fact]
        public void Draw_returns_null_when_every_weight_is_zero()
        {
            // Only Test Failure is left and there is no revealed flaw.
            var failure = AnomalyReviewFixture.Cards().Single(c => c.Id == AnomalyReviewFixture.TestFailure);
            failure.Responses = failure.Responses.Where(r => r.Id != "swap").ToArray(); // "@target" does not load (see fixture)
            var only = new GameCatalog(AnomalyReviewFixture.Parts(), AnomalyReviewFixture.Contracts(), AnomalyReviewFixture.Tests(),
                new[] { failure });
            var b = AfterVotes(AnomalyReviewFixture.FullBuild(), 5);
            Assert.Null(AnomalyDeck.Draw(b, only));
            Assert.Null(AnomalyDeck.MaybeDraw(b, only));
        }

        // ------------------------------------------------------------------ seeded draw

        [Fact]
        public void Weighted_draw_picks_a_weight_3_card_about_three_times_as_often_as_a_weight_1_card()
        {
            var catalog = new GameCatalog(new PartDef[0],
                new[] { new ContractDef("C1", "Empty", 1000, 9400, 100, 400, new ContractVote[0]) },
                anomalies: new[]
                {
                    new AnomalyDef { Id = "heavy", BaseWeight = 3, Responses = new[] { new AnomalyResponse { Id = "ok" } } },
                    new AnomalyDef { Id = "light", BaseWeight = 1, Responses = new[] { new AnomalyResponse { Id = "ok" } } },
                });
            int heavy = 0;
            const int seeds = 2000;
            for (ulong seed = 1; seed <= seeds; seed++)
                if (AnomalyDeck.Draw(BuildState.New("C1", seed), catalog)!.Card.Id == "heavy") heavy++;
            // P(heavy) = 3 / (3 + 1) = 0.75 → expected 1500; σ = √(2000 · 0.75 · 0.25) ≈ 19.4; tolerance ≈ 5σ.
            Assert.InRange(heavy, 1400, 1600);
        }

        /// <summary>Plays a whole build: 27 votes (three rounds over the nine slots), drawing and answering with the first response.</summary>
        private static List<string> PlayBuild(ulong seed, GameCatalog catalog)
        {
            var b = BuildState.New(AnomalyReviewFixture.C1, seed);
            var log = new List<string>();
            for (int round = 0; round < 3; round++)
            {
                foreach (var (slot, part) in AnomalyReviewFixture.FullChoices())
                {
                    b = b.WithVoteResolved(slot, part);
                    var draw = AnomalyDeck.MaybeDraw(b, catalog);
                    if (draw == null) continue;
                    log.Add(b.VotesCompleted + ":" + draw.Card.Id);
                    b = AnomalyDeck.Respond(draw.Build, catalog, draw.Card.Id, draw.Card.Responses[0].Id);
                }
            }
            return log;
        }

        [Fact]
        public void Same_seed_and_build_give_the_same_card_sequence_and_another_seed_differs()
        {
            var first = PlayBuild(1, Catalog);
            var again = PlayBuild(1, AnomalyReviewFixture.Catalog());
            Assert.Equal(first, again);
            // 27 votes with at most 5 between cards → at least 27 / 5 = 5 cards; without replacement, all distinct.
            Assert.True(first.Count >= 5, string.Join(", ", first));
            Assert.Equal(first.Count, first.Select(e => e.Split(':')[1]).Distinct().Count());

            ulong differing = 0;
            for (ulong seed = 2; seed <= 200 && differing == 0; seed++)
                if (!PlayBuild(seed, Catalog).SequenceEqual(first)) differing = seed;
            Assert.NotEqual(0UL, differing);
        }

        [Fact]
        public void Draws_do_not_depend_on_dictionary_or_catalog_order()
        {
            var reversedCatalog = AnomalyReviewFixture.Catalog(reversed: true);
            var choices = AnomalyReviewFixture.FullChoices();
            for (ulong seed = 1; seed <= 50; seed++)
            {
                var forward = BuildState.New(AnomalyReviewFixture.C1, seed);
                foreach (var (slot, part) in choices) forward = forward.WithChoice(slot, part);
                var backward = BuildState.New(AnomalyReviewFixture.C1, seed);
                foreach (var (slot, part) in choices.Reverse()) backward = backward.WithChoice(slot, part);

                var wf = AnomalyDeck.Weights(forward, Catalog);
                var wb = AnomalyDeck.Weights(backward, reversedCatalog);
                Assert.Equal(wf.Select(w => w.Card.Id), wb.Select(w => w.Card.Id));
                Assert.Equal(wf.Select(w => w.Weight), wb.Select(w => w.Weight));
                Assert.Equal(AnomalyDeck.Draw(forward, Catalog)!.Card.Id, AnomalyDeck.Draw(backward, reversedCatalog)!.Card.Id);
            }
        }

        // ------------------------------------------------------------------ effects

        [Fact]
        public void Budget_cut_on_draw_removes_ten_percent_of_the_contract_budget()
        {
            var b = AnomalyReviewFixture.FullBuild();
            var draw = AnomalyDeck.DrawSpecific(b, Catalog, AnomalyReviewFixture.BudgetCut);
            var entry = draw.Build.Ledger.Last();
            Assert.Equal(LedgerKind.Anomaly, entry.Kind);
            Assert.Equal("budget_cut/draw", entry.SourceId);
            Assert.Equal(-10.0, entry.BudgetDeltaM, 9); // 100 × −0.10
            Assert.Equal(0.0, entry.CostM);
            Assert.Equal(90.0, Dashboard.Compute(draw.Build, Catalog).Budget.BudgetM, 9); // 100 − 10
            Assert.Null(draw.TargetCategory);

            // "Downgrade a part" reopens the named slot.
            var downgrade = AnomalyDeck.Respond(draw.Build, Catalog, AnomalyReviewFixture.BudgetCut, "downgrade");
            Assert.Equal(Slots.PayloadInstrument, downgrade.ReopenedCategory);
            Assert.Equal(Slots.PayloadInstrument, VoteOptions.NextVote(downgrade, Catalog));
        }

        [Fact]
        public void Emergency_funding_response_adds_ten_percent_once_and_throws_the_second_time()
        {
            var cut = AnomalyDeck.DrawSpecific(AnomalyReviewFixture.FullBuild(), Catalog, AnomalyReviewFixture.BudgetCut).Build;
            var funded = AnomalyDeck.Respond(cut, Catalog, AnomalyReviewFixture.BudgetCut, "emergency");
            Assert.True(funded.HasFlag(VoteOptions.EmergencyFundingUsedFlag));
            var entry = funded.Ledger.Last();
            Assert.Equal(LedgerKind.Budget, entry.Kind);
            Assert.Equal(10.0, entry.BudgetDeltaM, 9);                                     // 100 × 0.10
            Assert.Equal(100.0, Dashboard.Compute(funded, Catalog).Budget.BudgetM, 9);   // 100 − 10 + 10

            Assert.Throws<InvalidOperationException>(() =>
                AnomalyDeck.Respond(funded, Catalog, AnomalyReviewFixture.BudgetCut, "emergency"));
            Assert.Throws<InvalidOperationException>(() => VoteOptions.UseEmergencyFunding(funded, Catalog));
        }

        [Fact]
        public void Supplier_delay_expedite_charges_4M_to_the_ledger()
        {
            var b = AnomalyReviewFixture.FullBuild();
            var draw = AnomalyDeck.DrawSpecific(b, Catalog, AnomalyReviewFixture.SupplierDelay);
            Assert.Equal(Slots.FirstStageEngine, draw.TargetCategory); // the single-source part
            Assert.Equal(b.Ledger.Count, draw.Build.Ledger.Count);    // no on-draw effect

            var r = AnomalyDeck.Respond(draw.Build, Catalog, AnomalyReviewFixture.SupplierDelay, "expedite");
            var entry = r.Ledger.Last();
            Assert.Equal("supplier_delay/expedite", entry.SourceId);
            Assert.Equal(4.0, entry.CostM);
            Assert.Equal(0.0, entry.Days);
            Assert.Equal(Slots.FirstStageEngine, entry.Category);
            var budget = Dashboard.Compute(r, Catalog).Budget;
            Assert.Equal(4.0, budget.LedgerCostM, 9);
            Assert.Equal(32.0, budget.TotalCostM, 9); // parts 28 + 4
            Assert.Equal(260.0, budget.TotalDays, 9); // schedule unchanged
        }

        [Fact]
        public void Supplier_delay_accept_adds_lead_days_only_to_the_targeted_part()
        {
            var b = AnomalyReviewFixture.FullBuild();
            var before = Dashboard.Compute(b, Catalog).Budget;
            Assert.Equal(200.0, before.MaxLeadDays); // eng_single

            // Default target: the single-source first-stage engine, which is on the critical path.
            var onPath = AnomalyDeck.Respond(b, Catalog, AnomalyReviewFixture.SupplierDelay, "accept");
            Assert.Equal(12.0, onPath.Ledger.Last().LeadDays);
            Assert.Equal(0.0, onPath.Ledger.Last().Days);
            var after = Dashboard.Compute(onPath, Catalog).Budget;
            Assert.Equal(212.0, after.MaxLeadDays, 9); // 200 + 12
            Assert.Equal(272.0, after.TotalDays, 9);   // 212 + 60 integration
            Assert.Equal(100.0, after.Timeline.Single(s => s.Kind == StepKind.Procure && s.Category == Slots.PayloadInstrument).DurationDays);

            // Override: the instrument (lead 100 → 112) has slack, so the launch date does not move.
            var offPath = AnomalyDeck.Respond(b, Catalog, AnomalyReviewFixture.SupplierDelay, "accept", Slots.PayloadInstrument);
            var off = Dashboard.Compute(offPath, Catalog).Budget;
            Assert.Equal(112.0, off.Timeline.Single(s => s.Kind == StepKind.Procure && s.Category == Slots.PayloadInstrument).DurationDays, 9);
            Assert.Equal(200.0, off.MaxLeadDays, 9);
            Assert.Equal(260.0, off.TotalDays, 9);
        }

        [Fact]
        public void Swap_response_reopens_the_targeted_slot_and_does_nothing_without_a_target()
        {
            var b = AnomalyReviewFixture.FullBuild();
            var swap = AnomalyDeck.Respond(b, Catalog, AnomalyReviewFixture.SupplierDelay, "swap");
            Assert.Equal(Slots.FirstStageEngine, swap.ReopenedCategory);
            Assert.Equal(Slots.FirstStageEngine, VoteOptions.NextVote(swap, Catalog));
            Assert.Equal(b.Ledger.Count, swap.Ledger.Count); // a swap costs nothing by itself
            // The re-vote closes the reopened slot.
            var revoted = DesignReview.CompleteRework(swap, Catalog, "eng_plain");
            Assert.Null(revoted.ReopenedCategory);
            Assert.Equal("eng_plain", revoted.Choice(Slots.FirstStageEngine));

            // Empty build: no single-source part and no lead times → no target → nothing reopened.
            var empty = BuildState.New(AnomalyReviewFixture.C1, 1);
            var none = AnomalyDeck.Respond(empty, Catalog, AnomalyReviewFixture.SupplierDelay, "swap");
            Assert.Null(none.ReopenedCategory);
        }

        [Fact]
        public void Day_responses_move_the_serial_schedule()
        {
            var b = AnomalyReviewFixture.FullBuild(); // 260 days
            var slip = AnomalyDeck.Respond(b, Catalog, AnomalyReviewFixture.RangeConflict, "slip");
            Assert.Equal(265.0, Dashboard.Compute(slip, Catalog).Budget.TotalDays, 9); // 260 + 5
            Assert.Equal(5.0, Dashboard.Compute(slip, Catalog).Budget.OtherDays, 9);
            Assert.Equal(StepKind.Anomaly, Dashboard.Compute(slip, Catalog).Budget.Timeline.Last().Kind);

            var faster = AnomalyDeck.Respond(b, Catalog, AnomalyReviewFixture.Breakthrough, "faster");
            Assert.Equal(255.0, Dashboard.Compute(faster, Catalog).Budget.TotalDays, 9); // 260 − 5

            var patch = AnomalyDeck.Respond(b, Catalog, AnomalyReviewFixture.SoftwareBug, "patch");
            Assert.Equal(263.0, Dashboard.Compute(patch, Catalog).Budget.TotalDays, 9); // 260 + 3
        }

        [Fact]
        public void Test_failure_fly_as_is_lowers_reliability_and_fix_charges_twenty_percent_of_the_part()
        {
            var flawed = AnomalyReviewFixture.WithRevealedFlaw(AnomalyReviewFixture.FullBuild(), Slots.FirstStageEngine);
            var before = ReliabilityModel.Displayed(new Vehicle(flawed, Catalog), Slots.FirstStageEngine).estimate;

            var asIs = AnomalyDeck.Respond(flawed, Catalog, AnomalyReviewFixture.TestFailure, "fly_as_is");
            Assert.Equal(-0.02, asIs.Condition(Slots.FirstStageEngine).ReliabilityDelta, 12);
            var after = ReliabilityModel.Displayed(new Vehicle(asIs, Catalog), Slots.FirstStageEngine).estimate;
            Assert.Equal(-0.02, after - before, 9);
            Assert.Equal(flawed.Ledger.Count, asIs.Ledger.Count); // free, but riskier
            Assert.Equal(0.0, asIs.Condition(Slots.UpperStageEngine).ReliabilityDelta); // other parts untouched

            var fix = AnomalyDeck.Respond(flawed, Catalog, AnomalyReviewFixture.TestFailure, "fix");
            var entry = fix.Ledger.Last();
            Assert.Equal(1.0, entry.CostM, 12); // 0.2 × $5 M unit cost of eng_single
            Assert.Equal(3.0, entry.Days);
            Assert.True(fix.Condition(Slots.FirstStageEngine).FlawFixed);
            Assert.Empty(TestCampaign.OpenFlaws(fix));
        }

        [Fact]
        public void Breakthrough_dv_bonus_adds_two_percent_of_the_engine_stage_dv()
        {
            var b = AnomalyReviewFixture.FullBuild();
            var before = Dashboard.Compute(b, Catalog);
            Assert.Equal(0.0, before.EngineBonusDvMps);

            var r = AnomalyDeck.Respond(b, Catalog, AnomalyReviewFixture.Breakthrough, "dv_bonus"); // target "engine" → first stage
            Assert.Equal(0.02, r.Condition(Slots.FirstStageEngine).DvBonusFraction, 12);
            var d = Dashboard.Compute(r, Catalog);
            // First phase: Isp_eff = (280 + 310)/2 = 295 s; m0 = 131 780 kg, mf = 31 780 kg.
            //   295 × 9.80665 = 2892.962 m/s;  ln(131 780 / 31 780) = ln(4.146633) = 1.422297
            //   Δv = 2892.962 × 1.422297 = 4114.65 m/s;  bonus = 0.02 × 4114.65 = 82.29 m/s
            Assert.InRange(d.EngineBonusDvMps, 82.2, 82.4);
            Assert.Equal(0.02 * d.Phases.Single(p => p.Id == "first").DvMps, d.EngineBonusDvMps, 9);
            Assert.Equal(before.TotalDvMps + d.EngineBonusDvMps, d.TotalDvMps, 6);

            // The team may pick the upper engine instead: 2% of the upper phase only.
            var upper = Dashboard.Compute(AnomalyDeck.Respond(b, Catalog, AnomalyReviewFixture.Breakthrough, "dv_bonus", Slots.UpperStageEngine), Catalog);
            Assert.Equal(0.02 * upper.Phases.Single(p => p.Id == "upper").DvMps, upper.EngineBonusDvMps, 9);
        }

        [Fact]
        public void Helium_switch_pressurant_adds_mass_to_the_payload_stack()
        {
            var b = AnomalyReviewFixture.FullBuild(upperEngine: "eng_pressure");
            Assert.Equal(1280.0, new Vehicle(b, Catalog).Mass.PayloadKg, 9);
            var draw = AnomalyDeck.DrawSpecific(b, Catalog, AnomalyReviewFixture.HeliumShortage);
            Assert.Equal(Slots.UpperStageEngine, draw.TargetCategory); // the pressure-fed part

            var r = AnomalyDeck.Respond(draw.Build, Catalog, AnomalyReviewFixture.HeliumShortage, "switch_pressurant");
            Assert.Equal(40.0, r.Ledger.Last().MassKg);
            Assert.Equal(0.0, r.Ledger.Last().CostM);
            Assert.Equal(1320.0, new Vehicle(r, Catalog).Mass.PayloadKg, 9); // 1280 + 40
            Assert.True(Dashboard.Compute(r, Catalog).TotalDvMps < Dashboard.Compute(b, Catalog).TotalDvMps);
        }

        [Fact]
        public void Flag_minigame_and_science_responses_set_build_flags()
        {
            var b = AnomalyReviewFixture.FullBuild();

            var workaround = AnomalyDeck.Respond(b, Catalog, AnomalyReviewFixture.SoftwareBug, "workaround");
            Assert.True(workaround.HasFlag("guaranteed_alarm_minigame"));
            Assert.Equal(b.Ledger.Count, workaround.Ledger.Count);

            var clean = AnomalyDeck.Respond(b, Catalog, AnomalyReviewFixture.Contamination, "clean");
            Assert.True(clean.HasFlag("minigame_pending:MG-05"));
            Assert.Equal(1.0, clean.Ledger.Last().CostM);
            Assert.Equal(2.0, clean.Ledger.Last().Days);
            Assert.Equal(Slots.PayloadInstrument, clean.Ledger.Last().Category); // target "payload" → first payload slot

            var accept = AnomalyDeck.Respond(b, Catalog, AnomalyReviewFixture.Contamination, "accept");
            Assert.True(accept.HasFlag("science_penalty:contamination/accept"));

            var scrub = AnomalyDeck.Respond(b, Catalog, AnomalyReviewFixture.LightningSeason, "accept");
            Assert.True(scrub.HasFlag("scrub_risk"));
            var protect = AnomalyDeck.Respond(b, Catalog, AnomalyReviewFixture.LightningSeason, "protect");
            Assert.Equal(1.0, protect.Ledger.Last().CostM);
            Assert.False(protect.HasFlag("scrub_risk"));
        }

        [Fact]
        public void Responding_with_an_unknown_response_or_card_throws_a_catalog_exception()
        {
            var b = AnomalyReviewFixture.FullBuild();
            Assert.Throws<CatalogException>(() => AnomalyDeck.Respond(b, Catalog, AnomalyReviewFixture.SupplierDelay, "panic"));
            Assert.Throws<CatalogException>(() => AnomalyDeck.Respond(b, Catalog, "no_such_card", "expedite"));
        }
    }
}
