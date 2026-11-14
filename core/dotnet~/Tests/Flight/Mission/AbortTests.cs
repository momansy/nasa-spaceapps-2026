using System;
using System.Linq;
using MissionForge.Core.Flight.Mission;
using MissionForge.Core.Tests.Data;
using Xunit;

namespace MissionForge.Core.Tests.Flight.Mission
{
    public class AbortTests
    {
        [Fact]
        public void Catalog_loads_real_abort_modes_and_rejects_unknown_ids()
        {
            var catalog = AbortModeCatalog.Load(DesignFixture.RealFiles()["abort_modes.json"]);
            Assert.Equal(5, catalog.Modes.Count);
            Assert.Contains("F2", catalog.Mode("pad_abort").FlightPhaseIds);
            Assert.True(catalog.Mode("ascent_abort").RequiresEscapeSystem);
            Assert.ThrowsAny<Exception>(() => catalog.Mode("missing"));
        }

        [Fact]
        public void Uncrewed_C1_has_no_escape_abort_on_pad()
        {
            var setup = PhaseDriverTests.Setup();
            setup.Aborts = AbortModeCatalog.Load(DesignFixture.RealFiles()["abort_modes.json"]);
            var sim = PhaseDriverTests.Sim(setup);
            for (var i = 0; i < 1500; i++) sim.Step(new PilotInput());
            Assert.Equal("F2", sim.Phase);
            Assert.DoesNotContain("pad_abort", sim.AvailableAborts());
            Assert.Throws<InvalidOperationException>(() => sim.Abort("pad_abort"));
        }
    }
}
