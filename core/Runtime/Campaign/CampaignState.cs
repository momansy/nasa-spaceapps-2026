#nullable enable
using System;
using System.Collections.Generic;
using System.Linq;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

namespace MissionForge.Core.Campaign
{
    /// <summary>Game-balancing numbers not fixed by design section 13. All are game_value.</summary>
    public static class CampaignConstants
    {
        /// <summary>Reputation gained for success, points (game_value).</summary>
        public const int SuccessReputation = 8;
        /// <summary>Reputation gained for a partial mission, points (game_value).</summary>
        public const int PartialReputation = 3;
        /// <summary>Reputation lost for failure, points (game_value).</summary>
        public const int FailureReputation = -8;
        /// <summary>Bonus reputation for on-time delivery, points (game_value).</summary>
        public const int OnTimeBonus = 2;
        /// <summary>Reputation lost for missing the deadline, points (game_value).</summary>
        public const int LatePenalty = -3;
        /// <summary>Fraction of unused budget carried forward, 0–1 (game_value).</summary>
        public const double BudgetCarryFraction = 0.25;
        /// <summary>Highest supplier-trust discount on part costs, fraction (game_value).</summary>
        public const double MaximumSupplierDiscount = 0.10;
        /// <summary>Insurance premium charged before a mission, $M (game_value).</summary>
        public const double InsurancePremiumM = 3.0;
        /// <summary>Fraction of unspent starting budget returned by insurance on failure (game_value).</summary>
        public const double InsuranceFailureRecoveryFraction = 0.20;
        /// <summary>Highest insurance claim, $M (game_value).</summary>
        public const double InsuranceClaimCapM = 8.0;
        /// <summary>Part price refunded when reusable hardware is installed, fraction (game_value).</summary>
        public const double ReuseRefundFraction = 0.35;
        /// <summary>Reliability reduction per unrefurbished reuse, fraction (game_value).</summary>
        public const double WearReliabilityPenalty = 0.01;
        /// <summary>Fraction of part price charged for refurbishment, game_value.</summary>
        public const double RefurbishmentCostFraction = 0.10;
        /// <summary>Refurbishment schedule days, game_value.</summary>
        public const double RefurbishmentDays = 2.0;
        /// <summary>Budget Crunch budget limit, $M (game_value).</summary>
        public const double BudgetCrunchM = 25.0;
        /// <summary>Reputation threshold for C3/C4, points (game_value).</summary>
        public const int IntermediateContractReputation = 25;
        /// <summary>Reputation threshold for C5/C6, points (game_value).</summary>
        public const int AdvancedContractReputation = 50;
        /// <summary>Reputation threshold for C7/C8, points (game_value).</summary>
        public const int ExpertContractReputation = 75;
        /// <summary>Team name maximum length in Unicode UTF-16 code units, game_value.</summary>
        public const int TeamNameMaxLength = 24;
    }

    /// <summary>The outcome of one mission, independent of the Flight/Scoring/Session implementation.</summary>
    public enum MissionOutcome { Success, Partial, Failure }

    /// <summary>Recovered physical hardware held between missions (design 13.2).</summary>
    public sealed class InventoryItem
    {
        /// <summary>Unique stable ID within the agency inventory, not a player ID.</summary>
        public string ItemId { get; }
        /// <summary>Catalog part identifier.</summary>
        public string PartId { get; }
        /// <summary>Flight count including the recovery that created the item.</summary>
        public int Flights { get; }
        /// <summary>True when the hardware was refurbished since its last flight.</summary>
        public bool Refurbished { get; }

        /// <summary>Creates an inventory entry with validated flight count.</summary>
        [JsonConstructor]
        public InventoryItem(string itemId, string partId, int flights, bool refurbished)
        {
            if (string.IsNullOrWhiteSpace(itemId) || string.IsNullOrWhiteSpace(partId))
                throw new ArgumentException("Inventory IDs must not be blank.");
            if (flights < 1) throw new ArgumentOutOfRangeException(nameof(flights));
            ItemId = itemId;
            PartId = partId;
            Flights = flights;
            Refurbished = refurbished;
        }

        /// <summary>Returns a copy after another flight, or after refurbishment.</summary>
        public InventoryItem With(int? flights = null, bool? refurbished = null) =>
            new InventoryItem(ItemId, PartId, flights ?? Flights, refurbished ?? Refurbished);
    }

    /// <summary>Host-supplied debrief, with SI-aligned game financial units ($M) and days.</summary>
    public sealed class MissionReport
    {
        /// <summary>Contract ID, C0–C8.</summary>
        public string ContractId { get; }
        /// <summary>Protocol GameMode token, e.g. CAMPAIGN.</summary>
        public string Mode { get; }
        /// <summary>Outcome decided by the mission simulation.</summary>
        public MissionOutcome Outcome { get; }
        /// <summary>Game score, points.</summary>
        public double Score { get; }
        /// <summary>Debrief grade label.</summary>
        public string Grade { get; }
        /// <summary>Unused mission budget, $M.</summary>
        public double BudgetRemainingM { get; }
        /// <summary>Original mission budget, $M, needed for insurance/efficiency calculations.</summary>
        public double BudgetInitialM { get; }
        /// <summary>Time before the deadline, days; negative means late.</summary>
        public double ScheduleMarginDays { get; }
        /// <summary>Whether the mission was completed on time.</summary>
        public bool OnTime { get; }
        /// <summary>Knowledge Points earned in this mission.</summary>
        public int KnowledgePointsEarned { get; }
        /// <summary>Recovered hardware part IDs, if any.</summary>
        public IReadOnlyList<string> RecoveredHardware { get; }
        /// <summary>Failure mode ID; empty when none.</summary>
        public string FailureMode { get; }
        /// <summary>Met objective IDs, e.g. orbit, recovery, crew, lunar_flyby, mars_landing.</summary>
        public IReadOnlyList<string> MetObjectives { get; }

        /// <summary>Pure debrief record; its author supplies all numbers and IDs.</summary>
        [JsonConstructor]
        public MissionReport(string contractId, string mode, MissionOutcome outcome, double score,
            string grade, double budgetRemainingM, double budgetInitialM, double scheduleMarginDays,
            bool onTime, int knowledgePointsEarned, IEnumerable<string>? recoveredHardware,
            string? failureMode, IEnumerable<string>? metObjectives)
        {
            if (string.IsNullOrWhiteSpace(contractId)) throw new ArgumentException("Contract is required.", nameof(contractId));
            if (double.IsNaN(score) || double.IsInfinity(score) || double.IsNaN(budgetRemainingM) ||
                double.IsInfinity(budgetRemainingM) || double.IsNaN(budgetInitialM) ||
                double.IsInfinity(budgetInitialM) || double.IsNaN(scheduleMarginDays) ||
                double.IsInfinity(scheduleMarginDays) || budgetInitialM < 0 || knowledgePointsEarned < 0)
                throw new ArgumentOutOfRangeException(nameof(score), "Report numbers must be finite and valid.");
            ContractId = contractId;
            Mode = mode ?? "QUICK";
            Outcome = outcome;
            Score = score;
            Grade = grade ?? "";
            BudgetRemainingM = budgetRemainingM;
            BudgetInitialM = budgetInitialM;
            ScheduleMarginDays = scheduleMarginDays;
            OnTime = onTime;
            KnowledgePointsEarned = knowledgePointsEarned;
            RecoveredHardware = Array.AsReadOnly((recoveredHardware ?? Array.Empty<string>()).ToArray());
            FailureMode = failureMode ?? "";
            MetObjectives = Array.AsReadOnly((metObjectives ?? Array.Empty<string>()).ToArray());
        }
    }

    /// <summary>One observable change to a persistent agency campaign and why it happened.</summary>
    public sealed class CampaignChange
    {
        /// <summary>Machine-readable reason, such as mission_success or budget_carry_over.</summary>
        public string Reason { get; }
        /// <summary>Reputation change in points.</summary>
        public int ReputationDelta { get; }
        /// <summary>Knowledge Points change.</summary>
        public int KnowledgePointsDelta { get; }
        /// <summary>Carried budget change, $M.</summary>
        public double BudgetDeltaM { get; }

        /// <summary>Records an auditable numeric delta (all unspecified deltas are zero).</summary>
        public CampaignChange(string reason, int reputationDelta = 0, int knowledgePointsDelta = 0, double budgetDeltaM = 0)
        {
            Reason = reason ?? throw new ArgumentNullException(nameof(reason));
            ReputationDelta = reputationDelta;
            KnowledgePointsDelta = knowledgePointsDelta;
            BudgetDeltaM = budgetDeltaM;
        }
    }

    /// <summary>A newly reached milestone with IDs for cinematic playback and Codex unlocking.</summary>
    public sealed class CampaignMilestone
    {
        /// <summary>Milestone ID.</summary>
        public string Id { get; }
        /// <summary>Cinematic asset ID.</summary>
        public string CinematicId => "campaign_" + Id;
        /// <summary>Codex unlock ID.</summary>
        public string CodexId => "codex_campaign_" + Id;
        /// <summary>Creates a milestone event.</summary>
        public CampaignMilestone(string id) { Id = id ?? throw new ArgumentNullException(nameof(id)); }
    }

    /// <summary>Immutable campaign state, versioned for host-owned JSON persistence.</summary>
    public sealed class CampaignState
    {
        /// <summary>Current serialized schema version. Unknown versions are rejected.</summary>
        public int Version => 1;
        /// <summary>Agency display name.</summary>
        public string AgencyName { get; }
        /// <summary>Chosen logo asset ID.</summary>
        public string LogoId { get; }
        /// <summary>Home launch-site part ID.</summary>
        public string HomeLaunchSite { get; }
        /// <summary>Reputation from 0–100 points.</summary>
        public int Reputation { get; }
        /// <summary>Available Knowledge Points.</summary>
        public int KnowledgePoints { get; }
        /// <summary>Carried budget, $M.</summary>
        public double CarriedBudgetM { get; }
        /// <summary>Part identifiers unlocked by research.</summary>
        public IReadOnlyList<string> UnlockedParts { get; }
        /// <summary>Purchased technology node IDs.</summary>
        public IReadOnlyList<string> PurchasedTech { get; }
        /// <summary>Recoverable inventory items.</summary>
        public IReadOnlyList<InventoryItem> InventoryItems { get; }
        /// <summary>Completed milestone IDs.</summary>
        public IReadOnlyList<string> Milestones { get; }
        /// <summary>All mission reports in chronological insertion order.</summary>
        public IReadOnlyList<MissionReport> Missions { get; }
        /// <summary>Previously awarded achievement IDs.</summary>
        public IReadOnlyList<string> Achievements { get; }
        /// <summary>Insurance enabled for the next mission.</summary>
        public bool Insured { get; }

        /// <summary>Creates a new agency with starting reputation and no carried resources.</summary>
        public static CampaignState New(string agencyName, string logoId, string homeLaunchSite) =>
            new CampaignState(agencyName, logoId, homeLaunchSite, 0, 0, 0, null, null, null, null, null, null, false);

        /// <summary>Explicit constructor for stable, validated JSON round trips.</summary>
        [JsonConstructor]
        public CampaignState(string agencyName, string logoId, string homeLaunchSite, int reputation,
            int knowledgePoints, double carriedBudgetM, IEnumerable<string>? unlockedParts,
            IEnumerable<string>? purchasedTech, IEnumerable<InventoryItem>? inventoryItems,
            IEnumerable<string>? milestones, IEnumerable<MissionReport>? missions,
            IEnumerable<string>? achievements, bool insured)
        {
            if (string.IsNullOrWhiteSpace(agencyName)) throw new ArgumentException("Agency name is required.", nameof(agencyName));
            if (reputation < 0 || reputation > 100) throw new ArgumentOutOfRangeException(nameof(reputation));
            if (knowledgePoints < 0 || carriedBudgetM < 0 || double.IsNaN(carriedBudgetM) ||
                double.IsInfinity(carriedBudgetM)) throw new ArgumentOutOfRangeException(nameof(carriedBudgetM));
            AgencyName = agencyName;
            LogoId = logoId ?? "";
            HomeLaunchSite = homeLaunchSite ?? "";
            Reputation = reputation;
            KnowledgePoints = knowledgePoints;
            CarriedBudgetM = carriedBudgetM;
            UnlockedParts = Frozen(unlockedParts);
            PurchasedTech = Frozen(purchasedTech);
            InventoryItems = Frozen(inventoryItems);
            Milestones = Frozen(milestones);
            Missions = Frozen(missions);
            Achievements = Frozen(achievements);
            Insured = insured;
        }

        private static IReadOnlyList<T> Frozen<T>(IEnumerable<T>? entries) =>
            Array.AsReadOnly((entries ?? Array.Empty<T>()).ToArray());

        /// <summary>A new state with selected fields changed; does not mutate the current state.</summary>
        public CampaignState With(int? reputation = null, int? knowledgePoints = null, double? carriedBudgetM = null,
            IEnumerable<string>? unlockedParts = null, IEnumerable<string>? purchasedTech = null,
            IEnumerable<InventoryItem>? inventoryItems = null, IEnumerable<string>? milestones = null,
            IEnumerable<MissionReport>? missions = null, IEnumerable<string>? achievements = null, bool? insured = null) =>
            new CampaignState(AgencyName, LogoId, HomeLaunchSite, reputation ?? Reputation,
                knowledgePoints ?? KnowledgePoints, carriedBudgetM ?? CarriedBudgetM,
                unlockedParts ?? UnlockedParts, purchasedTech ?? PurchasedTech, inventoryItems ?? InventoryItems,
                milestones ?? Milestones, missions ?? Missions, achievements ?? Achievements, insured ?? Insured);

        /// <summary>Serializes the entire state to host-persistable JSON text without disk I/O.</summary>
        public string ToJson() => JsonConvert.SerializeObject(this, Formatting.None);

        /// <summary>Parses versioned JSON, rejecting unsupported or absent versions.</summary>
        public static CampaignState FromJson(string json)
        {
            if (json == null) throw new ArgumentNullException(nameof(json));
            var data = JObject.Parse(json);
            int? version = data.Value<int?>("Version") ?? data.Value<int?>("version");
            if (version != 1) throw new NotSupportedException($"Unsupported campaign save version: {version?.ToString() ?? "missing"}.");
            return JsonConvert.DeserializeObject<CampaignState>(json)
                ?? throw new JsonSerializationException("Campaign save was empty.");
        }
    }

    /// <summary>Campaign update: next state plus an auditable list of reasons and milestone events.</summary>
    public sealed class CampaignUpdate
    {
        /// <summary>New immutable campaign state.</summary>
        public CampaignState State { get; }
        /// <summary>Numeric deltas and their reasons.</summary>
        public IReadOnlyList<CampaignChange> Changes { get; }
        /// <summary>New milestones, each emitted once.</summary>
        public IReadOnlyList<CampaignMilestone> MilestoneEvents { get; }
        /// <summary>Creates an update.</summary>
        public CampaignUpdate(CampaignState state, IEnumerable<CampaignChange> changes,
            IEnumerable<CampaignMilestone>? milestoneEvents = null)
        {
            State = state ?? throw new ArgumentNullException(nameof(state));
            Changes = Array.AsReadOnly((changes ?? throw new ArgumentNullException(nameof(changes))).ToArray());
            MilestoneEvents = Array.AsReadOnly((milestoneEvents ?? Array.Empty<CampaignMilestone>()).ToArray());
        }
    }
}
