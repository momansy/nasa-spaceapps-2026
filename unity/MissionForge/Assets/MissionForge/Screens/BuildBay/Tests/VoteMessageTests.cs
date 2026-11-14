using System.Collections.Generic;
using MissionForge.Core.Build;
using MissionForge.Core.Data;
using Newtonsoft.Json.Linq;
using NUnit.Framework;

namespace MissionForge.Screens.BuildBay.Tests
{
    /// <summary>Step 5 of T015: server message › view model mapping, timer arithmetic, host payloads, rehearsal round.</summary>
    public sealed class VoteMessageTests
    {
        private static JObject Opened(string tally = "OPEN", bool solo = false) => JObject.Parse(@"{
            'roundId':'m1.b3', 'kind':'PART', 'subjectId':'first_stage_engine', 'title':{'key':'vote.first_stage_engine.name'},
            'why':null, 'ownerRoles':['BOOSTER'], 'hint':null, 'predict':null,
            'voters':['p1','p2','p3','p4'], 'solo':" + (solo ? "true" : "false") + @", 'vetoAllowed':true, 'tagsAllowed':true,
            'strictMajority':false, 'tallyVisibility':'" + tally + @"', 'audienceVoteWeight':0,
            'plan':[{'stage':'REVEAL','durationMs':3000},{'stage':'INSPECT','durationMs':20000},{'stage':'VOTE','durationMs':20000},{'stage':'RESULT','durationMs':3000}],
            'options':[
              {'id':'eng_a','partId':'eng_a','label':null,'costM':6,'afford':'OK','overBudgetByM':0,'overScheduleByDays':0,'willNotFly':false,'fixExists':false,'warnings':[],
               'deltas':[{'metric':'TOTAL_DV_MS','value':9800,'delta':120,'rating':'GOOD'},{'metric':'COST_M','value':60,'delta':6,'rating':'BAD'}]},
              {'id':'eng_b','partId':'eng_b','label':null,'costM':9,'afford':'EMERGENCY_FUNDING','overBudgetByM':2.5,'overScheduleByDays':4,'willNotFly':false,'fixExists':false,'warnings':[],'deltas':[]},
              {'id':'eng_c','partId':'eng_c','label':null,'costM':3,'afford':'OK','overBudgetByM':0,'overScheduleByDays':0,'willNotFly':true,'fixExists':true,'warnings':[{'key':'validation_rule.twr.explanation'}],'deltas':[]}
            ]}");

        [Test]
        public void Opened_MapsEveryOptionField()
        {
            var m = new VoteRoundModel();
            Assert.That(m.Apply("vote.opened", Opened()), Is.True);
            Assert.That(m.RoundId, Is.EqualTo("m1.b3"));
            Assert.That(m.TitleKey, Is.EqualTo("vote.first_stage_engine.name"));
            Assert.That(m.VoterCount, Is.EqualTo(4));
            Assert.That(m.Options.Count, Is.EqualTo(3));
            OptionState b = m.Option("eng_b");
            Assert.That(b.Afford, Is.EqualTo("EMERGENCY_FUNDING"));
            Assert.That(b.OverBudgetByM, Is.EqualTo(2.5));
            Assert.That(b.OverScheduleByDays, Is.EqualTo(4));
            OptionState c = m.Option("eng_c");
            Assert.That(c.WillNotFly && c.FixExists, Is.True);
            Assert.That(c.WarningKeys, Is.EqualTo(new[] { "validation_rule.twr.explanation" }));
            Assert.That(m.Option("eng_a").Deltas[0].Delta, Is.EqualTo(120));
            Assert.That(m.PlanStages, Is.EqualTo(new[] { "REVEAL", "INSPECT", "VOTE", "RESULT" }));
        }

        [Test]
        public void Messages_ForAnotherRound_AreIgnored()
        {
            var m = new VoteRoundModel();
            m.Apply("vote.opened", Opened());
            Assert.That(m.Apply("vote.stage", JObject.Parse("{'roundId':'other','stage':'VOTE','startedAtMs':1,'endsAtMs':2,'candidateIds':[],'pickerId':null}")), Is.False);
            Assert.That(m.Stage, Is.Null);
        }

        [Test]
        public void Tally_Open_ShowsCountsAndLeader()
        {
            var m = new VoteRoundModel();
            m.Apply("vote.opened", Opened());
            m.Apply("vote.tally", JObject.Parse("{'roundId':'m1.b3','stage':'VOTE','counts':[{'optionId':'eng_a','n':2},{'optionId':'eng_b','n':1},{'optionId':'eng_c','n':0}],'votedIds':['p1','p2','p3'],'audienceCounts':[],'audienceTotal':0,'leadingOptionId':'eng_a'}"));
            Assert.That(m.Option("eng_a").Count, Is.EqualTo(2));
            Assert.That(m.LeadingOptionId, Is.EqualTo("eng_a"));
            Assert.That(m.VotedIds.Count, Is.EqualTo(3));
        }

        [Test]
        public void Tally_Hidden_NeverRevealsCountsOrLeaderUntilResult()
        {
            var m = new VoteRoundModel();
            m.Apply("vote.opened", Opened("HIDDEN"));
            // Even a (non-conforming) server that leaks a leader must not show it while tallies are hidden.
            m.Apply("vote.tally", JObject.Parse("{'roundId':'m1.b3','stage':'VOTE','counts':null,'votedIds':['p1'],'audienceCounts':null,'audienceTotal':0,'leadingOptionId':'eng_a'}"));
            Assert.That(m.TalliesHidden, Is.True);
            Assert.That(m.LeadingOptionId, Is.Null);
            Assert.That(m.Option("eng_a").Count, Is.Null);
            m.Apply("vote.result", JObject.Parse("{'outcomeSeq':4,'roundId':'m1.b3','kind':'PART','subjectId':'first_stage_engine','winnerId':'eng_b','method':'PLURALITY','closedBy':'TIMER','counts':[{'optionId':'eng_a','n':1},{'optionId':'eng_b','n':3},{'optionId':'eng_c','n':0}],'ballots':[],'audienceCounts':[],'audienceBallot':null,'firstRoundCounts':null,'tiedOptionIds':[],'triviaWinnerId':null,'vetoes':[],'emergencyFunding':true}"));
            Assert.That(m.WinnerId, Is.EqualTo("eng_b"));
            Assert.That(m.Option("eng_b").Count, Is.EqualTo(3));
            Assert.That(m.EmergencyFunding, Is.True);
        }

        [Test]
        public void Veto_StrikesTheOptionAndClearsItsTags()
        {
            var m = new VoteRoundModel();
            m.Apply("vote.opened", Opened());
            m.Apply("vote.tags", JObject.Parse("{'roundId':'m1.b3','tags':[{'optionId':'eng_c','playerId':'p2','role':'BOOSTER','tag':'RECOMMENDED'}]}"));
            Assert.That(m.Option("eng_c").Tags.Count, Is.EqualTo(1));
            m.Apply("vote.vetoed", JObject.Parse("{'roundId':'m1.b3','optionId':'eng_c','playerId':'p4','clearedVoterIds':[],'remainingOptionIds':['eng_a','eng_b']}"));
            OptionState c = m.Option("eng_c");
            Assert.That(c.Vetoed, Is.True);
            Assert.That(c.VetoedBy, Is.EqualTo("p4"));
            Assert.That(c.Tags, Is.Empty);
            Assert.That(m.Feed[0].Kind, Is.EqualTo("veto"));
        }

        [Test]
        public void Runoff_And_Tiebreak_NarrowTheCandidates()
        {
            var m = new VoteRoundModel();
            m.Apply("vote.opened", Opened());
            m.Apply("vote.stage", JObject.Parse("{'roundId':'m1.b3','stage':'RUNOFF','startedAtMs':1000,'endsAtMs':11000,'candidateIds':['eng_a','eng_b'],'pickerId':null}"));
            Assert.That(m.Option("eng_c").Candidate, Is.False);
            m.Apply("vote.stage", JObject.Parse("{'roundId':'m1.b3','stage':'TIEBREAK_PICK','startedAtMs':11000,'endsAtMs':16000,'candidateIds':['eng_b'],'pickerId':'p1'}"));
            Assert.That(m.Stage, Is.EqualTo("TIEBREAK_PICK"));
            Assert.That(m.Option("eng_a").Candidate, Is.False);
            Assert.That(m.Option("eng_b").Candidate, Is.True);
        }

        [Test]
        public void PingEvent_UsesTheStringsKeyForEveryPingId()
        {
            var m = new VoteRoundModel();
            m.Apply("vote.opened", Opened());
            var strings = TestCatalog.Catalog.Strings;
            foreach (KeyValuePair<string, string> kv in VoteRoundModel.PingKeys)
            {
                Assert.That(strings.ContainsKey(kv.Value), Is.True, kv.Value);
                m.Apply("ping.event", JObject.Parse("{'playerId':'p2','pingId':'" + kv.Key + "','roundId':'m1.b3','optionId':'eng_a'}"));
                Assert.That(m.Feed[0].Key, Is.EqualTo(kv.Value));
            }
            Assert.That(m.Apply("ping.event", JObject.Parse("{'playerId':'p2','pingId':'AGREED','roundId':'old','optionId':null}")), Is.False);
        }

        [Test]
        public void Cancelled_ClosesTheRound()
        {
            var m = new VoteRoundModel();
            m.Apply("vote.opened", Opened());
            m.Apply("vote.cancelled", JObject.Parse("{'roundId':'m1.b3','reason':'PHASE_CHANGE'}"));
            Assert.That(m.Cancelled, Is.True);
            Assert.That(m.IsOpen, Is.False);
        }

        [Test]
        public void Timer_UsesServerDeadlineAndClockOffset()
        {
            // Local clock 1 000 000 ms; the server is 2 500 ms ahead (clock.pong offset); stage ends at server 1 010 000.
            long serverNow = VoteClock.ServerNowMs(1_000_000, 2500);
            Assert.That(serverNow, Is.EqualTo(1_002_500));
            Assert.That(VoteClock.SecondsLeft(1_010_000, serverNow), Is.EqualTo(8)); // 7.5 s rounds up
            Assert.That(VoteClock.SecondsLeft(1_010_000, 1_010_001), Is.EqualTo(0));
            Assert.That(VoteClock.SecondsLeft(null, serverNow), Is.Null);          // untimed (solo VOTE)
            Assert.That(VoteClock.Progress(1_000_000, 1_010_000, 1_005_000), Is.EqualTo(0.5f).Within(1e-6));
            Assert.That(VoteClock.Progress(0, null, 5), Is.EqualTo(1f));
        }

        [Test]
        public void VoteOpen_CarriesCoresOptionsAndDeltas()
        {
            GameCatalog catalog = TestCatalog.Catalog;
            BuildState build = TestCatalog.C1Small().WithoutChoice(Slots.FirstStageEngine);
            IReadOnlyList<VoteOption> options = VoteOptions.For(build, catalog, Slots.FirstStageEngine);
            JObject open = VoteMessages.Open("m1.b10", Slots.FirstStageEngine, options, 77);
            Assert.That((string)open["kind"], Is.EqualTo("PART"));
            Assert.That(open["defaultOptionId"].Type, Is.EqualTo(JTokenType.Null), "must be null for PART");
            var arr = (JArray)open["options"];
            Assert.That(arr.Count, Is.EqualTo(options.Count));
            for (int i = 0; i < options.Count; i++)
            {
                JToken o = arr[i];
                Assert.That((string)o["partId"], Is.EqualTo(options[i].Part.Id));
                Assert.That((bool)o["willNotFly"], Is.EqualTo(options[i].WillNotFly));
                JToken dv = null;
                foreach (JToken d in (JArray)o["deltas"]) if ((string)d["metric"] == "TOTAL_DV_MS") dv = d;
                Assert.That((double)dv["delta"], Is.EqualTo(options[i].Preview.Delta.TotalDvMps).Within(1e-3));
            }
        }

        [Test]
        public void BuildState_MatchesCoreBudget()
        {
            BuildState build = TestCatalog.C1Small();
            DashboardMetrics m = Dashboard.Compute(build, TestCatalog.Catalog);
            JObject s = VoteMessages.BuildState(build, TestCatalog.Catalog, m);
            Assert.That((double)s["budgetSpentM"], Is.EqualTo(m.Budget.TotalCostM).Within(1e-3));
            Assert.That((double)s["scheduleLimitDays"], Is.EqualTo(m.Budget.DeadlineDays).Within(1e-3));
            Assert.That(((JArray)s["parts"]).Count, Is.GreaterThan(5));
        }

        [Test]
        public void Rehearsal_RunsARoundToAResultThroughTheSameHandler()
        {
            long clock = 1_000_000;
            var channel = new RehearsalVoteChannel(TestCatalog.Seed, 1f, () => clock);
            var model = new VoteRoundModel();
            var types = new List<string>();
            channel.Received += (t, d) => { types.Add(t); model.Apply(t, d); };
            BuildState build = TestCatalog.C1Small().WithoutChoice(Slots.FirstStageEngine);
            IReadOnlyList<VoteOption> options = VoteOptions.For(build, TestCatalog.Catalog, Slots.FirstStageEngine);
            channel.Send("vote.open", VoteMessages.Open("m1.r1", Slots.FirstStageEngine, options, 5));
            for (int i = 0; i < 400 && model.Stage != "CLOSED"; i++)
            {
                clock += 100;
                channel.Tick();
            }
            Assert.That(model.WinnerId, Is.Not.Null);
            Assert.That(model.Stage, Is.EqualTo("CLOSED"));
            Assert.That(types, Does.Contain("vote.tally").And.Contain("vote.stage").And.Contain("ping.event").And.Contain("vote.result"));
            bool winnable = false;
            foreach (VoteOption o in options) if (o.Part.Id == model.WinnerId) winnable = o.CanWin || (o.WillNotFly && o.Fix != null && o.Fix.Exists);
            Assert.That(winnable, Is.True, "rehearsal winner must be a winnable option");
        }
    }
}
