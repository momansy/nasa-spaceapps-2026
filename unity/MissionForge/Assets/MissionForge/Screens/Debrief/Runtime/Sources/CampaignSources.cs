using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using MissionForge.Core.Build;
using MissionForge.Core.Campaign;
using MissionForge.Core.Data;
using Newtonsoft.Json.Linq;

namespace MissionForge.EndScreens.Sources
{
    /// <summary>A contract offered on the board (design 13.2): numbers from data/contracts.json, the offer from Core.</summary>
    public sealed class ContractOfferView
    {
        public string Id { get; set; } = "";
        public string NameKey { get; set; } = "";
        public string DestinationKey { get; set; } = "";
        /// <summary>Δv the contract needs, km/s (real_world_approximate, from the contract data).</summary>
        public double DeltaVKmS { get; set; }
        /// <summary>Contract budget, $M (game_value).</summary>
        public double BudgetM { get; set; }
        /// <summary>Contract schedule, days (game_value).</summary>
        public double ScheduleDays { get; set; }
        /// <summary>Difficulty bar 0–1: this contract's Δv over the hardest contract's Δv (presentation only).</summary>
        public double Difficulty01 { get; set; }
    }

    /// <summary>A tech-tree node (design 13.2), with Core's KP price and prerequisites.</summary>
    public sealed class TechNodeView
    {
        public string Id { get; set; } = "";
        public int CostKp { get; set; }
        public IReadOnlyList<string> Prerequisites { get; set; } = Array.Empty<string>();
        public IReadOnlyList<string> PartNameKeys { get; set; } = Array.Empty<string>();
        public bool Purchased { get; set; }
        public bool PrerequisitesMet { get; set; }
        public bool Affordable { get; set; }
        /// <summary>Name key of the node and of the real technology it represents (ui.host.campaign.tech.*).</summary>
        public string NameKey => "ui.host.campaign.tech." + Id + ".name";
        public string RealTechKey => "ui.host.campaign.tech." + Id + ".real_tech";
    }

    /// <summary>A recovered piece of hardware in the agency inventory, with Core's wear and refurbishment figures.</summary>
    public sealed class InventoryItemView
    {
        public string ItemId { get; set; } = "";
        public string PartId { get; set; } = "";
        public string PartNameKey { get; set; } = "";
        /// <summary>Part category (slot family) from the catalog, e.g. first_stage_engine.</summary>
        public string Category { get; set; } = "";
        public int Flights { get; set; }
        public bool Refurbished { get; set; }
        public bool Available { get; set; }
        /// <summary>Reliability change if reused as is, fraction (negative; Core Inventory.ApplyReuse).</summary>
        public double ReuseReliabilityDelta { get; set; }
        /// <summary>Refurbishment cost, $M, and time, days (Core Inventory.ApplyRefurbishment).</summary>
        public double RefurbishCostM { get; set; }
        public double RefurbishDays { get; set; }
    }

    /// <summary>A mission in the agency hall: its patch shows contract, grade and outcome.</summary>
    public sealed class MissionPatchView
    {
        public int Number { get; set; }
        public string ContractId { get; set; } = "";
        public string Outcome { get; set; } = "";
        public string Grade { get; set; } = "";
        public double Score { get; set; }
    }

    /// <summary>Everything the Campaign Hub (14.1 screen 15) shows; numbers come from Core and the contract data.</summary>
    public sealed class CampaignView
    {
        public string AgencyName { get; set; } = "";
        public string LogoId { get; set; } = "";
        public string HomeSiteNameKey { get; set; } = "";
        /// <summary>Reputation, 0–100 points (game_value).</summary>
        public int Reputation { get; set; }
        /// <summary>Supplier discount from reputation, fraction (Core Campaign.SupplierDiscountFraction).</summary>
        public double SupplierDiscount { get; set; }
        public int KnowledgePoints { get; set; }
        /// <summary>Budget carried into the next mission, $M.</summary>
        public double CarriedBudgetM { get; set; }
        public bool Insured { get; set; }
        public double InsurancePremiumM { get; set; }
        public double InsuranceRecoveryFraction { get; set; }
        public double InsuranceCapM { get; set; }
        public double BudgetCarryFraction { get; set; }
        public int SuccessReputation { get; set; }
        public int OnTimeBonus { get; set; }
        public IReadOnlyList<ContractOfferView> Offers { get; set; } = Array.Empty<ContractOfferView>();
        public IReadOnlyList<TechNodeView> Tech { get; set; } = Array.Empty<TechNodeView>();
        public IReadOnlyList<InventoryItemView> Inventory { get; set; } = Array.Empty<InventoryItemView>();
        public IReadOnlyList<(string id, bool reached)> Milestones { get; set; } = Array.Empty<(string, bool)>();
        public IReadOnlyList<MissionPatchView> Patches { get; set; } = Array.Empty<MissionPatchView>();
        public bool IsRehearsal { get; set; }
    }

    public interface ICampaignSource
    {
        bool IsRehearsal { get; }
        CampaignView Load();
    }

    /// <summary>Maps a Core <see cref="CampaignState"/> to the hub view through Core's rules (board, tech, inventory).</summary>
    public sealed class CoreCampaignAdapter
    {
        /// <summary>The five campaign milestones of Core CampaignRules, in order (design 13.2).</summary>
        public static readonly string[] MilestoneIds = { "first_orbit", "first_recovery", "first_crew", "first_lunar_flyby", "first_mars_landing" };

        private readonly GameCatalog _catalog;
        private readonly Dictionary<string, JToken> _contracts = new Dictionary<string, JToken>(StringComparer.Ordinal);
        private readonly double _maxDv;

        public CoreCampaignAdapter(IReadOnlyDictionary<string, string> dataFiles)
        {
            if (dataFiles == null) throw new ArgumentNullException(nameof(dataFiles));
            _catalog = CatalogLoader.Load(dataFiles, "en", lenient: true);
            string contracts = CoreDebriefAdapter.Find(dataFiles, "contracts.json");
            foreach (JToken c in (JObject.Parse(contracts)["contracts"] as JArray) ?? new JArray()) _contracts[(string)c["id"]] = c;
            _maxDv = _contracts.Values.Select(c => (double?)c["delta_v_required_km_s"] ?? 0.0).DefaultIfEmpty(1.0).Max();
        }

        public CampaignView Build(CampaignState state, ulong seed, bool rehearsal)
        {
            if (state == null) throw new ArgumentNullException(nameof(state));
            var offers = ContractsBoard.Offer(state, seed).Select(Offer).ToList();
            var tech = TechTree.Nodes.Select(n => new TechNodeView
            {
                Id = n.Id,
                CostKp = n.CostKp,
                Prerequisites = n.Prerequisites,
                PartNameKeys = n.PartIds.Select(p => "part." + p + ".name").ToList(),
                Purchased = state.PurchasedTech.Contains(n.Id),
                PrerequisitesMet = n.Prerequisites.All(state.PurchasedTech.Contains),
                Affordable = state.KnowledgePoints >= n.CostKp,
            }).ToList();

            var inventory = new Inventory(state);
            var items = state.InventoryItems.Select(i => ItemView(inventory, i)).ToList();
            var site = state.HomeLaunchSite;

            return new CampaignView
            {
                AgencyName = state.AgencyName,
                LogoId = state.LogoId,
                HomeSiteNameKey = string.IsNullOrEmpty(site) ? "" : "part." + site + ".name",
                Reputation = state.Reputation,
                SupplierDiscount = Campaign.SupplierDiscountFraction(state),
                KnowledgePoints = state.KnowledgePoints,
                CarriedBudgetM = state.CarriedBudgetM,
                Insured = state.Insured,
                InsurancePremiumM = CampaignConstants.InsurancePremiumM,
                InsuranceRecoveryFraction = CampaignConstants.InsuranceFailureRecoveryFraction,
                InsuranceCapM = CampaignConstants.InsuranceClaimCapM,
                BudgetCarryFraction = CampaignConstants.BudgetCarryFraction,
                SuccessReputation = CampaignConstants.SuccessReputation,
                OnTimeBonus = CampaignConstants.OnTimeBonus,
                Offers = offers,
                Tech = tech,
                Inventory = items,
                Milestones = MilestoneIds.Select(m => (m, state.Milestones.Contains(m))).ToList(),
                Patches = state.Missions.Select((m, k) => new MissionPatchView
                {
                    Number = k + 1, ContractId = m.ContractId, Outcome = m.Outcome.ToString(), Grade = m.Grade, Score = m.Score,
                }).ToList(),
                IsRehearsal = rehearsal,
            };
        }

        private ContractOfferView Offer(string id)
        {
            _contracts.TryGetValue(id, out JToken c);
            double dv = (double?)c?["delta_v_required_km_s"] ?? 0.0;
            return new ContractOfferView
            {
                Id = id,
                NameKey = (string)c?["name_key"] ?? "contract." + id + ".name",
                DestinationKey = (string)c?["destination"]?["description_key"] ?? "contract." + id + ".destination",
                DeltaVKmS = dv,
                BudgetM = (double?)c?["budget_M"] ?? 0.0,
                ScheduleDays = (double?)c?["schedule_days"] ?? 0.0,
                Difficulty01 = _maxDv > 0 ? dv / _maxDv : 0.0,
            };
        }

        private InventoryItemView ItemView(Inventory inventory, InventoryItem item)
        {
            var view = new InventoryItemView
            {
                ItemId = item.ItemId,
                PartId = item.PartId,
                PartNameKey = "part." + item.PartId + ".name",
                Flights = item.Flights,
                Refurbished = item.Refurbished,
                Available = item.Available,
            };
            if (!item.Available) return view;
            try
            {
                PartDef part = _catalog.Part(item.PartId);
                view.Category = part.Category;
                BuildState build = BuildState.New("C1", 1UL).WithChoice(part.Category, part.Id);
                BuildState reused = inventory.ApplyReuse(build, _catalog, item.ItemId, part.Category);
                view.ReuseReliabilityDelta = reused.Condition(part.Category).ReliabilityDelta;
                BuildState refurbished = inventory.ApplyRefurbishment(build, _catalog, item.ItemId);
                LedgerEntry entry = refurbished.Ledger.LastOrDefault();
                view.RefurbishCostM = entry?.CostM ?? 0.0;
                view.RefurbishDays = entry?.Days ?? 0.0;
            }
            catch (Exception e) when (e is ArgumentException || e is InvalidOperationException || e is KeyNotFoundException)
            {
                // Hardware Core cannot price for reuse keeps its flight count only.
            }
            return view;
        }
    }

    /// <summary>Campaign source reading a rehearsal fixture: <c>{"seed": "…", "state": CampaignState JSON}</c>.</summary>
    public sealed class FixtureCampaignSource : ICampaignSource
    {
        private readonly CoreCampaignAdapter _adapter;

        public FixtureCampaignSource(CoreCampaignAdapter adapter, string fixtureJson)
        {
            _adapter = adapter ?? throw new ArgumentNullException(nameof(adapter));
            JObject o = JObject.Parse(fixtureJson);
            Seed = ulong.Parse((string)o["seed"] ?? "1", CultureInfo.InvariantCulture);
            State = CampaignState.FromJson(o["state"].ToString());
        }

        public ulong Seed { get; }
        public CampaignState State { get; }
        public bool IsRehearsal => true;
        public CampaignView Load() => _adapter.Build(State, Seed, true);
    }

    /// <summary>Campaign source for a live campaign (T014's CampaignState held by the session).</summary>
    public sealed class CoreCampaignSource : ICampaignSource
    {
        private readonly CoreCampaignAdapter _adapter;
        private readonly CampaignState _state;
        private readonly ulong _seed;

        public CoreCampaignSource(CoreCampaignAdapter adapter, CampaignState state, ulong seed)
        {
            _adapter = adapter ?? throw new ArgumentNullException(nameof(adapter));
            _state = state ?? throw new ArgumentNullException(nameof(state));
            _seed = seed;
        }

        public bool IsRehearsal => false;
        public CampaignView Load() => _adapter.Build(_state, _seed, false);
    }
}
