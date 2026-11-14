using System;
using System.Linq;
using MissionForge.Core.Random;
using Xunit;

namespace MissionForge.Core.Tests.RandomTests
{
    public class SeededRandomTests
    {
        private const ulong SessionSeed = 20261114UL;

        private static ulong[] Draw(SeededRandom rng, int count)
        {
            var values = new ulong[count];
            for (int i = 0; i < count; i++)
            {
                values[i] = rng.NextUInt64();
            }

            return values;
        }

        [Fact]
        public void Same_seed_and_stream_give_the_same_sequence()
        {
            ulong[] first = Draw(new SeededRandom(SessionSeed).ForStream("failure"), 100);
            ulong[] second = Draw(new SeededRandom(SessionSeed).ForStream("failure"), 100);

            Assert.Equal(first, second);
        }

        [Fact]
        public void Different_streams_give_different_sequences()
        {
            var root = new SeededRandom(SessionSeed);
            ulong[] failure = Draw(root.ForStream("failure"), 16);
            ulong[] anomaly = Draw(root.ForStream("anomaly"), 16);
            ulong[] tiebreak = Draw(root.ForStream("tiebreak"), 16);

            Assert.NotEqual(failure, anomaly);
            Assert.NotEqual(failure, tiebreak);
            Assert.NotEqual(anomaly, tiebreak);
        }

        [Fact]
        public void Different_seeds_give_different_sequences()
        {
            ulong[] first = Draw(new SeededRandom(1UL).ForStream("failure"), 16);
            ulong[] second = Draw(new SeededRandom(2UL).ForStream("failure"), 16);

            Assert.NotEqual(first, second);
        }

        [Fact]
        public void A_stream_does_not_depend_on_draws_made_elsewhere()
        {
            var untouched = new SeededRandom(SessionSeed);
            var busy = new SeededRandom(SessionSeed);
            Draw(busy, 50);
            Draw(busy.ForStream("anomaly"), 50);

            Assert.Equal(Draw(untouched.ForStream("failure"), 20), Draw(busy.ForStream("failure"), 20));
        }

        [Fact]
        public void Golden_values_pin_the_algorithm_across_platforms()
        {
            // Produced by an independent BigInt implementation of the same algorithm
            // (xoshiro256** seeded by SplitMix64; stream seed = SplitMix64(SplitMix64(seed) ^ FNV-1a-64(UTF-8 name))).
            // The seed-0 value is the published first output of xoshiro256** seeded from SplitMix64(0).
            // If one of these changes, saved replays no longer match: do not "fix" the expected values.
            Assert.Equal(
                new[] { 0x99EC5F36CB75F2B4UL, 0xBF6E1F784956452AUL, 0x1A5F849D4933E6E0UL, 0x6AA594F1262D2D2CUL },
                Draw(new SeededRandom(0UL), 4));

            Assert.Equal(
                new[] { 0xF1AA28F06FD97C6AUL, 0xDEFC0040CB2522ACUL, 0xA96787F524AE0F01UL },
                Draw(new SeededRandom(SessionSeed), 3));

            SeededRandom failure = new SeededRandom(SessionSeed).ForStream("failure");
            Assert.Equal(0x108210337ED9CD6BUL, failure.Seed);
            Assert.Equal(
                new[] { 0x03D9C6347BA08AB5UL, 0x1135025EB1062E9BUL, 0xFAB89C659A975ADBUL },
                Draw(failure, 3));

            SeededRandom anomaly = new SeededRandom(SessionSeed).ForStream("anomaly");
            Assert.Equal(0xCDE5D72CC6EA129CUL, anomaly.Seed);
            Assert.Equal(
                new[] { 0xB1A3C1927EB6E564UL, 0x0E94CC9028FA4394UL, 0x45A952898A053B37UL },
                Draw(anomaly, 3));
        }

        [Fact]
        public void NextDouble_golden_values()
        {
            SeededRandom failure = new SeededRandom(SessionSeed).ForStream("failure");

            Assert.Equal(0.015041721165859667, failure.NextDouble(), 15);
            Assert.Equal(0.06721510707668499, failure.NextDouble(), 15);
            Assert.Equal(0.9793794391685798, failure.NextDouble(), 15);
        }

        [Fact]
        public void NextInt_golden_values()
        {
            SeededRandom tiebreak = new SeededRandom(SessionSeed).ForStream("tiebreak");
            int[] rolls = Enumerable.Range(0, 10).Select(_ => tiebreak.NextInt(1, 7)).ToArray();

            Assert.Equal(new[] { 2, 5, 2, 6, 6, 4, 4, 2, 2, 6 }, rolls);
        }

        [Fact]
        public void NextDouble_stays_in_unit_interval()
        {
            SeededRandom rng = new SeededRandom(SessionSeed).ForStream("range");
            for (int i = 0; i < 10_000; i++)
            {
                double value = rng.NextDouble();
                Assert.InRange(value, 0.0, 1.0);
                Assert.NotEqual(1.0, value);
            }
        }

        [Fact]
        public void NextInt_stays_in_range_and_reaches_both_ends()
        {
            SeededRandom rng = new SeededRandom(SessionSeed).ForStream("range");
            var seen = new bool[6];
            for (int i = 0; i < 10_000; i++)
            {
                int value = rng.NextInt(-2, 4);
                Assert.InRange(value, -2, 3);
                seen[value + 2] = true;
            }

            Assert.All(seen, Assert.True);
        }

        [Fact]
        public void NextInt_handles_the_full_int_range()
        {
            SeededRandom rng = new SeededRandom(SessionSeed).ForStream("range");
            for (int i = 0; i < 1000; i++)
            {
                int value = rng.NextInt(int.MinValue, int.MaxValue);
                Assert.True(value < int.MaxValue);
            }

            Assert.Equal(7, rng.NextInt(7, 8));
        }

        [Fact]
        public void NextInt_rejects_an_empty_range()
        {
            var rng = new SeededRandom(SessionSeed);

            Assert.Throws<ArgumentOutOfRangeException>(() => rng.NextInt(5, 5));
            Assert.Throws<ArgumentOutOfRangeException>(() => rng.NextInt(5, 4));
        }

        [Fact]
        public void Chance_handles_certain_and_impossible_events()
        {
            SeededRandom rng = new SeededRandom(SessionSeed).ForStream("chance");
            for (int i = 0; i < 1000; i++)
            {
                Assert.False(rng.Chance(0.0));
                Assert.True(rng.Chance(1.0));
            }
        }

        [Fact]
        public void Chance_matches_its_probability_roughly()
        {
            SeededRandom rng = new SeededRandom(SessionSeed).ForStream("chance");
            int hits = 0;
            const int Trials = 20_000;
            for (int i = 0; i < Trials; i++)
            {
                if (rng.Chance(0.3))
                {
                    hits++;
                }
            }

            // Expected 6000; standard deviation sqrt(20000 * 0.3 * 0.7) = 64.8. Allow about 6 sigma.
            Assert.InRange(hits, 5600, 6400);
        }

        [Fact]
        public void Chance_always_consumes_one_draw()
        {
            SeededRandom withChance = new SeededRandom(SessionSeed).ForStream("align");
            SeededRandom plain = new SeededRandom(SessionSeed).ForStream("align");

            withChance.Chance(0.0);
            withChance.Chance(1.0);
            plain.NextUInt64();
            plain.NextUInt64();

            Assert.Equal(plain.NextUInt64(), withChance.NextUInt64());
        }

        [Theory]
        [InlineData(-0.01)]
        [InlineData(1.01)]
        [InlineData(double.NaN)]
        public void Chance_rejects_invalid_probabilities(double probability)
        {
            var rng = new SeededRandom(SessionSeed);

            Assert.Throws<ArgumentOutOfRangeException>(() => rng.Chance(probability));
        }

        [Fact]
        public void ForStream_validates_and_names_streams()
        {
            var root = new SeededRandom(SessionSeed);

            Assert.Equal(string.Empty, root.StreamName);
            Assert.Equal(SessionSeed, root.Seed);
            Assert.Equal("failure", root.ForStream("failure").StreamName);
            Assert.Equal("failure/engine", root.ForStream("failure").ForStream("engine").StreamName);
            Assert.Throws<ArgumentNullException>(() => root.ForStream(null!));
            Assert.Throws<ArgumentException>(() => root.ForStream(string.Empty));
        }

        [Fact]
        public void Stream_names_are_case_sensitive()
        {
            var root = new SeededRandom(SessionSeed);

            Assert.NotEqual(Draw(root.ForStream("failure"), 8), Draw(root.ForStream("Failure"), 8));
        }
    }
}
