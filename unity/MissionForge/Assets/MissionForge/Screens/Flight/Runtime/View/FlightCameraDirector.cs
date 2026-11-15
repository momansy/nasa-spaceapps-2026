using Unity.Cinemachine;
using UnityEngine;
using UnityEngine.InputSystem;

namespace MissionForge.Screens.Flight
{
    /// <summary>Camera shots of the flight (brief step 4, reduced set).</summary>
    public enum FlightShot { Pad, Telescope, Chase, Onboard }

    /// <summary>
    /// Poses the screen's Cinemachine vantage every frame. Shots: pad cam (on the ground, low, looks up), tracking
    /// telescope (2.4 km off the pad, 100 mm-equivalent long lens), chase and onboard (engine-bell view along the
    /// stage). Cuts follow events (lift-off, Max Q, staging, orbit) unless the operator pressed C to pick a shot.
    /// Every offset and focal length here is an art-direction game_value.
    /// </summary>
    public sealed class FlightCameraDirector : MonoBehaviour
    {
        /// <summary>Vertical field of view of a 100 mm lens on a 24 mm-tall full-frame sensor, degrees.</summary>
        public const float TelescopeFovDeg = 13.7f;
        public const float WideFovDeg = 42f;
        private const float PadShotAfterLiftOffS = 9f;

        [SerializeField] private CinemachineCamera vantage;
        [SerializeField] private FlightWorld world;

        private FlightShot _shot = FlightShot.Pad;
        private bool _operatorOverride;
        private double _cutAtMet = double.NegativeInfinity;
        private FlightShot _pending = FlightShot.Pad;

        public FlightShot Shot => _shot;

        public void Configure(CinemachineCamera camera, FlightWorld flightWorld)
        {
            vantage = camera;
            world = flightWorld;
        }

        private void OnEnable() => FlightSession.EventRaised += OnEvent;
        private void OnDisable() => FlightSession.EventRaised -= OnEvent;

        /// <summary>Operator choice; also used by evidence captures.</summary>
        public void SetShot(FlightShot shot, bool asOperator = true)
        {
            _shot = shot;
            _operatorOverride |= asOperator;
        }

        private void OnEvent(FlightTelemetryEvent e, FlightTelemetry t)
        {
            if (_operatorOverride) return;
            switch (e.kind)
            {
                case FlightEventKind.LiftOff: _pending = FlightShot.Telescope; _cutAtMet = t.metS + PadShotAfterLiftOffS; break;
                case FlightEventKind.MaxQ: _pending = FlightShot.Chase; _cutAtMet = t.metS; break;
                case FlightEventKind.Staging: _shot = FlightShot.Onboard; _pending = FlightShot.Chase; _cutAtMet = t.metS + 10; break;
                case FlightEventKind.Orbit: _pending = FlightShot.Chase; _cutAtMet = t.metS; break;
            }
        }

        private void LateUpdate()
        {
            Keyboard kb = Keyboard.current;
            if (kb != null && kb.cKey.wasPressedThisFrame) SetShot((FlightShot)(((int)_shot + 1) % 4));
            FlightTelemetry t = FlightSession.Feed?.Current;
            FlightVehicleView v = world != null ? world.Vehicle : null;
            if (vantage == null || t == null || v == null || v.Pivot == null) return;
            if (!_operatorOverride && t.metS >= _cutAtMet && _pending != _shot) _shot = _pending;
            if (!_operatorOverride && _shot == FlightShot.Telescope && t.altitudeM > 30000) _shot = FlightShot.Chase;

            Vector3 mid = v.AxisPoint(0.5f);
            float len = v.LengthM;
            Vector3 pos;
            Vector3 look;
            float fov = WideFovDeg;
            switch (_shot)
            {
                case FlightShot.Pad:
                    // Fixed on the ground 70 m from the pad, at eye height: rises with the ground as the vehicle climbs.
                    pos = world.PadPoint + new Vector3(-38f, -6f, -58f);
                    look = t.IsLifted ? v.AxisPoint(0.35f) : v.AxisPoint(0.55f);
                    fov = t.IsLifted ? Mathf.Lerp(48f, 22f, Mathf.InverseLerp(0f, 600f, (float)t.altitudeM)) : 48f;
                    break;
                case FlightShot.Telescope:
                    pos = world.PadPoint + new Vector3(-900f, 4f, -2200f);
                    look = mid;
                    float dist = Vector3.Distance(pos, look);
                    // Keep the vehicle about a third of the frame height (long lens, narrowing as it climbs).
                    fov = Mathf.Clamp(2f * Mathf.Atan(len * 1.6f / dist) * Mathf.Rad2Deg, 2.5f, TelescopeFovDeg);
                    break;
                case FlightShot.Onboard:
                    pos = v.AxisPoint(0.9f) + v.Pivot.forward * -2.6f + v.Pivot.right * 0.6f;
                    look = v.AxisPoint(-0.4f);
                    fov = 62f;
                    break;
                default:
                    pos = mid + v.Pivot.right * (-len * 0.7f) + v.Pivot.forward * (-len * 2.3f) + v.Pivot.up * (-len * 0.35f);
                    look = v.AxisPoint(0.55f);
                    fov = 38f;
                    break;
            }
            vantage.transform.SetPositionAndRotation(pos, Quaternion.LookRotation(look - pos, Vector3.up));
            LensSettings lens = vantage.Lens;
            lens.FieldOfView = fov;
            lens.NearClipPlane = _shot == FlightShot.Onboard ? 0.1f : 0.5f;
            lens.FarClipPlane = 40000f;
            vantage.Lens = lens;
        }
    }
}
