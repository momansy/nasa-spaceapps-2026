using System;
using System.Linq;
using MissionForge.Core.Build;
using MissionForge.Core.Data;
using MissionForge.Core.Tests.Data;
using Newtonsoft.Json.Linq;
using Xunit;

namespace MissionForge.Core.Tests.Build
{
    /// <summary>T010 step 8: engine-count votes offer only the parts of their own stage.</summary>
    public class EngineCountStageTests
    {
        private static readonly string[] First = { "engcount_first_1", "engcount_first_3", "engcount_first_5", "engcount_first_9" };
        private static readonly string[] Upper = { "engcount_upper_1", "engcount_upper_2" };

        /// <summary>Real catalog where contract C1 lists first AND upper engine-count parts explicitly in both engine-count votes.</summary>
        private static GameCatalog MixedExplicit()
        {
            var files = DesignFixture.Files();
            var root = JObject.Parse(files["contracts.json"]);
            var c1 = root["contracts"]!.First(c => (string)c["id"]! == "C1");
            foreach (var vote in c1["votes"]!.Where(v => (string)v["category"]! == "engine_count"))
                vote["options"] = new JArray(First.Concat(Upper));
            files["contracts.json"] = root.ToString();
            return CatalogLoader.Load(files);
        }

        [Fact]
        public void Loader_autofilled_options_only_hold_parts_of_the_vote_stage()
        {
            var c1 = DesignFixture.Catalog().Contract("C1");
            Assert.Equal(First, c1.VoteFor(Slots.FirstStageEngineCount)!.OptionIds);
            Assert.Equal(Upper, c1.VoteFor(Slots.UpperStageEngineCount)!.OptionIds);
            foreach (var contract in DesignFixture.Catalog().Contracts.Values)
                foreach (var vote in contract.Votes.Where(v => v.Category == PartCategories.EngineCount))
                    foreach (var id in vote.OptionIds)
                        Assert.Equal(vote.Stage, DesignFixture.Catalog().Part(id).Stats.Stage);
        }

        [Fact]
        public void Offered_drops_the_other_stages_parts_from_explicit_lists()
        {
            var cat = MixedExplicit();
            var b = BuildState.New("C1", 1);
            Assert.Equal(6, cat.Contract("C1").VoteFor(Slots.FirstStageEngineCount)!.OptionIds.Count); // the explicit data list is kept as written
            Assert.Equal(First.Take(4), VoteOptions.Offered(b, cat, Slots.FirstStageEngineCount).Select(p => p.Id).Take(4));
            Assert.All(VoteOptions.Offered(b, cat, Slots.FirstStageEngineCount), p => Assert.Equal("first", p.Stats.Stage));
            Assert.Equal(Upper, VoteOptions.Offered(b, cat, Slots.UpperStageEngineCount).Select(p => p.Id));
        }

        [Fact]
        public void Applicable_with_a_slot_checks_the_stage_and_the_old_overload_is_unchanged()
        {
            var cat = DesignFixture.Catalog();
            var b = BuildState.New("C1", 1);
            Assert.True(VoteOptions.Applicable(b, cat, Slots.FirstStageEngineCount, cat.Part("engcount_first_9")));
            Assert.False(VoteOptions.Applicable(b, cat, Slots.FirstStageEngineCount, cat.Part("engcount_upper_2")));
            Assert.False(VoteOptions.Applicable(b, cat, Slots.UpperStageEngineCount, cat.Part("engcount_first_9")));
            Assert.True(VoteOptions.Applicable(b, cat, cat.Part("engcount_upper_2"))); // old signature: no slot, no stage check
        }

        [Fact]
        public void Commit_rejects_a_part_of_the_other_stage_with_ArgumentException()
        {
            var cat = MixedExplicit();
            var b = BuildState.New("C1", 1);
            Assert.Throws<ArgumentException>(() => VoteOptions.Commit(b, cat, Slots.UpperStageEngineCount, "engcount_first_9"));
            Assert.Throws<ArgumentException>(() => VoteOptions.Commit(b, cat, Slots.FirstStageEngineCount, "engcount_upper_1"));
            var ok = VoteOptions.Commit(b, cat, Slots.FirstStageEngineCount, "engcount_first_3");
            Assert.Equal("engcount_first_3", ok.Choice(Slots.FirstStageEngineCount));
        }

        [Fact]
        public void The_fix_search_never_tries_the_other_stages_engine_counts()
        {
            var cat = MixedExplicit();
            var fix = FixSearch.Run(BuildState.New("C1", 1), cat, maxEvaluations: 2000);
            Assert.True(fix.Exists);
            Assert.NotNull(fix.Example);
            Assert.StartsWith("engcount_first", fix.Example!.Choice(Slots.FirstStageEngineCount)!);
            Assert.StartsWith("engcount_upper", fix.Example.Choice(Slots.UpperStageEngineCount)!);
        }
    }
}
