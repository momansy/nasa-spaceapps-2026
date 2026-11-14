using System;

namespace MissionForge.Core.Flight.Mission
{
    public sealed partial class MissionSim
    {
        private bool circularizePrompted;
        private bool HasAid(string aid) => setup.Assists?.HasAid(setup.AssistLevelId, aid) == true;

        /// <summary>Game_value closed-loop gravity-turn pitch target, radians above local horizontal.</summary>
        private double GuidancePitchRad()
        {
            if (!lifted || AltitudeM < 1000) return Math.PI / 2;
            var radius = state.RadiusM;
            var tangent = (state.PositionXM * state.VelocityYMs - state.PositionYM * state.VelocityXMs) / radius;
            var acceleration = Stage.Engine.ThrustN(body.PressureRatioUnitless(AltitudeM)) / state.MassKg;
            var desiredVertical = Math.Max(-50, Math.Min(500, (setup.TargetOrbitAltitudeM - AltitudeM) / 80));
            var desiredAcceleration = (desiredVertical - RadialMs) / 20 + body.GravityMs2(radius) - tangent * tangent / radius;
            return Math.Asin(Math.Max(-0.2, Math.Min(1, desiredAcceleration / Math.Max(0.01, acceleration))));
        }

        private PilotInput AssistedInput(PilotInput input)
        {
            var full = setup.FullAutopilot;
            var c = input.Main;
            var copy = new CraftInput { ThrottleFraction = c.ThrottleFraction, PitchRad = c.PitchRad,
                Attitude = c.Attitude, Stage = c.Stage, Cutoff = c.Cutoff, Deploy = c.Deploy, Rcs = c.Rcs, AbortId = c.AbortId };
            if (full || HasAid("autopilot_gravity_turn")) copy.PitchRad = GuidancePitchRad();
            if (full)
            {
                copy.ThrottleFraction = 1;
                if (phase == "F4") copy.ThrottleFraction = 0.8; // game_value throttle bucket
                copy.Stage = PropellantKg < 0.001;
                copy.Deploy = phase == "F6" || phase == "F8";
                if (setup.Contract.Id == "C0" && lifted)
                {
                    var ballisticApogeeM = AltitudeM + Math.Max(0, RadialMs) * Math.Max(0, RadialMs)
                        / (2 * body.GravityMs2(state.RadiusM));
                    if (ballisticApogeeM >= 105_000) // game_value margin above the 100 km contract gate
                    { copy.ThrottleFraction = 0; copy.Cutoff = true; }
                    copy.Stage = false; copy.Deploy = false;
                }
            }
            if (phase == "F7" && (full || HasAid("auto_circularize_with_prompt")))
            {
                if (!circularizePrompted) { circularizePrompted = true; Emit("guidance_prompt", "auto_circularize"); }
                var elements = OrbitalMechanics.Elements(state, body.MuM3S2);
                var targetPeriapsisM = setup.TargetOrbitAltitudeM - 10000; // game_value insertion tolerance
                if (elements.PeriapsisRadiusM - body.RadiusM >= targetPeriapsisM)
                { copy.ThrottleFraction = 0; copy.Cutoff = true; }
                else
                {
                    // game_value closed-loop insertion controller: command radial velocity toward
                    // target altitude while converging tangential speed on the local circular speed.
                    var radiusM = state.RadiusM;
                    var tangentialMs = (state.PositionXM * state.VelocityYMs - state.PositionYM * state.VelocityXMs) / radiusM;
                    var circularMs = OrbitalMechanics.CircularSpeedMs(body.MuM3S2, radiusM);
                    var targetRadialMs = Math.Max(-200, Math.Min(200,
                        (setup.TargetOrbitAltitudeM - AltitudeM) / 40));
                    var radialAccelerationMs2 = (targetRadialMs - RadialMs) / 12
                        + body.GravityMs2(radiusM) - tangentialMs * tangentialMs / radiusM;
                    var tangentialAccelerationMs2 = Math.Max(-20, Math.Min(20,
                        (circularMs - tangentialMs) / 20));
                    var requestedAccelerationMs2 = Math.Sqrt(radialAccelerationMs2 * radialAccelerationMs2
                        + tangentialAccelerationMs2 * tangentialAccelerationMs2);
                    var availableAccelerationMs2 = Stage.Engine.ThrustN(body.PressureRatioUnitless(AltitudeM)) / state.MassKg;
                    copy.PitchRad = Math.Atan2(radialAccelerationMs2, tangentialAccelerationMs2);
                    copy.ThrottleFraction = Math.Max(0.02, Math.Min(1, requestedAccelerationMs2 / availableAccelerationMs2));
                    copy.Cutoff = false; copy.Attitude = AttitudeMode.Manual;
                }
            }
            if (phase == "F8") copy.ThrottleFraction = 0;
            return new PilotInput { Main = copy, Booster = input.Booster, MinigameActive = input.MinigameActive,
                RequestedWarpFactor = input.RequestedWarpFactor };
        }
    }
}
