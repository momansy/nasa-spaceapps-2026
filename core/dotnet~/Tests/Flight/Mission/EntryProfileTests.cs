using MissionForge.Core.Flight;
using MissionForge.Core.Flight.Mission;
using Xunit;

namespace MissionForge.Core.Tests.Flight.Mission
{
    public class EntryProfileTests
    {
        [Fact]
        public void C4_entry_has_sane_peak_heating_and_g_load()
        {
            // C4 is a LEO capsule return; the contract leaves speed unspecified, so use the
            // design's real_world_approximate LEO value of 7.8 km/s for this sanity test.
            var entrySpeedMs = MissionFixture.Catalog.Contract("C4").EntrySpeedMps ?? 7_800;
            var result = EntryProfile.Simulate(Body.Earth, entrySpeedMs, 1.5);
            Assert.InRange(result.PeakHeatFluxWm2, 100_000, 10_000_000);
            Assert.InRange(result.PeakGLoadUnitless, 1, 15);
            Assert.True(result.HeatLoadJm2 > result.PeakHeatFluxWm2);
            Assert.InRange(result.DurationS, 30, 1000);
        }
    }
}
