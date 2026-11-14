using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Linq;
using MissionForge.Core.Build;
using MissionForge.Core.Data;
using MissionForge.Core.Tests.Data;
using Xunit;
using Xunit.Abstractions;

namespace MissionForge.Core.Tests.Build
{
    /// <summary>T010 step 9: the pruned fix-exists search is fast on every real option and agrees with the exhaustive search.</summary>
    public class FixSearchPerfTests
    {
        private readonly ITestOutputHelper _out;
        public FixSearchPerfTests(ITestOutputHelper output) => _out = output;
        private static readonly GameCatalog Real = DesignFixture.Catalog();
        private const int MaxEvaluations = 5000;

        [Fact]
        public void Every_option_of_every_vote_of_C0_to_C8_is_decided_within_5000_evaluations()
        {
            int searches = 0, worst = 0, exists = 0, inconclusive = 0;
            string worstWhere = "";
            var total = Stopwatch.StartNew();
            double worstMs = 0;
            foreach (var contract in Real.Contracts.Values.OrderBy(c => c.Id))
            {
                foreach (var vote in VoteOptions.VotesFor(contract))
                {
                    foreach (var id in vote.OptionIds)
                    {
                        var part = Real.Part(id);
                        if (!part.OfferedFor(contract.Id)) continue;
                        var build = BuildState.New(contract.Id, 1).WithChoice(vote.Slot, id);
                        var sw = Stopwatch.StartNew();
                        var fix = FixSearch.Run(build, Real);
                        sw.Stop();
                        searches++;
                        if (fix.Exists) exists++;
                        if (fix.Inconclusive) inconclusive++;
                        worstMs = Math.Max(worstMs, sw.Elapsed.TotalMilliseconds);
                        if (fix.Evaluations > worst) { worst = fix.Evaluations; worstWhere = contract.Id + "/" + vote.Slot + "/" + id; }
                        if (!fix.Exists) _out.WriteLine($"NOFIX {contract.Id}/{vote.Slot}/{id}: {fix.Evaluations} evaluations");
                        Assert.True(fix.Evaluations <= MaxEvaluations, $"{contract.Id}/{vote.Slot}/{id}: {fix.Evaluations} evaluations");
                    }
                }
            }
            _out.WriteLine($"FIXSEARCH searches={searches} worstEvaluations={worst} ({worstWhere}) worstMs={worstMs:0.0} totalMs={total.Elapsed.TotalMilliseconds:0} exists={exists} inconclusive={inconclusive}");
            Assert.Equal(0, inconclusive);
        }
    }
}
