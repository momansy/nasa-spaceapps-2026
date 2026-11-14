using System.Collections.Generic;
using UnityEngine;

namespace MissionForge.Screens.BuildBay
{
    /// <summary>
    /// Runtime part of <c>MF_LaunchPad.prefab</c>: the vehicle mount, a service tower built from stacked 8 m segments
    /// whose height follows the vehicle, a hammerhead crane on the crown (used by the live assembly), and two
    /// umbilical arms that reach the vehicle skin. All dimensions are game_value (see build_launchpad.py).
    /// </summary>
    public sealed class LaunchPadRig : MonoBehaviour
    {
        /// <summary>Height of one gantry segment, m (build_launchpad.py SEG_H).</summary>
        public const float SegmentHeightM = 8f;
        /// <summary>Deck top above grade, m (DECK_H).</summary>
        public const float DeckTopM = 2f;
        /// <summary>Half the tower footprint, m (GANTRY_W / 2).</summary>
        public const float TowerHalfWidthM = 4.5f;
        /// <summary>Length of the umbilical arm model along +X, m.</summary>
        public const float ArmModelLengthM = 10f;
        /// <summary>Tower top clearance above the vehicle tip, m (game_value).</summary>
        public const float TowerClearanceM = 6f;

        [SerializeField] private Transform vehicleMount;
        [SerializeField] private Transform tower;
        [SerializeField] private List<Transform> segments = new List<Transform>();
        [SerializeField] private Transform crown;
        [SerializeField] private Transform cranePivot;
        [SerializeField] private Transform jib;
        [SerializeField] private Transform hookPoint;
        [SerializeField] private Transform cable;
        [SerializeField] private Transform hook;
        [SerializeField] private Transform armUpper;
        [SerializeField] private Transform armLower;

        private float _targetSegments;
        private float _shownSegments;

        public Transform VehicleMount => vehicleMount;
        public Transform HookPoint => hookPoint;
        public Transform Hook => hook;
        public Transform Cable => cable;
        public Transform Jib => jib;
        public float TowerTopY => crown != null ? crown.position.y : transform.position.y;

        public void Configure(Transform mount, Transform towerRoot, List<Transform> segs, Transform crownT, Transform pivot,
            Transform jibT, Transform hookPointT, Transform cableT, Transform hookT, Transform upper, Transform lower)
        {
            vehicleMount = mount;
            tower = towerRoot;
            segments = segs;
            crown = crownT;
            cranePivot = pivot;
            jib = jibT;
            hookPoint = hookPointT;
            cable = cableT;
            hook = hookT;
            armUpper = upper;
            armLower = lower;
        }

        /// <summary>Distance from the tower centre to the vehicle axis on the deck plane, m.</summary>
        public float TowerToAxisM
        {
            get
            {
                Vector3 a = tower.position - vehicleMount.position;
                return new Vector2(a.x, a.z).magnitude;
            }
        }

        /// <summary>Re-stacks the tower for a vehicle of <paramref name="lengthM"/> and reaches the arms to its skin.</summary>
        public void FitVehicle(float lengthM, float radiusM, bool instant)
        {
            float topNeeded = (vehicleMount.position.y - transform.position.y) + Mathf.Max(lengthM, 10f) + TowerClearanceM - DeckTopM;
            _targetSegments = Mathf.Clamp(Mathf.Ceil(topNeeded / SegmentHeightM), 3, segments.Count);
            if (instant) _shownSegments = _targetSegments;
            ApplySegments();
            PlaceArm(armUpper, lengthM * 0.82f, radiusM);
            PlaceArm(armLower, lengthM * 0.45f, radiusM);
        }

        private void Update()
        {
            if (Mathf.Approximately(_shownSegments, _targetSegments)) return;
            _shownSegments = Mathf.MoveTowards(_shownSegments, _targetSegments, Time.deltaTime * 2.5f);
            ApplySegments();
        }

        private void ApplySegments()
        {
            int n = Mathf.CeilToInt(_shownSegments - 0.001f);
            for (int i = 0; i < segments.Count; i++) segments[i].gameObject.SetActive(i < n);
            if (crown != null) crown.localPosition = new Vector3(0f, _shownSegments * SegmentHeightM, 0f);
            AimCrane(vehicleMount.position);
        }

        /// <summary>Slews the crane jib so its hook hangs over <paramref name="world"/> (horizontal aim only).</summary>
        public void AimCrane(Vector3 world)
        {
            if (cranePivot == null || jib == null) return;
            Vector3 d = world - cranePivot.position;
            d.y = 0f;
            if (d.sqrMagnitude < 0.01f) return;
            jib.rotation = Quaternion.FromToRotation(Vector3.right, d.normalized);
        }

        /// <summary>Lowers the hook to <paramref name="worldY"/> by stretching the unit cable.</summary>
        public void SetHookHeight(float worldY)
        {
            if (hookPoint == null || cable == null || hook == null) return;
            float length = Mathf.Max(0.5f, hookPoint.position.y - worldY);
            cable.position = hookPoint.position;
            cable.localScale = new Vector3(1f, length, 1f);
            hook.position = hookPoint.position - Vector3.up * length;
        }

        private void PlaceArm(Transform arm, float heightAboveMountM, float radiusM)
        {
            if (arm == null) return;
            Vector3 axis = vehicleMount.position;
            Vector3 towerCentre = tower.position;
            Vector3 toAxis = axis - towerCentre;
            toAxis.y = 0f;
            Vector3 dir = toAxis.normalized;
            float reach = toAxis.magnitude - TowerHalfWidthM - radiusM - 0.4f;
            arm.position = new Vector3(towerCentre.x, axis.y + heightAboveMountM, towerCentre.z) + dir * TowerHalfWidthM;
            arm.rotation = Quaternion.FromToRotation(Vector3.right, dir);
            arm.localScale = new Vector3(Mathf.Max(0.2f, reach / ArmModelLengthM), 1f, 1f);
            arm.gameObject.SetActive(heightAboveMountM > 2f);
        }
    }
}
