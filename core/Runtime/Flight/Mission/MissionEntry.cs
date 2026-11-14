using System;
using MissionForge.Core.Data;

namespace MissionForge.Core.Flight.Mission
{
    /// <summary>
    /// Deorbit, entry, descent and landing (design 9.1 F9-F13). The craft is ballistic (no lift); landing and
    /// splashdown limits, interface altitudes, corridor angles and blackout flux are game_value settings.
    /// </summary>
    public sealed partial class MissionSim
    {
        public const double EntryInterfaceAltitudeM = 120000;
        public const double MarsEntryInterfaceAltitudeM = 125000;
        public const double DeorbitTargetPeriapsisM = 30000;
        public const double DeorbitCompletePeriapsisM = 60000;
        public const double NoShieldMaxEntrySpeedMs = 3000;
        public const double NoHeatShieldMarsRatingMs = 6000;
        public const double DrogueMaxAltitudeM = 12000, DrogueMaxSpeedMs = 350;
        public const double MainMaxAltitudeM = 3500, MainMaxSpeedMs = 150;
        public const double MarsChuteMaxAltitudeM = 15000, MarsChuteMaxSpeedMs = 700;
        public const double TerminalPhaseAltitudeM = 2000;
        /// <summary>Speed below which the autopilot opens the main chutes, m/s (game_value).</summary>
        public const double AutopilotMainChuteSpeedMs = 100;
        public const double CrewMaxGLoad = 15;
        /// <summary>Terminal-engine reserve as a fraction of entry mass and its thrust acceleration in units of local g (game_value).</summary>
        public const double SoftLandingReserveFraction = 0.05, LanderReserveFraction = 0.10, PropulsiveReserveFraction = 0.15;
        public const double TerminalThrustAccelerationG = 3;
        public const double EarthLunarEntrySpeedFallbackMs = 11000;
        public const double LunarEntryFlightPathDeg = -6.5, LeoEntryFlightPathDeg = -1.5, MarsEntryFlightPathDeg = -15.5;
        public const double MarsEntrySpeedMs = 5500;
        public const double ReferenceShieldMargin = 1.15;

        private DescentCraft? descent;
        private bool descentArmed, entryBegan, blackoutActive, prevDeploy, returnEntryChecked;
        private double entrySpeedMs, entryFlightPathDeg, landingTargetSpeedMs, landingLimitMs;
        private bool landingHasEngine, chutesAvailable = true, gOverload;

        public DescentCraft? Descent => descent;
        public bool BlackoutActive => blackoutActive;

        private void BeginReturn()
        {
            Enter("F9");
        }

        // --------------------------------------------------------------------------------------- deorbit

        /// <summary>F9 end conditions; true when the mission ended.</summary>
        private bool DeorbitLogic()
        {
            var peri = OrbitalMechanics.Elements(state, body.MuM3S2).PeriapsisRadiusM - body.RadiusM;
            var burning = throttleFraction > 0;
            if (peri <= DeorbitCompletePeriapsisM && !burning) { ArmDescent(); return false; }
            if (PropellantKg <= 1e-6)
            {
                if (peri <= 70000) { ArmDescent(); return false; }
                Finish(MissionOutcome.Partial, "deorbit_failed", Slots.UpperStageEngine); return true;
            }
            return false;
        }

        /// <summary>Drops the burned-out stack; the capsule coasts to the entry interface.</summary>
        private void ArmDescent()
        {
            if (descentArmed) return;
            descentArmed = true;
            state = new FlightState(state.PositionXM, state.PositionYM, state.VelocityXMs, state.VelocityYMs, spec.EntryMassKg);
            carriedJettisonKg = 0;
            Emit("jettison", "service_stack");
            ConfigureDescentCraft(body, spec.EntryMassKg);
        }

        private void ConfigureDescentCraft(Body entryBody, double massKg)
        {
            var id = setup.Contract.Id;
            var recovery = spec.CapsuleRecoveryKind;
            double reserve = 0; landingTargetSpeedMs = 0; chutesAvailable = true;
            if (id == "C7")
            {
                switch (spec.LanderKind)
                {
                    case "lander_airbag": reserve = 0.05; landingTargetSpeedMs = 20; landingLimitMs = 25; break;
                    case "lander_sky_crane": reserve = LanderReserveFraction; landingTargetSpeedMs = 0.75; landingLimitMs = 1.5; break;
                    default: reserve = LanderReserveFraction; landingTargetSpeedMs = 2.5; landingLimitMs = 3; break;
                }
            }
            else if (recovery == "crec_propulsive_landing")
            { reserve = PropulsiveReserveFraction; landingTargetSpeedMs = 2; landingLimitMs = 4; chutesAvailable = false; }
            else if (recovery == "crec_parachutes_soft_landing_rockets")
            { reserve = SoftLandingReserveFraction; landingTargetSpeedMs = 2; landingLimitMs = 4; }
            else { landingLimitMs = 12; } // parachute splashdown (also the mandatory C0 parachute)
            landingHasEngine = reserve > 0;
            var finalMass = massKg * (1 - reserve);
            EngineModel? engine = null;
            if (landingHasEngine)
            {
                var thrust = TerminalThrustAccelerationG * entryBody.GravityMs2(entryBody.RadiusM) * massKg;
                engine = new EngineModel(thrust, thrust, 250, 250); // game_value hypergolic-class terminal engine
            }
            var rating = spec.HasHeatShield ? spec.HeatShieldSpeedRatingMs
                : id == "C7" ? NoHeatShieldMarsRatingMs : NoShieldMaxEntrySpeedMs;
            var capacity = ReferenceShieldCapacityJm2(entryBody, spec.EntryAreaM2, spec.EntryNoseRadiusM, finalMass, rating);
            descent = new DescentCraft(entryBody, spec.EntryAreaM2, spec.EntryNoseRadiusM, finalMass, capacity, engine);
        }

        /// <summary>
        /// Shield heat-load capacity, J/m²: the load a reference ballistic entry at the shield's rated speed
        /// produces on this craft, plus a 15% margin (game_value). Under-rated shields therefore burn through.
        /// </summary>
        private static double ReferenceShieldCapacityJm2(Body entryBody, double areaM2, double noseRadiusM,
            double finalMassKg, double ratingMs)
        {
            var mars = entryBody.RadiusM == Body.Mars.RadiusM;
            var gammaRad = (mars ? MarsEntryFlightPathDeg : ratingMs > 8000 ? LunarEntryFlightPathDeg : LeoEntryFlightPathDeg) * Math.PI / 180;
            var altitude = mars ? MarsEntryInterfaceAltitudeM : EntryInterfaceAltitudeM;
            var craft = new DescentCraft(entryBody, areaM2, noseRadiusM, finalMassKg, 0, null);
            var r = entryBody.RadiusM + altitude;
            var s = new FlightState(r, 0, -ratingMs * Math.Sin(-gammaRad), ratingMs * Math.Cos(gammaRad), finalMassKg);
            for (var i = 0; i < 120 * 900 && craft.AltitudeM(s) > 5000 && craft.AirSpeedMs(s) > 300; i++)
                s = craft.Step(s, i * Rk4Integrator.FixedStepS, 0);
            return Math.Max(1e6, craft.HeatLoadJm2 * ReferenceShieldMargin);
        }

        // --------------------------------------------------------------------------------------- entry

        private void StartEntryIfAtInterface()
        {
            if (!descentArmed || entryBegan || descent == null) return;
            var interface_ = body.RadiusM == Body.Mars.RadiusM ? MarsEntryInterfaceAltitudeM : EntryInterfaceAltitudeM;
            if (AltitudeM > interface_ || RadialMs >= 0) return;
            BeginEntry();
        }

        private void BeginEntry()
        {
            entryBegan = true;
            entrySpeedMs = descent!.AirSpeedMs(state);
            entryFlightPathDeg = EntryPhysics.FlightPathAngleRad(state) * 180 / Math.PI;
            Enter("F10");
            if (failures.IsBurnThrough(entrySpeedMs, 0, entryRatingMs()) && !(entrySpeedMs <= NoShieldMaxEntrySpeedMs && !spec.HasHeatShield))
                if (Apply(failures.Condition("entry", "burn_through", Slots.HeatShield))) return;
            if (setup.Contract.Id != "C0") RollOnce("entry");
        }
        private double entryRatingMs() => spec.HasHeatShield ? spec.HeatShieldSpeedRatingMs
            : setup.Contract.Id == "C7" ? NoHeatShieldMarsRatingMs : NoShieldMaxEntrySpeedMs;

        /// <summary>C6 and C7: hand over from the scripted cruise to the entry interface.</summary>
        private void BeginEntryAfterCruise(string id)
        {
            if (id == "C7")
            {
                body = Body.Mars; dynamics = new FlightDynamics(body);
                var r = body.RadiusM + MarsEntryInterfaceAltitudeM;
                var gamma = MarsEntryFlightPathDeg * Math.PI / 180;
                state = new FlightState(r, 0, MarsEntrySpeedMs * Math.Sin(gamma), MarsEntrySpeedMs * Math.Cos(gamma), spec.EntryMassKg);
            }
            else
            {
                body = Body.Earth; dynamics = new FlightDynamics(body);
                var speed = setup.Contract.EntrySpeedMps ?? EarthLunarEntrySpeedFallbackMs;
                var r = body.RadiusM + EntryInterfaceAltitudeM;
                var gamma = LunarEntryFlightPathDeg * Math.PI / 180;
                state = new FlightState(r, 0, speed * Math.Sin(gamma), speed * Math.Cos(gamma), spec.EntryMassKg);
            }
            carriedJettisonKg = 0; descentArmed = true;
            ConfigureDescentCraft(body, spec.EntryMassKg);
            BeginEntry();
        }

        /// <summary>C0: the burned-out rocket drops its payload, which falls back ballistically.</summary>
        private void ArmBallisticDescent()
        {
            if (descentArmed) return;
            descentArmed = true;
            state = new FlightState(state.PositionXM, state.PositionYM, state.VelocityXMs, state.VelocityYMs, spec.EntryMassKg);
            carriedJettisonKg = 0;
            Emit("jettison", "payload_package");
            metrics["payload_deployed"] = 1; // the science package is released at cutoff
            ConfigureDescentCraft(body, spec.EntryMassKg);
        }

        private bool IsMars => body.RadiusM == Body.Mars.RadiusM;

        /// <summary>One entry/descent/landing step (F10-F13). True when the mission ended.</summary>
        private bool EntryStep(PilotInput input)
        {
            var craft = descent!;
            var c = input.Main;
            var auto = setup.FullAutopilot || HasAid("auto_attitude");
            craft.ShieldForward = auto || c.Attitude == AttitudeMode.HeatShieldForward || phase == "F12" || phase == "F13";
            var airSpeed = craft.AirSpeedMs(state);
            var altitude = AltitudeM;
            // The full autopilot presses Deploy only when a chute can open safely; a pilot may press any time.
            var deployKey = setup.FullAutopilot
                ? (!descent!.DrogueDeployed || airSpeed <= AutopilotMainChuteSpeedMs)
                : (c.Deploy && !prevDeploy);
            prevDeploy = c.Deploy;
            if (deployKey && ChuteLogic(airSpeed, altitude)) return true;

            double throttle = 0;
            if (landingHasEngine && (phase == "F13" || !chutesAvailable) && altitude < 20000)
                throttle = craft.TerminalThrottle(state, landingTargetSpeedMs);
            state = craft.Step(state, elapsedS, throttle);
            gLoad = craft.GLoadUnitless;
            maxAltitudeM = Math.Max(maxAltitudeM, AltitudeM);
            airSpeed = craft.AirSpeedMs(state); altitude = AltitudeM;

            // Condition failures: burn-through on accumulated load, crew g-limit.
            if (craft.HeatLoadJm2 > craft.ShieldCapacityJm2 * (1 + setup.Modifiers.HeatMarginFraction)
                && Apply(failures.Condition("entry", "burn_through", Slots.HeatShield))) return true;
            if (setup.Contract.Crewed && craft.PeakGLoadUnitless > CrewMaxGLoad && !gOverload)
            {
                gOverload = true;
                Emit("failure", "g_overload");
                Finish(MissionOutcome.Failure, "g_overload", Slots.Capsule, announce: false); return true;
            }
            if (altitude > 150000 && RadialMs > 0) { Finish(MissionOutcome.Failure, "skip_out", Slots.HeatShield); return true; }

            var flux = craft.HeatFluxWm2;
            if (phase == "F10" && flux >= DescentCraft.BlackoutFluxWm2)
            { blackoutActive = true; Enter("F11"); Emit("blackout", "on"); }
            else if (phase == "F11" && flux < DescentCraft.BlackoutFluxWm2)
            {
                blackoutActive = false; Emit("blackout", "off"); Emit("minigame_cue", "MG-25"); Enter("F12");
            }
            else if (phase == "F10" && airSpeed < 700 && flux < DescentCraft.BlackoutFluxWm2) Enter("F12");
            if (phase == "F12" && altitude <= TerminalPhaseAltitudeM) Enter("F13");
            if (altitude <= 0) return Touchdown(airSpeed);
            return false;
        }

        /// <summary>Deploy request in the descent: drogue then main (Earth), main only (Mars). True if the mission ended.</summary>
        private bool ChuteLogic(double airSpeed, double altitude)
        {
            var craft = descent!;
            if (!chutesAvailable || craft.MainDeployed || altitude <= 0) return false;
            if (IsMars)
            {
                if (altitude > MarsChuteMaxAltitudeM || airSpeed > MarsChuteMaxSpeedMs) return false;
                return Deploy(true, "main");
            }
            if (!craft.DrogueDeployed)
            {
                if (altitude > DrogueMaxAltitudeM || airSpeed > DrogueMaxSpeedMs) return false;
                return Deploy(false, "drogue");
            }
            if (altitude > MainMaxAltitudeM) return false;
            if (airSpeed > MainMaxSpeedMs)
            { Emit("failure", "chute_overspeed"); Finish(MissionOutcome.Failure, "chute_overspeed", Slots.CapsuleRecovery, announce: false); return true; }
            return Deploy(true, "main");
        }

        private bool Deploy(bool main, string id)
        {
            var craft = descent!;
            if (!rolled.Contains("chutes"))
            {
                if (RollOnce("chutes")) return true;
                var slot = setup.Contract.Id == "C7" ? Slots.Lander : Slots.CapsuleRecovery;
                if (failures.HasUntestedParachute(slot) && Apply(failures.RollUntestedParachute("chutes", slot))) return true;
            }
            if (failures.ParachuteFailed) return false; // chute never opens; descent continues without it
            if (main) craft.DeployMain(); else craft.DeployDrogue();
            Emit("deploy", id);
            return false;
        }

        private bool Touchdown(double speedMs)
        {
            if (RollOnce("landing")) return true;
            var ok = speedMs <= landingLimitMs && !failures.ParachuteFailed;
            var id = setup.Contract.Id;
            var gammaNominal = id == "C7" ? MarsEntryFlightPathDeg : id == "C6" ? LunarEntryFlightPathDeg : LeoEntryFlightPathDeg;
            metrics["touchdown_speed_m_s"] = speedMs;
            metrics["peak_heat_flux_w_m2"] = descent!.PeakHeatFluxWm2;
            metrics["peak_g_load"] = descent.PeakGLoadUnitless;
            // game_value dispersion: 3 km plus 4 km per degree off the nominal corridor; a ballistic C0 shot lands within ~10 km.
            var dispersionKm = id == "C0" ? 10 : 3 + 4 * Math.Abs(entryFlightPathDeg - gammaNominal);
            metrics["capsule_landing_error_km"] = Math.Max(0.5, dispersionKm * (1 - setup.Modifiers.PrecisionFraction));
            if (!ok)
            {
                var mode = failures.ParachuteFailed ? "parachute_failure" : "hard_landing";
                Emit("failure", mode);
                Finish(setup.Contract.Crewed || metrics["payload_deployed"] == 0 ? MissionOutcome.Failure : MissionOutcome.Partial,
                    mode, id == "C7" ? Slots.Lander : Slots.CapsuleRecovery, announce: false);
                return true;
            }
            if (id == "C7") metrics["lander_landed_safely"] = 1;
            else { metrics["capsule_recovered"] = 1; metrics["payload_recovered"] = 1; if (setup.Contract.Crewed) metrics["crew_safe"] = 1; }
            Finish(MissionOutcome.Success);
            return true;
        }
    }
}
