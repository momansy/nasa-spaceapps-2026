using System.Collections.Generic;
using UnityEngine;
using UnityEngine.InputSystem;

namespace MissionForge.Screens.BuildBay
{
    /// <summary>
    /// Assembly feel (T034 step 6): a warm work light at the joint while a part is lowered and welded, and subtle
    /// boil-off steam from a vent at the top of each propellant tank once it is on the stack (cryogenic LOX is in
    /// every family; the steam is a game_value cue, not a simulated boil-off rate). Reduced motion and the Low quality
    /// setting hide the steam; the Q key toggles the quality. All numbers are game_value art direction.
    /// </summary>
    public sealed partial class BayStage
    {
        /// <summary>Work light colour temperature (K), peak intensity and range (m).</summary>
        /// <summary>
        /// Rework: capped from 60 and moved off the camera axis (55° toward the sun side, 3 m up) so it rakes the part
        /// and keeps its form instead of flattening the camera-facing side to white.
        /// </summary>
        public const float WorkLightKelvin = 3400f, WorkLightIntensity = 16f, WorkLightRangeM = 14f;
        /// <summary>Work light bearing off the camera direction, degrees (+ = camera-right, the sun side).</summary>
        public const float WorkLightOffAxisDeg = 55f;
        /// <summary>Tank keys the vents attach to (KitResolver step keys).</summary>
        private static readonly string[] VentTankKeys = { "tank1", "tank2" };

        [SerializeField] private Material steamMaterial;

        private Light _workLight;
        private readonly List<ParticleSystem> _vents = new List<ParticleSystem>();

        public void ConfigureAtmosphere(Material steam) => steamMaterial = steam;

        public IReadOnlyList<ParticleSystem> SteamVents => _vents;

        private void CreateAtmosphere()
        {
            var go = new GameObject("WorkLight");
            go.transform.SetParent(transform, false);
            _workLight = go.AddComponent<Light>();
            _workLight.type = LightType.Point;
            _workLight.useColorTemperature = true;
            _workLight.colorTemperature = WorkLightKelvin;
            _workLight.color = Color.white;
            _workLight.range = WorkLightRangeM;
            _workLight.intensity = WorkLightIntensity;
            _workLight.shadows = LightShadows.None;
            _workLight.enabled = false;
            BayQuality.Changed += RefreshSteamVents;
        }

        private void OnDisable() => BayQuality.Changed -= RefreshSteamVents;

        private void SetWorkLight(Vector3 joint, float radius, bool on)
        {
            if (_workLight == null) return;
            _workLight.enabled = on && !_a11y.ReducedMotion;
            if (!on) return;
            Vector3 toCam = _screen != null && _screen.Vantage != null ? _screen.Vantage.transform.position - joint : Vector3.back;
            toCam.y = 0f;
            Vector3 dir = Quaternion.Euler(0f, -WorkLightOffAxisDeg, 0f) * (toCam.sqrMagnitude > 1e-4f ? toCam.normalized : Vector3.back);
            _workLight.transform.position = joint + dir * (radius + 3.5f) + Vector3.up * 3f;
            _workLight.intensity = WorkLightIntensity;
        }

        /// <summary>Welding flicker on the work light (deterministic from the weld clock).</summary>
        private void FlickerWorkLight(float t)
        {
            if (_workLight == null || !_workLight.enabled) return;
            float f = 0.85f + 0.25f * Mathf.PerlinNoise(t * 9f, 0.37f);
            _workLight.intensity = WorkLightIntensity * f;
        }

        // ------------------------------------------------------------------ steam

        /// <summary>Places one vent at the top of each tank on the stack (none while it is still being lowered).</summary>
        private void RefreshSteamVents()
        {
            foreach (ParticleSystem v in _vents) if (v != null) Destroy(v.gameObject);
            _vents.Clear();
            if (Rig == null || steamMaterial == null || _a11y.ReducedMotion || BayQuality.IsLow || _assembling) return;
            Vector3 toCam = _screen != null && _screen.Vantage != null ? _screen.Vantage.transform.position - vehicleMount.position : Vector3.back;
            toCam.y = 0f;
            Vector3 side = Vector3.Cross(Vector3.up, toCam.normalized);   // camera-right: away from the tower
            foreach (string key in VentTankKeys)
            {
                Transform tank = Rig.PartByKey(key);
                if (tank == null) continue;
                Bounds b = Vehicle.VehicleAssembler.RendererBounds(tank);
                float r = Mathf.Max(0.6f, Mathf.Max(b.extents.x, b.extents.z));
                Vector3 at = new Vector3(b.center.x, b.max.y - Mathf.Min(1.2f, b.size.y * 0.08f), b.center.z) + side * r;
                _vents.Add(CreateVent(at, side, r));
            }
        }

        private ParticleSystem CreateVent(Vector3 at, Vector3 outward, float tankRadius)
        {
            var go = new GameObject("SteamVent");
            go.transform.SetParent(Rig.Root, true);
            go.transform.SetPositionAndRotation(at, Quaternion.LookRotation(outward, Vector3.up));
            var ps = go.AddComponent<ParticleSystem>();
            ps.Stop(true, ParticleSystemStopBehavior.StopEmittingAndClear);
            float s = Mathf.Clamp(tankRadius / 1.85f, 0.6f, 2.2f);
            var main = ps.main;
            main.loop = true;
            main.prewarm = true;
            main.duration = 6f;
            // Rework (M7): warm-white, denser and longer, rising and bent downwind; the vents sit on the sun side of
            // the tank so the plume is seen against the low sun (backlit look; the particles are unlit).
            main.startLifetime = new ParticleSystem.MinMaxCurve(5f, 8f);
            main.startSpeed = new ParticleSystem.MinMaxCurve(0.8f * s, 1.6f * s);
            // Rework 2 (M7): warmer and denser again (alpha 0.34 -> 0.55, 12 -> 20 puffs/s, larger puffs at the vent).
            main.startSize = new ParticleSystem.MinMaxCurve(1.4f * s, 2.6f * s);
            main.startRotation = new ParticleSystem.MinMaxCurve(0f, 2f * Mathf.PI);
            main.startColor = new Color(1f, 0.88f, 0.72f, 0.55f);
            main.maxParticles = 160;
            main.simulationSpace = ParticleSystemSimulationSpace.World;
            main.gravityModifier = -0.1f;   // boil-off vapour is buoyant at first, then drifts with the breeze
            var emission = ps.emission;
            emission.rateOverTime = 20f;
            var shape = ps.shape;
            shape.shapeType = ParticleSystemShapeType.Cone;
            shape.angle = 18f;
            shape.radius = 0.15f * s;
            var force = ps.forceOverLifetime;
            force.enabled = true;
            force.space = ParticleSystemSimulationSpace.World;
            force.x = new ParticleSystem.MinMaxCurve(0.45f);   // light onshore breeze toward +X bends the plume
            force.y = new ParticleSystem.MinMaxCurve(0.12f);
            force.z = new ParticleSystem.MinMaxCurve(0f);
            var size = ps.sizeOverLifetime;
            size.enabled = true;
            size.size = new ParticleSystem.MinMaxCurve(1f, AnimationCurve.EaseInOut(0f, 0.5f, 1f, 3.2f));
            var colour = ps.colorOverLifetime;
            colour.enabled = true;
            var g = new Gradient();
            g.SetKeys(
                new[] { new GradientColorKey(Color.white, 0f), new GradientColorKey(Color.white, 1f) },
                new[] { new GradientAlphaKey(0f, 0f), new GradientAlphaKey(1f, 0.08f), new GradientAlphaKey(0.8f, 0.5f), new GradientAlphaKey(0f, 1f) });
            colour.color = g;
            var rot = ps.rotationOverLifetime;
            rot.enabled = true;
            rot.z = new ParticleSystem.MinMaxCurve(-0.3f, 0.3f);
            var renderer = go.GetComponent<ParticleSystemRenderer>();
            renderer.renderMode = ParticleSystemRenderMode.Billboard;
            renderer.sharedMaterial = steamMaterial;
            renderer.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
            renderer.receiveShadows = false;
            renderer.sortingFudge = 10f;
            ps.Play();
            return ps;
        }

        // ------------------------------------------------------------------ quality key

        private void Update()
        {
            Keyboard k = Keyboard.current;
            if (k != null && _screen != null && k.qKey.wasPressedThisFrame) BayQuality.Toggle();
        }
    }
}
