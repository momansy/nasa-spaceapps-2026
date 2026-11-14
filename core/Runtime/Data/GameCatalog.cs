#nullable enable
using System;
using System.Collections.Generic;

namespace MissionForge.Core.Data
{
    /// <summary>Raised when catalog data is malformed or refers to an ID that does not exist.</summary>
    public sealed class CatalogException : Exception
    {
        /// <summary>Creates the exception with a message that names the file and the bad reference.</summary>
        public CatalogException(string message) : base(message) { }
        /// <summary>Creates the exception wrapping a parse error.</summary>
        public CatalogException(string message, Exception inner) : base(message, inner) { }
    }

    /// <summary>
    /// The typed, cross-referenced game content used by the build rules. Immutable after loading.
    /// Build it with <see cref="CatalogLoader.Load"/> from JSON text, or directly in tests.
    /// </summary>
    public sealed class GameCatalog
    {
        private readonly Dictionary<string, PartDef> _parts;
        private readonly Dictionary<string, ContractDef> _contracts;
        private readonly Dictionary<string, TestDef> _tests;
        private readonly Dictionary<string, AnomalyDef> _anomalies;
        private readonly Dictionary<string, RoleDef> _roles;
        private readonly Dictionary<string, BoostDef> _boosts;
        private readonly Dictionary<string, ValidationRuleDef> _rules;

        /// <summary>Creates a catalog and checks every cross-reference.</summary>
        /// <exception cref="CatalogException">A duplicate ID or a reference to an unknown ID.</exception>
        public GameCatalog(
            IEnumerable<PartDef> parts,
            IEnumerable<ContractDef> contracts,
            IEnumerable<TestDef>? tests = null,
            IEnumerable<AnomalyDef>? anomalies = null,
            IEnumerable<RoleDef>? roles = null,
            IEnumerable<BoostDef>? boosts = null,
            IEnumerable<ValidationRuleDef>? validationRules = null)
        {
            _partOrder.AddRange(parts ?? throw new ArgumentNullException(nameof(parts)));
            _parts = Index(_partOrder, p => p.Id, "part");
            _contracts = Index(contracts, c => c.Id, "contract");
            _tests = Index(tests ?? Array.Empty<TestDef>(), t => t.Id, "test");
            _anomalies = Index(anomalies ?? Array.Empty<AnomalyDef>(), a => a.Id, "anomaly");
            _roles = Index(roles ?? Array.Empty<RoleDef>(), r => r.Id, "role");
            _boosts = Index(boosts ?? Array.Empty<BoostDef>(), b => b.Id, "boost");
            _rules = Index(validationRules ?? Array.Empty<ValidationRuleDef>(), r => r.Id, "validation rule");
            CheckReferences();
        }

        /// <summary>
        /// Tank structural ratio by propellant family from data (design 7.9), dimensionless; empty when data
        /// gives none (Core then uses its own game-value table).
        /// </summary>
        public IReadOnlyDictionary<string, double> StructuralRatios { get; internal set; } = new Dictionary<string, double>();

        /// <summary>Votes after the last anomaly card before a new card may be drawn (data <c>draw.min_votes_between</c>), or null.</summary>
        public int? AnomalyMinVotesBetween { get; internal set; }

        /// <summary>Votes after the last anomaly card when a card is always drawn (data <c>draw.max_votes_between</c>), or null.</summary>
        public int? AnomalyMaxVotesBetween { get; internal set; }

        /// <summary>English (or other language) strings by key, merged from <c>strings/&lt;lang&gt;*.json</c>; empty when not loaded.</summary>
        public IReadOnlyDictionary<string, string> Strings { get; internal set; } = new Dictionary<string, string>();

        /// <summary>Non-fatal problems found while loading (lenient mode), e.g. options that refer to parts not written yet.</summary>
        public IReadOnlyList<string> Warnings { get; internal set; } = Array.Empty<string>();

        /// <summary>All parts by ID.</summary>
        public IReadOnlyDictionary<string, PartDef> Parts => _parts;
        /// <summary>All contracts by ID.</summary>
        public IReadOnlyDictionary<string, ContractDef> Contracts => _contracts;
        /// <summary>All tests by ID.</summary>
        public IReadOnlyDictionary<string, TestDef> Tests => _tests;
        /// <summary>All anomaly cards by ID.</summary>
        public IReadOnlyDictionary<string, AnomalyDef> Anomalies => _anomalies;
        /// <summary>All roles by ID.</summary>
        public IReadOnlyDictionary<string, RoleDef> Roles => _roles;
        /// <summary>All boosts by ID.</summary>
        public IReadOnlyDictionary<string, BoostDef> Boosts => _boosts;
        /// <summary>All validation rules by ID.</summary>
        public IReadOnlyDictionary<string, ValidationRuleDef> ValidationRules => _rules;

        /// <summary>Returns a part or throws a <see cref="CatalogException"/> naming the missing ID.</summary>
        public PartDef Part(string id) =>
            _parts.TryGetValue(id, out var p) ? p : throw new CatalogException($"Unknown part id '{id}'.");

        /// <summary>Returns a contract or throws a <see cref="CatalogException"/>.</summary>
        public ContractDef Contract(string id) =>
            _contracts.TryGetValue(id, out var c) ? c : throw new CatalogException($"Unknown contract id '{id}'.");

        /// <summary>Returns a test or throws a <see cref="CatalogException"/>.</summary>
        public TestDef Test(string id) =>
            _tests.TryGetValue(id, out var t) ? t : throw new CatalogException($"Unknown test id '{id}'.");

        /// <summary>Returns an anomaly card or throws a <see cref="CatalogException"/>.</summary>
        public AnomalyDef Anomaly(string id) =>
            _anomalies.TryGetValue(id, out var a) ? a : throw new CatalogException($"Unknown anomaly id '{id}'.");

        /// <summary>Returns the validation rule with this ID, or null when data does not define it.</summary>
        public ValidationRuleDef? Rule(string id) => _rules.TryGetValue(id, out var r) ? r : null;

        private static Dictionary<string, T> Index<T>(IEnumerable<T> items, Func<T, string> key, string kind)
        {
            var d = new Dictionary<string, T>(StringComparer.Ordinal);
            foreach (var item in items)
            {
                var k = key(item);
                if (string.IsNullOrEmpty(k)) throw new CatalogException($"A {kind} entry has no id.");
                if (d.ContainsKey(k)) throw new CatalogException($"Duplicate {kind} id '{k}'.");
                d[k] = item;
            }
            return d;
        }

        /// <summary>Parts in data order (the order options are shown when a vote lists none).</summary>
        public IReadOnlyList<PartDef> PartsInOrder => _partOrder;
        private readonly List<PartDef> _partOrder = new List<PartDef>();

        private void CheckReferences()
        {
            foreach (var c in _contracts.Values)
            {
                foreach (var v in c.Votes)
                {
                    if (Slots.CategoryOf(v.Slot) != v.Category)
                        throw new CatalogException($"Contract '{c.Id}' vote '{v.Slot}' has category '{v.Category}', expected '{Slots.CategoryOf(v.Slot)}'.");
                    foreach (var o in v.OptionIds)
                    {
                        if (!_parts.TryGetValue(o, out var p))
                            throw new CatalogException($"Contract '{c.Id}' vote '{v.Slot}' refers to unknown part '{o}'.");
                        if (p.Category != v.Category)
                            throw new CatalogException($"Contract '{c.Id}' vote '{v.Slot}' offers part '{o}' whose category is '{p.Category}'.");
                    }
                    if (v.OptionIds.Count == 0)
                    {
                        // Data lists no options: the parts of the category offered for this contract (data README).
                        var ids = new List<string>();
                        foreach (var p in _partOrder)
                            if (p.Category == v.Category && p.OfferedFor(c.Id) && (v.Stage == null || p.Stats.Stage == null || p.Stats.Stage == v.Stage))
                                ids.Add(p.Id);
                        v.OptionIds = ids;
                        v.ExplicitOptions = false;
                    }
                }
            }
            // A part may list a contract that is not loaded yet (C2 to C8 are still being written); only a malformed
            // contract ID is an error. Contract IDs are C0 to C99 (common.schema.json contract_id).
            foreach (var p in _parts.Values)
                foreach (var cid in p.Contracts)
                    if (!IsContractId(cid))
                        throw new CatalogException($"Part '{p.Id}' lists malformed contract id '{cid}'.");
            foreach (var a in _anomalies.Values)
            {
                if (a.Responses.Count == 0)
                    throw new CatalogException($"Anomaly '{a.Id}' has no responses.");
                foreach (var r in a.Responses)
                    if (r.Effect.ReopenCategory != null && !IsKnownCategory(r.Effect.ReopenCategory))
                        throw new CatalogException($"Anomaly '{a.Id}' response '{r.Id}' reopens unknown category '{r.Effect.ReopenCategory}'.");
            }
        }

        private static bool IsContractId(string id)
        {
            if (id.Length < 2 || id.Length > 3 || id[0] != 'C') return false;
            for (int i = 1; i < id.Length; i++) if (id[i] < '0' || id[i] > '9') return false;
            return true;
        }

        private bool IsKnownCategory(string category)
        {
            if (category == EffectDef.ReopenTarget) return true;
            foreach (var c in Slots.VoteOrder) if (c == category) return true;
            foreach (var p in _parts.Values) if (p.Category == category) return true;
            return false;
        }
    }
}
