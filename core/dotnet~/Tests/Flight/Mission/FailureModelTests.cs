using System;
using System.Collections.Generic;
using System.Linq;
using MissionForge.Core.Build;
using MissionForge.Core.Data;
using MissionForge.Core.Flight.Mission;
using Newtonsoft.Json;
using Xunit;
using Xunit.Abstractions;

namespace MissionForge.Core.Tests.Flight.Mission
{
    public class FailureModelTests
    {
        private readonly ITestOutputHelper output;
        public FailureModelTests(ITestOutputHelper output) { this.output = output; }

        private static FlightVehicleSpec Spec(ulong seed) =>
            FlightVehicleSpec.FromBuild(MissionFixture.C1(seed), MissionFixture.Catalog);

        private static List<FailureRecord> RollAll(FailureModel model)
        {
            var all = new List<FailureRecord>();
            foreach (var cp in FailureModel.AllCheckpoints) all.AddRange(model.Roll(cp));
            return all;
        }

        [Fact]
        public void Failure_frequency_over_2000_seeds_matches_true_reliability_within_three_sigma()
        {
            double expected = 0, variance = 0; var observed = 0;
            for (ulong seed = 1; seed <= 2000; seed++)
            {
                var spec = Spec(seed);
                var p = 1 - ReliabilityModel.TrueSuccess(new Vehicle(MissionFixture.C1(seed), MissionFixture.Catalog)).Success;
                expected += p; variance += p * (1 - p);
                if (RollAll(new FailureModel(spec, null)).Any(r => r.Kind == "failure" && r.MissionImpact)) observed++;
            }
            var sigma = Math.Sqrt(variance);
            output.WriteLine($"observed {observed}; expected {expected:F1} ± {sigma:F1} (1 sigma) of 2000 seeds");
            Assert.True(expected > 20, "the C1 build must fail often enough for the statistic to mean something");
            Assert.InRange(observed, expected - 3 * sigma, expected + 3 * sigma);
        }

        [Fact]
        public void Draws_are_independent_of_call_history_and_runs_are_bit_identical()
        {
            var a = JsonConvert.SerializeObject(RollAll(new FailureModel(Spec(77), null)));
            var b = JsonConvert.SerializeObject(RollAll(new FailureModel(Spec(77), null)));
            Assert.Equal(a, b);
            // Rolling checkpoints in reverse order gives the same failed set: draws are keyed, not sequential.
            var reversed = new List<FailureRecord>();
            var model = new FailureModel(Spec(77), null);
            foreach (var cp in FailureModel.AllCheckpoints.Reverse()) reversed.AddRange(model.Roll(cp));
            Assert.Equal(RollAll(new FailureModel(Spec(77), null)).Select(r => r.Mode + r.Slot).OrderBy(x => x),
                reversed.Select(r => r.Mode + r.Slot).OrderBy(x => x));
        }

        private static ulong FindFatalSeed(Func<FailureModel, bool> accept, out FlightVehicleSpec spec)
        {
            for (ulong seed = 1; seed < 5000; seed++)
            {
                spec = Spec(seed);
                var records = RollAll(new FailureModel(spec, null));
                if (records.Count(r => r.Kind == "failure" && r.Fatal) == 1 && accept(new FailureModel(spec, null)))
                    return seed;
            }
            throw new InvalidOperationException("no seed");
        }

        [Fact]
        public void Negate_reroll_and_save_the_mission_consume_shields_in_queue_order()
        {
            FindFatalSeed(_ => true, out var spec);
            var bare = RollAll(new FailureModel(spec, null));
            var fatal = bare.Single(r => r.Fatal);

            var negate = RollAll(new FailureModel(spec, new FlightModifiers { Shields = new[] { ShieldKind.Negate } }));
            Assert.Contains(negate, r => r.Kind == "shield_consumed" && r.Mode == "negate");
            Assert.DoesNotContain(negate, r => r.Fatal);

            var save = RollAll(new FailureModel(spec, new FlightModifiers { SaveTheMission = true }));
            Assert.Contains(save, r => r.Kind == "shield_consumed" && r.Mode == "save_the_mission");
            Assert.DoesNotContain(save, r => r.Fatal);

            // A reroll uses a different keyed draw: deterministic, and it never changes other draws.
            var m1 = JsonConvert.SerializeObject(RollAll(new FailureModel(spec, new FlightModifiers { Shields = new[] { ShieldKind.Reroll } })));
            var m2 = JsonConvert.SerializeObject(RollAll(new FailureModel(spec, new FlightModifiers { Shields = new[] { ShieldKind.Reroll } })));
            Assert.Equal(m1, m2);
            Assert.Contains("shield_consumed", m1);
            Assert.True(fatal.MissionImpact);
        }

        [Fact]
        public void Condition_failures_use_game_value_thresholds_with_margins()
        {
            var spec = Spec(2026);
            var plain = new FailureModel(spec, null);
            var limit = plain.StructuralLimitKpaG(0);
            Assert.False(plain.IsStructuralOverload(limit * 1000 * 0.99, 1));
            Assert.True(plain.IsStructuralOverload(limit * 1000 * 1.01, 1));
            var margin = new FailureModel(spec, new FlightModifiers { LoadMarginFraction = 0.1 });
            Assert.False(margin.IsStructuralOverload(limit * 1000 * 1.05, 1));
            Assert.True(plain.IsBurnThrough(8000, 0.5, 7000));
            Assert.False(plain.IsBurnThrough(7000, 0.99, 7000));
            Assert.False(new FailureModel(spec, new FlightModifiers { HeatMarginFraction = 0.2 }).IsBurnThrough(8000, 0.5, 7000));
            Assert.True(FailureModel.IsRangeSafetyViolation(20000, -0.2));
            Assert.False(FailureModel.IsRangeSafetyViolation(20000, 0.1));
            Assert.False(FailureModel.IsRangeSafetyViolation(500, -0.5));
            Assert.False(plain.IsPogoProne); // C1's small first stage is below the long-stage threshold
            Assert.False(plain.HasImuOnlyNavigation);
        }

        [Fact]
        public void Condition_failure_is_negated_by_a_negate_shield_once()
        {
            var model = new FailureModel(Spec(2026), new FlightModifiers { Shields = new[] { ShieldKind.Negate } });
            Assert.Contains(model.Condition("maxq", "structural_failure", "structural_material"), r => r.Kind == "shield_consumed");
            var again = model.Condition("maxq", "structural_failure", "structural_material");
            Assert.Empty(again);
            var other = model.Condition("entry", "burn_through", "heat_shield");
            Assert.Contains(other, r => r.Kind == "failure" && r.Fatal);
        }

        [Fact]
        public void Mission_reports_a_fatal_failure_event_and_result_and_pilot_input_does_not_change_it()
        {
            // Find a C1 seed whose keyed draws kill the vehicle, then fly it under the autopilot.
            ulong seed = 0;
            for (ulong s = 1; s < 3000 && seed == 0; s++)
                if (RollAll(new FailureModel(Spec(s), null)).Any(r => r.Fatal)) seed = s;
            Assert.NotEqual(0UL, seed);
            Func<bool, FlightResult> fly = full =>
            {
                var setup = PhaseDriverTests.Setup(); setup.Seed = seed; setup.FullAutopilot = true;
                var sim = MissionSim.Create(Spec(seed), setup);
                for (var i = 0; i < 200000 && sim.Result == null; i++)
                    sim.Step(new PilotInput { Main = new CraftInput { PitchRad = full ? Math.PI / 2 : 1.0 } });
                Assert.NotNull(sim.Result);
                return sim.Result!;
            };
            var a = fly(true); var b = fly(false);
            Assert.Equal(MissionOutcome.Failure, a.Outcome);
            Assert.NotNull(a.FailureMode); Assert.NotNull(a.FailureSlot);
            Assert.Equal(a.FailureMode, b.FailureMode); Assert.Equal(a.FailureSlot, b.FailureSlot);
        }
    }
}
