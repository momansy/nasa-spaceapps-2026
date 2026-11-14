using System;
using System.Collections;
using Unity.Cinemachine;
using UnityEngine;
using UnityEngine.SceneManagement;

namespace MissionForge.App
{
    /// <summary>
    /// Moves the host between screens. Each screen is its own additive scene on top of the
    /// persistent Shell (which holds the camera, the Earth and the chrome). A transition fades the
    /// old UI out, blends the camera to the new screen's vantage and fades the new UI in; the old
    /// scene is unloaded once the camera blend has finished.
    /// </summary>
    public sealed class SceneFlow : MonoBehaviour
    {
        [SerializeField] private ChromeController chrome;
        [SerializeField] private ScreenId firstScreen = ScreenId.Title;
        [Tooltip("Seconds the outgoing UI takes to fade (matches the theme transition).")]
        [SerializeField] private float uiFadeSeconds = 0.45f;
        [Tooltip("Seconds the camera takes to blend between vantages (matches the CinemachineBrain default blend).")]
        [SerializeField] private float cameraBlendSeconds = 1.8f;
        [Tooltip("Seconds for the opening reveal from black.")]
        [SerializeField] private float openingRevealSeconds = 1.6f;

        private ScreenController _current;
        private ScreenController _overlay;
        private int _vantagePriority = 10;

        public ScreenInfo Current { get; private set; }
        public ScreenInfo Overlay { get; private set; }
        public GamePhase Phase { get; private set; } = GamePhase.Title;
        public bool IsBusy { get; private set; }

        public event Action<ScreenInfo> ScreenChanged;
        public event Action<GamePhase> PhaseChanged;

        private IEnumerator Start()
        {
            IsBusy = true;
            SceneManager.SetActiveScene(gameObject.scene);

            // Adopt a screen scene that is already open (playing a screen directly in the editor).
            ScreenInfo adopt = null;
            for (int i = 0; i < SceneManager.sceneCount; i++)
            {
                Scene scene = SceneManager.GetSceneAt(i);
                if (scene.isLoaded && ScreenCatalog.TryGetBySceneName(scene.name, out ScreenInfo info))
                {
                    adopt = info;
                    break;
                }
            }

            ScreenInfo first = adopt ?? ScreenCatalog.Get(firstScreen);
            if (adopt == null) yield return SceneManager.LoadSceneAsync(first.SceneName, LoadSceneMode.Additive);
            yield return null;

            _current = FindController(first);
            Current = first;
            Phase = first.Phase;
            ActivateScreen(_current, first);
            if (chrome != null) chrome.RevealFromBlack(openingRevealSeconds);
            IsBusy = false;
            ScreenChanged?.Invoke(first);
            PhaseChanged?.Invoke(Phase);
        }

        /// <summary>Advances to the primary screen of <paramref name="next"/> if design section 17.3 allows it.</summary>
        public bool GoToPhase(GamePhase next)
        {
            if (IsBusy) return false;
            if (!GamePhaseMachine.CanTransition(Phase, next))
            {
                Debug.LogWarning("[MissionForge] Phase transition " + Phase + " → " + next + " is not allowed.");
                return false;
            }
            StartCoroutine(SwitchTo(ScreenCatalog.PrimaryFor(next)));
            return true;
        }

        /// <summary>Shows a secondary screen of the current phase (Test Stand, Design Review, Orbit Map) or returns to its primary.</summary>
        public bool ShowWithinPhase(ScreenId id)
        {
            ScreenInfo info = ScreenCatalog.Get(id);
            if (IsBusy || info.Kind == ScreenKind.Overlay || info.Phase != Phase || info == Current) return false;
            StartCoroutine(SwitchTo(info));
            return true;
        }

        /// <summary>Opens an overlay screen (Minigame, Codex, Settings) above the current screen.</summary>
        public bool OpenOverlay(ScreenId id)
        {
            ScreenInfo info = ScreenCatalog.Get(id);
            if (IsBusy || info.Kind != ScreenKind.Overlay || Overlay != null) return false;
            StartCoroutine(OpenOverlayRoutine(info));
            return true;
        }

        public bool CloseOverlay()
        {
            if (IsBusy || Overlay == null) return false;
            StartCoroutine(CloseOverlayRoutine());
            return true;
        }

        private IEnumerator SwitchTo(ScreenInfo next)
        {
            IsBusy = true;
            ScreenController previous = _current;
            ScreenInfo previousInfo = Current;
            if (previous != null) previous.SetShown(false);

            AsyncOperation load = SceneManager.LoadSceneAsync(next.SceneName, LoadSceneMode.Additive);
            float fadeEnds = Time.unscaledTime + uiFadeSeconds;
            yield return load;
            while (Time.unscaledTime < fadeEnds) yield return null;

            _current = FindController(next);
            Current = next;
            bool phaseChanged = next.Phase != Phase;
            Phase = next.Phase;
            ActivateScreen(_current, next);
            ScreenChanged?.Invoke(next);
            if (phaseChanged) PhaseChanged?.Invoke(Phase);

            // Keep the outgoing vantage alive until the camera has finished blending away from it.
            if (previous != null)
            {
                bool cameraMoves = previous.Vantage != null && _current != null && _current.Vantage != null;
                if (cameraMoves) yield return new WaitForSecondsRealtime(cameraBlendSeconds);
                previous.Exit();
                yield return SceneManager.UnloadSceneAsync(previousInfo.SceneName);
            }
            IsBusy = false;
        }

        private IEnumerator OpenOverlayRoutine(ScreenInfo info)
        {
            IsBusy = true;
            if (_current != null) _current.SetShown(false);
            yield return SceneManager.LoadSceneAsync(info.SceneName, LoadSceneMode.Additive);
            yield return null;
            _overlay = FindController(info);
            Overlay = info;
            ActivateScreen(_overlay, info);
            ScreenChanged?.Invoke(info);
            IsBusy = false;
        }

        private IEnumerator CloseOverlayRoutine()
        {
            IsBusy = true;
            ScreenInfo info = Overlay;
            if (_overlay != null)
            {
                _overlay.SetShown(false);
                yield return new WaitForSecondsRealtime(uiFadeSeconds);
                _overlay.Exit();
            }
            yield return SceneManager.UnloadSceneAsync(info.SceneName);
            _overlay = null;
            Overlay = null;
            if (_current != null) _current.SetShown(true);
            if (chrome != null && Current != null) chrome.ShowScreen(Current, Phase);
            ScreenChanged?.Invoke(Current);
            IsBusy = false;
        }

        private void ActivateScreen(ScreenController controller, ScreenInfo info)
        {
            if (chrome != null) chrome.ShowScreen(info, Phase);
            if (controller == null)
            {
                Debug.LogError("[MissionForge] Scene " + info.SceneName + " has no ScreenController.");
                return;
            }
            CinemachineCamera vantage = controller.Vantage;
            if (vantage != null)
            {
                _vantagePriority++;
                PrioritySettings priority = vantage.Priority;
                priority.Enabled = true;
                priority.Value = _vantagePriority;
                vantage.Priority = priority;
            }
            controller.Enter(AppRoot.Instance);
            StartCoroutine(ShowNextFrame(controller));
        }

        // The UI needs one laid-out frame in its hidden state for the fade-in transition to run.
        private static IEnumerator ShowNextFrame(ScreenController controller)
        {
            yield return null;
            yield return null;
            if (controller != null) controller.SetShown(true);
        }

        private static ScreenController FindController(ScreenInfo info)
        {
            Scene scene = SceneManager.GetSceneByName(info.SceneName);
            if (!scene.IsValid() || !scene.isLoaded) return null;
            foreach (GameObject root in scene.GetRootGameObjects())
            {
                ScreenController controller = root.GetComponentInChildren<ScreenController>(true);
                if (controller != null) return controller;
            }
            return null;
        }
    }
}
