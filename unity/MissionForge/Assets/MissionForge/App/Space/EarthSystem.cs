using UnityEngine;

namespace MissionForge.App.Space
{
    /// <summary>
    /// Drives the shared space backdrop: spins the Earth, drifts the cloud layer and publishes the
    /// sun direction and planet size to the Earth, atmosphere and starfield shaders.
    /// Scale: 1 Unity unit = 1000 km, so the Earth's mean radius (6371 km, physical) is 6.371 units.
    /// </summary>
    [ExecuteAlways]
    public sealed class EarthSystem : MonoBehaviour
    {
        /// <summary>Mean Earth radius in Unity units (6371 km at 1 unit = 1000 km). Physical.</summary>
        public const float EarthRadiusUnits = 6.371f;

        /// <summary>Real sidereal rotation rate, degrees per second (360° / 86164 s). Physical.</summary>
        public const float RealRotationDegPerSec = 360f / 86164f;

        private static readonly int SunDirId = Shader.PropertyToID("_MF_SunDir");
        private static readonly int CloudOffsetId = Shader.PropertyToID("_MF_CloudOffset");
        private static readonly int PlanetCenterId = Shader.PropertyToID("_MF_PlanetCenter");
        private static readonly int PlanetRadiusId = Shader.PropertyToID("_MF_PlanetRadius");
        private static readonly int AtmoRadiusId = Shader.PropertyToID("_MF_AtmoRadius");

        [SerializeField] private Transform earth;
        [SerializeField] private Transform atmosphere;
        [SerializeField] private Light sun;

        [Header("Game values (not physical)")]
        [Tooltip("Visual spin in degrees per second. Game value: about 190x the real rate so the motion reads on a title screen.")]
        [SerializeField] private float rotationDegPerSec = 0.8f;

        [Tooltip("Cloud drift relative to the ground, in turns per second. Game value.")]
        [SerializeField] private float cloudDriftTurnsPerSec = 0.0009f;

        [Tooltip("Atmosphere shell radius as a multiple of the planet radius. Game value: the real ~100 km shell would be 1.016.")]
        [SerializeField] private float atmosphereRadiusFactor = 1.045f;

        private float _cloudOffset;

        public Transform Earth => earth;
        public Light Sun => sun;

        private void OnEnable() => Publish();

        private void Update()
        {
            if (Application.isPlaying && earth != null)
            {
                earth.Rotate(Vector3.up, -rotationDegPerSec * Time.deltaTime, UnityEngine.Space.Self);
                _cloudOffset = Mathf.Repeat(_cloudOffset + cloudDriftTurnsPerSec * Time.deltaTime, 1f);
            }
            Publish();
        }

        private void Publish()
        {
            if (earth == null) return;
            float radius = earth.lossyScale.x;
            Vector3 toSun = sun != null ? -sun.transform.forward : new Vector3(0.9f, 0.3f, 0.3f).normalized;
            Shader.SetGlobalVector(SunDirId, toSun);
            Shader.SetGlobalFloat(CloudOffsetId, _cloudOffset);
            Shader.SetGlobalVector(PlanetCenterId, earth.position);
            Shader.SetGlobalFloat(PlanetRadiusId, radius);
            Shader.SetGlobalFloat(AtmoRadiusId, radius * atmosphereRadiusFactor);
            if (atmosphere != null)
            {
                atmosphere.position = earth.position;
                atmosphere.localScale = Vector3.one * (radius * atmosphereRadiusFactor);
            }
        }
    }
}
