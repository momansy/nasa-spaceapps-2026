using System.Collections.Generic;
using System.Linq;
using MissionForge.Core.Data;
using Xunit;

namespace MissionForge.Core.Tests.Data
{
    public class CatalogLoaderTests
    {
        [Fact]
        public void Real_data_loads_leniently_and_converts_units_to_SI()
        {
            // Only some part files exist on main yet, so the C1 options for missing categories become warnings.
            var catalog = CatalogLoader.Load(DesignFixture.RealFiles(), lenient: true);
            var e = catalog.Part("eng_kerolox_workhorse");

            Assert.Equal(PartCategories.FirstStageEngine, e.Category);
            Assert.Equal(850_000.0, e.Stats.ThrustSlN);   // 850 kN × 1000
            Assert.Equal(930_000.0, e.Stats.ThrustVacN);  // 930 kN × 1000
            Assert.Equal(282.0, e.Stats.IspSlS);
            Assert.Equal(311.0, e.Stats.IspVacS);
            Assert.Equal(470.0, e.MassKg, 9);             // 0.47 t × 1000
            Assert.Equal(1.2, e.CostM);
            Assert.Equal(30.0, e.LeadDays);
            Assert.Equal(2.0, e.IntegDays);
            Assert.Equal(0.985, e.Reliability);
            Assert.Equal(Maturity.Proven, e.Maturity);
            Assert.Equal(Propellants.Kerolox, e.Propellant);
            Assert.True(e.HasTag("reduced_reuse_life"));  // a data flag rule becomes a tag

            var site = catalog.Part("site_west_coast_polar_range");
            Assert.Equal(34.7, site.Stats.LatitudeDeg);
            Assert.Equal(9.0, site.CostM);
            Assert.Equal(2.0, site.AnomalyWeights["weather_front"]); // anomaly_weight without weight_mult → default ×2

            var c1 = catalog.Contract("C1");
            Assert.Equal(150.0, c1.PayloadMassKg);         // 150 kg × 1 satellite
            Assert.Equal(9700.0, c1.DvRequiredMps, 9);     // 9.7 km/s × 1000
            Assert.Equal(90.0, c1.BudgetM);
            Assert.Equal(180.0, c1.ScheduleDays);
            Assert.Equal(97.6, c1.InclinationDeg);
            Assert.False(c1.Crewed);
            Assert.True(c1.Science);
            Assert.Empty(catalog.Warnings); // T003 has delivered every part file: a lenient load of the real data has no missing-part warnings
            Assert.True(catalog.Strings.Count > 0);
        }

        [Fact]
        public void Strict_load_of_incomplete_real_data_names_the_missing_part()
        {
            // contracts.json C1 already lists instrument options whose part file does not exist yet on main.
            var files = DesignFixture.RealFiles();
            if (files.ContainsKey("parts/instrument.json")) return; // T003 has delivered it: nothing missing to report
            var ex = Assert.Throws<CatalogException>(() => CatalogLoader.Load(files));
            Assert.Contains("contracts.json: contract '", ex.Message);
            Assert.Contains("unknown part", ex.Message);
        }

        [Fact]
        public void Full_fixture_loads_strictly()
        {
            var catalog = DesignFixture.Catalog();
            Assert.True(catalog.Parts.Count >= 84); // 10 real parts + 74 fixture parts (the categories C1 votes on)
            Assert.Equal(0.05, catalog.StructuralRatios[Propellants.Kerolox]);
            Assert.Equal(0.10, catalog.StructuralRatios[Propellants.Hydrolox]);
        }

        [Fact]
        public void Vote_without_options_offers_the_category_parts_for_the_contract_and_stage()
        {
            var c1 = DesignFixture.Catalog().Contract("C1");

            // first_stage_engine_count lists no options in contracts.json: only the first-stage count parts.
            var counts = c1.VoteFor(Slots.FirstStageEngineCount)!;
            Assert.False(counts.ExplicitOptions);
            Assert.Equal(new[] { "engcount_first_1", "engcount_first_3", "engcount_first_5", "engcount_first_9" }, counts.OptionIds);
            Assert.Equal(new[] { "engcount_upper_1", "engcount_upper_2" }, c1.VoteFor(Slots.UpperStageEngineCount)!.OptionIds);

            // navigation: terrain-relative navigation is only for C7 and C8.
            Assert.DoesNotContain("nav_terrain_relative", c1.VoteFor(Slots.Navigation)!.OptionIds);

            // explicit options are kept in data order
            Assert.True(c1.VoteFor(Slots.FirstStageTank)!.ExplicitOptions);
            Assert.Equal(new[] { "tank_xs", "tank_s", "tank_m" }, c1.VoteFor(Slots.FirstStageTank)!.OptionIds);
        }

        [Fact]
        public void Modifiers_become_the_derived_stats_of_the_build_rules()
        {
            var c = DesignFixture.Catalog();
            Assert.Equal(0.88, c.Part("mat_aluminum_lithium_2195").Stats.DryMassMultiplier);
            Assert.Equal(1.4, c.Part("mat_aluminum_lithium_2195").Stats.CostMultiplier);
            Assert.Equal(-0.003, c.Part("engcount_first_3").Stats.ReliabilityModifier);
            Assert.Equal(3, c.Part("engcount_first_3").Stats.Count);
            Assert.Equal("partial", c.Part("engcount_first_3").Stats.EngineOut);
            Assert.Equal(0.15, c.Part("brec_propulsive_rtls").Stats.DvCostFraction, 12);  // |−15%|
            Assert.Equal(0.60, c.Part("brec_propulsive_rtls").Stats.RefundFraction);
            Assert.Equal(0.015, c.Part("sep_hot_staging").Stats.DvBonusFraction);
            Assert.Equal(-0.15, c.Part("assur_faster_cheaper").Stats.CostFraction);
            Assert.Equal(1.5, c.Part("assur_faster_cheaper").Stats.BandScale);
            Assert.Equal(0.01, c.Part("assur_class_a").Stats.ReliabilityBonus);
            Assert.Equal(2.0, c.Part("eng_hypergolic_storable").Stats.ExtraCostM);
            Assert.Equal(3.0, c.Part("eng_hypergolic_storable").Stats.ExtraIntegDays);
            Assert.Equal(2000.0, c.Part("eng_solid_kick_motor").Stats.PropellantKg);     // 2 t fixed propellant
            Assert.Equal(120_000.0, c.Part("tank_s").Stats.FirstStagePropellantKg);      // 120 t
            Assert.Equal(25_000.0, c.Part("tank_s").Stats.UpperStagePropellantKg);       // 25 t
            Assert.Equal(1_600_000.0, c.Part("strap_2_small_solid").Stats.ThrustSlN);    // 1,600 kN each
            Assert.Equal(49_000.0, c.Part("strap_2_small_solid").MassKg);                // 49 t each
            Assert.Equal(6.0, c.Part("strap_2_small_solid").CostM);                      // $6 M each
            Assert.True(c.Part("strap_2_liquid_side").HasTag("mirror_first_stage"));
            Assert.Equal(3, c.Part("avi_triple_redundant_commercial").Stats.Redundancy);
            Assert.True(c.Part("aero_fins").HasTag("atmospheric_stability_bonus")); // real data flag (the fixture used "fins")
            Assert.Equal("aero_grid_fins", c.Part("brec_propulsive_rtls").Rules.Single(r => r.Kind == "requires_part").Parts[0]);
        }

        [Fact]
        public void Bad_reference_fails_with_a_message_naming_file_and_id()
        {
            var files = DesignFixture.Files();
            files["contracts.json"] = files["contracts.json"].Replace("\"tank_xs\"", "\"tank_xxs\"");
            var ex = Assert.Throws<CatalogException>(() => CatalogLoader.Load(files));
            Assert.Contains("tank_xxs", ex.Message);
            Assert.Contains("contracts.json", ex.Message);
        }

        [Fact]
        public void Part_rule_to_unknown_part_fails_strictly_and_warns_leniently()
        {
            var files = DesignFixture.Files();
            files["parts/booster_recovery.json"] = files["parts/booster_recovery.json"].Replace("\"aero_grid_fins\"", "\"aero_landing_legs\"");
            var ex = Assert.Throws<CatalogException>(() => CatalogLoader.Load(files));
            Assert.Contains("aero_landing_legs", ex.Message);
            var lenient = CatalogLoader.Load(files, lenient: true);
            Assert.Contains(lenient.Warnings, w => w.Contains("aero_landing_legs"));
        }

        [Fact]
        public void Malformed_json_and_mismatched_category_fail_clearly()
        {
            var files = DesignFixture.Files();
            files["parts/rcs.json"] = "{ \"category\": \"rcs\", \"parts\": [ ";
            var ex = Assert.Throws<CatalogException>(() => CatalogLoader.Load(files));
            Assert.Contains("parts/rcs.json", ex.Message);

            files = DesignFixture.Files();
            files["parts/rcs.json"] = files["parts/rcs.json"].Replace("\"category\": \"rcs\"", "\"category\": \"avionics\"");
            ex = Assert.Throws<CatalogException>(() => CatalogLoader.Load(files));
            Assert.Contains("parts/rcs.json", ex.Message);
        }

        [Fact]
        public void Duplicate_part_id_fails()
        {
            var files = DesignFixture.Files();
            files["parts/rcs.json"] = files["parts/rcs.json"].Replace("\"rcs_bipropellant\"", "\"rcs_cold_gas\"");
            var ex = Assert.Throws<CatalogException>(() => CatalogLoader.Load(files));
            Assert.Contains("rcs_cold_gas", ex.Message);
        }

        [Fact]
        public void Tests_anomalies_and_rules_files_load_with_their_effects()
        {
            var files = DesignFixture.Files();
            files["tests.json"] = @"{ ""tests"": [
                { ""id"": ""engine_hot_fire"", ""name_key"": ""test.engine_hot_fire.name"", ""applies_to_key"": ""test.engine_hot_fire.applies_to"",
                  ""applies_to_scope"": ""engine"", ""cost_fraction_of_part"": 0.10, ""days"": 7, ""reveals_key"": ""test.engine_hot_fire.reveals"",
                  ""reveals_failure_modes"": [""combustion_instability""], ""effects"": [ { ""target"": ""reliability"", ""op"": ""add"", ""value"": 0.01, ""scope"": ""this_part"" } ],
                  ""basis_key"": ""test.engine_hot_fire.basis"" },
                { ""id"": ""static_fire"", ""name_key"": ""test.static_fire.name"", ""applies_to_key"": ""test.static_fire.applies_to"",
                  ""applies_to_scope"": ""stage"", ""cost_min_M"": 2, ""cost_max_M"": 8, ""days"": 5, ""reveals_key"": ""test.static_fire.reveals"", ""basis_key"": ""test.static_fire.basis"" },
                { ""id"": ""component_qualification"", ""name_key"": ""test.cq.name"", ""applies_to_key"": ""test.cq.applies_to"",
                  ""applies_to_scope"": ""any_part"", ""cost_fraction_of_part"": 0.05, ""days"": 3, ""reveals_key"": ""test.cq.reveals"",
                  ""effects"": [ { ""target"": ""uncertainty_band"", ""op"": ""mul"", ""value"": 0.5, ""scope"": ""this_part"" } ], ""basis_key"": ""test.cq.basis"" } ],
              ""value_types"": { ""tests"": ""game_value"" } }";
            files["anomalies.json"] = @"{ ""draw"": { ""min_votes_between"": 3, ""max_votes_between"": 5 }, ""anomalies"": [
                { ""id"": ""budget_cut"", ""name_key"": ""anomaly.budget_cut.name"", ""trigger_key"": ""anomaly.budget_cut.trigger"",
                  ""triggers"": [ { ""kind"": ""campaign_mode"" } ],
                  ""effects"": [ { ""target"": ""budget_M"", ""op"": ""add_fraction"", ""value"": -0.10, ""scope"": ""mission"" } ],
                  ""responses"": [ { ""id"": ""cut_test"", ""text_key"": ""anomaly.budget_cut.r1"", ""action"": ""cut_test"" },
                                   { ""id"": ""emergency"", ""text_key"": ""anomaly.budget_cut.r3"", ""action"": ""use_emergency_funding"" } ] },
                { ""id"": ""test_failure"", ""name_key"": ""anomaly.test_failure.name"", ""trigger_key"": ""anomaly.test_failure.trigger"",
                  ""triggers"": [ { ""kind"": ""test_revealed_flaw"" } ],
                  ""responses"": [ { ""id"": ""fix"", ""text_key"": ""anomaly.test_failure.r1"", ""effects"": [ { ""target"": ""cost_M"", ""op"": ""add"", ""value"": 2 }, { ""target"": ""schedule_days"", ""op"": ""add"", ""value"": 5 } ] },
                                   { ""id"": ""swap"", ""text_key"": ""anomaly.test_failure.r3"", ""action"": ""swap_part"" } ] },
                { ""id"": ""weather_front"", ""name_key"": ""anomaly.weather_front.name"", ""trigger_key"": ""anomaly.weather_front.trigger"",
                  ""triggers"": [ { ""kind"": ""part_rule"" } ],
                  ""responses"": [ { ""id"": ""move_earlier"", ""text_key"": ""a.r1"", ""effects"": [ { ""target"": ""cost_M"", ""op"": ""add"", ""value"": 1 } ] },
                                   { ""id"": ""accept_scrub"", ""text_key"": ""a.r2"", ""flags"": [""scrub_risk""] } ] } ],
              ""value_types"": { ""draw"": ""game_value"", ""anomalies"": ""game_value"" } }";
            files["validation_rules.json"] = @"{ ""rules"": [
                { ""id"": ""total_dv"", ""name_key"": ""validation.total_dv.name"", ""severity"": ""blocker"", ""explanation_key"": ""validation.total_dv.explanation"",
                  ""relaxed"": { ""severity"": ""major"", ""margin_fraction"": 0.03 } } ] }";
            // lenient: the real part files name anomaly cards (supplier_delay, range_conflict…) this test file omits
            var c = CatalogLoader.Load(files, lenient: true);

            var hot = c.Test("engine_hot_fire");
            Assert.Equal(TestCostKind.PartFraction, hot.CostKind);
            Assert.Equal(0.10, hot.CostPartFraction);
            Assert.Equal(7.0, hot.Days);
            Assert.Equal(0.01, hot.ReliabilityBonus);
            Assert.Contains("combustion_instability", hot.ClearsRisks);
            var sf = c.Test("static_fire");
            Assert.Equal(TestCostKind.StageScaled, sf.CostKind);
            Assert.Equal((2.0, 8.0), (sf.CostM, sf.CostMaxM));
            Assert.Equal(0.5, c.Test("component_qualification").BandScale);

            Assert.Equal(3, c.AnomalyMinVotesBetween);
            Assert.Equal(5, c.AnomalyMaxVotesBetween);
            var cut = c.Anomaly("budget_cut");
            Assert.Equal(-0.10, cut.OnDraw.BudgetFraction);
            Assert.Equal("campaign", cut.Triggers.Single().Condition);
            Assert.True(cut.Response("emergency")!.Effect.UsesEmergencyFunding);
            var tf = c.Anomaly("test_failure");
            Assert.Equal("flaw_revealed", tf.RequiresCondition);
            Assert.Equal("flawed_part", tf.Target);
            Assert.True(tf.Response("fix")!.Effect.FixesFlaw);
            Assert.Equal(2.0, tf.Response("fix")!.Effect.CostM);
            Assert.Equal(5.0, tf.Response("fix")!.Effect.Days);
            Assert.Equal(EffectDef.ReopenTarget, tf.Response("swap")!.Effect.ReopenCategory);
            Assert.Contains("scrub_risk", c.Anomaly("weather_front").Response("accept_scrub")!.Effect.AddFlags);

            var rule = c.Rule("total_dv")!;
            Assert.Equal(Severity.Blocker, rule.Severity);
            Assert.Equal(0.03, rule.Params["major_margin_fraction"]);
            Assert.Equal("validation.total_dv.explanation", rule.TextKey);
        }

        [Fact]
        public void Duplicate_string_key_across_fragments_fails()
        {
            var files = DesignFixture.Files();
            files["strings/en.extra.json"] = "{ \"part.eng_kerolox_workhorse.name\": \"Again\" }";
            var ex = Assert.Throws<CatalogException>(() => CatalogLoader.Load(files));
            Assert.Contains("part.eng_kerolox_workhorse.name", ex.Message);
        }

        [Fact]
        public void Roles_and_boosts_load()
        {
            var c = DesignFixture.Catalog();
            Assert.True(c.Roles.ContainsKey("FLIGHT"));
            Assert.Equal("decision_time", c.Roles["FLIGHT"].AbilityId);
            var dv = c.Boosts["dv_bonus"];
            Assert.Equal((0.01, 0.02, 0.03), (dv.Bronze, dv.Silver, dv.Gold));
            Assert.Equal(0.08, dv.Cap);
        }
    }
}
