#nullable enable
using System;
using System.Collections.Generic;
using MissionForge.Core.Data;

namespace MissionForge.Core.Build
{
    /// <summary>A card with its current draw weight.</summary>
    public sealed class WeightedCard
    {
        internal WeightedCard(AnomalyDef card, double weight)
        {
            Card = card;
            Weight = weight;
        }

        /// <summary>The card.</summary>
        public AnomalyDef Card { get; }
        /// <summary>Weight after conditions (0 = cannot be drawn).</summary>
        public double Weight { get; }
    }

    /// <summary>A drawn card waiting for the team's response.</summary>
    public sealed class AnomalyDraw
    {
        internal AnomalyDraw(BuildState build, AnomalyDef card, string? targetCategory)
        {
            Build = build;
            Card = card;
            TargetCategory = targetCategory;
        }

        /// <summary>Build after the draw (card recorded, on-draw effect applied, vote counter reset).</summary>
        public BuildState Build { get; }
        /// <summary>The card drawn.</summary>
        public AnomalyDef Card { get; }
        /// <summary>The part category the card is about, or null.</summary>
        public string? TargetCategory { get; }
    }

    /// <summary>
    /// Conditions that weight anomaly cards (design 6.8 "Trigger weight"). Each returns true when it applies
    /// to the build.
    /// </summary>
    public static class AnomalyConditions
    {
        /// <summary>Condition prefix: <c>test_skipped:&lt;test id&gt;</c> holds while that test has not been run.</summary>
        public const string TestSkippedPrefix = "test_skipped:";

        /// <summary>
        /// Evaluates a named condition. Known names: <c>always</c>, <c>random</c>, <c>single_source</c>, <c>campaign</c>,
        /// <c>flaw_revealed</c>, <c>coastal_site</c>, <c>busy_site</c>, <c>subtropical_site</c>, <c>tropical_site</c>,
        /// <c>payload_contract</c>, <c>skipped_software_test</c>, <c>science_payload</c>, <c>pressure_fed</c>,
        /// <c>new_technology</c>, <c>hydrolox</c>, <c>crewed</c> and <c>test_skipped:&lt;id&gt;</c>. Unknown names are false.
        /// </summary>
        public static bool Holds(string condition, Vehicle v)
        {
            var b = v.Build;
            var c = v.Contract;
            var site = v.Part(Slots.LaunchSite);
            switch (condition)
            {
                case "always":
                case "random":
                    return true;
                case "single_source": return AnyTag(v, "single_source");
                case "campaign": return c.Campaign || b.HasFlag("campaign");
                case "flaw_revealed": return TestCampaign.OpenFlaws(b).Count > 0;
                case "coastal_site": return site != null && site.HasTag("coastal");
                case "busy_site": return site != null && site.HasTag("busy_range");
                case "subtropical_site": return site != null && site.HasTag("subtropical");
                case "tropical_site": return site != null && site.HasTag("tropical");
                case "payload_contract":
                    foreach (var cat in Slots.PayloadGroup) if (c.VoteFor(cat) != null) return true;
                    return c.PayloadMassKg > 0;
                case "skipped_software_test":
                    return b.Has(Slots.Avionics) && !TestCampaign.RiskCleared(b, "software_fault");
                case "science_payload": return c.Science;
                case "pressure_fed": return AnyTag(v, "pressure_fed");
                case "new_technology":
                    foreach (var p in v.ChosenParts()) if (p.Maturity == Maturity.New) return true;
                    return false;
                case "hydrolox":
                    foreach (var p in v.ChosenParts()) if (p.Propellant == Propellants.Hydrolox) return true;
                    return false;
                case "crewed": return c.Crewed;
                default:
                    // "test_skipped:<test id>": the test has not been run on any target (data trigger kind test_skipped).
                    if (condition.StartsWith(TestSkippedPrefix, StringComparison.Ordinal))
                        return !TestCampaign.HasRun(b, condition.Substring(TestSkippedPrefix.Length));
                    return false;
            }
        }

        private static bool AnyTag(Vehicle v, string tag)
        {
            foreach (var p in v.ChosenParts()) if (p.HasTag(tag)) return true;
            return false;
        }
    }

    /// <summary>Anomaly cards (design 6.8): when to draw, weighted seeded draw, and the effect of each response.</summary>
    public static class AnomalyDeck
    {
        /// <summary>Response ID of Test Failure that accepts the flaw (data <c>test_failure</c> → <c>fly_as_is</c>).</summary>
        public const string FlyAsIsResponse = "fly_as_is";

        /// <summary>
        /// Chance that a card is drawn after a vote, given votes since the last card: 0 before
        /// <see cref="BuildConstants.AnomalyMinVotesBetween"/>, then rising linearly to 1 at
        /// <see cref="BuildConstants.AnomalyMaxVotesBetween"/> (3 → 1/3, 4 → 2/3, 5 → 1). game_value (design: "every 3–5 votes").
        /// </summary>
        public static double DrawChance(int votesSinceLast)
        {
            var min = BuildConstants.AnomalyMinVotesBetween;
            var max = BuildConstants.AnomalyMaxVotesBetween;
            if (votesSinceLast < min) return 0;
            if (votesSinceLast >= max) return 1;
            return (votesSinceLast - min + 1.0) / (max - min + 1.0);
        }

        /// <summary>
        /// Chance of a draw with the data's spacing (<c>anomalies.json</c> <c>draw</c>): 0 before
        /// <paramref name="minVotes"/>, rising linearly to 1 at <paramref name="maxVotes"/>.
        /// </summary>
        public static double DrawChance(int votesSinceLast, int minVotes, int maxVotes)
        {
            if (votesSinceLast < minVotes) return 0;
            if (votesSinceLast >= maxVotes) return 1;
            return (votesSinceLast - minVotes + 1.0) / (maxVotes - minVotes + 1.0);
        }

        /// <summary>
        /// Whether a card is drawn now (seeded: stream <c>anomaly</c>, key <c>when</c>, index = votes completed).
        /// Uses the catalog's draw spacing when given, else <see cref="BuildConstants.AnomalyMinVotesBetween"/>–<see cref="BuildConstants.AnomalyMaxVotesBetween"/>.
        /// </summary>
        public static bool ShouldDraw(BuildState build, GameCatalog? catalog = null)
        {
            var p = DrawChance(build.VotesSinceAnomaly,
                catalog?.AnomalyMinVotesBetween ?? BuildConstants.AnomalyMinVotesBetween,
                catalog?.AnomalyMaxVotesBetween ?? BuildConstants.AnomalyMaxVotesBetween);
            if (p <= 0) return false;
            if (p >= 1) return true;
            return BuildRandom.Uniform(build.Seed, BuildRandom.AnomalyStream, "when", build.VotesCompleted) < p;
        }

        /// <summary>
        /// Current weight of every card: base weight × multiplier of every trigger condition that holds.
        /// Cards whose <see cref="AnomalyDef.RequiresCondition"/> fails, and cards already drawn, weigh 0.
        /// </summary>
        public static IReadOnlyList<WeightedCard> Weights(BuildState build, GameCatalog catalog)
        {
            var v = new Vehicle(build, catalog);
            var ids = new List<string>(catalog.Anomalies.Keys);
            ids.Sort(StringComparer.Ordinal);
            var list = new List<WeightedCard>();
            foreach (var id in ids)
            {
                var card = catalog.Anomalies[id];
                double w = card.BaseWeight;
                if (card.RequiresCondition != null && !AnomalyConditions.Holds(card.RequiresCondition, v)) w = 0;
                // Cards are drawn without replacement, except event cards (with a required condition) such as
                // Test Failure, which can recur each time their condition holds again. game_value (decision).
                if (card.RequiresCondition == null && Contains(build.AnomaliesDrawn, id)) w = 0;
                foreach (var t in card.Triggers)
                    if (AnomalyConditions.Holds(t.Condition, v)) w *= t.Multiplier;
                // Part rules (data rule anomaly_weight): every chosen part that names this card multiplies its weight.
                foreach (var p in v.ChosenParts())
                    if (p.AnomalyWeights.TryGetValue(id, out var mult)) w *= mult;
                list.Add(new WeightedCard(card, Math.Max(0, w)));
            }
            return list;
        }

        /// <summary>
        /// Draws a card by weight (seeded: stream <c>anomaly</c>, key <c>card</c>, index = cards drawn so far).
        /// Returns null when every weight is 0.
        /// </summary>
        public static AnomalyDraw? Draw(BuildState build, GameCatalog catalog)
        {
            var weights = Weights(build, catalog);
            double total = 0;
            foreach (var w in weights) total += w.Weight;
            if (total <= 0) return null;
            var u = BuildRandom.Uniform(build.Seed, BuildRandom.AnomalyStream, "card", build.AnomaliesDrawn.Count) * total;
            AnomalyDef? pick = null;
            foreach (var w in weights)
            {
                if (w.Weight <= 0) continue;
                pick = w.Card;
                if (u < w.Weight) break;
                u -= w.Weight;
            }
            return DrawSpecific(build, catalog, pick!.Id);
        }

        /// <summary>
        /// Presents a specific card (e.g. Test Failure right after a test reveals a flaw): records it, resets the
        /// vote counter and applies its on-draw effect.
        /// </summary>
        public static AnomalyDraw DrawSpecific(BuildState build, GameCatalog catalog, string cardId)
        {
            var card = catalog.Anomaly(cardId);
            var target = TargetOf(card, new Vehicle(build, catalog));
            var next = build.WithAnomalyDrawn(card.Id);
            next = Apply(next, catalog, card.OnDraw, card.Id + "/draw", target);
            return new AnomalyDraw(next, card, target);
        }

        /// <summary>After a vote: draws a card if <see cref="ShouldDraw"/> says so, otherwise returns null.</summary>
        public static AnomalyDraw? MaybeDraw(BuildState build, GameCatalog catalog) =>
            ShouldDraw(build, catalog) ? Draw(build, catalog) : null;

        /// <summary>The category a card is about (see <see cref="AnomalyDef.Target"/>), or null.</summary>
        public static string? TargetOf(AnomalyDef card, Vehicle v)
        {
            switch (card.Target)
            {
                case "single_source_part":
                    foreach (var kv in v.ChosenSlots()) if (kv.Value.HasTag("single_source") || kv.Value.AnomalyWeights.ContainsKey(card.Id)) return kv.Key;
                    return LongestLead(v);
                case "longest_lead_part":
                    return LongestLead(v);
                case "rule_part":
                    // The part whose data rule makes this card likely (e.g. a pressure-fed engine for Helium Shortage).
                    foreach (var kv in v.ChosenSlots()) if (kv.Value.AnomalyWeights.ContainsKey(card.Id)) return kv.Key;
                    return null;
                case "flawed_part":
                {
                    var flaws = TestCampaign.OpenFlaws(v.Build);
                    return flaws.Count > 0 ? flaws[0] : null;
                }
                case "engine":
                    return v.FirstEngine != null ? Slots.FirstStageEngine : v.UpperEngine != null ? Slots.UpperStageEngine : null;
                case "pressure_fed_part":
                    foreach (var kv in v.ChosenSlots()) if (kv.Value.HasTag("pressure_fed")) return kv.Key;
                    return null;
                case "payload":
                    foreach (var kv in v.ChosenSlots()) if (Slots.IsPayload(kv.Key)) return kv.Key;
                    return null;
                default:
                    return null;
            }
        }

        private static string? LongestLead(Vehicle v)
        {
            string? cat = null;
            double best = -1;
            foreach (var kv in v.ChosenSlots())
            {
                var lead = kv.Value.LeadDays + kv.Value.Stats.ExtraLeadDays;
                if (lead > best) { best = lead; cat = kv.Key; }
            }
            return cat;
        }

        /// <summary>
        /// Applies the team's response to a drawn card. Money, days, budget changes, reliability, Δv bonus, mass,
        /// science penalty, flags, Emergency Funding, flaw fix and category reopen are applied as the response
        /// effect says.
        /// </summary>
        /// <param name="build">Build returned by <see cref="Draw"/>.</param>
        /// <param name="catalog">Catalog.</param>
        /// <param name="cardId">Card answered.</param>
        /// <param name="responseId">Chosen response.</param>
        /// <param name="targetCategory">Target override (e.g. the engine the team picks for a breakthrough); default from the card.</param>
        public static BuildState Respond(BuildState build, GameCatalog catalog, string cardId, string responseId, string? targetCategory = null)
        {
            var card = catalog.Anomaly(cardId);
            var response = card.Response(responseId) ?? throw new CatalogException($"Anomaly '{cardId}' has no response '{responseId}'.");
            var target = targetCategory ?? TargetOf(card, new Vehicle(build, catalog));
            var next = Apply(build, catalog, response.Effect, card.Id + "/" + response.Id, target);
            // Test Failure answered "fly as-is": the flaw is accepted, so it no longer counts as an open flaw
            // (OpenFlaws, the flaw_revealed trigger, design reviews). The true reliability keeps its penalty.
            if (responseId == FlyAsIsResponse && card.Target == "flawed_part" && target != null && build.Condition(target).FlawRevealed)
                next = next.WithFlag(TestCampaign.FlawAcceptedPrefix + target);
            return next;
        }

        /// <summary>Applies a generic effect to a build (shared by anomaly draws and responses).</summary>
        public static BuildState Apply(BuildState build, GameCatalog catalog, EffectDef e, string sourceId, string? target)
        {
            var b = build;
            if (e.UsesEmergencyFunding) b = VoteOptions.UseEmergencyFunding(b, catalog);
            var contract = catalog.Contract(b.ContractId);
            PartDef? part = target != null && b.Choice(target) != null ? catalog.Part(b.Choice(target)!) : null;
            var cost = e.CostM + (part != null ? part.CostM * e.CostPartFraction : 0);
            var budget = contract.BudgetM * e.BudgetFraction + e.BudgetM;
            if (cost != 0 || e.Days != 0 || budget != 0 || e.MassKg != 0 || e.LeadDays != 0)
                b = b.WithLedger(new LedgerEntry(LedgerKind.Anomaly, sourceId, cost, e.Days, budget, target, e.MassKg, e.LeadDays));
            if (target != null && b.Has(target) && (e.ReliabilityDelta != 0 || e.BandScale != 1 || e.DvBonusFraction != 0 || e.FixesFlaw))
            {
                var c = b.Condition(target);
                b = b.WithCondition(target, c.With(
                    reliabilityDelta: c.ReliabilityDelta + e.ReliabilityDelta,
                    bandScale: c.BandScale * e.BandScale,
                    dvBonusFraction: c.DvBonusFraction + e.DvBonusFraction,
                    flawFixed: c.FlawFixed || (e.FixesFlaw && c.FlawRevealed)));
            }
            if (e.SciencePenaltyFraction != 0) b = b.WithFlag("science_penalty:" + sourceId);
            foreach (var f in e.AddFlags) b = b.WithFlag(f);
            if (e.MinigameId != null) b = b.WithFlag("minigame_pending:" + e.MinigameId);
            if (e.ReopenCategory == EffectDef.ReopenTarget) { if (target != null) b = b.WithReopened(target); }
            else if (e.ReopenCategory != null) b = b.WithReopened(e.ReopenCategory);
            return b;
        }

        private static bool Contains(IReadOnlyList<string> list, string id)
        {
            for (int i = 0; i < list.Count; i++) if (list[i] == id) return true;
            return false;
        }
    }
}
