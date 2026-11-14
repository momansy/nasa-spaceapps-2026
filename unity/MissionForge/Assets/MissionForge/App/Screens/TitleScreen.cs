using MissionForge.Net;
using MissionForge.UI;
using UnityEngine;
using UnityEngine.UIElements;

namespace MissionForge.App.Screens
{
    /// <summary>
    /// Host screen 1 (design 14.1): logo, New Mission, then the room code and join QR (design 3.1).
    /// </summary>
    public sealed class TitleScreen : ScreenController
    {
        private const string RoomPanelShownClass = "mf-roompanel--shown";
        private const int RoomCodeLength = ProtocolNames.RoomCodeLength;
        private static readonly Color32 QrDark = MfPalette.QrDark;
        private static readonly Color32 QrLight = MfPalette.QrLight;

        private VisualElement _roomPanel;
        private VisualElement _qrImage;
        private VisualElement _serverChip;
        private MfIcon _serverIcon;
        private Label _serverLabel;
        private Label _joinUrl;
        private Label _joinedCount;
        private Label _roomStatus;
        private Button _newMission;
        private readonly Label[] _codeCells = new Label[RoomCodeLength];
        private Texture2D _qrTexture;
        private RoomClient _client;
        private bool _roomRequested;

        protected override void OnEnter()
        {
            _roomPanel = Screen.Q<VisualElement>("room-panel");
            _qrImage = Screen.Q<VisualElement>("qr-image");
            _serverChip = Screen.Q<VisualElement>("server-chip");
            _serverIcon = Screen.Q<MfIcon>("server-icon");
            _serverLabel = Screen.Q<Label>("server-label");
            _joinUrl = Screen.Q<Label>("join-url");
            _joinedCount = Screen.Q<Label>("joined-count");
            _roomStatus = Screen.Q<Label>("room-status");
            _newMission = Screen.Q<Button>("btn-new-mission");
            for (int i = 0; i < RoomCodeLength; i++) _codeCells[i] = Screen.Q<Label>("code-" + i);

            _newMission.clicked += OnNewMission;
            MfButtons.WithIcon(_newMission, "rocket");
            MfButtons.WithIcon(Screen.Q<Button>("btn-codex"), "book-open");
            MfButtons.WithIcon(Screen.Q<Button>("btn-settings"), "settings");
            MfButtons.WithIcon(Screen.Q<Button>("btn-open-lobby"), "users");
            // Staggered entry: logo lockup, then pitch and actions (motion tokens; reduced motion fades only).
            MfMotion.Enter(Screen.Q<VisualElement>("title-brand"), 0);
            MfMotion.Enter(Screen.Q<VisualElement>("title-left"), 3);
            Screen.Q<Button>("btn-open-lobby").clicked += OnOpenLobby;
            Screen.Q<Button>("btn-codex").clicked += () => App.Flow.OpenOverlay(ScreenId.Codex);
            Screen.Q<Button>("btn-settings").clicked += () => App.Flow.OpenOverlay(ScreenId.Settings);

            _client = App != null && App.Room != null ? App.Room.Client : null;
            if (_client != null)
            {
                _client.StateChanged += OnConnectionChanged;
                _client.RoomCreated += OnRoomCreated;
                _client.RoomStateChanged += OnRoomState;
                _client.ServerError += OnServerError;
                _client.ByeReceived += OnBye;
                OnConnectionChanged(_client.State);
                if (!string.IsNullOrEmpty(_client.RoomCode)) ShowRoom(_client.RoomCode, _client.JoinUrl);
                if (_client.LastRoomState != null) OnRoomState(_client.LastRoomState);
            }
            else
            {
                OnConnectionChanged(ConnectionState.Disconnected);
            }
        }

        protected override void OnExit()
        {
            if (_client != null)
            {
                _client.StateChanged -= OnConnectionChanged;
                _client.RoomCreated -= OnRoomCreated;
                _client.RoomStateChanged -= OnRoomState;
                _client.ServerError -= OnServerError;
                _client.ByeReceived -= OnBye;
            }
            if (_qrTexture != null) Destroy(_qrTexture);
        }

        private void OnNewMission()
        {
            if (_client == null) return;
            if (!string.IsNullOrEmpty(_client.RoomCode))
            {
                ShowRoom(_client.RoomCode, _client.JoinUrl);
                return;
            }
            if (_roomRequested) return;
            _roomRequested = true;
            App.Room.ConnectIfNeeded();
            _client.CreateRoom(); // Queued by the client and sent as soon as hello.ok arrives.
            _newMission.text = _client.State == ConnectionState.Connected ? "Opening room…" : "Waiting for server…";
            _newMission.SetEnabled(false);
        }

        private void OnOpenLobby() => App.Flow.GoToPhase(GamePhase.Lobby);

        private void OnConnectionChanged(ConnectionState state)
        {
            string url = App != null && App.Room != null ? App.Room.ResolvedServerUrl : string.Empty;
            ConnectionVisual.Apply(_serverChip, _serverIcon, _serverLabel, state,
                "Room server: connected", "Room server: connecting", "Room server: reconnecting", "Room server: offline");
            _serverChip.tooltip = url;
            if (state == ConnectionState.Disconnected) ResetNewMission();
        }

        /// <summary>A refused room.create (or a dropped connection) must not leave New Mission disabled.</summary>
        private void OnServerError(ErrorDto error)
        {
            if (_roomRequested && string.IsNullOrEmpty(_client.RoomCode)) ResetNewMission();
        }

        /// <summary>The server closed the room for good: take its code and QR off the screen.</summary>
        private void OnBye(ByeDto bye)
        {
            if (bye.CanResume) return;
            _roomPanel.RemoveFromClassList(RoomPanelShownClass);
            _roomRequested = true; // Let ResetNewMission restore the button.
            ResetNewMission();
        }

        private void ResetNewMission()
        {
            if (!_roomRequested) return;
            _roomRequested = false;
            _newMission.text = "New mission";
            _newMission.SetEnabled(true);
        }

        private void OnRoomCreated(RoomCreatedDto created)
        {
            _roomRequested = false;
            ShowRoom(created.Room, created.JoinUrl);
        }

        private void OnRoomState(RoomStateDto state)
        {
            // room.state lists players only; spectators are counted separately.
            int joined = state.Players.Count;
            _joinedCount.text = joined.ToString();
            _roomStatus.text = joined == 0 ? "Waiting for crew" : "Crew arriving";
        }

        private void ShowRoom(string code, string serverJoinUrl)
        {
            for (int i = 0; i < RoomCodeLength; i++)
            {
                _codeCells[i].text = i < code.Length ? code[i].ToString() : string.Empty;
            }
            string joinUrl = App.Room.BuildJoinUrl(code, serverJoinUrl);
            _joinUrl.text = joinUrl;
            if (_qrTexture != null) Destroy(_qrTexture);
            _qrTexture = QrCodeTexture.Create(joinUrl, QrDark, QrLight);
            _qrImage.style.backgroundImage = new StyleBackground(_qrTexture);
            _roomPanel.AddToClassList(RoomPanelShownClass);
            _newMission.text = "Room open";
            _newMission.SetEnabled(false);
        }
    }
}
