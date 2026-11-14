using System;
using System.Collections.Generic;
using System.Linq;
using MissionForge.Core.Scoring;
using Xunit;

namespace MissionForge.Core.Tests.Scoring
{
    public class ObjectiveEvaluatorTests
    {
        private static ObjectiveDef Obj(params Criterion[] c) => new ObjectiveDef("o", "PRIMARY", c);
        private static Dictionary<string, double> M(string k, double v) => new Dictionary<string, double> { [k] = v };

        [Theory]
        [InlineData("gte", 5, 5, true)] [InlineData("gte", 5, 4.9, false)]
        [InlineData("gt", 5, 5, false)] [InlineData("gt", 5, 5.1, true)]
        [InlineData("lte", 5, 5, true)] [InlineData("lte", 5, 5.1, false)]
        [InlineData("lt", 5, 5, false)] [InlineData("lt", 5, 4.9, true)]
        [InlineData("eq", 5, 5, true)] [InlineData("eq", 5, 5.5, false)]
        public void ComparisonOps(string op, double value, double x, bool expected)
        {
            var r = ObjectiveEvaluator.Evaluate(Obj(new Criterion("m", op, value, 0)), M("m", x));
            Assert.Equal(expected, r.Met);
            Assert.Empty(r.MissingMetrics);
        }

        [Theory]
        [InlineData(550, true)]  // |550 - 550| = 0 <= 25
        [InlineData(575, true)]  // |575 - 550| = 25 <= 25 (inclusive)
        [InlineData(525, true)]
        [InlineData(575.5, false)]
        [InlineData(500, false)]
        public void WithinUsesTheTolerance(double x, bool expected) =>
            Assert.Equal(expected, ObjectiveEvaluator.Evaluate(Obj(new Criterion("alt", "within", 550, 25)), M("alt", x)).Met);

        [Fact]
        public void IsTrueReadsBooleansAsOneAndZero()
        {
            var o = Obj(new Criterion("ok", "is_true", 0, 0));
            Assert.True(ObjectiveEvaluator.Evaluate(o, M("ok", 1)).Met);
            Assert.False(ObjectiveEvaluator.Evaluate(o, M("ok", 0)).Met);
        }

        [Fact]
        public void MissingMetricIsNotMetAndListed()
        {
            var r = ObjectiveEvaluator.Evaluate(Obj(new Criterion("a", "gte", 1, 0), new Criterion("b", "gte", 1, 0)), M("a", 5));
            Assert.False(r.Met);
            Assert.Equal(new[] { "b" }, r.MissingMetrics);
        }

        [Fact]
        public void AllCriteriaMustHold()
        {
            var o = Obj(new Criterion("a", "gte", 1, 0), new Criterion("b", "gte", 1, 0));
            Assert.False(ObjectiveEvaluator.Evaluate(o, new Dictionary<string, double> { ["a"] = 2, ["b"] = 0 }).Met);
            Assert.True(ObjectiveEvaluator.Evaluate(o, new Dictionary<string, double> { ["a"] = 2, ["b"] = 2 }).Met);
        }

        [Fact]
        public void UnknownOpThrows() =>
            Assert.Throws<ArgumentException>(() => ObjectiveEvaluator.Evaluate(Obj(new Criterion("a", "wat", 1, 0)), M("a", 1)));
    }

    public class ScoreTests
    {
        private static readonly ScoringCatalog C = ScoringFixture.Catalog;

        private static Dictionary<string, double> C1Metrics(double targets = 12, double downlinkGb = 9, double budgetLeftM = 6) =>
            new Dictionary<string, double>
            {
                ["orbit_altitude_km"] = 550, ["inclination_deg"] = 97.6, ["payload_power_balance_W"] = 80,
                ["science_targets_captured"] = targets, ["data_downlinked_GB"] = downlinkGb, ["budget_remaining_M"] = budgetLeftM,
            };

        [Fact]
        public void HandComputedExample()
        {
            // C1 at Engineer (x1.0), nothing else: primary 3000 only.
            var r = ScoreCalculator.Compute(C, new ScoreInput
            {
                ContractId = "C1", AssistLevelId = "engineer",
                Metrics = new Dictionary<string, double> { ["orbit_altitude_km"] = 550, ["inclination_deg"] = 97.6, ["payload_power_balance_W"] = 1 },
            });
            Assert.Equal(3000.0, r.TotalPoints, 6);
            Assert.Equal(3000.0, r.Breakdown.Objectives, 6);
            Assert.Equal("D", r.Grade); // 3000 < 4000
            Assert.Equal(MissionOutcome.Success, r.Outcome);
        }

        [Fact]
        public void EveryTermAddsUp()
        {
            // C1, Engineer, all secondaries met (3 x 500), stretch met (500):
            //   objectives = 3000 + 1500 + 500 = 5000
            //   efficiency = 0.5 x 1000 + 0.4 x 500 = 700
            //   safety     = booster 500 + capsule 300 = 800 (uncrewed: no crew-safe points)
            //   science    = 0.5 x 1500 = 750
            //   teamwork   = Gold 200 + Bronze 60 + 2 Good Calls x 20 = 300
            //   knowledge  = 2 x 50 + 1 x 30 = 130
            //   sum 7680; x1.0 difficulty; x1.2 boosts = 9216 -> grade S (>= 9000)
            var m = C1Metrics(targets: 15);
            var r = ScoreCalculator.Compute(C, new ScoreInput
            {
                ContractId = "C1", AssistLevelId = "engineer", Metrics = m,
                BudgetRemainingFraction = 0.5, ScheduleMarginFraction = 0.4, BoosterRecovered = true, CapsuleRecovered = true,
                ScienceFraction = 0.5, GoodCalls = 2, CorrectPredictions = 2, TriviaTiebreaks = 1, ScoreBoostMultiplier = 1.2,
                Minigames = new[] { new MinigameResult("MG-07", Tier.Gold, false), new MinigameResult("MG-01", Tier.Bronze, false) },
            });
            Assert.Equal(5000.0, r.Breakdown.Objectives, 6);
            Assert.Equal(700.0, r.Breakdown.Efficiency, 6);
            Assert.Equal(800.0, r.Breakdown.SafetyRecovery, 6);
            Assert.Equal(750.0, r.Breakdown.ScienceData, 6);
            Assert.Equal(300.0, r.Breakdown.Teamwork, 6);
            Assert.Equal(130.0, r.Breakdown.Knowledge, 6);
            Assert.Equal(1.0, r.Breakdown.DifficultyMult);
            Assert.Equal(1.2, r.Breakdown.BoostMult);
            Assert.Equal(9216.0, r.TotalPoints, 6);
            Assert.Equal(9216, r.TotalRounded);
            Assert.Equal("S", r.Grade);
        }

        [Fact]
        public void AppendixAStep15()
        {
            // Appendix A: C1 Earth Watch, Engineer. Primary met, 12/15 targets, $6 M left of $90 M. The design gives no further numbers, so
            // the rest is MODELLED (assumptions): a downlink of 9 GB, a 10 % schedule margin, the minigame tiers of steps 8-14 with one
            // MG-21 Gold flown inside the Golden Window, one Good Call (P2) and one right Predict (P4).
            //   objectives: 3000 + 3 secondaries x 500 (science_targets_10, downlink_8_gb, under_budget all met) + stretch (15 targets) missed = 4500
            //   efficiency: 6/90 x 1000 + 0.10 x 500 = 66.667 + 50 = 116.667
            //   safety: uncrewed, booster and capsule not recovered = 0
            //   science: 12/15 x 1500 = 1200
            //   teamwork: Silver 120 (MG-01) + Gold 200 (MG-07) + Silver 120 (MG-09) + Gold 200 (MG-08) + Bronze 60 (MG-10a) + Gold 200 (MG-15)
            //             + Silver 120 (MG-13) + MG-21 Gold 200 + Gold in Golden Window 2 x 200 + Silver 120 = 1740, plus 1 Good Call x 20 = 1760
            //   knowledge: 1 x 50 = 50
            //   sum = 4500 + 116.667 + 0 + 1200 + 1760 + 50 = 7626.667; x1.0 x1.0 -> 7627 -> grade A (>= 7500), as in the walkthrough.
            var mg = new[]
            {
                new MinigameResult("MG-01", Tier.Silver, false), new MinigameResult("MG-07", Tier.Gold, false),
                new MinigameResult("MG-09", Tier.Silver, false), new MinigameResult("MG-08", Tier.Gold, false),
                new MinigameResult("MG-10a", Tier.Bronze, false), new MinigameResult("MG-15", Tier.Gold, false),
                new MinigameResult("MG-13", Tier.Silver, false), new MinigameResult("MG-21", Tier.Gold, false),
                new MinigameResult("MG-21", Tier.Gold, true), new MinigameResult("MG-21", Tier.Silver, false),
            };
            var r = ScoreCalculator.Compute(C, new ScoreInput
            {
                ContractId = "C1", AssistLevelId = "engineer", Metrics = C1Metrics(targets: 12, downlinkGb: 9, budgetLeftM: 6),
                BudgetRemainingFraction = 6.0 / 90.0, ScheduleMarginFraction = 0.10, ScienceFraction = 12.0 / 15.0,
                Minigames = mg, GoodCalls = 1, CorrectPredictions = 1,
            });
            Assert.Equal(4500.0, r.Breakdown.Objectives, 6);
            Assert.Equal(116.666667, r.Breakdown.Efficiency, 5);
            Assert.Equal(1200.0, r.Breakdown.ScienceData, 6);
            Assert.Equal(1760.0, r.Breakdown.Teamwork, 6);
            Assert.Equal(50.0, r.Breakdown.Knowledge, 6);
            Assert.Equal(7626.666667, r.TotalPoints, 5);
            Assert.Equal(7627, r.TotalRounded);
            Assert.Equal("A", r.Grade);
            Assert.Equal(MissionOutcome.Success, r.Outcome);
            Assert.Equal(new[] { "reach_sso_power_positive", "science_targets_10", "downlink_8_gb", "under_budget", "science_targets_all" },
                r.Objectives.Select(o => o.Id).ToArray());
            Assert.Equal(new[] { true, true, true, true, false }, r.Objectives.Select(o => o.Met).ToArray());
        }

        [Fact]
        public void DifficultyMultipliesTheSum()
        {
            // sum 3000 (primary only): Cadet x0.8 = 2400, Engineer x1.0 = 3000, Flight Director x1.25 = 3750.
            double Total(string level) => ScoreCalculator.Compute(C, new ScoreInput
            {
                ContractId = "C1", AssistLevelId = level,
                Metrics = new Dictionary<string, double> { ["orbit_altitude_km"] = 550, ["inclination_deg"] = 97.6, ["payload_power_balance_W"] = 1 },
            }).TotalPoints;
            Assert.Equal(2400.0, Total("cadet"), 6);
            Assert.Equal(3000.0, Total("engineer"), 6);
            Assert.Equal(3750.0, Total("flight_director"), 6);
        }

        [Fact]
        public void BudgetAndScheduleFractionsClampToZeroOne()
        {
            double Eff(double b, double s) => ScoreCalculator.Compute(C, new ScoreInput { ContractId = "C1", Metrics = C1Metrics(), BudgetRemainingFraction = b, ScheduleMarginFraction = s }).Breakdown.Efficiency;
            Assert.Equal(1500.0, Eff(1.5, 3.0), 6);  // 1.0 x 1000 + 1.0 x 500
            Assert.Equal(0.0, Eff(-0.2, -1.0), 6);
        }

        [Fact]
        public void ScoreBoostMultiplierIsClampedToTheCap()
        {
            var m = new Dictionary<string, double> { ["orbit_altitude_km"] = 550, ["inclination_deg"] = 97.6, ["payload_power_balance_W"] = 1 };
            var r = ScoreCalculator.Compute(C, new ScoreInput { ContractId = "C1", Metrics = m, ScoreBoostMultiplier = 9.0 });
            Assert.Equal(1.5, r.Breakdown.BoostMult);
            Assert.Equal(4500.0, r.TotalPoints, 6); // 3000 x 1.5
        }

        [Fact]
        public void GoldenWindowDoublesMinigamePointsButNotGoodCalls()
        {
            double Teamwork(bool golden) => ScoreCalculator.Compute(C, new ScoreInput
            {
                ContractId = "C1", Metrics = C1Metrics(), GoodCalls = 1,
                Minigames = new[] { new MinigameResult("MG-21", Tier.Gold, golden) },
            }).Breakdown.Teamwork;
            Assert.Equal(220.0, Teamwork(false), 6); // 200 + 20
            Assert.Equal(420.0, Teamwork(true), 6);  // 2 x 200 + 20
        }

        [Fact]
        public void CrewSafePointsOnlyOnCrewedContracts()
        {
            var m = new Dictionary<string, double> { ["orbit_altitude_km"] = 400, ["days_on_orbit"] = 3 };
            double Safety(bool crewed, bool safe, bool lost) => ScoreCalculator.Compute(C, new ScoreInput
            {
                ContractId = "C4", Metrics = m, Crewed = crewed, CrewSafe = safe, CrewLost = lost,
            }).Breakdown.SafetyRecovery;
            Assert.Equal(1000.0, Safety(true, true, false), 6);
            Assert.Equal(0.0, Safety(false, true, false), 6);
            Assert.Equal(0.0, Safety(true, false, false), 6);
            Assert.Equal(0.0, Safety(true, true, true), 6);
        }

        [Fact]
        public void CrewLostCapsTheGradeAtDAndFailsTheMission()
        {
            // 3000 primary + 1000 budget + 500 schedule + 1500 science + 500 booster = 6500: a B, but the crew is lost.
            var r = ScoreCalculator.Compute(C, new ScoreInput
            {
                ContractId = "C4", Crewed = true, CrewLost = true,
                Metrics = new Dictionary<string, double> { ["orbit_altitude_km"] = 400, ["days_on_orbit"] = 3 },
                BudgetRemainingFraction = 1, ScheduleMarginFraction = 1, ScienceFraction = 1, BoosterRecovered = true,
            });
            Assert.Equal(6500.0, r.TotalPoints, 6);
            Assert.Equal("D", r.Grade);
            Assert.Equal(MissionOutcome.Failure, r.Outcome);
        }

        [Theory]
        [InlineData(3999, "D")] [InlineData(4000, "C")] [InlineData(5999, "C")] [InlineData(6000, "B")]
        [InlineData(7499, "B")] [InlineData(7500, "A")] [InlineData(8999, "A")] [InlineData(9000, "S")]
        public void GradeThresholds(double total, string grade) =>
            Assert.Equal(grade, GradeOf(total)); // total = 3000 primary + Good Calls (20 each) + science (1500 x fraction)

        private static string GradeOf(double total)
        {
            // Run the real calculator with a synthetic one-term score: primary met (3000) plus Good Calls (20 each) to reach the total.
            double extra = total - 3000.0;
            int goodCalls = (int)Math.Floor(extra / 20.0);
            double rest = extra - goodCalls * 20.0;
            var r = ScoreCalculator.Compute(C, new ScoreInput
            {
                ContractId = "C1", AssistLevelId = "engineer", GoodCalls = goodCalls,
                CorrectPredictions = 0, ScienceFraction = rest / 1500.0,
                Metrics = new Dictionary<string, double> { ["orbit_altitude_km"] = 550, ["inclination_deg"] = 97.6, ["payload_power_balance_W"] = 1 },
            });
            Assert.Equal(total, r.TotalPoints, 3);
            return r.Grade;
        }

        [Fact]
        public void OutcomePartialWhenOnlyASecondaryIsMet()
        {
            var r = ScoreCalculator.Compute(C, new ScoreInput
            {
                ContractId = "C1",
                Metrics = new Dictionary<string, double> { ["orbit_altitude_km"] = 300, ["budget_remaining_M"] = 3 },
            });
            Assert.Equal(MissionOutcome.Partial, r.Outcome);
            Assert.Equal(500.0, r.Breakdown.Objectives, 6); // one of three secondaries: 1500 / 3
        }

        [Fact]
        public void OutcomeFailureWhenNothingIsMet()
        {
            var r = ScoreCalculator.Compute(C, new ScoreInput { ContractId = "C1" });
            Assert.Equal(MissionOutcome.Failure, r.Outcome);
            Assert.Equal(0.0, r.TotalPoints, 6);
            Assert.Contains("orbit_altitude_km", r.MissingMetrics);
            Assert.Contains("science_targets_captured", r.MissingMetrics);
        }

        [Fact]
        public void SafetyObjectiveIsListedForCrewedContracts()
        {
            var r = ScoreCalculator.Compute(C, new ScoreInput
            {
                ContractId = "C4", Crewed = true, CrewSafe = true,
                Metrics = new Dictionary<string, double> { ["orbit_altitude_km"] = 400, ["days_on_orbit"] = 3 },
            });
            var safety = r.Objectives.Single(o => o.Kind == "SAFETY");
            Assert.True(safety.Met);
            Assert.Equal(1000.0, safety.Points, 6);
        }

        [Fact]
        public void UnknownContractOrAssistLevelThrows()
        {
            Assert.Throws<ArgumentException>(() => ScoreCalculator.Compute(C, new ScoreInput { ContractId = "C99" }));
            Assert.Throws<ArgumentException>(() => ScoreCalculator.Compute(C, new ScoreInput { ContractId = "C1", AssistLevelId = "god" }));
        }

        [Fact]
        public void SameInputsGiveTheSameScore()
        {
            ScoreResult Run() => ScoreCalculator.Compute(C, new ScoreInput { ContractId = "C1", Metrics = C1Metrics(), ScienceFraction = 0.7 });
            Assert.Equal(Run().TotalPoints, Run().TotalPoints);
            Assert.Equal(Run().Grade, Run().Grade);
        }
    }

    public class AwardTests
    {
        private static readonly ScoringCatalog C = ScoringFixture.Catalog;

        private static PlayerStats P(string id, string[] roles, params (string metric, double v)[] stats) =>
            new PlayerStats(id, roles, stats.ToDictionary(s => s.metric, s => s.v));

        private static List<PlayerStats> AppendixAPlayers() => new List<PlayerStats>
        {
            P("p1", new[] { "FLIGHT", "PM" }, ("budget_saved_M", 6), ("good_calls", 1), ("minigame_successes", 4)),
            P("p2", new[] { "BOOSTER", "STRUCT" }, ("good_calls", 3), ("minigame_successes", 4)),
            P("p3", new[] { "GUIDO", "FIDO" }, ("pilot_precision", 0.9), ("minigame_successes", 5)),
            P("p4", new[] { "EECOM", "INCO", "PAYLOAD", "RETRO" }, ("predictions_correct", 1), ("minigame_successes", 2)),
        };

        [Fact]
        public void FourPlayersGetTheAppendixAAwards()
        {
            var r = AwardAssigner.Assign(C, AppendixAPlayers(), 42).ToDictionary(a => a.PlayerId, a => a.AwardIds);
            Assert.Equal(new[] { "budget_hawk" }, r["p1"]);                 // PM with the most saved
            Assert.Equal(new[] { "best_callout" }, r["p2"]);                // most Good Calls (3)
            Assert.Equal(new[] { "steady_hands", "team_player" }, r["p3"]); // best precision, most minigame successes (5)
            Assert.Equal(new[] { "fact_finder" }, r["p4"]);                 // the right Predict
        }

        [Fact]
        public void OnePlayerGetsAtLeastOneAward()
        {
            var r = AwardAssigner.Assign(C, new[] { P("p1", new[] { "FLIGHT", "PM", "BOOSTER" }, ("good_calls", 2)) }, 7);
            Assert.Single(r);
            Assert.NotEmpty(r[0].AwardIds);
            Assert.Contains("best_callout", r[0].AwardIds);
        }

        [Fact]
        public void TenPlayersEveryoneHasAnAwardEvenWithNoStats()
        {
            var players = Enumerable.Range(1, 10).Select(i => P("p" + i, new[] { "R" + i })).ToList();
            var r = AwardAssigner.Assign(C, players, 99);
            Assert.Equal(10, r.Count);
            Assert.All(r, a => Assert.InRange(a.AwardIds.Count, 1, AwardAssigner.MaxAwardsPerPlayer));
            Assert.All(r, a => Assert.Equal(a.AwardIds.Count, a.AwardIds.Distinct().Count()));
        }

        [Fact]
        public void TenPlayersWithSpreadStatsNoOneIsLeftOut()
        {
            var players = Enumerable.Range(1, 10).Select(i =>
                P("p" + i, new[] { i == 1 ? "PM" : "R" + i }, ("good_calls", i % 3), ("minigame_successes", i), ("budget_saved_M", i == 1 ? 4 : 0))).ToList();
            var r = AwardAssigner.Assign(C, players, 5);
            Assert.All(r, a => Assert.NotEmpty(a.AwardIds));
            Assert.Equal("budget_hawk", r.Single(a => a.PlayerId == "p1").AwardIds[0]);
            Assert.Contains("team_player", r.Single(a => a.PlayerId == "p10").AwardIds); // most successes (10)
        }

        [Fact]
        public void TiesResolveDeterministicallyFromTheSeed()
        {
            List<PlayerStats> Tied() => Enumerable.Range(1, 4).Select(i => P("p" + i, new[] { "R" + i }, ("good_calls", 2))).ToList();
            string Winner(ulong seed) => AwardAssigner.Assign(C, Tied(), seed).Single(a => a.AwardIds.Contains("best_callout")).PlayerId;
            Assert.Equal(Winner(11), Winner(11));
            var seen = new HashSet<string>(Enumerable.Range(1, 40).Select(s => Winner((ulong)s)));
            Assert.True(seen.Count > 1, "ties should not always go to the same player");
        }

        [Fact]
        public void SameInputsAndSeedGiveTheSameResult()
        {
            string Dump(ulong seed) => string.Join("|", AwardAssigner.Assign(C, AppendixAPlayers(), seed).Select(a => a.PlayerId + ":" + string.Join(",", a.AwardIds)));
            Assert.Equal(Dump(3), Dump(3));
        }

        [Fact]
        public void ARoleBoundAwardIsSkippedWhenNobodyHoldsTheRole()
        {
            var players = new[] { P("p1", new[] { "FLIGHT" }, ("budget_saved_M", 9)), P("p2", new[] { "BOOSTER" }, ("budget_saved_M", 5)) };
            var r = AwardAssigner.Assign(C, players, 1);
            Assert.DoesNotContain(r, a => a.AwardIds.Contains("budget_hawk"));
            Assert.All(r, a => Assert.NotEmpty(a.AwardIds));
        }

        [Fact]
        public void ConditionAwardsGoToEveryPlayerWhoMeetsThem()
        {
            var players = new[]
            {
                P("p1", new[] { "A" }, ("vetoed_option_would_have_failed", 1)),
                P("p2", new[] { "B" }, ("vetoed_option_would_have_failed", 1)),
                P("p3", new[] { "C" }, ("good_calls", 1)),
            };
            var r = AwardAssigner.Assign(C, players, 1).ToDictionary(a => a.PlayerId, a => a.AwardIds);
            Assert.Contains("veto_visionary", r["p1"]);
            Assert.Contains("veto_visionary", r["p2"]);
            Assert.DoesNotContain("veto_visionary", r["p3"]);
        }

        [Fact]
        public void NoPlayersGivesNoAwards() => Assert.Empty(AwardAssigner.Assign(C, new List<PlayerStats>(), 1));
    }
}
