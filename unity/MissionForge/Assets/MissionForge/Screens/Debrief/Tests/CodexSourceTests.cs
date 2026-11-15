using System.Collections.Generic;
using System.IO;
using System.Linq;
using MissionForge.Core.Session;
using MissionForge.EndScreens.Sources;
using NUnit.Framework;

namespace MissionForge.EndScreens.Tests
{
    public sealed class CodexSourceTests
    {
        private static string Links => File.ReadAllText(Path.Combine(EndTestData.ScreensFolder, "Codex", "Data", "codex_links.json"));
        private static CodexUnlocks Rehearsal => CodexSource.ParseUnlocks(EndTestData.Fixture("Codex", "codex_rehearsal"));

        private static CodexSource Build(CodexUnlocks unlocks = null) => new CodexSource(EndTestData.Data.JsonByPath, Links, unlocks ?? Rehearsal, true);

        [Test]
        public void Synthesis_FillsEveryCategory()
        {
            CodexSource codex = Build();

            Assert.That(codex.FromData, Is.False, "data/codex.json does not exist yet; entries are synthesised");
            Assert.That(codex.In(CodexCategory.Physics).Count(), Is.EqualTo(10), "the ten rows of design 8.3");
            Assert.That(codex.In(CodexCategory.Lessons).Count(), Is.EqualTo(FailureModes.All.Count));
            Assert.That(codex.In(CodexCategory.Milestones).Count(), Is.EqualTo(5));
            Assert.That(codex.In(CodexCategory.Minigames).Count(), Is.GreaterThanOrEqualTo(30));
            Assert.That(codex.In(CodexCategory.Parts).Count(), Is.GreaterThan(50));
            Assert.That(codex.In(CodexCategory.Facts).Count(), Is.EqualTo(codex.Facts.Shown.Count));
            Assert.That(codex.Entries.Select(e => e.Id).Distinct().Count(), Is.EqualTo(codex.Entries.Count), "ids are unique");
        }

        [Test]
        public void PhysicsEntries_AlwaysOpen_AndSayWhatTheGameSimplifies()
        {
            foreach (CodexEntryView e in Build(new CodexUnlocks()).In(CodexCategory.Physics))
            {
                Assert.That(e.Unlocked, Is.True, e.Id);
                Assert.That(e.SimplificationKey, Does.StartWith("ui.host.codex.simplification."), e.Id);
            }
        }

        [Test]
        public void Unlocks_FollowTheFixture()
        {
            CodexSource codex = Build();

            Assert.That(codex.Find("part.eng_kerolox_workhorse").Unlocked, Is.True);
            Assert.That(codex.Find("part.eng_kerolox_giant").Unlocked, Is.False);
            Assert.That(codex.Find("fact.F01").Unlocked, Is.True);
            Assert.That(codex.Find("fact.F40").Unlocked, Is.False);
            Assert.That(codex.Find(CodexSource.LessonId("pogo_oscillation")).Unlocked, Is.True);
            Assert.That(codex.Find(CodexSource.LessonId("cryogenic_leak")).Unlocked, Is.False);
            Assert.That(codex.Find("milestone.first_orbit").Unlocked, Is.True);
            Assert.That(codex.Find("milestone.first_crew").Unlocked, Is.False);
            Assert.That(codex.Find("minigame.MG-28").Unlocked, Is.True);
        }

        [Test]
        public void ADebrief_UnlocksItsFactsMinigamesAndFailureMode()
        {
            var unlocks = new CodexUnlocks();
            unlocks.AddDebrief(EndTestData.Debrief("c1_failure_pogo"));
            CodexSource codex = Build(unlocks);

            Assert.That(codex.Find("fact.F07").Unlocked, Is.True);
            Assert.That(codex.Find("minigame.MG-08").Unlocked, Is.True);
            Assert.That(codex.Find(CodexSource.LessonId("pogo_oscillation")).Unlocked, Is.True);
            Assert.That(codex.Find("part.eng_kerolox_workhorse").Unlocked, Is.False);
        }

        [Test]
        public void PogoLesson_CitesItsRealWorldParallel()
        {
            CodexEntryView lesson = Build().Find(CodexSource.LessonId("pogo_oscillation"));

            Assert.That(lesson.Facts.Select(f => f.Id), Is.EqualTo(new[] { "F07" }));
            Assert.That(lesson.BodyArgKeys, Is.EqualTo(new[] { "ui.host.debrief.failure_mode.pogo_oscillation", "test.pogo_suppression_test.name" }));
        }

        [Test]
        public void EnginePart_HasThrustWithExactImperialConversion()
        {
            CodexEntryView part = Build().Find("part.eng_kerolox_workhorse");
            CodexStat thrust = part.Stats.First(s => s.NameKey == "ui.host.codex.stat.thrust_sl");

            Assert.That(thrust.SiUnit, Is.EqualTo("kN"));
            Assert.That(thrust.Imperial / thrust.Si, Is.EqualTo(224.80894387).Within(1e-6), "1 kN = 224.809 lbf");
            Assert.That(part.SubtitleKey, Is.EqualTo("part.eng_kerolox_workhorse.twin"));
            Assert.That(part.DrawbackKeys.Count, Is.GreaterThan(0));
        }

        [Test]
        public void CodexFile_WhenPresent_IsReadAndRejectedFactsDropped()
        {
            var files = new Dictionary<string, string>(EndTestData.Data.JsonByPath.ToDictionary(k => k.Key, v => v.Value))
            {
                ["facts.json"] = "{\"facts\":[{\"id\":\"F01\",\"status\":\"verified\"},{\"id\":\"F02\",\"status\":\"rejected\"},{\"id\":\"F03\",\"status\":\"unverified\"}]}",
                ["codex.json"] = "{\"entries\":[" +
                    "{\"id\":\"orbits\",\"kind\":\"physics\",\"title_key\":\"a.b\",\"simplification_key\":\"c.d\",\"facts\":[\"F01\",\"F02\"],\"unlock\":{\"kind\":\"always\"}}," +
                    "{\"id\":\"challenger\",\"kind\":\"history\",\"title_key\":\"e.f\",\"sensitive\":true,\"facts\":[\"F03\"],\"unlock\":{\"kind\":\"fact_seen\"}}]}",
            };
            var unlocks = new CodexUnlocks();
            unlocks.Facts.Add("F03");

            var codex = new CodexSource(files, Links, unlocks, false);

            Assert.That(codex.FromData, Is.True);
            Assert.That(codex.Entries.Count, Is.EqualTo(2));
            Assert.That(codex.Find("orbits").Facts.Select(f => f.Id), Is.EqualTo(new[] { "F01" }));
            Assert.That(codex.Find("challenger").Sensitive, Is.True);
            Assert.That(codex.Find("challenger").Unlocked, Is.True);
            Assert.That(codex.Find("challenger").Facts.Single().NeedsBadge, Is.True);
            Assert.That(codex.Find("challenger").Category, Is.EqualTo(CodexCategory.Facts));
        }

        [Test]
        public void EveryCodexStringKeyExists()
        {
            var keys = new HashSet<string>();
            foreach (var path in EndTestData.Data.JsonByPath.Keys.Where(k => k.StartsWith("strings/en")))
            {
                foreach (var p in Newtonsoft.Json.Linq.JObject.Parse(EndTestData.Data.JsonByPath[path]).Properties()) keys.Add(p.Name);
            }
            foreach (CodexEntryView e in Build().Entries)
            {
                Assert.That(keys.Contains(e.TitleKey), Is.True, e.Id + " title " + e.TitleKey);
                if (e.BodyKey != null) Assert.That(keys.Contains(e.BodyKey), Is.True, e.Id + " body " + e.BodyKey);
                if (e.SimplificationKey != null) Assert.That(keys.Contains(e.SimplificationKey), Is.True, e.Id);
                if (e.SubtitleKey != null) Assert.That(keys.Contains(e.SubtitleKey), Is.True, e.Id + " subtitle " + e.SubtitleKey);
                foreach (string k in e.BodyArgKeys) Assert.That(keys.Contains(k), Is.True, e.Id + " arg " + k);
                foreach (CodexStat s in e.Stats) Assert.That(keys.Contains(s.NameKey), Is.True, e.Id + " stat " + s.NameKey);
                Assert.That(keys.Contains(e.UnlockHintKey), Is.True, e.Id + " hint " + e.UnlockHintKey);
            }
        }
    }
}
