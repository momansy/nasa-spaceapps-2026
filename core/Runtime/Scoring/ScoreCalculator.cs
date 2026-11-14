#nullable enable
using System;
using System.Collections.Generic;
using MissionForge.Core.Flight.Mission;

namespace MissionForge.Core.Scoring
{
    /// <summary>One finished minigame run as the score sees it (design 11.3 Teamwork).</summary>
    public sealed class MinigameScore
    {
        /// <summary>Creates a result.</summary>
        public MinigameScore(string minigameId, Tier tier, bool inGoldenWindow = false)
        {
            MinigameId = minigameId; Tier = tier; InGoldenWindow = inGoldenWindow;
        }
        /// <summary>Minigame ID (<c>MG-08</c>).</summary>
        public string MinigameId { get; }
        /// <summary>Tier reached; None earns nothing.</summary>
        public Tier Tier { get; }
        /// <summary>True when the run was played in a phase under the Golden Window moment: its points count double (design 11.2).</summary>
        public bool InGoldenWindow { get; }
    }

    /// <summary>Everything the score formula needs about a finished mission (design 11.3). Properties are read, never changed.</summary>
    public sealed class ScoreInput
    {
        /// <summary>Contract flown (<c>C1</c>…).</summary>
        public string ContractId { get; set; } = "";
        /// <summary>Assist-level ID (<c>cadet</c>, <c>engineer</c>, <c>flight_director</c>): gives the difficulty multiplier.</summary>
        public string AssistLevelId { get; set; } = "engineer";
        /// <summary>Contract metrics keyed by the names in <c>contracts.json</c> criteria (booleans 1/0; units as in the metric name).</summary>
        public IReadOnlyDictionary<string, double> Metrics { get; set; } = new Dictionary<string, double>();
        /// <summary>Remaining budget as a fraction of the contract budget (unitless); clamped to 0–1.</summary>
        public double BudgetRemainingFraction { get; set; }
        /// <summary>Schedule margin as a fraction of the contract schedule (unitless); clamped to 0–1.</summary>
        public double ScheduleMarginFraction { get; set; }
        /// <summary>Crewed contracts: whether the crew returned safely. Null uses the metric <c>crew_safe</c>; uncrewed contracts ignore it.</summary>
        public bool? CrewSafe { get; set; }
        /// <summary>Booster recovered (500 points).</summary>
        public bool BoosterRecovered { get; set; }
        /// <summary>Capsule recovered (300 points).</summary>
        public bool CapsuleRecovered { get; set; }
        /// <summary>Science / data achieved as a fraction of the contract's science target (unitless, 0–1); pays up to 1,500 points.</summary>
        public double ScienceDataFraction { get; set; }
        /// <summary>Minigame runs of the mission.</summary>
        public IReadOnlyList<MinigameScore> Minigames { get; set; } = Array.Empty<MinigameScore>();
        /// <summary>Good Calls made (20 points each).</summary>
        public int GoodCalls { get; set; }
        /// <summary>Correct Predict answers (50 points each).</summary>
        public int PredictionsCorrect { get; set; }
        /// <summary>Trivia tiebreaks won (30 points each).</summary>
        public int TriviaTiebreaksWon { get; set; }
        /// <summary>Score Multiplier boost total (unitless, 1 when none); clamped to 1…cap (1.5). Read it from <see cref="BoostLedger.Total"/>. Decision: the boost has scope <c>segment</c> in the data, but the multiplier applied to the final score is the mission total capped at ×1.5, so one number is enough.</summary>
        public double BoostMultiplier { get; set; } = 1.0;
        /// <summary>Primary not met but the mission is recoverable (e.g. the payload has its own propulsion): outcome Partial (design 8.5).</summary>
        public bool Recoverable { get; set; }
        /// <summary>Primary met but secondary systems were lost: outcome Partial (design 8.5).</summary>
        public bool SecondarySystemsLost { get; set; }
    }

    /// <summary>
    /// The score of a mission. Fields mirror <c>debrief.score.breakdown</c> of <c>protocol/messages.md</c>; the component
    /// values are in points before the multipliers.
    /// </summary>
    public sealed class ScoreBreakdown
    {
        /// <summary>Creates a breakdown (used by <see cref="ScoreCalculator"/>).</summary>
        public ScoreBreakdown(double objectives, double efficiency, double safetyRecovery, double scienceData, double teamwork,
            double knowledge, double difficultyMult, double boostMult, double subtotalPoints, int totalPoints, string grade,
            string titleKey, MissionOutcome outcome, bool? crewSafe, IReadOnlyList<ObjectiveResult> objectiveResults,
            IReadOnlyList<string> missingMetrics)
        {
            Objectives = objectives; Efficiency = efficiency; SafetyRecovery = safetyRecovery; ScienceData = scienceData;
            Teamwork = teamwork; Knowledge = knowledge; DifficultyMult = difficultyMult; BoostMult = boostMult;
            SubtotalPoints = subtotalPoints; TotalPoints = totalPoints; Grade = grade; TitleKey = titleKey; Outcome = outcome;
            CrewSafe = crewSafe; ObjectiveResults = objectiveResults; MissingMetrics = missingMetrics;
        }
        /// <summary>Objective points (primary 3,000 + secondary share of 1,500 + stretch 500).</summary>
        public double Objectives { get; }
        /// <summary>Efficiency points: budget fraction × 1,000 + schedule fraction × 500.</summary>
        public double Efficiency { get; }
        /// <summary>Safety and recovery points: crew safe 1,000 (crewed only), booster 500, capsule 300.</summary>
        public double SafetyRecovery { get; }
        /// <summary>Science / data points, up to 1,500.</summary>
        public double ScienceData { get; }
        /// <summary>Teamwork points: minigame tiers (Golden Window runs doubled) plus 20 per Good Call.</summary>
        public double Teamwork { get; }
        /// <summary>Knowledge points: 50 per correct prediction, 30 per trivia tiebreak.</summary>
        public double Knowledge { get; }
        /// <summary>Difficulty multiplier (unitless): 0.8, 1.0 or 1.25.</summary>
        public double DifficultyMult { get; }
        /// <summary>Score boost multiplier (unitless), 1.0–1.5.</summary>
        public double BoostMult { get; }
        /// <summary>Sum of the six components before the multipliers (points).</summary>
        public double SubtotalPoints { get; }
        /// <summary>Mission Score (points) = round(subtotal × difficulty × boost).</summary>
        public int TotalPoints { get; }
        /// <summary>Grade letter (<c>S</c>…<c>D</c>); D when the crew is lost.</summary>
        public string Grade { get; }
        /// <summary>String key of the grade title.</summary>
        public string TitleKey { get; }
        /// <summary>Success, partial or failure (design 8.5).</summary>
        public MissionOutcome Outcome { get; }
        /// <summary>Crewed contracts: whether the crew returned safely; null for uncrewed contracts or when unknown.</summary>
        public bool? CrewSafe { get; }
        /// <summary>Every objective of the contract with its result, primary first, then secondary, stretch, safety.</summary>
        public IReadOnlyList<ObjectiveResult> ObjectiveResults { get; }
        /// <summary>Metrics the contract needed that were not supplied (each counted as not met).</summary>
        public IReadOnlyList<string> MissingMetrics { get; }
    }

    /// <summary>
    /// Mission Score (design 11.3), grade (11.4) and outcome (8.5). All weights are game_value and come from
    /// <c>data/scoring.json</c>. Pure and deterministic.
    /// <para>
    /// Decisions (game_value): the 1,500 secondary points split equally across the contract's secondary objectives; the budget
    /// and schedule terms are the fraction (0–1) times the points; science points are the science fraction times 1,500;
    /// Golden Window doubles only minigame points; the total rounds half away from zero.
    /// </para>
    /// </summary>
    public static class ScoreCalculator
    {
        /// <summary>Computes the score of a finished mission.</summary>
        /// <exception cref="ArgumentException">Unknown contract or assist level.</exception>
        public static ScoreBreakdown Compute(ScoringCatalog catalog, ScoreInput input)
        {
            if (catalog == null) throw new ArgumentNullException(nameof(catalog));
            if (input == null) throw new ArgumentNullException(nameof(input));
            var contract = catalog.ObjectivesFor(input.ContractId)
                ?? throw new ArgumentException("Unknown contract '" + input.ContractId + "'.", nameof(input));
            if (!catalog.AssistScoreMultipliers.TryGetValue(input.AssistLevelId, out var difficulty))
                throw new ArgumentException("Unknown assist level '" + input.AssistLevelId + "'.", nameof(input));
            var metrics = input.Metrics ?? new Dictionary<string, double>();
            var missing = new List<string>();
            var results = new List<ObjectiveResult>();

            // ---- objective points: primary 3,000, secondary 1,500 / n each, stretch 500
            var primary = ObjectiveEvaluator.Evaluate(contract.Primary, metrics);
            var primaryPoints = primary.Met ? catalog.Points("objective_points", "primary") : 0.0;
            results.Add(With(primary, primaryPoints));
            var secondaryShare = contract.Secondary.Count == 0 ? 0.0 : catalog.Points("objective_points", "secondary") / contract.Secondary.Count;
            double objectives = primaryPoints;
            foreach (var s in contract.Secondary)
            {
                var r = ObjectiveEvaluator.Evaluate(s, metrics);
                var pts = r.Met ? secondaryShare : 0.0;
                objectives += pts;
                results.Add(With(r, pts));
            }
            if (contract.Stretch != null)
            {
                var r = ObjectiveEvaluator.Evaluate(contract.Stretch, metrics);
                var pts = r.Met ? catalog.Points("objective_points", "stretch") : 0.0;
                objectives += pts;
                results.Add(With(r, pts));
            }

            // ---- crew safety (crewed contracts only)
            bool? crewSafe = null;
            double crewPoints = 0.0;
            if (contract.Crewed)
            {
                if (input.CrewSafe.HasValue) crewSafe = input.CrewSafe.Value;
                else if (metrics.TryGetValue("crew_safe", out var cs)) crewSafe = cs != 0.0;
                else missing.Add("crew_safe");
                if (crewSafe == true) crewPoints = catalog.Points("safety_recovery", "crew_safe");
                if (contract.Safety != null)
                {
                    var safety = ObjectiveEvaluator.Evaluate(contract.Safety, metrics);
                    results.Add(new ObjectiveResult(contract.Safety.Id, ObjectiveKind.Safety, crewSafe == true, crewPoints, safety.MissingMetrics));
                }
            }
            foreach (var r in results)
                foreach (var m in r.MissingMetrics)
                    if (!missing.Contains(m)) missing.Add(m);

            // ---- efficiency: fraction x points
            var efficiency = Clamp01(input.BudgetRemainingFraction) * catalog.Points("efficiency", "budget_remaining")
                + Clamp01(input.ScheduleMarginFraction) * catalog.Points("efficiency", "schedule_margin");

            // ---- safety and recovery
            var safetyRecovery = crewPoints
                + (input.BoosterRecovered ? catalog.Points("safety_recovery", "booster_recovered") : 0.0)
                + (input.CapsuleRecovered ? catalog.Points("safety_recovery", "capsule_recovered") : 0.0);

            // ---- science / data: fraction x 1,500
            var science = Clamp01(input.ScienceDataFraction) * catalog.Points("science_data", "science_data");

            // ---- teamwork: tier points per minigame (x2 in a Golden Window) + Good Calls
            var teamComponent = catalog.Component("teamwork") ?? throw new Data.CatalogException("scoring.json: no component 'teamwork'.");
            double teamwork = 0.0;
            foreach (var mg in input.Minigames ?? Array.Empty<MinigameScore>())
            {
                var id = Tiers.IdOf(mg.Tier);
                if (id == null) continue;
                double pts = 0.0;
                foreach (var t in teamComponent.Terms) if (t.Tier == id) pts = t.Points;
                teamwork += mg.InGoldenWindow ? pts * 2.0 : pts;
            }
            teamwork += Math.Max(0, input.GoodCalls) * catalog.Points("teamwork", "good_call");

            // ---- knowledge
            var knowledge = Math.Max(0, input.PredictionsCorrect) * catalog.Points("knowledge", "correct_prediction")
                + Math.Max(0, input.TriviaTiebreaksWon) * catalog.Points("knowledge", "trivia_tiebreak");

            var subtotal = objectives + efficiency + safetyRecovery + science + teamwork + knowledge;
            var boost = double.IsNaN(input.BoostMultiplier) ? 1.0 : Math.Max(1.0, Math.Min(catalog.ScoreBoostCap, input.BoostMultiplier));
            var total = (int)Math.Round(subtotal * difficulty * boost, MidpointRounding.AwayFromZero);

            // ---- grade (crew lost caps it, design 5.2)
            var crewLost = contract.Crewed && crewSafe == false;
            string gradeId = catalog.CrewLostGrade;
            if (!crewLost)
            {
                gradeId = catalog.Grades[catalog.Grades.Count - 1].Id;
                foreach (var g in catalog.Grades)
                    if (g.MinScorePoints == null || total >= g.MinScorePoints.Value) { gradeId = g.Id; break; }
            }
            var title = "";
            foreach (var g in catalog.Grades) if (g.Id == gradeId) title = g.TitleKey;

            var outcome = primary.Met
                ? (input.SecondarySystemsLost ? MissionOutcome.Partial : MissionOutcome.Success)
                : (input.Recoverable ? MissionOutcome.Partial : MissionOutcome.Failure);

            return new ScoreBreakdown(objectives, efficiency, safetyRecovery, science, teamwork, knowledge, difficulty, boost,
                subtotal, total, gradeId, title, outcome, crewSafe, results, missing);
        }

        private static ObjectiveResult With(ObjectiveResult r, double points) =>
            new ObjectiveResult(r.Id, r.Kind, r.Met, points, r.MissingMetrics);

        private static double Clamp01(double v) => double.IsNaN(v) ? 0.0 : Math.Max(0.0, Math.Min(1.0, v));
    }
}
