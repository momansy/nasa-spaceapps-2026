using System.Collections.Generic;
using MissionForge.Screens.BuildBay;
using MissionForge.Vehicle;
using UnityEngine;

namespace MissionForge.Screens.Flight
{
    /// <summary>
    /// The voted vehicle in flight, assembled by T015's <see cref="VehicleAssembler"/> on the world's vehicle anchor and
    /// posed every frame from the feed (interpolated between the last two Core steps). Plumes start exactly at every
    /// <c>NozzleExit</c>. Separated stages and fairing halves become display-only debris: they drift back with the
    /// vehicle's felt acceleration and tumble; nothing here feeds back into the simulation.
    /// </summary>
    public sealed class FlightVehicleView : MonoBehaviour
    {
        // game_value display choices.
        private const float SeparationSpeedMs = 2.5f;
        private const float DebrisLifetimeS = 30f;
        private const float FairingOpenSeconds = 1.6f;
        private const float FairingOpenDeg = 70f;
        private const float CollarMachLo = 0.9f, CollarMachHi = 1.1f; // condensation collar window (design brief)
        private const float CollarMaxAltitudeM = 18000f;
        private const float StandardGravity = 9.80665f; // physical

        [SerializeField] private KitLibrary library;
        [SerializeField] private FlightWorld world;

        private VehicleRig _rig;
        private Transform _pivot;
        private readonly List<(EnginePlume plume, int stage)> _plumes = new List<(EnginePlume, int)>();
        private readonly List<Debris> _debris = new List<Debris>();
        private ParticleSystem _collar, _vent, _padCloud;
        private Light _engineLight;
        private int _stageShown;
        private bool _fairingShown = true;
        private bool _liftOffSeen;
        private float _radiusM = 1.8f;

        public VehicleRig Rig => _rig;
        public Transform Pivot => _pivot;
        public float LengthM => _rig != null ? _rig.LengthM : 30f;

        /// <summary>Point on the vehicle axis at fraction <paramref name="f"/> of its length (0 = base), world space.</summary>
        public Vector3 AxisPoint(float f) => _pivot != null ? _pivot.TransformPoint(0f, LengthM * f, 0f) : transform.position;

        public void Configure(KitLibrary kitLibrary, FlightWorld flightWorld)
        {
            library = kitLibrary;
            world = flightWorld;
        }

        /// <summary>Builds the vehicle for the session build and restores separations already flown.</summary>
        public bool Build()
        {
            if (_rig != null) return true;
            if (FlightSession.Build == null || FlightSession.Catalog == null || library == null)
            {
                Debug.LogError("[MissionForge] Flight: cannot assemble the vehicle (no build, catalog or kit library).");
                return false;
            }
            _pivot = new GameObject("VehiclePivot").transform;
            _pivot.SetParent(transform, false);
            _rig = VehicleAssembler.Build(FlightSession.Build, FlightSession.Catalog, library, _pivot);
            Bounds b = VehicleAssembler.RendererBounds(_rig.Root);
            _radiusM = Mathf.Max(0.8f, Mathf.Max(b.extents.x, b.extents.z));
            if (world != null && world.Environment != null)
            {
                LaunchPadRig pad = world.Environment.GetComponentInChildren<LaunchPadRig>(true);
                if (pad != null) pad.FitVehicle(_rig.LengthM, _radiusM, true);
            }
            CreatePlumes();
            CreateAtmosphereEffects();
            CreateEngineLight();
            FlightTelemetry t = FlightSession.Feed?.Current;
            if (t != null)
            {
                for (int i = 0; i < t.stageIndex; i++) Drop(i, animate: false);
                _stageShown = t.stageIndex;
                if (t.fairingJettisoned) JettisonFairing(animate: false);
                _liftOffSeen = t.IsLifted;
            }
            return true;
        }

        private void CreatePlumes()
        {
            for (int s = 0; s < _rig.Stages.Count; s++)
            {
                foreach (EngineRig e in _rig.Stages[s].Engines) AddPlume(e.Root, e.NozzleExit, s);
            }
            foreach (BoosterRig b in _rig.Boosters) AddPlume(b.Root, b.NozzleExit, 0);
        }

        private void AddPlume(Transform engineRoot, Transform nozzle, int stage)
        {
            if (nozzle == null) return;
            Bounds eb = VehicleAssembler.RendererBounds(engineRoot != null ? engineRoot : nozzle);
            float bell = Mathf.Clamp(Mathf.Min(eb.size.x, eb.size.z) * 0.9f, 0.3f, 4f);
            var go = new GameObject("Plume");
            go.transform.SetParent(nozzle, false);
            go.transform.localPosition = Vector3.zero;
            go.transform.rotation = Quaternion.LookRotation(-_pivot.up, _pivot.forward);
            var plume = go.AddComponent<EnginePlume>();
            plume.Init(bell);
            _plumes.Add((plume, stage));
        }

        /// <summary>
        /// Warm light from the engine bay, scaled by throttle (plume glow on the stage, game_value 3400 K-ish, range 60 m).
        /// It also keeps one additional light on the vehicle at every altitude: once the pad's floodlights are out of
        /// range, URP would switch the vehicle to its no-additional-lights URP/Lit variant, which player builds strip
        /// (the vehicle then drew nothing above about 9 km; T016 evidence runs 6–7).
        /// </summary>
        private void CreateEngineLight()
        {
            var go = new GameObject("EngineGlow");
            go.transform.SetParent(_pivot, false);
            go.transform.localPosition = new Vector3(0f, -2f, 0f);
            _engineLight = go.AddComponent<Light>();
            _engineLight.type = LightType.Point;
            _engineLight.color = new Color(1f, 0.62f, 0.32f);
            _engineLight.range = 60f;
            _engineLight.shadows = LightShadows.None;
            _engineLight.intensity = 0.05f;
        }

        private void CreateAtmosphereEffects()
        {
            // Condensation collar: a ring of vapour just aft of the widest point, Mach 0.9–1.1 below 18 km (game_value).
            _collar = FlightVfx.Create("CondensationCollar", _pivot, FlightVfx.VapourMaterial, ParticleSystemSimulationSpace.Local, 300);
            _collar.transform.localPosition = new Vector3(0f, LengthM * 0.62f, 0f);
            _collar.transform.localRotation = Quaternion.Euler(90f, 0f, 0f);
            ParticleSystem.MainModule cm = _collar.main;
            cm.startLifetime = 0.35f;
            cm.startSpeed = 2f;
            cm.startSize = _radiusM * 1.3f;
            cm.startColor = new Color(0.92f, 0.95f, 1f, 0.42f);
            ParticleSystem.ShapeModule cs = _collar.shape;
            cs.shapeType = ParticleSystemShapeType.Circle;
            cs.radius = _radiusM * 1.15f;
            cs.radiusThickness = 0.1f;
            ParticleSystem.EmissionModule ce = _collar.emission;
            ce.rateOverTime = 0f;
            _collar.Play();

            // Propellant-loading vent: cold LOX vapour spilling from the upper stage and the first-stage tank top.
            _vent = FlightVfx.Create("LoxVent", _pivot, FlightVfx.VapourMaterial, ParticleSystemSimulationSpace.World, 500);
            _vent.transform.localPosition = new Vector3(0f, LengthM * 0.5f, 0f);
            ParticleSystem.MainModule vm = _vent.main;
            vm.startLifetime = new ParticleSystem.MinMaxCurve(3f, 5f);
            vm.startSpeed = new ParticleSystem.MinMaxCurve(0.6f, 1.6f);
            vm.startSize = new ParticleSystem.MinMaxCurve(_radiusM * 0.9f, _radiusM * 2.2f);
            vm.startColor = new Color(0.9f, 0.93f, 0.97f, 0.22f);
            vm.gravityModifier = 0.035f; // cold vapour is denser than air and sinks (game_value)
            ParticleSystem.ShapeModule vs = _vent.shape;
            vs.shapeType = ParticleSystemShapeType.Cone;
            vs.angle = 70f;
            vs.radius = _radiusM;
            vs.rotation = new Vector3(90f, 0f, 0f);
            ParticleSystem.SizeOverLifetimeModule vsz = _vent.sizeOverLifetime;
            vsz.enabled = true;
            vsz.size = new ParticleSystem.MinMaxCurve(1f, AnimationCurve.Linear(0, 0.6f, 1, 2.4f));
            ParticleSystem.ColorOverLifetimeModule vc = _vent.colorOverLifetime;
            vc.enabled = true;
            vc.color = FlightVfx.Fade(new Color(1f, 1f, 1f, 0.35f), new Color(1f, 1f, 1f, 0.25f), new Color(1f, 1f, 1f, 0f), 0.3f);

            // Pad exhaust cloud: billows sideways out of the flame trench at lift-off, stays on the ground.
            Transform padParent = world != null && world.Environment != null ? world.Environment : transform;
            _padCloud = FlightVfx.Create("PadExhaust", padParent, FlightVfx.SmokeMaterial, ParticleSystemSimulationSpace.World, 700);
            _padCloud.transform.position = transform.position + Vector3.down * 6f;
            ParticleSystem.MainModule pm = _padCloud.main;
            pm.startLifetime = new ParticleSystem.MinMaxCurve(6f, 10f);
            pm.startSpeed = new ParticleSystem.MinMaxCurve(8f, 22f);
            pm.startSize = new ParticleSystem.MinMaxCurve(8f, 18f);
            pm.startColor = new Color(0.82f, 0.8f, 0.78f, 0.55f);
            ParticleSystem.ShapeModule ps = _padCloud.shape;
            ps.shapeType = ParticleSystemShapeType.Cone;
            ps.angle = 85f;
            ps.radius = 4f;
            ps.rotation = new Vector3(-90f, 0f, 0f);
            ParticleSystem.LimitVelocityOverLifetimeModule lv = _padCloud.limitVelocityOverLifetime;
            lv.enabled = true;
            lv.limit = 3f;
            lv.dampen = 0.08f;
            ParticleSystem.SizeOverLifetimeModule psz = _padCloud.sizeOverLifetime;
            psz.enabled = true;
            psz.size = new ParticleSystem.MinMaxCurve(1f, AnimationCurve.Linear(0, 0.5f, 1, 3f));
            ParticleSystem.ColorOverLifetimeModule pc = _padCloud.colorOverLifetime;
            pc.enabled = true;
            pc.color = FlightVfx.Fade(new Color(1f, 0.85f, 0.7f, 0.7f), new Color(0.85f, 0.83f, 0.8f, 0.5f), new Color(0.7f, 0.7f, 0.72f, 0f), 0.2f);
        }

        private void LateUpdate()
        {
            IFlightFeed feed = FlightSession.Feed;
            if (feed == null || _rig == null) return;
            FlightTelemetry a = feed.Previous ?? feed.Current, c = feed.Current;
            float k = FlightSession.Alpha;
            double alt = Lerp(a.altitudeM, c.altitudeM, k);
            double downAngle = Lerp(a.groundAngleRad, c.groundAngleRad, k);
            double downrangeM = downAngle * MissionForge.Core.Flight.Body.Earth.RadiusM;
            double pitch = LerpAngle(a.pitchRad, c.pitchRad, k);
            if (world != null) world.SetDisplacement(alt, downrangeM);

            // Tilt from vertical toward downrange; local vertical has turned by the downrange angle (curvature).
            float tiltDeg = (float)((System.Math.PI / 2 - pitch + downAngle) * 180 / System.Math.PI);
            _pivot.localRotation = Quaternion.AngleAxis(-tiltDeg, Vector3.forward);

            if (c.stageIndex > _stageShown)
            {
                for (int i = _stageShown; i < c.stageIndex; i++) Drop(i, animate: true);
                _stageShown = c.stageIndex;
            }
            if (c.fairingJettisoned && _fairingShown) JettisonFairing(animate: true);

            float pr = (float)c.pressureRatio;
            foreach ((EnginePlume plume, int stage) in _plumes)
            {
                if (plume == null) continue;
                bool firing = stage == c.stageIndex && !c.missionEnded;
                plume.Apply(firing ? (float)c.throttle01 : 0f, pr);
            }
            UpdateAtmosphere(c);
            UpdateDebris(c);
            // Never fully off (see CreateEngineLight); bright while the engines burn.
            if (_engineLight != null) _engineLight.intensity = 0.05f + 6f * (float)c.throttle01;
        }

        private void UpdateAtmosphere(FlightTelemetry c)
        {
            float collar = c.altitudeM < CollarMaxAltitudeM ? FlightVfx.Window((float)c.mach, CollarMachLo, CollarMachHi) : 0f;
            ParticleSystem.EmissionModule ce = _collar.emission;
            ce.rateOverTime = collar * (FlightVfx.Reduced ? 120f : 420f);

            bool loading = c.phase == "F0" || c.phase == "F1" || c.phase == "F2";
            if (loading && !_vent.isEmitting) _vent.Play();
            if (!loading && _vent.isEmitting) _vent.Stop();
            ParticleSystem.EmissionModule ve = _vent.emission;
            ve.rateOverTime = FlightVfx.Reduced ? 18f : 45f;

            bool cloud = c.throttle01 > 0.05 && c.altitudeM < 400 && !FlightVfx.Reduced;
            if (cloud && !_padCloud.isEmitting) _padCloud.Play();
            if (!cloud && _padCloud.isEmitting) _padCloud.Stop();
            ParticleSystem.EmissionModule pe = _padCloud.emission;
            pe.rateOverTime = 70f * (float)c.throttle01;
            if (c.IsLifted) _liftOffSeen = true;
        }

        private void Drop(int stageIndex, bool animate)
        {
            if (stageIndex >= _rig.Stages.Count) return;
            var parts = new List<Transform> { _rig.Stages[stageIndex].Root };
            if (stageIndex == 0)
            {
                foreach (BoosterRig b in _rig.Boosters) parts.Add(b.Root);
                if (_rig.Interstage != null) parts.Add(_rig.Interstage);
            }
            foreach (Transform p in parts)
            {
                if (p == null) continue;
                if (!animate) { p.gameObject.SetActive(false); continue; }
                StopPlumesUnder(p);
                p.SetParent(transform, true);
                Vector3 spin = new Vector3(Random.Range(-6f, 6f), Random.Range(-3f, 3f), Random.Range(-6f, 6f));
                _debris.Add(new Debris(p, -_pivot.up * SeparationSpeedMs, spin));
            }
        }

        private void JettisonFairing(bool animate)
        {
            _fairingShown = false;
            foreach (FairingHalfRig half in _rig.FairingHalves)
            {
                if (half.Half == null) continue;
                if (!animate) { half.Half.gameObject.SetActive(false); continue; }
                Vector3 outward = Vector3.ProjectOnPlane(half.Half.position - _pivot.position, _pivot.up).normalized;
                if (outward.sqrMagnitude < 0.01f) outward = _pivot.right;
                Vector3 axis = half.Hinge != null ? Vector3.Cross(_pivot.up, outward) : _pivot.forward;
                half.Half.SetParent(transform, true);
                _debris.Add(new Debris(half.Half, outward * 3f - _pivot.up * 1f, Vector3.zero)
                    { Hinge = half.Hinge != null ? half.Hinge.position : half.Half.position, HingeAxis = axis });
            }
            if (_rig.FairingHalves.Count == 0 && _rig.Fairing != null)
            {
                if (!animate) _rig.Fairing.gameObject.SetActive(false);
                else { _rig.Fairing.SetParent(transform, true); _debris.Add(new Debris(_rig.Fairing, _pivot.right * 3f, new Vector3(4, 0, 8))); }
            }
        }

        private void UpdateDebris(FlightTelemetry c)
        {
            float dt = Time.deltaTime * (float)(FlightSession.IsRunning ? FlightSession.PlaybackRate * (c.warp < 1 ? c.warp : 1) : 0f);
            // The vehicle keeps accelerating at its felt g-load; in the vehicle-centred frame the debris falls back.
            Vector3 relativeAccel = -_pivot.up * (float)(c.gLoad * StandardGravity);
            for (int i = _debris.Count - 1; i >= 0; i--)
            {
                Debris d = _debris[i];
                if (d.Part == null) { _debris.RemoveAt(i); continue; }
                d.Age += dt;
                if (d.HingeAxis != Vector3.zero && d.Age < FairingOpenSeconds)
                {
                    float step = FairingOpenDeg / FairingOpenSeconds * dt;
                    d.Part.RotateAround(d.Hinge, d.HingeAxis, step);
                }
                else
                {
                    d.Velocity += relativeAccel * dt;
                    d.Part.position += d.Velocity * dt;
                    d.Part.Rotate(d.Spin * dt, Space.World);
                }
                if (d.Age > DebrisLifetimeS) { Destroy(d.Part.gameObject); _debris.RemoveAt(i); }
            }
        }

        private void StopPlumesUnder(Transform root)
        {
            foreach (EnginePlume p in root.GetComponentsInChildren<EnginePlume>(true)) p.Apply(0f, 0f);
            for (int i = _plumes.Count - 1; i >= 0; i--)
                if (_plumes[i].plume != null && _plumes[i].plume.transform.IsChildOf(root)) _plumes.RemoveAt(i);
        }

        private static double Lerp(double a, double b, float k) => a + (b - a) * k;

        private static double LerpAngle(double a, double b, float k) => a + (b - a) * k;

        private sealed class Debris
        {
            public Debris(Transform part, Vector3 velocity, Vector3 spin) { Part = part; Velocity = velocity; Spin = spin; }
            public Transform Part;
            public Vector3 Velocity;
            public Vector3 Spin;
            public float Age;
            public Vector3 Hinge;
            public Vector3 HingeAxis;
        }
    }
}
