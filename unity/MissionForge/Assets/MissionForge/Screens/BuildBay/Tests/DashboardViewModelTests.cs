using System.Collections.Generic;
using System.Globalization;
using MissionForge.Core.Build;
using MissionForge.Core.Data;
using NUnit.Framework;

namespace MissionForge.Screens.BuildBay.Tests
{
    /// <summary>Step 2 of T015: the dashboard shows exactly Core's numbers, with units and a status.</summary>
    public sealed class DashboardViewModelTests
    {
        private static UiText Text => UiText.From(TestCatalog.Catalog.Strings);

        private static Dictionary<string, MetricRow> Rows(BuildState build, DashboardDelta delta = null)
        {
            DashboardMetrics m = Dashboard.Compute(build, TestCatalog.Catalog);
            var rows = new Dictionary<string, MetricRow>();
            foreach (MetricRow r in DashboardViewModel.Build(m, Text, delta)) rows[r.Id] = r;
            return rows;
        }

        private static double Parse(string shown) =>
            double.Parse(shown.Replace(",", "").Replace(UiText.Minus, '-').Replace("+", ""), CultureInfo.InvariantCulture);

        [Test]
        public void ElevenMetrics_EachWithNameUnitAndStatusWord()
        {
            Dictionary<string, MetricRow> rows = Rows(TestCatalog.C1Small());
            Assert.That(rows.Count, Is.EqualTo(11));
            foreach (MetricRow r in rows.Values)
            {
                Assert.That(r.Name, Does.Not.StartWith("["), r.Id + " name string missing");
                Assert.That(r.Unit, Is.Not.Empty.And.Not.StartWith("["), r.Id + " unit");
                Assert.That(Text.Get(DashboardViewModel.StatusKey(r.Status)), Does.Not.StartWith("["), r.Id + " status word");
            }
        }

        [Test]
        public void Values_AreIdenticalToDashboardCompute()
        {
            BuildState build = TestCatalog.C1Small();
            DashboardMetrics m = Dashboard.Compute(build, TestCatalog.Catalog);
            Dictionary<string, MetricRow> rows = Rows(build);

            Assert.That(Parse(rows["dv"].Value), Is.EqualTo(m.TotalDvMps).Within(0.5), "Δv m/s");
            Assert.That(Parse(rows["liftoff_twr"].Value), Is.EqualTo(m.LiftoffTwr.Value).Within(0.005), "TWR");
            Assert.That(Parse(rows["upper_twr"].Value), Is.EqualTo(m.UpperStageTwr.Value).Within(0.005), "upper TWR");
            Assert.That(Parse(rows["mass"].Value), Is.EqualTo(m.TotalMassKg / 1000.0).Within(0.05), "mass t");
            Assert.That(Parse(rows["cost"].Value), Is.EqualTo(m.CostM).Within(0.05), "cost $M");
            Assert.That(Parse(rows["schedule"].Value), Is.EqualTo(m.ScheduleDays).Within(0.5), "schedule days");
            Assert.That(Parse(rows["success"].Value), Is.EqualTo(m.Success.Success * 100).Within(0.05), "success %");
            string band = rows["success"].Detail.Split('%')[0].Replace("\u00B1", "").Trim();
            Assert.That(Parse(band), Is.EqualTo(m.Success.BandHalfWidth * 100).Within(0.05), "band ± %");
            Assert.That(rows["success"].BandLow, Is.EqualTo((float)m.Success.Low).Within(1e-4));
            Assert.That(rows["success"].BandHigh, Is.EqualTo((float)m.Success.High).Within(1e-4));
        }

        [Test]
        public void Status_FollowsCoresVerdicts()
        {
            BuildState build = TestCatalog.C1Small();
            DashboardMetrics m = Dashboard.Compute(build, TestCatalog.Catalog);
            Dictionary<string, MetricRow> rows = Rows(build);
            MetricStatus twr = m.LiftoffTwrStatus == TwrStatus.Ideal ? MetricStatus.Meets
                : m.LiftoffTwrStatus == TwrStatus.WillNotFly ? MetricStatus.Fails : MetricStatus.Marginal;
            Assert.That(rows["liftoff_twr"].Status, Is.EqualTo(twr));
            Assert.That(rows["dv"].Status, Is.EqualTo(m.TotalDvMps < m.DvRequiredMps ? MetricStatus.Fails
                : m.DvMarginFraction < DashboardViewModel.DvMarginalFraction ? MetricStatus.Marginal : MetricStatus.Meets));
            Assert.That(rows["cost"].Status, Is.EqualTo(m.Budget.RemainingM < 0 ? MetricStatus.Fails
                : m.Budget.RemainingM < m.Budget.BudgetM * DashboardViewModel.BudgetMarginalFraction ? MetricStatus.Marginal : MetricStatus.Meets));
        }

        [Test]
        public void EmptyBuild_ShowsPendingNotZero()
        {
            Dictionary<string, MetricRow> rows = Rows(BuildState.New("C1", TestCatalog.Seed));
            Assert.That(rows["dv"].Status, Is.EqualTo(MetricStatus.Pending));
            Assert.That(rows["liftoff_twr"].Status, Is.EqualTo(MetricStatus.Pending));
            Assert.That(rows["stability"].Status, Is.EqualTo(MetricStatus.Pending));
        }

        [Test]
        public void PreviewDelta_HasArrowSignAndUnit()
        {
            BuildState build = TestCatalog.C1Small().WithoutChoice(Slots.FirstStageEngineCount);
            OptionPreview preview = Preview.Of(build, TestCatalog.Catalog, Slots.FirstStageEngineCount, "engcount_first_9");
            Dictionary<string, MetricRow> rows = Rows(build, preview.Delta);
            string dv = rows["dv"].Delta;
            Assert.That(dv, Is.Not.Null);
            Assert.That(dv, Does.StartWith("↑").Or.StartWith("↓"));
            Assert.That(dv, Does.Contain("+").Or.Contain(UiText.Minus.ToString()));
            Assert.That(dv, Does.EndWith(Text.Get("ui.buildbay.unit.m_s")));
        }

        [Test]
        public void Numbers_UseTrueMinusAndSignedZero()
        {
            Assert.That(UiText.Number(-3.25, 1), Is.EqualTo(UiText.Minus + "3.3").Or.EqualTo(UiText.Minus + "3.2"));
            Assert.That(UiText.Signed(4, 0), Is.EqualTo("+4"));
            Assert.That(UiText.Signed(0.01, 0), Is.EqualTo("±0"));
            Assert.That(UiText.Number(12345.6, 0), Is.EqualTo("12,346"));
        }

        [Test]
        public void Timeline_UsesCoresCriticalPathAndDeadline()
        {
            DashboardMetrics m = Dashboard.Compute(TestCatalog.C1Small(), TestCatalog.Catalog);
            GanttModel g = TimelineViewModel.Build(m.Budget, id => id, Text);
            Assert.That(g.DeadlineDays, Is.EqualTo(m.Budget.DeadlineDays));
            Assert.That(g.TotalDays, Is.EqualTo(m.Budget.TotalDays));
            Assert.That(g.Bars.Count, Is.EqualTo(m.Budget.Timeline.Count));
            int critical = 0;
            foreach (GanttBar b in g.Bars) if (b.Critical) critical++;
            int coreCritical = 0;
            foreach (TimelineStep s in m.Budget.Timeline) if (s.Critical) coreCritical++;
            Assert.That(critical, Is.EqualTo(coreCritical));
            Assert.That(g.AxisDays, Is.GreaterThanOrEqualTo(System.Math.Max(g.DeadlineDays, g.TotalDays)));
        }

        [Test]
        public void SeededBuild_ReachesEveryC1VoteThroughCoreCommit()
        {
            BuildState b = SeededBuilds.Partial(TestCatalog.Catalog, "C1", TestCatalog.Seed, 40);
            Assert.That(VoteOptions.NextVote(b, TestCatalog.Catalog), Is.Null, "every vote resolved");
            Assert.That(b.VotesCompleted, Is.EqualTo(VoteOptions.VotesFor(TestCatalog.Catalog.Contract("C1")).Count));
        }
    }
}
