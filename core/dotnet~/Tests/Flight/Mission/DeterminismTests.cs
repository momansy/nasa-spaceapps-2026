using System;
using System.Collections.Generic;
using System.Linq;
using System.Security.Cryptography;
using System.Text;
using MissionForge.Core.Flight.Mission;
using Newtonsoft.Json;
using Xunit;
using Xunit.Abstractions;

namespace MissionForge.Core.Tests.Flight.Mission
{
    public class DeterminismTests
    {
        private readonly ITestOutputHelper output;
        public DeterminismTests(ITestOutputHelper output) { this.output = output; }

        // Why two checks. The same binary on the same machine must replay a flight bit for bit; that is the
        // determinism guarantee a seed relies on, and it is checked exactly. A SHA-256 pinned across machines
        // is not portable: x64 and arm64 differ in fused multiply-add contraction and in the libm routines
        // behind Math.Sin/Cos/Exp/Pow, so last-bit differences feed through 172 692 integration steps of a
        // closed-loop autopilot. The old pinned hash (recorded on Windows x64, T042) failed on Apple silicon
        // for that reason (T044 D1). Across machines we therefore compare key outputs with a tolerance.
        //
        // Reference values below were recorded on macOS 26, Apple silicon (arm64), .NET 8.0.428, Seed 2026,
        // contract C1, full autopilot. They have NOT been re-recorded on x64; the tolerance is set so that
        // CPU rounding noise (last-bit differences, expected to be many orders below the bound) passes, while a real
        // model or balance change (a few m/s of dv, a second of burn time) does not.
        private const double RelativeTolerance = 1e-3;   // 0.1 % of the recorded value
        private const double InclinationToleranceDeg = 1e-6; // inclination is pinned by the launch azimuth, not integrated

        [Fact]
        public void Complete_C1_flight_is_bit_identical_across_two_runs_on_this_machine()
        {
            var first = RunC1();
            var second = RunC1();
            output.WriteLine("C1 snapshot/event SHA-256 (machine specific): " + first.Digest);
            Assert.Equal(first.Digest, second.Digest);
            Assert.Equal(first.Ticks, second.Ticks);
            Assert.Equal(first.Final.MetS, second.Final.MetS);
        }

        [Fact]
        public void Complete_C1_flight_key_outputs_match_recorded_values_within_tolerance()
        {
            var r = RunC1();
            // Discrete outcome and phase order must match exactly on every CPU.
            Assert.Equal(MissionOutcome.Success, r.Outcome);
            Assert.Null(r.Result.FailureMode);
            Assert.Equal(new[] { "F0", "F1", "F2", "F3", "F4", "F5", "F6", "F7", "F8", "F14" }, r.PhaseSequence);
            Assert.Equal(1, r.Result.Metrics["payload_deployed"]);
            // Continuous outputs: within RelativeTolerance of the recorded value.
            Near(172692, r.Ticks, "ticks (120 Hz)");
            Near(1429.0833333378519, r.Final.MetS, "final mission elapsed time (s)");
            Near(299.88798301859384, r.Result.Metrics["apogee_km"], "apogee_km");
            Near(290.0222553572087, r.Result.Metrics["orbit_altitude_km"], "orbit_altitude_km");
            Near(7729.767742380211, r.Final.VelocityMs, "final velocity (m/s)");
            Near(0.6443553693026509, r.Final.PropellantPct, "final propellant (%)");
            Near(331.2429846829888, r.Final.DvRemainingMs, "final dv remaining (m/s)");
            Assert.InRange(r.Result.Metrics["inclination_deg"], 97.6 - InclinationToleranceDeg, 97.6 + InclinationToleranceDeg);
        }

        private static void Near(double recorded, double actual, string what)
        {
            var allowed = Math.Abs(recorded) * RelativeTolerance;
            Assert.True(Math.Abs(actual - recorded) <= allowed,
                what + ": recorded " + recorded.ToString("R") + ", got " + actual.ToString("R") +
                ", allowed +/- " + allowed.ToString("R"));
        }

        private sealed class Run
        {
            public string Digest = "";
            public long Ticks;
            public FlightResult Result = null!;
            public MissionOutcome Outcome => Result.Outcome;
            public HudSnapshot Final = null!;
            public List<string> PhaseSequence = new List<string>();
        }

        private static Run RunC1()
        {
            var setup = PhaseDriverTests.Setup();
            setup.FullAutopilot = true;
            var sim = PhaseDriverTests.Sim(setup);
            using var hash = IncrementalHash.CreateHash(HashAlgorithmName.SHA256);
            var input = new PilotInput();
            var run = new Run();
            for (var i = 0; i < 180_000 && sim.Result == null; i++)
            {
                var events = sim.Step(input);
                Append(hash, JsonConvert.SerializeObject(events));
                Append(hash, JsonConvert.SerializeObject(sim.Snapshot()));
                run.PhaseSequence.AddRange(events.Where(e => e.Kind == "phase_entered").Select(e => e.Id));
            }
            Assert.NotNull(sim.Result);
            run.Result = sim.Result!;
            run.Final = sim.Snapshot();
            run.Ticks = run.Final.TickCount;
            run.Digest = Convert.ToHexString(hash.GetHashAndReset());
            return run;
        }

        private static void Append(IncrementalHash hash, string value)
        {
            var bytes = Encoding.UTF8.GetBytes(value);
            hash.AppendData(bytes);
            hash.AppendData(new byte[] { (byte)'\n' });
        }
    }
}
