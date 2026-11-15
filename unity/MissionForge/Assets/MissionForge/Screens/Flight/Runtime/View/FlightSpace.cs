using UnityEngine;

namespace MissionForge.Screens.Flight
{
    /// <summary>
    /// Earth and atmosphere for the flight above the pad environment, drawn in scaled space: the globe sits at
    /// 1/<see cref="ScaleDivisor"/> of its true distance from the camera with 1/<see cref="ScaleDivisor"/> of its true
    /// radius, so it subtends the true angle with no float precision trouble at 400 km. The Earth shader (T016 copy of
    /// App/Space) writes depth at the far plane, so the vehicle and plumes always draw over it. The atmosphere shell
    /// supplies the dusk-blue sky low down that fades to black above it (radius factor is a game_value).
    /// </summary>
    public sealed class FlightSpace : MonoBehaviour
    {
        public const float ScaleDivisor = 1000f;
        /// <summary>Atmosphere shell radius / planet radius (game_value: about 160 km of visible shell).</summary>
        public const float AtmosphereRadiusFactor = 1.025f;

        private static readonly int CenterId = Shader.PropertyToID("_FL_PlanetCenter");
        private static readonly int RadiusId = Shader.PropertyToID("_FL_PlanetRadius");
        private static readonly int AtmoRadiusId = Shader.PropertyToID("_FL_AtmoRadius");

        [SerializeField] private Mesh sphere;
        [SerializeField] private Material earthMaterial;
        [SerializeField] private Material atmosphereMaterial;
        [SerializeField] private FlightWorld world;

        private Transform _earth, _atmosphere;
        private float _spinDeg;

        public void Configure(Mesh mesh, Material earth, Material atmosphere, FlightWorld flightWorld)
        {
            sphere = mesh;
            earthMaterial = earth;
            atmosphereMaterial = atmosphere;
            world = flightWorld;
        }

        private void Awake()
        {
            _earth = Make("FlightEarth", earthMaterial);
            _atmosphere = Make("FlightAtmosphere", atmosphereMaterial);
        }

        private Transform Make(string name, Material material)
        {
            var go = new GameObject(name);
            go.transform.SetParent(transform, false);
            go.AddComponent<MeshFilter>().sharedMesh = sphere;
            var r = go.AddComponent<MeshRenderer>();
            r.sharedMaterial = material;
            r.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
            r.receiveShadows = false;
            go.SetActive(false);
            return go.transform;
        }

        private void LateUpdate()
        {
            IFlightFeed feed = FlightSession.Feed;
            Camera cam = Camera.main;
            if (feed == null || cam == null || world == null || sphere == null) return;
            FlightTelemetry a = feed.Previous ?? feed.Current, c = feed.Current;
            float k = FlightSession.Alpha;
            double alt = a.altitudeM + (c.altitudeM - a.altitudeM) * k;
            double down = a.groundAngleRad + (c.groundAngleRad - a.groundAngleRad) * k;
            bool show = alt >= FlightWorld.EnvironmentOffAltitudeM;
            if (_earth.gameObject.activeSelf != show)
            {
                // Diagnostic flags for render-order checks (evidence builds).
                _earth.gameObject.SetActive(show && FlightSession.Arg("-mfNoEarth") == null);
                _atmosphere.gameObject.SetActive(show && FlightSession.Arg("-mfNoAtmosphere") == null);
            }
            if (!show) return;

            double radiusM = MissionForge.Core.Flight.Body.Earth.RadiusM;
            Vector3 upLocal = Quaternion.AngleAxis(-(float)(down * 180.0 / System.Math.PI), Vector3.forward) * Vector3.up;
            // Earth centre relative to the vehicle anchor, then relative to the camera, in double precision.
            Vector3 anchor = world.AnchorHome;
            Vector3d centre = new Vector3d(anchor) - new Vector3d(upLocal) * (radiusM + alt);
            Vector3d camPos = new Vector3d(cam.transform.position);
            Vector3d rel = (centre - camPos) / ScaleDivisor;
            Vector3 pos = cam.transform.position + rel.ToVector3();
            float r = (float)(radiusM / ScaleDivisor);

            _spinDeg += Time.deltaTime * 0.2f; // slow cloud/ground drift for life (game_value, not Earth's rate)
            _earth.SetPositionAndRotation(pos, Quaternion.AngleAxis(-(float)(down * 180.0 / System.Math.PI) - _spinDeg, Vector3.forward)
                * Quaternion.Euler(0f, 90f, 0f));
            _earth.localScale = Vector3.one * r;
            _atmosphere.position = pos;
            _atmosphere.localScale = Vector3.one * r * AtmosphereRadiusFactor;
            Shader.SetGlobalVector(CenterId, pos);
            Shader.SetGlobalFloat(RadiusId, r);
            Shader.SetGlobalFloat(AtmoRadiusId, r * AtmosphereRadiusFactor);
        }

        private readonly struct Vector3d
        {
            private readonly double _x, _y, _z;
            public Vector3d(double x, double y, double z) { _x = x; _y = y; _z = z; }
            public Vector3d(Vector3 v) : this(v.x, v.y, v.z) { }
            public static Vector3d operator -(Vector3d a, Vector3d b) => new Vector3d(a._x - b._x, a._y - b._y, a._z - b._z);
            public static Vector3d operator *(Vector3d a, double s) => new Vector3d(a._x * s, a._y * s, a._z * s);
            public static Vector3d operator /(Vector3d a, double s) => new Vector3d(a._x / s, a._y / s, a._z / s);
            public Vector3 ToVector3() => new Vector3((float)_x, (float)_y, (float)_z);
        }
    }
}
