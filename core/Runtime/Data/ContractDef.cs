#nullable enable
using System;
using System.Collections.Generic;

namespace MissionForge.Core.Data
{
    /// <summary>One vote round a contract runs: its slot, the part category and the part IDs it offers (design 6.2).</summary>
    public sealed class ContractVote
    {
        /// <summary>Creates a vote definition. <paramref name="slot"/> defaults to the category (with stage for per-stage categories).</summary>
        public ContractVote(string category, IReadOnlyList<string> optionIds, string? slot = null, string? stage = null, int step = 0)
        {
            Category = category ?? throw new ArgumentNullException(nameof(category));
            OptionIds = optionIds ?? Array.Empty<string>();
            ExplicitOptions = OptionIds.Count > 0;
            Stage = stage;
            Slot = slot ?? Slots.For(category, stage);
            Step = step;
        }

        /// <summary>Vote slot ID (data: vote <c>id</c>, e.g. <c>first_stage_tank_size</c>); the key of the choice in a build.</summary>
        public string Slot { get; }
        /// <summary>Part category the options come from (see <see cref="PartCategories"/>).</summary>
        public string Category { get; }
        /// <summary><c>first</c> or <c>upper</c> for per-stage votes, else null.</summary>
        public string? Stage { get; }
        /// <summary>Step number of design 6.2 (1–21); sub-votes share a step. 0 when unknown.</summary>
        public int Step { get; }
        /// <summary>
        /// Part IDs offered, in display order. When data lists none, <see cref="GameCatalog"/> fills them with the
        /// parts of <see cref="Category"/> offered for the contract (and, for per-stage votes, made for that stage),
        /// in data order (data README: "otherwise the options are the parts of the category…").
        /// </summary>
        public IReadOnlyList<string> OptionIds { get; internal set; }

        /// <summary>True when data listed the options explicitly.</summary>
        public bool ExplicitOptions { get; internal set; } = true;

        /// <summary>
        /// True when the part may be offered in this vote as far as its stage goes. An <c>engine_count</c> vote of a stage
        /// accepts only parts whose <c>stats.stage</c> equals the vote's stage (a 9-engine first-stage cluster is never an
        /// upper-stage option). A part that states no stage (test fixtures only; all data parts state one) is accepted. Other votes accept every part.
        /// </summary>
        public bool AcceptsStage(PartDef part) =>
            Category != PartCategories.EngineCount || Stage == null || part.Stats.Stage == null || part.Stats.Stage == Stage;
    }

    /// <summary>
    /// A mission contract (design section 5). Masses kg, speeds m/s, money $M (game), time days (game).
    /// </summary>
    public sealed class ContractDef
    {
        /// <summary>Creates a contract definition. Prefer <see cref="CatalogLoader"/> for data files.</summary>
        public ContractDef(
            string id, string name, double payloadMassKg, double dvRequiredMps, double budgetM, double scheduleDays,
            IReadOnlyList<ContractVote> votes,
            double? inclinationDeg = null, bool crewed = false, bool returning = false, double? entrySpeedMps = null,
            int requiredUpperStageStarts = 1, bool longCoast = false, bool science = false,
            double? payloadDiameterM = null, double launchWindowIntervalDays = 30, bool boosterLandingRequired = false,
            string? destination = null, bool campaign = false, bool? heatShieldRequired = null)
        {
            Id = id ?? throw new ArgumentNullException(nameof(id));
            Name = name ?? id;
            PayloadMassKg = payloadMassKg;
            DvRequiredMps = dvRequiredMps;
            BudgetM = budgetM;
            ScheduleDays = scheduleDays;
            Votes = votes ?? Array.Empty<ContractVote>();
            InclinationDeg = inclinationDeg;
            Crewed = crewed;
            Returning = returning;
            EntrySpeedMps = entrySpeedMps;
            RequiredUpperStageStarts = Math.Max(1, requiredUpperStageStarts);
            LongCoast = longCoast;
            Science = science;
            PayloadDiameterM = payloadDiameterM;
            LaunchWindowIntervalDays = launchWindowIntervalDays;
            BoosterLandingRequired = boosterLandingRequired;
            Destination = destination ?? "";
            Campaign = campaign;
            HeatShieldRequired = heatShieldRequired ?? returning;
        }

        /// <summary>Contract ID, e.g. <c>C1</c>.</summary>
        public string Id { get; }
        /// <summary>Display name.</summary>
        public string Name { get; }
        /// <summary>Destination description key or text.</summary>
        public string Destination { get; }
        /// <summary>
        /// Base payload mass, kg (game value). Payload-bay parts (instrument, capsule, heat shield, …)
        /// add their own masses on top of this.
        /// </summary>
        public double PayloadMassKg { get; }
        /// <summary>Δv needed from the pad including gravity and drag losses, m/s (real-world approximate).</summary>
        public double DvRequiredMps { get; }
        /// <summary>Budget, $M (game value).</summary>
        public double BudgetM { get; }
        /// <summary>Schedule: days until the launch date (game value).</summary>
        public double ScheduleDays { get; }
        /// <summary>Target orbit inclination, degrees, or null when the launch azimuth is free.</summary>
        public double? InclinationDeg { get; }
        /// <summary>Crewed contract: launch escape required, crew safety dominates.</summary>
        public bool Crewed { get; }
        /// <summary>The payload returns through an atmosphere (needs a heat shield).</summary>
        public bool Returning { get; }
        /// <summary>
        /// A heat shield is required (data <c>requirements.heat_shield_required</c>). Defaults to <see cref="Returning"/> when the
        /// field is absent. False for C0: a suborbital return needs no shield (game decision, see contracts.json).
        /// </summary>
        public bool HeatShieldRequired { get; }
        /// <summary>Entry speed the heat shield must survive, m/s (real-world approximate), or null.</summary>
        public double? EntrySpeedMps { get; }
        /// <summary>Number of upper-stage engine starts the mission needs (first ignition counts as one).</summary>
        public int RequiredUpperStageStarts { get; }
        /// <summary>Mission includes a long coast (boil-off matters).</summary>
        public bool LongCoast { get; }
        /// <summary>Science payload (contamination cards, data budget matter).</summary>
        public bool Science { get; }
        /// <summary>Fixed payload diameter in m (if the contract fixes it), otherwise taken from payload parts.</summary>
        public double? PayloadDiameterM { get; }
        /// <summary>Days between launch windows; a missed deadline slips by this much (game value; Mars ≈ 780 days, physical approximate).</summary>
        public double LaunchWindowIntervalDays { get; }
        /// <summary>The booster must land (C8).</summary>
        public bool BoosterLandingRequired { get; }
        /// <summary>Played in Agency Campaign mode (budget cut cards more likely).</summary>
        public bool Campaign { get; }
        /// <summary>Votes in order, each with its 3–5 offered options.</summary>
        public IReadOnlyList<ContractVote> Votes { get; }

        /// <summary>Finds the vote of a slot, or null when the contract skips it.</summary>
        public ContractVote? VoteFor(string slot)
        {
            for (int i = 0; i < Votes.Count; i++) if (Votes[i].Slot == slot) return Votes[i];
            return null;
        }
    }
}
