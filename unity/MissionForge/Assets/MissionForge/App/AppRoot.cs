using MissionForge.Data;
using MissionForge.Net;
using UnityEngine;
using UnityEngine.SceneManagement;

namespace MissionForge.App
{
    /// <summary>
    /// Root of the persistent Shell scene: owns the scene flow, the room connection, the game data
    /// and the chrome. Screen scenes reach shared services through <see cref="Instance"/>.
    /// </summary>
    [DefaultExecutionOrder(-200)]
    public sealed class AppRoot : MonoBehaviour
    {
        public static AppRoot Instance { get; private set; }

        [SerializeField] private SceneFlow flow;
        [SerializeField] private ChromeController chrome;
        [SerializeField] private RoomClientBehaviour room;
        [SerializeField] private GameDataService data;

        public SceneFlow Flow => flow;
        public ChromeController Chrome => chrome;
        public RoomClientBehaviour Room => room;
        public GameDataService Data => data;

        private void Awake()
        {
            if (Instance != null && Instance != this)
            {
                Destroy(gameObject);
                return;
            }
            Instance = this;
            Application.targetFrameRate = -1;
            if (data != null) data.Loaded += set => CoreGateway.Current.LoadCatalog(set.JsonByPath);
        }

        private void Start()
        {
            if (room != null) room.ConnectIfNeeded();
            if (flow != null) flow.PhaseChanged += OnPhaseChanged;
        }

        private void OnDestroy()
        {
            if (flow != null) flow.PhaseChanged -= OnPhaseChanged;
            if (Instance == this) Instance = null;
        }

        private void OnPhaseChanged(GamePhase phase)
        {
            // The room server relays the phase to every phone (room.state.phase).
            if (room == null || phase == GamePhase.Title) return;
            RoomClient client = room.Client;
            if (client == null || string.IsNullOrEmpty(client.RoomCode)) return;
            client.SetPhase(GamePhaseMachine.WireName(phase));
        }

        /// <summary>
        /// Lets any screen scene be played on its own in the editor: when Play starts in a scene that
        /// is not the Shell, the Shell is loaded additively and adopts the open screen.
        /// </summary>
        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
        private static void EnsureShell()
        {
            if (Instance != null) return;
            Scene active = SceneManager.GetActiveScene();
            if (!ScreenCatalog.TryGetBySceneName(active.name, out _)) return; // Not a MissionForge screen (for example a test scene).
            SceneManager.LoadScene(ScreenCatalog.ShellSceneName, LoadSceneMode.Additive);
        }
    }
}
