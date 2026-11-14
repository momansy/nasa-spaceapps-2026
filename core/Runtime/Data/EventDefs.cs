#nullable enable
using System;
using System.Collections.Generic;

namespace MissionForge.Core.Data
{
    /// <summary>
    /// A generic build-phase effect used by test results, anomaly responses and reviews.
    /// All fields default to "no effect". Money in $M (game), time in days (game).
    /// </summary>
    public sealed class EffectDef
    {
        /// <summary>The empty effect.</summary>
        public static readonly EffectDef None = new EffectDef();

        /// <summary>Money spent, $M.</summary>
        public double CostM { get; set; }
        /// <summary>Money spent as a fraction of the cost of the targeted part (e.g. 0.3 for a re-integration fee).</summary>
        public double CostPartFraction { get; set; }
        /// <summary>Serial schedule days added (negative removes days).</summary>
        public double Days { get; set; }
        /// <summary>Procurement days added to the targeted part's lead time (only matters on the critical path).</summary>
        public double LeadDays { get; set; }
        /// <summary>Change of the total budget as a fraction of the contract budget (budget cut −0.10, emergency funding +0.10).</summary>
        public double BudgetFraction { get; set; }
        /// <summary>Absolute change of the total budget, $M (game).</summary>
        public double BudgetM { get; set; }
        /// <summary>Reliability change of the targeted part, fraction (−0.02 = −2 percentage points).</summary>
        public double ReliabilityDelta { get; set; }
        /// <summary>Uncertainty-band scale of the targeted part (0.5 halves the band).</summary>
        public double BandScale { get; set; } = 1.0;
        /// <summary>Δv bonus of the targeted engine as a fraction of its stage Δv (+0.02 = +2%).</summary>
        public double DvBonusFraction { get; set; }
        /// <summary>Extra dry mass added to the payload stack, kg.</summary>
        public double MassKg { get; set; }
        /// <summary>Science score multiplier change, fraction (−0.2 = 20% less science).</summary>
        public double SciencePenaltyFraction { get; set; }
        /// <summary>
        /// A vote slot the team must re-vote (part swap, downgrade, bigger tank), or <see cref="ReopenTarget"/> to
        /// reopen the slot the card targets.
        /// </summary>
        public string? ReopenCategory { get; set; }

        /// <summary>Value of <see cref="ReopenCategory"/> meaning "the slot this card is about".</summary>
        public const string ReopenTarget = "@target";
        /// <summary>Uses PM's once-per-mission Emergency Funding.</summary>
        public bool UsesEmergencyFunding { get; set; }
        /// <summary>Fixes the revealed flaw of the targeted part.</summary>
        public bool FixesFlaw { get; set; }
        /// <summary>Flags set on the build (e.g. <c>guaranteed_alarm_minigame</c>, <c>scrub_risk</c>).</summary>
        public IReadOnlyList<string> AddFlags { get; set; } = Array.Empty<string>();
        /// <summary>Minigame started by this response, or null.</summary>
        public string? MinigameId { get; set; }
    }

    /// <summary>How a test's cost is set (design 6.6).</summary>
    public enum TestCostKind
    {
        /// <summary>A fixed amount in $M.</summary>
        Fixed,
        /// <summary>A fraction of the tested part's cost.</summary>
        PartFraction,
        /// <summary>A range scaled by stage size (static fire $2–8 M).</summary>
        StageScaled,
    }

    /// <summary>An optional test (design 6.6).</summary>
    public sealed class TestDef
    {
        /// <summary>Test ID, e.g. <c>engine_hot_fire</c>.</summary>
        public string Id { get; set; } = "";
        /// <summary>Display name.</summary>
        public string Name { get; set; } = "";
        /// <summary>
        /// What the test applies to: category IDs or groups <c>any</c>, <c>engine</c>, <c>stage</c>, <c>first_stage</c>,
        /// <c>vehicle</c>, <c>payload</c>, <c>avionics</c>, <c>gnc</c>, <c>parachute</c>, <c>heat_shield</c>.
        /// </summary>
        public IReadOnlyList<string> AppliesTo { get; set; } = Array.Empty<string>();
        /// <summary>How the cost is computed.</summary>
        public TestCostKind CostKind { get; set; }
        /// <summary>Fixed cost, or minimum of a range, $M.</summary>
        public double CostM { get; set; }
        /// <summary>Maximum of a range, $M.</summary>
        public double CostMaxM { get; set; }
        /// <summary>Fraction of the part cost (component qualification 0.05, hot-fire 0.10).</summary>
        public double CostPartFraction { get; set; }
        /// <summary>Schedule days added (game value).</summary>
        public double Days { get; set; }
        /// <summary>Uncertainty band scale after the test (0.5 = narrows 50%).</summary>
        public double BandScale { get; set; } = 1.0;
        /// <summary>Reliability bonus, fraction (+0.01 for hot-fire).</summary>
        public double ReliabilityBonus { get; set; }
        /// <summary>Probability (0–1) that a hidden flaw in a tested part is revealed (game value).</summary>
        public double RevealChance { get; set; } = 0.8;
        /// <summary>Risk flags cleared by running the test (e.g. <c>pogo</c>, <c>software_fault</c>, <c>combustion_instability</c>).</summary>
        public IReadOnlyList<string> ClearsRisks { get; set; } = Array.Empty<string>();
        /// <summary>Minigame that improves this test, or null.</summary>
        public string? MinigameId { get; set; }
    }

    /// <summary>One weighting condition of an anomaly card ("higher for single-source parts").</summary>
    public sealed class AnomalyTrigger
    {
        /// <summary>Condition ID evaluated by <c>MissionForge.Core.Build.AnomalyConditions</c>.</summary>
        public string Condition { get; set; } = "";
        /// <summary>Weight multiplier applied when the condition holds.</summary>
        public double Multiplier { get; set; } = 1.0;
    }

    /// <summary>A response option of an anomaly card (quick vote).</summary>
    public sealed class AnomalyResponse
    {
        /// <summary>Response ID, unique within the card.</summary>
        public string Id { get; set; } = "";
        /// <summary>Text key of the response label.</summary>
        public string TextKey { get; set; } = "";
        /// <summary>Effect of choosing this response.</summary>
        public EffectDef Effect { get; set; } = EffectDef.None;
    }

    /// <summary>An anomaly card (design 6.8).</summary>
    public sealed class AnomalyDef
    {
        /// <summary>Card ID, e.g. <c>supplier_delay</c>.</summary>
        public string Id { get; set; } = "";
        /// <summary>Display name.</summary>
        public string Name { get; set; } = "";
        /// <summary>Base draw weight (game value).</summary>
        public double BaseWeight { get; set; } = 1.0;
        /// <summary>
        /// Condition that must hold for the card to be drawable at all (e.g. <c>flaw_revealed</c> for Test Failure),
        /// or null when the card is always eligible.
        /// </summary>
        public string? RequiresCondition { get; set; }
        /// <summary>Weighting conditions.</summary>
        public IReadOnlyList<AnomalyTrigger> Triggers { get; set; } = Array.Empty<AnomalyTrigger>();
        /// <summary>
        /// Which part a response acts on: <c>single_source_part</c>, <c>longest_lead_part</c>, <c>flawed_part</c>,
        /// <c>engine</c>, <c>payload</c>, <c>pressure_fed_part</c>, or null for the whole build.
        /// </summary>
        public string? Target { get; set; }
        /// <summary>Effect applied when the card is drawn, before the response (e.g. budget cut −10%).</summary>
        public EffectDef OnDraw { get; set; } = EffectDef.None;
        /// <summary>Response options (2–3).</summary>
        public IReadOnlyList<AnomalyResponse> Responses { get; set; } = Array.Empty<AnomalyResponse>();

        /// <summary>Finds a response by ID or returns null.</summary>
        public AnomalyResponse? Response(string id)
        {
            for (int i = 0; i < Responses.Count; i++) if (Responses[i].Id == id) return Responses[i];
            return null;
        }
    }

    /// <summary>A Mission Control role (design 3.3).</summary>
    public sealed class RoleDef
    {
        /// <summary>Role ID, e.g. <c>FLIGHT</c>.</summary>
        public string Id { get; set; } = "";
        /// <summary>Display name.</summary>
        public string Name { get; set; } = "";
        /// <summary>Once-per-mission ability ID.</summary>
        public string AbilityId { get; set; } = "";
        /// <summary>Categories in which the role gives Insight and may tag Recommended/Concern.</summary>
        public IReadOnlyList<string> InsightCategories { get; set; } = Array.Empty<string>();
    }

    /// <summary>A boost type with its per-tier magnitudes and cap (design 10.4, game values).</summary>
    public sealed class BoostDef
    {
        /// <summary>Boost ID, e.g. <c>dv_bonus</c>.</summary>
        public string Id { get; set; } = "";
        /// <summary>Display name.</summary>
        public string Name { get; set; } = "";
        /// <summary>Magnitude at Bronze, unit given by <see cref="Unit"/>.</summary>
        public double Bronze { get; set; }
        /// <summary>Magnitude at Silver.</summary>
        public double Silver { get; set; }
        /// <summary>Magnitude at Gold.</summary>
        public double Gold { get; set; }
        /// <summary>Cap per mission, or null when uncapped.</summary>
        public double? Cap { get; set; }
        /// <summary>Unit text of the magnitudes, e.g. <c>fraction</c>, <c>days</c>, <c>M</c>.</summary>
        public string Unit { get; set; } = "";
    }

    /// <summary>A validation rule (design 6.11). The check itself is implemented in <c>MissionForge.Core.Build.Validator</c>.</summary>
    public sealed class ValidationRuleDef
    {
        /// <summary>Rule ID, e.g. <c>liftoff_twr</c> (see <c>MissionForge.Core.Build.ValidationRules</c>).</summary>
        public string Id { get; set; } = "";
        /// <summary>Severity when the rule fires.</summary>
        public Severity Severity { get; set; }
        /// <summary>Strings key of the explanation shown to players.</summary>
        public string TextKey { get; set; } = "";
        /// <summary>English explanation text (fallback when strings are not loaded).</summary>
        public string Text { get; set; } = "";
        /// <summary>Numeric parameters, e.g. <c>major_margin_fraction</c> = 0.03.</summary>
        public IReadOnlyDictionary<string, double> Params { get; set; } = new Dictionary<string, double>();
    }
}
