using System.Collections.Generic;
using MissionForge.Core.Build;
using MissionForge.Core.Data;
using MissionForge.Core.Tests.Data;
using Xunit;

namespace MissionForge.Core.Tests.Build
{
    /// <summary>T010 step 7: <c>payload.diameter_m</c> in data feeds <see cref="ContractDef.PayloadDiameterM"/> and rule 6.11 fairing fit.</summary>
    public class FairingFitDataTests
    {
        private static readonly GameCatalog Real = DesignFixture.Catalog();

        [Theory]
        [InlineData("C0", 1.0)]
        [InlineData("C1", 1.2)]
        [InlineData("C2", 2.4)]
        [InlineData("C5", 3.7)]
        [InlineData("C7", 4.5)]
        [InlineData("C8", 4.6)]
        public void Loader_reads_the_payload_diameter_of_the_fairing_contracts(string id, double diameterM) =>
            Assert.Equal(diameterM, Real.Contract(id).PayloadDiameterM);

        [Theory]
        [InlineData("C3")]
        [InlineData("C4")]
        [InlineData("C6")]
        public void Capsule_contracts_have_no_fairing_and_no_diameter(string id)
        {
            Assert.Null(Real.Contract(id).PayloadDiameterM);
            Assert.Null(Real.Contract(id).VoteFor(Slots.Fairing));
        }

        [Theory]
        [InlineData("C2", "fairing_small", true)]      // 2.4 m > 1.5 m
        [InlineData("C2", "fairing_standard", false)]  // 2.4 m <= 4.0 m
        [InlineData("C5", "fairing_small", true)]
        [InlineData("C5", "fairing_standard", false)]  // 3.7 m <= 4.0 m
        [InlineData("C7", "fairing_standard", true)]   // 4.5 m > 4.0 m
        [InlineData("C7", "fairing_large", false)]     // 4.5 m <= 5.4 m
        [InlineData("C8", "fairing_standard", true)]   // 4.6 m > 4.0 m
        [InlineData("C8", "fairing_reusable_large", false)]
        [InlineData("C1", "fairing_small", false)]
        [InlineData("C0", "fairing_small", false)]
        public void Real_data_fairing_fit_rule_fires_when_the_payload_is_wider_than_the_fairing(string contract, string fairing, bool fires)
        {
            var build = BuildState.New(contract, 1).WithChoice(Slots.Fairing, fairing);
            var issues = Validator.Validate(build, Real, ValidationMode.Partial);
            if (fires)
            {
                var issue = Assert.Single(issues, i => i.RuleId == ValidationRules.FairingFit);
                Assert.Equal(Severity.Blocker, issue.Severity);
                Assert.Equal(Real.Part(fairing).Stats.DiameterM!.Value.ToString("0.0", System.Globalization.CultureInfo.InvariantCulture), issue.Args["fairing_m"]);
            }
            else Assert.DoesNotContain(issues, i => i.RuleId == ValidationRules.FairingFit);
        }

        [Fact]
        public void Every_fairing_contract_has_at_least_one_fairing_it_fits()
        {
            foreach (var id in new[] { "C0", "C1", "C2", "C5", "C7", "C8" })
            {
                var c = Real.Contract(id);
                var fitting = 0;
                foreach (var opt in c.VoteFor(Slots.Fairing)!.OptionIds)
                    if (Real.Part(opt).Stats.DiameterM!.Value >= c.PayloadDiameterM!.Value) fitting++;
                Assert.True(fitting > 0, id);
            }
        }

        [Fact]
        public void Loader_ignores_the_field_when_absent_and_reads_it_from_json()
        {
            var files = DesignFixture.Files();
            var withField = CatalogLoader.Load(files);
            Assert.Equal(1.2, withField.Contract("C1").PayloadDiameterM);
            files["contracts.json"] = files["contracts.json"].Replace("\"diameter_m\": 1.2,", "");
            Assert.Null(CatalogLoader.Load(files).Contract("C1").PayloadDiameterM);
        }
    }
}
