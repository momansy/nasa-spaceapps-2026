using System.Collections.Generic;
using MissionForge.Core.Data;
using MissionForge.Core.Scoring;
using Xunit;

namespace MissionForge.Core.Tests.Scoring
{
    public class ScoringCatalogTests
    {
        [Fact]
        public void RealData_LoadsTiersBoostsAndTeamSync()
        {
            var c = ScoringFixture.Catalog();
            Assert.Equal(new[] { "bronze", "silver", "gold", "platinum" }, new[] { c.Tiers[0].Id, c.Tiers[1].Id, c.Tiers[2].Id, c.Tiers[3].Id });
            Assert.Equal(0.33, c.Tier("bronze")!.MinFractionUnitless);
            Assert.Equal(0.66, c.Tier("silver")!.MinFractionUnitless);
            Assert.Equal(1.0, c.Tier("gold")!.MinFractionUnitless);
            Assert.True(c.Tier("platinum")!.RequiresAllPerfect);
            Assert.Equal("gold", c.Tier("platinum")!.BoostTier);
            Assert.Equal(1, c.CosmeticMinSuccesses);
            Assert.Equal(11, c.Boosts.Count);
            Assert.Equal(100, c.TeamSync.MeterMax);
            Assert.Equal(25, c.TeamSync.Gains["gold"]);
            Assert.Equal(15, c.TeamSync.Gains["silver"]);
            Assert.Equal(8, c.TeamSync.Gains["bronze"]);
            Assert.Equal(3, c.TeamSync.Gains["good_call"]);
            Assert.Equal(3, c.TeamSync.Moments.Count);
            Assert.Equal(2.0, c.TeamSync.Moment("golden_window")!.ScoreMultiplierNextPhase);
        }

        [Fact]
        public void RealData_BoostFieldsAreRead()
        {
            var c = ScoringFixture.Catalog();
            var dv = c.Boost("dv_bonus")!;
            Assert.Equal(BoostKind.Effect, dv.Kind);
            Assert.Equal("delta_v_m_s", dv.Target);
            Assert.Equal(BoostOp.AddFraction, dv.Op);
            Assert.Equal(0.02, dv.ValueByTier["silver"]);
            Assert.Equal(0.08, dv.CapValue);
            Assert.Equal("total_per_mission", dv.CapKind);
            var shield = c.Boost("reliability_shield")!;
            Assert.Equal(BoostKind.Shield, shield.Kind);
            Assert.False(shield.ShieldByTier.ContainsKey("bronze"));
            Assert.Equal("reroll_next_failure", shield.ShieldByTier["silver"]);
            Assert.Equal("negate_next_failure", shield.ShieldByTier["gold"]);
            Assert.Equal(2, shield.CapValue);
            Assert.Null(c.Boost("budget_refund")!.CapValue);
            Assert.Equal("build", c.Boost("schedule_recovery")!.Phase);
            Assert.True(c.Boost("crew_morale")!.CrewedOnly);
            Assert.Equal("segment", c.Boost("score_multiplier")!.Scope);
            Assert.Equal(BoostOp.Mul, c.Boost("data_multiplier")!.Op);
        }

        [Fact]
        public void RealData_ScoringAwardsAssistAndObjectives()
        {
            var c = ScoringFixture.Catalog();
            Assert.Equal(3000, c.Points("objective_points", "primary"));
            Assert.Equal(1500, c.Points("objective_points", "secondary"));
            Assert.Equal(500, c.Points("objective_points", "stretch"));
            Assert.Equal(6, c.Components.Count);
            Assert.Equal(5, c.Grades.Count);
            Assert.Null(c.Grades[4].MinScorePoints);
            Assert.Equal("D", c.CrewLostGrade);
            Assert.Equal(1.5, c.ScoreBoostCap);
            Assert.Equal(8, c.Awards.Count);
            Assert.Equal("PM", c.Awards[1].Role);
            Assert.Equal(1, c.MinAwardsPerPlayer);
            Assert.True(c.AwardsPositiveOnly);
            Assert.Equal(0.8, c.AssistScoreMultipliers["cadet"]);
            Assert.Equal(1.0, c.AssistScoreMultipliers["engineer"]);
            Assert.Equal(1.25, c.AssistScoreMultipliers["flight_director"]);
            Assert.Equal(9, c.Objectives.Count);
            var c1 = c.ObjectivesFor("C1")!;
            Assert.Equal(3, c1.Secondary.Count);
            Assert.NotNull(c1.Stretch);
            Assert.False(c1.Crewed);
            Assert.Equal(3, c1.Primary.Criteria.Count);
            Assert.Equal("within", c1.Primary.Criteria[0].Op);
            Assert.Equal(25, c1.Primary.Criteria[0].Tolerance);
            Assert.True(c.ObjectivesFor("C4")!.Crewed);
            Assert.NotNull(c.ObjectivesFor("C4")!.Safety);
        }

        [Fact]
        public void KeysAcceptDataPrefixAndBackslashes()
        {
            var files = new Dictionary<string, string>();
            foreach (var kv in ScoringFixture.Files()) files["data\\" + kv.Key] = kv.Value;
            Assert.Equal(11, ScoringCatalog.Load(files).Boosts.Count);
        }

        [Theory]
        [InlineData("boosts.json")]
        [InlineData("scoring.json")]
        [InlineData("awards.json")]
        [InlineData("assist_levels.json")]
        [InlineData("contracts.json")]
        public void MalformedFile_ThrowsNamingTheFile(string file)
        {
            var files = ScoringFixture.Files();
            files[file] = "{ not json";
            var e = Assert.Throws<CatalogException>(() => ScoringCatalog.Load(files));
            Assert.Contains(file, e.Message);
        }

        [Theory]
        [InlineData("boosts.json")]
        [InlineData("scoring.json")]
        public void MissingFile_ThrowsNamingTheFile(string file)
        {
            var files = ScoringFixture.Files();
            files.Remove(file);
            Assert.Contains(file, Assert.Throws<CatalogException>(() => ScoringCatalog.Load(files)).Message);
        }

        [Fact]
        public void MissingRequiredField_ThrowsNamingTheFile()
        {
            var files = ScoringFixture.Files();
            files["scoring.json"] = files["scoring.json"].Replace("\"meter_max\": 100,", "");
            var e = Assert.Throws<CatalogException>(() => ScoringCatalog.Load(files));
            Assert.Contains("scoring.json", e.Message);
            Assert.Contains("meter_max", e.Message);
        }

        [Fact]
        public void UnknownBoostTier_ThrowsNamingBoosts()
        {
            var files = ScoringFixture.Files();
            files["boosts.json"] = files["boosts.json"].Replace("\"boost_tier\": \"bronze\"", "\"boost_tier\": \"diamond\"");
            var e = Assert.Throws<CatalogException>(() => ScoringCatalog.Load(files));
            Assert.Contains("boosts.json", e.Message);
            Assert.Contains("diamond", e.Message);
        }

        [Fact]
        public void UnknownCriterionOp_ThrowsNamingContracts()
        {
            var files = ScoringFixture.Files();
            files["contracts.json"] = files["contracts.json"].Replace("\"within\"", "\"near\"");
            Assert.Contains("contracts.json", Assert.Throws<CatalogException>(() => ScoringCatalog.Load(files)).Message);
        }
    }
}
