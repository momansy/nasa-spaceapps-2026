using System;
using System.Collections.Generic;
using System.Collections.ObjectModel;

namespace MissionForge.Core.Flight.Mission
{
    public sealed partial class MissionSim
    {
        /// <summary>Fresh immutable-by-caller view; no random draws or simulation advancement.</summary>
        public HudSnapshot Snapshot()
        {
            var elements = OrbitalMechanics.Elements(state, body.MuM3S2);
            double? apo = double.IsInfinity(elements.ApoapsisRadiusM) ? (double?)null
                : (elements.ApoapsisRadiusM - body.RadiusM) / 1000;
            double? peri = elements.PeriapsisRadiusM <= 0 ? (double?)null
                : (elements.PeriapsisRadiusM - body.RadiusM) / 1000;
            var qKpa = Aerodynamics.DynamicPressurePa(body.DensityKgM3(AltitudeM), AirSpeedMs) / 1000;
            var deltaV = new Dictionary<string, double>(StringComparer.Ordinal);
            double total = 0;
            for (var i = 0; i < spec.Stages.Count; i++)
            {
                var stage = spec.Stages[i];
                var dv = i < stageIndex ? 0 : i == stageIndex
                    ? stage.Engine.IspVacS * PhysicalConstants.StandardGravityMs2
                        * Math.Log(state.MassKg / (stage.FinalMassKg + carriedJettisonKg))
                    : stage.IdealDeltaVMs;
                deltaV.Add(stage.Id, Math.Max(0, dv)); total += Math.Max(0, dv);
            }
            var propPct = 100 * PropellantKg / Stage.PropellantMassKg;
            var channels = new Dictionary<string, IReadOnlyDictionary<string, double>>(StringComparer.Ordinal);
            channels["BOOSTER"] = Channel(("chamber_pressure_pct", throttleFraction * 100),
                ("engines_running", throttleFraction > 0 ? Stage.EngineCount : 0), ("engines_total", Stage.EngineCount),
                ("engine_health_pct", 100), ("prop_stage1_pct", stageSeparated ? 0 : propPct),
                ("prop_stage2_pct", stageSeparated ? propPct : 100), ("throttle_pct", throttleFraction * 100));
            channels["STRUCT"] = Channel(("q_kpa", qKpa), ("load_pct", qKpa * Math.Max(1, gLoad) / 1.2),
                ("g_load", gLoad), ("vibration_pct", 0));
            channels["GUIDO"] = Channel(("traj_error_km", (AltitudeM - setup.TargetOrbitAltitudeM) / 1000),
                ("pitch_error_deg", 0), ("heading_error_deg", 0));
            channels["FIDO"] = Channel(("apoapsis_km", apo ?? 0), ("periapsis_km", peri ?? 0),
                ("inclination_deg", InclinationDeg), ("window_remaining_s", Math.Max(0, setup.OrbitalOperationsDurationS - (elapsedS - phaseStartS))),
                ("dv_remaining_ms", total));
            channels["RETRO"] = Channel(("entry_angle_deg", EntryPhysics.FlightPathAngleRad(state) * 180 / Math.PI),
                ("heat_load_pct", 0), ("landing_ellipse_km", 0), ("descent_rate_ms", Math.Max(0, -RadialMs)), ("chutes_deployed", 0));
            return new HudSnapshot
            {
                TickCount = tick, Phase = phase, MetS = MetS, AltitudeKm = AltitudeM / 1000,
                VelocityMs = AltitudeM < 70000 ? AirSpeedMs : state.SpeedMs, VerticalSpeedMs = RadialMs,
                QKpa = qKpa, GLoad = gLoad, ThrottlePct = throttleFraction * 100, PropellantPct = propPct,
                DvRemainingMs = total, ApoapsisKm = apo, PeriapsisKm = peri, InclinationDeg = InclinationDeg,
                TargetPitchDeg = setup.FullAutopilot || HasAid("guidance_cue_on_hud") ? GuidancePitchRad() * 180 / Math.PI : (double?)null,
                StageDeltaVMs = new ReadOnlyDictionary<string, double>(deltaV),
                Channels = new ReadOnlyDictionary<string, IReadOnlyDictionary<string, double>>(channels)
            };
        }
        private static IReadOnlyDictionary<string, double> Channel(params (string key, double value)[] values)
        {
            var result = new Dictionary<string, double>(StringComparer.Ordinal);
            foreach (var pair in values) result.Add(pair.key, pair.value);
            return new ReadOnlyDictionary<string, double>(result);
        }
    }
}
