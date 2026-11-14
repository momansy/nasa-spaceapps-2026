using System;
using System.Linq;
using MissionForge.Core.Build;
using MissionForge.Core.Data;
using MissionForge.Core.Tests.Data;
using Xunit;

namespace MissionForge.Core.Tests.Build
{
    /// <summary>T010 steps 5 and 6: suborbital contracts and the launch-site flags (real data).</summary>
    public class SiteRulesTests
    {
        private static readonly GameCatalog Real = DesignFixture.Catalog();
        private const string Equatorial = "site_equatorial_spaceport", Subtropical = "site_subtropical_coast",
            WestCoast = "site_west_coast_polar_range", Steppe = "site_inland_steppe_cosmodrome";

        private static ContractDef Prograde(double inclinationDeg = 51.6, string? destination = null) =>
            new ContractDef("T", "T", 1000, 9000, 1000, 1000, Array.Empty<ContractVote>(), inclinationDeg: inclinationDeg, destination: destination);

        // ---------------------------------------------------------------- step 5

        [Fact]
        public void C0_is_suborbital_and_gets_no_rotation_boost_or_plane_change_from_any_site()
        {
            var c0 = Real.Contract("C0");
            Assert.Equal(Dashboard.SuborbitalDestination, c0.Destination);
            foreach (var id in new[] { Equatorial, Subtropical, WestCoast, Steppe })
                Assert.Equal((0.0, 0.0), Dashboard.SiteEffects(Real.Part(id), c0));
            var d = Dashboard.Compute(BuildState.New("C0", 1).WithChoice(Slots.LaunchSite, Equatorial), Real);
            Assert.Equal(0.0, d.RotationBoostMps);
            Assert.Equal(0.0, d.PlaneChangePenaltyMps);
        }

        [Fact]
        public void Orbital_contracts_keep_the_boost_and_the_old_overload_is_unchanged()
        {
            var site = Real.Part(Subtropical);   // 28.5° N
            var (boost, plane) = Dashboard.SiteEffects(site, Prograde());
            var old = Dashboard.SiteEffects(28.5, 51.6);
            Assert.Equal(old.boostMps, boost);
            Assert.Equal(old.planeChangeMps, plane);
            Assert.Equal(465.1 * Math.Cos(28.5 * Math.PI / 180), boost, 0);  // ≈ 409 m/s
            // A suborbital destination with the same inclination: nothing.
            Assert.Equal((0.0, 0.0), Dashboard.SiteEffects(site, Prograde(destination: "suborbital")));
            // Plane change below the latitude is also dropped for a suborbital flight.
            Assert.True(Dashboard.SiteEffects(site, Prograde(20)).planeChangeMps > 1000);
            Assert.Equal(0.0, Dashboard.SiteEffects(site, Prograde(20, "suborbital")).planeChangeMps);
            Assert.Equal((0.0, 0.0), Dashboard.SiteEffects(null, Prograde()));
        }

        // ---------------------------------------------------------------- step 6

        [Fact]
        public void No_eastward_launch_removes_the_boost_for_every_target()
        {
            var west = Real.Part(WestCoast);
            Assert.True(west.HasTag("no_eastward_launch"));
            // 34.7° N would give 465 · cos(34.7°) ≈ 382 m/s to a 51.6° target; the flag zeroes it.
            Assert.True(Dashboard.SiteEffects(34.7, 51.6).boostMps > 380);
            Assert.Equal(0.0, Dashboard.SiteEffects(west, Prograde(51.6)).boostMps);
            Assert.Equal(0.0, Dashboard.SiteEffects(west, Prograde(98)).boostMps);
            // Without the flag the same latitude would keep it (steppe has another latitude, same rule): other sites unaffected.
            Assert.True(Dashboard.SiteEffects(Real.Part(Subtropical), Prograde()).boostMps > 400);
            Assert.True(Dashboard.SiteEffects(Real.Part(Steppe), Prograde(51.6)).boostMps > 300);
        }

        [Fact]
        public void Stages_fall_on_land_adds_a_range_fee_cost_line_only_for_the_steppe()
        {
            double Total(string site) => BudgetScheduleModel.Compute(new Vehicle(BuildState.New("C1", 1).WithChoice(Slots.LaunchSite, site), Real)).TotalCostM;
            var steppe = BudgetScheduleModel.Compute(new Vehicle(BuildState.New("C1", 1).WithChoice(Slots.LaunchSite, Steppe), Real));
            var fee = Assert.Single(steppe.CostLines, l => l.Id.StartsWith("range_fee:"));
            Assert.Equal(BuildConstants.RangeFeeM, fee.CostM);
            Assert.Equal(1.0, fee.CostM);
            Assert.Equal(Slots.LaunchSite, fee.Category);
            Assert.Equal(Real.Part(Steppe).CostM + BuildConstants.RangeFeeM, steppe.PartsCostM, 9);
            Assert.Equal(Real.Part(Steppe).CostM + 1.0, Total(Steppe), 9);
            foreach (var other in new[] { Equatorial, Subtropical, WestCoast })
            {
                var b = BudgetScheduleModel.Compute(new Vehicle(BuildState.New("C1", 1).WithChoice(Slots.LaunchSite, other), Real));
                Assert.DoesNotContain(b.CostLines, l => l.Id.StartsWith("range_fee:"));
                Assert.Equal(Real.Part(other).CostM, b.PartsCostM, 9);
            }
        }
    }
}
