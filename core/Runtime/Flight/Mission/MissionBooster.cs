using System;
using MissionForge.Core.Data;

namespace MissionForge.Core.Flight.Mission
{
    /// <summary>
    /// Booster return, flight phase F7b: a second state on the same fixed step. Physical: kernel drag, gravity and
    /// rocket-equation propellant use. Game simplifications (disclosed in the flight README): the burns are always
    /// retrograde, the booster flies on the Δv the Dashboard reserved, boostback uses a fixed share of that reserve
    /// and does not retarget the landing site, and the landing zone is the touchdown point of the nominal autopilot
    /// profile (a pad or drone ship is assumed to be placed there).
    /// </summary>
    public sealed partial class MissionSim
    {
        public const double BoostbackReserveFraction = 0.25, EntryBurnReserveFraction = 0.20;
        public const double BoosterSeparationDelayS = 5;
        public const double BoosterEntryBurnAltitudeM = 60000, BoosterEntryBurnSpeedMs = 1500;
        public const double BoosterLandingBurnAltitudeM = 30000, BoosterLandingBurnSpeedMs = 500;
        public const double BoosterTouchdownSpeedLimitMs = 2, BoosterSplashdownLimitMs = 12;
        /// <summary>Commanded touchdown speed of the landing burn, m/s (game_value; below the 2 m/s limit for margin).</summary>
        public const double BoosterLandingTargetSpeedMs = 0.3;
        public const double BoosterLandingZoneRadiusKm = 5, BoosterDispersionKm = 3;
        public const double BoosterBodyCd = 1.0;

        private sealed class BoosterGuidance
        {
            public string Phase = "coast"; public bool EntryDone;
            public double Throttle(DescentCraft craft, FlightState s, double ageS, double dryKg, double reserveKg, bool rtls)
            {
                var altitude = craft.AltitudeM(s); var speed = craft.AirSpeedMs(s);
                var radial = (s.PositionXM * s.VelocityXMs + s.PositionYM * s.VelocityYMs) / s.RadiusM;
                var used = reserveKg - (s.MassKg - dryKg);
                switch (Phase)
                {
                    case "coast":
                        if (rtls && ageS >= BoosterSeparationDelayS && !EntryDone && altitude > BoosterEntryBurnAltitudeM)
                        { Phase = "boostback"; goto case "boostback"; }
                        if (altitude <= BoosterEntryBurnAltitudeM && radial < 0 && speed > BoosterEntryBurnSpeedMs && !EntryDone)
                        { Phase = "entry_burn"; goto case "entry_burn"; }
                        if (altitude <= BoosterLandingBurnAltitudeM && radial < 0 && speed <= BoosterLandingBurnSpeedMs) { Phase = "landing_burn"; goto default; }
                        return 0;
                    case "boostback":
                        if (used >= BoostbackReserveFraction * reserveKg) { Phase = "coast"; EntryDone = false; return 0; }
                        return 1;
                    case "entry_burn":
                        if (used >= (BoostbackReserveFraction * (rtls ? 1 : 0) + EntryBurnReserveFraction) * reserveKg
                            || speed <= BoosterEntryBurnSpeedMs) { Phase = "coast"; EntryDone = true; return 0; }
                        return 1;
                    default:
                        return craft.TerminalThrottle(s, BoosterLandingTargetSpeedMs);
                }
            }
        }

        private FlightState boosterState = null!;
        private DescentCraft? boosterCraft;
        private BoosterGuidance boosterGuidance = new BoosterGuidance();
        private bool boosterActive, boosterDone, boosterPropulsive, boosterRtls;
        private double boosterAgeS, boosterDryKg, boosterReserveKg, boosterThrottle, boosterNominalGroundAngleRad = double.NaN;
        private bool boosterPrevDeploy;


        private void EmitF7b(string kind, string id) => events.Add(new FlightEvent(tick, MetS, "F7b", kind, id));

        private DescentCraft NewBoosterCraft(double dryMassKg)
        {
            EngineModel? engine = null;
            if (boosterPropulsive)
            {
                var stage = spec.Stages[Math.Max(0, stageIndex - 1)];
                var one = Math.Max(1, stage.EngineCount); // one engine of the cluster lands the booster
                engine = new EngineModel(stage.Engine.ThrustSlN / one, stage.Engine.ThrustVacN / one, stage.Engine.IspSlS, stage.Engine.IspVacS);
            }
            return new DescentCraft(body, spec.EntryAreaM2, spec.EntryNoseRadiusM, dryMassKg, 0, engine, BoosterBodyCd);
        }

        /// <summary>Called as the first stage separates; <paramref name="boosterMassKg"/> is dry mass plus reserve.</summary>
        private void BeginBoosterReturn(double dryMassKg, double reserveKg)
        {
            boosterActive = true; boosterDryKg = dryMassKg; boosterReserveKg = reserveKg;
            boosterPropulsive = spec.RecoveryKind == "brec_propulsive_rtls" || spec.RecoveryKind == "brec_propulsive_drone_ship";
            boosterRtls = spec.RecoveryKind == "brec_propulsive_rtls";
            boosterState = new FlightState(state.PositionXM, state.PositionYM, state.VelocityXMs, state.VelocityYMs, dryMassKg + reserveKg);
            boosterCraft = NewBoosterCraft(dryMassKg);
            boosterGuidance = new BoosterGuidance();
            EmitF7b("phase_entered", "F7b");
            var definition = setup.Phases.Phase("F7b");
            if (boosterPropulsive) foreach (var cue in definition.MinigameIds) EmitF7b("minigame_cue", cue);
            foreach (var fact in definition.FactIds) EmitF7b("fact_moment", fact);
            if (boosterPropulsive && Autopilot()) boosterNominalGroundAngleRad = NominalTouchdownGroundAngle();
        }
        private bool Autopilot() => setup.BoosterAutopilot ?? setup.FullAutopilot;

        private double GroundAngle(FlightState s, double timeS) =>
            Math.Atan2(s.PositionYM, s.PositionXM) - body.RotationRateRadS * timeS;

        /// <summary>Rolls the nominal autopilot profile forward to find where it lands (landing zone centre).</summary>
        private double NominalTouchdownGroundAngle()
        {
            var craft = NewBoosterCraft(boosterDryKg);
            var guidance = new BoosterGuidance();
            var s = boosterState; var t = elapsedS; var age = 0.0;
            for (var i = 0; i < 120 * 3600; i++)
            {
                var throttle = guidance.Throttle(craft, s, age, boosterDryKg, boosterReserveKg, boosterRtls);
                s = craft.Step(s, t, throttle); t += Rk4Integrator.FixedStepS; age += Rk4Integrator.FixedStepS;
                if (craft.AltitudeM(s) <= 0) break;
            }
            return GroundAngle(s, t);
        }

        private void StepBooster(PilotInput input)
        {
            var craft = boosterCraft!;
            boosterAgeS += Rk4Integrator.FixedStepS;
            var c = input.Booster ?? new CraftInput();
            double throttle;
            if (boosterPropulsive)
                throttle = Autopilot() ? boosterGuidance.Throttle(craft, boosterState, boosterAgeS, boosterDryKg, boosterReserveKg, boosterRtls)
                    : Math.Min(c.ThrottleFraction, boosterState.MassKg > boosterDryKg ? 1 : 0);
            else
            {
                throttle = 0; BoosterChutes(craft, c);
            }
            boosterThrottle = throttle;
            boosterState = craft.Step(boosterState, elapsedS, throttle);
            if (craft.AltitudeM(boosterState) <= 0) BoosterTouchdown(craft);
        }

        private void BoosterChutes(DescentCraft craft, CraftInput c)
        {
            var altitude = craft.AltitudeM(boosterState); var speed = craft.AirSpeedMs(boosterState);
            var key = Autopilot() ? (!craft.DrogueDeployed || speed <= AutopilotMainChuteSpeedMs) : (c.Deploy && !boosterPrevDeploy);
            boosterPrevDeploy = c.Deploy;
            if (!key || craft.MainDeployed) return;
            if (!craft.DrogueDeployed) { if (altitude <= DrogueMaxAltitudeM && speed <= DrogueMaxSpeedMs) { craft.DeployDrogue(); EmitF7b("deploy", "drogue"); } }
            else if (altitude <= MainMaxAltitudeM && speed <= MainMaxSpeedMs) { craft.DeployMain(); EmitF7b("deploy", "main"); }
        }

        private void BoosterTouchdown(DescentCraft craft)
        {
            boosterActive = false; boosterDone = true;
            var speed = craft.AirSpeedMs(boosterState);
            var groundAngle = GroundAngle(boosterState, elapsedS);
            var missKm = double.IsNaN(boosterNominalGroundAngleRad) ? 0
                : Math.Abs(groundAngle - boosterNominalGroundAngleRad) * body.RadiusM / 1000;
            var dispersionKm = BuildRandomDraw() * BoosterDispersionKm * (1 - setup.Modifiers.PrecisionFraction);
            var errorKm = missKm + dispersionKm;
            metrics["booster_touchdown_speed_m_s"] = speed; metrics["booster_landing_error_km"] = errorKm;
            var limit = boosterPropulsive ? BoosterTouchdownSpeedLimitMs : BoosterSplashdownLimitMs;
            Apply(failures.Roll("booster_landing"));
            var ok = speed <= limit && (!boosterPropulsive || errorKm <= BoosterLandingZoneRadiusKm) && !failures.BoosterLandingFailed;
            if (ok)
            {
                metrics["booster_recovered"] = 1; if (boosterPropulsive) metrics["booster_landed"] = 1;
                EmitF7b("booster_touchdown", boosterPropulsive ? "landed" : "splashdown");
            }
            else EmitF7b("failure", "booster_landing_failure"); // the mission continues (design 9.1 F7b)
        }

        /// <summary>Keyed landing dispersion draw in [0,1): independent of pilot input (design 8.4).</summary>
        private double BuildRandomDraw() => MissionForge.Core.Build.BuildRandom.Uniform(spec.BuildSeed, FailureModel.StreamId, "booster_dispersion:" + spec.RecoveryKind, 0);

        private BoosterHud? BoosterSnapshot()
        {
            if (boosterCraft == null) return null;
            var radial = (boosterState.PositionXM * boosterState.VelocityXMs + boosterState.PositionYM * boosterState.VelocityYMs) / boosterState.RadiusM;
            return new BoosterHud
            {
                Stage = boosterGuidance.Phase, AltitudeKm = boosterCraft.AltitudeM(boosterState) / 1000,
                SpeedMs = boosterCraft.AirSpeedMs(boosterState), VerticalSpeedMs = radial,
                PropellantPct = boosterReserveKg > 0 ? 100 * Math.Max(0, boosterState.MassKg - boosterDryKg) / boosterReserveKg : 0,
                ThrottlePct = boosterThrottle * 100, Landed = boosterDone && metrics["booster_recovered"] > 0
            };
        }
    }
}
