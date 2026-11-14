using UnityEngine;

namespace MissionForge.App.Space
{
    /// <summary>
    /// Slow orbital drift for a screen's camera vantage. The rest pose is the transform's authored
    /// pose; the script sways it around the planet centre and adds a gentle roll, so the framing
    /// never leaves the composition it was authored for. Honours reduced-motion (design section 16).
    /// </summary>
    public sealed class CameraDrift : MonoBehaviour
    {
        /// <summary>Global switch for the accessibility reduced-motion mode.</summary>
        public static bool ReducedMotion;

        [SerializeField] private Vector3 pivot = Vector3.zero;
        [Tooltip("Peak sway around the pivot, degrees.")]
        [SerializeField] private float swayDegrees = 5f;
        [Tooltip("Seconds for one full sway cycle.")]
        [SerializeField] private float swayPeriodSeconds = 90f;
        [Tooltip("Peak vertical bob as a fraction of the distance to the pivot.")]
        [SerializeField] private float bobFraction = 0.025f;
        [Tooltip("Peak roll, degrees.")]
        [SerializeField] private float rollDegrees = 1.2f;

        private Vector3 _restOffset;
        private Quaternion _restRotation;
        private float _time;

        private void Awake()
        {
            _restOffset = transform.position - pivot;
            _restRotation = transform.rotation;
        }

        private void LateUpdate()
        {
            if (ReducedMotion)
            {
                transform.SetPositionAndRotation(pivot + _restOffset, _restRotation);
                return;
            }

            _time += Time.unscaledDeltaTime;
            float phase = _time / Mathf.Max(swayPeriodSeconds, 1f) * Mathf.PI * 2f;
            float yaw = Mathf.Sin(phase) * swayDegrees;
            float bob = Mathf.Sin(phase * 0.63f + 1.3f) * bobFraction * _restOffset.magnitude;
            float roll = Mathf.Sin(phase * 0.41f + 0.4f) * rollDegrees;

            Quaternion orbit = Quaternion.AngleAxis(yaw, Vector3.up);
            Vector3 position = pivot + orbit * _restOffset + Vector3.up * bob;
            Quaternion rotation = orbit * _restRotation * Quaternion.AngleAxis(roll, Vector3.forward);
            transform.SetPositionAndRotation(position, rotation);
        }
    }
}
