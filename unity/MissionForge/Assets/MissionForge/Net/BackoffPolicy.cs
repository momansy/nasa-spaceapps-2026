using System;

namespace MissionForge.Net
{
    /// <summary>
    /// Exponential backoff with jitter for reconnect attempts. The jitter comes from a small
    /// internal xorshift32 generator, so the delay sequence is fully determined by the seed.
    /// </summary>
    /// <remarks>
    /// Delay n (0-based) is <c>min(maxSeconds, baseSeconds * factor^n)</c> scaled by a random
    /// factor in <c>[1 - jitterFraction, 1 + jitterFraction)</c> and then capped at
    /// <c>maxSeconds</c>. <see cref="Reset"/> restarts the growth but not the random sequence.
    /// </remarks>
    public sealed class BackoffPolicy
    {
        /// <summary>xorshift32 must never hold zero; this replaces a zero seed.</summary>
        private const uint ZeroSeedReplacement = 0x9E3779B9u;

        /// <summary>The generator's top 24 bits are used, giving a uniform value in [0, 1).</summary>
        private const int UnitRandomBits = 24;
        private const double UnitRandomScale = 1.0 / (1 << UnitRandomBits);

        private readonly double _baseSeconds;
        private readonly double _maxSeconds;
        private readonly double _factor;
        private readonly double _jitterFraction;
        private uint _randomState;

        /// <summary>Creates a policy.</summary>
        /// <param name="baseSeconds">First delay before jitter; must be positive.</param>
        /// <param name="maxSeconds">Hard upper bound of every delay; must be at least <paramref name="baseSeconds"/>.</param>
        /// <param name="factor">Growth per attempt; must be at least 1.</param>
        /// <param name="jitterFraction">Relative jitter in [0, 1]; 0 disables jitter.</param>
        /// <param name="seed">Seed of the jitter sequence.</param>
        /// <exception cref="ArgumentOutOfRangeException">An argument is outside its documented range.</exception>
        public BackoffPolicy(double baseSeconds = 0.5, double maxSeconds = 15, double factor = 2, double jitterFraction = 0.2, int seed = 12345)
        {
            if (!(baseSeconds > 0))
            {
                throw new ArgumentOutOfRangeException(nameof(baseSeconds), "Must be positive.");
            }

            if (!(maxSeconds >= baseSeconds) || double.IsInfinity(maxSeconds))
            {
                throw new ArgumentOutOfRangeException(nameof(maxSeconds), "Must be finite and at least baseSeconds.");
            }

            if (!(factor >= 1))
            {
                throw new ArgumentOutOfRangeException(nameof(factor), "Must be at least 1.");
            }

            if (!(jitterFraction >= 0 && jitterFraction <= 1))
            {
                throw new ArgumentOutOfRangeException(nameof(jitterFraction), "Must be between 0 and 1.");
            }

            _baseSeconds = baseSeconds;
            _maxSeconds = maxSeconds;
            _factor = factor;
            _jitterFraction = jitterFraction;
            _randomState = seed == 0 ? ZeroSeedReplacement : unchecked((uint)seed);
        }

        /// <summary>Number of delays handed out since construction or the last <see cref="Reset"/>.</summary>
        public int Attempt { get; private set; }

        /// <summary>Returns the delay to wait before the next attempt and advances <see cref="Attempt"/>.</summary>
        public double NextDelaySeconds()
        {
            double grown = _baseSeconds * Math.Pow(_factor, Attempt);
            double capped = grown < _maxSeconds ? grown : _maxSeconds; // also handles +Infinity
            double jitter = 1.0 + _jitterFraction * (2.0 * NextUnitRandom() - 1.0);

            if (Attempt < int.MaxValue)
            {
                Attempt++;
            }

            return Math.Min(_maxSeconds, capped * jitter);
        }

        /// <summary>Restarts the growth from <c>baseSeconds</c>. Call after a successful connection.</summary>
        public void Reset()
        {
            Attempt = 0;
        }

        private double NextUnitRandom()
        {
            uint x = _randomState;
            x ^= x << 13;
            x ^= x >> 17;
            x ^= x << 5;
            _randomState = x;
            return (x >> (32 - UnitRandomBits)) * UnitRandomScale;
        }
    }
}
