using System;
using System.Collections.Generic;
using MissionForge.Core.Data;

namespace MissionForge.Core.Flight.Mission
{
    /// <summary>
    /// Aborts (design 9.8). Physical: vis-viva circularisation and deorbit Δv. Game simplifications: the
    /// escape-system outcomes (pad and ascent abort) are scripted safe splashdowns, not simulated descents;
    /// envelope limits, the 150 km minimum abort orbit and the return-to-launch Δv margin are game_value.
    /// </summary>
    public sealed partial class MissionSim
    {
        public const double LowAltitudeEnvelopeM = 5000;
        public const double TowerJettisonMetS = 150;
        public const double AbortToOrbitMinApoapsisM = 150000;
        public const double ReturnToLaunchSiteDeltaVMarginMs = 300;
        private readonly HashSet<string> announcedAborts = new HashSet<string>(StringComparer.Ordinal);
        private bool towerJettisoned;
        private string? degradedReason;

        private bool HasEscapeSystem => spec.EscapeSystemKind.Length > 0 && !towerJettisoned;

        private bool EscapeInEnvelope()
        {
            if (!HasEscapeSystem) return false;
            switch (spec.EscapeEnvelope)
            {
                case "low_altitude": return AltitudeM <= LowAltitudeEnvelopeM;
                case "orbit": return true;
                default: return MetS <= TowerJettisonMetS; // upper_atmosphere: tower flies until it is jettisoned
            }
        }

        private static bool Has(IReadOnlyList<string> list, string value)
        { for (var i = 0; i < list.Count; i++) if (list[i] == value) return true; return false; }
        private bool PhaseListed(AbortModeDef mode) => Has(mode.Phases, phase);

        private bool RequirementsMet(AbortModeDef mode)
        {
            foreach (var requirement in mode.Requirements)
            {
                switch (requirement)
                {
                    case "escape_system": if (!HasEscapeSystem) return false; break;
                    case "escape_system_in_envelope": if (!EscapeInEnvelope()) return false; break;
                    case "delta_v_for_lower_orbit": if (!HasLowerOrbitDeltaV()) return false; break;
                    case "recoverable_vehicle": if (spec.RecoveryKind == "brec_expendable") return false; break;
                    case "delta_v_to_turn_back": if (AvailableDeltaVMs() < Math.Abs(TangentialMs()) + ReturnToLaunchSiteDeltaVMarginMs) return false; break;
                    case "deorbit_delta_v": if (!setup.Contract.Returning || AvailableDeltaVMs() < DeorbitDeltaVMs()) return false; break;
                    default: return false; // an unknown requirement is never silently satisfied
                }
            }
            return true;
        }

        private double TangentialMs() =>
            (state.PositionXM * state.VelocityYMs - state.PositionYM * state.VelocityXMs) / state.RadiusM;

        private double CircularizeDeltaVMs(out double apoapsisAltitudeM)
        {
            var e = OrbitalMechanics.Elements(state, body.MuM3S2);
            apoapsisAltitudeM = e.ApoapsisRadiusM - body.RadiusM;
            if (double.IsInfinity(e.ApoapsisRadiusM) || e.SemiMajorAxisM <= 0) return double.PositiveInfinity;
            var vApo = Math.Sqrt(body.MuM3S2 * (2 / e.ApoapsisRadiusM - 1 / e.SemiMajorAxisM));
            return OrbitalMechanics.CircularSpeedMs(body.MuM3S2, e.ApoapsisRadiusM) - vApo;
        }
        private bool HasLowerOrbitDeltaV()
        {
            var dv = CircularizeDeltaVMs(out var apo);
            return apo >= AbortToOrbitMinApoapsisM && dv <= AvailableDeltaVMs();
        }
        private double DeorbitDeltaVMs()
        {
            var r = state.RadiusM; var rp = body.RadiusM + DeorbitTargetPeriapsisM;
            var tangent = Math.Abs(TangentialMs());
            var target = Math.Sqrt(body.MuM3S2 * (2 / r - 2 / (r + rp)));
            return Math.Max(0, tangent - target);
        }

        /// <summary>Abort IDs the pilot may call now: phase listed and every requirement met (design 9.8).</summary>
        public IReadOnlyList<string> AvailableAborts()
        {
            var result = new List<string>();
            if (Result != null || setup.Aborts == null) return result;
            foreach (var mode in setup.Aborts.Modes)
                if (PhaseListed(mode) && (!mode.RequiresEscapeSystem || HasEscapeSystem) && RequirementsMet(mode))
                    result.Add(mode.Id);
            return result;
        }

        private void AnnounceAborts()
        {
            if (setup.Aborts == null || Result != null) return;
            foreach (var id in AvailableAborts())
                if (announcedAborts.Add(id)) Emit("abort_available", id);
        }

        /// <summary>Carries out an abort. Returns false (and changes nothing) when it is not available.</summary>
        public bool Abort(string id)
        {
            if (id == null) throw new ArgumentNullException(nameof(id));
            if (!Has(AvailableAborts(), id)) return false;
            // Emitted into the event list of the next Step; Abort itself runs between steps.
            Emit("abort", id);
            switch (id)
            {
                case "pad_abort": case "ascent_abort": SafeSplashdownAbort(id); break;
                case "abort_to_orbit": AbortToOrbit(); break;
                case "return_to_launch_site":
                    metrics["booster_recovered"] = 0; if (setup.Contract.Crewed) metrics["crew_safe"] = 1;
                    Finish(MissionOutcome.Failure, "return_to_launch_site", null, announce: false); break;
                case "early_return":
                    degradedReason = "early_return"; if (setup.Contract.Crewed) metrics["crew_safe"] = 1;
                    BeginReturn(); break;
            }
            return true;
        }

        private void SafeSplashdownAbort(string id)
        {
            if (setup.Contract.Crewed) metrics["crew_safe"] = 1;
            metrics["capsule_recovered"] = 1; // scripted safe splashdown (disclosed simplification)
            Finish(MissionOutcome.Failure, id, Slots.LaunchEscape, announce: false);
        }

        /// <summary>Impulsive circularisation at apoapsis; the mission can only finish as a partial success.</summary>
        private void AbortToOrbit()
        {
            var e = OrbitalMechanics.Elements(state, body.MuM3S2);
            var meanMotion = Math.Sqrt(body.MuM3S2 / (e.SemiMajorAxisM * e.SemiMajorAxisM * e.SemiMajorAxisM));
            var ecc = 2 * Math.Atan2(Math.Sqrt(1 - e.EccentricityUnitless) * Math.Sin(e.TrueAnomalyRad / 2),
                Math.Sqrt(1 + e.EccentricityUnitless) * Math.Cos(e.TrueAnomalyRad / 2));
            var mean = ecc - e.EccentricityUnitless * Math.Sin(ecc);
            mean = mean < 0 ? mean + 2 * Math.PI : mean;
            var toApoapsisS = mean <= Math.PI ? (Math.PI - mean) / meanMotion : (3 * Math.PI - mean) / meanMotion;
            var apoState = OrbitalMechanics.PropagateElliptic(state, body.MuM3S2, toApoapsisS);
            var dv = CircularizeDeltaVMs(out _);
            var speed = apoState.SpeedMs;
            var factor = OrbitalMechanics.CircularSpeedMs(body.MuM3S2, apoState.RadiusM) / speed;
            var mass = apoState.MassKg * Math.Exp(-Math.Abs(dv) / (CurrentEngine.IspVacS * PhysicalConstants.StandardGravityMs2));
            elapsedS += toApoapsisS;
            state = new FlightState(apoState.PositionXM, apoState.PositionYM, apoState.VelocityXMs * factor,
                apoState.VelocityYMs * factor, mass);
            degradedReason = "abort_to_orbit";
            if (!fairingDropped) { carriedJettisonKg = 0; fairingDropped = true; }
            Enter("F8");
        }

        /// <summary>The escape system fires by itself when the vehicle breaks up in its envelope.</summary>
        private bool TryAutomaticEscape(FailureRecord fatal)
        {
            if (!setup.Contract.Crewed) return false;
            if (!lifted && fatal.Checkpoint == "ignition")
            { // engine fails to start: abort on the pad, nobody leaves the ground
                Emit("abort", "pad_abort"); metrics["crew_safe"] = 1; return false;
            }
            if (!IsBreakup(fatal.Mode) || !EscapeInEnvelope() || !(phase == "F3" || phase == "F4" || phase == "F5")) return false;
            Emit("abort", "ascent_abort");
            metrics["crew_safe"] = 1; metrics["capsule_recovered"] = 1;
            return true;
        }
        private static bool IsBreakup(string mode) =>
            mode == "structural_failure" || mode == "booster_failure" || mode == "engine_shutdown" || mode == "pogo"
            || mode == "control_loss" || mode == "guidance_fault" || mode == "stage_recontact" || mode == "range_safety";
    }
}
