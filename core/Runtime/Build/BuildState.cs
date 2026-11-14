#nullable enable
using System;
using System.Collections.Generic;

namespace MissionForge.Core.Build
{
    /// <summary>Kind of a non-part money or schedule movement recorded in the build ledger.</summary>
    public enum LedgerKind
    {
        /// <summary>An optional test (6.6).</summary>
        Test,
        /// <summary>Fixing a flaw revealed by a test (6.5).</summary>
        FlawFix,
        /// <summary>An anomaly card being drawn (its on-draw effect) or a response to it (6.8).</summary>
        Anomaly,
        /// <summary>A design-review rework (6.9).</summary>
        Rework,
        /// <summary>A change of the budget (budget cut, emergency funding).</summary>
        Budget,
    }

    /// <summary>
    /// One ledger line: money spent ($M, game), schedule days added (game) and budget change ($M).
    /// Immutable.
    /// </summary>
    public sealed class LedgerEntry
    {
        /// <summary>Creates a ledger entry.</summary>
        public LedgerEntry(LedgerKind kind, string sourceId, double costM, double days, double budgetDeltaM = 0,
            string? category = null, double massKg = 0, double leadDays = 0)
        {
            LeadDays = leadDays;
            Kind = kind;
            SourceId = sourceId ?? "";
            CostM = costM;
            Days = days;
            BudgetDeltaM = budgetDeltaM;
            Category = category;
            MassKg = massKg;
        }

        /// <summary>
        /// Procurement days added to the lead time of <see cref="Category"/>'s part (Supplier Delay). Unlike
        /// <see cref="Days"/>, these only move the launch date if that part is on the critical path.
        /// </summary>
        public double LeadDays { get; }

        /// <summary>Mass added to the payload stack, kg (e.g. switched pressurant).</summary>
        public double MassKg { get; }

        /// <summary>What kind of movement this is.</summary>
        public LedgerKind Kind { get; }
        /// <summary>ID of the test, card, response or review that caused it (e.g. <c>test_engine_hot_fire</c>, <c>anom_supplier_delay/expedite</c>).</summary>
        public string SourceId { get; }
        /// <summary>Money spent, $M (game). Negative is a refund.</summary>
        public double CostM { get; }
        /// <summary>Serial schedule days added (game). Negative recovers days.</summary>
        public double Days { get; }
        /// <summary>Change of the available budget, $M (game).</summary>
        public double BudgetDeltaM { get; }
        /// <summary>Category the entry targets, or null.</summary>
        public string? Category { get; }

        /// <inheritdoc />
        public override string ToString() => $"{Kind}:{SourceId} {CostM:0.##}M {Days:0.#}d";
    }

    /// <summary>
    /// Mutable-looking but immutable per-category reliability state built up by tests, anomaly
    /// responses and reviews. Reset when the part in the category is replaced.
    /// </summary>
    public sealed class PartCondition
    {
        /// <summary>The untouched condition of a newly chosen part.</summary>
        public static readonly PartCondition Fresh = new PartCondition(1.0, 0.0, false, false, 0, Array.Empty<string>(), 0.0);

        /// <summary>Creates a condition.</summary>
        public PartCondition(double bandScale, double reliabilityDelta, bool flawRevealed, bool flawFixed, int testsRun,
            IReadOnlyList<string> testIds, double dvBonusFraction)
        {
            BandScale = bandScale;
            ReliabilityDelta = reliabilityDelta;
            FlawRevealed = flawRevealed;
            FlawFixed = flawFixed;
            TestsRun = testsRun;
            TestIds = testIds;
            DvBonusFraction = dvBonusFraction;
        }

        /// <summary>Product of all band scales from tests (1 = untested, 0.5 = band halved).</summary>
        public double BandScale { get; }
        /// <summary>Sum of reliability changes from tests and responses, fraction.</summary>
        public double ReliabilityDelta { get; }
        /// <summary>A test revealed the hidden flaw of this part.</summary>
        public bool FlawRevealed { get; }
        /// <summary>The revealed flaw was fixed.</summary>
        public bool FlawFixed { get; }
        /// <summary>Number of tests run on this part (used as the seeded-roll index).</summary>
        public int TestsRun { get; }
        /// <summary>IDs of tests run on this part.</summary>
        public IReadOnlyList<string> TestIds { get; }
        /// <summary>Δv bonus of this engine as a fraction of its stage Δv (Engineering Breakthrough).</summary>
        public double DvBonusFraction { get; }

        /// <summary>Returns a copy with the given changes.</summary>
        public PartCondition With(double? bandScale = null, double? reliabilityDelta = null, bool? flawRevealed = null,
            bool? flawFixed = null, int? testsRun = null, IReadOnlyList<string>? testIds = null, double? dvBonusFraction = null) =>
            new PartCondition(bandScale ?? BandScale, reliabilityDelta ?? ReliabilityDelta, flawRevealed ?? FlawRevealed,
                flawFixed ?? FlawFixed, testsRun ?? TestsRun, testIds ?? TestIds, dvBonusFraction ?? DvBonusFraction);

        /// <summary>True when the given test has been run on this part.</summary>
        public bool HasTest(string testId)
        {
            for (int i = 0; i < TestIds.Count; i++) if (TestIds[i] == testId) return true;
            return false;
        }
    }

    /// <summary>
    /// The vehicle under construction for one contract. Immutable: every <c>With…</c> method returns a
    /// new state, so a preview (<see cref="Preview"/>) never mutates the real build.
    /// </summary>
    public sealed class BuildState
    {
        private static readonly IReadOnlyDictionary<string, string> NoChoices = new Dictionary<string, string>();
        private static readonly IReadOnlyDictionary<string, PartCondition> NoConditions = new Dictionary<string, PartCondition>();

        private BuildState(string contractId, ulong seed, IReadOnlyDictionary<string, string> choices,
            IReadOnlyDictionary<string, PartCondition> conditions, IReadOnlyList<LedgerEntry> ledger,
            IReadOnlyCollection<string> flags, IReadOnlyList<string> anomaliesDrawn, int votesCompleted,
            int votesSinceAnomaly, string? reopenedCategory)
        {
            ContractId = contractId;
            Seed = seed;
            Choices = choices;
            Conditions = conditions;
            Ledger = ledger;
            Flags = flags;
            AnomaliesDrawn = anomaliesDrawn;
            VotesCompleted = votesCompleted;
            VotesSinceAnomaly = votesSinceAnomaly;
            ReopenedCategory = reopenedCategory;
        }

        /// <summary>Starts an empty build for a contract with the session seed (design 17.6).</summary>
        public static BuildState New(string contractId, ulong seed) =>
            new BuildState(contractId ?? throw new ArgumentNullException(nameof(contractId)), seed, NoChoices, NoConditions,
                Array.Empty<LedgerEntry>(), Array.Empty<string>(), Array.Empty<string>(), 0, 0, null);

        /// <summary>Contract being built for.</summary>
        public string ContractId { get; }
        /// <summary>Session seed; every random draw in the build derives from it.</summary>
        public ulong Seed { get; }
        /// <summary>Chosen part ID per category.</summary>
        public IReadOnlyDictionary<string, string> Choices { get; }
        /// <summary>Test and anomaly condition per category.</summary>
        public IReadOnlyDictionary<string, PartCondition> Conditions { get; }
        /// <summary>Tests, fixes, anomalies, reworks and budget changes, in order.</summary>
        public IReadOnlyList<LedgerEntry> Ledger { get; }
        /// <summary>Build flags, e.g. <c>emergency_funding_used</c>, <c>risk_cleared:pogo</c>, <c>guaranteed_alarm_minigame</c>.</summary>
        public IReadOnlyCollection<string> Flags { get; }
        /// <summary>Anomaly card IDs drawn so far, in order.</summary>
        public IReadOnlyList<string> AnomaliesDrawn { get; }
        /// <summary>Number of part votes resolved so far.</summary>
        public int VotesCompleted { get; }
        /// <summary>Number of part votes resolved since the last anomaly card.</summary>
        public int VotesSinceAnomaly { get; }
        /// <summary>A category reopened by a review rework or an anomaly response that must be re-voted, or null.</summary>
        public string? ReopenedCategory { get; }

        /// <summary>Part chosen in a category, or null.</summary>
        public string? Choice(string category) => Choices.TryGetValue(category, out var id) ? id : null;

        /// <summary>True when the category has been decided.</summary>
        public bool Has(string category) => Choices.ContainsKey(category);

        /// <summary>Condition of the part in a category (fresh when none recorded).</summary>
        public PartCondition Condition(string category) =>
            Conditions.TryGetValue(category, out var c) ? c : PartCondition.Fresh;

        /// <summary>True when a flag is set.</summary>
        public bool HasFlag(string flag)
        {
            foreach (var f in Flags) if (f == flag) return true;
            return false;
        }

        /// <summary>
        /// Returns a build with <paramref name="partId"/> chosen in <paramref name="category"/>. Replacing a part
        /// resets its test condition. Does not count as a resolved vote (see <see cref="WithVoteResolved"/>).
        /// </summary>
        public BuildState WithChoice(string category, string partId)
        {
            var choices = new Dictionary<string, string>(Choices.Count + 1);
            foreach (var kv in Choices) choices[kv.Key] = kv.Value;
            var replaced = choices.TryGetValue(category, out var old) && old != partId;
            choices[category] = partId;
            var conditions = Conditions;
            if (replaced && Conditions.ContainsKey(category))
            {
                var c = new Dictionary<string, PartCondition>(Conditions);
                c.Remove(category);
                conditions = c;
            }
            var reopened = ReopenedCategory == category ? null : ReopenedCategory;
            return new BuildState(ContractId, Seed, choices, conditions, Ledger, Flags, AnomaliesDrawn, VotesCompleted,
                VotesSinceAnomaly, reopened);
        }

        /// <summary>Returns a build with a category removed (undecided).</summary>
        public BuildState WithoutChoice(string category)
        {
            if (!Choices.ContainsKey(category)) return this;
            var choices = new Dictionary<string, string>(Choices);
            choices.Remove(category);
            var c = new Dictionary<string, PartCondition>(Conditions);
            c.Remove(category);
            return new BuildState(ContractId, Seed, choices, c, Ledger, Flags, AnomaliesDrawn, VotesCompleted,
                VotesSinceAnomaly, ReopenedCategory);
        }

        /// <summary>Chooses a part and counts it as a resolved vote (advances the anomaly counter).</summary>
        public BuildState WithVoteResolved(string category, string partId)
        {
            var b = WithChoice(category, partId);
            return new BuildState(b.ContractId, b.Seed, b.Choices, b.Conditions, b.Ledger, b.Flags, b.AnomaliesDrawn,
                b.VotesCompleted + 1, b.VotesSinceAnomaly + 1, b.ReopenedCategory);
        }

        /// <summary>Returns a build with a ledger line appended.</summary>
        public BuildState WithLedger(LedgerEntry entry)
        {
            var l = new List<LedgerEntry>(Ledger.Count + 1);
            l.AddRange(Ledger);
            l.Add(entry ?? throw new ArgumentNullException(nameof(entry)));
            return new BuildState(ContractId, Seed, Choices, Conditions, l, Flags, AnomaliesDrawn, VotesCompleted,
                VotesSinceAnomaly, ReopenedCategory);
        }

        /// <summary>Returns a build with the condition of a category replaced.</summary>
        public BuildState WithCondition(string category, PartCondition condition)
        {
            var c = new Dictionary<string, PartCondition>(Conditions);
            c[category] = condition ?? throw new ArgumentNullException(nameof(condition));
            return new BuildState(ContractId, Seed, Choices, c, Ledger, Flags, AnomaliesDrawn, VotesCompleted,
                VotesSinceAnomaly, ReopenedCategory);
        }

        /// <summary>Returns a build with a flag set.</summary>
        public BuildState WithFlag(string flag)
        {
            if (HasFlag(flag)) return this;
            var f = new List<string>(Flags) { flag };
            return new BuildState(ContractId, Seed, Choices, Conditions, Ledger, f, AnomaliesDrawn, VotesCompleted,
                VotesSinceAnomaly, ReopenedCategory);
        }

        /// <summary>Returns a build with a drawn anomaly card recorded and the vote counter reset.</summary>
        public BuildState WithAnomalyDrawn(string anomalyId)
        {
            var a = new List<string>(AnomaliesDrawn) { anomalyId };
            return new BuildState(ContractId, Seed, Choices, Conditions, Ledger, Flags, a, VotesCompleted, 0, ReopenedCategory);
        }

        /// <summary>Returns a build in which a category must be re-voted (rework, part swap).</summary>
        public BuildState WithReopened(string? category) =>
            new BuildState(ContractId, Seed, Choices, Conditions, Ledger, Flags, AnomaliesDrawn, VotesCompleted,
                VotesSinceAnomaly, category);
    }
}
