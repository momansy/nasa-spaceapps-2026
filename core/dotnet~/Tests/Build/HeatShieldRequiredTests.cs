using MissionForge.Core.Build;
using MissionForge.Core.Data;
using MissionForge.Core.Tests.Data;
using Xunit;

namespace MissionForge.Core.Tests.Build
{
    /// <summary>T010 step 2: the returning-payload rule needs <c>Returning &amp;&amp; HeatShieldRequired</c> (C0 returns by parachute).</summary>
    public class HeatShieldRequiredTests
    {
        private static readonly GameCatalog Real = DesignFixture.Catalog();

        [Fact]
        public void Loader_reads_heat_shield_required_from_the_data()
        {
            var c0 = Real.Contract("C0");
            Assert.True(c0.Returning);
            Assert.False(c0.HeatShieldRequired);          // requirements.heat_shield_required = false
            Assert.True(Real.Contract("C3").HeatShieldRequired);
            Assert.True(Real.Contract("C3").Returning);
        }

        [Fact]
        public void C0_empty_build_has_no_heat_shield_blocker_but_C3_has()
        {
            Assert.DoesNotContain(Validator.Validate(BuildState.New("C0", 1), Real),
                i => i.RuleId == ValidationRules.ReturnHeatShield);
            Assert.Contains(Validator.Validate(BuildState.New("C3", 1), Real),
                i => i.RuleId == ValidationRules.ReturnHeatShield);
        }

        [Fact]
        public void Field_absent_defaults_to_payload_returns()
        {
            var returning = new ContractDef("X", "X", 100, 1000, 10, 10, System.Array.Empty<ContractVote>(), returning: true);
            var notReturning = new ContractDef("Y", "Y", 100, 1000, 10, 10, System.Array.Empty<ContractVote>());
            var optedOut = new ContractDef("Z", "Z", 100, 1000, 10, 10, System.Array.Empty<ContractVote>(), returning: true, heatShieldRequired: false);
            Assert.True(returning.HeatShieldRequired);
            Assert.False(notReturning.HeatShieldRequired);
            Assert.False(optedOut.HeatShieldRequired);
        }

        [Fact]
        public void Returning_contract_that_requires_a_shield_still_blocks_without_one()
        {
            var contract = new ContractDef("X", "X", 100, 1000, 10, 10,
                new[] { ValidationVoteFixtures.Vote(Slots.HeatShield, ValidationVoteFixtures.ShieldPica) }, returning: true);
            var cat = new GameCatalog(ValidationVoteFixtures.StandardParts(), new[] { contract });
            var issue = Assert.Single(Validator.Validate(BuildState.New("X", 1), cat), i => i.RuleId == ValidationRules.ReturnHeatShield);
            Assert.Equal(Severity.Blocker, issue.Severity);
        }
    }
}
