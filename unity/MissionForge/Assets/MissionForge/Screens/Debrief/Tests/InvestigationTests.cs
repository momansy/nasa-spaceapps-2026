using System.IO;
using System.Linq;
using MissionForge.Core.Scoring;
using MissionForge.Core.Session;
using MissionForge.EndScreens.Investigation;
using Newtonsoft.Json.Linq;
using CoreInvestigation = MissionForge.Core.Session.Investigation;
using NUnit.Framework;

namespace MissionForge.EndScreens.Tests
{
    public sealed class InvestigationTests
    {
        private static readonly string[] Players = { "p1", "p2", "p3" };
        private static ClueTable _table;

        private static ClueTable Table => _table ??= ClueTable.Parse(File.ReadAllText(
            Path.Combine(EndTestData.ScreensFolder, "Debrief", "Investigation", "Data", "investigation_clues.json")));

        private static InvestigationSetup Setup() => InvestigationSetup.ForFailure(Table, "pogo_oscillation", "F4", "first_stage_engine", 4022UL, Players);

        private static InvestigationState Do(InvestigationSetup s, InvestigationState st, string p, int n, string a, params double[] x)
        {
            ActionOutcome o = InvestigationReducer.Apply(s, st, p, n, a, x, out InvestigationState next);
            Assert.That(o, Is.EqualTo(ActionOutcome.Applied), p + " " + a);
            return next;
        }

        /// <summary>The player holding clue index <paramref name="clueIndex"/>.</summary>
        private static string Owner(InvestigationSetup s, int clueIndex) => s.PlayerIds[s.OwnerSlot(clueIndex)];

        [Test]
        public void ClueTable_MirrorsTheClientContract()
        {
            Assert.That(Table.FailureModes, Is.EqualTo(FailureModes.All), "same order as common.schema.json and clues.ts");
            Assert.That(Table.Clues.Count, Is.EqualTo(66));
            Assert.That(Table.Herrings.Count, Is.EqualTo(8));
            for (int m = 0; m < 14; m++) Assert.That(Table.ChainOf(m).Count, Is.InRange(3, 5), Table.FailureModes[m]);
        }

        [Test]
        public void Setup_FollowsCoreAndTheContract()
        {
            InvestigationSetup s = Setup();
            InvestigationCase c = CoreInvestigation.Open("pogo_oscillation", "F4", "first_stage_engine", 4022UL);
            JObject p = s.Params();

            Assert.That(s.OptionIds, Is.EqualTo(c.OptionIds));
            Assert.That(((JArray)p["cause_options"]).Count, Is.EqualTo(4));
            Assert.That(s.OptionIds[(int)p["cause_correct"]], Is.EqualTo("pogo_oscillation"));
            Assert.That((int)p["chain_len"], Is.EqualTo(Table.ChainOf(Table.ModeIndex("pogo_oscillation")).Count));
            int clueCount = ((JArray)p["clues"]).Count;
            Assert.That(clueCount, Is.EqualTo(s.ChainLen + 3 * InvestigationSetup.CardsPerDistractor + InvestigationSetup.Herrings));
            Assert.That(clueCount, Is.InRange(2, 40));
            Assert.That(s.Clues.Distinct().Count(), Is.EqualTo(clueCount));
            JArray assignments = s.Assignments();
            Assert.That(assignments.Count, Is.EqualTo(3));
            Assert.That(assignments.SelectMany(a => a["params"]["cards"]).Count(), Is.EqualTo(clueCount), "every card dealt once");
            Assert.That((int)assignments[1]["params"]["slot"], Is.EqualTo(1));
            JObject start = s.MgStart("m1.mg28", 7u, 1000, 45000, "ENGINEER");
            Assert.That((string)start["type"], Is.EqualTo("COOP_SPLIT"));
            Assert.That(start["flightPhase"].Type, Is.EqualTo(JTokenType.Null));
        }

        [Test]
        public void Setup_IsDeterministicFromTheSeed()
        {
            Assert.That(Setup().Clues, Is.EqualTo(Setup().Clues));
        }

        [Test]
        public void Place_PutsACardOnTheChain_AndMovingItLeavesNoCopy()
        {
            InvestigationSetup s = Setup();
            InvestigationState st = InvestigationReducer.Start(s);
            int card = s.TrueChain[0];
            string owner = Owner(s, card);

            st = Do(s, st, owner, 1, "place", card, 0);
            Assert.That(st.Chain[0], Is.EqualTo(card));
            st = Do(s, st, owner, 2, "place", card, 1);
            Assert.That(st.Chain[0], Is.EqualTo(-1));
            Assert.That(st.Chain[1], Is.EqualTo(card));
            Assert.That(st.StateN, Is.EqualTo(2));
            Assert.That((JArray)InvestigationReducer.Shared(st)["chain"], Has.Count.EqualTo(s.ChainLen));
        }

        [Test]
        public void Place_OthersCardsAndBadArguments_AreRejected()
        {
            InvestigationSetup s = Setup();
            InvestigationState st = InvestigationReducer.Start(s);
            int card = s.TrueChain[0];
            string notOwner = s.PlayerIds.First(p => p != Owner(s, card));

            Assert.That(InvestigationReducer.Apply(s, st, notOwner, 1, "place", new double[] { card, 0 }, out InvestigationState a), Is.EqualTo(ActionOutcome.NotOwner));
            Assert.That(a.Chain.All(c => c == -1), Is.True);
            Assert.That(InvestigationReducer.Apply(s, st, "p1", 1, "place", new double[] { 999, 0 }, out _), Is.EqualTo(ActionOutcome.Invalid));
            Assert.That(InvestigationReducer.Apply(s, st, "p1", 1, "place", new double[] { 0, s.ChainLen }, out _), Is.EqualTo(ActionOutcome.Invalid));
            Assert.That(InvestigationReducer.Apply(s, st, "p1", 1, "place", new double[] { 0.5, 0 }, out _), Is.EqualTo(ActionOutcome.Invalid));
            Assert.That(InvestigationReducer.Apply(s, st, "p1", 1, "launch", new double[] { 0 }, out _), Is.EqualTo(ActionOutcome.Invalid));
            Assert.That(InvestigationReducer.Apply(s, st, "p9", 1, "vote", new double[] { 0 }, out _), Is.EqualTo(ActionOutcome.Invalid));
        }

        [Test]
        public void Clear_EmptiesAPlace()
        {
            InvestigationSetup s = Setup();
            int card = s.TrueChain[1];
            string owner = Owner(s, card);
            InvestigationState st = Do(s, InvestigationReducer.Start(s), owner, 1, "place", card, 1);
            string other = s.PlayerIds.First(p => p != owner);

            st = Do(s, st, other, 1, "clear", 1);

            Assert.That(st.Chain[1], Is.EqualTo(-1));
        }

        [Test]
        public void Vote_CountsOnePerPlayer_AndCanChange()
        {
            InvestigationSetup s = Setup();
            InvestigationState st = InvestigationReducer.Start(s);
            st = Do(s, st, "p1", 1, "vote", 2);
            st = Do(s, st, "p2", 1, "vote", 2);
            st = Do(s, st, "p1", 2, "vote", 0);

            Assert.That(st.VoteCounts, Is.EqualTo(new[] { 1, 0, 1, 0 }));
            Assert.That(InvestigationReducer.EveryoneVoted(s, st), Is.False);
            Assert.That(InvestigationReducer.Apply(s, st, "p3", 1, "vote", new double[] { 4 }, out _), Is.EqualTo(ActionOutcome.Invalid));
            st = Do(s, st, "p3", 1, "vote", 0);
            Assert.That(InvestigationReducer.EveryoneVoted(s, st), Is.True);
            Assert.That(InvestigationReducer.Leading(st), Is.EqualTo(0));
        }

        [Test]
        public void StaleCounters_AreIgnored_EvenAfterAnInvalidAction()
        {
            InvestigationSetup s = Setup();
            InvestigationState st = Do(s, InvestigationReducer.Start(s), "p1", 5, "vote", 1);

            Assert.That(InvestigationReducer.Apply(s, st, "p1", 5, "vote", new double[] { 2 }, out InvestigationState same), Is.EqualTo(ActionOutcome.Stale));
            Assert.That(InvestigationReducer.Apply(s, st, "p1", 3, "vote", new double[] { 2 }, out _), Is.EqualTo(ActionOutcome.Stale));
            Assert.That(same.Votes["p1"], Is.EqualTo(1));
            InvestigationReducer.Apply(s, st, "p1", 6, "bogus", new double[0], out InvestigationState afterBad);
            Assert.That(InvestigationReducer.Apply(s, afterBad, "p1", 6, "vote", new double[] { 2 }, out _), Is.EqualTo(ActionOutcome.Stale));
            Assert.That(InvestigationReducer.Apply(s, st, "p2", 1, "vote", new double[] { 2 }, out _), Is.EqualTo(ActionOutcome.Applied), "counters are per player");
        }

        [Test]
        public void Lock_FreezesTheBoard()
        {
            InvestigationSetup s = Setup();
            InvestigationState st = Do(s, InvestigationReducer.Start(s), "p1", 1, "vote", 1);
            InvestigationState locked = InvestigationReducer.Lock(st);

            Assert.That(locked.Locked, Is.True);
            Assert.That((bool)InvestigationReducer.Shared(locked)["locked"], Is.True);
            Assert.That(InvestigationReducer.Apply(s, locked, "p2", 1, "vote", new double[] { 2 }, out InvestigationState after), Is.EqualTo(ActionOutcome.Locked));
            Assert.That(after.Votes.ContainsKey("p2"), Is.False);
            Assert.That(InvestigationReducer.Lock(locked).StateN, Is.EqualTo(locked.StateN), "locking twice changes nothing");
        }

        [Test]
        public void Results_AndSummary_UseCoreTiers()
        {
            InvestigationSetup s = Setup();
            InvestigationState st = InvestigationReducer.Start(s);
            for (int place = 0; place < s.ChainLen; place++)
            {
                int card = s.TrueChain[place];
                string owner = Owner(s, card);
                st = Do(s, st, owner, (st.LastN.TryGetValue(owner, out int n) ? n : 0) + 1, "place", card, place);
            }
            foreach (string p in s.PlayerIds) st = Do(s, st, p, (st.LastN.TryGetValue(p, out int n) ? n : 0) + 1, "vote", s.CauseCorrect);
            st = InvestigationReducer.Lock(st);
            ScoringCatalog catalog = EndTestData.Adapter.Scoring;

            InvestigationResult r = InvestigationReducer.Results(s, st);
            JObject summary = InvestigationReducer.Summary(catalog, s, st, "m1.mg28");

            Assert.That(r.Succeeded, Is.EqualTo(Players));
            Assert.That(r.Perfect, Is.EqualTo(Players), "every true-chain card on its place, nothing else on the chain");
            TierResult expected = Tiers.Compute(catalog, 3, 3, 3);
            Assert.That((string)summary["tier"], Is.EqualTo(Tiers.Id(expected.Tier).ToUpperInvariant()));
            Assert.That((int)summary["points"], Is.EqualTo((int)catalog.TermPoints("teamwork", "minigame_" + Tiers.Id(expected.Tier))));
            Assert.That((int)summary["active"], Is.EqualTo(3));
            Assert.That(((JArray)summary["boosts"]).Count, Is.EqualTo(0));
        }
    }
}
