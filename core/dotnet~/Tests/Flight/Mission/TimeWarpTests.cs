using MissionForge.Core.Flight.Mission;
using Xunit;

namespace MissionForge.Core.Tests.Flight.Mission
{
    public class TimeWarpTests
    {
        [Fact]
        public void Warp_is_gated_by_power_altitude_and_minigames()
        {
            Assert.Equal(1, MissionTimeWarp.Resolve(1000, true, 300_000, false));
            Assert.Equal(1, MissionTimeWarp.Resolve(1000, false, 69_999, false));
            Assert.Equal(0.1, MissionTimeWarp.Resolve(1000, false, 300_000, true));
            Assert.Equal(1000, MissionTimeWarp.Resolve(5000, false, 300_000, false));
            Assert.Equal(20, MissionTimeWarp.Resolve(20, false, 300_000, false));
            Assert.Equal(1, MissionTimeWarp.Resolve(0.5, false, 300_000, false));
        }
    }
}
