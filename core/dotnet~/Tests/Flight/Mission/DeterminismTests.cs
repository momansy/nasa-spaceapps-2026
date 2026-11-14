using System;
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

        [Fact]
        public void Complete_C1_flight_has_a_repeatable_snapshot_and_event_hash()
        {
            var first = FlightDigest();
            var second = FlightDigest();
            output.WriteLine("C1 snapshot/event SHA-256: " + first);
            Assert.Equal(first, second);
            Assert.Equal("C55B910B89825D78343AD4EC0093E45FD093553223516D6FF891D8F8A9BB154F", first);
        }

        private static string FlightDigest()
        {
            var setup = PhaseDriverTests.Setup();
            setup.FullAutopilot = true;
            var sim = PhaseDriverTests.Sim(setup);
            using var hash = IncrementalHash.CreateHash(HashAlgorithmName.SHA256);
            var input = new PilotInput();
            for (var i = 0; i < 180_000 && sim.Result == null; i++)
            {
                Append(hash, JsonConvert.SerializeObject(sim.Step(input)));
                Append(hash, JsonConvert.SerializeObject(sim.Snapshot()));
            }
            Assert.NotNull(sim.Result);
            return Convert.ToHexString(hash.GetHashAndReset());
        }

        private static void Append(IncrementalHash hash, string value)
        {
            var bytes = Encoding.UTF8.GetBytes(value);
            hash.AppendData(bytes);
            hash.AppendData(new byte[] { (byte)'\n' });
        }
    }
}
