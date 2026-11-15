using System;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.Rendering.Universal;

namespace MissionForge.Screens.BuildBay
{
    /// <summary>
    /// Build Bay visual quality toggle (T034 step 7). <b>High</b> is the default. <b>Low</b> is for weaker laptops in
    /// WebGL: it hides the decorative atmosphere (floodlight cones, steam, distant props, work-light glows), renders
    /// at 85 % resolution and shortens the shadow distance. Choose it with <c>-mfBayQuality low</c> (WebGL:
    /// <c>?mfBayQuality=low</c>) or toggle it with the <b>Q</b> key in the Build Bay. game_value settings.
    /// </summary>
    public static class BayQuality
    {
        /// <summary>Render scale and main-light shadow distance (m) on Low.</summary>
        public const float LowRenderScale = 0.85f, LowShadowDistanceM = 160f;

        private static bool? _low;
        private static float _savedRenderScale = -1f;

        public static event Action Changed;

        public static bool IsLow
        {
            get
            {
                if (_low == null)
                {
                    string v = BuildBayScreen.Argument("-mfBayQuality");
                    _low = v != null && v.Trim().Equals("low", StringComparison.OrdinalIgnoreCase);
                }
                return _low.Value;
            }
        }

        public static void Set(bool low)
        {
            if (IsLow == low) return;
            _low = low;
            Changed?.Invoke();
        }

        public static void Toggle() => Set(!IsLow);

        /// <summary>Applies the pipeline side (render scale, shadow distance) while the bay is loaded.</summary>
        public static void ApplyPipeline(float highShadowDistanceM)
        {
            if (!(GraphicsSettings.currentRenderPipeline is UniversalRenderPipelineAsset urp)) return;
            if (_savedRenderScale < 0f) _savedRenderScale = urp.renderScale;
            urp.renderScale = IsLow ? LowRenderScale : _savedRenderScale;
            urp.shadowDistance = IsLow ? LowShadowDistanceM : highShadowDistanceM;
        }

        /// <summary>Restores the render scale on bay exit (BayEnvironment restores the shadow distance).</summary>
        public static void RestorePipeline()
        {
            if (_savedRenderScale < 0f) return;
            if (GraphicsSettings.currentRenderPipeline is UniversalRenderPipelineAsset urp) urp.renderScale = _savedRenderScale;
            _savedRenderScale = -1f;
        }
    }
}
