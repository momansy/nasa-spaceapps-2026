using System.Collections.Generic;
using System.Linq;
using MissionForge.Core.Build;
using MissionForge.Core.Data;
using MissionForge.Core.Tests.Data;
using Xunit;

namespace MissionForge.Core.Tests.Build
{
    /// <summary>T010 step 1: the <see cref="ValidationRules"/> constants are the IDs of data/validation_rules.json.</summary>
    public class RuleIdsMatchDataTests
    {
        private static readonly GameCatalog Real = DesignFixture.Catalog();
        private static readonly string[] CodeOnly = { ValidationRules.PartRequirement, ValidationRules.PartIncompatible };

        [Fact]
        public void Every_data_rule_has_a_constant_and_every_design_constant_has_a_data_rule()
        {
            var dataIds = Real.ValidationRules.Keys.OrderBy(x => x).ToList();
            var codeIds = ValidationRules.All.Where(r => !CodeOnly.Contains(r)).OrderBy(x => x).ToList();
            Assert.Equal(dataIds, codeIds);
        }

        [Fact]
        public void Catalog_Rule_finds_every_design_rule_and_its_text_key_exists_in_the_strings()
        {
            foreach (var id in ValidationRules.All.Where(r => !CodeOnly.Contains(r)))
            {
                var def = Real.Rule(id);
                Assert.NotNull(def);
                Assert.Equal(ValidationRules.DefaultTextKey(id), def!.TextKey);
                Assert.Equal("validation_rule." + id + ".explanation", def.TextKey);
                Assert.True(Real.Strings.ContainsKey(def.TextKey), id + ": no string " + def.TextKey);
            }
        }

        [Fact]
        public void Code_only_rules_are_not_in_the_data_yet()
        {
            // Interface change of T010: part_requirement and part_incompatible should become rows of validation_rules.json.
            foreach (var id in CodeOnly) Assert.Null(Real.Rule(id));
        }

        private static (ContractDef contract, PartDef engine) Edge(double thrustKn)
        {
            var engine = ValidationVoteFixtures.Part("eng_edge", PartCategories.FirstStageEngine, 0, 1, 1, 1,
                new Dictionary<string, double> { ["thrust_sl_kN"] = thrustKn, ["isp_sl_s"] = 280, ["isp_vac_s"] = 300 }, Propellants.Kerolox);
            var contract = new ContractDef("C1", "C1", 1000, 9000, 1000, 1000,
                new[] { ValidationVoteFixtures.Vote(Slots.FirstStageEngine, "eng_edge") });
            return (contract, engine);
        }

        [Fact]
        public void Data_severity_and_twr_min_param_are_used()
        {
            // TWR = 1.5 · 9.80665·1000 / (1000 · 9.80665) = 1.5 exactly; data twr_min = 2.0 makes it a Major issue.
            var (contract, engine) = Edge(9.80665 * 1.5);
            var rule = new ValidationRuleDef
            {
                Id = ValidationRules.LiftoffTwr,
                Severity = Severity.Major,
                TextKey = "validation_rule.liftoff_twr_too_low.explanation",
                Text = "data text",
                Params = new Dictionary<string, double> { ["twr_min"] = 2.0 },
            };
            var build = BuildState.New("C1", 1).WithChoice(Slots.FirstStageEngine, "eng_edge");
            var withData = new GameCatalog(new[] { engine }, new[] { contract }, validationRules: new[] { rule });
            var issue = Assert.Single(Validator.Validate(build, withData), i => i.RuleId == ValidationRules.LiftoffTwr);
            Assert.Equal(Severity.Major, issue.Severity);
            Assert.Equal("data text", issue.Text);
            Assert.Equal("validation_rule.liftoff_twr_too_low.explanation", issue.TextKey);

            // No data row: the code default twr_min = 1.0 applies and TWR 1.5 flies.
            var without = new GameCatalog(new[] { engine }, new[] { contract });
            Assert.DoesNotContain(Validator.Validate(build, without), i => i.RuleId == ValidationRules.LiftoffTwr);
        }

        [Fact]
        public void Real_data_gives_the_text_key_and_text_of_the_strings_file()
        {
            var issues = Validator.Validate(BuildState.New("C1", 1), Real);
            var dv = Assert.Single(issues, i => i.RuleId == ValidationRules.TotalDv);
            Assert.Equal("validation_rule.delta_v_below_requirement.explanation", dv.TextKey);
            Assert.Equal(Real.Strings[dv.TextKey], dv.Text);
        }

        [Fact]
        public void Data_text_placeholder_n_is_filled_from_the_code_argument_N()
        {
            var c1 = Real.Contract("C1");
            var b = BuildState.New("C1", 1);
            var issues = Validator.Validate(b, Real);
            var restarts = Assert.Single(issues, i => i.RuleId == ValidationRules.UpperRestarts);
            Assert.DoesNotContain("{", restarts.Text);
            Assert.Contains(c1.RequiredUpperStageStarts.ToString(), restarts.Text);
        }
    }
}
