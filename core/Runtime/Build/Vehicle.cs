#nullable enable
using System;
using System.Collections.Generic;
using MissionForge.Core.Data;

namespace MissionForge.Core.Build
{
    /// <summary>One burn phase of the ascent used for the dashboard Δv sum (physical model, rocket equation).</summary>
    public sealed class StagePhase
    {
        internal StagePhase(string id, double initialMassKg, double finalMassKg, double ispEffS, double thrustSlN,
            double thrustVacN, double burnTimeS, double dvMps, int engineCount)
        {
            Id = id;
            InitialMassKg = initialMassKg;
            FinalMassKg = finalMassKg;
            IspEffS = ispEffS;
            ThrustSlN = thrustSlN;
            ThrustVacN = thrustVacN;
            BurnTimeS = burnTimeS;
            DvMps = dvMps;
            EngineCount = engineCount;
        }

        /// <summary><c>boosters</c> (strap-ons and core burning in parallel), <c>first</c> or <c>upper</c>.</summary>
        public string Id { get; }
        /// <summary>Stack mass at ignition of the phase, kg.</summary>
        public double InitialMassKg { get; }
        /// <summary>Stack mass at burnout of the phase (before dropping hardware), kg.</summary>
        public double FinalMassKg { get; }
        /// <summary>Effective specific impulse of the phase, s (mass-flow weighted when several engine types burn).</summary>
        public double IspEffS { get; }
        /// <summary>Total sea-level thrust of everything burning, N.</summary>
        public double ThrustSlN { get; }
        /// <summary>Total vacuum thrust of everything burning, N.</summary>
        public double ThrustVacN { get; }
        /// <summary>Phase duration at full thrust, s.</summary>
        public double BurnTimeS { get; }
        /// <summary>Ideal Δv of the phase, m/s: <c>Isp_eff · g0 · ln(m0 / mf)</c>.</summary>
        public double DvMps { get; }
        /// <summary>Number of main engines burning in the phase (core only; boosters not counted).</summary>
        public int EngineCount { get; }
    }

    /// <summary>Mass breakdown of the stacked vehicle, kg.</summary>
    public sealed class MassBreakdown
    {
        /// <summary>Payload stack carried to the destination (contract payload + payload-bay parts + avionics, comms, power…), kg.</summary>
        public double PayloadKg { get; internal set; }
        /// <summary>Items dropped at stage separation: fairing and escape tower, kg.</summary>
        public double JettisonedAtStagingKg { get; internal set; }
        /// <summary>Upper stage engines, kg.</summary>
        public double UpperEnginesKg { get; internal set; }
        /// <summary>Upper stage tank structure, kg.</summary>
        public double UpperTankDryKg { get; internal set; }
        /// <summary>Upper stage propellant, kg.</summary>
        public double UpperPropellantKg { get; internal set; }
        /// <summary>Interstage / separation system, kg (falls with the first stage).</summary>
        public double SeparationKg { get; internal set; }
        /// <summary>First stage engines, kg.</summary>
        public double FirstEnginesKg { get; internal set; }
        /// <summary>First stage tank structure, kg.</summary>
        public double FirstTankDryKg { get; internal set; }
        /// <summary>First stage extra hardware (fins, grid fins), kg.</summary>
        public double FirstExtrasKg { get; internal set; }
        /// <summary>First stage propellant, kg.</summary>
        public double FirstPropellantKg { get; internal set; }
        /// <summary>All strap-on boosters, dry, kg.</summary>
        public double BoostersDryKg { get; internal set; }
        /// <summary>All strap-on boosters, propellant, kg.</summary>
        public double BoostersPropellantKg { get; internal set; }

        /// <summary>Upper stage dry mass (engines + tank), kg.</summary>
        public double UpperDryKg => UpperEnginesKg + UpperTankDryKg;
        /// <summary>First stage dry mass (engines + tank + extras), kg.</summary>
        public double FirstDryKg => FirstEnginesKg + FirstTankDryKg + FirstExtrasKg;
        /// <summary>Total lift-off mass, kg.</summary>
        public double TotalKg => PayloadKg + JettisonedAtStagingKg + UpperDryKg + UpperPropellantKg + SeparationKg +
                                 FirstDryKg + FirstPropellantKg + BoostersDryKg + BoostersPropellantKg;
    }

    /// <summary>
    /// Resolves a <see cref="BuildState"/> against the catalog into a stacked vehicle: masses,
    /// engines, propellant and burn phases. Pure function of its inputs.
    /// </summary>
    public sealed class Vehicle
    {
        private readonly GameCatalog _catalog;

        /// <summary>Resolves the vehicle. Undecided categories are simply absent.</summary>
        public Vehicle(BuildState build, GameCatalog catalog)
        {
            Build = build ?? throw new ArgumentNullException(nameof(build));
            _catalog = catalog ?? throw new ArgumentNullException(nameof(catalog));
            Contract = catalog.Contract(build.ContractId);
            Resolve();
        }

        /// <summary>The build this vehicle was resolved from.</summary>
        public BuildState Build { get; }
        /// <summary>The contract.</summary>
        public ContractDef Contract { get; }
        /// <summary>Mass breakdown, kg.</summary>
        public MassBreakdown Mass { get; } = new MassBreakdown();
        /// <summary>Burn phases in order (boosters, first, upper). Missing stages are omitted.</summary>
        public IReadOnlyList<StagePhase> Phases => _phases;
        private readonly List<StagePhase> _phases = new List<StagePhase>();

        /// <summary>First stage engine, or null.</summary>
        public PartDef? FirstEngine { get; private set; }
        /// <summary>Number of first stage engines (1 when the engine is chosen but the count is not yet).</summary>
        public int FirstEngineCount { get; private set; }
        /// <summary>Upper stage engine, or null.</summary>
        public PartDef? UpperEngine { get; private set; }
        /// <summary>Number of upper stage engines.</summary>
        public int UpperEngineCount { get; private set; }
        /// <summary>Strap-on booster option, or null.</summary>
        public PartDef? Boosters { get; private set; }
        /// <summary>Number of strap-on boosters (0 for "None").</summary>
        public int BoosterCount { get; private set; }
        /// <summary>True when the side boosters copy the first stage (liquid side boosters).</summary>
        public bool BoostersMirrorFirstStage { get; private set; }
        /// <summary>Lift-off sea-level thrust (core + boosters), N.</summary>
        public double LiftoffThrustSlN { get; private set; }
        /// <summary>First stage core sea-level thrust (all engines), N.</summary>
        public double FirstThrustSlN { get; private set; }
        /// <summary>Strap-on boosters total sea-level thrust, N.</summary>
        public double BoostersThrustSlN { get; private set; }
        /// <summary>Upper stage vacuum thrust (all engines), N.</summary>
        public double UpperThrustVacN { get; private set; }
        /// <summary>Upper stage stack mass at ignition (upper stage + payload stack), kg.</summary>
        public double UpperStackMassKg { get; private set; }
        /// <summary>Material dry-mass multiplier in use (1 when undecided).</summary>
        public double MaterialDryMultiplier { get; private set; } = 1.0;
        /// <summary>Material cost multiplier in use (1 when undecided).</summary>
        public double MaterialCostMultiplier { get; private set; } = 1.0;

        /// <summary>The chosen part of a category, or null.</summary>
        public PartDef? Part(string category)
        {
            var id = Build.Choice(category);
            return id == null ? null : _catalog.Part(id);
        }

        /// <summary>All chosen parts in vote order (then any other slots, ordinally).</summary>
        public IEnumerable<PartDef> ChosenParts()
        {
            foreach (var kv in ChosenSlots()) yield return kv.Value;
        }

        /// <summary>
        /// All chosen parts with the vote slot they fill (key = slot ID, e.g. <c>first_stage_tank_size</c>),
        /// in the vote order of design 6.2, then any other slots ordinally. Use the slot, not
        /// <see cref="PartDef.Category"/>, as the key into the build: one tank option can fill both tank slots.
        /// </summary>
        public IEnumerable<KeyValuePair<string, PartDef>> ChosenSlots()
        {
            var seen = new HashSet<string>();
            foreach (var slot in Slots.VoteOrder)
            {
                var p = Part(slot);
                if (p != null) { seen.Add(slot); yield return new KeyValuePair<string, PartDef>(slot, p); }
            }
            var rest = new List<string>();
            foreach (var kv in Build.Choices) if (!seen.Contains(kv.Key)) rest.Add(kv.Key);
            rest.Sort(StringComparer.Ordinal);
            foreach (var slot in rest) yield return new KeyValuePair<string, PartDef>(slot, _catalog.Part(Build.Choices[slot]));
        }

        /// <summary>
        /// Dry tank mass for a stage, kg: <c>propellant × structural ratio × material multiplier</c> (design 7.9).
        /// </summary>
        public static double TankDryMassKg(double propellantKg, string propellant, double materialMultiplier) =>
            propellantKg * StructuralRatio(null, propellant) * materialMultiplier;

        /// <summary>
        /// Structural ratio of a propellant family, dimensionless: the data value (<c>tank_size.json</c>
        /// <c>category_params.structural_ratio_by_propellant</c>) when the catalog has one, else
        /// <see cref="BuildConstants.StructuralRatio"/> (design 7.9 game values).
        /// </summary>
        public static double StructuralRatio(GameCatalog? catalog, string propellant)
        {
            if (catalog != null && catalog.StructuralRatios.TryGetValue(propellant, out var d)) return d;
            return BuildConstants.StructuralRatio.TryGetValue(propellant, out var r) ? r : BuildConstants.DefaultStructuralRatio;
        }

        /// <summary>
        /// Effective Isp of an engine lit on the pad, s: <c>Isp_SL + w · (Isp_vac − Isp_SL)</c> with
        /// <see cref="BuildConstants.PadStageVacuumIspWeight"/> (game simplification of 8.2 altitude interpolation).
        /// </summary>
        public static double PadIspEffS(double ispSlS, double ispVacS) =>
            ispSlS + BuildConstants.PadStageVacuumIspWeight * (ispVacS - ispSlS);

        private static int CountOf(PartDef? countOption, int fallback) => countOption?.Stats.Count ?? fallback;

        private void Resolve()
        {
            var g0 = PhysicalConstants.StandardGravityMs2;
            var material = Part(Slots.StructuralMaterial);
            MaterialDryMultiplier = material?.Stats.DryMassMultiplier ?? 1.0;
            MaterialCostMultiplier = material?.Stats.CostMultiplier ?? 1.0;

            // ---- payload stack: contract payload + payload-bay and avionics-type parts that fly to the destination
            double payload = Contract.PayloadMassKg;
            double jettison = 0;
            foreach (var kv in ChosenSlots())
            {
                var p = kv.Value;
                switch (kv.Key)
                {
                    case Slots.UpperStageEngine:
                    case Slots.UpperStageEngineCount:
                    case Slots.UpperStageTank:
                    case Slots.StageSeparation:
                    case Slots.FirstStageEngine:
                    case Slots.FirstStageEngineCount:
                    case Slots.FirstStageTank:
                    case Slots.StructuralMaterial:
                    case Slots.StrapOnBoosters:
                    case Slots.BoosterRecovery:
                    case Slots.LaunchSite:
                    case Slots.MissionAssurance:
                    case Slots.AeroControl:
                        break;
                    case Slots.Fairing:
                        jettison += p.MassKg;
                        break;
                    case Slots.LaunchEscape:
                        if (p.JettisonAtStaging) jettison += p.MassKg; else payload += p.MassKg;
                        break;
                    default:
                        payload += p.MassKg; // option mass already includes redundant units (design 7.13)
                        break;
                }
            }
            foreach (var e in Build.Ledger) payload += e.MassKg; // e.g. switched pressurant (+mass)
            Mass.PayloadKg = payload;
            Mass.JettisonedAtStagingKg = jettison;

            // ---- upper stage
            UpperEngine = Part(Slots.UpperStageEngine);
            UpperEngineCount = UpperEngine == null ? 0 : CountOf(Part(Slots.UpperStageEngineCount), 1);
            var upperTank = Part(Slots.UpperStageTank);
            double upperProp = 0, upperTankDry = 0;
            if (UpperEngine != null)
            {
                var fixedProp = UpperEngine.Stats.PropellantKg; // solid kick motor: fixed propellant, tank vote ignored
                if (fixedProp.HasValue)
                {
                    upperProp = fixedProp.Value * UpperEngineCount;
                    upperTankDry = 0; // casing mass is included in the motor's dry mass
                }
                else if (upperTank != null)
                {
                    upperProp = upperTank.Stats.UpperStagePropellantKg ?? 0;
                    upperTankDry = upperProp * StructuralRatio(_catalog, UpperEngine.Propellant) * MaterialDryMultiplier;
                }
                Mass.UpperEnginesKg = UpperEngine.MassKg * UpperEngineCount;
            }
            Mass.UpperTankDryKg = upperTankDry;
            Mass.UpperPropellantKg = upperProp;
            UpperThrustVacN = UpperEngine == null ? 0 : (UpperEngine.Stats.ThrustVacN ?? 0) * UpperEngineCount;

            // ---- separation system
            var sep = Part(Slots.StageSeparation);
            Mass.SeparationKg = sep?.MassKg ?? 0;

            // ---- first stage
            FirstEngine = Part(Slots.FirstStageEngine);
            FirstEngineCount = FirstEngine == null ? 0 : CountOf(Part(Slots.FirstStageEngineCount), 1);
            var firstTank = Part(Slots.FirstStageTank);
            double firstProp = 0, firstTankDry = 0;
            if (FirstEngine != null && firstTank != null)
            {
                firstProp = firstTank.Stats.FirstStagePropellantKg ?? 0;
                firstTankDry = firstProp * StructuralRatio(_catalog, FirstEngine.Propellant) * MaterialDryMultiplier;
            }
            Mass.FirstEnginesKg = FirstEngine == null ? 0 : FirstEngine.MassKg * FirstEngineCount;
            Mass.FirstTankDryKg = firstTankDry;
            Mass.FirstPropellantKg = firstProp;
            var aero = Part(Slots.AeroControl);
            Mass.FirstExtrasKg = aero?.MassKg ?? 0;
            FirstThrustSlN = FirstEngine == null ? 0 : (FirstEngine.Stats.ThrustSlN ?? FirstEngine.Stats.ThrustVacN ?? 0) * FirstEngineCount;

            // ---- strap-on boosters (parallel stage)
            Boosters = Part(Slots.StrapOnBoosters);
            BoosterCount = Boosters?.Stats.Count ?? 0;
            BoostersMirrorFirstStage = Boosters != null && Boosters.HasTag("mirror_first_stage");
            double boosterThrustSl = 0, boosterThrustVac = 0, boosterProp = 0, boosterDry = 0, boosterIspSl = 0, boosterIspVac = 0, boosterBurn = 0;
            if (Boosters != null && BoosterCount > 0)
            {
                if (BoostersMirrorFirstStage)
                {
                    if (FirstEngine != null)
                    {
                        boosterThrustSl = FirstThrustSlN * BoosterCount;
                        boosterThrustVac = (FirstEngine.Stats.ThrustVacN ?? 0) * FirstEngineCount * BoosterCount;
                        boosterProp = firstProp * BoosterCount;
                        boosterDry = (Mass.FirstEnginesKg + firstTankDry + Boosters.MassKg) * BoosterCount;
                        boosterIspSl = FirstEngine.Stats.IspSlS ?? 0;
                        boosterIspVac = FirstEngine.Stats.IspVacS ?? boosterIspSl;
                    }
                }
                else
                {
                    var grossEach = Boosters.MassKg;
                    var propEach = Boosters.Stats.PropellantKg ?? grossEach * BuildConstants.SolidBoosterPropellantFraction;
                    boosterThrustSl = (Boosters.Stats.ThrustSlN ?? 0) * BoosterCount;
                    boosterThrustVac = (Boosters.Stats.ThrustVacN ?? Boosters.Stats.ThrustSlN ?? 0) * BoosterCount;
                    boosterProp = propEach * BoosterCount;
                    boosterDry = (grossEach - propEach) * BoosterCount;
                    boosterIspSl = Boosters.Stats.IspSlS ?? BuildConstants.SolidBoosterIspSlS;
                    boosterIspVac = Boosters.Stats.IspVacS ?? BuildConstants.SolidBoosterIspVacS;
                    boosterBurn = Boosters.Stats.BurnTimeS ?? BuildConstants.SolidBoosterBurnS;
                }
            }
            Mass.BoostersDryKg = boosterDry;
            Mass.BoostersPropellantKg = boosterProp;
            BoostersThrustSlN = boosterThrustSl;
            LiftoffThrustSlN = FirstThrustSlN + boosterThrustSl;

            // ---- burn phases
            UpperStackMassKg = Mass.PayloadKg + Mass.UpperDryKg + Mass.UpperPropellantKg;
            double m = Mass.TotalKg;

            double coreIspSl = FirstEngine?.Stats.IspSlS ?? FirstEngine?.Stats.IspVacS ?? 0;
            double coreIspVac = FirstEngine?.Stats.IspVacS ?? coreIspSl;
            double coreIspEff = PadIspEffS(coreIspSl, coreIspVac);
            double coreThrustVac = FirstEngine == null ? 0 : (FirstEngine.Stats.ThrustVacN ?? FirstEngine.Stats.ThrustSlN ?? 0) * FirstEngineCount;
            // Mass flow is the same at sea level and in vacuum: ṁ = F_vac / (Isp_vac · g0)  (design 8.2)
            double coreMdot = coreIspVac > 0 ? coreThrustVac / (coreIspVac * g0) : 0;
            double coreBurn = coreMdot > 0 ? firstProp / coreMdot : 0;
            double corePropLeft = firstProp;

            if (boosterProp > 0 && boosterThrustVac > 0 && boosterIspVac > 0)
            {
                double boosterMdot = boosterThrustVac / (boosterIspVac * g0);
                if (BoostersMirrorFirstStage) boosterBurn = boosterProp / boosterMdot;
                double t = coreMdot > 0 ? Math.Min(boosterBurn, coreBurn) : boosterBurn;
                if (BoostersMirrorFirstStage) t = boosterBurn; // identical stages burn out together
                double coreUsed = Math.Min(corePropLeft, coreMdot * t);
                double boosterIspEff = PadIspEffS(boosterIspSl, boosterIspVac);
                double totalMdot = coreMdot + boosterMdot;
                // Mass-flow-weighted Isp == total thrust / (total mass flow · g0)
                double ispEff = (coreMdot * coreIspEff + boosterMdot * boosterIspEff) / totalMdot;
                double m0 = m, mf = m - boosterProp - coreUsed;
                double dv = RocketDv(ispEff, m0, mf);
                _phases.Add(new StagePhase("boosters", m0, mf, ispEff, FirstThrustSlN + boosterThrustSl,
                    coreThrustVac + boosterThrustVac, t, dv, FirstEngineCount));
                corePropLeft -= coreUsed;
                m = mf - boosterDry;
            }

            if (FirstEngine != null && corePropLeft > 1e-9)
            {
                double m0 = m, mf = m - corePropLeft;
                double dv = RocketDv(coreIspEff, m0, mf);
                double burn = coreMdot > 0 ? corePropLeft / coreMdot : 0;
                _phases.Add(new StagePhase("first", m0, mf, coreIspEff, FirstThrustSlN, coreThrustVac, burn, dv, FirstEngineCount));
            }

            if (UpperEngine != null && upperProp > 0)
            {
                double ispVac = UpperEngine.Stats.IspVacS ?? 0;
                double m0 = UpperStackMassKg, mf = UpperStackMassKg - upperProp;
                double dv = RocketDv(ispVac, m0, mf);
                double mdot = ispVac > 0 ? UpperThrustVacN / (ispVac * g0) : 0;
                _phases.Add(new StagePhase("upper", m0, mf, ispVac, 0, UpperThrustVacN, mdot > 0 ? upperProp / mdot : 0, dv, UpperEngineCount));
            }
        }

        /// <summary>
        /// Ideal rocket equation Δv, m/s, via <see cref="RocketEquation.DeltaVMs"/>: <c>Isp · g0 · ln(m0 / mf)</c>
        /// (design 8.2). Returns 0 instead of throwing when the inputs are degenerate (no engine, no propellant).
        /// </summary>
        public static double RocketDv(double ispS, double initialMassKg, double finalMassKg)
        {
            if (ispS <= 0 || initialMassKg <= 0 || finalMassKg <= 0 || finalMassKg >= initialMassKg) return 0;
            return RocketEquation.DeltaVMs(ispS, initialMassKg, finalMassKg);
        }
    }
}
