using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using MissionForge.Core.Build;
using MissionForge.Core.Campaign;
using MissionForge.Core.Tests.Data;
using Newtonsoft.Json.Linq;
using Xunit;

namespace MissionForge.Core.Tests.Campaign
{
    public class CampaignTests
    {
        private static MissionReport Report(MissionOutcome result = MissionOutcome.Success,
            string contract = "C1", bool onTime = true,
            IEnumerable<string> objectives = null, IEnumerable<string> recovered = null,
            int earnedKp = 12, double remainingM = 40, double initialM = 100) =>
            new MissionReport(contract, "CAMPAIGN", result, 900, "A", remainingM,
                initialM, onTime ? 2 : -3, onTime, earnedKp,
                recovered ?? Array.Empty<string>(), "", objectives ?? Array.Empty<string>());

        private static CampaignState Start() => CampaignState.New("Mission Society", "logo_orbit", "site_equatorial");

        [Fact]
        public void ImmutableState_JsonRoundTrip_IsByteIdentical()
        {
            var s = Start().With(reputation: 35, knowledgePoints: 11, carriedBudgetM: 6,
                unlockedParts: new[] { "comm_laser" }, purchasedTech: new[] { "laser_comms" },
                inventoryItems: new[] { new InventoryItem("i1", "fairing_small", 2, true) },
                milestones: new[] { "first_orbit" }, missions: new[] { Report() },
                achievements: new[] { "penny_pincher" }, insured: true);
            string json = s.ToJson();
            var loaded = CampaignState.FromJson(json);
            Assert.Equal(json, loaded.ToJson());
            Assert.Equal(35, loaded.Reputation);
            Assert.Equal(1, loaded.InventoryItems.Count);
            Assert.True(loaded.Insured);
            Assert.Equal(0, Start().Reputation); // operations do not mutate previous state
        }

        [Fact]
        public void UnknownOrMissingStateVersion_IsRejected()
        {
            var obj = JObject.Parse(Start().ToJson());
            obj["Version"] = 500;
            Assert.Contains("500", Assert.Throws<NotSupportedException>(
                () => CampaignState.FromJson(obj.ToString())).Message);
            obj.Remove("Version");
            Assert.Contains("missing", Assert.Throws<NotSupportedException>(
                () => CampaignState.FromJson(obj.ToString())).Message);
        }

        [Fact]
        public void Record_SuccessOnTime_ReputationKnowledgeCarryAndMilestone()
        {
            // Success +8, on time +2 => 10. $40M leftover × 0.25 => $10M carried.
            var a = Start();
            var update = Campaign.Record(a, Report(objectives: new[] { "orbit" }, recovered: new[] { "fairing_small" }));
            Assert.Equal(10, update.State.Reputation);
            Assert.Equal(12, update.State.KnowledgePoints);
            Assert.Equal(10, update.State.CarriedBudgetM, 8);
            Assert.Single(update.State.Missions);
            Assert.Single(update.State.InventoryItems);
            Assert.Single(update.MilestoneEvents);
            Assert.Equal("first_orbit", update.MilestoneEvents[0].Id);
            Assert.Equal("campaign_first_orbit", update.MilestoneEvents[0].CinematicId);
            Assert.Empty(a.Missions);
            Assert.Equal(10, update.Changes.Sum(x => x.ReputationDelta));
            Assert.Equal(10, update.Changes.Sum(x => x.BudgetDeltaM), 8);
        }

        [Fact]
        public void FailureLateClampedAndInsurance_PaysUpToCapOnce()
        {
            // Failure -8 plus late -3 clamps reputation to zero.
            // Insurance recovers min(8, 100×0.20) = $8M and expires.
            var a = Campaign.EnableInsurance(Start().With(reputation: 5));
            var update = Campaign.Record(a, Report(MissionOutcome.Failure, onTime: false, remainingM: 0));
            Assert.Equal(0, update.State.Reputation);
            Assert.Equal(8, update.State.CarriedBudgetM, 8);
            Assert.False(update.State.Insured);
            Assert.Equal(-5, update.Changes.Sum(x => x.ReputationDelta));
            Assert.Contains(update.Changes, x => x.Reason == "insurance_failure_claim");
        }

        [Fact]
        public void PartialMissionAndLatePenalty_Deterministic()
        {
            var s = Start().With(reputation: 30);
            var report = Report(MissionOutcome.Partial, onTime: false, remainingM: 0);
            // +3 -3 = 0.
            var a = Campaign.Record(s, report);
            var b = Campaign.Record(s, report);
            Assert.Equal(30, a.State.Reputation);
            Assert.Equal(a.State.ToJson(), b.State.ToJson());
        }

        [Fact]
        public void ContractsBoard_ReproducibleAndGated()
        {
            var baseState = Start();
            var a = ContractsBoard.Offer(baseState, 123);
            Assert.Equal(a, ContractsBoard.Offer(baseState, 123));
            Assert.Equal(3, a.Count);
            Assert.Equal(3, a.Distinct().Count());
            Assert.All(a, x => Assert.InRange(int.Parse(x.Substring(1)), 0, 2));
            var advanced = ContractsBoard.Offer(baseState.With(reputation: 90), 123);
            Assert.All(advanced, x => Assert.InRange(int.Parse(x.Substring(1)), 0, 8));
            Assert.Equal(2, ContractsBoard.Offer(baseState.With(missions: new[] { Report() }), 123).Count);
        }

        [Fact]
        public void TechTree_BuyWithEnoughKpAndRejectMissingRequirements()
        {
            var baseState = Start().With(knowledgePoints: 40);
            Assert.False(Campaign.IsPartAvailable(baseState, "comm_laser"));
            var researched = Campaign.PurchaseTech(baseState, "laser_comms");
            Assert.Equal(28, researched.KnowledgePoints);
            Assert.True(Campaign.IsPartAvailable(researched, "comm_laser"));
            Assert.Equal(40, baseState.KnowledgePoints);
            Assert.Throws<InvalidOperationException>(() => Campaign.PurchaseTech(baseState, "hiad"));
            Assert.Throws<InvalidOperationException>(() => Campaign.PurchaseTech(researched, "laser_comms"));
            Assert.Throws<InvalidOperationException>(() => Campaign.PurchaseTech(Start(), "methalox"));
            Assert.Equal("campaign.tech.methalox.real_tech", TechTree.Nodes[0].RealTechKey);
        }

        [Fact]
        public void CampaignBudgetInsuranceAndSupplierTrust_AddLedgerLinesOnlyOnce()
        {
            var state = Campaign.EnableInsurance(Start().With(reputation: 50, carriedBudgetM: 10));
            var build = BuildState.New("C1", 1).WithChoice("first_stage_engine", "eng_kerolox_workhorse");
            var catalog = DesignFixture.Catalog();
            build = Campaign.ApplyCarryOver(build, state);
            build = Campaign.ApplyCarryOver(build, state);
            build = Campaign.ApplyInsurance(build, state);
            build = Campaign.ApplyInsurance(build, state);
            build = Campaign.ApplySupplierTrust(build, catalog, state);
            build = Campaign.ApplySupplierTrust(build, catalog, state);
            Assert.Equal(3, build.Ledger.Count);
            Assert.Equal(10, build.Ledger[0].BudgetDeltaM, 8);
            Assert.Equal(CampaignConstants.InsurancePremiumM, build.Ledger[1].CostM, 8);
            // Workhorse cost $1.2M × 50% reputation × 10% max = $0.06M discount.
            Assert.Equal(-0.06, build.Ledger[2].CostM, 8);
        }

        [Fact]
        public void ReuseAndRefurbishment_AffectBuildOnlyOnce()
        {
            var catalog = DesignFixture.Catalog();
            var item = new InventoryItem("recovered-a", "eng_kerolox_workhorse", 3, false);
            var state = Start().With(inventoryItems: new[] { item });
            var inventory = new Inventory(state);
            var build = BuildState.New("C1", 4).WithChoice("first_stage_engine", item.PartId);
            var once = inventory.ApplyReuse(build, catalog, item.ItemId);
            var twice = inventory.ApplyReuse(once, catalog, item.ItemId);
            Assert.Equal(once.Ledger.Count, twice.Ledger.Count);
            Assert.Equal(-0.42, once.Ledger[0].CostM, 8); // $1.2M × 0.35 refund
            Assert.Equal(-0.03, once.Condition("first_stage_engine").ReliabilityDelta, 8); // 3 × 1%
            var repair = inventory.ApplyRefurbishment(build, catalog, item.ItemId);
            Assert.Equal(0.12, repair.Ledger[0].CostM, 8);
            Assert.Equal(2, repair.Ledger[0].Days, 8);
            var refurbished = new Inventory(inventory.MarkRefurbished(item.ItemId));
            var repairedBuild = refurbished.ApplyReuse(build, catalog, item.ItemId);
            Assert.Equal(0, repairedBuild.Condition("first_stage_engine").ReliabilityDelta, 8);
            Assert.Empty(inventory.Consume(item.ItemId).InventoryItems);
        }

        [Fact]
        public void MilestonesNeverRepeat()
        {
            var r = Report(contract: "C6", objectives: new[] { "orbit", "lunar_flyby", "crew_safe" },
                recovered: new[] { "fairing_small" });
            var first = Campaign.Record(Start(), r);
            Assert.Equal(4, first.MilestoneEvents.Count);
            var second = Campaign.Record(first.State, r);
            Assert.Empty(second.MilestoneEvents);
            Assert.Equal(4, second.State.Milestones.Count);
        }

        [Theory]
        [InlineData("QUICK", "SCORE", false)]
        [InlineData("CAMPAIGN", "SCORE", false)]
        [InlineData("SANDBOX", "NONE", true)]
        [InlineData("CLASSROOM", "NONE", false)]
        [InlineData("SOLO", "SCORE", false)]
        [InlineData("SPEEDRUN", "SCHEDULE_DAYS", false)]
        [InlineData("BUDGET_CRUNCH", "BUDGET_EFFICIENCY", false)]
        [InlineData("HERITAGE", "SCORE", false)]
        [InlineData("DAILY", "SCORE", false)]
        public void AllModeRulesUseProtocolTokens(string mode, string metric, bool unlimited)
        {
            var rules = ModeRules.For(mode, new ModeOptions(date: "2026-11-14"));
            Assert.Equal(metric, rules.LeaderboardMetric);
            Assert.Equal(unlimited, rules.UnlimitedBudget);
        }

        [Fact]
        public void DailyChallengeSameDateSameSeedAndContractAndRestrictedPool()
        {
            var a = ModeRules.For("DAILY", new ModeOptions(date: "2026-11-14"));
            var b = ModeRules.For("DAILY", new ModeOptions(date: "2026-11-14"));
            Assert.Equal(a.FixedSeed, b.FixedSeed);
            Assert.Equal(a.FixedContractId, b.FixedContractId);
            Assert.Equal("DATE_FNV1A64", a.SeedPolicy);
            Assert.False(a.AllPartsAvailable);
            Assert.NotEmpty(a.PartAllowList);
            Assert.Throws<ArgumentException>(() => ModeRules.For("DAILY", new ModeOptions(date: "2026-02-30")));
            Assert.Throws<ArgumentException>(() => ModeRules.For("DAILY", new ModeOptions(date: "14-11-2026")));
        }

        [Fact]
        public void HeritageClassroomSoloAndBudgetCrunchEnforced()
        {
            var heritage = ModeRules.For("HERITAGE", new ModeOptions(heritagePreset: "early_satellites"));
            Assert.True(heritage.AllowsPart("tank_xs"));
            Assert.False(heritage.AllowsPart("comm_laser"));
            var classroom = ModeRules.For("CLASSROOM",
                new ModeOptions(classroomAllowPause: false, classroomAllowVoteLock: true, classroomAllowExport: false));
            Assert.False(classroom.ClassroomAllowPause);
            Assert.True(classroom.ClassroomAllowVoteLock);
            Assert.False(classroom.ClassroomAllowExport);
            var solo = ModeRules.For("SOLO");
            Assert.Equal(1, solo.MaxPlayers);
            Assert.True(solo.AdvisorEnabled);
            Assert.Equal(25.0, ModeRules.For("BUDGET_CRUNCH").BudgetOverrideM);
        }

        [Fact]
        public void LeaderboardTeamValidationRankingAndJsonRoundTrip()
        {
            Assert.True(TeamName.Validate("Space Team-1"));
            Assert.True(TeamName.Validate("فريق الكويت"));
            Assert.False(TeamName.Validate("bad@example.com"));
            Assert.False(TeamName.Validate(" "));
            Assert.False(TeamName.Validate(new string('a', 25)));
            var a = new LeaderboardRecord("C1", "QUICK", "Alpha", 900, 0.3, 35, 1, "2026-11-14");
            var b = new LeaderboardRecord("C1", "QUICK", "Beta", 900, 0.5, 34, 2, "2026-11-14");
            var c = new LeaderboardRecord("C1", "SPEEDRUN", "Other", 1200, 0.7, 10, 3, "2026-11-14");
            var initial = new Leaderboard();
            var board = initial.Insert(a).Insert(b).Insert(c);
            Assert.Empty(initial.Records);
            Assert.Equal("Beta", board.Top(1, "C1", "QUICK")[0].TeamName);
            Assert.Equal(2, board.Rank(a));
            Assert.Equal(0, board.Rank(c, "SCORE") == 0 ? 1 : 0); // third record belongs to its own partition
            Assert.Equal(board.ToJson(), Leaderboard.FromJson(board.ToJson()).ToJson());
            Assert.Equal("Beta", board.Top(2, "C1", "QUICK", "BUDGET_EFFICIENCY")[0].TeamName);
        }

        [Fact]
        public void AchievementsDataRulesFiltersAndOnceOnlySemantics()
        {
            string data = File.ReadAllText(Path.Combine(DesignFixture.DataDir, "achievements.json"));
            Assert.Equal(12, Achievements.Parse(data).Count);
            var report = Report(contract: "C6", remainingM: 30);
            var metrics = new Dictionary<string, double> { ["mission_patches_designed"] = 10,
                ["minigame_tier_gold:MG-25"] = 1, ["players_at_finish"] = 10 };
            var first = Achievements.Evaluate(Start(), report, metrics, data);
            Assert.Contains("escape_velocity", first);
            Assert.Contains("penny_pincher", first);
            Assert.Contains("blackout_calm", first);
            Assert.Contains("ten_seats_full", first);
            Assert.Contains("patch_archivist", first);
            var saved = Achievements.Apply(Start(), first);
            Assert.DoesNotContain("penny_pincher", Achievements.Evaluate(saved, report, metrics, data));
            Assert.Equal(saved.Achievements.Count, Achievements.Apply(saved, first).Achievements.Count);
        }

        [Fact]
        public void AchievementOperatorsApplyExactAndWithinComparisons()
        {
            const string json = "{\"achievements\":[{\"id\":\"near\",\"scope\":\"mission\",\"criteria\":[{\"metric\":\"x\",\"op\":\"within\",\"value\":10,\"tolerance\":2}]},{\"id\":\"gt\",\"scope\":\"mission\",\"criteria\":[{\"metric\":\"x\",\"op\":\"gt\",\"value\":10}]}]}";
            var yes = Achievements.Evaluate(Start(), Report(), new Dictionary<string, double> { ["x"] = 12 }, json);
            Assert.Contains("near", yes);
            Assert.Contains("gt", yes);
            var no = Achievements.Evaluate(Start(), Report(), new Dictionary<string, double> { ["x"] = 13 }, json);
            Assert.DoesNotContain("near", no);
        }
    }
}
