using System;
using System.Collections.Generic;
using System.Linq;
using MissionForge.Core.Build;
using MissionForge.Core.Data;
using MissionForge.Core.Tests.Data;
using Xunit;
using Xunit.Abstractions;

namespace MissionForge.Core.Tests.Build
{
    /// <summary>T010 step 9 correctness: the pruned <see cref="FixSearch.Run"/> decides exactly what the exhaustive search decides.</summary>
    public class FixSearchEquivalenceTests
    {
        private readonly ITestOutputHelper _out;
        public FixSearchEquivalenceTests(ITestOutputHelper output) => _out = output;
        private static readonly GameCatalog Real = DesignFixture.Catalog();
        private const int LargeCap = 150_000; // a few seconds per exhaustive search

        private static readonly string[] Coupled =
        {
            Slots.LaunchSite, Slots.PayloadInstrument, Slots.PayloadPower, Slots.PayloadAttitude, Slots.Fairing, Slots.AeroControl,
            Slots.UpperStageEngine, Slots.UpperStageEngineCount, Slots.UpperStageTank, Slots.StageSeparation,
            Slots.FirstStageEngine, Slots.FirstStageEngineCount, Slots.FirstStageTank, Slots.StructuralMaterial,
            Slots.StrapOnBoosters, Slots.BoosterRecovery,
        };

        [Theory]
        [InlineData("C0")]
        [InlineData("C1")]
        public void From_an_empty_build_every_single_choice_gets_the_same_answer(string contractId)
        {
            var contract = Real.Contract(contractId);
            int compared = 0, skipped = 0;
            foreach (var vote in VoteOptions.VotesFor(contract))
                foreach (var id in vote.OptionIds)
                {
                    var build = BuildState.New(contractId, 1).WithChoice(vote.Slot, id);
                    var fast = FixSearch.Run(build, Real);
                    Assert.False(fast.Inconclusive);
                    var slow = FixSearch.RunExhaustive(build, Real, LargeCap);
                    if (slow.Inconclusive) { skipped++; continue; } // the old search gave up: it only guessed "true"
                    Assert.True(slow.Exists == fast.Exists, $"{contractId}/{vote.Slot}/{id}: exhaustive {slow.Exists}, pruned {fast.Exists}");
                    if (fast.Exists) AssertFlyable(fast.Example!);
                    compared++;
                }
            _out.WriteLine($"EQUIV {contractId} from empty: compared={compared} skipped(old search capped)={skipped}");
            Assert.True(compared > 0);
        }

        [Theory]
        [InlineData("C0", 3)]
        [InlineData("C1", 7)]
        public void Random_partial_builds_get_the_same_answer_including_the_ones_without_a_fix(string contractId, int seed)
        {
            var contract = Real.Contract(contractId);
            var rnd = new System.Random(seed); // test code only: picks which votes stay open
            int compared = 0, noFix = 0;
            for (int trial = 0; trial < 120; trial++)
            {
                // Decide all coupled votes at random except 3 to 5 of them, which stay open for the search.
                var open = new HashSet<string>(Coupled.OrderBy(_ => rnd.Next()).Take(3 + rnd.Next(3)));
                var build = BuildState.New(contractId, 1);
                foreach (var vote in VoteOptions.VotesFor(contract))
                {
                    if (!Coupled.Contains(vote.Slot) || open.Contains(vote.Slot)) continue;
                    var options = vote.OptionIds.Where(i => Real.Part(i).OfferedFor(contractId)).ToList();
                    if (options.Count > 0) build = build.WithChoice(vote.Slot, options[rnd.Next(options.Count)]);
                }
                var slow = FixSearch.RunExhaustive(build, Real, LargeCap);
                if (slow.Inconclusive) continue;
                var fast = FixSearch.Run(build, Real);
                Assert.False(fast.Inconclusive);
                Assert.True(slow.Exists == fast.Exists, $"trial {trial}: exhaustive {slow.Exists}, pruned {fast.Exists}: {string.Join(", ", build.Choices)}");
                if (fast.Exists) AssertFlyable(fast.Example!);
                if (!fast.Exists) noFix++;
                compared++;
            }
            _out.WriteLine($"EQUIV {contractId} random builds: compared={compared} withoutFix={noFix}");
            Assert.True(compared >= 50);
            Assert.True(noFix > 0, "the sample must contain builds without a fix, or the test proves nothing");
        }

        private static void AssertFlyable(BuildState example)
        {
            var v = new Vehicle(example, Real);
            Assert.False(Validator.HasBlocker(Validator.Validate(v, Dashboard.ComputeFlightCore(v), Real, ValidationMode.Complete)));
        }
    }
}
