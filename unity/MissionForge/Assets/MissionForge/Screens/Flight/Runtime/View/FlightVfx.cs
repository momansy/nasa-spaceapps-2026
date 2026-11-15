using UnityEngine;

namespace MissionForge.Screens.Flight
{
    /// <summary>
    /// Built-in Particle System effects for the flight (WebGL first: no VFX Graph, no compute). Materials live in
    /// <c>Art/VFX/Resources/FlightVFX/</c> and use the analytic soft-sprite shader <c>MissionForge/VFX/Particle</c>.
    /// Every size, rate and colour here is an art-direction game_value; nothing feeds back into the simulation.
    /// </summary>
    public static class FlightVfx
    {
        public const string PlumeMaterial = "FlightVFX/MF_Plume";
        public const string CoreMaterial = "FlightVFX/MF_PlumeCore";
        public const string VapourMaterial = "FlightVFX/MF_Vapour";
        public const string SmokeMaterial = "FlightVFX/MF_Smoke";

        /// <summary>Reduced motion: fewer particles, no flashes (design 16).</summary>
        public static bool Reduced => MissionForge.UI.MfMotion.Reduced;

        public static ParticleSystem Create(string name, Transform parent, string material, ParticleSystemSimulationSpace space,
            int maxParticles)
        {
            var go = new GameObject(name);
            go.transform.SetParent(parent, false);
            var ps = go.AddComponent<ParticleSystem>();
            ps.Stop(true, ParticleSystemStopBehavior.StopEmittingAndClear);
            ParticleSystem.MainModule main = ps.main;
            main.playOnAwake = false;
            main.simulationSpace = space;
            main.maxParticles = maxParticles;
            main.scalingMode = ParticleSystemScalingMode.Hierarchy;
            var renderer = go.GetComponent<ParticleSystemRenderer>();
            Material m = Resources.Load<Material>(material);
            if (m != null) renderer.sharedMaterial = m;
            else Debug.LogWarning("[MissionForge] Flight VFX material missing: " + material);
            renderer.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
            renderer.receiveShadows = false;
            return ps;
        }

        public static Gradient Fade(Color start, Color mid, Color end, float midAt = 0.35f)
        {
            var g = new Gradient();
            g.SetKeys(
                new[] { new GradientColorKey(start, 0f), new GradientColorKey(mid, midAt), new GradientColorKey(end, 1f) },
                new[] { new GradientAlphaKey(start.a, 0f), new GradientAlphaKey(mid.a, midAt), new GradientAlphaKey(0f, 1f) });
            return g;
        }

        /// <summary>Smooth bump: 1 at the centre of [lo, hi], 0 outside (condensation-collar Mach window).</summary>
        public static float Window(float x, float lo, float hi)
        {
            if (x <= lo || x >= hi) return 0f;
            float t = (x - lo) / (hi - lo);
            return Mathf.Sin(t * Mathf.PI);
        }
    }

    /// <summary>
    /// Exhaust plume at one engine's nozzle exit. Width and length follow the ambient pressure ratio p/p0 from the
    /// feed (Core <c>Body.PressureRatioUnitless</c>): a tight, short, bright column at sea level that opens into a wide,
    /// long, faint bell in vacuum. Mach diamonds show while p/p0 &gt; 0.25 (low altitude, game_value).
    /// </summary>
    public sealed class EnginePlume : MonoBehaviour
    {
        // game_value art targets, in multiples of the bell exit diameter.
        private const float SeaLevelLengthBells = 6f, VacuumLengthBells = 18f;
        private const float SeaLevelConeDeg = 3f, VacuumConeDeg = 32f;
        private const float DiamondsMinPressureRatio = 0.25f;
        private const int Diamonds = 5;

        private ParticleSystem _flame, _core, _diamonds;
        private ParticleSystem.Particle[] _diamondBuffer;
        private float _bellM = 1f;
        private float _throttle;

        public void Init(float bellDiameterM)
        {
            _bellM = Mathf.Max(0.3f, bellDiameterM);
            _flame = FlightVfx.Create("Flame", transform, FlightVfx.PlumeMaterial, ParticleSystemSimulationSpace.Local, 400);
            ParticleSystem.MainModule m = _flame.main;
            m.startLifetime = 0.28f;
            m.startSize = _bellM * 1.05f;
            m.startColor = new Color(1f, 0.78f, 0.45f, 0.55f);
            ParticleSystem.ShapeModule shape = _flame.shape;
            shape.shapeType = ParticleSystemShapeType.Cone;
            shape.radius = _bellM * 0.38f;
            shape.angle = SeaLevelConeDeg;
            ParticleSystem.ColorOverLifetimeModule col = _flame.colorOverLifetime;
            col.enabled = true;
            col.color = FlightVfx.Fade(new Color(1f, 0.95f, 0.8f, 0.9f), new Color(1f, 0.55f, 0.2f, 0.55f), new Color(0.6f, 0.2f, 0.1f, 0f));
            ParticleSystem.SizeOverLifetimeModule size = _flame.sizeOverLifetime;
            size.enabled = true;
            size.size = new ParticleSystem.MinMaxCurve(1f, AnimationCurve.Linear(0, 0.8f, 1, 2.2f));
            var r = _flame.GetComponent<ParticleSystemRenderer>();
            r.renderMode = ParticleSystemRenderMode.Stretch;
            r.velocityScale = 0.035f;
            r.lengthScale = 1.6f;

            _core = FlightVfx.Create("Core", transform, FlightVfx.CoreMaterial, ParticleSystemSimulationSpace.Local, 80);
            ParticleSystem.MainModule cm = _core.main;
            cm.startLifetime = 0.12f;
            cm.startSize = _bellM * 0.85f;
            cm.startColor = new Color(1f, 0.97f, 0.9f, 1f);
            ParticleSystem.ShapeModule cs = _core.shape;
            cs.shapeType = ParticleSystemShapeType.Cone;
            cs.radius = _bellM * 0.25f;
            cs.angle = 1f;
            var cr = _core.GetComponent<ParticleSystemRenderer>();
            cr.renderMode = ParticleSystemRenderMode.Stretch;
            cr.velocityScale = 0.03f;
            cr.lengthScale = 1.2f;

            _diamonds = FlightVfx.Create("MachDiamonds", transform, FlightVfx.CoreMaterial, ParticleSystemSimulationSpace.Local, Diamonds);
            ParticleSystem.MainModule dm = _diamonds.main;
            dm.startLifetime = 1e6f;
            dm.startSpeed = 0f;
            _diamonds.Play();
            _diamondBuffer = new ParticleSystem.Particle[Diamonds];
            Apply(0f, 1f);
        }

        /// <summary>Drives the plume from the feed: throttle 0–1 and ambient pressure ratio 0–1.</summary>
        public void Apply(float throttle01, float pressureRatio)
        {
            _throttle = Mathf.Clamp01(throttle01);
            float vac = 1f - Mathf.Clamp01(pressureRatio);
            float spread = Mathf.Sqrt(vac);
            float length = Mathf.Lerp(SeaLevelLengthBells, VacuumLengthBells, spread) * _bellM;
            float lifetime = 0.28f;
            ParticleSystem.MainModule m = _flame.main;
            m.startSpeed = length / lifetime;
            ParticleSystem.ShapeModule shape = _flame.shape;
            shape.angle = Mathf.Lerp(SeaLevelConeDeg, VacuumConeDeg, spread);
            m.startColor = new Color(1f, 0.78f, 0.45f, Mathf.Lerp(0.55f, 0.28f, spread));
            ParticleSystem.EmissionModule e = _flame.emission;
            e.rateOverTime = _throttle * (FlightVfx.Reduced ? 140f : 320f);
            ParticleSystem.MainModule cm = _core.main;
            cm.startSpeed = length * 0.35f / 0.12f;
            ParticleSystem.EmissionModule ce = _core.emission;
            ce.rateOverTime = _throttle * (FlightVfx.Reduced ? 40f : 90f);

            if (_throttle > 0.01f && !_flame.isPlaying) { _flame.Play(); _core.Play(); }
            if (_throttle <= 0.01f && _flame.isEmitting) { _flame.Stop(); _core.Stop(); }
            UpdateDiamonds(pressureRatio);
        }

        private void UpdateDiamonds(float pressureRatio)
        {
            float strength = _throttle > 0.05f ? Mathf.InverseLerp(DiamondsMinPressureRatio, 0.9f, pressureRatio) : 0f;
            for (int i = 0; i < Diamonds; i++)
            {
                float k = i + 1;
                _diamondBuffer[i].position = new Vector3(0f, 0f, k * _bellM * 1.15f);
                _diamondBuffer[i].startSize = _bellM * (0.75f - 0.1f * i) * strength;
                _diamondBuffer[i].startColor = new Color(1f, 0.85f, 0.65f, 0.75f * strength / k * 2f);
                _diamondBuffer[i].remainingLifetime = 1e6f;
                _diamondBuffer[i].startLifetime = 1e6f;
            }
            _diamonds.SetParticles(_diamondBuffer, Diamonds);
        }
    }
}
