using System;
using System.Collections.Generic;
using MissionForge.Core.Build;
using MissionForge.Core.Data;

namespace MissionForge.Core.Flight.Mission
{
    /// <summary>One sequential burn interval; the boosters interval combines parallel engines.
    /// SI masses and engine performance are physical approximations from the build catalog.</summary>
    public sealed class FlightStageSpec
    {
        internal FlightStageSpec(StagePhase phase, EngineModel engine, double jettisonKg)
        {
            Id = phase.Id; Engine = engine; EngineCount = phase.EngineCount;
            InitialMassKg = phase.InitialMassKg; FinalMassKg = phase.FinalMassKg;
            IdealDeltaVMs = phase.DvMps; EffectiveIspS = phase.IspEffS;
            JettisonMassKg = jettisonKg;
        }
        public string Id { get; }
        public EngineModel Engine { get; }
        /// <summary>Main/core engine count only; the boosters interval's Engine also includes strap-on thrust.</summary>
        public int EngineCount { get; }
        public double InitialMassKg { get; }
        /// <summary>Whole stack at burnout, before jettison; includes payload and later stages.</summary>
        public double FinalMassKg { get; }
        public double PropellantMassKg => InitialMassKg - FinalMassKg;
        public double JettisonMassKg { get; }
        public double IdealDeltaVMs { get; }
        public double EffectiveIspS { get; }
    }

    /// <summary>Immutable build-to-flight boundary. No file access; the host supplies the catalog.</summary>
    public sealed class FlightVehicleSpec
    {
        private FlightVehicleSpec(Vehicle vehicle, DashboardMetrics dashboard, List<FlightStageSpec> stages)
        {
            Vehicle = vehicle; Stages = stages.AsReadOnly(); BuildSeed = vehicle.Build.Seed;
            Contract = vehicle.Contract; LiftoffMassKg = dashboard.TotalMassKg;
            IdealDeltaVMs = dashboard.StagesDvMps; DashboardDeltaVMs = dashboard.TotalDvMps;
            PayloadMassKg = vehicle.Mass.PayloadKg;
            FirstDryMassKg = vehicle.Mass.FirstDryKg;
            UpperDryMassKg = vehicle.Mass.UpperDryKg;
            BoosterDryMassKg = vehicle.Mass.BoostersDryKg;
            FairingMassKg = vehicle.Part(Slots.Fairing)?.MassKg ?? 0;
            EscapeTowerMassKg = vehicle.Mass.JettisonedAtStagingKg - FairingMassKg;
            var diameterM = vehicle.Part(Slots.Fairing)?.Stats.DiameterM
                ?? vehicle.Part(Slots.Capsule)?.Stats.DiameterM ?? 3.7; // game_value default
            ReferenceAreaM2 = Math.PI * diameterM * diameterM / 4;
            HeatShieldSpeedRatingMs = dashboard.MaxEntrySpeedRatingMps ?? 0;
            var entryDiameterM = vehicle.Part(Slots.Capsule)?.Stats.DiameterM
                ?? vehicle.Part(Slots.Lander)?.Stats.DiameterM ?? 3.7; // game_value default, m
            EntryAreaM2 = Math.PI * entryDiameterM * entryDiameterM / 4;
            EntryNoseRadiusM = entryDiameterM / 2; // game_value: blunt body, nose radius = body radius
            EntryMassKg = vehicle.Mass.PayloadKg;
            LanderKind = vehicle.Part(Slots.Lander)?.Id ?? "";
            HasHeatShield = vehicle.Part(Slots.HeatShield) != null;
            EscapeSystemKind = vehicle.Part(Slots.LaunchEscape)?.Id ?? "";
            EscapeEnvelope = vehicle.Part(Slots.LaunchEscape)?.Stats.GetText("abort_envelope_max") ?? "";
            BoosterReserveDeltaVMs = dashboard.RecoveryDvCostMps;
            RecoveryKind = vehicle.Part(Slots.BoosterRecovery)?.Id ?? "brec_expendable";
            CapsuleRecoveryKind = vehicle.Part(Slots.CapsuleRecovery)?.Id ?? "";
            UpperStageRestartsCount = vehicle.UpperEngine?.Stats.Restarts ?? 0;
            LatitudeRad = (vehicle.Part(Slots.LaunchSite)?.Stats.LatitudeDeg ?? 0) * Math.PI / 180;
        }
        internal Vehicle Vehicle { get; }
        public ulong BuildSeed { get; }
        public ContractDef Contract { get; }
        public IReadOnlyList<FlightStageSpec> Stages { get; }
        public double LiftoffMassKg { get; }
        public double PayloadMassKg { get; }
        public double FirstDryMassKg { get; }
        public double UpperDryMassKg { get; }
        public double BoosterDryMassKg { get; }
        public double FairingMassKg { get; }
        public double EscapeTowerMassKg { get; }
        public double ReferenceAreaM2 { get; }
        /// <summary>Capsule or lander cross-section for entry drag, m².</summary>
        public double EntryAreaM2 { get; }
        /// <summary>Stagnation nose radius for Sutton-Graves heating, m (game_value).</summary>
        public double EntryNoseRadiusM { get; }
        /// <summary>Mass of the payload stack that enters (capsule, cargo or lander), kg.</summary>
        public double EntryMassKg { get; }
        public string LanderKind { get; }
        public string EscapeSystemKind { get; }
        /// <summary>low_altitude, upper_atmosphere or orbit (data: abort_envelope_max).</summary>
        public string EscapeEnvelope { get; }
        public bool HasHeatShield { get; }
        public double HeatShieldSpeedRatingMs { get; }
        public double IdealDeltaVMs { get; }
        /// <summary>Dashboard budget after rotation, recovery, plane-change and build bonuses.</summary>
        public double DashboardDeltaVMs { get; }
        public double LatitudeRad { get; }
        public int UpperStageRestartsCount { get; }
        /// <summary>Δv held back for the booster return (Dashboard recovery cost), m/s.</summary>
        public double BoosterReserveDeltaVMs { get; }
        public string RecoveryKind { get; }
        public string CapsuleRecoveryKind { get; }

        public static FlightVehicleSpec FromBuild(BuildState build, GameCatalog catalog)
        {
            var vehicle = new Vehicle(build, catalog);
            var dashboard = Dashboard.Compute(build, catalog);
            if (dashboard.TotalMassKg <= 0 || dashboard.Phases.Count == 0)
                throw new ArgumentException("Flight requires a fueled vehicle.", nameof(build));
            var stages = new List<FlightStageSpec>();
            for (var i = 0; i < dashboard.Phases.Count; i++)
            {
                var phase = dashboard.Phases[i];
                var part = phase.Id == "upper" ? vehicle.UpperEngine : vehicle.FirstEngine;
                double sl = part?.Stats.IspSlS ?? part?.Stats.IspVacS ?? phase.IspEffS;
                double vac = part?.Stats.IspVacS ?? sl;
                var thrustSl = phase.ThrustSlN;
                if (phase.Id == "upper") thrustSl = (part?.Stats.ThrustSlN ?? 0) * phase.EngineCount;
                if (phase.Id == "boosters")
                {
                    // game_value equivalent engine: retain dashboard mass-flow-weighted Isp.
                    sl = vac = phase.IspEffS;
                }
                var nextMass = i + 1 < dashboard.Phases.Count ? dashboard.Phases[i + 1].InitialMassKg : phase.FinalMassKg;
                stages.Add(new FlightStageSpec(phase, new EngineModel(thrustSl, phase.ThrustVacN, sl, vac),
                    Math.Max(0, phase.FinalMassKg - nextMass)));
            }
            return new FlightVehicleSpec(vehicle, dashboard, stages);
        }
    }
}
