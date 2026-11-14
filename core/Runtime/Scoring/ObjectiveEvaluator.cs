#nullable enable
using System;
using System.Collections.Generic;

namespace MissionForge.Core.Scoring
{
    /// <summary>Result of evaluating one objective (design 5.2, 8.5).</summary>
    public sealed class ObjectiveResult
    {
        /// <summary>Creates a result.</summary>
        public ObjectiveResult(string id, ObjectiveKind kind, bool met, double pointsAwarded, IReadOnlyList<string> missingMetrics)
        {
            Id = id; Kind = kind; Met = met; PointsAwarded = pointsAwarded; MissingMetrics = missingMetrics;
        }
        /// <summary>Objective ID.</summary>
        public string Id { get; }
        /// <summary>Primary, secondary, stretch or safety.</summary>
        public ObjectiveKind Kind { get; }
        /// <summary>True when every criterion holds.</summary>
        public bool Met { get; }
        /// <summary>
        /// Points earned in the objective-points component (design 11.3): 3,000 primary, an equal share of 1,500 per secondary,
        /// 500 stretch. For a safety objective, the crew-safe points, which belong to the safety-and-recovery component and are
        /// not part of <c>breakdown.objectives</c>.
        /// </summary>
        public double PointsAwarded { get; }
        /// <summary>Metrics a criterion needed that the caller did not supply; each counts as not met.</summary>
        public IReadOnlyList<string> MissingMetrics { get; }
    }

    /// <summary>
    /// Evaluates contract criteria against a metrics dictionary (design 8.5, <c>data/contracts.json</c>). Booleans are 1/0.
    /// Ops: <c>gte gt lte lt eq within is_true</c>; <c>within</c> means |x − value| ≤ tolerance. A missing metric counts as
    /// not met and is listed. Pure.
    /// </summary>
    public static class ObjectiveEvaluator
    {
        /// <summary>Tolerance for <c>eq</c> (metric units): values within 1e-9 are equal.</summary>
        public const double EqualityToleranceUnits = 1e-9;

        /// <summary>
        /// Evaluates one criterion. <paramref name="missing"/> is true when the metric is absent (the criterion is then not met).
        /// </summary>
        public static bool Evaluate(Criterion criterion, IReadOnlyDictionary<string, double> metrics, out bool missing)
        {
            if (criterion == null) throw new ArgumentNullException(nameof(criterion));
            if (metrics == null) throw new ArgumentNullException(nameof(metrics));
            missing = !metrics.TryGetValue(criterion.Metric, out var x) || double.IsNaN(x);
            if (missing) return false;
            var v = criterion.Value ?? 0.0;
            switch (criterion.Op)
            {
                case "gte": return x >= v;
                case "gt": return x > v;
                case "lte": return x <= v;
                case "lt": return x < v;
                case "eq": return Math.Abs(x - v) <= EqualityToleranceUnits;
                case "within": return Math.Abs(x - v) <= (criterion.Tolerance ?? 0.0);
                case "is_true": return x != 0.0;
                default: throw new ArgumentException("Unknown criterion op '" + criterion.Op + "'.", nameof(criterion));
            }
        }

        /// <summary>
        /// Evaluates every criterion of an objective: it is met when all hold (an objective without criteria is not met).
        /// Points are 0; <see cref="ScoreCalculator"/> assigns them.
        /// </summary>
        public static ObjectiveResult Evaluate(ObjectiveDef objective, IReadOnlyDictionary<string, double> metrics)
        {
            if (objective == null) throw new ArgumentNullException(nameof(objective));
            var missingList = new List<string>();
            var met = objective.Criteria.Count > 0;
            foreach (var c in objective.Criteria)
            {
                if (!Evaluate(c, metrics, out var missing)) met = false;
                if (missing && !missingList.Contains(c.Metric)) missingList.Add(c.Metric);
            }
            return new ObjectiveResult(objective.Id, objective.Kind, met, 0.0, missingList);
        }
    }
}
