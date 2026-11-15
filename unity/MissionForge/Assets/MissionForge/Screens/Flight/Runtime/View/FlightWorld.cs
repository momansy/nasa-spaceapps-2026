using MissionForge.Screens.BuildBay;
using UnityEngine;

namespace MissionForge.Screens.Flight
{
    /// <summary>
    /// Root of a flight scene's 3-D world: the dusk pad environment (a copy of the Build Bay's <c>Bay</c> root, made by
    /// <c>FlightWorldBuilder</c>) and the vehicle anchor. Vehicle-centred floating origin: the vehicle anchor stays at
    /// the pad mount's starting point and the environment moves by the vehicle's displacement, so nothing near the
    /// camera ever sits at large coordinates. Only one world is active at a time (countdown → flight hand-off).
    /// </summary>
    public sealed class FlightWorld : MonoBehaviour
    {
        /// <summary>Above this altitude the pad environment is switched off (its fog has fully hidden it), m. game_value.</summary>
        public const float EnvironmentOffAltitudeM = 9000f;

        [SerializeField] private Transform environment;
        [SerializeField] private Transform vehicleAnchor;
        [SerializeField] private FlightVehicleView vehicle;

        private Vector3 _environmentHome;
        private Vector3 _anchorHome;
        private bool _homed;

        public static FlightWorld Active { get; private set; }
        public Transform Environment => environment;
        public Transform VehicleAnchor => vehicleAnchor;
        public FlightVehicleView Vehicle => vehicle;

        /// <summary>Downrange direction in Unity world space (+X, across the pad camera's view; art choice).</summary>
        public static readonly Vector3 Downrange = Vector3.right;

        public void Configure(Transform env, Transform anchor, FlightVehicleView view)
        {
            environment = env;
            vehicleAnchor = anchor;
            vehicle = view;
        }

        /// <summary>Makes this world the visible one, switching the previous one off first.</summary>
        public void Activate()
        {
            if (Active != null && Active != this) Active.gameObject.SetActive(false);
            Active = this;
            gameObject.SetActive(true);
            Home();
        }

        private void Home()
        {
            if (_homed) return;
            _homed = true;
            if (environment != null) _environmentHome = environment.position;
            if (vehicleAnchor == null) return;
            LaunchPadRig rig = environment != null ? environment.GetComponentInChildren<LaunchPadRig>(true) : null;
            Transform mount = rig != null ? rig.VehicleMount : null;
            if (mount != null) vehicleAnchor.position = mount.position;
            _anchorHome = vehicleAnchor.position;
        }

        private void OnDestroy()
        {
            if (Active == this) Active = null;
        }

        /// <summary>Places the environment for the vehicle's displacement from the pad (metres up, metres downrange).</summary>
        public void SetDisplacement(double altitudeM, double downrangeM)
        {
            if (environment == null) return;
            bool show = altitudeM < EnvironmentOffAltitudeM;
            if (environment.gameObject.activeSelf != show) environment.gameObject.SetActive(show);
            if (!show) return;
            environment.position = _environmentHome - Vector3.up * (float)altitudeM - Downrange * (float)downrangeM;
        }

        public Vector3 AnchorHome => _anchorHome;

        /// <summary>Pad position in world space for the current displacement (where the exhaust cloud billows).</summary>
        public Vector3 PadPoint => environment != null ? _anchorHome + (environment.position - _environmentHome) : _anchorHome;

        public static Transform FindDeep(Transform root, string name)
        {
            if (root.name == name) return root;
            for (int i = 0; i < root.childCount; i++)
            {
                Transform found = FindDeep(root.GetChild(i), name);
                if (found != null) return found;
            }
            return null;
        }
    }
}
