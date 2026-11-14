using System.Collections.Generic;
using System.Linq;
using MissionForge.Core.Build;
using MissionForge.Core.Data;
using MissionForge.Core.Tests.Data;
using Xunit;

namespace MissionForge.Core.Tests.Build
{
    /// <summary>
    /// GAME_DESIGN.md Appendix A: C1 Earth Watch, built from the real data files plus the design-table fixture
    /// (<see cref="DesignFixture"/>). Kerolox Workhorse ×3 with S first-stage tanks; the PDR reopens the upper tank
    /// and upgrades it from S to M; the dashboard then shows a lift-off TWR of about 1.35.
    /// The dashboard numbers are checked on hand-built states; <see cref="Appendix_A_played_through_the_public_flow"/> plays the whole
    /// walkthrough through the public calls (votes, anomaly card, PDR/CDR/FRR, rework, test, flaw fix, FRR poll).
    /// </summary>
    public class C1WalkthroughTests
    {
        private const double G0 = 9.80665;
        private static readonly GameCatalog Catalog = DesignFixture.Catalog();

        /// <summary>The Appendix A build, with the upper tank as voted in step 5 (S) before the PDR rework.</summary>
        private static BuildState BeforePdr() => BuildState.New("C1", 2026)
            .WithVoteResolved(Slots.LaunchSite, "site_west_coast_polar_range")          // step 3
            .WithVoteResolved(Slots.PayloadInstrument, "inst_multispectral_imager")     // step 4
            .WithVoteResolved(Slots.PayloadPower, "satpwr_deployable_solar_wings")
            .WithVoteResolved(Slots.PayloadAttitude, "adcs_reaction_wheels_star_tracker")
            .WithVoteResolved(Slots.Fairing, "fairing_small")
            .WithVoteResolved(Slots.UpperStageEngine, "eng_kerolox_vacuum")             // step 5
            .WithVoteResolved(Slots.UpperStageEngineCount, "engcount_upper_1")
            .WithVoteResolved(Slots.UpperStageTank, "tank_s")
            .WithVoteResolved(Slots.StageSeparation, "sep_pyro_bolts_springs")
            .WithVoteResolved(Slots.FirstStageEngine, "eng_kerolox_workhorse")          // step 6
            .WithVoteResolved(Slots.FirstStageEngineCount, "engcount_first_3")
            .WithVoteResolved(Slots.FirstStageTank, "tank_s")
            .WithVoteResolved(Slots.StructuralMaterial, "mat_aluminum_2219")
            .WithVoteResolved(Slots.StrapOnBoosters, "strap_none")
            .WithVoteResolved(Slots.BoosterRecovery, "brec_expendable")
            .WithVoteResolved(Slots.Avionics, "avi_commercial_single")
            .WithVoteResolved(Slots.Navigation, "nav_imu_gnss")
            .WithVoteResolved(Slots.AeroControl, "aero_gimbal_only")
            .WithVoteResolved(Slots.Rcs, "rcs_cold_gas")
            .WithVoteResolved(Slots.PowerSystem, "pwr_deployable_solar_liion")
            .WithVoteResolved(Slots.Communications, "comm_x_band")
            .WithVoteResolved(Slots.MissionAssurance, "assur_standard");

        /// <summary>After the PDR: the upper tank reopened (rework) and re-voted to M (step 8).</summary>
        private static BuildState AfterPdr()
        {
            var reopened = DesignReview.Rework(BeforePdr(), Catalog, ReviewKind.Pdr, Slots.UpperStageTank);
            return DesignReview.CompleteRework(reopened, Catalog, "tank_m");
        }

        [Fact]
        public void Liftoff_TWR_is_about_1_35_after_the_tank_change()
        {
            var d = Dashboard.Compute(AfterPdr(), Catalog);

            // Payload stack: 150 (contract) + 15 (multispectral) + 9 (solar wings) + 9 (wheels + star tracker)
            //              + 10 (commercial computer) = 193 kg; navigation, RCS, power and radio have no mass in 7.x.
            Assert.Equal(193.0, d.Mass.PayloadKg, 6);
            // Small fairing 0.4 t, dropped at staging.
            Assert.Equal(400.0, d.Mass.JettisonedAtStagingKg, 6);
            // Upper stage: Kerolox Vacuum 600 kg + M tank 60 t + dry tank 60 000 × 0.05 (kerolox) × 1.00 (Al 2219) = 3 000 kg.
            Assert.Equal(600.0, d.Mass.UpperEnginesKg, 6);
            Assert.Equal(60_000.0, d.Mass.UpperPropellantKg, 6);
            Assert.Equal(3_000.0, d.Mass.UpperTankDryKg, 6);
            // Separation 0.2 t; first stage: 3 × 470 = 1 410 kg engines, S tank 120 t, dry 120 000 × 0.05 = 6 000 kg.
            Assert.Equal(200.0, d.Mass.SeparationKg, 6);
            Assert.Equal(1_410.0, d.Mass.FirstEnginesKg, 6);
            Assert.Equal(120_000.0, d.Mass.FirstPropellantKg, 6);
            Assert.Equal(6_000.0, d.Mass.FirstTankDryKg, 6);
            // Total: 193 + 400 + 600 + 3 000 + 60 000 + 200 + 1 410 + 6 000 + 120 000 = 191 803 kg.
            Assert.Equal(191_803.0, d.TotalMassKg, 6);

            // TWR = 3 × 850 000 N / (191 803 kg × 9.80665 m/s²) = 2 550 000 / 1 880 945.9 = 1.3557
            Assert.Equal(1.3557, d.LiftoffTwr!.Value, 4);
            Assert.InRange(d.LiftoffTwr!.Value, 1.30, 1.40);
            Assert.Equal(TwrStatus.Ideal, d.LiftoffTwrStatus);
        }

        [Fact]
        public void Delta_v_per_stage_uses_effective_Isp()
        {
            var d = Dashboard.Compute(AfterPdr(), Catalog);

            // First stage lit on the pad: Isp_eff = 282 + 0.5 × (311 − 282) = 296.5 s.
            //   m0 = 191 803 kg, mf = 191 803 − 120 000 = 71 803 kg
            //   Δv1 = 296.5 × 9.80665 × ln(191 803 / 71 803) = 2 907.67 × 0.98254 = 2 856.91 m/s
            var first = d.Phases.Single(p => p.Id == "first");
            Assert.Equal(296.5, first.IspEffS, 9);
            Assert.Equal(2856.91, first.DvMps, 1);
            // Upper stage (vacuum): stack = 193 + 600 + 3 000 + 60 000 = 63 793 kg (the fairing went with stage 1),
            //   Δv2 = 348 × 9.80665 × ln(63 793 / 3 793) = 3 412.71 × 2.82248 = 9 632.34 m/s
            var upper = d.Phases.Single(p => p.Id == "upper");
            Assert.Equal(63_793.0, upper.InitialMassKg, 6);
            Assert.Equal(9632.34, upper.DvMps, 1);
            // Sun-synchronous 97.6° is retrograde: no rotation boost from the West Coast site (latitude 34.7°).
            Assert.Equal(0.0, d.RotationBoostMps);
            // Total 2 856.91 + 9 632.34 = 12 489.25 m/s against 9 700 m/s required: margin 28.8 %.
            Assert.Equal(12489.25, d.TotalDvMps, 1);
            Assert.Equal(0.2875, d.DvMarginFraction, 3);
        }

        [Fact]
        public void Before_the_tank_change_the_lighter_stack_has_a_higher_TWR()
        {
            // S upper tank: 25 t propellant and 25 000 × 0.05 = 1 250 kg dry instead of 60 t and 3 000 kg:
            //   total = 191 803 − 35 000 − 1 750 = 155 053 kg, TWR = 2 550 000 / (155 053 × 9.80665) = 1.6770
            var d = Dashboard.Compute(BeforePdr(), Catalog);
            Assert.Equal(155_053.0, d.TotalMassKg, 6);
            Assert.Equal(1.6770, d.LiftoffTwr!.Value, 4);
            Assert.Equal(TwrStatus.High, d.LiftoffTwrStatus);
        }

        [Fact]
        public void Electric_pump_mini_times_9_will_not_fly_and_shows_a_blocker()
        {
            // Step 6: 9 × 24 kN = 216 kN against 153 958 kg (S/S tanks, 9 × 35 kg engines):
            //   TWR = 216 000 / (153 958 × 9.80665) = 0.1431 → "Will not fly".
            var b = BeforePdr()
                .WithChoice(Slots.FirstStageEngine, "eng_electric_pump_mini")
                .WithChoice(Slots.FirstStageEngineCount, "engcount_first_9");
            var d = Dashboard.Compute(b, Catalog);
            Assert.Equal(0.1431, d.LiftoffTwr!.Value, 4);
            Assert.Equal(TwrStatus.WillNotFly, d.LiftoffTwrStatus);
            var issues = Validator.Validate(b, Catalog);
            Assert.Contains(issues, i => i.RuleId == ValidationRules.LiftoffTwr && i.Severity == Severity.Blocker);
        }

        [Fact]
        public void Vote_options_follow_the_contract_and_the_preview_shows_the_tank_change()
        {
            var before = BeforePdr().WithoutChoice(Slots.UpperStageTank);
            var offered = VoteOptions.Offered(before, Catalog, Slots.UpperStageTank).Select(p => p.Id).ToArray();
            Assert.Equal(new[] { "tank_xs", "tank_s", "tank_m" }, offered);

            var preview = Preview.Of(BeforePdr(), Catalog, Slots.UpperStageTank, "tank_m");
            // ΔTWR = 1.3557 − 1.6770 = −0.3213; Δmass = +36 750 kg (35 t propellant + 1.75 t tank)
            Assert.Equal(-0.3213, preview.Delta.LiftoffTwr!.Value, 3);
            Assert.Equal(36_750.0, preview.Delta.TotalMassKg, 6);
            // The real build still has the S tank (immutable).
            Assert.Equal("tank_s", BeforePdr().Choice(Slots.UpperStageTank));
        }

        [Fact]
        public void Rework_charges_the_fee_and_the_build_validates_clean_after_the_PDR()
        {
            var reopened = DesignReview.Rework(BeforePdr(), Catalog, ReviewKind.Pdr, Slots.UpperStageTank);
            Assert.Equal(Slots.UpperStageTank, reopened.ReopenedCategory);
            // S tank has no data cost: 25 t × 0.02 $M/t = 0.5 $M; fee 30 % = 0.15 $M (game values).
            var fee = reopened.Ledger.Single(e => e.Kind == LedgerKind.Rework);
            Assert.Equal(0.15, fee.CostM, 9);
            Assert.Equal(BuildConstants.ReworkBaseDays, fee.Days);

            var issues = Validator.Validate(AfterPdr(), Catalog);
            Assert.DoesNotContain(issues, i => i.Severity == Severity.Blocker);
            var d = Dashboard.Compute(AfterPdr(), Catalog);
            Assert.True(d.Budget.RemainingM > 0);       // within the $90 M budget
            Assert.True(d.Budget.TotalDays <= 180);     // within the 180-day schedule
        }

        [Fact]
        public void Supplier_delay_expedite_costs_4M_and_power_and_data_budgets_are_positive()
        {
            var b = AfterPdr().WithLedger(new LedgerEntry(LedgerKind.Anomaly, "supplier_delay/expedite", 4.0, 0, 0, Slots.FirstStageEngine));
            var d0 = Dashboard.Compute(AfterPdr(), Catalog);
            var d1 = Dashboard.Compute(b, Catalog);
            Assert.Equal(4.0, d1.CostM - d0.CostM, 9);

            // Power: load = 20 W bus + 30 W multispectral = 50 W; wings 150 W orbit average, 55 min of sun per 90 min:
            //   sunlit generation = 150 × 90 / 55 = 245.45 W → balance +195.45 W
            //   stored = 195.45 W × 55/60 h = 179.17 Wh, eclipse supply = 179.17 / (35/60 h) = 307.14 W → balance +257.14 W
            Assert.Equal(50.0, d1.PowerLoadW, 9);
            Assert.Equal(195.45, d1.PowerSunlitW!.Value, 2);
            Assert.Equal(257.14, d1.PowerEclipseW!.Value, 2);
            // Data: 10 GB/day generated, X-band 2 GB/pass × 6 passes/day = 12 GB/day down.
            Assert.Equal(10.0, d1.DataGeneratedGbPerDay);
            Assert.Equal(12.0, d1.DownlinkGbPerDay!.Value, 9);
        }

        // ------------------------------------------------------------ Appendix A through the public flow

        /// <summary>
        /// The build seed of the flow test. With seed 2026 (used by the dashboard tests above) the thermal-vacuum test finds no flaw in the
        /// multispectral imager; seed 2028 is the first seed from 2026 on where it does (hidden flaw present, roll 0.638 &lt; reveal chance 0.8),
        /// which is the "heater" flaw of Appendix A.
        /// </summary>
        private const ulong FlowSeed = 2028;

        /// <summary>The votes of Appendix A: slot → part. The upper tank is voted S in step 5 and reworked to M after the PDR.</summary>
        private static readonly Dictionary<string, string> AppendixAChoices = new Dictionary<string, string>
        {
            [Slots.LaunchSite] = "site_west_coast_polar_range",
            [Slots.PayloadInstrument] = "inst_multispectral_imager",
            [Slots.PayloadPower] = "satpwr_deployable_solar_wings",
            [Slots.PayloadAttitude] = "adcs_reaction_wheels_star_tracker",
            [Slots.Fairing] = "fairing_small",
            [Slots.UpperStageEngine] = "eng_kerolox_vacuum",
            [Slots.UpperStageEngineCount] = "engcount_upper_1",
            [Slots.UpperStageTank] = "tank_s",
            [Slots.StageSeparation] = "sep_pyro_bolts_springs",
            [Slots.FirstStageEngine] = "eng_kerolox_workhorse",
            [Slots.FirstStageEngineCount] = "engcount_first_3",
            [Slots.FirstStageTank] = "tank_s",
            [Slots.StructuralMaterial] = "mat_aluminum_2219",
            [Slots.StrapOnBoosters] = "strap_none",
            [Slots.BoosterRecovery] = "brec_expendable",
            [Slots.Avionics] = "avi_commercial_single",
            [Slots.Navigation] = "nav_imu_gnss",
            [Slots.AeroControl] = "aero_gimbal_only",
            [Slots.Rcs] = "rcs_cold_gas",
            [Slots.PowerSystem] = "pwr_deployable_solar_liion",
            [Slots.Communications] = "comm_x_band",
            [Slots.MissionAssurance] = "assur_standard",
        };

        /// <summary>Plays every vote with <see cref="VoteOptions.NextVote"/> and <see cref="VoteOptions.Commit"/>.</summary>
        private static BuildState PlayVotes(BuildState build, List<string> order)
        {
            while (VoteOptions.NextVote(build, Catalog) is string slot)
            {
                order.Add(slot);
                build = VoteOptions.Commit(build, Catalog, slot, AppendixAChoices[slot]);
            }
            return build;
        }

        [Fact]
        public void Appendix_A_played_through_the_public_flow()
        {
            // ---- votes: NextVote + Commit for every vote of the contract
            var order = new List<string>();
            var build = PlayVotes(BuildState.New("C1", FlowSeed), order);
            Assert.Equal(AppendixAChoices.Count, order.Count);
            Assert.Equal(AppendixAChoices.Keys.OrderBy(x => x), order.OrderBy(x => x));
            foreach (var kv in AppendixAChoices) Assert.Equal(kv.Value, build.Choice(kv.Key));
            Assert.Null(VoteOptions.NextVote(build, Catalog));
            Assert.Equal(AppendixAChoices.Count, build.VotesCompleted);

            // ---- anomaly: Supplier Delay, answered "pay to expedite" ($4 M, data)
            var costBefore = Dashboard.Compute(build, Catalog).CostM;
            var draw = AnomalyDeck.DrawSpecific(build, Catalog, "supplier_delay");
            Assert.Equal("supplier_delay", draw.Card.Id);
            build = AnomalyDeck.Respond(draw.Build, Catalog, "supplier_delay", "pay_to_expedite");
            Assert.Equal(4.0, Dashboard.Compute(build, Catalog).CostM - costBefore, 9);
            Assert.Contains("supplier_delay", build.AnomaliesDrawn);

            // ---- PDR: no Blocker; the upper tank is reworked from S to M
            var pdr = DesignReview.Run(ReviewKind.Pdr, build, Catalog);
            Assert.Equal(0, pdr.Blockers);
            Assert.True(pdr.PassAllowed);
            var tankFee = DesignReview.ReworkFeeM(build, Catalog, Slots.UpperStageTank);
            var reopened = DesignReview.Rework(build, Catalog, ReviewKind.Pdr, Slots.UpperStageTank);
            Assert.Equal(Slots.UpperStageTank, VoteOptions.NextVote(reopened, Catalog));
            build = DesignReview.CompleteRework(reopened, Catalog, "tank_m");
            Assert.Equal("tank_m", build.Choice(Slots.UpperStageTank));
            Assert.Equal(0.15, tankFee, 9); // 30 % of the S tank's 0.5 $M (game values)
            Assert.Null(build.ReopenedCategory);

            // ---- thermal-vacuum test of the instrument; FlowSeed reveals the flaw, which is fixed
            var tvac = TestCampaign.Run(build, Catalog, "thermal_vacuum_test", Slots.PayloadInstrument);
            Assert.True(tvac.FlawRevealed, "FlowSeed must reveal the instrument flaw (see FlowSeed)");
            Assert.Equal(new[] { Slots.PayloadInstrument }, TestCampaign.OpenFlaws(tvac.Build));
            Assert.Contains(DesignReview.Run(ReviewKind.Cdr, tvac.Build, Catalog).Issues, i => i.RuleId == DesignReview.FlawRule);
            build = TestCampaign.FixFlaw(tvac.Build, Catalog, Slots.PayloadInstrument);
            Assert.Empty(TestCampaign.OpenFlaws(build));

            // ---- CDR and FRR
            var cdr = DesignReview.Run(ReviewKind.Cdr, build, Catalog);
            Assert.Equal(0, cdr.Blockers);
            Assert.True(cdr.PassAllowed);
            var frr = DesignReview.Run(ReviewKind.Frr, build, Catalog);
            Assert.Equal(0, frr.Blockers);
            Assert.DoesNotContain(frr.Issues, i => i.Severity == Severity.Blocker);
            Assert.True(frr.PassAllowed);
            var (outcome, _) = FrrPoll.Start.Record(4, 0);
            Assert.Equal(PollOutcome.Go, outcome);

            // ---- the numbers of Appendix A
            var d = Dashboard.Compute(build, Catalog);
            Assert.InRange(d.LiftoffTwr!.Value, 1.30, 1.40);
            Assert.Equal(1.3557, d.LiftoffTwr!.Value, 4);
            Assert.True(d.Budget.RemainingM >= 0, "remaining budget $M: " + d.Budget.RemainingM);
            Assert.DoesNotContain(Validator.Validate(build, Catalog), i => i.Severity == Severity.Blocker);
            // Appendix A quotes a 2 % Δv margin. The documented stage masses give 12 489 m/s against 9 700 m/s, a 28.8 % margin;
            // the 2 % figure is not reproducible from the tables of section 7 and is kept as a documented difference.
            Assert.Equal(12489.25, d.TotalDvMps, 1);
            Assert.Equal(0.2875, d.DvMarginFraction, 3);
        }
    }
}
