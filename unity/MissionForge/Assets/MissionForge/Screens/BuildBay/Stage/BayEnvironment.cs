using System.Collections.Generic;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.Rendering.Universal;

namespace MissionForge.Screens.BuildBay
{
    /// <summary>
    /// Dusk environment of the bay while <c>MF_BuildBay</c> is loaded. The Shell is the active scene, so its render
    /// settings (dark space ambient, no fog) and its space sun would otherwise light the pad: this component swaps in
    /// the bay's ambient and haze, fades out every directional light that is not the bay's own, enables main-light
    /// shadows (the shared URP asset ships with shadow distance 0 for the space screens) and restores everything on
    /// exit. Values are art-direction game_values (STYLE_GUIDE: warm key, cool fill, low-contrast distant site).
    /// </summary>
    public sealed class BayEnvironment : MonoBehaviour
    {
        [SerializeField] private Color ambientSky = new Color(0.20f, 0.27f, 0.40f);
        [SerializeField] private Color ambientEquator = new Color(0.36f, 0.28f, 0.25f);
        [SerializeField] private Color ambientGround = new Color(0.05f, 0.05f, 0.06f);
        [SerializeField] private Color haze = new Color(0.33f, 0.33f, 0.40f);
        [SerializeField] private float hazeDensity = 0.0011f;
        [SerializeField] private float shadowDistanceM = 320f;
        [SerializeField] private float fadeSeconds = 1.5f;

        private readonly List<(Light light, float intensity)> _foreign = new List<(Light, float)>();
        private bool _saved;
        private bool _fog;
        private FogMode _fogMode;
        private Color _fogColor;
        private float _fogDensity;
        private AmbientMode _ambientMode;
        private Color _ambientSky, _ambientEquator, _ambientGround, _ambientLight;
        private float _shadowDistance;
        private float _fade;

        private void OnEnable()
        {
            _saved = true;
            _fog = RenderSettings.fog;
            _fogMode = RenderSettings.fogMode;
            _fogColor = RenderSettings.fogColor;
            _fogDensity = RenderSettings.fogDensity;
            _ambientMode = RenderSettings.ambientMode;
            _ambientSky = RenderSettings.ambientSkyColor;
            _ambientEquator = RenderSettings.ambientEquatorColor;
            _ambientGround = RenderSettings.ambientGroundColor;
            _ambientLight = RenderSettings.ambientLight;
            if (GraphicsSettings.currentRenderPipeline is UniversalRenderPipelineAsset urp)
            {
                _shadowDistance = urp.shadowDistance;
                urp.shadowDistance = shadowDistanceM;
            }

            RenderSettings.fog = true;
            RenderSettings.fogMode = FogMode.ExponentialSquared;
            RenderSettings.fogColor = haze;
            RenderSettings.fogDensity = hazeDensity;
            RenderSettings.ambientMode = AmbientMode.Trilight;
            RenderSettings.ambientSkyColor = ambientSky;
            RenderSettings.ambientEquatorColor = ambientEquator;
            RenderSettings.ambientGroundColor = ambientGround;

            _foreign.Clear();
            foreach (Light l in FindObjectsByType<Light>())
            {
                if (l.type != LightType.Directional || l.transform.IsChildOf(transform)) continue;
                _foreign.Add((l, l.intensity));
            }
            _fade = 0f;
        }

        private void Update()
        {
            if (_fade >= 1f) return;
            _fade = fadeSeconds <= 0f ? 1f : Mathf.Min(1f, _fade + Time.unscaledDeltaTime / fadeSeconds);
            foreach ((Light light, float intensity) in _foreign)
            {
                if (light != null) light.intensity = intensity * (1f - _fade);
            }
        }

        private void OnDisable()
        {
            if (!_saved) return;
            _saved = false;
            RenderSettings.fog = _fog;
            RenderSettings.fogMode = _fogMode;
            RenderSettings.fogColor = _fogColor;
            RenderSettings.fogDensity = _fogDensity;
            RenderSettings.ambientMode = _ambientMode;
            RenderSettings.ambientSkyColor = _ambientSky;
            RenderSettings.ambientEquatorColor = _ambientEquator;
            RenderSettings.ambientGroundColor = _ambientGround;
            RenderSettings.ambientLight = _ambientLight;
            if (GraphicsSettings.currentRenderPipeline is UniversalRenderPipelineAsset urp) urp.shadowDistance = _shadowDistance;
            foreach ((Light light, float intensity) in _foreign)
            {
                if (light != null) light.intensity = intensity;
            }
            _foreign.Clear();
        }
    }
}
