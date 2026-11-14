#nullable enable
using System;
using System.Collections.Generic;

namespace MissionForge.Core.Scoring
{
    /// <summary>Evaluation of one objective.</summary>
    public sealed class ObjectiveResult
    {
        /// <summary>Creates a result.</summary>
        public ObjectiveResult(string id, string kind, bool met, IReadOnlyList<string> missingMetrics)
        { Id = id; Kind = kind; Met = met; MissingMetrics = missingMetrics; }
        /// <summary>Objective id.</summary>
        public string Id { get; }
        /// <summary><c>PRIMARY</c>, <c>SECONDARY</c> or <c>STRETCH</c>.</summary>
        public string Kind { get; }
        /// <summary>True when every criterion holds.</summary>
        public bool Met { get; }
        /// <summary>Metrics a criterion needed but the input did not contain; such a criterion counts as not met.</summary>
        public IReadOnlyList<string> MissingMetrics { get; }
    }

    /// <summary>Evaluates contract criteria against measured metrics (design 8.5).</summary>
    public static class ObjectiveEvaluator
    {
        /// <summary>
        /// Evaluates every criterion of an objective. Ops: <c>gte gt lte lt eq within is_true</c>; <c>within</c> means
        /// |x - value| &lt;= tolerance. Booleans are 1/0. A missing metric counts as not met and is listed.
        /// </summary>
        /// <param name="objective">The objective.</param>
        /// <param name="metrics">Measured values in the unit the contract states (km, $M, fractions); booleans as 1/0.</param>
        public static ObjectiveResult Evaluate(ObjectiveDef objective, IReadOnlyDictionary<string, double> metrics)
        {
            if (objective == null) throw new ArgumentNullException(nameof(objective));
            if (metrics == null) throw new ArgumentNullException(nameof(metrics));
            var missing = new List<string>();
            bool all = true;
            foreach (var c in objective.Criteria)
            {
                if (!metrics.TryGetValue(c.Metric, out var x))
                {
                    missing.Add(c.Metric);
                    all = false;
                    continue;
                }
                if (!Holds(c, x)) all = false;
            }
            return new ObjectiveResult(objective.Id, objective.Kind, all, missing);
        }

        private static bool Holds(Criterion c, double x)
        {
            switch (c.Op)
            {
                case "gte": return x >= c.Value - 1e-9;
                case "gt": return x > c.Value;
                case "lte": return x <= c.Value + 1e-9;
                case "lt": return x < c.Value;
                case "eq": return Math.Abs(x - c.Value) <= 1e-9;
                case "within": return Math.Abs(x - c.Value) <= c.Tolerance + 1e-9;
                case "is_true": return x >= 0.5;
                default: throw new ArgumentException("unknown criterion op '" + c.Op + "'");
            }
        }
    }

    /// <summary>Mission outcome (design 8.5, protocol MissionOutcome).</summary>
    public enum MissionOutcome
    {
        /// <summary>Primary objective met and the crew (if any) safe.</summary>
        Success,
        /// <summary>Primary missed but at least one secondary objective met, crew safe.</summary>
        Partial,
        /// <summary>Anything else, including a lost crew.</summary>
        Failure,
    }

    /// <summary>One minigame run that counts toward Teamwork.</summary>
    public sealed class MinigameResult
    {
        /// <summary>Creates a run record.</summary>
        public MinigameResult(string minigameId, Tier tier, bool inGoldenWindow) { MinigameId = minigameId; Tier = tier; InGoldenWindow = inGoldenWindow; }
        /// <summary>Minigame id.</summary>
        public string MinigameId { get; }
        /// <summary>Tier reached.</summary>
        public Tier Tier { get; }
        /// <summary>True when the run happened in a Golden Window phase: its points count double (design 11.2).</summary>
        public bool InGoldenWindow { get; }
    }

    /// <summary>Everything the score formula reads (design 11.3).</summary>
    public sealed class ScoreInput
    {
        /// <summary>Contract flown.</summary>
        public string ContractId { get; set; } = "";
        /// <summary>Assist level id (<c>cadet</c>, <c>engineer</c>, <c>flight_director</c>).</summary>
        public string AssistLevelId { get; set; } = "engineer";
        /// <summary>Measured metrics for the contract's objectives.</summary>
        public IReadOnlyDictionary<string, double> Metrics { get; set; } = new Dictionary<string, double>();
        /// <summary>True on a crewed contract.</summary>
        public bool Crewed { get; set; }
        /// <summary>True when the crew was lost (caps the grade at D, outcome Failure).</summary>
        public bool CrewLost { get; set; }
        /// <summary>Budget left over the contract budget, fraction 0-1 (clamped).</summary>
        public double BudgetRemainingFraction { get; set; }
        /// <summary>Schedule margin over the contract schedule, fraction 0-1 (clamped).</summary>
        public double ScheduleMarginFraction { get; set; }
        /// <summary>Crew returned safely (counts only on crewed contracts).</summary>
        public bool CrewSafe { get; set; }
        /// <summary>First stage booster recovered.</summary>
        public bool BoosterRecovered { get; set; }
        /// <summary>Capsule recovered.</summary>
        public bool CapsuleRecovered { get; set; }
        /// <summary>Share of the contract's science targets captured, fraction 0-1 (clamped).</summary>
        public double ScienceFraction { get; set; }
        /// <summary>Minigame runs of the mission.</summary>
        public IReadOnlyList<MinigameResult> Minigames { get; set; } = Array.Empty<MinigameResult>();
        /// <summary>Good Calls made by all players, count.</summary>
        public int GoodCalls { get; set; }
        /// <summary>Correct Predict answers, count.</summary>
        public int CorrectPredictions { get; set; }
        /// <summary>Trivia tie-breaks won, count.</summary>
        public int TriviaTiebreaks { get; set; }
        /// <summary>Score multiplier of the boost ledger, x1.0-x1.5 (use <see cref="BoostLedger.ScoreMultiplier"/>).</summary>
        public double ScoreBoostMultiplier { get; set; } = 1.0;
    }

    /// <summary>Points of one objective.</summary>
    public sealed class ObjectiveScore
    {
        /// <summary>Creates the record.</summary>
        public ObjectiveScore(string id, string kind, bool met, double points) { Id = id; Kind = kind; Met = met; Points = points; }
        /// <summary>Objective id.</summary>
        public string Id { get; }
        /// <summary><c>PRIMARY</c>, <c>SECONDARY</c>, <c>STRETCH</c> or <c>SAFETY</c>.</summary>
        public string Kind { get; }
        /// <summary>Whether it was achieved.</summary>
        public bool Met { get; }
        /// <summary>Points earned, before multipliers.</summary>
        public double Points { get; }
    }

    /// <summary>Score terms; the fields mirror <c>debrief.score.breakdown</c>.</summary>
    public sealed class ScoreBreakdown
    {
        /// <summary>Objective points: primary + secondary share + stretch.</summary>
        public double Objectives { get; internal set; }
        /// <summary>Efficiency points: budget and schedule.</summary>
        public double Efficiency { get; internal set; }
        /// <summary>Safety and recovery points.</summary>
        public double SafetyRecovery { get; internal set; }
        /// <summary>Science / data points.</summary>
        public double ScienceData { get; internal set; }
        /// <summary>Teamwork points.</summary>
        public double Teamwork { get; internal set; }
        /// <summary>Knowledge points (score, not KP).</summary>
        public double Knowledge { get; internal set; }
        /// <summary>Difficulty multiplier of the assist level, x0.8-x1.25.</summary>
        public double DifficultyMult { get; internal set; }
        /// <summary>Score boost multiplier, x1.0-x1.5.</summary>
        public double BoostMult { get; internal set; }
    }

    /// <summary>Result of the score formula (design 11.3, 11.4).</summary>
    public sealed class ScoreResult
    {
        /// <summary>Terms of the formula.</summary>
        public ScoreBreakdown Breakdown { get; internal set; } = new ScoreBreakdown();
        /// <summary>Per-objective results with points.</summary>
        public IReadOnlyList<ObjectiveScore> Objectives { get; internal set; } = Array.Empty<ObjectiveScore>();
        /// <summary>Metrics that objective criteria needed but the input lacked.</summary>
        public IReadOnlyList<string> MissingMetrics { get; internal set; } = Array.Empty<string>();
        /// <summary>Mission Score after multipliers, points (not rounded).</summary>
        public double TotalPoints { get; internal set; }
        /// <summary>Mission Score rounded to whole points, as sent in <c>debrief.score.total</c>.</summary>
        public int TotalRounded => (int)Math.Round(TotalPoints, MidpointRounding.AwayFromZero);
        /// <summary>Grade letter S, A, B, C or D.</summary>
        public string Grade { get; internal set; } = "D";
        /// <summary>String-table key of the grade title.</summary>
        public string TitleKey { get; internal set; } = "";
        /// <summary>Mission outcome.</summary>
        public MissionOutcome Outcome { get; internal set; }
    }

    /// <summary>
    /// Mission Score = (objectives + efficiency + safety + science + teamwork + knowledge) x difficulty x score boosts
    /// (design 11.3). Point values come from <c>data/scoring.json</c>.
    /// <b>Decisions (game_value):</b> the 1,500 secondary points split equally across the contract's secondaries, each met one paying its
    /// share; budget and schedule fractions clamp to 0-1 and pay fraction x points; crew-safe points need a crewed contract and a crew not
    /// lost; teamwork minigame points earned in a Golden Window count double (Good Call points do not); science pays fraction x 1,500;
    /// outcome is Success (primary met, crew not lost), Partial (primary missed, a secondary met, crew not lost), else Failure.
    /// </summary>
    public static class ScoreCalculator
    {
        /// <summary>Computes the score.</summary>
        /// <exception cref="ArgumentException">Unknown contract or assist level.</exception>
        public static ScoreResult Compute(ScoringCatalog catalog, ScoreInput input)
        {
            if (catalog == null) throw new ArgumentNullException(nameof(catalog));
            if (input == null) throw new ArgumentNullException(nameof(input));
            if (!catalog.Objectives.TryGetValue(input.ContractId, out var objectives))
                throw new ArgumentException("unknown contract '" + input.ContractId + "'", nameof(input));
            if (!catalog.AssistMultipliers.TryGetValue(input.AssistLevelId, out var difficulty))
                throw new ArgumentException("unknown assist level '" + input.AssistLevelId + "'", nameof(input));

            var missing = new List<string>();
            var perObjective = new List<ObjectiveScore>();

            // Objectives (8.5): primary 3000, secondaries share 1500, stretch 500.
            var primary = ObjectiveEvaluator.Evaluate(objectives.Primary, input.Metrics);
            missing.AddRange(primary.MissingMetrics);
            double primaryPts = primary.Met ? catalog.TermPoints("objective_points", "primary") : 0.0;
            perObjective.Add(new ObjectiveScore(primary.Id, "PRIMARY", primary.Met, primaryPts));

            double secondaryPool = catalog.TermPoints("objective_points", "secondary");
            double share = objectives.Secondary.Count == 0 ? 0.0 : secondaryPool / objectives.Secondary.Count;
            double secondaryPts = 0.0;
            int secondaryMet = 0;
            foreach (var s in objectives.Secondary)
            {
                var r = ObjectiveEvaluator.Evaluate(s, input.Metrics);
                missing.AddRange(r.MissingMetrics);
                double pts = r.Met ? share : 0.0;
                if (r.Met) secondaryMet++;
                secondaryPts += pts;
                perObjective.Add(new ObjectiveScore(r.Id, "SECONDARY", r.Met, pts));
            }

            double stretchPts = 0.0;
            if (objectives.Stretch != null)
            {
                var r = ObjectiveEvaluator.Evaluate(objectives.Stretch, input.Metrics);
                missing.AddRange(r.MissingMetrics);
                stretchPts = r.Met ? catalog.TermPoints("objective_points", "stretch") : 0.0;
                perObjective.Add(new ObjectiveScore(r.Id, "STRETCH", r.Met, stretchPts));
            }

            // Crew safety: the crew-safe points of the safety component; the contract's safety objective (C4, C6) is listed with them.
            bool crewSafePaid = input.Crewed && input.CrewSafe && !input.CrewLost;
            double crewSafePts = crewSafePaid ? catalog.TermPoints("safety_recovery", "crew_safe") : 0.0;
            if (objectives.Safety != null) perObjective.Add(new ObjectiveScore(objectives.Safety.Id, "SAFETY", crewSafePaid, crewSafePts));

            // Efficiency (11.3): fraction x points.
            double efficiency = Clamp01(input.BudgetRemainingFraction) * catalog.TermPoints("efficiency", "budget_remaining")
                              + Clamp01(input.ScheduleMarginFraction) * catalog.TermPoints("efficiency", "schedule_margin");

            // Safety and recovery.
            double safety = crewSafePts
                          + (input.BoosterRecovered ? catalog.TermPoints("safety_recovery", "booster_recovered") : 0.0)
                          + (input.CapsuleRecovered ? catalog.TermPoints("safety_recovery", "capsule_recovered") : 0.0);

            double science = Clamp01(input.ScienceFraction) * catalog.TermPoints("science_data", "science_data");

            // Teamwork: per minigame by tier (Golden Window doubles it), plus Good Calls.
            double teamwork = 0.0;
            foreach (var mg in input.Minigames)
            {
                var id = Tiers.Id(mg.Tier);
                if (id == null) continue;
                double pts = catalog.TermPoints("teamwork", "minigame_" + id);
                teamwork += mg.InGoldenWindow ? pts * 2.0 : pts;
            }
            teamwork += input.GoodCalls * catalog.TermPoints("teamwork", "good_call");

            double knowledge = input.CorrectPredictions * catalog.TermPoints("knowledge", "correct_prediction")
                             + input.TriviaTiebreaks * catalog.TermPoints("knowledge", "trivia_tiebreak");

            double boostMult = Math.Max(1.0, Math.Min(catalog.ScoreBoostCap, input.ScoreBoostMultiplier));
            double sum = primaryPts + secondaryPts + stretchPts + efficiency + safety + science + teamwork + knowledge;
            double total = sum * difficulty * boostMult;

            string grade = GradeFor(catalog, total, input.CrewLost, out var titleKey);
            var outcome = input.CrewLost ? MissionOutcome.Failure
                : primary.Met ? MissionOutcome.Success
                : secondaryMet > 0 ? MissionOutcome.Partial
                : MissionOutcome.Failure;

            return new ScoreResult
            {
                Breakdown = new ScoreBreakdown
                {
                    Objectives = primaryPts + secondaryPts + stretchPts,
                    Efficiency = efficiency,
                    SafetyRecovery = safety,
                    ScienceData = science,
                    Teamwork = teamwork,
                    Knowledge = knowledge,
                    DifficultyMult = difficulty,
                    BoostMult = boostMult,
                },
                Objectives = perObjective,
                MissingMetrics = missing,
                TotalPoints = total,
                Grade = grade,
                TitleKey = titleKey,
                Outcome = outcome,
            };
        }

        private static string GradeFor(ScoringCatalog catalog, double total, bool crewLost, out string titleKey)
        {
            GradeDef? chosen = null;
            if (crewLost)
            {
                foreach (var g in catalog.Grades) if (g.Id == catalog.CrewLostGrade) chosen = g;
            }
            else
            {
                foreach (var g in catalog.Grades)
                    if (g.MinScore != null && total >= g.MinScore.Value - 1e-9 && (chosen == null || g.MinScore.Value > (chosen.MinScore ?? double.MinValue)))
                        chosen = g;
                if (chosen == null) foreach (var g in catalog.Grades) if (g.MinScore == null) chosen = g;
            }
            titleKey = chosen?.TitleKey ?? "";
            return chosen?.Id ?? catalog.CrewLostGrade;
        }

        private static double Clamp01(double v) => Math.Max(0.0, Math.Min(1.0, v));
    }
}
