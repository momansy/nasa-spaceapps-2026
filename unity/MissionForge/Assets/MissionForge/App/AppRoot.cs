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

        /// <summary>phase.set missionSeq: 0 before the first mission, +1 each time a briefing starts a new mission.</summary>
        public int MissionSeq { get; private set; }

        private bool _resumeAfterSnapshot;

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
            if (room != null)
            {
                room.Client.RoomResumed += OnRoomResumed;
                room.Client.SnapshotEnded += OnSnapshotEnded;
                room.ConnectIfNeeded();
            }
            if (flow != null) flow.PhaseChanged += OnPhaseChanged;
        }

        private void OnDestroy()
        {
            if (flow != null) flow.PhaseChanged -= OnPhaseChanged;
            if (room != null && room.Client != null)
            {
                room.Client.RoomResumed -= OnRoomResumed;
                room.Client.SnapshotEnded -= OnSnapshotEnded;
            }
            if (Instance == this) Instance = null;
        }

        private void OnPhaseChanged(GamePhase phase)
        {
            if (phase == GamePhase.Briefing) MissionSeq++;
            SendPhase(phase);
        }

        /// <summary>Announces the host phase with phase.set; the room server relays it to every phone.</summary>
        private void SendPhase(GamePhase phase)
        {
            if (room == null || phase == GamePhase.Title) return; // TITLE is host-only, not a protocol Phase.
            RoomClient client = room.Client;
            if (client == null || string.IsNullOrEmpty(client.RoomCode)) return;
            client.SetPhase(PhaseSetDto.ForPhase(GamePhaseMachine.WireName(phase), MissionSeq));
        }

        private void OnRoomResumed(RoomResumedDto resumed)
        {
            // After a host reconnect the room stays paused until the host has restored its state
            // (messages.md 4.4): wait for the snapshot, re-send the sticky phase, then resume.
            _resumeAfterSnapshot = resumed.Paused;
        }

        private void OnSnapshotEnded(SnapshotEndDto end)
        {
            if (!_resumeAfterSnapshot) return;
            _resumeAfterSnapshot = false;
            if (flow != null) SendPhase(flow.Phase);
            room.Client.ResumeGame();
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
