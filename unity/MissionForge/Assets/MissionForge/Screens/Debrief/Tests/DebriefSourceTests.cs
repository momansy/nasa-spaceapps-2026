using System.Collections.Generic;
using System.Linq;
using MissionForge.Core.Scoring;
using MissionForge.EndScreens.Sources;
using NUnit.Framework;

namespace MissionForge.EndScreens.Tests
{
    /// <summary>
    /// Debrief fixtures map to the expected view models, and the Core adapter gives exactly the breakdown of
    /// <see cref="ScoreCalculator.Compute"/>. Expected totals are worked by hand from design 11.3 and data/scoring.json
    /// (all game values).
    /// </summary>
    public sealed class DebriefSourceTests
    {
        [Test]
        public void C1Success_MapsToGradeAWithEveryTerm()
        {
            DebriefView v = EndTestData.Debrief("c1_success");

            // Objectives 3000 + 3 × 500 = 4500; efficiency 0.18 × 1000 + 0.2 × 500 = 280; science 0.8 × 1500 = 1200;
            // teamwork 200 + 120 + 250 + 4 × 20 = 650; knowledge 3 × 50 + 30 = 180 → 6810 × 1.0 × 1.2 = 8172.
            Assert.That(v.Terms.Select(t => t.Points), Is.EqualTo(new[] { 4500.0, 280.0, 0.0, 1200.0, 650.0, 180.0 }).Within(1e-6));
            Assert.That(v.Subtotal, Is.EqualTo(6810.0).Within(1e-6));
            Assert.That(v.DifficultyMult, Is.EqualTo(1.0).Within(1e-9));
            Assert.That(v.BoostMult, Is.EqualTo(1.2).Within(1e-9));
            Assert.That(v.Total, Is.EqualTo(8172));
            Assert.That(v.Grade, Is.EqualTo("A"));
            Assert.That(v.GradeTitleKey, Is.EqualTo("grade.A.title"));
            Assert.That(v.Outcome, Is.EqualTo("Success"));
            Assert.That(v.Failure, Is.Null);
            Assert.That(v.RetryAvailable, Is.False);
            Assert.That(v.IsRehearsal, Is.True);
            Assert.That(v.KpEarned, Is.EqualTo(9));
            Assert.That(v.Objectives.Count(o => o.Met), Is.EqualTo(4));
            Assert.That(v.Objectives.Single(o => o.Kind == "PRIMARY").TextKey, Is.EqualTo("contract.C1.objective.primary"));
            Assert.That(v.ContractNameKey, Is.EqualTo("contract.C1.name"));
            Assert.That(v.Facts.Select(f => f.Id), Is.EqualTo(new[] { "F02", "F04", "F05", "F11", "F16" }));
        }

        [Test]
        public void C1Failure_IsAFailureWithRetryAndTheFailurePoint()
        {
            DebriefView v = EndTestData.Debrief("c1_failure_pogo");

            // Objectives 0 (primary and every secondary missed); efficiency 280; teamwork 200 + 60 + 2 × 20 = 300;
            // knowledge 2 × 50 = 100 → 680 × 1.0 × 1.0 = 680 → D.
            Assert.That(v.Total, Is.EqualTo(680));
            Assert.That(v.Grade, Is.EqualTo("D"));
            Assert.That(v.Outcome, Is.EqualTo("Failure"));
            Assert.That(v.Failure, Is.Not.Null);
            Assert.That(v.Failure.FailureModeId, Is.EqualTo("pogo_oscillation"));
            Assert.That(v.Failure.FlightPhaseId, Is.EqualTo("F4"));
            Assert.That(v.Failure.AtS, Is.EqualTo(74.2).Within(1e-9));
            Assert.That(v.RetryAvailable, Is.True);
            Assert.That(v.Timeline.Last().Kind, Is.EqualTo(TimelineKind.Failure));
        }

        [Test]
        public void C3CrewedPartial_PaysCrewSafeAndCapsule()
        {
            DebriefView v = EndTestData.Debrief("c3_crewed_partial");

            // Objectives 1500 (both secondaries); efficiency 50 + 50 = 100; safety 1000 + 300 = 1300; science 600;
            // teamwork 200 + 2 × 120 (golden) + 200 + 60 + 6 × 20 = 820; knowledge 200 → 4520 × 1.25 × 1.1 = 6215 → B.
            Assert.That(v.Terms.Select(t => t.Points), Is.EqualTo(new[] { 1500.0, 100.0, 1300.0, 600.0, 820.0, 200.0 }).Within(1e-6));
            Assert.That(v.Total, Is.EqualTo(6215));
            Assert.That(v.Grade, Is.EqualTo("B"));
            Assert.That(v.Outcome, Is.EqualTo("Partial"));
            Assert.That(v.Crewed, Is.True);
            Assert.That(v.CapsuleRecovered, Is.True);
            Assert.That(v.Failure, Is.Null);
        }

        [Test]
        public void TenPlayers_EveryPlayerGetsAPositiveAward()
        {
            DebriefView v = EndTestData.Debrief("ten_players");
            var positive = new HashSet<string>(EndTestData.Adapter.Scoring.Awards.Select(a => a.Id));

            Assert.That(v.Players.Count, Is.EqualTo(10));
            Assert.That(v.Awards.Count, Is.EqualTo(10));
            foreach (PlayerAwardsView pa in v.Awards)
            {
                Assert.That(pa.AwardIds.Count, Is.GreaterThanOrEqualTo(1), pa.Player.Id + " has no award");
                Assert.That(pa.AwardIds.All(positive.Contains), Is.True, pa.Player.Id + " has an award not in awards.json");
            }
        }

        [TestCase("c1_success")]
        [TestCase("c1_failure_pogo")]
        [TestCase("c3_crewed_partial")]
        [TestCase("ten_players")]
        public void CoreAdapter_MatchesScoreCalculatorForTheSameInput(string fixture)
        {
            var source = new FixtureDebriefSource(EndTestData.Adapter, EndTestData.Fixture("Debrief", fixture));
            DebriefView v = source.Load();
            ScoreResult direct = ScoreCalculator.Compute(EndTestData.Adapter.Scoring, source.Record.Input);

            Assert.That(v.Terms[0].Points, Is.EqualTo(direct.Breakdown.Objectives));
            Assert.That(v.Terms[1].Points, Is.EqualTo(direct.Breakdown.Efficiency));
            Assert.That(v.Terms[2].Points, Is.EqualTo(direct.Breakdown.SafetyRecovery));
            Assert.That(v.Terms[3].Points, Is.EqualTo(direct.Breakdown.ScienceData));
            Assert.That(v.Terms[4].Points, Is.EqualTo(direct.Breakdown.Teamwork));
            Assert.That(v.Terms[5].Points, Is.EqualTo(direct.Breakdown.Knowledge));
            Assert.That(v.DifficultyMult, Is.EqualTo(direct.Breakdown.DifficultyMult));
            Assert.That(v.BoostMult, Is.EqualTo(direct.Breakdown.BoostMult));
            Assert.That(v.Total, Is.EqualTo(direct.TotalRounded));
            Assert.That(v.Grade, Is.EqualTo(direct.Grade));
            Assert.That(v.Outcome, Is.EqualTo(direct.Outcome.ToString()));
            Assert.That(v.Objectives.Select(o => o.Met), Is.EqualTo(direct.Objectives.Select(o => o.Met)));
        }

        [Test]
        public void Facts_RejectedNeverShown_UnverifiedCarriesBadge()
        {
            const string facts = "{\"facts\":[" +
                "{\"id\":\"F01\",\"status\":\"verified\",\"source_url\":\"https://a\"}," +
                "{\"id\":\"F02\",\"status\":\"rejected\",\"source_url\":\"https://b\"}," +
                "{\"id\":\"F03\",\"status\":\"unverified\",\"source_url\":\"https://c\"}]}";
            FactCatalog catalog = FactCatalog.Parse(facts);

            IReadOnlyList<FactView> shown = catalog.Showable(new[] { "F01", "F02", "F03", "F99", "F01" });

            Assert.That(shown.Select(f => f.Id), Is.EqualTo(new[] { "F01", "F03" }));
            Assert.That(shown[0].NeedsBadge, Is.False);
            Assert.That(shown[1].NeedsBadge, Is.True);
            Assert.That(shown[1].SourceKey, Is.EqualTo("fact.F03.source"));
            Assert.That(catalog.Find("F02"), Is.Null);
            Assert.That(catalog.Shown.Select(f => f.Id), Is.EqualTo(new[] { "F01", "F03" }));
        }

        [Test]
        public void EveryRepositoryFactShownHasASourceUrl()
        {
            foreach (FactView f in EndTestData.Adapter.Facts.Shown)
            {
                Assert.That(f.SourceUrl, Does.StartWith("https://"), f.Id);
                Assert.That(f.Status, Is.Not.EqualTo(FactStatus.Rejected), f.Id);
            }
        }

        [Test]
        public void MalformedFixture_FailsWithTheFieldName()
        {
            var e = Assert.Throws<System.FormatException>(() => DebriefRecord.Parse("{\"seed\":\"1\"}"));
            StringAssert.Contains("contractId", e.Message);
        }

        [Test]
        public void EveryFixtureStringKeyExists()
        {
            DebriefView v = EndTestData.Debrief("c1_failure_pogo");
            var keys = new HashSet<string>();
            foreach (var path in EndTestData.Data.JsonByPath.Keys.Where(k => k.StartsWith("strings/en")))
            {
                foreach (var p in Newtonsoft.Json.Linq.JObject.Parse(EndTestData.Data.JsonByPath[path]).Properties()) keys.Add(p.Name);
            }
            foreach (string fixture in new[] { "c1_success", "c1_failure_pogo", "c3_crewed_partial", "ten_players" })
            {
                foreach (TimelineEventView e in EndTestData.Debrief(fixture).Timeline)
                {
                    Assert.That(keys.Contains(e.LabelKey), Is.True, fixture + ": " + e.LabelKey);
                }
            }
            Assert.That(keys.Contains("ui.host.debrief.failure_mode." + v.Failure.FailureModeId), Is.True);
        }
    }
}
