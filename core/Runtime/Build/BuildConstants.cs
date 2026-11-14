#nullable enable
using System.Collections.Generic;
using MissionForge.Core.Data;

namespace MissionForge.Core.Build
{
    /// <summary>
    /// Numbers used by the build rules that are not stored per part. Each is tagged with its
    /// <see cref="ValueKind"/> in the XML comment (design section 19). Values marked
    /// <c>game_value</c> that the design does not state are listed under "Decisions" in the
    /// T002 summary so the design owner can overrule them.
    /// </summary>
    public static class BuildConstants
    {
        // ---------------------------------------------------------------- physical

        /// <summary>Equatorial surface speed of Earth's rotation, m/s. physical (design 7.1, 8.1).</summary>
        public const double EarthRotationSpeedMps = PhysicalConstants.EarthEquatorRotationSpeedMs;

        /// <summary>Circular LEO speed used for the plane-change penalty, m/s. physical (design 19: ≈7.8 km/s).</summary>
        public const double LeoSpeedMps = 7800.0;

        /// <summary>LEO orbital period used for power balance, min. real_world_approximate (design 7.16: ~90 min).</summary>
        public const double LeoOrbitPeriodMin = 90.0;

        /// <summary>LEO eclipse duration per orbit, min. real_world_approximate (design 7.16: ~35 of every ~90 min).</summary>
        public const double LeoEclipseMin = 35.0;

        // ---------------------------------------------------------------- structural ratios (7.9)

        /// <summary>Dry tank mass per kg of propellant, by propellant family. game_value from real ranges (design 7.9).</summary>
        public static readonly IReadOnlyDictionary<string, double> StructuralRatio = new Dictionary<string, double>
        {
            [Propellants.Kerolox] = 0.05,
            [Propellants.Methalox] = 0.06,
            [Propellants.Hypergolic] = 0.06,
            [Propellants.Hydrolox] = 0.10,
        };

        /// <summary>Structural ratio when the stage propellant is unknown. game_value (decision: same as kerolox).</summary>
        public const double DefaultStructuralRatio = 0.05;

        /// <summary>
        /// Bulk (mixture) propellant density at the engine's mixture ratio, kg/m³, used for tank length in the
        /// stability model. real_world_approximate, derived from design 19 densities (LH₂ 71, LOX 1141, RP-1 810,
        /// CH₄ 422) at O/F 2.56 (kerolox), 6.0 (hydrolox), 3.6 (methalox), 1.6 (hypergolic, N₂O₄ 1440 / A-50 900).
        /// </summary>
        public static readonly IReadOnlyDictionary<string, double> BulkDensityKgPerM3 = new Dictionary<string, double>
        {
            [Propellants.Kerolox] = 1030.0,
            [Propellants.Hydrolox] = 362.0,
            [Propellants.Methalox] = 833.0,
            [Propellants.Hypergolic] = 1170.0,
            [Propellants.Solid] = 1800.0,
        };

        // ---------------------------------------------------------------- effective Isp

        /// <summary>
        /// Weight of vacuum Isp in the effective Isp of a stage lit on the pad:
        /// <c>Isp_eff = Isp_SL + w·(Isp_vac − Isp_SL)</c>. game_value (decision: 0.5, the mean of SL and vacuum;
        /// a stage lit on the pad spends roughly its first half in thick air).
        /// </summary>
        public const double PadStageVacuumIspWeight = 0.5;

        /// <summary>Solid strap-on booster sea-level Isp when data omits it, s. real_world_approximate (GEM-63 class ≈ 245–279 s).</summary>
        public const double SolidBoosterIspSlS = 250.0;

        /// <summary>Solid strap-on booster vacuum Isp when data omits it, s. real_world_approximate.</summary>
        public const double SolidBoosterIspVacS = 280.0;

        /// <summary>Propellant fraction of a solid booster's gross mass when data omits it. real_world_approximate (GEM-63 ≈ 0.9, SRB ≈ 0.85).</summary>
        public const double SolidBoosterPropellantFraction = 0.88;

        /// <summary>Solid booster burn time when data omits it, s. real_world_approximate (design 7.11: ~90 s).</summary>
        public const double SolidBoosterBurnS = 90.0;

        // ---------------------------------------------------------------- dashboard thresholds (6.3)

        /// <summary>Lift-off TWR must exceed this. physical (design 6.3, 6.11).</summary>
        public const double MinLiftoffTwr = 1.0;
        /// <summary>Lower edge of the ideal lift-off TWR band. game_value (design 6.3).</summary>
        public const double IdealLiftoffTwrMin = 1.2;
        /// <summary>Upper edge of the ideal lift-off TWR band. game_value (design 6.3).</summary>
        public const double IdealLiftoffTwrMax = 1.5;
        /// <summary>Upper stage TWR below this warns of high gravity losses. game_value (design 6.3).</summary>
        public const double UpperStageTwrWarning = 0.3;

        // ---------------------------------------------------------------- power and data (6.3)

        /// <summary>Bus (housekeeping) electrical load of a satellite payload, W. game_value (decision).</summary>
        public const double SatelliteBusLoadW = 20.0;
        /// <summary>Usable battery depth of discharge per LEO orbit, fraction. real_world_approximate (LEO Li-ion 20–40%).</summary>
        public const double BatteryDepthOfDischarge = 0.4;
        /// <summary>Ground-station passes per day for downlink, passes/day. game_value (decision; LEO with one station ≈ 4–6).</summary>
        public const double GroundPassesPerDay = 6.0;
        /// <summary>
        /// Downlink of a relay-network subscription (design 7.17 "continuous coverage", no rate given), GB/day.
        /// game_value (decision: enough for any single 7.2.1 instrument, SAR = 25 GB/day).
        /// </summary>
        public const double RelayDownlinkGbPerDay = 40.0;

        // ---------------------------------------------------------------- stability (6.3, 6.10)

        /// <summary>Vehicle body diameter when no fairing or capsule sets it, m. game_value.</summary>
        public const double DefaultBodyDiameterM = 3.7;
        /// <summary>Nose (fairing or capsule) length in body diameters. game_value.</summary>
        public const double NoseLengthCalibers = 1.5;
        /// <summary>Barrowman normal-force slope of a nose cone, per rad. physical (Barrowman: 2).</summary>
        public const double NoseNormalForceSlope = 2.0;
        /// <summary>Barrowman CP of an ogive/conical nose as a fraction of its length from the tip. physical (0.466 ogive).</summary>
        public const double NoseCpFraction = 0.466;
        /// <summary>
        /// Normal-force slope of the body cylinder per caliber of length, per rad. Galejs body lift
        /// <c>K · (4/π) · (L/D) · α</c> with K = 1.1, linearised at α = 5° (0.087 rad): 1.1 · 1.273 · 0.087 ≈ 0.12.
        /// game_value simplification.
        /// </summary>
        public const double BodyLiftSlopePerCaliber = 0.12;
        /// <summary>Normal-force slope of a four-fin set, per rad. game_value (typical 4-fin Barrowman result 6–12).</summary>
        public const double FinNormalForceSlope = 9.0;
        /// <summary>Stability margin (CoP aft of CoM) treated as passively stable, calibers. real_world_approximate (rule of thumb 1–2).</summary>
        public const double StableMarginCalibers = 1.0;

        // ---------------------------------------------------------------- reliability (6.5, 7.0)

        /// <summary>Half-width of the uncertainty band by maturity, fraction. game_value (design 7.0: ±1% / ±3% / ±6%).</summary>
        public static double BandHalfWidth(Maturity m) => m switch
        {
            Maturity.Proven => 0.01,
            Maturity.Mature => 0.03,
            _ => 0.06,
        };

        /// <summary>Probability that a part carries a hidden flaw, by maturity. game_value (decision).</summary>
        public static double FlawChance(Maturity m) => m switch
        {
            Maturity.Proven => 0.05,
            Maturity.Mature => 0.12,
            _ => 0.25,
        };

        /// <summary>Reliability lost while a hidden flaw is present and unfixed, fraction. game_value (decision).</summary>
        public const double FlawReliabilityPenalty = 0.03;
        /// <summary>Cost of fixing a revealed flaw, as a fraction of the part cost. game_value (decision).</summary>
        public const double FlawFixCostFraction = 0.2;
        /// <summary>Minimum flaw fix cost, $M. game_value (decision; Appendix A heater fix = $1 M).</summary>
        public const double FlawFixMinCostM = 1.0;
        /// <summary>Range fee of a launch site whose stages fall on land (flag <c>stages_fall_on_land</c>, Inland Steppe), $M. game_value (decision: design 7.1 gives no amount).</summary>
        public const double RangeFeeM = 1.0;
        /// <summary>Days needed to fix a revealed flaw. game_value (decision).</summary>
        public const double FlawFixDays = 3.0;
        /// <summary>Highest reliability any part can have, fraction. game_value (nothing is perfect).</summary>
        public const double MaxReliability = 0.9999;
        /// <summary>Generic "+ reliability" of tests whose design row says only "reliability +", fraction. game_value (decision).</summary>
        public const double GenericTestReliabilityBonus = 0.01;

        // ---------------------------------------------------------------- reviews (6.9)

        /// <summary>Re-integration fee of a rework, as a fraction of the replaced part's cost. game_value (design 6.9: 30%).</summary>
        public const double ReworkFeeFraction = 0.30;
        /// <summary>Fixed extra days of a rework on top of the new part's integration days. game_value (decision).</summary>
        public const double ReworkBaseDays = 2.0;
        /// <summary>NO-GO rounds at FRR that force a Rework option. game_value (design 6.9: 2).</summary>
        public const int FrrNoGoRoundsForRework = 2;

        // ---------------------------------------------------------------- anomalies (6.8)

        /// <summary>Votes after the last card before a new card may be drawn. game_value (design 6.8: every 3–5 votes).</summary>
        public const int AnomalyMinVotesBetween = 3;
        /// <summary>Votes after the last card when a card is always drawn. game_value (design 6.8).</summary>
        public const int AnomalyMaxVotesBetween = 5;

        // ---------------------------------------------------------------- tanks and structure cost

        /// <summary>
        /// Cost of tank structure when a tank option has no cost in data, $M per tonne of propellant capacity.
        /// game_value (decision, so that the material cost multiplier of 7.10 has something to multiply).
        /// </summary>
        public const double TankCostMPerTonnePropellant = 0.02;

        // ---------------------------------------------------------------- fix-exists search (4.2)

        /// <summary>Maximum build evaluations of the "a later vote can fix it" search. game_value (performance cap).</summary>
        public const int FixSearchMaxEvaluations = 200_000;
    }
}
