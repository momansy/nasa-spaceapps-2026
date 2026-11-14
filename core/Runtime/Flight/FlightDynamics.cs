using System;

namespace MissionForge.Core.Flight
{
    /// <summary>Constant controls held over one fixed physics step.</summary>
    public sealed class FlightControl
    {
        /// <summary>Creates controls from engine, throttle, inertial thrust direction and drag area.</summary>
        public FlightControl(EngineModel? engine, double throttleUnitless, double thrustDirectionXUnitless,
            double thrustDirectionYUnitless, double referenceAreaM2, double dryMassKg)
        {
            FlightGuard.Range(throttleUnitless, 0, 1, nameof(throttleUnitless));
            FlightGuard.Nonnegative(referenceAreaM2, nameof(referenceAreaM2));
            FlightGuard.Nonnegative(dryMassKg, nameof(dryMassKg));
            FlightGuard.Finite(thrustDirectionXUnitless, nameof(thrustDirectionXUnitless));
            FlightGuard.Finite(thrustDirectionYUnitless, nameof(thrustDirectionYUnitless));
            var magnitude = Math.Sqrt(thrustDirectionXUnitless * thrustDirectionXUnitless + thrustDirectionYUnitless * thrustDirectionYUnitless);
            if (throttleUnitless > 0 && engine == null) throw new ArgumentNullException(nameof(engine));
            if (throttleUnitless > 0) FlightGuard.Positive(magnitude, "thrustDirectionMagnitudeUnitless");
            Engine = engine;
            ThrottleUnitless = throttleUnitless;
            ThrustDirectionXUnitless = magnitude == 0 ? 0 : thrustDirectionXUnitless / magnitude;
            ThrustDirectionYUnitless = magnitude == 0 ? 0 : thrustDirectionYUnitless / magnitude;
            ReferenceAreaM2 = referenceAreaM2;
            DryMassKg = dryMassKg;
        }

        /// <summary>Engine model, null only for coast.</summary>
        public EngineModel? Engine { get; }
        /// <summary>Throttle fraction in [0,1].</summary>
        public double ThrottleUnitless { get; }
        /// <summary>Normalized inertial x thrust direction.</summary>
        public double ThrustDirectionXUnitless { get; }
        /// <summary>Normalized inertial y thrust direction.</summary>
        public double ThrustDirectionYUnitless { get; }
        /// <summary>Aerodynamic reference area in m².</summary>
        public double ReferenceAreaM2 { get; }
        /// <summary>Minimum dry mass in kg.</summary>
        public double DryMassKg { get; }
    }

    /// <summary>Gravity, rotating-atmosphere drag, thrust and propellant dynamics in a 2D inertial plane.</summary>
    public sealed class FlightDynamics
    {
        /// <summary>Creates dynamics around a spherical body.</summary>
        public FlightDynamics(Body body) => Body = body ?? throw new ArgumentNullException(nameof(body));

        /// <summary>Central body used by this dynamics model.</summary>
        public Body Body { get; }

        /// <summary>Returns the SI state derivative for a state and fixed control.</summary>
        public FlightDerivative Derivative(double timeS, FlightState state, FlightControl control)
        {
            FlightGuard.Finite(timeS, nameof(timeS));
            if (state == null) throw new ArgumentNullException(nameof(state));
            if (control == null) throw new ArgumentNullException(nameof(control));
            var radiusM = state.RadiusM;
            if (radiusM <= 0) throw new ArgumentOutOfRangeException(nameof(state));
            var gravityFactorS2 = -Body.MuM3S2 / (radiusM * radiusM * radiusM);
            var accelerationXMs2 = gravityFactorS2 * state.PositionXM;
            var accelerationYMs2 = gravityFactorS2 * state.PositionYM;

            var airVelocityXMs = -Body.RotationRateRadS * state.PositionYM;
            var airVelocityYMs = Body.RotationRateRadS * state.PositionXM;
            var relativeXMs = state.VelocityXMs - airVelocityXMs;
            var relativeYMs = state.VelocityYMs - airVelocityYMs;
            var airSpeedMs = Math.Sqrt(relativeXMs * relativeXMs + relativeYMs * relativeYMs);
            if (airSpeedMs > 0 && control.ReferenceAreaM2 > 0)
            {
                var densityKgM3 = Body.DensityKgM3(radiusM - Body.RadiusM);
                var cdUnitless = Aerodynamics.DragCoefficientUnitless(Body.MachUnitless(airSpeedMs));
                var dragN = Aerodynamics.DragN(densityKgM3, airSpeedMs, cdUnitless, control.ReferenceAreaM2);
                var dragAccelerationMs2 = dragN / state.MassKg;
                accelerationXMs2 -= dragAccelerationMs2 * relativeXMs / airSpeedMs;
                accelerationYMs2 -= dragAccelerationMs2 * relativeYMs / airSpeedMs;
            }

            var massRateKgS = 0.0;
            if (control.Engine != null && control.ThrottleUnitless > 0 && state.MassKg > control.DryMassKg)
            {
                var pressureRatio = Body.PressureRatioUnitless(radiusM - Body.RadiusM);
                var thrustN = control.Engine.ThrustN(pressureRatio) * control.ThrottleUnitless;
                accelerationXMs2 += thrustN * control.ThrustDirectionXUnitless / state.MassKg;
                accelerationYMs2 += thrustN * control.ThrustDirectionYUnitless / state.MassKg;
                massRateKgS = -control.Engine.MassFlowKgS(pressureRatio) * control.ThrottleUnitless;
            }

            return new FlightDerivative(state.VelocityXMs, state.VelocityYMs, accelerationXMs2, accelerationYMs2, massRateKgS);
        }

        /// <summary>Advances one deterministic 1/120 s RK4 step and clamps mass to dry mass in kg.</summary>
        public FlightState Step(FlightState state, double timeS, FlightControl control)
        {
            if (state == null) throw new ArgumentNullException(nameof(state));
            if (control == null) throw new ArgumentNullException(nameof(control));
            var effectiveControl = control;
            var propellantLimited = false;
            if (control.Engine != null && control.ThrottleUnitless > 0)
            {
                var availablePropellantKg = Math.Max(0, state.MassKg - control.DryMassKg);
                var maximumMassFlowKgS = Math.Max(control.Engine.MassFlowKgS(0), control.Engine.MassFlowKgS(1));
                var requestedBurnKg = maximumMassFlowKgS * control.ThrottleUnitless * Rk4Integrator.FixedStepS;
                if (requestedBurnKg > availablePropellantKg)
                {
                    propellantLimited = true;
                    var limitedThrottle = requestedBurnKg == 0 ? 0 : control.ThrottleUnitless * availablePropellantKg / requestedBurnKg;
                    effectiveControl = new FlightControl(control.Engine, limitedThrottle, control.ThrustDirectionXUnitless,
                        control.ThrustDirectionYUnitless, control.ReferenceAreaM2, control.DryMassKg);
                }
            }

            var next = Rk4Integrator.Step(state, timeS, (t, s) => Derivative(t, s, effectiveControl));
            if (propellantLimited)
                return new FlightState(next.PositionXM, next.PositionYM, next.VelocityXMs, next.VelocityYMs, control.DryMassKg);
            if (next.MassKg >= control.DryMassKg) return next;
            return new FlightState(next.PositionXM, next.PositionYM, next.VelocityXMs, next.VelocityYMs, control.DryMassKg);
        }
    }
}
