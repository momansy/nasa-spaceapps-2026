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
            }
            if (phase == "F7" && (full || HasAid("auto_circularize_with_prompt")))
            {
                if (!circularizePrompted) { circularizePrompted = true; Emit("guidance_prompt", "auto_circularize"); }
                copy.PitchRad = GuidancePitchRad();
                copy.ThrottleFraction = 1;
                var elements = OrbitalMechanics.Elements(state, body.MuM3S2);
                if (elements.PeriapsisRadiusM - body.RadiusM >= setup.TargetOrbitAltitudeM - 10000)
                { copy.ThrottleFraction = 0; copy.Cutoff = true; }
            }
            if (phase == "F8") copy.ThrottleFraction = 0;
            return new PilotInput { Main = copy, Booster = input.Booster, MinigameActive = input.MinigameActive,
                RequestedWarpFactor = input.RequestedWarpFactor };
        }
    }
}
