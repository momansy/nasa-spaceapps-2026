using System.Collections.Generic;
using MissionForge.Core.Build;
using MissionForge.Vehicle;
using UnityEngine;

namespace MissionForge.Screens.BuildBay
{
    /// <summary>
    /// The 3D centre of the Build Bay: the launch pad (with its <c>VehicleMount</c>) and the live vehicle rig built by
    /// <see cref="VehicleAssembler"/> from the session build. Presentation only.
    /// </summary>
    public sealed partial class BayStage : MonoBehaviour
    {
        [SerializeField] private KitLibrary library;
        [Tooltip("Where the rig's lowest point sits (MF_LaunchPad.prefab VehicleMount).")]
        [SerializeField] private Transform vehicleMount;

        private BuildBayScreen _screen;
        private BayAccessibility _a11y = new BayAccessibility();
        private readonly HashSet<string> _loggedMissing = new HashSet<string>();

        public VehicleRig Rig { get; private set; }
        public KitLibrary Library => library;
        public Transform VehicleMount => vehicleMount;
        public BayAccessibility Accessibility => _a11y;

        public void Configure(KitLibrary kitLibrary, Transform mount)
        {
            library = kitLibrary;
            vehicleMount = mount;
        }

        public void Bind(BuildBayScreen screen)
        {
            _screen = screen;
            screen.Session.Changed += OnBuildChanged;
            Rebuild(screen.Session.Build, null);
            BindExtras();
        }

        /// <summary>Stops listening to the session and clears ghosts and running animations (screen exit).</summary>
        public void Unbind()
        {
            if (_screen != null && _screen.Session != null) _screen.Session.Changed -= OnBuildChanged;
            StopAllCoroutines();
            _assembling = false;
            _assemblyHeadroomM = 0f;
            SetWorkLight(Vector3.zero, 0f, false);
            ShowGhost(null, null);
            _screen = null;
        }

        private void OnDestroy()
        {
            if (_screen != null && _screen.Session != null) _screen.Session.Changed -= OnBuildChanged;
        }

        public void SetAccessibility(BayAccessibility a11y)
        {
            _a11y = a11y ?? new BayAccessibility();
            OnAccessibilityChanged();
        }

        private void OnBuildChanged(BuildState previous, BuildState current) => Rebuild(current, previous);

        /// <summary>Replaces the rig with the vehicle of <paramref name="build"/>.</summary>
        private void Rebuild(BuildState build, BuildState previous)
        {
            if (library == null || vehicleMount == null || _screen == null) return;
            VehicleRig old = Rig;
            Rig = VehicleAssembler.Build(build, _screen.Session.Catalog, library, vehicleMount);
            foreach (string id in Rig.Missing)
            {
                if (_loggedMissing.Add(id)) Debug.Log("[MissionForge] Build Bay: no kit model for '" + id + "'; it is not shown.");
            }
            if (old != null) Destroy(old.Root.gameObject);
            OnRigRebuilt(previous, build);
        }

        partial void BindExtrasImpl();
        partial void OnRigRebuiltImpl(BuildState previous, BuildState current);
        partial void OnAccessibilityChangedImpl();

        private void BindExtras() => BindExtrasImpl();
        private void OnRigRebuilt(BuildState previous, BuildState current) => OnRigRebuiltImpl(previous, current);
        private void OnAccessibilityChanged() => OnAccessibilityChangedImpl();
    }
}
