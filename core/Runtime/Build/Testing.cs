#nullable enable
using System;
using System.Collections.Generic;
using MissionForge.Core.Data;

namespace MissionForge.Core.Build
{
    /// <summary>A test that can be run now on a specific target, with its price.</summary>
    public sealed class TestOffer
    {
        internal TestOffer(TestDef test, string targetCategory, string? targetPartId, double costM, double days)
        {
            Test = test;
            TargetCategory = targetCategory;
            TargetPartId = targetPartId;
            CostM = costM;
            Days = days;
        }

        /// <summary>The test.</summary>
        public TestDef Test { get; }
        /// <summary>Category tested (for stage and vehicle tests: the stage engine category, or <c>vehicle</c>).</summary>
        public string TargetCategory { get; }
        /// <summary>Part tested, or null for whole-vehicle tests.</summary>
        public string? TargetPartId { get; }
        /// <summary>Cost, $M (game value).</summary>
        public double CostM { get; }
        /// <summary>Days added to the schedule (game value).</summary>
        public double Days { get; }
    }

    /// <summary>What a test run produced.</summary>
    public sealed class TestOutcome
    {
        internal TestOutcome(BuildState build, TestOffer offer, bool flawRevealed, double revealChance, double roll)
        {
            Build = build;
            Offer = offer;
            FlawRevealed = flawRevealed;
            RevealChance = revealChance;
            Roll = roll;
        }

        /// <summary>The build after the test (cost, days and condition recorded).</summary>
        public BuildState Build { get; }
        /// <summary>The test that ran.</summary>
        public TestOffer Offer { get; }
        /// <summary>A hidden flaw was revealed; the team can fix it (<see cref="TestCampaign.FixFlaw"/>) or fly as-is.</summary>
        public bool FlawRevealed { get; }
        /// <summary>Chance a present flaw was revealed, 0–1.</summary>
        public double RevealChance { get; }
        /// <summary>The seeded roll in [0, 1) (revealed when roll &lt; chance and a flaw exists).</summary>
        public double Roll { get; }
    }

    /// <summary>Optional tests (design 6.6) and flaw fixing (6.5). Deterministic from the build seed.</summary>
    public static class TestCampaign
    {
        /// <summary>Target ID for whole-vehicle tests.</summary>
        public const string VehicleTarget = "vehicle";

        /// <summary>Flag prefix set when a test clears a risk, e.g. <c>risk_cleared:pogo</c>.</summary>
        public const string RiskClearedPrefix = "risk_cleared:";

        /// <summary>Flag prefix set when the team answers Test Failure with "fly as-is", e.g. <c>flaw_accepted:first_stage_engine</c>.</summary>
        public const string FlawAcceptedPrefix = "flaw_accepted:";

        /// <summary>Reveal-chance bonus per minigame tier (Bronze 1 … Platinum 4), fraction. game_value (decision).</summary>
        public const double MinigameRevealBonusPerTier = 0.05;

        /// <summary>Reference sizes for range-priced tests: stage propellant, kg (XL first stage = 1,000 t). game_value.</summary>
        public const double StageReferencePropellantKg = 1_000_000;
        /// <summary>Reference payload mass for range-priced payload tests, kg. game_value (decision).</summary>
        public const double PayloadReferenceMassKg = 10_000;

        /// <summary>Categories a target group stands for.</summary>
        public static IReadOnlyList<string> Expand(string group) => group switch
        {
            "any" => Slots.VoteOrder,
            "any_part" => Slots.VoteOrder,
            "parachutes" => new[] { Slots.CapsuleRecovery, Slots.Lander },
            "engine" => new[] { Slots.FirstStageEngine, Slots.UpperStageEngine },
            "stage" => new[] { Slots.FirstStageEngine, Slots.UpperStageEngine },
            "first_stage" => new[] { Slots.FirstStageEngine },
            "vehicle" => new[] { VehicleTarget },
            "payload" => new[] { Slots.PayloadInstrument, Slots.PayloadPower, Slots.PayloadAttitude, Slots.Capsule, Slots.Lander, Slots.LifeSupport },
            "spacecraft" => new[] { Slots.PayloadInstrument, Slots.PayloadPower, Slots.PayloadAttitude, Slots.Capsule, Slots.Lander, Slots.LifeSupport, Slots.PowerSystem },
            "avionics" => new[] { Slots.Avionics },
            "gnc" => new[] { Slots.Avionics, Slots.Navigation },
            "parachute" => new[] { Slots.CapsuleRecovery, Slots.Lander },
            "heat_shield" => new[] { Slots.HeatShield },
            _ => Slots.ForCategory(group), // a part category: every slot that takes it
        };

        /// <summary>Every test that can be run now, one offer per (test, target). Tests already run on a target are omitted.</summary>
        public static IReadOnlyList<TestOffer> Available(BuildState build, GameCatalog catalog)
        {
            var v = new Vehicle(build, catalog);
            var offers = new List<TestOffer>();
            foreach (var t in catalog.Tests.Values)
            {
                var targets = new List<string>();
                foreach (var g in t.AppliesTo)
                    foreach (var c in Expand(g))
                        if (!targets.Contains(c)) targets.Add(c);
                foreach (var cat in targets)
                {
                    var offer = Offer(v, t, cat);
                    if (offer != null) offers.Add(offer);
                }
            }
            offers.Sort((a, b) =>
            {
                var c = string.CompareOrdinal(a.Test.Id, b.Test.Id);
                return c != 0 ? c : string.CompareOrdinal(a.TargetCategory, b.TargetCategory);
            });
            return offers;
        }

        /// <summary>The offer for a test on a target category, or null when it does not apply or already ran.</summary>
        public static TestOffer? Offer(BuildState build, GameCatalog catalog, string testId, string targetCategory)
        {
            var t = catalog.Test(testId);
            return AppliesTo(t, targetCategory) ? Offer(new Vehicle(build, catalog), t, targetCategory) : null;
        }

        /// <summary>True when the target category is one the test's <see cref="TestDef.AppliesTo"/> groups stand for.</summary>
        private static bool AppliesTo(TestDef t, string targetCategory)
        {
            foreach (var g in t.AppliesTo)
                foreach (var c in Expand(g))
                    if (c == targetCategory) return true;
            return false;
        }

        private static TestOffer? Offer(Vehicle v, TestDef t, string cat)
        {
            if (cat == VehicleTarget)
            {
                if (v.FirstEngine == null || v.Build.HasFlag(RanFlag(t.Id, VehicleTarget))) return null;
                return new TestOffer(t, cat, null, Cost(v, t, null, cat), t.Days);
            }
            var part = v.Part(cat);
            if (part == null) return null;
            if (t.AppliesTo.Count == 1 && (t.AppliesTo[0] == "any" || t.AppliesTo[0] == "any_part") && part.Reliability == null) return null; // data says any_part, older fixtures any
            if (v.Build.Condition(cat).HasTest(t.Id)) return null;
            return new TestOffer(t, cat, part.Id, Cost(v, t, part, cat), t.Days);
        }

        /// <summary>
        /// Cost of a test, $M: fixed; or a fraction of one unit of the tested part (component qualification 5%,
        /// hot-fire 10%); or a range scaled by stage propellant (static fire $2–8 M) or payload mass (shake test $1–3 M).
        /// </summary>
        public static double Cost(Vehicle v, TestDef t, PartDef? part, string cat)
        {
            switch (t.CostKind)
            {
                case TestCostKind.PartFraction:
                    return (part?.CostM ?? 0) * t.CostPartFraction;
                case TestCostKind.StageScaled:
                {
                    double s;
                    if (cat == Slots.FirstStageEngine) s = v.Mass.FirstPropellantKg / StageReferencePropellantKg;
                    else if (cat == Slots.UpperStageEngine) s = v.Mass.UpperPropellantKg / StageReferencePropellantKg;
                    else s = v.Mass.PayloadKg / PayloadReferenceMassKg;
                    s = Math.Max(0, Math.Min(1, s));
                    return t.CostM + (t.CostMaxM - t.CostM) * s;
                }
                default:
                    return t.CostM;
            }
        }

        private static string RanFlag(string testId, string target) => "test_ran:" + testId + ":" + target;

        /// <summary>
        /// Runs a test. Adds cost and days to the ledger, narrows the band, applies the reliability bonus,
        /// clears risks, and rolls (seeded: stream <c>test</c>, key test/part, index = tests run on the part)
        /// whether a hidden flaw is revealed.
        /// </summary>
        /// <param name="build">Current build.</param>
        /// <param name="catalog">Catalog.</param>
        /// <param name="testId">Test to run.</param>
        /// <param name="targetCategory">Category to test, or <see cref="VehicleTarget"/>.</param>
        /// <param name="minigameTier">Tier of the linked minigame: 0 none, 1 Bronze … 4 Platinum. Raises the reveal chance.</param>
        /// <param name="costMultiplier">Price multiplier, e.g. 0.5 for BOOSTER's Hot-Fire Discount.</param>
        public static TestOutcome Run(BuildState build, GameCatalog catalog, string testId, string targetCategory,
            int minigameTier = 0, double costMultiplier = 1.0)
        {
            var offer = Offer(build, catalog, testId, targetCategory)
                        ?? throw new InvalidOperationException($"Test '{testId}' cannot run on '{targetCategory}'.");
            var t = offer.Test;
            var cost = offer.CostM * costMultiplier;
            var next = build.WithLedger(new LedgerEntry(LedgerKind.Test, t.Id, cost, offer.Days, 0, targetCategory));
            foreach (var risk in t.ClearsRisks) next = next.WithFlag(RiskClearedPrefix + risk);

            if (targetCategory == VehicleTarget)
            {
                next = next.WithFlag(RanFlag(t.Id, VehicleTarget));
                return new TestOutcome(next, offer, false, 0, 1);
            }

            var part = catalog.Part(offer.TargetPartId!);
            var cond = next.Condition(targetCategory);
            var chance = Math.Min(1, t.RevealChance + MinigameRevealBonusPerTier * Math.Max(0, minigameTier));
            var roll = BuildRandom.Uniform(build.Seed, BuildRandom.TestStream, t.Id + "/" + part.Id, cond.TestsRun);
            var hidden = ReliabilityModel.Hidden(build.Seed, part);
            var revealed = hidden.HasFlaw && !cond.FlawFixed && !cond.FlawRevealed && roll < chance;
            var ids = new List<string>(cond.TestIds) { t.Id };
            cond = cond.With(
                bandScale: cond.BandScale * t.BandScale,
                reliabilityDelta: cond.ReliabilityDelta + t.ReliabilityBonus,
                flawRevealed: cond.FlawRevealed || revealed,
                testsRun: cond.TestsRun + 1,
                testIds: ids);
            next = next.WithCondition(targetCategory, cond);
            if (revealed) next = next.WithFlag("flaw_revealed:" + targetCategory);
            return new TestOutcome(next, offer, revealed, chance, roll);
        }

        /// <summary>Cost to fix a revealed flaw, $M: max(20% of the part's unit cost, $1 M). game_value.</summary>
        public static double FixCostM(PartDef part) =>
            Math.Max(BuildConstants.FlawFixMinCostM, part.CostM * BuildConstants.FlawFixCostFraction);

        /// <summary>Fixes the revealed flaw of a category for money and days (design 6.5).</summary>
        public static BuildState FixFlaw(BuildState build, GameCatalog catalog, string category)
        {
            var cond = build.Condition(category);
            if (!cond.FlawRevealed || cond.FlawFixed) throw new InvalidOperationException($"No revealed, unfixed flaw in '{category}'.");
            var part = catalog.Part(build.Choice(category) ?? throw new InvalidOperationException($"Nothing chosen in '{category}'."));
            return build
                .WithLedger(new LedgerEntry(LedgerKind.FlawFix, "fix:" + part.Id, FixCostM(part), BuildConstants.FlawFixDays, 0, category))
                .WithCondition(category, cond.With(flawFixed: true));
        }

        /// <summary>True when the test has been run on any target (a part slot or the whole vehicle).</summary>
        public static bool HasRun(BuildState build, string testId)
        {
            if (build.HasFlag(RanFlag(testId, VehicleTarget))) return true;
            foreach (var kv in build.Conditions) if (kv.Value.HasTest(testId)) return true;
            return false;
        }

        /// <summary>True when a risk was cleared by a test (e.g. <c>pogo</c>, <c>software_fault</c>).</summary>
        public static bool RiskCleared(BuildState build, string risk) => build.HasFlag(RiskClearedPrefix + risk);

        /// <summary>True when the team accepted the revealed flaw of this category (Test Failure → fly as-is). The flaw still lowers the true reliability.</summary>
        public static bool IsFlawAccepted(BuildState build, string category) => build.HasFlag(FlawAcceptedPrefix + category);

        /// <summary>Categories with a revealed flaw that is neither fixed nor accepted (fly as-is).</summary>
        public static IReadOnlyList<string> OpenFlaws(BuildState build)
        {
            var list = new List<string>();
            foreach (var kv in build.Conditions)
                if (kv.Value.FlawRevealed && !kv.Value.FlawFixed && build.Has(kv.Key) && !IsFlawAccepted(build, kv.Key)) list.Add(kv.Key);
            list.Sort(StringComparer.Ordinal);
            return list;
        }
    }
}
