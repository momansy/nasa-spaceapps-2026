using System;
using MissionForge.Core.Build;

namespace MissionForge.Core.Flight.Mission
{
    /// <summary>Result of one deterministic reliability checkpoint.</summary>
    public sealed class FailureCheckResult
    {
        internal FailureCheckResult(bool succeeded, ShieldKind? consumedShield)
        {
            Succeeded = succeeded;
            ConsumedShield = consumedShield;
        }

        public bool Succeeded { get; }
        public ShieldKind? ConsumedShield { get; }
    }

    /// <summary>Keyed mission reliability rolls and disclosed condition thresholds (design 8.4).</summary>
    public sealed class MissionFailureModel
    {
        /// <summary>game_value structural q×g threshold in Pa before modifiers.</summary>
        public const double StructuralLoadLimitPa = 85_000;
        /// <summary>game_value integrated entry-heat capacity in J/m² before modifiers.</summary>
        public const double EntryHeatCapacityJm2 = 600_000_000;
        /// <summary>game_value lateral corridor half-width in m.</summary>
        public const double RangeCorridorHalfWidthM = 100_000;

        private readonly FlightVehicleSpec spec;
        private readonly FlightModifiers modifiers;
        private int nextShield;

        public MissionFailureModel(FlightVehicleSpec spec, FlightModifiers modifiers)
        {
            this.spec = spec ?? throw new ArgumentNullException(nameof(spec));
            this.modifiers = modifiers ?? throw new ArgumentNullException(nameof(modifiers));
        }

        /// <summary>Rolls one slot checkpoint using R_true^(1/exposureCount), keyed independently of pilot input.</summary>
        public FailureCheckResult Check(string checkpointId, string slot, int exposureCount, int unit = 0)
        {
            if (checkpointId == null) throw new ArgumentNullException(nameof(checkpointId));
            if (slot == null) throw new ArgumentNullException(nameof(slot));
            if (exposureCount <= 0) throw new ArgumentOutOfRangeException(nameof(exposureCount));
            if (unit < 0) throw new ArgumentOutOfRangeException(nameof(unit));
            if (spec.Vehicle.Part(slot) == null) return new FailureCheckResult(true, null);
            var trueReliability = ReliabilityModel.True(spec.Vehicle, slot);
            var succeeded = Succeeds(spec.BuildSeed, trueReliability, exposureCount, checkpointId, slot, unit);
            if (succeeded || nextShield >= modifiers.Shields.Count)
                return new FailureCheckResult(succeeded, null);
            var shield = modifiers.Shields[nextShield++];
            if (shield == ShieldKind.Negate) return new FailureCheckResult(true, shield);
            var probability = Math.Pow(trueReliability, 1.0 / exposureCount);
            var reroll = BuildRandom.Uniform(spec.BuildSeed, "failure", checkpointId + ":" + slot, unit + 10_000);
            return new FailureCheckResult(reroll < probability, shield);
        }

        /// <summary>Pure keyed checkpoint roll used by deterministic statistical tests.</summary>
        public static bool Succeeds(ulong seed, double trueReliabilityUnitless, int exposureCount,
            string checkpointId, string slot, int unit = 0)
        {
            FlightGuard.Range(trueReliabilityUnitless, 0, 1, nameof(trueReliabilityUnitless));
            if (exposureCount <= 0) throw new ArgumentOutOfRangeException(nameof(exposureCount));
            var probability = Math.Pow(trueReliabilityUnitless, 1.0 / exposureCount);
            return BuildRandom.Uniform(seed, "failure", checkpointId + ":" + slot, unit) < probability;
        }

        public static bool StructuralLimitExceeded(double dynamicPressurePa, double gLoadUnitless, double loadMarginFraction) =>
            dynamicPressurePa * Math.Max(1, gLoadUnitless) > StructuralLoadLimitPa * (1 + loadMarginFraction);

        public static bool HeatShieldLimitExceeded(double entrySpeedMs, double speedRatingMs, double heatLoadJm2,
            double heatMarginFraction) => entrySpeedMs > speedRatingMs * (1 + heatMarginFraction)
                || heatLoadJm2 > EntryHeatCapacityJm2 * (1 + heatMarginFraction);

        public static bool OutsideRangeCorridor(double lateralErrorM) => Math.Abs(lateralErrorM) > RangeCorridorHalfWidthM;
    }
}
