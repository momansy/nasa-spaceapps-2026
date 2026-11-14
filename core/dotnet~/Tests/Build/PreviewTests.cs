using System;
using MissionForge.Core.Build;
using MissionForge.Core.Data;
using Xunit;
using F = MissionForge.Core.Tests.Build.ValidationVoteFixtures;

namespace MissionForge.Core.Tests.Build
{
    public class PreviewTests
    {
        private static GameCatalog Catalog() => F.Catalog(new ContractDef("C1", "Preview", 1000, 9000, 1000, 1000, F.PropulsionVotes()));

        [Fact]
        public void Of_first_stage_tank_gives_hand_computed_deltas()
        {
            // Before: payload 1 000 + Kerolox Vacuum 600 + upper tank S (dry 1 250, prop 25 000) + Workhorse 470
            //   = 28 320 kg; TWR = 850 000 / (28 320 · 9.80665) = 3.06059; Δv = upper only = 7 779.33 m/s
            //   cost = 10 + 3 + 8 = $21 M; days = max lead 70 + integration 5 + 4 + 5 = 84
            // After (+ first tank M): + 280 000 prop + 14 000 dry = 322 320 kg; TWR = 0.26891
            //   first stage Δv = 296.5 · 9.80665 · ln(322 320 / 42 320) = 5 903.40 m/s
            //   cost + $6 M; days: lead 40 < 70 so only integration + 5
            var cat = Catalog();
            var build = F.TwoStage("C1", firstTank: null);
            var p = Preview.Of(build, cat, Slots.FirstStageTank, F.TankM);

            Assert.Equal(Slots.FirstStageTank, p.Category);
            Assert.Equal(F.TankM, p.PartId);
            Assert.Equal(294000, p.Delta.TotalMassKg, 6);
            Assert.Equal(5903.402, p.Delta.TotalDvMps, 3);
            Assert.Equal(0.268913 - 3.060589, p.Delta.LiftoffTwr!.Value, 5);
            Assert.Equal(6, p.Delta.CostM, 9);
            Assert.Equal(5, p.Delta.ScheduleDays, 9);
            Assert.Equal(322320, p.Metrics.TotalMassKg, 6);
        }

        [Fact]
        public void Of_delta_equals_after_minus_before()
        {
            var cat = Catalog();
            var build = F.TwoStage("C1", count: F.Count9, firstTank: F.TankS);
            var before = Dashboard.Compute(build, cat);
            var after = Dashboard.Compute(build.WithChoice(Slots.FirstStageEngine, F.EPumpMini), cat);

            var d = Preview.Of(build, cat, Slots.FirstStageEngine, F.EPumpMini).Delta;
            Assert.Equal(after.TotalDvMps - before.TotalDvMps, d.TotalDvMps, 9);
            Assert.Equal(after.LiftoffTwr!.Value - before.LiftoffTwr!.Value, d.LiftoffTwr!.Value, 12);
            Assert.Equal(after.TotalMassKg - before.TotalMassKg, d.TotalMassKg, 9);
            Assert.Equal(after.CostM - before.CostM, d.CostM, 9);
            Assert.Equal(after.ScheduleDays - before.ScheduleDays, d.ScheduleDays, 9);
            Assert.Equal(after.Success.Success - before.Success.Success, d.Success, 12);
            // 9 engines: 9 · (35 − 470) kg = −3 915 kg; cost 9 · (1 − 8) = −$63 M
            Assert.Equal(-3915, d.TotalMassKg, 6);
            Assert.Equal(-63, d.CostM, 9);
        }

        [Fact]
        public void Of_replaces_an_existing_choice_and_uses_the_slot_stage()
        {
            // One tank option fills either stage: on the upper stage tank M holds 60 t (dry 3 t) instead of tank S's 25 t (dry 1.25 t).
            // Δmass = 63 000 − 26 250 = 36 750 kg
            var cat = Catalog();
            var build = F.TwoStage("C1", count: F.Count9);
            var p = Preview.Of(build, cat, Slots.UpperStageTank, F.TankM);
            Assert.Equal(36750, p.Delta.TotalMassKg, 6);
            Assert.Equal(60000, p.Metrics.Mass.UpperPropellantKg, 6);
        }

        [Fact]
        public void Of_never_changes_the_build()
        {
            var cat = Catalog();
            var build = F.TwoStage("C1", firstTank: null);
            var massBefore = Dashboard.Compute(build, cat).TotalMassKg;

            Preview.Of(build, cat, Slots.FirstStageTank, F.TankM);
            Preview.Of(build, cat, Slots.FirstStageEngine, F.EPumpMini);
            VoteOptions.For(build, cat, Slots.FirstStageTank);

            Assert.False(build.Has(Slots.FirstStageTank));
            Assert.Equal(F.Workhorse, build.Choice(Slots.FirstStageEngine));
            Assert.Equal(3, build.Choices.Count);
            Assert.Equal(0, build.VotesCompleted);
            Assert.Equal(massBefore, Dashboard.Compute(build, cat).TotalMassKg);
        }

        [Theory]
        [InlineData(Slots.FirstStageTank, F.Workhorse)]          // engine into a tank slot
        [InlineData(Slots.FirstStageEngineCount, F.TankM)]       // tank into an engine-count slot
        [InlineData(Slots.UpperStageEngine, F.Workhorse)]        // first-stage engine into the upper-stage slot
        public void Of_rejects_a_part_of_the_wrong_category(string slot, string partId)
        {
            var cat = Catalog();
            Assert.Throws<ArgumentException>(() => Preview.Of(F.TwoStage("C1"), cat, slot, partId));
        }
    }
}
