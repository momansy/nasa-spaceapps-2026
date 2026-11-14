using System.Collections.Generic;
using MissionForge.Core.Build;
using MissionForge.Core.Data;
using MissionForge.Core.Tests.Data;
using Xunit;

namespace MissionForge.Core.Tests.Build
{
    /// <summary>Data part rules (design 17.5) enforced by the validator: requires_part and incompatible_with_part.</summary>
    public class PartRuleValidationTests
    {
        private static readonly GameCatalog Catalog = DesignFixture.Catalog();

        private static BuildState Rtls(string? aero) =>
            (aero == null ? BuildState.New("C1", 1) : BuildState.New("C1", 1).WithChoice(Slots.AeroControl, aero))
                .WithChoice(Slots.BoosterRecovery, "brec_propulsive_rtls");

        [Fact]
        public void Rtls_without_grid_fins_is_a_blocker()
        {
            // Design 7.18: propulsive landing on land "needs grid fins"; data rule requires_part aero_grid_fins.
            var issues = Validator.Validate(Rtls("aero_fins"), Catalog, ValidationMode.Partial);
            var issue = Assert.Single(issues, i => i.RuleId == ValidationRules.PartRequirement);
            Assert.Equal(Severity.Blocker, issue.Severity);
            Assert.Equal(Catalog.Part("brec_propulsive_rtls").Name + " needs " + Catalog.Part("aero_grid_fins").Name + ".", issue.Text); // names come from data/strings
        }

        [Fact]
        public void Rtls_with_grid_fins_passes_and_undecided_aero_waits_in_partial_mode()
        {
            Assert.DoesNotContain(Validator.Validate(Rtls("aero_grid_fins"), Catalog, ValidationMode.Partial),
                i => i.RuleId == ValidationRules.PartRequirement);
            Assert.DoesNotContain(Validator.Validate(Rtls(null), Catalog, ValidationMode.Partial),
                i => i.RuleId == ValidationRules.PartRequirement);
            Assert.Contains(Validator.Validate(Rtls(null), Catalog, ValidationMode.Complete),
                i => i.RuleId == ValidationRules.PartRequirement);
        }

        [Fact]
        public void Incompatible_parts_are_a_blocker()
        {
            // A tiny catalog loaded from JSON: avionics option avi_a is incompatible with navigation option nav_n.
            var files = new Dictionary<string, string>
            {
                ["parts/avionics.json"] = "{ \"category\": \"avionics\", \"parts\": [ { \"id\": \"avi_a\", \"category\": \"avionics\", \"name_key\": \"x.a\", \"strengths\": [], \"drawbacks\": [], \"stats\": {}, \"game\": {}, \"value_types\": {}, \"rules\": [ { \"kind\": \"incompatible_with_part\", \"part\": \"nav_n\" } ] } ] }",
                ["parts/navigation_sensor.json"] = "{ \"category\": \"navigation_sensor\", \"parts\": [ { \"id\": \"nav_n\", \"category\": \"navigation_sensor\", \"name_key\": \"x.n\", \"strengths\": [], \"drawbacks\": [], \"stats\": {}, \"game\": {}, \"value_types\": {} } ] }",
                ["contracts.json"] = "{ \"contracts\": [ { \"id\": \"C0\", \"name_key\": \"c.c0\", \"payload\": { \"kind\": \"science_package\", \"description_key\": \"c.p\", \"mass_kg\": 50, \"count\": 1 }, \"delta_v_required_km_s\": 2, \"budget_M\": 10, \"schedule_days\": 30, \"votes\": [ { \"step\": 16, \"id\": \"avionics\", \"category\": \"avionics\", \"name_key\": \"v.a\" }, { \"step\": 17, \"id\": \"navigation_sensor\", \"category\": \"navigation_sensor\", \"name_key\": \"v.n\" } ] } ] }",
            };
            var cat = CatalogLoader.Load(files);
            var b = BuildState.New("C0", 1).WithChoice(Slots.Avionics, "avi_a").WithChoice(Slots.Navigation, "nav_n");
            var issue = Assert.Single(Validator.Validate(b, cat, ValidationMode.Partial), i => i.RuleId == ValidationRules.PartIncompatible);
            Assert.Equal(Severity.Blocker, issue.Severity);
            Assert.DoesNotContain(Validator.Validate(b.WithChoice(Slots.Navigation, "nav_n").WithoutChoice(Slots.Navigation), cat, ValidationMode.Partial),
                i => i.RuleId == ValidationRules.PartIncompatible);
        }
    }
}
