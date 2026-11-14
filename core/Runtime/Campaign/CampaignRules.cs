#nullable enable
using System;
using System.Collections.Generic;
using System.Linq;
using MissionForge.Core.Build;
using MissionForge.Core.Data;
using MissionForge.Core.Random;

namespace MissionForge.Core.Campaign
{
    /// <summary>Pure progression rules from design 13.2; the host owns persistence and time.</summary>
    public static class Campaign
    {
        /// <summary>Records one mission, its resource deltas, recovered hardware and one-time milestones.</summary>
        public static CampaignUpdate Record(CampaignState state, MissionReport report)
        {
            if (state == null) throw new ArgumentNullException(nameof(state));
            if (report == null) throw new ArgumentNullException(nameof(report));
            int baseRep = report.Outcome == MissionOutcome.Success ? CampaignConstants.SuccessReputation :
                report.Outcome == MissionOutcome.Partial ? CampaignConstants.PartialReputation :
                CampaignConstants.FailureReputation;
            int timingRep = report.OnTime && report.ScheduleMarginDays >= 0 ?
                CampaignConstants.OnTimeBonus : CampaignConstants.LatePenalty;
            int nextRep = Math.Max(0, Math.Min(100, state.Reputation + baseRep + timingRep));
            int appliedRep = nextRep - state.Reputation;
            double carryM = Math.Max(0, report.BudgetRemainingM) * CampaignConstants.BudgetCarryFraction;
            double claimM = state.Insured && report.Outcome == MissionOutcome.Failure ?
                Math.Min(CampaignConstants.InsuranceClaimCapM,
                    report.BudgetInitialM * CampaignConstants.InsuranceFailureRecoveryFraction) : 0;
            var changes = new List<CampaignChange>();
            changes.Add(new CampaignChange("mission_" + report.Outcome.ToString().ToLowerInvariant(),
                reputationDelta: baseRep));
            changes.Add(new CampaignChange(report.OnTime && report.ScheduleMarginDays >= 0 ?
                "on_time" : "schedule_slip", reputationDelta: timingRep));
            // The clamp may change the effective total; the resulting state is authoritative.
            if (appliedRep != baseRep + timingRep)
                changes.Add(new CampaignChange("reputation_bound",
                    reputationDelta: appliedRep - baseRep - timingRep));
            if (report.KnowledgePointsEarned > 0)
                changes.Add(new CampaignChange("knowledge_earned", knowledgePointsDelta: report.KnowledgePointsEarned));
            if (carryM > 0) changes.Add(new CampaignChange("budget_carry_over", budgetDeltaM: carryM));
            if (claimM > 0) changes.Add(new CampaignChange("insurance_failure_claim", budgetDeltaM: claimM));

            var inventory = new List<InventoryItem>(state.InventoryItems);
            foreach (string partId in report.RecoveredHardware)
            {
                if (string.IsNullOrWhiteSpace(partId)) continue;
                // Recovered hardware is supplied by the host; no speculative recovery rolls.
                int flights = 1;
                foreach (var owned in inventory)
                    if (owned.PartId == partId) flights = Math.Max(flights, owned.Flights + 1);
                string itemId = partId + "-" + (state.Missions.Count + 1) + "-" +
                    (inventory.Count + 1);
                inventory.Add(new InventoryItem(itemId, partId, flights, false));
                changes.Add(new CampaignChange("hardware_recovered:" + partId));
            }

            var milestoneIds = new HashSet<string>(state.Milestones, StringComparer.Ordinal);
            var events = new List<CampaignMilestone>();
            var objectiveSet = new HashSet<string>(report.MetObjectives, StringComparer.Ordinal);
            bool reachedOrbit = objectiveSet.Contains("orbit") || objectiveSet.Contains("stable_orbit");
            bool recovered = report.RecoveredHardware.Count > 0 || objectiveSet.Contains("recovery");
            bool crew = objectiveSet.Contains("crew") || objectiveSet.Contains("crew_safe") ||
                objectiveSet.Contains("crew_landed");
            bool lunar = objectiveSet.Contains("lunar_flyby") ||
                (report.ContractId == "C6" && report.Outcome == MissionOutcome.Success);
            bool mars = objectiveSet.Contains("mars_landing") ||
                (report.ContractId == "C7" && report.Outcome == MissionOutcome.Success);
            AddMilestone("first_orbit", reachedOrbit, milestoneIds, events);
            AddMilestone("first_recovery", recovered, milestoneIds, events);
            AddMilestone("first_crew", crew, milestoneIds, events);
            AddMilestone("first_lunar_flyby", lunar, milestoneIds, events);
            AddMilestone("first_mars_landing", mars, milestoneIds, events);
            foreach (var achieved in events) changes.Add(new CampaignChange("milestone:" + achieved.Id));

            var missions = new List<MissionReport>(state.Missions) { report };
            var next = state.With(reputation: nextRep, knowledgePoints: checked(state.KnowledgePoints +
                report.KnowledgePointsEarned), carriedBudgetM: state.CarriedBudgetM + carryM + claimM,
                inventoryItems: inventory, milestones: milestoneIds.OrderBy(x => x, StringComparer.Ordinal),
                missions: missions, insured: false);
            return new CampaignUpdate(next, changes, events);
        }

        private static void AddMilestone(string id, bool reached, HashSet<string> already,
            List<CampaignMilestone> events)
        {
            if (reached && already.Add(id)) events.Add(new CampaignMilestone(id));
        }

        /// <summary>Part unlock filter: all non-research parts remain available by default.</summary>
        public static bool IsPartAvailable(CampaignState state, string partId)
        {
            if (state == null) throw new ArgumentNullException(nameof(state));
            if (string.IsNullOrWhiteSpace(partId)) return false;
            if (state.UnlockedParts.Contains(partId)) return true;
            return !TechTree.IsResearchPart(partId);
        }

        /// <summary>Buys a tech-tree node with Knowledge Points or throws if unaffordable/locked.</summary>
        public static CampaignState PurchaseTech(CampaignState state, string techId) =>
            TechTree.Purchase(state, techId);

        /// <summary>Enables insurance for the next mission; charges the build when applied.</summary>
        public static CampaignState EnableInsurance(CampaignState state)
        {
            if (state == null) throw new ArgumentNullException(nameof(state));
            return state.With(insured: true);
        }

        /// <summary>Applies a carried-budget line ($M) to a fresh build exactly once.</summary>
        public static BuildState ApplyCarryOver(BuildState build, CampaignState state)
        {
            if (build == null || state == null) throw new ArgumentNullException(build == null ? nameof(build) : nameof(state));
            const string flag = "campaign_budget_carry_applied";
            return build.HasFlag(flag) || state.CarriedBudgetM <= 0 ? build :
                build.WithLedger(new LedgerEntry(LedgerKind.Budget, "campaign_budget_carry", 0, 0,
                    budgetDeltaM: state.CarriedBudgetM)).WithFlag(flag);
        }

        /// <summary>Charges optional insurance, $M, once per mission build.</summary>
        public static BuildState ApplyInsurance(BuildState build, CampaignState state)
        {
            if (build == null || state == null) throw new ArgumentNullException(build == null ? nameof(build) : nameof(state));
            const string flag = "campaign_insurance_premium_applied";
            return !state.Insured || build.HasFlag(flag) ? build :
                build.WithLedger(new LedgerEntry(LedgerKind.Budget,
                    "campaign_insurance_premium", CampaignConstants.InsurancePremiumM, 0)).WithFlag(flag);
        }

        /// <summary>Supplier trust discount fraction, 0–0.10, proportional to reputation (game_value).</summary>
        public static double SupplierDiscountFraction(CampaignState state)
        {
            if (state == null) throw new ArgumentNullException(nameof(state));
            return CampaignConstants.MaximumSupplierDiscount * state.Reputation / 100.0;
        }

        /// <summary>Applies a supplier discount as a negative-cost ledger entry, not a new part price.</summary>
        public static BuildState ApplySupplierTrust(BuildState build, GameCatalog catalog, CampaignState state)
        {
            if (build == null || catalog == null || state == null) throw new ArgumentNullException(
                build == null ? nameof(build) : catalog == null ? nameof(catalog) : nameof(state));
            const string flag = "campaign_supplier_trust_applied";
            if (build.HasFlag(flag)) return build;
            double costM = 0;
            foreach (var chosen in build.Choices)
                costM += catalog.Part(chosen.Value).CostM;
            double discountM = costM * SupplierDiscountFraction(state);
            var adjusted = discountM > 0 ? build.WithLedger(new LedgerEntry(LedgerKind.Budget,
                "campaign_supplier_trust", -discountM, 0)) : build;
            return adjusted.WithFlag(flag);
        }
    }

    /// <summary>Offers two or three contracts using the campaign's deterministic PRNG stream.</summary>
    public static class ContractsBoard
    {
        /// <summary>Contract choices without repetitions; C0–C2 are initially available.</summary>
        public static IReadOnlyList<string> Offer(CampaignState state, ulong seed)
        {
            if (state == null) throw new ArgumentNullException(nameof(state));
            int top = state.Reputation >= CampaignConstants.ExpertContractReputation ? 8 :
                state.Reputation >= CampaignConstants.AdvancedContractReputation ? 6 :
                state.Reputation >= CampaignConstants.IntermediateContractReputation ? 4 : 2;
            var choices = new List<string>();
            for (int id = 0; id <= top; id++) choices.Add("C" + id);
            var rng = new SeededRandom(seed).ForStream("campaign");
            for (int i = choices.Count - 1; i > 0; i--)
            {
                int j = rng.NextInt(0, i + 1);
                string tmp = choices[i]; choices[i] = choices[j]; choices[j] = tmp;
            }
            return Array.AsReadOnly(choices.Take(state.Missions.Count % 2 == 0 ? 3 : 2).ToArray());
        }
    }

    /// <summary>One research node: KP price, dependencies, localisable keys and unlocked part IDs.</summary>
    public sealed class TechNode
    {
        /// <summary>Tech identifier.</summary>
        public string Id { get; }
        /// <summary>Knowledge Points required.</summary>
        public int CostKp { get; }
        /// <summary>Required node IDs, must already be purchased.</summary>
        public IReadOnlyList<string> Prerequisites { get; }
        /// <summary>Parts this node unlocks.</summary>
        public IReadOnlyList<string> PartIds { get; }
        /// <summary>Player-facing translated name key.</summary>
        public string NameKey => "campaign.tech." + Id + ".name";
        /// <summary>Player-facing real technology description key.</summary>
        public string RealTechKey => "campaign.tech." + Id + ".real_tech";

        /// <summary>Defines a node with immutable prerequisite and part lists.</summary>
        public TechNode(string id, int costKp, IEnumerable<string> prerequisites, IEnumerable<string> parts)
        {
            Id = id;
            CostKp = costKp;
            Prerequisites = Array.AsReadOnly(prerequisites.ToArray());
            PartIds = Array.AsReadOnly(parts.ToArray());
        }
    }

    /// <summary>Research unlocks from design 13.2. Prices/prerequisites are game_value.</summary>
    public static class TechTree
    {
        private static readonly IReadOnlyList<TechNode> NodesValue = Array.AsReadOnly(new[]
        {
            new TechNode("methalox", 10, Array.Empty<string>(),
                new[] { "eng_methalox_full_flow", "eng_methalox_vacuum" }),
            new TechNode("laser_comms", 12, Array.Empty<string>(), new[] { "comm_laser" }),
            new TechNode("terrain_relative", 16, new[] { "laser_comms" },
                new[] { "nav_terrain_relative" }),
            new TechNode("hiad", 18, new[] { "terrain_relative" },
                new[] { "tps_inflatable_decelerator" }),
            new TechNode("hot_staging", 8, Array.Empty<string>(), new[] { "sep_hot_staging" })
        });
        /// <summary>Available tech-tree nodes with defined part IDs.</summary>
        public static IReadOnlyList<TechNode> Nodes => NodesValue;

        /// <summary>True for advanced research parts in the tech tree.</summary>
        public static bool IsResearchPart(string id) =>
            NodesValue.Any(node => node.PartIds.Contains(id));

        /// <summary>Returns the purchased agency state, or throws when not eligible.</summary>
        public static CampaignState Purchase(CampaignState state, string techId)
        {
            if (state == null) throw new ArgumentNullException(nameof(state));
            var node = NodesValue.FirstOrDefault(n => n.Id == techId);
            if (node == null) throw new ArgumentException("Unknown tech node: " + techId, nameof(techId));
            if (state.PurchasedTech.Contains(techId)) throw new InvalidOperationException("Tech was already purchased.");
            if (node.CostKp > state.KnowledgePoints) throw new InvalidOperationException("Not enough Knowledge Points.");
            foreach (var prereq in node.Prerequisites)
                if (!state.PurchasedTech.Contains(prereq))
                    throw new InvalidOperationException("Missing research prerequisite: " + prereq);
            var unlocked = state.UnlockedParts.Concat(node.PartIds).Distinct(StringComparer.Ordinal).ToArray();
            var purchased = state.PurchasedTech.Concat(new[] { techId }).ToArray();
            return state.With(knowledgePoints: state.KnowledgePoints - node.CostKp,
                unlockedParts: unlocked, purchasedTech: purchased);
        }
    }
}
