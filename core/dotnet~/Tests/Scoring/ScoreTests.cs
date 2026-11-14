using System.Collections.Generic;
using System.Linq;
using MissionForge.Core.Flight.Mission;
using MissionForge.Core.Scoring;
using Xunit;

namespace MissionForge.Core.Tests.Scoring
{
    /// <summary>Design 8.5, 11.3, 11.4 and Appendix A: objectives, score arithmetic, grades and outcome.</summary>
    public class ScoreTests
    {
        private static readonly ScoringCatalog C = ScoringFixture.Catalog();

        private static Dictionary<string, double> M(params (string k, double v)[] kv)
        {
            var d = new Dictionary<string, double>();
            foreach (var (k, v) in kv) d[k] = v;
            return d;
        }

        private static Criterion Crit(string op, double? value, double? tol = null) => new Criterion("x", op, value, tol, null);

        private static bool Eval(Criterion c, double x) => ObjectiveEvaluator.Evaluate(c, M(("x", x)), out _);

        // ------------------------------------------------------------------ objective evaluator

        [Fact]
        public void Ops_GteGtLteLtEq()
        {
            Assert.True(Eval(Crit("gte", 10), 10));
            Assert.False(Eval(Crit("gte", 10), 9.99));
            Assert.True(Eval(Crit("gt", 10), 10.01));
            Assert.False(Eval(Crit("gt", 10), 10));
            Assert.True(Eval(Crit("lte", 10), 10));
            Assert.False(Eval(Crit("lte", 10), 10.01));
            Assert.True(Eval(Crit("lt", 10), 9.99));
            Assert.False(Eval(Crit("lt", 10), 10));
            Assert.True(Eval(Crit("eq", 3), 3));
            Assert.False(Eval(Crit("eq", 3), 3.001));
        }

        [Fact]
        public void Within_IsInclusiveAtTheTolerance()
        {
            // |x - 550| <= 25 : 525 and 575 pass, 575.01 and 524.99 fail
            var c = Crit("within", 550, 25);
            Assert.True(Eval(c, 550));
            Assert.True(Eval(c, 525));
            Assert.True(Eval(c, 575));
            Assert.False(Eval(c, 575.01));
            Assert.False(Eval(c, 524.99));
        }

        [Fact]
        public void IsTrue_ReadsBooleansAsOneAndZero()
        {
            var c = Crit("is_true", null);
            Assert.True(Eval(c, 1));
            Assert.False(Eval(c, 0));
        }

        [Fact]
        public void MissingMetric_IsNotMet_AndListed()
        {
            var obj = C.ObjectivesFor("C1")!.Primary;
            var r = ObjectiveEvaluator.Evaluate(obj, M(("orbit_altitude_km", 550)));
            Assert.False(r.Met);
            Assert.Equal(new[] { "inclination_deg", "payload_power_balance_W" }, r.MissingMetrics);
            Assert.False(ObjectiveEvaluator.Evaluate(Crit("gte", 0), M(), out var missing));
            Assert.True(missing);
        }

        [Fact]
        public void Objective_NeedsEveryCriterion()
        {
            var obj = C.ObjectivesFor("C1")!.Primary; // altitude 550+-25 km, inclination 97.6+-0.2 deg, power balance > 0 W
            var ok = M(("orbit_altitude_km", 560), ("inclination_deg", 97.5), ("payload_power_balance_W", 12));
            Assert.True(ObjectiveEvaluator.Evaluate(obj, ok).Met);
            ok["payload_power_balance_W"] = 0;      // gt 0 fails at 0
            Assert.False(ObjectiveEvaluator.Evaluate(obj, ok).Met);
        }

        // ------------------------------------------------------------------ score

        [Fact]
        public void HandComputed_C1_FlightDirector_AllObjectives()
        {
            // Objectives: primary 3000 + secondary 3 x 500 = 1500 + stretch 500 = 5000
            // Efficiency: 0.5 x 1000 + 0.2 x 500 = 500 + 100 = 600
            // Safety & recovery: uncrewed, booster recovered = 500 (the crew-safe flag is ignored: not crewed)
            // Science: 0.8 x 1500 = 1200
            // Teamwork: Gold 200 + Platinum 250 + Silver in Golden Window 2 x 120 = 240 + Bronze 60 + None 0 = 750; Good Calls 2 x 20 = 40 -> 790
            // Knowledge: 3 x 50 + 2 x 30 = 210
            // Subtotal = 5000 + 600 + 500 + 1200 + 790 + 210 = 8300
            // x difficulty 1.25 (Flight Director) = 10375; x boost 1.2 = 12450 -> grade S
            var input = new ScoreInput
            {
                ContractId = "C1",
                AssistLevelId = "flight_director",
                Metrics = M(("orbit_altitude_km", 550), ("inclination_deg", 97.6), ("payload_power_balance_W", 5),
                    ("science_targets_captured", 15), ("data_downlinked_GB", 8), ("budget_remaining_M", 0)),
                BudgetRemainingFraction = 0.5,
                ScheduleMarginFraction = 0.2,
                CrewSafe = true,
                BoosterRecovered = true,
                ScienceDataFraction = 0.8,
                Minigames = new[]
                {
                    new MinigameScore("MG-08", Tier.Gold),
                    new MinigameScore("MG-07", Tier.Platinum),
                    new MinigameScore("MG-13", Tier.Silver, inGoldenWindow: true),
                    new MinigameScore("MG-10a", Tier.Bronze),
                    new MinigameScore("MG-01", Tier.None),
                },
                GoodCalls = 2,
                PredictionsCorrect = 3,
                TriviaTiebreaksWon = 2,
                BoostMultiplier = 1.2,
            };
            var s = ScoreCalculator.Compute(C, input);
            Assert.Equal(5000, s.Objectives);
            Assert.Equal(600, s.Efficiency, 6);
            Assert.Equal(500, s.SafetyRecovery);
            Assert.Equal(1200, s.ScienceData);
            Assert.Equal(790, s.Teamwork);
            Assert.Equal(210, s.Knowledge);
            Assert.Equal(8300, s.SubtotalPoints, 6);
            Assert.Equal(1.25, s.DifficultyMult);
            Assert.Equal(1.2, s.BoostMult);
            Assert.Equal(12450, s.TotalPoints);
            Assert.Equal("S", s.Grade);
            Assert.Equal("grade.S.title", s.TitleKey);
            Assert.Equal(MissionOutcome.Success, s.Outcome);
            Assert.Null(s.CrewSafe);
            Assert.Empty(s.MissingMetrics);
        }

        [Fact]
        public void AppendixA_Step15_C1_FourPlayers_EngineerDifficulty()
        {
            // Appendix A step 15 (C1 Earth Watch, Engineer): primary met, 12/15 targets, $6 M left, grade A "Mission Accomplished".
            // The walkthrough lists the minigames; numbers it does not give are assumptions, marked (assumed).
            // Primary 3000. Secondary (3 -> 500 each): science_targets_10 met (12 >= 10), downlink_8_gb not met (6 GB, assumed), under_budget met (6 >= 0 M) -> 1000.
            // Stretch (15 targets) not met. Objectives = 3000 + 1000 = 4000.
            // Efficiency: 6 / 90 x 1000 = 66.667; schedule margin 30 d of 180 d (assumed) = 30 / 180 x 500 = 83.333 -> 150.
            // Safety & recovery: uncrewed, expendable booster -> 0.
            // Science: 12 / 15 = 0.8 x 1500 = 1200 (the debrief.score example of the protocol also shows 1,200).
            // Teamwork: MG-01 Silver 120, MG-07 Gold 200, MG-09 Silver 120, MG-08 Gold 200, MG-10a Bronze 60, MG-15 Gold 200,
            //   MG-21 x3 (Gold 200, Gold 200, Silver 120 (assumed)), MG-13 Silver 120 played in the Golden Window = 240
            //   = 120+200+120+200+60+200+200+200+120+240 = 1660; one Good Call 20 -> 1680.
            // Knowledge: 3 correct predictions (assumed) 150 + 1 trivia tiebreak 30 = 180.
            // Subtotal = 4000 + 150 + 0 + 1200 + 1680 + 180 = 7210; x 1.0 (Engineer);
            // x boosts: one Silver Score Multiplier earned (x1.1) -> 7210 x 1.1 = 7931 -> grade A (>= 7500, < 9000).
            var ledger = BoostLedger.Empty(C, crewed: false).Grant("score_multiplier", Tier.Silver, BoostSource.Minigame, "MG-13", out _);
            var input = new ScoreInput
            {
                ContractId = "C1",
                AssistLevelId = "engineer",
                Metrics = M(("orbit_altitude_km", 551), ("inclination_deg", 97.6), ("payload_power_balance_W", 20),
                    ("science_targets_captured", 12), ("data_downlinked_GB", 6), ("budget_remaining_M", 6)),
                BudgetRemainingFraction = 6.0 / 90.0,
                ScheduleMarginFraction = 30.0 / 180.0,
                ScienceDataFraction = 12.0 / 15.0,
                Minigames = new[]
                {
                    new MinigameScore("MG-01", Tier.Silver), new MinigameScore("MG-07", Tier.Gold), new MinigameScore("MG-09", Tier.Silver),
                    new MinigameScore("MG-08", Tier.Gold), new MinigameScore("MG-10a", Tier.Bronze), new MinigameScore("MG-15", Tier.Gold),
                    new MinigameScore("MG-21", Tier.Gold), new MinigameScore("MG-21", Tier.Gold), new MinigameScore("MG-21", Tier.Silver),
                    new MinigameScore("MG-13", Tier.Silver, inGoldenWindow: true),
                },
                GoodCalls = 1,
                PredictionsCorrect = 3,
                TriviaTiebreaksWon = 1,
                BoostMultiplier = ledger.Total("score_multiplier"),
            };
            var s = ScoreCalculator.Compute(C, input);
            Assert.Equal(4000, s.Objectives);
            Assert.Equal(150, s.Efficiency, 6);
            Assert.Equal(0, s.SafetyRecovery);
            Assert.Equal(1200, s.ScienceData, 6);
            Assert.Equal(1680, s.Teamwork);
            Assert.Equal(180, s.Knowledge);
            Assert.Equal(7210, s.SubtotalPoints, 6);
            Assert.Equal(1.0, s.DifficultyMult);
            Assert.Equal(1.1, s.BoostMult, 9);
            Assert.Equal(7931, s.TotalPoints);
            Assert.Equal("A", s.Grade);
            Assert.Equal("grade.A.title", s.TitleKey);
            Assert.Equal(MissionOutcome.Success, s.Outcome);
            Assert.Equal(new[] { "reach_sso_power_positive", "science_targets_10", "downlink_8_gb", "under_budget", "science_targets_all" },
                s.ObjectiveResults.Select(r => r.Id));
            Assert.Equal(new[] { true, true, false, true, false }, s.ObjectiveResults.Select(r => r.Met));
        }

        [Fact]
        public void SecondaryPointsSplitEqually_ThreeSecondaries500Each_TwoSecondaries750Each()
        {
            // C1 has 3 secondaries: 1500 / 3 = 500 each. C0 has 2: 1500 / 2 = 750 each.
            var c1 = C.ObjectivesFor("C1")!;
            var in1 = new ScoreInput { ContractId = "C1", Metrics = M(("data_downlinked_GB", 8)) };
            var s1 = ScoreCalculator.Compute(C, in1);
            Assert.Equal(500, s1.Objectives);       // one of three secondaries met; primary and stretch not met
            Assert.Equal(3, c1.Secondary.Count);

            var c0 = C.ObjectivesFor("C0")!;
            Assert.Equal(2, c0.Secondary.Count);
            var metric = c0.Secondary[0].Criteria[0];
            var in0 = new ScoreInput { ContractId = "C0", Metrics = M((metric.Metric, metric.Value ?? 1)) };
            var s0 = ScoreCalculator.Compute(C, in0);
            Assert.Equal(750, s0.Objectives);
        }

        [Fact]
        public void BudgetAndScheduleFractions_ClampToZeroOne()
        {
            // 1.5 -> 1 -> 1000 ; -0.2 -> 0 -> 0 ; schedule 2 -> 1 -> 500
            var s = ScoreCalculator.Compute(C, new ScoreInput { ContractId = "C1", BudgetRemainingFraction = 1.5, ScheduleMarginFraction = 2 });
            Assert.Equal(1500, s.Efficiency);
            s = ScoreCalculator.Compute(C, new ScoreInput { ContractId = "C1", BudgetRemainingFraction = -0.2, ScheduleMarginFraction = -1 });
            Assert.Equal(0, s.Efficiency);
        }

        [Fact]
        public void CrewSafePoints_OnlyOnCrewedContracts()
        {
            // C4 is crewed: crew safe 1000. C1 is not: the flag is ignored.
            var crewed = ScoreCalculator.Compute(C, new ScoreInput { ContractId = "C4", CrewSafe = true });
            Assert.Equal(1000, crewed.SafetyRecovery);
            Assert.True(crewed.CrewSafe);
            var uncrewed = ScoreCalculator.Compute(C, new ScoreInput { ContractId = "C1", CrewSafe = true });
            Assert.Equal(0, uncrewed.SafetyRecovery);
            Assert.Null(uncrewed.CrewSafe);
        }

        [Fact]
        public void CrewSafe_FallsBackToTheMetric_AndMissingIsListed()
        {
            var viaMetric = ScoreCalculator.Compute(C, new ScoreInput { ContractId = "C4", Metrics = M(("crew_safe", 1)) });
            Assert.Equal(1000, viaMetric.SafetyRecovery);
            var unknown = ScoreCalculator.Compute(C, new ScoreInput { ContractId = "C4" });
            Assert.Equal(0, unknown.SafetyRecovery);
            Assert.Null(unknown.CrewSafe);
            Assert.Contains("crew_safe", unknown.MissingMetrics);
        }

        [Fact]
        public void CrewLost_GivesGradeD_EvenWithAHugeScore()
        {
            // 8 x 1500... build a big score: science 1500 + efficiency 1500 + 104 predictions x 50 = 5200 -> 8200+; crew lost caps at D
            var s = ScoreCalculator.Compute(C, new ScoreInput
            {
                ContractId = "C4", CrewSafe = false, BudgetRemainingFraction = 1, ScheduleMarginFraction = 1,
                ScienceDataFraction = 1, PredictionsCorrect = 104, AssistLevelId = "flight_director",
            });
            Assert.True(s.TotalPoints > 9000);
            Assert.Equal("D", s.Grade);
            Assert.Equal("grade.D.title", s.TitleKey);
            Assert.False(s.CrewSafe);
            Assert.Equal(0, s.SafetyRecovery);
        }

        // Base: efficiency 1000 + 500, science 1500, booster 500, capsule 300 = 3800 points. Extra points come from correct
        // predictions (50 each) and Good Calls (20 each).
        private static ScoreBreakdown Base(int goodCalls, int predictions)
        {
            return ScoreCalculator.Compute(C, new ScoreInput
            {
                ContractId = "C1", BudgetRemainingFraction = 1, ScheduleMarginFraction = 1, ScienceDataFraction = 1,
                BoosterRecovered = true, CapsuleRecovered = true, GoodCalls = goodCalls, PredictionsCorrect = predictions,
            });
        }

        [Theory]
        [InlineData(9, 0, 3980, "D")]       // 3800 + 9 x 20 = 3980 < 4000
        [InlineData(10, 0, 4000, "C")]      // 3800 + 200 = 4000 (>= 4000)
        [InlineData(0, 43, 5950, "C")]      // 3800 + 43 x 50 = 5950 < 6000
        [InlineData(0, 44, 6000, "B")]      // 3800 + 2200 = 6000
        [InlineData(0, 73, 7450, "B")]      // 3800 + 3650 = 7450 < 7500
        [InlineData(0, 74, 7500, "A")]      // 3800 + 3700 = 7500
        [InlineData(0, 103, 8950, "A")]     // 3800 + 5150 = 8950 < 9000
        [InlineData(0, 104, 9000, "S")]     // 3800 + 5200 = 9000
        public void GradeBoundaries(int goodCalls, int predictions, int expectedTotal, string grade)
        {
            var s = Base(goodCalls, predictions);
            Assert.Equal(expectedTotal, s.TotalPoints);
            Assert.Equal(grade, s.Grade);
        }

        [Fact]
        public void CrewLostWithPrimaryMet_IsStillOutcomeSuccessButGradeD()
        {
            // Design 8.5 judges the outcome by the primary objective; design 5.2 caps the grade at D when the crew is lost.
            var c4 = C.ObjectivesFor("C4")!;
            var metrics = new Dictionary<string, double>();
            foreach (var cr in c4.Primary.Criteria)
                metrics[cr.Metric] = cr.Op == "is_true" ? 1 : cr.Op == "lt" || cr.Op == "lte" ? (cr.Value ?? 0) - 1 : cr.Op == "gt" || cr.Op == "gte" ? (cr.Value ?? 0) + 1 : (cr.Value ?? 0);
            var s = ScoreCalculator.Compute(C, new ScoreInput { ContractId = "C4", Metrics = metrics, CrewSafe = false });
            Assert.True(ObjectiveEvaluator.Evaluate(c4.Primary, metrics).Met);
            Assert.Equal(MissionOutcome.Success, s.Outcome);
            Assert.Equal("D", s.Grade);
        }

        [Theory]
        [InlineData("cadet", 0.8)]
        [InlineData("engineer", 1.0)]
        [InlineData("flight_director", 1.25)]
        public void DifficultyMultiplier_ComesFromTheAssistLevel(string level, double mult)
        {
            // 1000 points of science x mult
            var s = ScoreCalculator.Compute(C, new ScoreInput { ContractId = "C1", AssistLevelId = level, ScienceDataFraction = 1000.0 / 1500.0 });
            Assert.Equal(mult, s.DifficultyMult);
            Assert.Equal((int)System.Math.Round(1000 * mult), s.TotalPoints);
        }

        [Fact]
        public void BoostMultiplier_ClampsToCapAndFloorOne()
        {
            var high = ScoreCalculator.Compute(C, new ScoreInput { ContractId = "C1", ScienceDataFraction = 1, BoostMultiplier = 3.0 });
            Assert.Equal(1.5, high.BoostMult);
            Assert.Equal(2250, high.TotalPoints);   // 1500 x 1.5
            var low = ScoreCalculator.Compute(C, new ScoreInput { ContractId = "C1", ScienceDataFraction = 1, BoostMultiplier = 0.2 });
            Assert.Equal(1.0, low.BoostMult);
        }

        [Fact]
        public void GoldenWindow_DoublesMinigamePoints_NotGoodCalls()
        {
            // Gold 200 x 2 = 400 ; Good Call 20 stays 20
            var s = ScoreCalculator.Compute(C, new ScoreInput
            {
                ContractId = "C1", GoodCalls = 1,
                Minigames = new[] { new MinigameScore("MG-08", Tier.Gold, inGoldenWindow: true) },
            });
            Assert.Equal(420, s.Teamwork);
        }

        [Fact]
        public void Outcome_SuccessPartialFailure()
        {
            var primary = M(("orbit_altitude_km", 550), ("inclination_deg", 97.6), ("payload_power_balance_W", 5));
            Assert.Equal(MissionOutcome.Success, ScoreCalculator.Compute(C, new ScoreInput { ContractId = "C1", Metrics = primary }).Outcome);
            Assert.Equal(MissionOutcome.Partial, ScoreCalculator.Compute(C, new ScoreInput { ContractId = "C1", Metrics = primary, SecondarySystemsLost = true }).Outcome);
            Assert.Equal(MissionOutcome.Partial, ScoreCalculator.Compute(C, new ScoreInput { ContractId = "C1", Recoverable = true }).Outcome);
            Assert.Equal(MissionOutcome.Failure, ScoreCalculator.Compute(C, new ScoreInput { ContractId = "C1" }).Outcome);
        }

        [Fact]
        public void UnknownContractOrAssistLevel_Throws()
        {
            Assert.Throws<System.ArgumentException>(() => ScoreCalculator.Compute(C, new ScoreInput { ContractId = "C99" }));
            Assert.Throws<System.ArgumentException>(() => ScoreCalculator.Compute(C, new ScoreInput { ContractId = "C1", AssistLevelId = "god" }));
        }

        [Fact]
        public void SameInputs_GiveIdenticalScores()
        {
            ScoreBreakdown Run() => ScoreCalculator.Compute(C, new ScoreInput
            {
                ContractId = "C1", BudgetRemainingFraction = 0.37, ScheduleMarginFraction = 0.11, ScienceDataFraction = 0.6,
                Minigames = new[] { new MinigameScore("MG-08", Tier.Silver) }, BoostMultiplier = 1.15,
            });
            Assert.Equal(Run().TotalPoints, Run().TotalPoints);
            Assert.Equal(Run().SubtotalPoints, Run().SubtotalPoints);
        }
    }
}
