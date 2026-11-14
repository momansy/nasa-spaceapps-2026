using System;
using System.Collections.Generic;
using MissionForge.Core.Data;

namespace MissionForge.Core.Flight.Mission
{
    /// <summary>
    /// Time warp (design 9.7) and the deep-space transfers of C5, C6 and C7.
    /// Physical: vis-viva transfer speeds and Kepler coasts. Game simplifications: the transfer burn is
    /// one impulse (no finite-burn or gravity loss), and the lunar and Mars cruises are scripted coasts.
    /// </summary>
    public sealed partial class MissionSim
    {
        /// <summary>Highest unpowered-coast warp, ×1,000 (design 9.7).</summary>
        public const double MaxCoastWarpFactor = 1000;
        /// <summary>Warp while a minigame is active (game_value bullet time).</summary>
        public const double BulletTimeFactor = 0.1;
        /// <summary>Warp is forced to 1 below this altitude, m (design 9.7).</summary>
        public const double WarpFloorAltitudeM = 70000;
        // Transfer targets. Physical: mean Earth-Moon distance 384,400 km; Hohmann Earth-Mars v-infinity 2.94 km/s.
        public const double GeoTransferApogeeM = 35786000;
        public const double LunarDistanceM = 384400000;
        public const double MarsTransferVInfinityMs = 2940;
        // game_value scripted cruises, s.
        public const double LunarFlybyCruiseS = 6 * 86400;
        public const double MarsCruiseS = 210 * 86400;

        private double bulletTimeS;
        private bool transferActive;
        private double transferRadialSign;
        private int upperStarts;
        private bool upperBurning;

        /// <summary>Effective warp of the last step: 0.1 minigame, 1 normal, up to 1,000 in a coast.</summary>
        public double WarpFactor { get; private set; } = 1;

        private double ResolveWarp(PilotInput input)
        {
            if (input.MinigameActive) return BulletTimeFactor;
            var requested = input.RequestedWarpFactor;
            if (!(requested > 1) || double.IsNaN(requested)) return 1;
            return CoastWarpAllowed() ? Math.Min(requested, MaxCoastWarpFactor) : 1;
        }

        private bool CoastWarpAllowed()
        {
            if (!(phase == "F8" || transferActive) || AltitudeM < WarpFloorAltitudeM || boosterActive) return false;
            var e = OrbitalMechanics.Elements(state, body.MuM3S2);
            return e.SemiMajorAxisM > 0 && e.EccentricityUnitless < 1 && e.PeriapsisRadiusM - body.RadiusM >= WarpFloorAltitudeM;
        }

        private IReadOnlyList<FlightEvent> CoastStep(PilotInput input, double warp)
        {
            var dt = warp * Rk4Integrator.FixedStepS;
            if (phase == "F8" && !transferActive)
            {
                var remaining = setup.OrbitalOperationsDurationS - (elapsedS - phaseStartS);
                if (dt > remaining) dt = Math.Max(remaining, Rk4Integrator.FixedStepS); // do not overshoot the deploy gate
            }
            elapsedS += dt;
            state = OrbitalMechanics.PropagateElliptic(state, body.MuM3S2, dt);
            throttleFraction = 0; gLoad = 0;
            maxAltitudeM = Math.Max(maxAltitudeM, AltitudeM);
            OrbitalOperations(AssistedInput(input));
            return Deliver();
        }

        private bool IsTransferContract => setup.Contract.Id == "C5" || setup.Contract.Id == "C6" || setup.Contract.Id == "C7";

        /// <summary>Orbital operations (F8): payload deployment, or the contract transfer. True when the mission ended.</summary>
        private bool OrbitalOperations(PilotInput input)
        {
            if (Result != null) return true;
            if (transferActive) return TransferCoast();
            if (phase != "F8" || elapsedS - phaseStartS < setup.OrbitalOperationsDurationS || !input.Main.Deploy) return false;
            if (IsTransferContract) return BeginTransfer();
            if (RollOnce("deployment")) return true;
            metrics["payload_deployed"] = failures.DeploymentFailed ? 0 : 1;
            if (!setup.Contract.Returning) Finish(MissionOutcome.Success);
            else BeginReturn();
            return Result != null;
        }

        /// <summary>Vis-viva Δv, m/s, to reach <paramref name="apoapsisRadiusM"/> from the present point (prograde, at periapsis).</summary>
        public double TransferDeltaVMs(double apoapsisRadiusM)
        {
            var r = state.RadiusM;
            var tangential = Math.Abs(state.PositionXM * state.VelocityYMs - state.PositionYM * state.VelocityXMs) / r;
            double target;
            if (setup.Contract.Id == "C7")
                target = Math.Sqrt(MarsTransferVInfinityMs * MarsTransferVInfinityMs + 2 * body.MuM3S2 / r);
            else
                target = Math.Sqrt(body.MuM3S2 * (2 / r - 2 / (r + apoapsisRadiusM)));
            return Math.Max(0, target - tangential);
        }

        /// <summary>Δv still available from the last stage's propellant (Isp includes boost fractions), m/s.</summary>
        public double AvailableDeltaVMs()
        {
            var e = CurrentEngine;
            return e.IspVacS * PhysicalConstants.StandardGravityMs2 * Math.Log(state.MassKg / (Stage.FinalMassKg + carriedJettisonKg));
        }

        private bool BeginTransfer()
        {
            if (upperStarts >= 1 + spec.UpperStageRestartsCount)
            { Finish(MissionOutcome.Failure, "no_restart_available", Slots.UpperStageEngine); return true; }
            if (RollOnce("burn_transfer")) return true;
            var id = setup.Contract.Id;
            var apoapsisRadiusM = id == "C5" ? body.RadiusM + GeoTransferApogeeM : LunarDistanceM;
            var needed = TransferDeltaVMs(apoapsisRadiusM);
            var available = AvailableDeltaVMs();
            metrics["transfer_dv_required_m_s"] = needed; metrics["transfer_dv_available_m_s"] = available;
            var applied = Math.Min(needed, available);
            if (applied < needed - 1e-6 && id != "C5")
            { Finish(MissionOutcome.Failure, "insufficient_delta_v", Slots.UpperStageEngine); return true; }
            upperStarts++;
            var speed = state.SpeedMs;
            var massAfter = state.MassKg * Math.Exp(-applied / (CurrentEngine.IspVacS * PhysicalConstants.StandardGravityMs2));
            state = new FlightState(state.PositionXM, state.PositionYM,
                state.VelocityXMs * (1 + applied / speed), state.VelocityYMs * (1 + applied / speed), massAfter);
            Emit("transfer_burn", id);
            transferActive = true; // impulsive: no elapsed time (disclosed)
            if (id == "C5") return false; // coast to apoapsis under Kepler propagation, warpable
            return CinematicCoast(id);
        }

        /// <summary>C5: coast on the transfer ellipse; deploy the payload at apoapsis.</summary>
        private bool TransferCoast()
        {
            if (setup.Contract.Id != "C5") return false;
            var radial = RadialMs;
            if (transferRadialSign == 0) transferRadialSign = radial >= 0 ? 1 : -1;
            if (radial > 0) return false; // still climbing: wait for apoapsis
            if (RollOnce("deployment")) return true;
            metrics["payload_deployed"] = failures.DeploymentFailed ? 0 : 1;
            metrics["apogee_km"] = (OrbitalMechanics.Elements(state, body.MuM3S2).ApoapsisRadiusM - body.RadiusM) / 1000;
            transferActive = false;
            Finish(MissionOutcome.Success);
            return true;
        }

        /// <summary>C6 and C7: scripted cinematic coast (disclosed), then the entry interface (F10).</summary>
        private bool CinematicCoast(string id)
        {
            transferActive = false;
            var cruiseS = id == "C7" ? MarsCruiseS : LunarFlybyCruiseS;
            elapsedS += cruiseS;
            Emit("cinematic_coast", id == "C7" ? "mars_cruise" : "lunar_flyby");
            if (id == "C6") metrics["lunar_flyby_completed"] = 1;
            metrics["payload_deployed"] = id == "C7" ? 0 : metrics["payload_deployed"];
            BeginEntryAfterCruise(id);
            return Result != null;
        }
    }
}
