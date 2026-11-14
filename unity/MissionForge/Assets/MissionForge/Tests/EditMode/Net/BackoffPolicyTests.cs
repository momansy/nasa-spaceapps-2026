using System;
using MissionForge.Net;
using NUnit.Framework;

namespace MissionForge.Tests.Net
{
    public sealed class BackoffPolicyTests
    {
        private const double Tolerance = 1e-12;

        [Test]
        public void NextDelaySeconds_WithoutJitter_DoublesFromBaseAndStopsAtMax()
        {
            var policy = new BackoffPolicy(baseSeconds: 0.5, maxSeconds: 15, factor: 2, jitterFraction: 0);
            double[] expected = { 0.5, 1, 2, 4, 8, 15, 15, 15 };

            foreach (double delay in expected)
            {
                Assert.AreEqual(delay, policy.NextDelaySeconds(), Tolerance);
            }
        }

        [Test]
        public void NextDelaySeconds_NeverExceedsMax_EvenAfterManyAttempts()
        {
            var policy = new BackoffPolicy(baseSeconds: 0.5, maxSeconds: 15, factor: 2, jitterFraction: 0.2);

            for (int attempt = 0; attempt < 5000; attempt++)
            {
                double delay = policy.NextDelaySeconds();

                Assert.LessOrEqual(delay, 15.0, "attempt " + attempt);
                Assert.Greater(delay, 0.0, "attempt " + attempt);
            }

            Assert.GreaterOrEqual(policy.NextDelaySeconds(), 15.0 * 0.8 - Tolerance, "a capped delay stays within the jitter band");
        }

        [Test]
        public void NextDelaySeconds_JitterStaysWithinTheConfiguredFraction()
        {
            const double jitter = 0.25;
            var policy = new BackoffPolicy(baseSeconds: 1, maxSeconds: 1000000, factor: 1, jitterFraction: jitter, seed: 99);
            double min = double.MaxValue;
            double max = double.MinValue;

            for (int i = 0; i < 2000; i++)
            {
                double delay = policy.NextDelaySeconds();
                min = Math.Min(min, delay);
                max = Math.Max(max, delay);
            }

            Assert.GreaterOrEqual(min, 1 - jitter);
            Assert.LessOrEqual(max, 1 + jitter);
            Assert.Less(min, 1 - jitter / 2, "jitter should reach the lower half of the band");
            Assert.Greater(max, 1 + jitter / 2, "jitter should reach the upper half of the band");
        }

        [Test]
        public void NextDelaySeconds_DefaultSeed_MatchesKnownSequence()
        {
            // Computed independently from the documented formula with xorshift32 (13, 17, 5) seeded with 12345.
            double[] expected =
            {
                0.5553877353668213,
                0.9580690622329712,
                2.124616193771362,
                3.9284729957580566,
                6.935579109191894,
                15,
            };
            var policy = new BackoffPolicy();

            foreach (double delay in expected)
            {
                Assert.AreEqual(delay, policy.NextDelaySeconds(), Tolerance);
            }
        }

        [Test]
        public void NextDelaySeconds_SameSeed_GivesTheSameSequence()
        {
            var first = new BackoffPolicy(seed: 777);
            var second = new BackoffPolicy(seed: 777);

            for (int i = 0; i < 20; i++)
            {
                Assert.AreEqual(first.NextDelaySeconds(), second.NextDelaySeconds());
            }
        }

        [Test]
        public void NextDelaySeconds_DifferentSeeds_GiveDifferentSequences()
        {
            var first = new BackoffPolicy(seed: 1);
            var second = new BackoffPolicy(seed: 2);

            Assert.AreNotEqual(first.NextDelaySeconds(), second.NextDelaySeconds());
        }

        [Test]
        public void NextDelaySeconds_ZeroSeed_StillProducesJitter()
        {
            var policy = new BackoffPolicy(seed: 0);

            Assert.AreEqual(0.46331870555877686, policy.NextDelaySeconds(), Tolerance);
            Assert.AreEqual(1.1502827882766724, policy.NextDelaySeconds(), Tolerance);
        }

        [Test]
        public void Attempt_CountsDelaysHandedOut()
        {
            var policy = new BackoffPolicy();

            Assert.AreEqual(0, policy.Attempt);
            policy.NextDelaySeconds();
            policy.NextDelaySeconds();

            Assert.AreEqual(2, policy.Attempt);
        }

        [Test]
        public void Reset_RestartsGrowthFromBase()
        {
            var policy = new BackoffPolicy(baseSeconds: 0.5, maxSeconds: 15, factor: 2, jitterFraction: 0);
            policy.NextDelaySeconds();
            policy.NextDelaySeconds();
            policy.NextDelaySeconds();

            policy.Reset();

            Assert.AreEqual(0, policy.Attempt);
            Assert.AreEqual(0.5, policy.NextDelaySeconds(), Tolerance);
            Assert.AreEqual(1, policy.Attempt);
        }

        [Test]
        public void Constructor_RejectsOutOfRangeArguments()
        {
            Assert.Throws<ArgumentOutOfRangeException>(() => new BackoffPolicy(baseSeconds: 0));
            Assert.Throws<ArgumentOutOfRangeException>(() => new BackoffPolicy(baseSeconds: double.NaN));
            Assert.Throws<ArgumentOutOfRangeException>(() => new BackoffPolicy(baseSeconds: 2, maxSeconds: 1));
            Assert.Throws<ArgumentOutOfRangeException>(() => new BackoffPolicy(factor: 0.5));
            Assert.Throws<ArgumentOutOfRangeException>(() => new BackoffPolicy(jitterFraction: -0.1));
            Assert.Throws<ArgumentOutOfRangeException>(() => new BackoffPolicy(jitterFraction: 1.5));
        }
    }
}
