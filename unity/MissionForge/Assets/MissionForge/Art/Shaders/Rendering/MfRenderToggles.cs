using System;
using UnityEngine;
using UnityEngine.Rendering.Universal;

namespace MissionForge.Rendering
{
    /// <summary>
    /// Performance-measurement switches for the T031 WebGL frame-rate runs, inert unless asked for:
    /// <c>-mfNoPost</c> (or <c>?mfNoPost</c> in a WebGL URL) turns post-processing off on every camera, and
    /// <c>-mfNoGlass</c> (<c>?mfNoGlass</c>) skips <see cref="MfBlurredSceneFeature"/> so glass panels fall back to
    /// opaque. Screens load additively, so cameras are re-checked twice a second (game_value interval).
    /// </summary>
    public static class MfRenderToggles
    {
        private const float RecheckSeconds = 0.5f;

        public static bool NoPost { get; private set; }
        public static bool NoGlass { get; private set; }

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
        private static void FromCommandLine()
        {
            NoPost = Flag("-mfNoPost");
            NoGlass = Flag("-mfNoGlass");
            MfBlurredSceneFeature.ForceDisabled = NoGlass;
            if (NoPost || NoGlass) Debug.Log("[MissionForge] Render toggles: post " + (NoPost ? "off" : "on") + ", glass " + (NoGlass ? "off" : "on"));
            if (!NoPost) return;
            var go = new GameObject("MfRenderToggles") { hideFlags = HideFlags.HideAndDontSave };
            UnityEngine.Object.DontDestroyOnLoad(go);
            go.AddComponent<PostOff>();
        }

        private static bool Flag(string name)
        {
            if (Array.IndexOf(Environment.GetCommandLineArgs(), name) >= 0) return true;
            string url = Application.absoluteURL ?? string.Empty;
            string key = name.TrimStart('-');
            return url.Contains("?" + key) || url.Contains("&" + key);
        }

        private sealed class PostOff : MonoBehaviour
        {
            private float _next;

            private void Update()
            {
                if (Time.unscaledTime < _next) return;
                _next = Time.unscaledTime + RecheckSeconds;
                foreach (Camera cam in Camera.allCameras)
                {
                    if (cam.TryGetComponent(out UniversalAdditionalCameraData data) && data.renderPostProcessing)
                        data.renderPostProcessing = false;
                }
            }
        }
    }
}
