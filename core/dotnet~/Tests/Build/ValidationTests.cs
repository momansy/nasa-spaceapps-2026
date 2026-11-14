using System.Collections.Generic;
using System.Linq;
using MissionForge.Core.Build;
using MissionForge.Core.Data;
using Xunit;

namespace MissionForge.Core.Tests.Build
{
    /// <summary>
    /// Shared parts and helpers for the validation, vote-option and preview tests. Parts follow the design
    /// tables (7.6–7.9); a few synthetic parts are marked as such. Every number below is in data units
    /// (kN, s, t, km/s, W, GB).
    /// </summary>
    internal static class ValidationVoteFixtures
    {
        // ---- first stage engines (design 7.7)
        public const string Workhorse = "eng_kerolox_workhorse"; // 850 / 930 kN, Isp 282 / 311 s, 0.47 t
        public const string EPumpMini = "eng_epump_mini";        // 24 / 26 kN, 0.035 t
        // ---- upper stage engines (design 7.8)
        public const string KeroloxVac = "eng_kerolox_vacuum";   // 980 kN, 348 s, 0.6 t, 4 restarts
        public const string HydroloxVac = "eng_hydrolox_vacuum"; // 110 kN, 460 s, 0.3 t, 15 restarts
        // ---- engine count (7.6) and tanks (7.9: first 12 / 120 / 280 t, upper 2.5 / 25 / 60 t)
        public const string Count1 = "count_1", Count3 = "count_3", Count9 = "count_9";
        public const string TankXs = "tank_xs", TankS = "tank_s", TankM = "tank_m";
        public const string TankSMli = "tank_s_mli"; // tank S with an insulation blanket: boil_off_mitigation tag
        // ---- payload-side parts
        public const string EscapeTower = "esc_tower";
        public const string ShieldPica = "hs_pica";   // rated 12 km/s
        public const string ShieldBasic = "hs_basic"; // rated 8 km/s
        public const string Fairing4m = "fair_4m", Fairing52m = "fair_5m";
        public const string InstSar = "inst_sar";                 // 25 GB/day, 80 W, 1.2 m
        public const string PowerBody = "pwr_body_solar";         // 100 W avg, 50 Wh battery, 2.5 m stowed
        public const string PowerDeployable = "pwr_deployable";   // 150 W avg, 500 Wh battery
        public const string PowerBalanced = "pwr_balanced";       // synthetic: 100 W avg, no battery limit
        public const string CommS = "comm_sband";                 // 2 GB/pass
        public const string CommX = "comm_xband";                 // 5 GB/pass

        public static PartDef Part(string id, string category, double massKg, double costM, double leadDays, double integDays,
            Dictionary<string, double>? stats = null, string? propellant = null, string[]? tags = null, string[]? contracts = null,
            double? reliability = 0.99) =>
            new PartDef(id, category, id, massKg, costM, leadDays, integDays, reliability, Maturity.Proven,
                new PartStats(stats ?? new Dictionary<string, double>()), propellant, contracts, tags);

        public static List<PartDef> StandardParts() => new List<PartDef>
        {
            Part(Workhorse, PartCategories.FirstStageEngine, 470, 8, 60, 5,
                new Dictionary<string, double> { ["thrust_sl_kN"] = 850, ["thrust_vac_kN"] = 930, ["isp_sl_s"] = 282, ["isp_vac_s"] = 311 },
                Propellants.Kerolox, reliability: 0.995),
            Part(EPumpMini, PartCategories.FirstStageEngine, 35, 1, 30, 3,
                new Dictionary<string, double> { ["thrust_sl_kN"] = 24, ["thrust_vac_kN"] = 26, ["isp_sl_s"] = 303, ["isp_vac_s"] = 343 },
                Propellants.Kerolox),
            Part(KeroloxVac, PartCategories.UpperStageEngine, 600, 10, 70, 5,
                new Dictionary<string, double> { ["thrust_vac_kN"] = 980, ["isp_vac_s"] = 348, ["restarts"] = 4 },
                Propellants.Kerolox),
            Part(HydroloxVac, PartCategories.UpperStageEngine, 300, 15, 90, 5,
                new Dictionary<string, double> { ["thrust_vac_kN"] = 110, ["isp_vac_s"] = 460, ["restarts"] = 15 },
                Propellants.Hydrolox),
            Part(Count1, PartCategories.EngineCount, 0, 0, 0, 0, new Dictionary<string, double> { ["engine_count"] = 1 }, reliability: null),
            Part(Count3, PartCategories.EngineCount, 0, 0, 0, 0, new Dictionary<string, double> { ["engine_count"] = 3 }, reliability: null),
            Part(Count9, PartCategories.EngineCount, 0, 0, 0, 0, new Dictionary<string, double> { ["engine_count"] = 9 }, reliability: null),
            Part(TankXs, PartCategories.TankSize, 0, 1, 20, 3,
                new Dictionary<string, double> { ["first_stage_propellant_t"] = 12, ["upper_stage_propellant_t"] = 2.5 }, reliability: null),
            Part(TankS, PartCategories.TankSize, 0, 3, 30, 4,
                new Dictionary<string, double> { ["first_stage_propellant_t"] = 120, ["upper_stage_propellant_t"] = 25 }, reliability: null),
            Part(TankM, PartCategories.TankSize, 0, 6, 40, 5,
                new Dictionary<string, double> { ["first_stage_propellant_t"] = 280, ["upper_stage_propellant_t"] = 60 }, reliability: null),
            Part(TankSMli, PartCategories.TankSize, 0, 4, 30, 4,
                new Dictionary<string, double> { ["first_stage_propellant_t"] = 120, ["upper_stage_propellant_t"] = 25 },
                tags: new[] { "boil_off_mitigation" }, reliability: null),
            Part(EscapeTower, PartCategories.EscapeSystem, 4000, 20, 60, 5, tags: new[] { "jettison_at_staging" }),
            Part(ShieldPica, PartCategories.HeatShield, 800, 12, 60, 5, new Dictionary<string, double> { ["max_entry_speed_km_s"] = 12 }),
            Part(ShieldBasic, PartCategories.HeatShield, 500, 6, 40, 5, new Dictionary<string, double> { ["max_entry_speed_km_s"] = 8 }),
            Part(Fairing4m, PartCategories.Fairing, 1500, 4, 30, 3, new Dictionary<string, double> { ["diameter_m"] = 4.0 }),
            Part(Fairing52m, PartCategories.Fairing, 2000, 6, 30, 3, new Dictionary<string, double> { ["diameter_m"] = 5.2 }),
            Part(InstSar, PartCategories.Instrument, 120, 10, 60, 5,
                new Dictionary<string, double> { ["data_GB_per_day"] = 25, ["power_W"] = 80, ["diameter_m"] = 1.2 }),
            Part(PowerBody, PartCategories.SatellitePower, 20, 2, 30, 2,
                new Dictionary<string, double> { ["generation_avg_W"] = 100, ["battery_Wh"] = 50, ["diameter_m"] = 2.5 }),
            Part(PowerDeployable, PartCategories.SatellitePower, 35, 4, 40, 3,
                new Dictionary<string, double> { ["generation_avg_W"] = 150, ["battery_Wh"] = 500 }),
            Part(PowerBalanced, PartCategories.SatellitePower, 30, 3, 30, 2,
                new Dictionary<string, double> { ["generation_avg_W"] = 100 }),
            Part(CommS, PartCategories.Communications, 5, 1, 20, 1, new Dictionary<string, double> { ["data_rate_GB_per_pass"] = 2 }),
            Part(CommX, PartCategories.Communications, 8, 2, 25, 1, new Dictionary<string, double> { ["data_rate_GB_per_pass"] = 5 }),
        };

        /// <summary>A vote on <paramref name="slot"/> offering <paramref name="ids"/>; stage set for per-stage slots.</summary>
        public static ContractVote Vote(string slot, params string[] ids)
        {
            string? stage = slot == Slots.FirstStageTank || slot == Slots.FirstStageEngineCount ? "first"
                : slot == Slots.UpperStageTank || slot == Slots.UpperStageEngineCount ? "upper" : null;
            return new ContractVote(Slots.CategoryOf(slot), ids, slot: slot, stage: stage);
        }

        /// <summary>The propulsion votes of design 6.2 (6, 8, 10, 11, 12) with the standard parts.</summary>
        public static ContractVote[] PropulsionVotes() => new[]
        {
            Vote(Slots.UpperStageEngine, KeroloxVac, HydroloxVac),
            Vote(Slots.UpperStageTank, TankXs, TankS, TankM),
            Vote(Slots.FirstStageEngine, Workhorse, EPumpMini),
            Vote(Slots.FirstStageEngineCount, Count1, Count3, Count9),
            Vote(Slots.FirstStageTank, TankXs, TankS, TankM),
        };

        public static GameCatalog Catalog(ContractDef contract, params ValidationRuleDef[] rules) =>
            new GameCatalog(StandardParts(), new[] { contract }, validationRules: rules);

        /// <summary>Upper stage: Kerolox Vacuum on tank S (25 t), first stage: Workhorse on <paramref name="firstTank"/>.</summary>
        public static BuildState TwoStage(string contractId, string? firstEngine = Workhorse, string? count = null, string? firstTank = TankM)
        {
            var b = BuildState.New(contractId, 42)
                .WithChoice(Slots.UpperStageEngine, KeroloxVac)
                .WithChoice(Slots.UpperStageTank, TankS);
            if (firstEngine != null) b = b.WithChoice(Slots.FirstStageEngine, firstEngine);
            if (count != null) b = b.WithChoice(Slots.FirstStageEngineCount, count);
            if (firstTank != null) b = b.WithChoice(Slots.FirstStageTank, firstTank);
            return b;
        }

        public static ValidationIssue Single(IReadOnlyList<ValidationIssue> issues, string ruleId)
        {
            var found = issues.Where(i => i.RuleId == ruleId).ToList();
            Assert.Single(found);
            return found[0];
        }

        public static void None(IReadOnlyList<ValidationIssue> issues, string ruleId) =>
            Assert.DoesNotContain(issues, i => i.RuleId == ruleId);

        /// <summary>Asserts the severity and the exact default design 6.11 text and text key of an issue.</summary>
        public static void AssertDefault(ValidationIssue issue, string ruleId, Severity severity, string? text = null)
        {
            Assert.Equal(ruleId, issue.RuleId);
            Assert.Equal(severity, issue.Severity);
            Assert.Equal(text ?? ValidationRules.DefaultText(ruleId), issue.Text);
            Assert.Equal(ValidationRules.DefaultTextKey(ruleId), issue.TextKey);
        }
    }

    public class ValidationTests
    {
        private static ContractDef C(string id = "C1", double payloadKg = 1000, double dvMps = 9000, ContractVote[]? votes = null,
            bool crewed = false, bool returning = false, double? entrySpeedMps = null, int starts = 1, bool longCoast = false,
            double? payloadDiameterM = null) =>
            new ContractDef(id, id, payloadKg, dvMps, 1000, 1000, votes ?? ValidationVoteFixtures.PropulsionVotes(),
                crewed: crewed, returning: returning, entrySpeedMps: entrySpeedMps, requiredUpperStageStarts: starts,
                longCoast: longCoast, payloadDiameterM: payloadDiameterM);

        private static ContractVote V(string slot, params string[] ids) => ValidationVoteFixtures.Vote(slot, ids);

        // ------------------------------------------------------------ lift-off TWR (Blocker)

        [Fact]
        public void LiftoffTwr_fires_Blocker_for_one_workhorse_on_tank_M()
        {
            // Mass = payload 1 000 + upper engine 600 + upper tank dry 25 000·0.05 = 1 250 + upper prop 25 000
            //      + 1 Workhorse 470 + first tank dry 280 000·0.05 = 14 000 + first prop 280 000 = 322 320 kg.
            // TWR = 850 000 / (322 320 · 9.80665) = 850 000 / 3 160 879.4 = 0.2689 → "0.27"
            var cat = ValidationVoteFixtures.Catalog(C());
            var issues = Validator.Validate(ValidationVoteFixtures.TwoStage("C1"), cat);

            var issue = ValidationVoteFixtures.Single(issues, ValidationRules.LiftoffTwr);
            ValidationVoteFixtures.AssertDefault(issue, ValidationRules.LiftoffTwr, Severity.Blocker,
                "Thrust must exceed weight or the rocket won't leave the pad.");
            Assert.Equal("0.27", issue.Args["twr"]);
        }

        [Fact]
        public void LiftoffTwr_does_not_fire_for_nine_workhorses()
        {
            // 9 engines: mass 322 320 + 8·470 = 326 080 kg; TWR = 7 650 000 / (326 080 · 9.80665) = 2.392 > 1
            var cat = ValidationVoteFixtures.Catalog(C());
            var build = ValidationVoteFixtures.TwoStage("C1", count: ValidationVoteFixtures.Count9);
            Assert.Equal(2.3923, Dashboard.Compute(build, cat).LiftoffTwr!.Value, 4);
            ValidationVoteFixtures.None(Validator.Validate(build, cat), ValidationRules.LiftoffTwr);
        }

        [Theory]
        [InlineData(9.80665, true)] // thrust 9 806.65 N = weight of 1 000 kg exactly → TWR = 1.0, still a Blocker
        [InlineData(9.81, false)]   // 9 810 / 9 806.65 = 1.00034 → flies
        public void LiftoffTwr_exactly_one_is_a_Blocker(double thrustKn, bool fires)
        {
            // Synthetic massless engine under a 1 000 kg payload, no tank vote: m_total = 1 000 kg.
            var parts = ValidationVoteFixtures.StandardParts();
            parts.Add(ValidationVoteFixtures.Part("eng_edge", PartCategories.FirstStageEngine, 0, 1, 1, 1,
                new Dictionary<string, double> { ["thrust_sl_kN"] = thrustKn, ["isp_sl_s"] = 280, ["isp_vac_s"] = 300 }, Propellants.Kerolox));
            var contract = C(votes: new[] { V(Slots.FirstStageEngine, "eng_edge") });
            var cat = new GameCatalog(parts, new[] { contract });
            var build = BuildState.New("C1", 1).WithChoice(Slots.FirstStageEngine, "eng_edge");

            var twr = Dashboard.Compute(build, cat).LiftoffTwr!.Value;
            var issues = Validator.Validate(build, cat);
            if (fires)
            {
                Assert.Equal(1.0, twr); // exact: (9.80665·1000) / (1000·9.80665)
                Assert.Equal("1.00", ValidationVoteFixtures.Single(issues, ValidationRules.LiftoffTwr).Args["twr"]);
            }
            else
            {
                Assert.True(twr > 1.0);
                ValidationVoteFixtures.None(issues, ValidationRules.LiftoffTwr);
            }
        }

        // ------------------------------------------------------------ total Δv (Blocker / Major within 3%)

        // Upper stage only: Kerolox Vacuum (0.6 t) on tank S (25 t, dry 1.25 t) under a 1 t payload.
        //   m0 = 1 000 + 600 + 1 250 + 25 000 = 27 850 kg, mf = 2 850 kg
        //   Δv = 348 · 9.80665 · ln(27 850 / 2 850) = 3 412.7142 · 2.2795140 = 7 779.33 m/s
        private const double UpperOnlyDvMps = 7779.33;

        private static BuildState UpperOnly(string id) => BuildState.New(id, 1)
            .WithChoice(Slots.UpperStageEngine, ValidationVoteFixtures.KeroloxVac)
            .WithChoice(Slots.UpperStageTank, ValidationVoteFixtures.TankS);

        private static ContractDef UpperOnlyContract(double dvMps, int starts = 1, bool longCoast = false) =>
            C(dvMps: dvMps, starts: starts, longCoast: longCoast, votes: new[]
            {
                V(Slots.UpperStageEngine, ValidationVoteFixtures.KeroloxVac, ValidationVoteFixtures.HydroloxVac),
                V(Slots.UpperStageTank, ValidationVoteFixtures.TankXs, ValidationVoteFixtures.TankS, ValidationVoteFixtures.TankSMli),
            });

        [Theory]
        [InlineData(7938, Severity.Major, "-2.0")]   // (7 938 − 7 779.33) / 7 938 = 2.0% short ≤ 3% → Major
        [InlineData(8189, Severity.Blocker, "-5.0")] // (8 189 − 7 779.33) / 8 189 = 5.0% short > 3% → Blocker
        public void TotalDv_short_is_Major_within_three_percent_else_Blocker(double requiredMps, Severity expected, string margin)
        {
            var cat = ValidationVoteFixtures.Catalog(UpperOnlyContract(requiredMps));
            var build = UpperOnly("C1");
            Assert.Equal(UpperOnlyDvMps, Dashboard.Compute(build, cat).TotalDvMps, 2);

            var issue = ValidationVoteFixtures.Single(Validator.Validate(build, cat), ValidationRules.TotalDv);
            ValidationVoteFixtures.AssertDefault(issue, ValidationRules.TotalDv, expected, "Not enough Δv to reach the target orbit.");
            Assert.Equal(margin, issue.Args["margin"]);
        }

        [Fact]
        public void TotalDv_does_not_fire_when_requirement_is_met()
        {
            var cat = ValidationVoteFixtures.Catalog(UpperOnlyContract(7000)); // 7 779 ≥ 7 000
            ValidationVoteFixtures.None(Validator.Validate(UpperOnly("C1"), cat), ValidationRules.TotalDv);
        }

        [Theory]
        [InlineData(7938, 0.01, Severity.Blocker)] // 2% short, catalog margin 1% → Blocker
        [InlineData(8189, 0.06, Severity.Major)]   // 5% short, catalog margin 6% → Major
        public void TotalDv_major_margin_comes_from_catalog_param(double requiredMps, double marginFraction, Severity expected)
        {
            var rule = new ValidationRuleDef
            {
                Id = ValidationRules.TotalDv,
                Severity = Severity.Blocker,
                Params = new Dictionary<string, double> { ["major_margin_fraction"] = marginFraction },
            };
            var cat = ValidationVoteFixtures.Catalog(UpperOnlyContract(requiredMps), rule);
            var issue = ValidationVoteFixtures.Single(Validator.Validate(UpperOnly("C1"), cat), ValidationRules.TotalDv);
            Assert.Equal(expected, issue.Severity);
            Assert.Equal(ValidationRules.DefaultTextKey(ValidationRules.TotalDv), issue.TextKey); // empty TextKey → default
        }

        // ------------------------------------------------------------ crewed escape (Blocker)

        [Fact]
        public void CrewedEscape_fires_Blocker_without_escape_system_and_clears_with_one()
        {
            var contract = C(crewed: true, votes: new[] { V(Slots.LaunchEscape, ValidationVoteFixtures.EscapeTower) });
            var cat = ValidationVoteFixtures.Catalog(contract);
            var empty = BuildState.New("C1", 1);

            var issue = ValidationVoteFixtures.Single(Validator.Validate(empty, cat), ValidationRules.CrewedEscape);
            ValidationVoteFixtures.AssertDefault(issue, ValidationRules.CrewedEscape, Severity.Blocker,
                "Crewed vehicles need a way to escape a failing rocket.");

            var withTower = empty.WithChoice(Slots.LaunchEscape, ValidationVoteFixtures.EscapeTower);
            ValidationVoteFixtures.None(Validator.Validate(withTower, cat), ValidationRules.CrewedEscape);
        }

        [Fact]
        public void CrewedEscape_does_not_fire_for_uncrewed_contract()
        {
            var cat = ValidationVoteFixtures.Catalog(C(crewed: false));
            ValidationVoteFixtures.None(Validator.Validate(BuildState.New("C1", 1), cat), ValidationRules.CrewedEscape);
        }

        // ------------------------------------------------------------ heat shield (Blocker) and rating (Major)

        private static GameCatalog ReturningCatalog(bool returning = true) => ValidationVoteFixtures.Catalog(
            C(returning: returning, entrySpeedMps: 11000,
                votes: new[] { V(Slots.HeatShield, ValidationVoteFixtures.ShieldPica, ValidationVoteFixtures.ShieldBasic) }));

        [Fact]
        public void ReturnHeatShield_fires_Blocker_when_returning_payload_has_no_shield()
        {
            var issues = Validator.Validate(BuildState.New("C1", 1), ReturningCatalog());
            var issue = ValidationVoteFixtures.Single(issues, ValidationRules.ReturnHeatShield);
            ValidationVoteFixtures.AssertDefault(issue, ValidationRules.ReturnHeatShield, Severity.Blocker,
                "Reentry heating would destroy the vehicle.");
            ValidationVoteFixtures.None(issues, ValidationRules.HeatShieldRating); // no shield, nothing to rate
        }

        [Fact]
        public void ReturnHeatShield_does_not_fire_when_payload_does_not_return()
        {
            ValidationVoteFixtures.None(Validator.Validate(BuildState.New("C1", 1), ReturningCatalog(returning: false)),
                ValidationRules.ReturnHeatShield);
        }

        [Fact]
        public void HeatShieldRating_fires_Major_when_shield_rated_below_entry_speed()
        {
            // 8 km/s shield < 11 km/s lunar-return entry speed
            var build = BuildState.New("C1", 1).WithChoice(Slots.HeatShield, ValidationVoteFixtures.ShieldBasic);
            var issues = Validator.Validate(build, ReturningCatalog());

            var issue = ValidationVoteFixtures.Single(issues, ValidationRules.HeatShieldRating);
            ValidationVoteFixtures.AssertDefault(issue, ValidationRules.HeatShieldRating, Severity.Major,
                "Shield not rated for this entry speed.");
            Assert.Equal("8.0", issue.Args["rating_km_s"]);
            Assert.Equal("11.0", issue.Args["entry_km_s"]);
            ValidationVoteFixtures.None(issues, ValidationRules.ReturnHeatShield);
        }

        [Fact]
        public void HeatShieldRating_does_not_fire_when_shield_is_rated_for_entry()
        {
            // 12 km/s ≥ 11 km/s
            var build = BuildState.New("C1", 1).WithChoice(Slots.HeatShield, ValidationVoteFixtures.ShieldPica);
            var issues = Validator.Validate(build, ReturningCatalog());
            ValidationVoteFixtures.None(issues, ValidationRules.HeatShieldRating);
            ValidationVoteFixtures.None(issues, ValidationRules.ReturnHeatShield);
        }

        // ------------------------------------------------------------ fairing fit (Blocker)

        private static GameCatalog FairingCatalog(double? payloadDiameterM = 5.0) => ValidationVoteFixtures.Catalog(
            C(payloadDiameterM: payloadDiameterM,
                votes: new[] { V(Slots.Fairing, ValidationVoteFixtures.Fairing4m, ValidationVoteFixtures.Fairing52m) }));

        [Fact]
        public void FairingFit_fires_Blocker_when_payload_is_wider_than_fairing()
        {
            // payload 5.0 m > fairing 4.0 m
            var build = BuildState.New("C1", 1).WithChoice(Slots.Fairing, ValidationVoteFixtures.Fairing4m);
            var issue = ValidationVoteFixtures.Single(Validator.Validate(build, FairingCatalog()), ValidationRules.FairingFit);
            ValidationVoteFixtures.AssertDefault(issue, ValidationRules.FairingFit, Severity.Blocker, "Payload diameter exceeds fairing.");
            Assert.Equal("5.0", issue.Args["payload_m"]);
            Assert.Equal("4.0", issue.Args["fairing_m"]);
        }

        [Fact]
        public void FairingFit_does_not_fire_when_payload_fits()
        {
            // payload 5.0 m ≤ fairing 5.2 m
            var build = BuildState.New("C1", 1).WithChoice(Slots.Fairing, ValidationVoteFixtures.Fairing52m);
            ValidationVoteFixtures.None(Validator.Validate(build, FairingCatalog()), ValidationRules.FairingFit);
        }

        [Fact]
        public void PayloadDiameter_is_contract_value_or_widest_payload_part()
        {
            var build = BuildState.New("C1", 1)
                .WithChoice(Slots.PayloadInstrument, ValidationVoteFixtures.InstSar) // 1.2 m
                .WithChoice(Slots.PayloadPower, ValidationVoteFixtures.PowerBody);   // 2.5 m stowed

            Assert.Equal(5.0, Validator.PayloadDiameterM(new Vehicle(build, FairingCatalog(5.0))));
            Assert.Equal(2.5, Validator.PayloadDiameterM(new Vehicle(build, FairingCatalog(null))));
            Assert.Null(Validator.PayloadDiameterM(new Vehicle(BuildState.New("C1", 1), FairingCatalog(null))));
        }

        // ------------------------------------------------------------ eclipse power (Major)

        private static GameCatalog PayloadCatalog() => ValidationVoteFixtures.Catalog(C(votes: new[]
        {
            V(Slots.PayloadInstrument, ValidationVoteFixtures.InstSar),
            V(Slots.PayloadPower, ValidationVoteFixtures.PowerBody, ValidationVoteFixtures.PowerDeployable, ValidationVoteFixtures.PowerBalanced),
            V(Slots.Communications, ValidationVoteFixtures.CommS, ValidationVoteFixtures.CommX),
        }));

        private static BuildState Satellite(string power) => BuildState.New("C1", 1)
            .WithChoice(Slots.PayloadInstrument, ValidationVoteFixtures.InstSar)
            .WithChoice(Slots.PayloadPower, power);

        [Fact]
        public void EclipsePower_fires_Major_when_battery_cannot_cover_the_eclipse()
        {
            // Load = bus 20 W + SAR 80 W = 100 W. Orbit 90 min, eclipse 35 min, sun 55 min.
            // Sunlit generation = 100 · 90 / 55 = 163.64 W → surplus 63.64 W · 55/60 h = 58.33 Wh
            // Stored = min(58.33, 50 Wh · 0.4 DoD = 20 Wh) = 20 Wh → eclipse supply 20 / (35/60) = 34.29 W
            // Eclipse balance = 34.29 − 100 = −65.71 W → "-66"
            var cat = PayloadCatalog();
            var build = Satellite(ValidationVoteFixtures.PowerBody);
            Assert.Equal(-65.714, Dashboard.Compute(build, cat).PowerEclipseW!.Value, 3);

            var issue = ValidationVoteFixtures.Single(Validator.Validate(build, cat), ValidationRules.EclipsePower);
            ValidationVoteFixtures.AssertDefault(issue, ValidationRules.EclipsePower, Severity.Major,
                "Batteries will drain during Earth's shadow.");
            Assert.Equal("-66", issue.Args["eclipse_W"]);
        }

        [Fact]
        public void EclipsePower_does_not_fire_with_big_battery()
        {
            // 150 W avg: sunlit 245.45 W, surplus 145.45 W · 55/60 h = 133.33 Wh ≤ 500 · 0.4 = 200 Wh
            // eclipse supply 133.33 / (35/60) = 228.57 W → balance +128.57 W
            var cat = PayloadCatalog();
            var build = Satellite(ValidationVoteFixtures.PowerDeployable);
            Assert.Equal(128.571, Dashboard.Compute(build, cat).PowerEclipseW!.Value, 3);
            ValidationVoteFixtures.None(Validator.Validate(build, cat), ValidationRules.EclipsePower);
        }

        [Fact]
        public void EclipsePower_does_not_fire_for_exactly_balanced_budget()
        {
            // Orbit-average 100 W against a 100 W load, unlimited battery: what is stored in sunlight
            // (63.64 W · 55 min) is exactly what the eclipse needs (100 W · 35 min) → balance 0 W, not negative.
            var cat = PayloadCatalog();
            var build = Satellite(ValidationVoteFixtures.PowerBalanced);
            Assert.Equal(0.0, Dashboard.Compute(build, cat).PowerEclipseW!.Value, 9);
            ValidationVoteFixtures.None(Validator.Validate(build, cat), ValidationRules.EclipsePower);
        }

        // ------------------------------------------------------------ upper stage restarts (Blocker)

        [Fact]
        public void UpperRestarts_fires_Blocker_with_N_filled_in()
        {
            // Kerolox Vacuum: 1 ignition + 4 restarts = 5 starts < 6 required
            var cat = ValidationVoteFixtures.Catalog(UpperOnlyContract(7000, starts: 6));
            var issue = ValidationVoteFixtures.Single(Validator.Validate(UpperOnly("C1"), cat), ValidationRules.UpperRestarts);

            ValidationVoteFixtures.AssertDefault(issue, ValidationRules.UpperRestarts, Severity.Blocker, "This mission needs 6 engine starts.");
            Assert.Equal("6", issue.Args["N"]);
            Assert.Equal("5", issue.Args["starts"]);
        }

        [Fact]
        public void UpperRestarts_does_not_fire_when_engine_has_enough_starts()
        {
            // Hydrolox Vacuum: 1 + 15 = 16 starts ≥ 6
            var cat = ValidationVoteFixtures.Catalog(UpperOnlyContract(7000, starts: 6));
            var build = UpperOnly("C1").WithChoice(Slots.UpperStageEngine, ValidationVoteFixtures.HydroloxVac);
            ValidationVoteFixtures.None(Validator.Validate(build, cat), ValidationRules.UpperRestarts);
        }

        [Fact]
        public void Catalog_rule_overrides_severity_text_key_and_text_with_placeholders()
        {
            var rule = new ValidationRuleDef
            {
                Id = ValidationRules.UpperRestarts,
                Severity = Severity.Major,
                TextKey = "custom.restarts",
                Text = "Needs {N} starts, has {starts}.",
            };
            var cat = ValidationVoteFixtures.Catalog(UpperOnlyContract(7000, starts: 6), rule);
            var issue = ValidationVoteFixtures.Single(Validator.Validate(UpperOnly("C1"), cat), ValidationRules.UpperRestarts);

            Assert.Equal(Severity.Major, issue.Severity);
            Assert.Equal("custom.restarts", issue.TextKey);
            Assert.Equal("Needs 6 starts, has 5.", issue.Text);
        }

        // ------------------------------------------------------------ boil-off (Major)

        [Fact]
        public void BoilOff_fires_Major_for_hydrolox_upper_on_long_coast()
        {
            var cat = ValidationVoteFixtures.Catalog(UpperOnlyContract(7000, longCoast: true));
            var build = UpperOnly("C1").WithChoice(Slots.UpperStageEngine, ValidationVoteFixtures.HydroloxVac);
            var issue = ValidationVoteFixtures.Single(Validator.Validate(build, cat), ValidationRules.BoilOff);
            ValidationVoteFixtures.AssertDefault(issue, ValidationRules.BoilOff, Severity.Major,
                "Liquid hydrogen boils off during long coasts.");
        }

        [Theory]
        [InlineData(ValidationVoteFixtures.KeroloxVac, ValidationVoteFixtures.TankS, false, true)]   // kerolox does not boil off
        [InlineData(ValidationVoteFixtures.HydroloxVac, ValidationVoteFixtures.TankSMli, false, true)] // part tagged boil_off_mitigation
        [InlineData(ValidationVoteFixtures.HydroloxVac, ValidationVoteFixtures.TankS, true, true)]   // build flag boil_off_mitigation
        [InlineData(ValidationVoteFixtures.HydroloxVac, ValidationVoteFixtures.TankS, false, false)] // no long coast
        public void BoilOff_does_not_fire(string upperEngine, string upperTank, bool flag, bool longCoast)
        {
            var cat = ValidationVoteFixtures.Catalog(UpperOnlyContract(7000, longCoast: longCoast));
            var build = BuildState.New("C1", 1)
                .WithChoice(Slots.UpperStageEngine, upperEngine)
                .WithChoice(Slots.UpperStageTank, upperTank);
            if (flag) build = build.WithFlag("boil_off_mitigation");
            ValidationVoteFixtures.None(Validator.Validate(build, cat), ValidationRules.BoilOff);
        }

        // ------------------------------------------------------------ data budget (Minor)

        [Fact]
        public void DataBudget_fires_Minor_when_instrument_outruns_downlink()
        {
            // SAR 25 GB/day > S-band 2 GB/pass · 6 passes/day = 12 GB/day
            var build = Satellite(ValidationVoteFixtures.PowerDeployable).WithChoice(Slots.Communications, ValidationVoteFixtures.CommS);
            var issue = ValidationVoteFixtures.Single(Validator.Validate(build, PayloadCatalog()), ValidationRules.DataBudget);
            ValidationVoteFixtures.AssertDefault(issue, ValidationRules.DataBudget, Severity.Minor,
                "You'll collect more data than you can send home.");
            Assert.Equal("25.0", issue.Args["generated_GB_day"]);
            Assert.Equal("12.0", issue.Args["downlink_GB_day"]);
        }

        [Fact]
        public void DataBudget_does_not_fire_when_downlink_suffices()
        {
            // X-band 5 GB/pass · 6 = 30 GB/day ≥ 25 GB/day
            var build = Satellite(ValidationVoteFixtures.PowerDeployable).WithChoice(Slots.Communications, ValidationVoteFixtures.CommX);
            ValidationVoteFixtures.None(Validator.Validate(build, PayloadCatalog()), ValidationRules.DataBudget);
        }

        // ------------------------------------------------------------ Partial vs Complete

        [Fact]
        public void Partial_mode_skips_rules_with_undecided_inputs_Complete_does_not()
        {
            // Crewed, returning, fixed 5 m payload, 6 starts, every relevant category voted but nothing decided yet.
            var votes = new List<ContractVote>(ValidationVoteFixtures.PropulsionVotes())
            {
                V(Slots.LaunchEscape, ValidationVoteFixtures.EscapeTower),
                V(Slots.HeatShield, ValidationVoteFixtures.ShieldPica, ValidationVoteFixtures.ShieldBasic),
                V(Slots.Fairing, ValidationVoteFixtures.Fairing4m, ValidationVoteFixtures.Fairing52m),
                V(Slots.PayloadInstrument, ValidationVoteFixtures.InstSar),
                V(Slots.Communications, ValidationVoteFixtures.CommS, ValidationVoteFixtures.CommX),
            };
            var contract = C(votes: votes.ToArray(), crewed: true, returning: true, entrySpeedMps: 7800, starts: 6, payloadDiameterM: 5.0);
            var cat = ValidationVoteFixtures.Catalog(contract);
            var empty = BuildState.New("C1", 1);

            Assert.Empty(Validator.Validate(empty, cat, ValidationMode.Partial));

            var complete = Validator.Validate(empty, cat, ValidationMode.Complete).Select(i => i.RuleId).ToList();
            Assert.Equal(new[]
            {
                ValidationRules.LiftoffTwr, ValidationRules.TotalDv, ValidationRules.CrewedEscape,
                ValidationRules.ReturnHeatShield, ValidationRules.FairingFit, ValidationRules.UpperRestarts,
            }, complete);
        }

        [Fact]
        public void Partial_mode_judges_a_rule_once_its_inputs_are_decided()
        {
            var cat = ValidationVoteFixtures.Catalog(C());
            // Workhorse chosen, first tank undecided: TWR not judged yet.
            var noTank = ValidationVoteFixtures.TwoStage("C1", firstTank: null);
            ValidationVoteFixtures.None(Validator.Validate(noTank, cat, ValidationMode.Partial), ValidationRules.LiftoffTwr);
            // Tank M decided: TWR 0.27 → Blocker (the "Will not fly" warning of a vote preview).
            var withTank = ValidationVoteFixtures.TwoStage("C1");
            Assert.Equal(Severity.Blocker,
                ValidationVoteFixtures.Single(Validator.Validate(withTank, cat, ValidationMode.Partial), ValidationRules.LiftoffTwr).Severity);
        }

        [Fact]
        public void Partial_mode_judges_rules_whose_category_the_contract_never_votes_on()
        {
            // Crewed contract without an escape vote: nothing can ever add one, so Partial reports it now.
            var cat = ValidationVoteFixtures.Catalog(C(crewed: true));
            var issues = Validator.Validate(BuildState.New("C1", 1), cat, ValidationMode.Partial);
            Assert.Equal(Severity.Blocker, ValidationVoteFixtures.Single(issues, ValidationRules.CrewedEscape).Severity);
            Assert.True(Validator.HasBlocker(issues));
            Assert.Equal(Severity.Blocker, Validator.Worst(issues));
        }
    }
}
