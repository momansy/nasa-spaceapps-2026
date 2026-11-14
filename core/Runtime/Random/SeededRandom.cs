using System;
using System.Text;

namespace MissionForge.Core.Random
{
    /// <summary>
    /// The one pseudo-random number generator of MissionForge Core (design section 17.6).
    /// Deterministic on every platform: the same session seed and stream name always give the
    /// same sequence, so a mission can be replayed exactly.
    /// </summary>
    /// <remarks>
    /// <para>Algorithm: xoshiro256** (Blackman and Vigna), state initialised from the seed with SplitMix64.</para>
    /// <para>
    /// Every random draw names its stream: create one root generator from the session seed and call
    /// <see cref="ForStream"/> for each purpose ("anomaly", "failure", "tiebreak"). A stream depends only
    /// on the seed and the name, never on how many numbers were drawn elsewhere, so adding draws to one
    /// system does not change the results of another.
    /// </para>
    /// <para>Not thread-safe and not suitable for cryptography. Do not use <c>System.Random</c> in Core.</para>
    /// </remarks>
    public sealed class SeededRandom
    {
        private const ulong SplitMixGamma = 0x9E3779B97F4A7C15UL;
        private const ulong FnvOffsetBasis = 0xCBF29CE484222325UL;
        private const ulong FnvPrime = 0x00000100000001B3UL;

        /// <summary>2^-53: turns the top 53 bits of a 64-bit draw into a double in [0, 1).</summary>
        private const double DoubleUnit = 1.0 / 9007199254740992.0;

        private ulong _s0;
        private ulong _s1;
        private ulong _s2;
        private ulong _s3;

        /// <summary>Creates the root generator of a session.</summary>
        /// <param name="seed">Session seed. Any value is valid, including 0.</param>
        public SeededRandom(ulong seed)
            : this(seed, string.Empty)
        {
        }

        private SeededRandom(ulong seed, string streamName)
        {
            Seed = seed;
            StreamName = streamName;
            ulong state = seed;
            _s0 = SplitMix64(ref state);
            _s1 = SplitMix64(ref state);
            _s2 = SplitMix64(ref state);
            _s3 = SplitMix64(ref state);
        }

        /// <summary>The seed this generator was created from (the session seed for the root generator).</summary>
        public ulong Seed { get; }

        /// <summary>The stream name, "" for the root generator; nested streams are joined with "/".</summary>
        public string StreamName { get; }

        /// <summary>
        /// Returns a new, independent generator for a named purpose, for example <c>ForStream("failure")</c>.
        /// The result depends only on <see cref="Seed"/> and <paramref name="name"/>: calling it twice with the
        /// same name gives two generators that produce the same sequence, whatever was drawn in between.
        /// </summary>
        /// <param name="name">Stream name, case-sensitive and not empty.</param>
        /// <exception cref="ArgumentNullException"><paramref name="name"/> is null.</exception>
        /// <exception cref="ArgumentException"><paramref name="name"/> is empty.</exception>
        public SeededRandom ForStream(string name)
        {
            if (name == null)
            {
                throw new ArgumentNullException(nameof(name));
            }

            if (name.Length == 0)
            {
                throw new ArgumentException("Stream name must not be empty.", nameof(name));
            }

            ulong state = Seed;
            ulong mixed = SplitMix64(ref state) ^ Fnv1a64(name);
            ulong derivedSeed = SplitMix64(ref mixed);
            string fullName = StreamName.Length == 0 ? name : StreamName + "/" + name;
            return new SeededRandom(derivedSeed, fullName);
        }

        /// <summary>Returns the next 64 uniformly distributed bits.</summary>
        public ulong NextUInt64()
        {
            unchecked
            {
                ulong result = RotateLeft(_s1 * 5UL, 7) * 9UL;
                ulong t = _s1 << 17;

                _s2 ^= _s0;
                _s3 ^= _s1;
                _s1 ^= _s2;
                _s0 ^= _s3;
                _s2 ^= t;
                _s3 = RotateLeft(_s3, 45);

                return result;
            }
        }

        /// <summary>Returns a uniformly distributed double in [0, 1) with 53 random bits.</summary>
        public double NextDouble()
        {
            return (NextUInt64() >> 11) * DoubleUnit;
        }

        /// <summary>
        /// Returns a uniformly distributed integer in [<paramref name="minInclusive"/>, <paramref name="maxExclusive"/>),
        /// without modulo bias.
        /// </summary>
        /// <param name="minInclusive">Lowest value that can be returned.</param>
        /// <param name="maxExclusive">One more than the highest value that can be returned; must be greater than <paramref name="minInclusive"/>.</param>
        /// <exception cref="ArgumentOutOfRangeException"><paramref name="maxExclusive"/> is not greater than <paramref name="minInclusive"/>.</exception>
        public int NextInt(int minInclusive, int maxExclusive)
        {
            if (maxExclusive <= minInclusive)
            {
                throw new ArgumentOutOfRangeException(nameof(maxExclusive), maxExclusive, "maxExclusive must be greater than minInclusive.");
            }

            ulong range = (ulong)((long)maxExclusive - (long)minInclusive);

            // Reject the lowest (2^64 mod range) values so that every result is equally likely.
            ulong threshold = unchecked(0UL - range) % range;
            ulong draw;
            do
            {
                draw = NextUInt64();
            }
            while (draw < threshold);

            return (int)((long)minInclusive + (long)(draw % range));
        }

        /// <summary>
        /// Returns true with the given probability. Always consumes exactly one draw, also for 0 and 1,
        /// so that a stream stays aligned whatever the probabilities are.
        /// </summary>
        /// <param name="probability">Probability of returning true, from 0 (never) to 1 (always).</param>
        /// <exception cref="ArgumentOutOfRangeException"><paramref name="probability"/> is NaN or outside [0, 1].</exception>
        public bool Chance(double probability)
        {
            if (double.IsNaN(probability) || probability < 0.0 || probability > 1.0)
            {
                throw new ArgumentOutOfRangeException(nameof(probability), probability, "Probability must be between 0 and 1.");
            }

            return NextDouble() < probability;
        }

        private static ulong RotateLeft(ulong value, int count)
        {
            return (value << count) | (value >> (64 - count));
        }

        /// <summary>SplitMix64 step: advances <paramref name="state"/> and returns the next output.</summary>
        private static ulong SplitMix64(ref ulong state)
        {
            unchecked
            {
                state += SplitMixGamma;
                ulong z = state;
                z = (z ^ (z >> 30)) * 0xBF58476D1CE4E5B9UL;
                z = (z ^ (z >> 27)) * 0x94D049BB133111EBUL;
                return z ^ (z >> 31);
            }
        }

        /// <summary>FNV-1a 64-bit hash of the UTF-8 bytes of a stream name. Stable across platforms, unlike string.GetHashCode.</summary>
        private static ulong Fnv1a64(string text)
        {
            byte[] bytes = Encoding.UTF8.GetBytes(text);
            ulong hash = FnvOffsetBasis;
            unchecked
            {
                for (int i = 0; i < bytes.Length; i++)
                {
                    hash ^= bytes[i];
                    hash *= FnvPrime;
                }
            }

            return hash;
        }
    }
}
