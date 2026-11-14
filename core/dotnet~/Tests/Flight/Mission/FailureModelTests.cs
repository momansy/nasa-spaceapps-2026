using System;
using MissionForge.Core.Flight.Mission;
using Xunit;

namespace MissionForge.Core.Tests.Flight.Mission
{
    public class FailureModelTests
    {
        [Fact]
        public void Mission_frequency_matches_true_reliability_within_three_sigma()
        {
            const int samples = 2000;
            const double reliability = 0.97;
            var checkpoints = new[] { "ignition", "liftoff", "max_q", "staging" };
            var successes = 0;
            for (ulong seed = 0; seed < samples; seed++)
            {
                var passed = true;
                foreach (var checkpoint in checkpoints)
                    passed &= MissionFailureModel.Succeeds(seed, reliability, checkpoints.Length,
                        checkpoint, "first_stage_engine");
                if (passed) successes++;
            }
            var expected = samples * reliability;
            var sigma = Math.Sqrt(samples * reliability * (1 - reliability));
            Assert.InRange(successes, expected - 3 * sigma, expected + 3 * sigma);
        }

        [Fact]
        public void Rolls_are_bit_identical_and_keyed_by_checkpoint_slot_and_unit()
        {
            for (ulong seed = 0; seed < 100; seed++)
            {
                var a = MissionFailureModel.Succeeds(seed, 0.8, 3, "max_q", "structure", 2);
                var b = MissionFailureModel.Succeeds(seed, 0.8, 3, "max_q", "structure", 2);
                Assert.Equal(a, b);
            }
        }

        [Fact]
        public void Condition_thresholds_apply_disclosed_margins()
        {
            Assert.False(MissionFailureModel.StructuralLimitExceeded(50_000, 1.5, 0));
            Assert.True(MissionFailureModel.StructuralLimitExceeded(60_000, 1.5, 0));
            Assert.False(MissionFailureModel.StructuralLimitExceeded(60_000, 1.5, 0.10));
            Assert.True(MissionFailureModel.HeatShieldLimitExceeded(11_100, 11_000, 0, 0));
            Assert.False(MissionFailureModel.HeatShieldLimitExceeded(11_100, 11_000, 0, 0.02));
            Assert.True(MissionFailureModel.OutsideRangeCorridor(100_001));
        }
    }
}
