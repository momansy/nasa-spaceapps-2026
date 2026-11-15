using UnityEngine;

namespace MissionForge.Screens.BuildBay
{
    /// <summary>
    /// Keeps the umbilical arm-end plate (build_hero_pad.py <c>hero_umbilical_end</c>, T034 rework 2, M3) at the tip of
    /// its arm at true size. <see cref="LaunchPadRig"/> stretches each arm along local +X to reach the vehicle skin; the
    /// truss may stretch, but the hinge, connector plate and hose loops must not, so this child sits at the model's
    /// tip (<see cref="LaunchPadRig.ArmModelLengthM"/>) and cancels the parent's X scale every frame.
    /// </summary>
    public sealed class BayArmEnd : MonoBehaviour
    {
        private float _appliedParentScale = float.NaN;

        private void LateUpdate()
        {
            Transform parent = transform.parent;
            if (parent == null) return;
            float sx = parent.localScale.x;
            if (Mathf.Approximately(sx, _appliedParentScale)) return;
            _appliedParentScale = sx;
            transform.localPosition = new Vector3(LaunchPadRig.ArmModelLengthM, 0f, 0f);
            transform.localScale = new Vector3(CompensatingScale(sx), 1f, 1f);
        }

        /// <summary>Local X scale that cancels a parent X scale of <paramref name="parentScaleX"/> (unit-tested).</summary>
        public static float CompensatingScale(float parentScaleX) => 1f / Mathf.Max(0.05f, parentScaleX);
    }
}
