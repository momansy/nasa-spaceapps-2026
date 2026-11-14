using System;
using System.Collections.Generic;
using System.Linq;
using MissionForge.Core.Data;
using MissionForge.Core.Flight.Mission;
using MissionForge.Core.Tests.Data;
using Newtonsoft.Json.Linq;
using Xunit;

namespace MissionForge.Core.Tests.Flight.Mission
{
    public class PhaseCatalogTests
    {
        private static string RealJson => DesignFixture.RealFiles()["flight_phases.json"];

        [Fact]
        public void Real_catalog_preserves_phase_order_cues_and_distinct_fact_fields()
        {
            var catalog = FlightPhaseCatalog.Load(RealJson);
            Assert.Equal(new[] { "F0", "F1", "F2", "F3", "F4", "F5", "F6", "F7", "F7b", "F8", "F9", "F10", "F11", "F12", "F13", "F14" },
                catalog.Phases.Select(p => p.Id));
            Assert.Equal(new[] { "MG-07", "MG-08b" }, catalog.Phase("F1").MinigameIds);
            Assert.Empty(catalog.Phase("F0").FactIds);
            Assert.Equal("flight_phase.F0.fact_moment", catalog.Phase("F0").FactMomentKey);
            Assert.Equal(new[] { "F04" }, catalog.Phase("F4").FactIds);
            Assert.Equal("flight_phase.F4.fact_moment", catalog.Phase("F4").FactMomentKey);
            Assert.Throws<CatalogException>(() => catalog.Phase("F04"));
            Assert.Contains("MG-24", catalog.Phase("F7b").MinigameIds);
        }

        [Fact]
        public void Published_lists_cannot_be_mutated()
        {
            var catalog = FlightPhaseCatalog.Load(RealJson);
            Assert.Throws<NotSupportedException>(() => ((IList<FlightPhaseDef>)catalog.Phases).Clear());
            Assert.Throws<NotSupportedException>(() => ((IList<string>)catalog.Phase("F1").MinigameIds).Clear());
            Assert.Throws<NotSupportedException>(() => ((IList<string>)catalog.Phase("F4").FactIds).Add("F01"));
        }

        [Fact]
        public void Duplicate_and_missing_phase_ids_are_rejected()
        {
            var root = JObject.Parse(RealJson);
            var phases = (JArray)root["flight_phases"]!;
            phases.Add(phases[0].DeepClone());
            Assert.Contains("duplicate phase 'F0'", Assert.Throws<CatalogException>(() => FlightPhaseCatalog.Load(root.ToString())).Message);
            phases.RemoveAt(phases.Count - 1);
            phases.RemoveAt(0);
            Assert.Contains("missing required phase 'F0'", Assert.Throws<CatalogException>(() => FlightPhaseCatalog.Load(root.ToString())).Message);
        }

        [Theory]
        [InlineData("phase", "null")]
        [InlineData("fact_moment_key", "42")]
        [InlineData("minigames", "null")]
        [InlineData("facts", "[42]")]
        [InlineData("minigames", "[\"MG-07\",\"MG-07\"]")]
        public void Malformed_fields_are_rejected(string field, string replacement)
        {
            var root = JObject.Parse(RealJson);
            root["flight_phases"]![0]![field] = JToken.Parse(replacement);
            Assert.Throws<CatalogException>(() => FlightPhaseCatalog.Load(root.ToString()));
        }

        [Fact]
        public void Invalid_json_or_missing_array_is_rejected()
        {
            Assert.Throws<CatalogException>(() => FlightPhaseCatalog.Load("{"));
            Assert.Throws<CatalogException>(() => FlightPhaseCatalog.Load("{}"));
        }
    }
}
