using System;

namespace MissionForge.Core.Flight.Mission
{
    public enum BoosterReturnPhase { Boostback, Entry, Landing, Landed, Failed }

    /// <summary>Second fixed-step point-mass state for a separated recoverable booster.</summary>
    public sealed class BoosterReturnSim
    {
        private readonly double dryMassKg;
        private readonly double maximumThrustN;
        private readonly double massFlowKgS;
        private const double BallisticCoefficientKgM2 = 500; // game_value: representative tail-first booster

        public BoosterReturnSim(double altitudeM, double verticalSpeedMs, double horizontalErrorM,
            double dryMassKg, double reservedPropellantKg, double maximumThrustN, double massFlowKgS)
        {
            FlightGuard.Nonnegative(altitudeM, nameof(altitudeM));
            FlightGuard.Finite(verticalSpeedMs, nameof(verticalSpeedMs));
            FlightGuard.Nonnegative(horizontalErrorM, nameof(horizontalErrorM));
            FlightGuard.Positive(dryMassKg, nameof(dryMassKg));
            FlightGuard.Nonnegative(reservedPropellantKg, nameof(reservedPropellantKg));
            FlightGuard.Positive(maximumThrustN, nameof(maximumThrustN));
            FlightGuard.Positive(massFlowKgS, nameof(massFlowKgS));
            AltitudeM = altitudeM; VerticalSpeedMs = verticalSpeedMs; HorizontalErrorM = horizontalErrorM;
            this.dryMassKg = dryMassKg; ReservedPropellantKg = reservedPropellantKg;
            this.maximumThrustN = maximumThrustN; this.massFlowKgS = massFlowKgS;
        }

        public BoosterReturnPhase Phase { get; private set; } = BoosterReturnPhase.Boostback;
        public double AltitudeM { get; private set; }
        public double VerticalSpeedMs { get; private set; }
        public double HorizontalErrorM { get; private set; }
        public double ReservedPropellantKg { get; private set; }
        public double TouchdownSpeedMs { get; private set; }
        public bool Succeeded => Phase == BoosterReturnPhase.Landed;

        /// <summary>Advances the booster by one 1/120 s fixed step.</summary>
        public void Step(CraftInput input, bool autopilot)
        {
            if (input == null) throw new ArgumentNullException(nameof(input));
            if (Phase == BoosterReturnPhase.Landed || Phase == BoosterReturnPhase.Failed) return;
            const double dtS = Rk4Integrator.FixedStepS;
            var correctionSpeedMs = Phase == BoosterReturnPhase.Boostback ? 600 : 100; // game_value
            HorizontalErrorM = Math.Max(0, HorizontalErrorM - correctionSpeedMs * dtS);
            if (HorizontalErrorM <= 1000 && Phase == BoosterReturnPhase.Boostback) Phase = BoosterReturnPhase.Entry;
            if (AltitudeM <= 2000) Phase = BoosterReturnPhase.Landing;

            var throttle = input.ThrottleFraction;
            if (autopilot)
            {
                var availableAccelerationMs2 = maximumThrustN / (dryMassKg + ReservedPropellantKg);
                var netBrakingAccelerationMs2 = Math.Max(0.1,
                    availableAccelerationMs2 - PhysicalConstants.StandardGravityMs2);
                var stoppingDistanceM = VerticalSpeedMs < 0
                    ? VerticalSpeedMs * VerticalSpeedMs / (2 * netBrakingAccelerationMs2) : 0;
                if (AltitudeM > 2_000 && AltitudeM > stoppingDistanceM * 1.15 + 1_000)
                    throttle = 0;
                else
                {
                    // Follow a suicide-burn curve instead of hovering and wasting the reserve.
                    var targetVerticalMs = -0.55 * Math.Sqrt(2 * netBrakingAccelerationMs2
                        * Math.Max(0, AltitudeM - 2)); // game_value: two metre touchdown margin
                    var requestedUpwardAccelerationMs2 = (targetVerticalMs - VerticalSpeedMs) / 0.5
                        + PhysicalConstants.StandardGravityMs2;
                    throttle = Math.Max(0, Math.Min(1, requestedUpwardAccelerationMs2 / availableAccelerationMs2));
                }
            }
            FlightGuard.Range(throttle, 0, 1, nameof(input.ThrottleFraction));
            if (ReservedPropellantKg <= 0) throttle = 0;
            var burnKg = Math.Min(ReservedPropellantKg, massFlowKgS * throttle * dtS);
            ReservedPropellantKg -= burnKg;
            var densityKgM3 = Body.Earth.DensityKgM3(AltitudeM);
            var dragAccelerationMs2 = densityKgM3 * VerticalSpeedMs * VerticalSpeedMs
                / (2 * BallisticCoefficientKgM2);
            var accelerationMs2 = maximumThrustN * throttle / (dryMassKg + ReservedPropellantKg)
                - PhysicalConstants.StandardGravityMs2
                - Math.Sign(VerticalSpeedMs) * dragAccelerationMs2;
            VerticalSpeedMs += accelerationMs2 * dtS;
            AltitudeM += VerticalSpeedMs * dtS;
            if (AltitudeM <= 0)
            {
                AltitudeM = 0; TouchdownSpeedMs = Math.Abs(VerticalSpeedMs);
                Phase = TouchdownSpeedMs <= 2 && HorizontalErrorM <= 100 ? BoosterReturnPhase.Landed : BoosterReturnPhase.Failed;
            }
        }
    }
}
