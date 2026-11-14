using System;
using System.Collections.Generic;
using MissionForge.Net;
using MissionForge.UI;
using UnityEngine;
using UnityEngine.UIElements;

namespace MissionForge.App.Screens
{
    /// <summary>
    /// Host screen 2 (design 14.1): crew avatars appear as phones join (driven by room.state), each
    /// with a role chip (from roles.state); the host edits mission settings, which go to the server
    /// as settings.set and come back as settings.state (protocol/messages.md).
    /// </summary>
    public sealed class LobbyScreen : ScreenController
    {
        /// <summary>Maximum voting players in a room (design 3.2, room.created.maxPlayers).</summary>
        public const int MaxCrew = ProtocolNames.Defaults.MaxPlayers;

        private const string SeatEnterClass = "mf-seat--enter";
        private const string SegmentItemClass = MfSegmented.ItemClass;
        private const string SegmentOnClass = MfSegmented.OnClass;
        private const string CodeEmptyClass = "mf-roomcode-big--empty";
        // Designed empty and away states (T031). Inline like the rest of this screen's T008 copy.
        private const string WaitingForCrewText = "Waiting for crew";
        private const string NoRoleText = "No role yet";
        private const string AwayText = "Reconnecting";
        private static readonly Color32 QrDark = MfPalette.QrDark;
        private static readonly Color32 QrLight = MfPalette.QrLight;

        private sealed class Slot
        {
            public MfSeatCard Card;
            public string PlayerId;
        }

        private readonly List<Slot> _slots = new List<Slot>(MaxCrew);
        private readonly Dictionary<string, Dictionary<string, Button>> _segments = new Dictionary<string, Dictionary<string, Button>>();
        private VisualElement _qrImage;
        private Label _crewCount;
        private Label _hint;
        private Label _code;
        private Label _joinUrl;
        private Button _start;
        private Texture2D _qrTexture;
        private string _qrCodeShown;
        private RoomClient _client;
        private int _crewShown;
        private IVisualElementScheduledItem _crewCountUp;

        protected override void OnEnter()
        {
            _qrImage = Screen.Q<VisualElement>("qr-image");
            _crewCount = Screen.Q<Label>("crew-count");
            _hint = Screen.Q<Label>("lobby-hint");
            _code = Screen.Q<Label>("lobby-code");
            _joinUrl = Screen.Q<Label>("join-url");
            _start = Screen.Q<Button>("btn-start");
            _start.clicked += () => App.Flow.GoToPhase(GamePhase.Briefing);
            MfButtons.WithIcon(_start, "rocket");
            _start.SetEnabled(false);

            BuildSlots(Screen.Q<VisualElement>("crew-grid"));
            BuildSegment("seg-role-mode", ProtocolNames.Fields.RoleAssignMode,
                (ProtocolNames.RoleAssignModes.Random, "Random"),
                (ProtocolNames.RoleAssignModes.Pick, "Player pick"),
                (ProtocolNames.RoleAssignModes.Vote, "Vote"));
            BuildSegment("seg-assist", ProtocolNames.Fields.AssistLevel,
                (ProtocolNames.AssistLevels.Cadet, "Cadet"),
                (ProtocolNames.AssistLevels.Engineer, "Engineer"),
                (ProtocolNames.AssistLevels.FlightDirector, "Flight Director"));
            // Contract range of voteTimerS is 10–60 s, default 20.
            BuildSegment("seg-vote-timer", ProtocolNames.Fields.VoteTimerS,
                ("20", "20 s"), ("30", "30 s"), ("45", "45 s"), ("60", "60 s"));
            BuildSegment("seg-tallies", ProtocolNames.Fields.TallyVisibility,
                (ProtocolNames.TallyVisibilities.Open, "Open"),
                (ProtocolNames.TallyVisibilities.Hidden, "Hidden"));

            _client = App != null && App.Room != null ? App.Room.Client : null;
            if (_client == null) return;
            _client.RoomStateChanged += OnRoomState;
            _client.SettingsChanged += OnSettings;
            _client.RolesStateChanged += OnRolesState;
            ShowRoomCode(_client.RoomCode);
            if (_client.LastSettings != null) OnSettings(_client.LastSettings);
            if (_client.LastRoomState != null) OnRoomState(_client.LastRoomState);
        }

        protected override void OnExit()
        {
            if (_client != null)
            {
                _client.RoomStateChanged -= OnRoomState;
                _client.SettingsChanged -= OnSettings;
                _client.RolesStateChanged -= OnRolesState;
            }
            if (_qrTexture != null) Destroy(_qrTexture);
        }

        private void BuildSlots(VisualElement grid)
        {
            grid.Clear();
            _slots.Clear();
            for (int i = 0; i < MaxCrew; i++)
            {
                var card = new MfSeatCard { name = "crew-slot-" + i };
                card.SetEmpty(WaitingForCrewText);
                grid.Add(card);
                _slots.Add(new Slot { Card = card });
            }
        }

        private void BuildSegment(string elementName, string settingKey, params (string value, string label)[] options)
        {
            VisualElement host = Screen.Q<VisualElement>(elementName);
            host.Clear();
            var buttons = new Dictionary<string, Button>();
            foreach ((string value, string label) in options)
            {
                string captured = value;
                var button = new Button(() => SendSetting(settingKey, captured)) { text = label, name = elementName + "-" + value };
                button.AddToClassList(SegmentItemClass);
                host.Add(button);
                buttons[value] = button;
            }
            _segments[settingKey] = buttons;
        }

        private void SendSetting(string key, string value)
        {
            SelectSegment(key, value); // Optimistic; the server's settings.state confirms or corrects it.
            if (_client == null) return;
            var patch = new SettingsPatchDto();
            switch (key)
            {
                case ProtocolNames.Fields.RoleAssignMode: patch.RoleAssignMode = value; break;
                case ProtocolNames.Fields.AssistLevel: patch.AssistLevel = value; break;
                case ProtocolNames.Fields.VoteTimerS: patch.VoteTimerS = int.Parse(value); break;
                case ProtocolNames.Fields.TallyVisibility: patch.TallyVisibility = value; break;
                default: return;
            }
            _client.UpdateSettings(patch);
        }

        private void SelectSegment(string key, string value)
        {
            if (!_segments.TryGetValue(key, out Dictionary<string, Button> buttons)) return;
            foreach (KeyValuePair<string, Button> pair in buttons)
            {
                pair.Value.EnableInClassList(SegmentOnClass, pair.Key == value);
            }
        }

        private void OnSettings(RoomSettingsDto settings)
        {
            SelectSegment(ProtocolNames.Fields.RoleAssignMode, settings.RoleAssignMode);
            SelectSegment(ProtocolNames.Fields.AssistLevel, settings.AssistLevel);
            SelectSegment(ProtocolNames.Fields.VoteTimerS, settings.VoteTimerS.ToString());
            SelectSegment(ProtocolNames.Fields.TallyVisibility, settings.TallyVisibility);
        }

        private void OnRolesState(RolesStateDto roles)
        {
            if (_client != null && _client.LastRoomState != null) OnRoomState(_client.LastRoomState);
        }

        /// <summary>Roles of a player from the last roles.state, e.g. "FLIGHT+PM"; null when none yet.</summary>
        private string RoleLabelFor(string playerId)
        {
            RolesStateDto roles = _client != null ? _client.LastRolesState : null;
            if (roles == null) return null;
            List<string> held = roles.RolesOf(playerId);
            return held.Count == 0 ? null : string.Join("+", held);
        }

        private void OnRoomState(RoomStateDto state)
        {
            ShowRoomCode(state.Room);

            // room.state lists players only (spectators are just counted), ordered by slot 1–10.
            var seats = new PlayerInfoDto[_slots.Count];
            int crewCount = 0;
            foreach (PlayerInfoDto player in state.Players)
            {
                int index = player.Slot - 1;
                if (index < 0 || index >= seats.Length || seats[index] != null) continue;
                seats[index] = player;
                if (player.Connected) crewCount++; // A dropped phone keeps its seat but is not counted as present.
            }

            for (int i = 0; i < _slots.Count; i++)
            {
                Slot slot = _slots[i];
                if (seats[i] == null)
                {
                    slot.PlayerId = null;
                    slot.Card.RemoveFromClassList(SeatEnterClass);
                    slot.Card.SetEmpty(WaitingForCrewText);
                    continue;
                }

                PlayerInfoDto player = seats[i];
                bool isNew = slot.PlayerId != player.Id;
                slot.PlayerId = player.Id;
                slot.Card.SetPlayer(player.Avatar.SuitId, player.Nickname, RoleLabelFor(player.Id), NoRoleText, player.Connected, AwayText);
                if (isNew)
                {
                    // Enter motion for a newly seated player (staggered, honours reduced motion).
                    MfMotion.Enter(slot.Card, i, SeatEnterClass);
                }
            }

            ShowCrewCount(crewCount);
            _start.SetEnabled(crewCount >= 1);
            _hint.text = crewCount == 0
                ? "Waiting for the first crew member to join."
                : crewCount < 3
                    ? "Ready when you are. Three or more crew gives the full party feel."
                    : "Crew is assembling. Start the briefing when everyone is in.";
        }

        private void ShowRoomCode(string code)
        {
            if (string.IsNullOrEmpty(code) || code == _qrCodeShown) return;
            _qrCodeShown = code;
            _code.text = code;
            _code.RemoveFromClassList(CodeEmptyClass);
            string joinUrl = App.Room.BuildJoinUrl(code, _client != null && _client.RoomCode == code ? _client.JoinUrl : null);
            // The QR keeps the full URL; the panel shows only a public host (a localhost dev URL is never shown).
            string host = JoinUrlDisplay.PublicHost(joinUrl);
            _joinUrl.text = host;
            _joinUrl.style.display = host.Length == 0 ? DisplayStyle.None : DisplayStyle.Flex;
            if (_qrTexture != null) Destroy(_qrTexture);
            _qrTexture = QrCodeTexture.Create(joinUrl, QrDark, QrLight);
            _qrImage.style.backgroundImage = new StyleBackground(_qrTexture);
        }

        /// <summary>The seat KPI counts up to the new value (count token; reduced motion jumps straight to it).</summary>
        private void ShowCrewCount(int crewCount)
        {
            if (crewCount == _crewShown) return;
            _crewCountUp?.Pause();
            int from = int.TryParse(_crewCount.text, out int shown) ? shown : 0;
            _crewShown = crewCount;
            _crewCountUp = MfMotion.CountUp(_crewCount, from, crewCount, v => Math.Round(v).ToString("0"));
        }
    }
}
