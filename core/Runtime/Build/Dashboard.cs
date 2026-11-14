#nullable enable
using System;
using System.Collections.Generic;
using MissionForge.Core.Data;

namespace MissionForge.Core.Build
{
    /// <summary>Lift-off TWR band (design 6.3).</summary>
    public enum TwrStatus
    {
        /// <summary>Not computable yet (first stage undecided).</summary>
        Unknown,
        /// <summary>TWR ≤ 1: the rocket cannot leave the pad.</summary>
        WillNotFly,
        /// <summary>1 &lt; TWR &lt; 1.2: flies, with high gravity losses.</summary>
        Low,
        /// <summary>1.2 ≤ TWR ≤ 1.5: ideal (green).</summary>
        Ideal,
        /// <summary>TWR &gt; 1.5: flies; high loads and drag losses.</summary>
        High,
    }

    /// <summary>Aerodynamic stability verdict (design 6.3, 6.10). Simplified physical model.</summary>
    public enum StabilityStatus
    {
        /// <summary>Not computable yet.</summary>
        Unknown,
        /// <summary>CoP at least one body diameter aft of CoM: passively stable.</summary>
        Stable,
        /// <summary>CoP aft of CoM by less than one diameter.</summary>
        Marginal,
        /// <summary>CoP ahead of CoM: the vehicle relies on engine gimbal steering (like most real rockets).</summary>
        ReliesOnGimbal,
    }

    /// <summary>
    /// Every metric of the Readiness Dashboard (design 6.3). SI units unless the name says otherwise;
    /// money in $M (game), time in days (game). Nullable metrics are null when they do not apply
    /// or cannot be computed yet.
    /// </summary>
    public sealed class DashboardMetrics
    {
        // Δv (physical model)
        /// <summary>Per-phase Δv with effective Isp.</summary>
        public IReadOnlyList<StagePhase> Phases { get; internal set; } = Array.Empty<StagePhase>();
        /// <summary>Σ phase Δv (rocket equation), m/s.</summary>
        public double StagesDvMps { get; internal set; }
        /// <summary>Earth-rotation boost of the launch site, m/s (465 · cos(latitude); 0 for polar/retrograde orbits).</summary>
        public double RotationBoostMps { get; internal set; }
        /// <summary>Plane-change penalty when the target inclination is below the site latitude, m/s.</summary>
        public double PlaneChangePenaltyMps { get; internal set; }
        /// <summary>Δv spent on booster recovery (boostback, landing reserve), m/s.</summary>
        public double RecoveryDvCostMps { get; internal set; }
        /// <summary>Hot-staging bonus (+1.5% of stage Δv), m/s.</summary>
        public double HotStagingBonusMps { get; internal set; }
        /// <summary>Engine Δv bonuses from events (Engineering Breakthrough), m/s.</summary>
        public double EngineBonusDvMps { get; internal set; }
        /// <summary>Total Δv available, m/s.</summary>
        public double TotalDvMps { get; internal set; }
        /// <summary>Contract requirement, m/s.</summary>
        public double DvRequiredMps { get; internal set; }
        /// <summary>Margin: <c>(total − required) / required</c>, fraction.</summary>
        public double DvMarginFraction => DvRequiredMps > 0 ? (TotalDvMps - DvRequiredMps) / DvRequiredMps : 0;

        // TWR (physical model)
        /// <summary>Lift-off TWR <c>F_total_SL / (m_total · g0)</c>, or null when no first stage.</summary>
        public double? LiftoffTwr { get; internal set; }
        /// <summary>Band of the lift-off TWR.</summary>
        public TwrStatus LiftoffTwrStatus { get; internal set; }
        /// <summary>Upper stage TWR <c>F_vac / (m_stage_stack · g0)</c>, or null when no upper stage.</summary>
        public double? UpperStageTwr { get; internal set; }
        /// <summary>Upper stage TWR &lt; 0.3: high gravity losses warning.</summary>
        public bool UpperStageTwrWarning { get; internal set; }
        /// <summary>First stage survives one engine failure.</summary>
        public bool FirstStageEngineOut { get; internal set; }
        /// <summary>Upper stage survives one engine failure.</summary>
        public bool UpperStageEngineOut { get; internal set; }

        // Mass (physical model)
        /// <summary>Mass breakdown, kg.</summary>
        public MassBreakdown Mass { get; internal set; } = new MassBreakdown();
        /// <summary>Total lift-off mass, kg.</summary>
        public double TotalMassKg => Mass.TotalKg;

        // Budget & schedule (game values)
        /// <summary>Cost, schedule, timeline and critical path.</summary>
        public BudgetSchedule Budget { get; internal set; } = new BudgetSchedule();
        /// <summary>Total cost, $M.</summary>
        public double CostM => Budget.TotalCostM;
        /// <summary>Total schedule, days.</summary>
        public double ScheduleDays => Budget.TotalDays;

        // Reliability (game values)
        /// <summary>Estimated mission success with uncertainty band.</summary>
        public ReliabilityEstimate Success { get; internal set; } = new ReliabilityEstimate(1, 0, Array.Empty<ReliabilityItem>());

        // Power (simplified physical)
        /// <summary>Power balance in sunlight, W (generation − consumption), or null when no payload power system.</summary>
        public double? PowerSunlitW { get; internal set; }
        /// <summary>Power balance in eclipse, W (stored + continuous supply − consumption), or null.</summary>
        public double? PowerEclipseW { get; internal set; }
        /// <summary>Electrical load of the payload, W.</summary>
        public double PowerLoadW { get; internal set; }

        // Data (simplified physical)
        /// <summary>Data generated, GB/day, or null when no instrument and no radio.</summary>
        public double? DataGeneratedGbPerDay { get; internal set; }
        /// <summary>Downlink capacity, GB/day, or null.</summary>
        public double? DownlinkGbPerDay { get; internal set; }

        // Entry (real-world approximate)
        /// <summary>Heat shield maximum entry speed rating, m/s, or null when no heat shield.</summary>
        public double? MaxEntrySpeedRatingMps { get; internal set; }
        /// <summary>Entry speed of the contract, m/s, or null when the payload does not return.</summary>
        public double? ContractEntrySpeedMps { get; internal set; }

        // Stability (simplified physical)
        /// <summary>Stability verdict.</summary>
        public StabilityStatus Stability { get; internal set; }
        /// <summary>Centre of mass, m from the nose tip.</summary>
        public double? CenterOfMassM { get; internal set; }
        /// <summary>Centre of pressure, m from the nose tip.</summary>
        public double? CenterOfPressureM { get; internal set; }
        /// <summary>Static margin <c>(x_CoP − x_CoM) / D</c>, calibers (positive = CoP aft = stable).</summary>
        public double? StabilityMarginCalibers { get; internal set; }
        /// <summary>Vehicle length used by the stability model, m.</summary>
        public double? VehicleLengthM { get; internal set; }
        /// <summary>Strings key of the stability explanation.</summary>
        public string StabilityTextKey { get; internal set; } = "dashboard.stability.unknown";
    }

    /// <summary>Computes the Readiness Dashboard (design 6.3).</summary>
    public static class Dashboard
    {
        /// <summary>Computes every dashboard metric for a build.</summary>
        public static DashboardMetrics Compute(BuildState build, GameCatalog catalog) => Compute(new Vehicle(build, catalog));

        /// <summary>Computes every dashboard metric for a resolved vehicle.</summary>
        public static DashboardMetrics Compute(Vehicle v)
        {
            var d = ComputeFlightCore(v);

            // ---- budget, schedule, success
            d.Budget = BudgetScheduleModel.Compute(v);
            d.Success = ReliabilityModel.Estimate(v);

            // ---- power, data, stability
            ComputePower(v, d);
            ComputeData(v, d);
            ComputeStability(v, d);
            return d;
        }

        /// <summary>
        /// Computes only the flyability metrics (Δv, TWR, engine-out, mass, entry rating). Budget, success,
        /// power, data and stability are left at their defaults. Used by the "fix exists" search for speed.
        /// </summary>
        public static DashboardMetrics ComputeFlightCore(Vehicle v)
        {
            var g0 = PhysicalConstants.StandardGravityMs2;
            var d = new DashboardMetrics
            {
                Phases = v.Phases,
                Mass = v.Mass,
                DvRequiredMps = v.Contract.DvRequiredMps,
            };

            // ---- Δv
            double stages = 0, lowerStages = 0, bonus = 0;
            foreach (var ph in v.Phases)
            {
                stages += ph.DvMps;
                if (ph.Id != "upper") lowerStages += ph.DvMps;
                var engineCat = ph.Id == "upper" ? Slots.UpperStageEngine : Slots.FirstStageEngine;
                bonus += ph.DvMps * v.Build.Condition(engineCat).DvBonusFraction;
            }
            d.StagesDvMps = stages;
            d.EngineBonusDvMps = bonus;
            var recovery = v.Part(Slots.BoosterRecovery);
            d.RecoveryDvCostMps = recovery == null ? 0 : lowerStages * recovery.Stats.DvCostFraction;
            var sep = v.Part(Slots.StageSeparation);
            d.HotStagingBonusMps = sep == null ? 0 : stages * sep.Stats.DvBonusFraction;
            var site = v.Part(Slots.LaunchSite);
            (d.RotationBoostMps, d.PlaneChangePenaltyMps) = SiteEffects(site?.Stats.LatitudeDeg, v.Contract.InclinationDeg);
            d.TotalDvMps = stages > 0
                ? stages + d.EngineBonusDvMps + d.HotStagingBonusMps - d.RecoveryDvCostMps + d.RotationBoostMps - d.PlaneChangePenaltyMps
                : 0;

            // ---- TWR
            if (v.FirstEngine != null && v.Mass.TotalKg > 0)
            {
                var twr = v.LiftoffThrustSlN / (v.Mass.TotalKg * g0);
                d.LiftoffTwr = twr;
                d.LiftoffTwrStatus = twr <= BuildConstants.MinLiftoffTwr ? TwrStatus.WillNotFly
                    : twr < BuildConstants.IdealLiftoffTwrMin ? TwrStatus.Low
                    : twr <= BuildConstants.IdealLiftoffTwrMax ? TwrStatus.Ideal
                    : TwrStatus.High;
            }
            if (v.UpperEngine != null && v.UpperStackMassKg > 0)
            {
                var twr = v.UpperThrustVacN / (v.UpperStackMassKg * g0);
                d.UpperStageTwr = twr;
                d.UpperStageTwrWarning = twr < BuildConstants.UpperStageTwrWarning;
            }
            d.FirstStageEngineOut = ReliabilityModel.EngineOutCapable(v, true);
            d.UpperStageEngineOut = ReliabilityModel.EngineOutCapable(v, false);

            // ---- entry rating
            d.MaxEntrySpeedRatingMps = v.Part(Slots.HeatShield)?.Stats.MaxEntrySpeedMps;
            d.ContractEntrySpeedMps = v.Contract.Returning ? v.Contract.EntrySpeedMps : null;
            return d;
        }

        /// <summary>
        /// Launch-site effects (design 7.1, 8.3). Rotation boost <c>465 m/s · cos(latitude)</c> for prograde targets
        /// (inclination &lt; 90° or unspecified); 0 for polar and retrograde targets (the contract Δv already includes
        /// that loss). If the target inclination is below the site latitude, a plane change costs
        /// <c>2 · v_LEO · sin(Δi / 2)</c>. Physical model with the game simplification of 8.3.
        /// </summary>
        public static (double boostMps, double planeChangeMps) SiteEffects(double? latitudeDeg, double? inclinationDeg)
        {
            if (latitudeDeg == null) return (0, 0);
            var lat = Math.Abs(latitudeDeg.Value);
            double boost = inclinationDeg.HasValue && inclinationDeg.Value >= 90
                ? 0
                : BuildConstants.EarthRotationSpeedMps * Math.Cos(lat * Math.PI / 180);
            double penalty = 0;
            if (inclinationDeg.HasValue && inclinationDeg.Value < 90 && inclinationDeg.Value < lat)
                penalty = 2 * BuildConstants.LeoSpeedMps * Math.Sin((lat - inclinationDeg.Value) * Math.PI / 180 / 2);
            return (boost, penalty);
        }

        private static readonly string[] PowerConsumers =
        {
            Slots.PayloadInstrument, Slots.PayloadAttitude, Slots.Communications, Slots.Capsule,
            Slots.LifeSupport, Slots.Lander, Slots.Avionics, Slots.Navigation,
        };

        private static readonly string[] PowerSources = { Slots.PayloadPower, Slots.PowerSystem };

        /// <summary>
        /// Payload power balance (simplified physical). Solar parts give an orbit-average generation; while
        /// in sunlight they produce <c>P_avg · T / (T − t_eclipse)</c>. Load = bus load (satellites) + Σ consumers.
        /// Eclipse supply = continuous sources + energy stored in sunlight (surplus · t_sun, limited by
        /// battery Wh · depth of discharge) spread over the eclipse.
        /// </summary>
        private static void ComputePower(Vehicle v, DashboardMetrics d)
        {
            double avg = 0, continuous = 0, load = 0;
            double? batteryWh = null;
            bool hasSource = false;
            foreach (var cat in PowerSources)
            {
                var p = v.Part(cat);
                if (p == null) continue;
                if (p.Stats.GenerationAvgW > 0 || p.Stats.ContinuousPowerW > 0 || p.Stats.BatteryWh.HasValue) hasSource = true;
                avg += p.Stats.GenerationAvgW;
                continuous += p.Stats.ContinuousPowerW;
                if (p.Stats.BatteryWh.HasValue) batteryWh = (batteryWh ?? 0) + p.Stats.BatteryWh.Value;
            }
            if (!hasSource) return;
            if (v.Contract.VoteFor(Slots.PayloadPower) != null) load += BuildConstants.SatelliteBusLoadW;
            foreach (var cat in PowerConsumers) load += v.Part(cat)?.Stats.PowerDrawW ?? 0;

            var period = BuildConstants.LeoOrbitPeriodMin;
            var eclipse = BuildConstants.LeoEclipseMin;
            var sun = period - eclipse;
            var sunlitGen = avg * period / sun + continuous;
            var sunlit = sunlitGen - load;
            var surplusWh = Math.Max(0, sunlit) * sun / 60.0;
            var storedWh = batteryWh.HasValue ? Math.Min(surplusWh, batteryWh.Value * BuildConstants.BatteryDepthOfDischarge) : surplusWh;
            var eclipseSupply = continuous + storedWh / (eclipse / 60.0);
            d.PowerLoadW = load;
            d.PowerSunlitW = sunlit;
            d.PowerEclipseW = eclipseSupply - load;
        }

        /// <summary>Data budget: Σ instrument GB/day vs radio GB/pass × passes/day + relay GB/day (simplified physical).</summary>
        private static void ComputeData(Vehicle v, DashboardMetrics d)
        {
            var instrument = v.Part(Slots.PayloadInstrument);
            var comms = v.Part(Slots.Communications);
            if (instrument == null && comms == null) return;
            d.DataGeneratedGbPerDay = instrument?.Stats.DataGeneratedGbPerDay ?? 0;
            d.DownlinkGbPerDay = comms == null ? 0
                : comms.Stats.DownlinkGbPerPass * BuildConstants.GroundPassesPerDay + comms.Stats.DownlinkGbPerDay
                  + (comms.Stats.GetText("continuous_coverage") == "true" ? BuildConstants.RelayDownlinkGbPerDay : 0);
        }

        /// <summary>
        /// Stability (simplified physical, 1-D Barrowman-style): segments stacked from the nose tip; tank lengths
        /// from propellant volume over the body cross-section. Normal-force slopes: nose 2/rad at 0.466·L_nose,
        /// body lift ∝ length at mid-body, fins and booster noses when present.
        /// </summary>
        private static void ComputeStability(Vehicle v, DashboardMetrics d)
        {
            if (v.FirstEngine == null || v.Mass.FirstPropellantKg <= 0) return;
            var diameter = v.Part(Slots.Fairing)?.Stats.DiameterM
                           ?? v.Part(Slots.Capsule)?.Stats.DiameterM
                           ?? BuildConstants.DefaultBodyDiameterM;
            var area = Math.PI * diameter * diameter / 4;
            double TankLength(double propKg, string prop)
            {
                var rho = BuildConstants.BulkDensityKgPerM3.TryGetValue(prop, out var r) ? r : 1000.0;
                return propKg / rho / area;
            }

            var noseL = BuildConstants.NoseLengthCalibers * diameter;
            var upperL = v.UpperEngine == null ? 0 : TankLength(v.Mass.UpperPropellantKg, v.UpperEngine.Propellant);
            var interL = 0.5 * diameter;
            var firstL = TankLength(v.Mass.FirstPropellantKg, v.FirstEngine.Propellant);
            var length = noseL + upperL + interL + firstL;

            // Masses at segment centres (x from nose tip, metres).
            double mx = 0, m = 0;
            void Add(double kg, double x) { mx += kg * x; m += kg; }
            Add(v.Mass.PayloadKg + v.Mass.JettisonedAtStagingKg, 0.6 * noseL);
            Add(v.Mass.UpperTankDryKg + v.Mass.UpperPropellantKg, noseL + upperL / 2);
            Add(v.Mass.UpperEnginesKg, noseL + upperL);
            Add(v.Mass.SeparationKg, noseL + upperL + interL / 2);
            var firstTop = noseL + upperL + interL;
            Add(v.Mass.FirstTankDryKg + v.Mass.FirstPropellantKg, firstTop + firstL / 2);
            Add(v.Mass.FirstEnginesKg + v.Mass.FirstExtrasKg, length);
            Add(v.Mass.BoostersDryKg + v.Mass.BoostersPropellantKg, firstTop + firstL / 2);
            if (m <= 0) return;
            var com = mx / m;

            // Normal-force slopes (per rad) and their stations.
            double cn = 0, cnx = 0;
            void Force(double slope, double x) { cn += slope; cnx += slope * x; }
            Force(BuildConstants.NoseNormalForceSlope, BuildConstants.NoseCpFraction * noseL);
            var bodyL = length - noseL;
            Force(BuildConstants.BodyLiftSlopePerCaliber * bodyL / diameter, noseL + bodyL / 2);
            var aero = v.Part(Slots.AeroControl);
            if (aero != null && aero.HasTag("fins")) Force(BuildConstants.FinNormalForceSlope, length - 0.5 * diameter);
            if (v.BoosterCount > 0)
            {
                // Each strap-on has its own nose at the top of the first stage, scaled by its frontal area (≈ half diameter).
                Force(v.BoosterCount * BuildConstants.NoseNormalForceSlope * 0.25, firstTop + 0.5 * diameter);
            }
            var cop = cnx / cn;
            var margin = (cop - com) / diameter;
            d.CenterOfMassM = com;
            d.CenterOfPressureM = cop;
            d.StabilityMarginCalibers = margin;
            d.VehicleLengthM = length;
            if (margin >= BuildConstants.StableMarginCalibers) { d.Stability = StabilityStatus.Stable; d.StabilityTextKey = "dashboard.stability.stable"; }
            else if (margin >= 0) { d.Stability = StabilityStatus.Marginal; d.StabilityTextKey = "dashboard.stability.marginal"; }
            else { d.Stability = StabilityStatus.ReliesOnGimbal; d.StabilityTextKey = "dashboard.stability.gimbal"; }
        }
    }
}
