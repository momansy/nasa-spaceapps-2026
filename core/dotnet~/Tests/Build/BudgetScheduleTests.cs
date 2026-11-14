using System.Collections.Generic;
using System.Linq;
using MissionForge.Core.Build;
using MissionForge.Core.Data;
using Xunit;

namespace MissionForge.Core.Tests.Build
{
    /// <summary>
    /// Budget, schedule and critical path (GAME_DESIGN.md 6.3, 6.4, 7.6-7.11, 7.18, 7.20).
    /// Every expected value is computed by hand from the test catalog below; money is $M (game value),
    /// time is days (game value).
    /// </summary>
    public class BudgetScheduleTests
    {
        private const int Precision = 9;

        // ------------------------------------------------------------------ test catalog
        //
        // id               category              cost  lead integ  notes
        // site_coast       launch_site           10     5    2     launch-site fee
        // inst_imager      instrument             3    40    4
        // eng_up_vac       upper_stage_engine     3    25    2     kerolox vacuum
        // eng_up_tie       upper_stage_engine     3    40    2     same lead as the instrument (tie-break)
        // cnt_1/2/9        engine_count           0     0    0/0/8 engine_count 1/2/9
        // tank_m           tank_size              0    10    3     no cost -> 0.02 $M/t: 280 t first, 60 t upper
        // tank_priced      tank_size              5    10    3     priced in data
        // eng_first        first_stage_engine   1.2    30    2     kerolox workhorse
        // mat_al           structural_material    0     0    0     cost x1.0
        // mat_alli         structural_material    2     0    4     cost x1.4
        // mat_steel        structural_material    1     0   -5     cost x0.6, integration saving
        // boost_none       strap_on_booster       0     0    0     booster_count 0
        // boost_solid2     strap_on_booster       6     0    0     booster_count 2, 6 $M each
        // boost_liquid2    strap_on_booster       0     0    0     mirror_first_stage, count 2, cost_first_stage_mult 2, +15 integ
        // boost_liquid3    strap_on_booster     0.5     0    0     mirror_first_stage, count 3, no mult (falls back to count)
        // rec_rtls         booster_recovery       0     0    0     refund_fraction 0.6
        // rec_drone        booster_recovery       0     0    0     refund_fraction 0.55, extra_cost_M 1
        // ma_fast          mission_assurance      0     0    0     cost_fraction -0.15, days_fraction -0.10
        // ma_standard      mission_assurance      0     0    0
        // ma_class_a       mission_assurance      0     0    0     cost_fraction +0.20, days_fraction +0.15
        //
        // Contracts: C1 budget 150 $M, deadline 120 days, launch window every 30 days.
        //            C7 (Mars) budget 500 $M, deadline 50 days, launch window every 780 days.

        private static PartDef P(string id, string category, double costM, double leadDays, double integDays,
            Dictionary<string, double>? stats = null, string? propellant = null, string[]? tags = null,
            Dictionary<string, string>? text = null, double massKg = 100) =>
            new PartDef(id, category, id, massKg, costM, leadDays, integDays, 0.99, Maturity.Proven,
                new PartStats(stats ?? new Dictionary<string, double>(), text ?? new Dictionary<string, string>()),
                propellant: propellant, tags: tags);

        private static List<PartDef> Parts() => new List<PartDef>
        {
            P("site_coast", PartCategories.LaunchSite, 10, 5, 2, new Dictionary<string, double> { ["latitude_deg"] = 28.5 }),
            P("inst_imager", PartCategories.Instrument, 3, 40, 4),
            P("eng_up_vac", PartCategories.UpperStageEngine, 3, 25, 2,
                new Dictionary<string, double> { ["thrust_vac_kN"] = 980, ["isp_vac_s"] = 348 }, "RP1_LOX", massKg: 600),
            P("eng_up_tie", PartCategories.UpperStageEngine, 3, 40, 2,
                new Dictionary<string, double> { ["thrust_vac_kN"] = 980, ["isp_vac_s"] = 348 }, "RP1_LOX", massKg: 600),
            P("cnt_1", PartCategories.EngineCount, 0, 0, 0, new Dictionary<string, double> { ["engine_count"] = 1 },
                text: new Dictionary<string, string> { ["engine_out_capability"] = "no" }),
            P("cnt_2", PartCategories.EngineCount, 0, 0, 0, new Dictionary<string, double> { ["engine_count"] = 2 },
                text: new Dictionary<string, string> { ["engine_out_capability"] = "partial" }),
            P("cnt_9", PartCategories.EngineCount, 0, 0, 8, new Dictionary<string, double> { ["engine_count"] = 9 },
                text: new Dictionary<string, string> { ["engine_out_capability"] = "yes" }),
            P("tank_m", PartCategories.TankSize, 0, 10, 3,
                new Dictionary<string, double> { ["first_stage_propellant_t"] = 280, ["upper_stage_propellant_t"] = 60 }),
            P("tank_priced", PartCategories.TankSize, 5, 10, 3,
                new Dictionary<string, double> { ["first_stage_propellant_t"] = 280, ["upper_stage_propellant_t"] = 60 }),
            P("eng_first", PartCategories.FirstStageEngine, 1.2, 30, 2,
                new Dictionary<string, double> { ["thrust_sl_kN"] = 850, ["thrust_vac_kN"] = 930, ["isp_sl_s"] = 282, ["isp_vac_s"] = 311 },
                "RP1_LOX", massKg: 470),
            P("mat_al", PartCategories.StructuralMaterial, 0, 0, 0,
                new Dictionary<string, double> { ["dry_mass_multiplier"] = 1.0, ["cost_multiplier"] = 1.0 }),
            P("mat_alli", PartCategories.StructuralMaterial, 2, 0, 4,
                new Dictionary<string, double> { ["dry_mass_multiplier"] = 0.88, ["cost_multiplier"] = 1.4 }),
            P("mat_steel", PartCategories.StructuralMaterial, 1, 0, -5,
                new Dictionary<string, double> { ["dry_mass_multiplier"] = 1.25, ["cost_multiplier"] = 0.6 }),
            P("boost_none", PartCategories.StrapOnBooster, 0, 0, 0, new Dictionary<string, double> { ["booster_count"] = 0 }, massKg: 0),
            P("boost_solid2", PartCategories.StrapOnBooster, 6, 0, 0,
                new Dictionary<string, double> { ["booster_count"] = 2, ["thrust_sl_each_kN"] = 1600 }, "SOLID", massKg: 49000),
            P("boost_liquid2", PartCategories.StrapOnBooster, 0, 0, 0,
                new Dictionary<string, double> { ["booster_count"] = 2, ["cost_first_stage_mult"] = 2, ["extra_integ_days"] = 15 },
                tags: new[] { "mirror_first_stage" }, massKg: 0),
            P("boost_liquid3", PartCategories.StrapOnBooster, 0.5, 0, 0,
                new Dictionary<string, double> { ["booster_count"] = 3 }, tags: new[] { "mirror_first_stage" }, massKg: 0),
            P("rec_rtls", PartCategories.BoosterRecovery, 0, 0, 0,
                new Dictionary<string, double> { ["refund_fraction"] = 0.6, ["dv_cost_fraction"] = 0.15 }, massKg: 0),
            P("rec_drone", PartCategories.BoosterRecovery, 0, 0, 0,
                new Dictionary<string, double> { ["refund_fraction"] = 0.55, ["dv_cost_fraction"] = 0.08, ["extra_cost_M"] = 1 }, massKg: 0),
            P("ma_fast", PartCategories.MissionAssurance, 0, 0, 0,
                new Dictionary<string, double> { ["cost_fraction"] = -0.15, ["days_fraction"] = -0.10, ["band_scale"] = 1.5 }, massKg: 0),
            P("ma_standard", PartCategories.MissionAssurance, 0, 0, 0, massKg: 0),
            P("ma_class_a", PartCategories.MissionAssurance, 0, 0, 0,
                new Dictionary<string, double> { ["cost_fraction"] = 0.20, ["days_fraction"] = 0.15, ["band_scale"] = 0.5, ["reliability_bonus"] = 0.01 },
                massKg: 0),
        };

        /// <summary>One vote per slot that has options in the catalog, listing every part of its category.</summary>
        private static ContractVote[] Votes(List<PartDef> parts)
        {
            var votes = new List<ContractVote>();
            foreach (var slot in Slots.VoteOrder)
            {
                var category = Slots.CategoryOf(slot);
                var ids = parts.Where(p => p.Category == category).Select(p => p.Id).ToArray();
                if (ids.Length == 0) continue;
                string? stage = slot == Slots.FirstStageTank || slot == Slots.FirstStageEngineCount ? "first"
                    : slot == Slots.UpperStageTank || slot == Slots.UpperStageEngineCount ? "upper" : null;
                votes.Add(new ContractVote(category, ids, slot: slot, stage: stage));
            }
            return votes.ToArray();
        }

        /// <summary>A fresh catalog per test (ContractVote option lists are owned by the catalog that checks them).</summary>
        private static GameCatalog Catalog()
        {
            var parts = Parts();
            var contracts = new[]
            {
                new ContractDef("C1", "LEO satellite", 1000, 9400, budgetM: 150, scheduleDays: 120, votes: Votes(parts),
                    launchWindowIntervalDays: 30),
                new ContractDef("C7", "Mars lander", 1000, 9400, budgetM: 500, scheduleDays: 50, votes: Votes(parts),
                    launchWindowIntervalDays: 780),
            };
            return new GameCatalog(parts, contracts);
        }

        private static BudgetSchedule Budget(BuildState b) => BudgetScheduleModel.Compute(new Vehicle(b, Catalog()));

        /// <summary>
        /// The schedule reference build: launch site (lead 5, integ 2), instrument (40, 4), upper engine (25, 2),
        /// first engine (30, 2). Cost 10 + 3 + 3 + 1.2 = 17.2 $M. max(lead) 40, Σ integ 10.
        /// </summary>
        private static BuildState ScheduleBuild(string contract = "C1") =>
            BuildState.New(contract, 42)
                .WithChoice(Slots.LaunchSite, "site_coast")
                .WithChoice(Slots.PayloadInstrument, "inst_imager")
                .WithChoice(Slots.UpperStageEngine, "eng_up_vac")
                .WithChoice(Slots.FirstStageEngine, "eng_first");

        /// <summary>
        /// The propulsion reference build: 9 × first engine, tank_m on both stages, 2 × upper engine, Al-Li.
        /// </summary>
        private static BuildState PropulsionBuild(string material = "mat_alli") =>
            BuildState.New("C1", 7)
                .WithChoice(Slots.LaunchSite, "site_coast")
                .WithChoice(Slots.UpperStageEngine, "eng_up_vac")
                .WithChoice(Slots.UpperStageEngineCount, "cnt_2")
                .WithChoice(Slots.UpperStageTank, "tank_m")
                .WithChoice(Slots.FirstStageEngine, "eng_first")
                .WithChoice(Slots.FirstStageEngineCount, "cnt_9")
                .WithChoice(Slots.FirstStageTank, "tank_m")
                .WithChoice(Slots.StructuralMaterial, material);

        // ------------------------------------------------------------------ 1. cost

        [Fact]
        public void Empty_build_costs_nothing_and_keeps_the_whole_budget()
        {
            var r = Budget(BuildState.New("C1", 1));

            Assert.Equal(0.0, r.TotalCostM);
            Assert.Equal(150.0, r.BudgetM);
            Assert.Equal(150.0, r.RemainingM);
            Assert.Equal(0.0, r.TotalDays);
            // deadline 120 - 0 days used = 120 days of slack
            Assert.Equal(120.0, r.SlackDays);
            Assert.Empty(r.Timeline);
            Assert.Empty(r.CriticalPath);
            Assert.Equal(0, r.Slips);
        }

        [Fact]
        public void Tank_cost_falls_back_to_two_hundredths_of_a_million_per_tonne_of_stage_capacity()
        {
            var c = Catalog();
            // tank_m has no cost: first stage 280 t * 0.02 $M/t = 5.6 $M; upper stage 60 t * 0.02 $M/t = 1.2 $M
            Assert.Equal(5.6, BudgetScheduleModel.TankCostM(c.Part("tank_m"), true), Precision);
            Assert.Equal(1.2, BudgetScheduleModel.TankCostM(c.Part("tank_m"), false), Precision);
            // tank_priced costs 5 $M in data, whatever the stage
            Assert.Equal(5.0, BudgetScheduleModel.TankCostM(c.Part("tank_priced"), true), Precision);
            Assert.Equal(5.0, BudgetScheduleModel.TankCostM(c.Part("tank_priced"), false), Precision);
        }

        [Fact]
        public void Part_cost_multiplies_engines_by_count_and_tanks_by_material_cost_multiplier()
        {
            var c = Catalog();
            var v = new Vehicle(PropulsionBuild(), c);

            // first stage: 1.2 $M * 9 engines = 10.8 $M
            Assert.Equal(10.8, BudgetScheduleModel.PartCostM(v, Slots.FirstStageEngine, c.Part("eng_first")), Precision);
            // upper stage: 3 $M * 2 engines = 6 $M
            Assert.Equal(6.0, BudgetScheduleModel.PartCostM(v, Slots.UpperStageEngine, c.Part("eng_up_vac")), Precision);
            // first stage tank: 280 t * 0.02 = 5.6 $M, * 1.4 (Al-Li) = 7.84 $M
            Assert.Equal(7.84, BudgetScheduleModel.PartCostM(v, Slots.FirstStageTank, c.Part("tank_m")), Precision);
            // upper stage tank: 60 t * 0.02 = 1.2 $M, * 1.4 (Al-Li) = 1.68 $M
            Assert.Equal(1.68, BudgetScheduleModel.PartCostM(v, Slots.UpperStageTank, c.Part("tank_m")), Precision);
            // any other slot: the part's own cost (material 2 $M; count options 0 $M)
            Assert.Equal(2.0, BudgetScheduleModel.PartCostM(v, Slots.StructuralMaterial, c.Part("mat_alli")), Precision);
            Assert.Equal(0.0, BudgetScheduleModel.PartCostM(v, Slots.FirstStageEngineCount, c.Part("cnt_9")), Precision);
        }

        [Fact]
        public void Total_cost_sums_all_parts_including_the_launch_site_fee()
        {
            var r = Budget(PropulsionBuild());

            // site 10 + upper engines 3*2=6 + upper tank 1.68 + first engines 1.2*9=10.8 + first tank 7.84 + Al-Li 2
            //   = 10 + 6 + 1.68 + 10.8 + 7.84 + 2 = 38.32 $M (engine-count options cost 0)
            Assert.Equal(38.32, r.PartsCostM, Precision);
            Assert.Equal(0.0, r.LedgerCostM);
            Assert.Equal(0.0, r.AssuranceCostM);
            Assert.Equal(38.32, r.TotalCostM, Precision);
            // 150 - 38.32 = 111.68 $M left
            Assert.Equal(111.68, r.RemainingM, Precision);

            // one cost line per chosen slot, in vote order, keyed by part id with the slot as category
            var lines = r.CostLines.Select(l => (l.Id, l.Category)).ToArray();
            Assert.Equal(new[]
            {
                ("site_coast", (string?)Slots.LaunchSite),
                ("eng_up_vac", Slots.UpperStageEngine),
                ("cnt_2", Slots.UpperStageEngineCount),
                ("tank_m", Slots.UpperStageTank),
                ("eng_first", Slots.FirstStageEngine),
                ("cnt_9", Slots.FirstStageEngineCount),
                ("tank_m", Slots.FirstStageTank),
                ("mat_alli", Slots.StructuralMaterial),
            }, lines);
            // Σ cost lines = 38.32 $M
            Assert.Equal(38.32, r.CostLines.Sum(l => l.CostM), Precision);
        }

        [Fact]
        public void Cheaper_material_lowers_tank_cost_only()
        {
            var r = Budget(PropulsionBuild("mat_steel"));

            // tanks (5.6 + 1.2) * 0.6 = 4.08 $M; steel itself 1 $M
            // 10 + 6 + 10.8 + 4.08 + 1 = 31.88 $M
            Assert.Equal(31.88, r.PartsCostM, Precision);
        }

        [Fact]
        public void Ledger_costs_and_budget_changes_are_added_to_the_budget()
        {
            var b = ScheduleBuild()
                .WithLedger(new LedgerEntry(LedgerKind.Test, "test_hot_fire", 2.0, 5, category: Slots.FirstStageEngine))
                .WithLedger(new LedgerEntry(LedgerKind.Anomaly, "anom_leak/patch", 1.5, 3))
                .WithLedger(new LedgerEntry(LedgerKind.Budget, "anom_budget_cut", 0, 0, budgetDeltaM: -20))
                .WithLedger(new LedgerEntry(LedgerKind.Anomaly, "anom_refund", -0.5, 0));
            var r = Budget(b);

            // parts: 10 + 3 + 3 + 1.2 = 17.2 $M
            Assert.Equal(17.2, r.PartsCostM, Precision);
            // ledger: 2 + 1.5 + 0 - 0.5 = 3 $M
            Assert.Equal(3.0, r.LedgerCostM, Precision);
            // 17.2 + 3 = 20.2 $M
            Assert.Equal(20.2, r.TotalCostM, Precision);
            // budget 150 - 20 (cut) = 130 $M; remaining 130 - 20.2 = 109.8 $M
            Assert.Equal(130.0, r.BudgetM, Precision);
            Assert.Equal(109.8, r.RemainingM, Precision);
            // ledger lines with a cost get a cost line (the zero-cost budget cut does not)
            var ledgerIds = r.CostLines.Skip(4).Select(l => l.Id).ToArray();
            Assert.Equal(new[] { "test_hot_fire", "anom_leak/patch", "anom_refund" }, ledgerIds);
        }

        [Fact]
        public void Over_budget_build_has_negative_remaining_budget()
        {
            var b = ScheduleBuild().WithLedger(new LedgerEntry(LedgerKind.Anomaly, "anom_failure/rebuild", 140, 0));
            var r = Budget(b);

            // 17.2 + 140 = 157.2 $M against 150 $M -> -7.2 $M
            Assert.Equal(-7.2, r.RemainingM, Precision);
        }

        [Fact]
        public void Solid_strap_on_boosters_cost_per_booster_times_count()
        {
            var b = PropulsionBuild("mat_al").WithChoice(Slots.StrapOnBoosters, "boost_solid2");
            var v = new Vehicle(b, Catalog());
            var r = BudgetScheduleModel.Compute(v);

            // 6 $M each * 2 boosters = 12 $M
            Assert.Equal(12.0, BudgetScheduleModel.PartCostM(v, Slots.StrapOnBoosters, v.Boosters!), Precision);
            // 10 + 6 + 1.2 + 10.8 + 5.6 + 0 (Al) + 12 = 45.6 $M
            Assert.Equal(45.6, r.PartsCostM, Precision);
        }

        [Fact]
        public void No_boosters_option_costs_nothing()
        {
            var b = PropulsionBuild("mat_al");
            var withNone = Budget(b.WithChoice(Slots.StrapOnBoosters, "boost_none"));

            // 10 + 6 + 1.2 + 10.8 + 5.6 = 33.6 $M with or without the "None" option
            Assert.Equal(33.6, Budget(b).TotalCostM, Precision);
            Assert.Equal(33.6, withNone.TotalCostM, Precision);
        }

        [Fact]
        public void Liquid_side_boosters_cost_first_stage_cost_times_multiplier()
        {
            var b = PropulsionBuild().WithChoice(Slots.StrapOnBoosters, "boost_liquid2");
            var v = new Vehicle(b, Catalog());
            var r = BudgetScheduleModel.Compute(v);

            // first stage = engines 1.2*9 = 10.8 + tank 5.6*1.4 = 7.84 -> 18.64 $M
            // boosters = 18.64 * cost_first_stage_mult 2 + 0 $M * 2 = 37.28 $M
            Assert.Equal(37.28, BudgetScheduleModel.PartCostM(v, Slots.StrapOnBoosters, v.Boosters!), Precision);
            // 38.32 + 37.28 = 75.6 $M
            Assert.Equal(75.6, r.PartsCostM, Precision);
            // their +15 integration days drawback is on the serial chain:
            // integ = site 2 + up eng 2 + up tank 3 + first eng 2 + cnt_9 8 + first tank 3 + Al-Li 4 + boosters 15 = 39
            Assert.Equal(39.0, r.IntegrationDays, Precision);
        }

        [Fact]
        public void Liquid_side_boosters_without_multiplier_cost_one_first_stage_each_plus_option_cost()
        {
            var b = PropulsionBuild("mat_al").WithChoice(Slots.StrapOnBoosters, "boost_liquid3");
            var v = new Vehicle(b, Catalog());

            // first stage = 10.8 + 5.6 * 1.0 = 16.4 $M; no cost_first_stage_mult -> booster count 3
            // 16.4 * 3 + 0.5 $M * 3 = 49.2 + 1.5 = 50.7 $M
            Assert.Equal(50.7, BudgetScheduleModel.PartCostM(v, Slots.StrapOnBoosters, v.Boosters!), Precision);
        }

        [Fact]
        public void Booster_recovery_refund_is_reported_separately_and_not_deducted()
        {
            var b = PropulsionBuild("mat_al").WithChoice(Slots.BoosterRecovery, "rec_rtls");
            var r = Budget(b);

            // refund = 0.6 * (first engines 10.8 + first tank 5.6) = 0.6 * 16.4 = 9.84 $M
            Assert.Equal(9.84, r.RecoveryRefundM, Precision);
            // cost unchanged: 33.6 $M (RTLS option itself costs 0)
            Assert.Equal(33.6, r.TotalCostM, Precision);
        }

        [Fact]
        public void Booster_recovery_refund_covers_liquid_side_boosters_and_drawback_cost_is_charged()
        {
            var b = PropulsionBuild("mat_al")
                .WithChoice(Slots.StrapOnBoosters, "boost_liquid2")
                .WithChoice(Slots.BoosterRecovery, "rec_drone");
            var r = Budget(b);

            // hardware = core 16.4 + side boosters 16.4 * 2 = 32.8 -> 49.2 $M; refund 0.55 * 49.2 = 27.06 $M
            Assert.Equal(27.06, r.RecoveryRefundM, Precision);
            // drone-ship option: 0 $M + extra_cost_M 1 $M (ship cost) = 1 $M cost line
            Assert.Equal(1.0, r.CostLines.Single(l => l.Category == Slots.BoosterRecovery).CostM, Precision);
            // 33.6 + 32.8 + 1 = 67.4 $M
            Assert.Equal(67.4, r.TotalCostM, Precision);
        }

        [Fact]
        public void Solid_boosters_are_not_part_of_the_recovery_refund()
        {
            var b = PropulsionBuild("mat_al")
                .WithChoice(Slots.StrapOnBoosters, "boost_solid2")
                .WithChoice(Slots.BoosterRecovery, "rec_rtls");

            // only the core is recovered: 0.6 * 16.4 = 9.84 $M (the 12 $M solids are expendable)
            Assert.Equal(9.84, Budget(b).RecoveryRefundM, Precision);
        }

        // ------------------------------------------------------------------ 2. schedule

        [Fact]
        public void Schedule_is_longest_lead_plus_serial_integration_tests_and_other_days()
        {
            var b = ScheduleBuild()
                .WithLedger(new LedgerEntry(LedgerKind.Test, "test_hot_fire", 2.0, 5, category: Slots.FirstStageEngine))
                .WithLedger(new LedgerEntry(LedgerKind.Anomaly, "anom_leak/patch", 1.5, 3));
            var r = Budget(b);

            // max(5, 40, 25, 30) = 40 days
            Assert.Equal(40.0, r.MaxLeadDays, Precision);
            // 2 + 4 + 2 + 2 = 10 days
            Assert.Equal(10.0, r.IntegrationDays, Precision);
            Assert.Equal(5.0, r.TestDays, Precision);
            Assert.Equal(3.0, r.OtherDays, Precision);
            Assert.Equal(0.0, r.AssuranceDays, Precision);
            // max(5, 40, 25, 30) + (2 + 4 + 2 + 2) + 5 + 3 = 58 days
            Assert.Equal(58.0, r.TotalDays, Precision);
            // deadline 120 - 58 = 62 days of slack, no slip
            Assert.Equal(62.0, r.SlackDays, Precision);
            Assert.Equal(0, r.Slips);
            Assert.Equal(0.0, r.SlipDays);
            Assert.False(r.SlipIsMissionEnding);
        }

        [Fact]
        public void Extra_lead_days_only_matter_when_the_part_becomes_the_longest_lead()
        {
            // Supplier delay +8 days on the first engine: 30 + 8 = 38 < 40 -> no change, 40 + 10 = 50 days
            var small = Budget(ScheduleBuild().WithLedger(
                new LedgerEntry(LedgerKind.Anomaly, "anom_supplier_delay", 0, 0, category: Slots.FirstStageEngine, leadDays: 8)));
            Assert.Equal(50.0, small.TotalDays, Precision);
            Assert.Equal("inst_imager", small.CriticalPath[0].Id);
            // the delayed first engine now has 40 - 38 = 2 days of slack
            Assert.Equal(2.0, small.Timeline.Single(s => s.Kind == StepKind.Procure && s.Id == "eng_first").SlackDays, Precision);

            // +15 days: 30 + 15 = 45 > 40 -> max lead 45, total 45 + 10 = 55 days; first engine is now critical
            var big = Budget(ScheduleBuild().WithLedger(
                new LedgerEntry(LedgerKind.Anomaly, "anom_supplier_delay", 0, 0, category: Slots.FirstStageEngine, leadDays: 15)));
            Assert.Equal(45.0, big.MaxLeadDays, Precision);
            Assert.Equal(55.0, big.TotalDays, Precision);
            Assert.Equal("eng_first", big.CriticalPath[0].Id);
            Assert.Equal(StepKind.Procure, big.CriticalPath[0].Kind);
            // the instrument now has 45 - 40 = 5 days of slack
            Assert.Equal(5.0, big.Timeline.Single(s => s.Kind == StepKind.Procure && s.Id == "inst_imager").SlackDays, Precision);
        }

        [Fact]
        public void Extra_lead_days_ledger_entry_for_an_undecided_slot_changes_nothing()
        {
            var r = Budget(ScheduleBuild().WithLedger(
                new LedgerEntry(LedgerKind.Anomaly, "anom_supplier_delay", 0, 0, category: Slots.Avionics, leadDays: 100)));

            // avionics not chosen: 40 + 10 = 50 days
            Assert.Equal(50.0, r.TotalDays, Precision);
        }

        [Fact]
        public void Negative_integration_days_of_a_material_shorten_the_serial_chain()
        {
            var r = Budget(PropulsionBuild("mat_steel"));

            // lead: site 5, up eng 25, tanks 10, first eng 30 -> max 30
            // integ: site 2 + up eng 2 + up tank 3 + first eng 2 + cnt_9 8 + first tank 3 + steel -5 = 15
            // 30 + 15 = 45 days
            Assert.Equal(30.0, r.MaxLeadDays, Precision);
            Assert.Equal(15.0, r.IntegrationDays, Precision);
            Assert.Equal(45.0, r.TotalDays, Precision);
            var steel = r.Timeline.Single(s => s.Id == "mat_steel");
            Assert.Equal(StepKind.Integrate, steel.Kind);
            Assert.Equal(-5.0, steel.DurationDays, Precision);
        }

        // ------------------------------------------------------------------ 3. critical path

        [Fact]
        public void Timeline_lists_procurement_with_slack_then_the_serial_chain_in_order()
        {
            var b = ScheduleBuild()
                .WithLedger(new LedgerEntry(LedgerKind.Test, "test_hot_fire", 2.0, 5, category: Slots.FirstStageEngine))
                .WithLedger(new LedgerEntry(LedgerKind.Anomaly, "anom_leak/patch", 1.5, 3));
            var r = Budget(b);

            var expected = new[]
            {
                // id, kind, start, duration, critical, slack
                // procurement runs in parallel from day 0; slack = maxLead 40 - lead
                ("site_coast", StepKind.Procure, 0.0, 5.0, false, 35.0),     // 40 - 5
                ("inst_imager", StepKind.Procure, 0.0, 40.0, true, 0.0),     // longest lead
                ("eng_up_vac", StepKind.Procure, 0.0, 25.0, false, 15.0),    // 40 - 25
                ("eng_first", StepKind.Procure, 0.0, 30.0, false, 10.0),     // 40 - 30
                // serial chain starts at day 40, in vote order, then the ledger in order
                ("site_coast", StepKind.Integrate, 40.0, 2.0, true, 0.0),    // 40 -> 42
                ("inst_imager", StepKind.Integrate, 42.0, 4.0, true, 0.0),   // 42 -> 46
                ("eng_up_vac", StepKind.Integrate, 46.0, 2.0, true, 0.0),    // 46 -> 48
                ("eng_first", StepKind.Integrate, 48.0, 2.0, true, 0.0),     // 48 -> 50
                ("test_hot_fire", StepKind.Test, 50.0, 5.0, true, 0.0),      // 50 -> 55
                ("anom_leak/patch", StepKind.Anomaly, 55.0, 3.0, true, 0.0), // 55 -> 58
            };
            Assert.Equal(expected.Length, r.Timeline.Count);
            for (int i = 0; i < expected.Length; i++)
            {
                var (id, kind, start, duration, critical, slack) = expected[i];
                var s = r.Timeline[i];
                Assert.Equal(id, s.Id);
                Assert.Equal(kind, s.Kind);
                Assert.Equal(start, s.StartDay, Precision);
                Assert.Equal(duration, s.DurationDays, Precision);
                Assert.Equal(critical, s.Critical);
                Assert.Equal(slack, s.SlackDays, Precision);
            }

            // Critical path = longest-lead procurement + every serial step, in order; it ends on launch day (58).
            Assert.Equal(new[] { "inst_imager", "site_coast", "inst_imager", "eng_up_vac", "eng_first", "test_hot_fire", "anom_leak/patch" },
                r.CriticalPath.Select(s => s.Id).ToArray());
            Assert.All(r.CriticalPath, s => Assert.True(s.Critical));
            Assert.Equal(r.TotalDays, r.CriticalPath[r.CriticalPath.Count - 1].EndDay, Precision);
            // the timeline step categories are the vote slots
            Assert.Equal(Slots.PayloadInstrument, r.CriticalPath[0].Category);
        }

        [Fact]
        public void Equal_longest_leads_are_broken_by_vote_order_not_choice_order()
        {
            // eng_up_tie (upper_stage_engine, lead 40) is chosen before the instrument (lead 40),
            // but the instrument comes first in the 6.2 vote order, so it is the critical procurement step.
            var b = BuildState.New("C1", 3)
                .WithChoice(Slots.UpperStageEngine, "eng_up_tie")
                .WithChoice(Slots.PayloadInstrument, "inst_imager");
            var r = Budget(b);

            var procure = r.Timeline.Where(s => s.Kind == StepKind.Procure).ToArray();
            Assert.Equal(new[] { "inst_imager", "eng_up_tie" }, procure.Select(s => s.Id).ToArray());
            Assert.True(procure[0].Critical);
            Assert.False(procure[1].Critical);
            // both have slack 40 - 40 = 0, but only one procurement step is on the critical path
            Assert.Equal(0.0, procure[1].SlackDays, Precision);
            Assert.Single(r.CriticalPath, s => s.Kind == StepKind.Procure);
            // 40 + (4 + 2) = 46 days
            Assert.Equal(46.0, r.TotalDays, Precision);
        }

        [Fact]
        public void Zero_lead_and_zero_integration_parts_do_not_appear_on_the_timeline()
        {
            var r = Budget(PropulsionBuild("mat_al"));

            // cnt_2 (lead 0, integ 0) and mat_al (lead 0, integ 0) have no bars; cnt_9 (lead 0, integ 8) only integrates
            Assert.DoesNotContain(r.Timeline, s => s.Id == "cnt_2");
            Assert.DoesNotContain(r.Timeline, s => s.Id == "mat_al");
            Assert.Equal(new[] { StepKind.Integrate }, r.Timeline.Where(s => s.Id == "cnt_9").Select(s => s.Kind).ToArray());
            // tank_m fills two slots, so it is procured and integrated twice (once per stage)
            Assert.Equal(2, r.Timeline.Count(s => s.Id == "tank_m" && s.Kind == StepKind.Procure));
            Assert.Equal(2, r.Timeline.Count(s => s.Id == "tank_m" && s.Kind == StepKind.Integrate));
        }

        // ------------------------------------------------------------------ 4. deadline slip

        [Theory]
        // reference build is 40 + 10 = 50 days; extra serial days push it past the 120-day deadline
        [InlineData(70, 0, 0.0)]    // 50 + 70 = 120 = deadline: on time
        [InlineData(71, 1, 30.0)]   // overrun 1 -> ceil(1 / 30) = 1 slip, 30 days
        [InlineData(100, 1, 30.0)]  // overrun 30 -> ceil(30 / 30) = 1 slip (boundary)
        [InlineData(101, 2, 60.0)]  // overrun 31 -> ceil(31 / 30) = 2 slips, 60 days
        [InlineData(131, 3, 90.0)]  // overrun 61 -> ceil(61 / 30) = 3 slips, 90 days
        public void Missing_the_deadline_slips_to_the_next_launch_window(double extraDays, int slips, double slipDays)
        {
            var r = Budget(ScheduleBuild().WithLedger(new LedgerEntry(LedgerKind.Rework, "pdr_rework", 0, extraDays)));

            Assert.Equal(50 + extraDays, r.TotalDays, Precision);
            Assert.Equal(slips, r.Slips);
            Assert.Equal(slipDays, r.SlipDays, Precision);
            Assert.False(r.SlipIsMissionEnding);
            // slack = 120 - (50 + extra)
            Assert.Equal(120 - (50 + extraDays), r.SlackDays, Precision);
        }

        [Fact]
        public void A_missed_Mars_window_is_mission_ending()
        {
            // C7: deadline 50 days, window every 780 days. 50 + 1 rework day = 51 -> overrun 1 -> 1 slip of 780 days
            var r = Budget(ScheduleBuild("C7").WithLedger(new LedgerEntry(LedgerKind.Rework, "pdr_rework", 0, 1)));

            Assert.Equal(1, r.Slips);
            Assert.Equal(780.0, r.SlipDays, Precision);
            Assert.True(r.SlipIsMissionEnding);

            // exactly on the 50-day deadline: no slip, not mission ending
            var onTime = Budget(ScheduleBuild("C7"));
            Assert.Equal(0, onTime.Slips);
            Assert.Equal(0.0, onTime.SlipDays);
            Assert.False(onTime.SlipIsMissionEnding);
        }

        // ------------------------------------------------------------------ 5. mission assurance (7.20)

        /// <summary>
        /// Site (10 $M, lead 5, integ 2) + instrument (3 $M, lead 40, integ 4) + test (2 $M, 5 days):
        /// cost 13 + 2 = 15 $M, days max(5, 40) + (2 + 4) + 5 = 51.
        /// </summary>
        private static BuildState AssuranceBuild(string level, string contract = "C1") =>
            BuildState.New(contract, 9)
                .WithChoice(Slots.LaunchSite, "site_coast")
                .WithChoice(Slots.PayloadInstrument, "inst_imager")
                .WithLedger(new LedgerEntry(LedgerKind.Test, "test_vibration", 2.0, 5, category: Slots.PayloadInstrument))
                .WithChoice(Slots.MissionAssurance, level);

        [Fact]
        public void Standard_assurance_changes_nothing()
        {
            var r = Budget(AssuranceBuild("ma_standard"));

            Assert.Equal(0.0, r.AssuranceCostM);
            Assert.Equal(0.0, r.AssuranceDays);
            Assert.Equal(15.0, r.TotalCostM, Precision);
            Assert.Equal(51.0, r.TotalDays, Precision);
            Assert.DoesNotContain(r.CostLines, l => l.Id == Slots.MissionAssurance);
        }

        [Fact]
        public void Faster_cheaper_cuts_total_cost_15_percent_and_days_10_percent()
        {
            var r = Budget(AssuranceBuild("ma_fast"));

            // cost: (13 parts + 2 ledger) * -0.15 = -2.25 $M; total 15 - 2.25 = 12.75 $M
            Assert.Equal(13.0, r.PartsCostM, Precision);
            Assert.Equal(2.0, r.LedgerCostM, Precision);
            Assert.Equal(-2.25, r.AssuranceCostM, Precision);
            Assert.Equal(12.75, r.TotalCostM, Precision);
            Assert.Equal(r.PartsCostM + r.LedgerCostM + r.AssuranceCostM, r.TotalCostM, Precision);
            Assert.Equal(-2.25, r.CostLines.Single(l => l.Id == Slots.MissionAssurance).CostM, Precision);
            Assert.Equal(12.75, r.CostLines.Sum(l => l.CostM), Precision);

            // days: unscaled parts stay 40 / 6 / 5; assurance = 51 * -0.10 = -5.1; total 51 * 0.9 = 45.9
            Assert.Equal(40.0, r.MaxLeadDays, Precision);
            Assert.Equal(6.0, r.IntegrationDays, Precision);
            Assert.Equal(5.0, r.TestDays, Precision);
            Assert.Equal(-5.1, r.AssuranceDays, Precision);
            Assert.Equal(45.9, r.TotalDays, Precision);
            Assert.Equal(r.MaxLeadDays + r.IntegrationDays + r.TestDays + r.OtherDays + r.AssuranceDays, r.TotalDays, Precision);

            // the bars are drawn scaled: instrument lead 40 * 0.9 = 36, test starts at 36 + 2*0.9 + 4*0.9 = 41.4
            Assert.Equal(36.0, r.CriticalPath[0].DurationDays, Precision);
            var test = r.Timeline.Single(s => s.Kind == StepKind.Test);
            Assert.Equal(41.4, test.StartDay, Precision);
            Assert.Equal(4.5, test.DurationDays, Precision);
            Assert.Equal(r.TotalDays, test.EndDay, Precision);
        }

        [Fact]
        public void Class_A_adds_20_percent_cost_and_15_percent_days()
        {
            var r = Budget(AssuranceBuild("ma_class_a"));

            // cost: 15 * 0.20 = 3 $M; total 18 $M; remaining 150 - 18 = 132 $M
            Assert.Equal(3.0, r.AssuranceCostM, Precision);
            Assert.Equal(18.0, r.TotalCostM, Precision);
            Assert.Equal(132.0, r.RemainingM, Precision);
            // days: 51 * 0.15 = 7.65; total 51 * 1.15 = 58.65
            Assert.Equal(7.65, r.AssuranceDays, Precision);
            Assert.Equal(58.65, r.TotalDays, Precision);
            Assert.Equal(r.MaxLeadDays + r.IntegrationDays + r.TestDays + r.OtherDays + r.AssuranceDays, r.TotalDays, Precision);
        }

        [Fact]
        public void Class_A_extra_days_can_cause_a_slip()
        {
            // C7 deadline 50 days: Faster-Cheaper 45.9 days is on time;
            // Class A 58.65 days overruns by 8.65 -> ceil(8.65 / 780) = 1 slip, mission ending on Mars.
            var fast = Budget(AssuranceBuild("ma_fast", "C7"));
            Assert.Equal(0, fast.Slips);
            Assert.Equal(50 - 45.9, fast.SlackDays, Precision);

            var classA = Budget(AssuranceBuild("ma_class_a", "C7"));
            Assert.Equal(1, classA.Slips);
            Assert.Equal(780.0, classA.SlipDays, Precision);
            Assert.True(classA.SlipIsMissionEnding);
        }

        // ------------------------------------------------------------------ 6. dashboard wiring and immutability

        [Fact]
        public void Dashboard_budget_matches_the_budget_model()
        {
            var b = PropulsionBuild()
                .WithChoice(Slots.PayloadInstrument, "inst_imager")
                .WithChoice(Slots.MissionAssurance, "ma_class_a")
                .WithLedger(new LedgerEntry(LedgerKind.Test, "test_hot_fire", 2.0, 5, category: Slots.FirstStageEngine));
            var c = Catalog();
            var d = Dashboard.Compute(b, c);
            var direct = BudgetScheduleModel.Compute(new Vehicle(b, c));

            // (38.32 parts + 3 instrument + 2 test) * 1.2 = 43.32 * 1.2 = 51.984 $M
            Assert.Equal(51.984, d.CostM, Precision);
            Assert.Equal(direct.TotalCostM, d.CostM, Precision);
            Assert.Equal(direct.TotalDays, d.ScheduleDays, Precision);
            Assert.Equal(direct.CriticalPath.Select(s => s.Id), d.Budget.CriticalPath.Select(s => s.Id));
        }

        [Fact]
        public void Computing_the_dashboard_and_previews_never_changes_the_build()
        {
            var c = Catalog();
            var b = ScheduleBuild().WithLedger(new LedgerEntry(LedgerKind.Test, "test_hot_fire", 2.0, 5, category: Slots.FirstStageEngine));
            var choicesBefore = b.Choices.OrderBy(kv => kv.Key).ToArray();
            var ledgerBefore = b.Ledger.ToArray();

            var first = Dashboard.Compute(b, c);
            var preview = Preview.Of(b, c, Slots.MissionAssurance, "ma_class_a");
            var replace = Preview.Of(b, c, Slots.PayloadInstrument, "inst_imager");
            var second = Dashboard.Compute(b, c);

            // the build is untouched
            Assert.Equal(choicesBefore, b.Choices.OrderBy(kv => kv.Key).ToArray());
            Assert.Equal(ledgerBefore, b.Ledger.ToArray());
            Assert.False(b.Has(Slots.MissionAssurance));
            // repeated computation gives the same numbers: 17.2 + 2 = 19.2 $M, 40 + 10 + 5 = 55 days
            Assert.Equal(19.2, first.CostM, Precision);
            Assert.Equal(55.0, first.ScheduleDays, Precision);
            Assert.Equal(first.CostM, second.CostM);
            Assert.Equal(first.ScheduleDays, second.ScheduleDays);
            // the preview delta: Class A adds 19.2 * 0.2 = 3.84 $M and 55 * 0.15 = 8.25 days
            Assert.Equal(3.84, preview.Delta.CostM, Precision);
            Assert.Equal(8.25, preview.Delta.ScheduleDays, Precision);
            // re-choosing the same part previews no change
            Assert.Equal(0.0, replace.Delta.CostM, Precision);
            Assert.Equal(0.0, replace.Delta.ScheduleDays, Precision);
        }
    }
}
