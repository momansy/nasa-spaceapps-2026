using Unity.Cinemachine;
using UnityEngine;
using UnityEngine.UIElements;

namespace MissionForge.App
{
    /// <summary>
    /// Base class for the controller that lives in each screen scene. SceneFlow calls
    /// <see cref="Enter"/> once the scene is loaded and <see cref="Exit"/> before it unloads.
    /// </summary>
    public abstract class ScreenController : MonoBehaviour
    {
        private const string ShownClass = "mf-screen--shown";
        private const string ScreenElementName = "screen";

        [SerializeField] private ScreenId screenId;
        [SerializeField] private UIDocument document;
        [Tooltip("Camera vantage for this screen. Leave empty for overlays that keep the current view.")]
        [SerializeField] private CinemachineCamera vantage;

        public ScreenId ScreenId => screenId;
        public CinemachineCamera Vantage => vantage;
        protected AppRoot App { get; private set; }

        /// <summary>The element named "screen" in this screen's UXML.</summary>
        protected VisualElement Screen { get; private set; }

        public void Configure(ScreenId id, UIDocument uiDocument, CinemachineCamera camera)
        {
            screenId = id;
            document = uiDocument;
            vantage = camera;
        }

        public void Enter(AppRoot app)
        {
            App = app;
            VisualElement root = document != null ? document.rootVisualElement : null;
            if (root == null)
            {
                Debug.LogError("[MissionForge] Screen " + screenId + " has no UI document.", this);
                return;
            }
            root.pickingMode = PickingMode.Ignore;
            Screen = root.Q<VisualElement>(ScreenElementName) ?? root;
            OnEnter();
        }

        public void Exit()
        {
            OnExit();
            App = null;
        }

        /// <summary>Fades the screen UI in or out through the theme's transition.</summary>
        public void SetShown(bool shown)
        {
            if (Screen == null) return;
            Screen.EnableInClassList(ShownClass, shown);
            Screen.SetEnabled(shown);
        }

        protected abstract void OnEnter();

        protected virtual void OnExit()
        {
        }
    }
}
