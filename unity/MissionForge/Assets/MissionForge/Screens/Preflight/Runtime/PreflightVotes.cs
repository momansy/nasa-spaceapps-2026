using System;
using System.Collections.Generic;
using MissionForge.Core.Build;
using MissionForge.Core.Data;
using Newtonsoft.Json.Linq;

namespace MissionForge.Screens.Preflight
{
    /// <summary>
    /// <c>vote.open</c> payloads of the pre-flight rounds (protocol/messages.md section 7): CONTRACT (CHOICE profile with
    /// INSPECT), TEST, REVIEW and ANOMALY (Test Failure) quick votes, REWORK_CATEGORY (CHOICE). Every number comes
    /// from Core; options are ids and string keys, never free text.
    /// </summary>
    public static class PreflightVotes
    {
        public const string Test = "TEST";
        public const string Skip = "SKIP";
        public const string Pass = "PASS";
        public const string Rework = "REWORK";

        public static JObject Contract(string roundId, IReadOnlyList<ContractDef> offered, uint coinSeed)
        {
            var options = new JArray();
            foreach (ContractDef c in offered) options.Add(Option(c.Id, null, 0, null));
            return Open(roundId, "CONTRACT", null, "ui.host.contract.title", "ui.host.contract.why", Array.Empty<string>(), options, null, coinSeed);
        }

        /// <summary>TEST quick vote: run (cost from <see cref="TestOffer.CostM"/>) or skip; SKIP is the default.</summary>
        public static JObject TestOfferRound(string roundId, TestOffer offer, uint coinSeed)
        {
            var options = new JArray
            {
                Option(Test, null, offer.CostM, null, ("COST_M", offer.CostM, 0), ("SCHEDULE_DAYS", offer.Days, offer.Days)),
                Option(Skip, null, 0, null),
            };
            return Open(roundId, "TEST", offer.Test.Id, "ui.host.test.vote.title", null, Array.Empty<string>(), options, Skip, coinSeed);
        }

        /// <summary>REVIEW quick vote: PASS (only when the report allows it) and REWORK; PASS is the default when offered.</summary>
        public static JObject ReviewRound(string roundId, ReviewReport report, uint coinSeed)
        {
            var options = new JArray();
            if (report.PassAllowed) options.Add(Option(Pass, null, 0, null));
            options.Add(Option(Rework, null, 0, null));
            return Open(roundId, "REVIEW", report.Kind.ToString().ToUpperInvariant(), "ui.host.review.vote.title", null, Array.Empty<string>(), options,
                report.PassAllowed ? Pass : null, coinSeed);
        }

        /// <summary>REWORK_CATEGORY CHOICE vote over decided slots, each with Core's re-integration fee and schedule cost.</summary>
        public static JObject ReworkCategory(string roundId, ReviewKind kind, BuildState build, GameCatalog catalog, IEnumerable<string> slots, uint coinSeed)
        {
            var options = new JArray();
            foreach (string slot in slots)
            {
                if (!build.Has(slot)) continue;
                double fee = DesignReview.ReworkFeeM(build, catalog, slot);
                options.Add(Option(slot, "vote." + slot + ".name", fee, null, ("COST_M", fee, fee), ("SCHEDULE_DAYS", BuildConstants.ReworkBaseDays, BuildConstants.ReworkBaseDays)));
            }
            return Open(roundId, "REWORK_CATEGORY", kind.ToString().ToUpperInvariant(), "ui.host.review.rework.title", "ui.host.review.rework.why",
                Array.Empty<string>(), options, null, coinSeed);
        }

        /// <summary>Test Failure (<c>anomaly.test_failure</c>) response vote: ids are the card's response ids.</summary>
        public static JObject TestFailure(string roundId, AnomalyDef card, uint coinSeed)
        {
            var options = new JArray();
            foreach (AnomalyResponse r in card.Responses) options.Add(Option(r.Id, null, 0, null));
            return Open(roundId, "ANOMALY", card.Id, "anomaly." + card.Id + ".name", "anomaly." + card.Id + ".trigger", Array.Empty<string>(), options,
                card.Responses.Count > 0 ? card.Responses[card.Responses.Count - 1].Id : null, coinSeed);
        }

        private static JObject Option(string id, string labelKey, double costM, string partId, params (string metric, double value, double delta)[] deltas)
        {
            var d = new JArray();
            foreach ((string metric, double value, double delta) in deltas)
                d.Add(new JObject { ["metric"] = metric, ["value"] = Math.Round(value, 4), ["delta"] = Math.Round(delta, 4), ["rating"] = "NEUTRAL" });
            return new JObject
            {
                ["id"] = id,
                ["partId"] = partId,
                ["label"] = labelKey != null ? new JObject { ["key"] = labelKey } : null,
                ["costM"] = Math.Max(0, Math.Round(costM, 4)),
                ["afford"] = "OK",
                ["overBudgetByM"] = 0,
                ["overScheduleByDays"] = 0,
                ["willNotFly"] = false,
                ["fixExists"] = false,
                ["warnings"] = new JArray(),
                ["deltas"] = d,
            };
        }

        private static JObject Open(string roundId, string kind, string subjectId, string titleKey, string whyKey, string[] owners, JArray options,
            string defaultOptionId, uint coinSeed) => new JObject
        {
            ["roundId"] = roundId,
            ["kind"] = kind,
            ["subjectId"] = subjectId,
            ["title"] = new JObject { ["key"] = titleKey },
            ["why"] = whyKey != null ? new JObject { ["key"] = whyKey } : null,
            ["ownerRoles"] = new JArray(owners),
            ["options"] = options,
            ["defaultOptionId"] = defaultOptionId,
            ["hint"] = null,
            ["predict"] = null,
            ["trivia"] = null,
            ["coinSeed"] = coinSeed,
            ["timers"] = null,
        };
    }
}
