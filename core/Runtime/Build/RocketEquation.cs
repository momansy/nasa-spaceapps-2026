using System;

namespace MissionForge.Core.Build
{
    /// <summary>
    /// The two physical-model formulas behind the Readiness Dashboard (design section 6.3):
    /// stage delta-v from the Tsiolkovsky rocket equation and lift-off thrust-to-weight ratio.
    /// All inputs and outputs are SI (s, kg, N, m/s).
    /// </summary>
    public static class RocketEquation
    {
        /// <summary>
        /// Delta-v of one stage in m/s: <c>Isp · g0 · ln(m0 / mf)</c> (design sections 6.3 and 8.2).
        /// The dashboard total is the sum of this value over the stages.
        /// </summary>
        /// <param name="ispS">Effective specific impulse of the stage in seconds; greater than 0.</param>
        /// <param name="m0Kg">Initial mass in kg: everything the stage pushes, including its propellant.</param>
        /// <param name="mfKg">Final mass in kg after the propellant is burned; greater than 0 and not above <paramref name="m0Kg"/>.</param>
        /// <returns>Delta-v in m/s; 0 when the two masses are equal.</returns>
        /// <exception cref="ArgumentOutOfRangeException">An argument is NaN, infinite or outside the range above.</exception>
        public static double DeltaVMs(double ispS, double m0Kg, double mfKg)
        {
            if (!IsFinite(ispS) || ispS <= 0.0)
            {
                throw new ArgumentOutOfRangeException(nameof(ispS), ispS, "Specific impulse must be a finite number greater than 0 s.");
            }

            if (!IsFinite(mfKg) || mfKg <= 0.0)
            {
                throw new ArgumentOutOfRangeException(nameof(mfKg), mfKg, "Final mass must be a finite number greater than 0 kg.");
            }

            if (!IsFinite(m0Kg) || m0Kg < mfKg)
            {
                throw new ArgumentOutOfRangeException(nameof(m0Kg), m0Kg, "Initial mass must be a finite number not below the final mass.");
            }

            return ispS * PhysicalConstants.StandardGravityMs2 * Math.Log(m0Kg / mfKg);
        }

        /// <summary>
        /// Lift-off thrust-to-weight ratio (dimensionless): <c>F_total_SL / (m_total · g0)</c> (design section 6.3).
        /// The vehicle leaves the pad only if the result is greater than 1.0 (design section 6.11).
        /// </summary>
        /// <param name="thrustSlN">Total sea-level thrust of every engine lit at lift-off, in N; not negative.</param>
        /// <param name="massKg">Total vehicle mass at lift-off in kg; greater than 0.</param>
        /// <exception cref="ArgumentOutOfRangeException">An argument is NaN, infinite or outside the range above.</exception>
        public static double LiftoffTwr(double thrustSlN, double massKg)
        {
            if (!IsFinite(thrustSlN) || thrustSlN < 0.0)
            {
                throw new ArgumentOutOfRangeException(nameof(thrustSlN), thrustSlN, "Thrust must be a finite number not below 0 N.");
            }

            if (!IsFinite(massKg) || massKg <= 0.0)
            {
                throw new ArgumentOutOfRangeException(nameof(massKg), massKg, "Mass must be a finite number greater than 0 kg.");
            }

            return thrustSlN / (massKg * PhysicalConstants.StandardGravityMs2);
        }

        private static bool IsFinite(double value)
        {
            return !double.IsNaN(value) && !double.IsInfinity(value);
        }
    }
}
