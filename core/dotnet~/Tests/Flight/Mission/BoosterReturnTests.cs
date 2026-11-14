using MissionForge.Core.Flight.Mission;
using Xunit;

namespace MissionForge.Core.Tests.Flight.Mission
{
    public class BoosterReturnTests
    {
        [Fact]
        public void C8_style_booster_lands_under_autopilot()
        {
            var booster = new BoosterReturnSim(80_000, -100, 50_000, 25_000, 18_000, 900_000, 280);
            var input = new CraftInput();
            for (var i = 0; i < 120_000 && booster.Phase != BoosterReturnPhase.Landed
                && booster.Phase != BoosterReturnPhase.Failed; i++) booster.Step(input, true);
            Assert.True(booster.Succeeded, $"phase={booster.Phase} speed={booster.TouchdownSpeedMs:R} error={booster.HorizontalErrorM:R} prop={booster.ReservedPropellantKg:R} altitude={booster.AltitudeM:R}");
            Assert.InRange(booster.TouchdownSpeedMs, 0, 2);
            Assert.InRange(booster.HorizontalErrorM, 0, 100);
        }
    }
}
