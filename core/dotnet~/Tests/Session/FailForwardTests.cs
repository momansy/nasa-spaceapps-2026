using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using MissionForge.Core.Build;
using MissionForge.Core.Data;
using MissionForge.Core.Scoring;
using MissionForge.Core.Session;
using MissionForge.Core.Tests.Data;
using MissionForge.Core.Tests.Scoring;
using Newtonsoft.Json.Linq;
using Xunit;

namespace MissionForge.Core.Tests.Session
{
    /// <summary>Design 9.9 fail forward: investigation setup, lesson cards and the retry pre-fill.</summary>
    public class FailForwardTests
    {
        private static string[] SchemaFailureModes()
        {
            var path = Path.Combine(ScoringFixture.DataDir, "schema", "common.schema.json");
            var root = JObject.Parse(File.ReadAllText(path));
            return root["$defs"]!["failure_mode"]!["enum"]!.Select(t => (string)t!).ToArray();
        }

        private static string[] TelemetryChannels()
        {
            var path = Path.Combine(ScoringFixture.DataDir, "..", "protocol", "schema", "console.telemetry.schema.json");
            var root = JObject.Parse(File.ReadAllText(path));
            return ((JObject)root["$defs"]!["TelemetryValues"]!["properties"]!).Properties().Select(p => p.Name).ToArray();
        }

        // ------------------------------------------------------------------ failure modes

        [Fact]
        public void FailureModes_AreTheFourteenOfTheSchema()
        {
            var schema = SchemaFailureModes();
            Assert.Equal(14, schema.Length);
            Assert.Equal(schema.OrderBy(x => x, StringComparer.Ordinal), FailureModes.All.OrderBy(x => x, StringComparer.Ordinal));
            foreach (var m in schema) Assert.True(FailureModes.IsKnown(m));
            Assert.False(FailureModes.IsKnown("gremlins"));
        }

        [Fact]
        public void ClueChannels_AreRealTelemetryChannels_ThreeEach()
        {
            var channels = new HashSet<string>(TelemetryChannels());
            foreach (var m in FailureModes.All)
            {
                var clues = FailureModes.ClueChannels(m);
                Assert.Equal(3, clues.Count);
                Assert.Equal(3, clues.Distinct().Count());
                foreach (var c in clues) Assert.Contains(c, channels);
            }
        }

        // ------------------------------------------------------------------ investigation

        [Fact]
        public void Investigation_HasRootCause_ThreeDistinctDistractors_AndItsClues()
        {
            var inv = Investigation.Open("pogo_oscillation", FlightPhaseId.F4, "first_stage_engine", 2026UL);
            Assert.Equal("pogo_oscillation", inv.RootCauseId);
            Assert.Equal(3, inv.DistractorIds.Count);
            Assert.Equal(3, inv.DistractorIds.Distinct().Count());
            Assert.DoesNotContain("pogo_oscillation", inv.DistractorIds);
            foreach (var d in inv.DistractorIds) Assert.True(FailureModes.IsKnown(d));
            Assert.Equal(new[] { "vibration_pct", "chamber_pressure_pct", "g_load" }, inv.ClueChannelIds);
            Assert.Equal(4, inv.OptionIds.Count);
            Assert.Equal(inv.DistractorIds.Concat(new[] { "pogo_oscillation" }).OrderBy(x => x), inv.OptionIds.OrderBy(x => x));
            Assert.Equal(FlightPhaseId.F4, inv.FlightPhase);
            Assert.Equal("first_stage_engine", inv.Slot);
            foreach (var c in inv.DecoyChannelIds) Assert.DoesNotContain(c, inv.ClueChannelIds);
        }

        [Fact]
        public void Investigation_IsDeterministicFromTheSeed_AndVariesWithIt()
        {
            string Sig(Investigation i) => string.Join(",", i.DistractorIds) + "|" + string.Join(",", i.OptionIds);
            Assert.Equal(Sig(Investigation.Open("structural_failure", FlightPhaseId.F5, "structural_material", 7UL)),
                Sig(Investigation.Open("structural_failure", FlightPhaseId.F5, "structural_material", 7UL)));
            var seen = new HashSet<string>();
            for (ulong s = 1; s <= 30; s++) seen.Add(Sig(Investigation.Open("structural_failure", FlightPhaseId.F5, "structural_material", s)));
            Assert.True(seen.Count > 5, "different seeds should give different distractors and option orders");
        }

        [Fact]
        public void Investigation_EveryModeCanBeOpened_RootIsAlwaysAnOption()
        {
            foreach (var m in FailureModes.All)
                for (ulong s = 1; s <= 5; s++)
                {
                    var inv = Investigation.Open(m, FlightPhaseId.F3, "avionics", s);
                    Assert.Contains(m, inv.OptionIds);
                    Assert.DoesNotContain(m, inv.DistractorIds);
                }
        }

        [Fact]
        public void Investigation_BadInputs_Throw()
        {
            Assert.Throws<ArgumentException>(() => Investigation.Open("gremlins", FlightPhaseId.F3, "avionics", 1));
            Assert.Throws<ArgumentException>(() => Investigation.Open("pogo_oscillation", FlightPhaseId.F3, "", 1));
        }

        // ------------------------------------------------------------------ lessons

        [Fact]
        public void Lessons_CoverAllFourteenModes_WithTheRightIds()
        {
            foreach (var m in SchemaFailureModes())
            {
                var card = LessonsLearned.For(m);
                Assert.Equal("lesson_" + m, card.Id);
                Assert.Equal(m, card.FailureModeId);
                Assert.Equal("risk_cleared:" + m, card.Effects[0].Flag);   // the pogo example: risk removed for free
                Assert.Equal(LessonEffectKind.BuildFlag, card.Effects[0].Kind);
            }
            Assert.Equal(14, LessonsLearned.All().Count);
            Assert.Throws<ArgumentException>(() => LessonsLearned.For("gremlins"));
        }

        [Fact]
        public void Lessons_FreeTestsAndBoostsExistInTheData()
        {
            var game = DesignFixture.Catalog();
            var scoring = ScoringFixture.Catalog();
            foreach (var card in LessonsLearned.All())
                foreach (var e in card.Effects)
                {
                    if (e.Kind == LessonEffectKind.FreeTest) Assert.True(game.Tests.ContainsKey(e.TestId!), card.Id + ": test " + e.TestId);
                    if (e.Kind == LessonEffectKind.Boost)
                    {
                        var rule = scoring.Boost(e.BoostId!);
                        Assert.NotNull(rule);
                        Assert.True(rule!.ValueByTier.ContainsKey(e.BoostTierId!), card.Id + ": tier " + e.BoostTierId);
                    }
                }
        }

        [Fact]
        public void Lesson_Flags_UseTheBuildPrefixes()
        {
            var pogo = LessonsLearned.For("pogo_oscillation");
            Assert.Equal(new[] { "risk_cleared:pogo_oscillation", "free_test:pogo_suppression_test" }, pogo.BuildFlags());
            var heat = LessonsLearned.For("heat_shield_burn_through");
            Assert.Equal(new[] { "risk_cleared:heat_shield_burn_through", "free_test:arc_jet_test", "lesson_boost:heat_margin:bronze" }, heat.BuildFlags());
            Assert.StartsWith(TestCampaign.RiskClearedPrefix, pogo.Effects[0].Flag);
        }

        [Fact]
        public void SoftwareOverflowLesson_AlsoClearsTheSoftwareFaultRiskTheAnomalyRulesRead()
        {
            // Build/Anomalies.cs reads risk_cleared:software_fault, the tests clear the failure-mode ID: the lesson sets both.
            var flags = LessonsLearned.For("software_overflow").BuildFlags();
            Assert.Contains("risk_cleared:software_overflow", flags);
            Assert.Contains("risk_cleared:software_fault", flags);
        }

        // ------------------------------------------------------------------ retry

        private static BuildState Failed(GameCatalog catalog)
        {
            var b = BuildState.New("C1", 100UL);
            var pick = new[]
            {
                (Slots.FirstStageEngine, catalog.PartsInOrder.First(p => p.Category == PartCategories.FirstStageEngine).Id),
                (Slots.UpperStageEngine, catalog.PartsInOrder.First(p => p.Category == PartCategories.UpperStageEngine).Id),
                (Slots.Avionics, catalog.PartsInOrder.First(p => p.Category == PartCategories.Avionics).Id),
            };
            foreach (var (slot, part) in pick) b = b.WithChoice(slot, part);
            b = b.WithFlag("emergency_funding_used").WithFlag("risk_cleared:combustion_instability");
            return b.WithLedger(new LedgerEntry(LedgerKind.Test, "engine_hot_fire", 3, 7));
        }

        [Fact]
        public void Retry_KeepsEveryChoiceButTheFailedSlot_AndStartsAFreshLedger()
        {
            var catalog = DesignFixture.Catalog();
            var prev = Failed(catalog);
            var lesson = LessonsLearned.For("engine_shutdown");
            var next = Retry.Prefill(prev, catalog, lesson, Slots.FirstStageEngine, 777UL);

            Assert.Equal("C1", next.ContractId);
            Assert.Equal(777UL, next.Seed);
            Assert.False(next.Has(Slots.FirstStageEngine));
            Assert.Equal(prev.Choice(Slots.UpperStageEngine), next.Choice(Slots.UpperStageEngine));
            Assert.Equal(prev.Choice(Slots.Avionics), next.Choice(Slots.Avionics));
            Assert.Equal(2, next.Choices.Count);
            Assert.Empty(next.Ledger);                       // same budget: the contract budget, no carried spending
            Assert.False(next.HasFlag("emergency_funding_used"));
            Assert.True(next.HasFlag("retry"));
            Assert.True(next.HasFlag("lesson:lesson_engine_shutdown"));
            Assert.True(next.HasFlag("risk_cleared:engine_shutdown"));
            Assert.True(next.HasFlag("free_test:engine_hot_fire"));
            // the failed attempt is untouched
            Assert.True(prev.Has(Slots.FirstStageEngine));
            Assert.Equal(100UL, prev.Seed);
        }

        [Fact]
        public void Retry_BudgetEqualsTheContractBudget_ForTheKeptDesign()
        {
            // The dashboard budget is contract budget + ledger deltas; with no ledger it is the contract budget.
            var catalog = DesignFixture.Catalog();
            var next = Retry.Prefill(Failed(catalog), catalog, null, Slots.FirstStageEngine, 5UL);
            Assert.Empty(next.Ledger);
            var delta = next.Ledger.Sum(l => l.BudgetDeltaM);
            Assert.Equal(0.0, delta);
            Assert.True(catalog.Contract("C1").BudgetM > 0);
        }

        [Fact]
        public void Retry_WithoutLesson_SetsOnlyTheRetryFlag()
        {
            var catalog = DesignFixture.Catalog();
            var next = Retry.Prefill(Failed(catalog), catalog, null, Slots.Avionics, 9UL);
            Assert.Equal(new[] { "retry" }, next.Flags);
            Assert.False(next.Has(Slots.Avionics));
            Assert.Equal(2, next.Choices.Count);
        }

        [Fact]
        public void Retry_FailedSlotNotChosen_KeepsEverything()
        {
            var catalog = DesignFixture.Catalog();
            var prev = Failed(catalog);
            var next = Retry.Prefill(prev, catalog, null, Slots.HeatShield, 9UL);
            Assert.Equal(prev.Choices.Count, next.Choices.Count);
        }

        [Fact]
        public void Retry_IsDeterministic()
        {
            var catalog = DesignFixture.Catalog();
            var prev = Failed(catalog);
            var a = Retry.Prefill(prev, catalog, LessonsLearned.For("guidance_drift"), Slots.Navigation, 31UL);
            var b = Retry.Prefill(prev, catalog, LessonsLearned.For("guidance_drift"), Slots.Navigation, 31UL);
            Assert.Equal(a.Choices.OrderBy(k => k.Key).Select(k => k.Key + "=" + k.Value), b.Choices.OrderBy(k => k.Key).Select(k => k.Key + "=" + k.Value));
            Assert.Equal(a.Flags, b.Flags);
        }

        [Fact]
        public void Retry_UnknownContract_Throws()
        {
            var catalog = DesignFixture.Catalog();
            Assert.Throws<CatalogException>(() => Retry.Prefill(BuildState.New("C99", 1UL), catalog, null, Slots.Avionics, 1UL));
        }
    }
}
