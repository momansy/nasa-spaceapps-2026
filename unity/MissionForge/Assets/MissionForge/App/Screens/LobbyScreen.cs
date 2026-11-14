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

        private const string CardClass = "mf-crewcard";
        private const string CardInClass = "mf-crewcard--in";
        private const string CardAwayClass = "mf-crewcard--away";
        private const string CardEmptyClass = "mf-crewcard--empty";
        private const string SegmentItemClass = "mf-segment__item";
        private const string SegmentOnClass = "mf-segment__item--on";
        private static readonly Color32 QrDark = MfPalette.QrDark;
        private static readonly Color32 QrLight = MfPalette.QrLight;

        private sealed class Slot
        {
            public VisualElement Card;
            public AvatarBadge Avatar;
            public Label Name;
            public VisualElement RoleChip;
            public Label RoleLabel;
            public Label Empty;
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

        protected override void OnEnter()
        {
            _qrImage = Screen.Q<VisualElement>("qr-image");
            _crewCount = Screen.Q<Label>("crew-count");
            _hint = Screen.Q<Label>("lobby-hint");
            _code = Screen.Q<Label>("lobby-code");
            _joinUrl = Screen.Q<Label>("join-url");
            _start = Screen.Q<Button>("btn-start");
            _start.clicked += () => App.Flow.GoToPhase(GamePhase.Briefing);
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
                var slot = new Slot { Card = new VisualElement { name = "crew-slot-" + i } };
                slot.Card.AddToClassList(CardClass);
                slot.Card.AddToClassList(CardEmptyClass);

                slot.Avatar = new AvatarBadge();
                slot.Avatar.AddToClassList("mf-crewcard__avatar");
                slot.Name = new Label();
                slot.Name.AddToClassList("mf-crewcard__name");
                slot.RoleChip = new VisualElement();
                slot.RoleChip.AddToClassList("mf-chip");
                slot.RoleLabel = new Label();
                slot.RoleLabel.AddToClassList("mf-chip__label");
                slot.RoleLabel.style.marginLeft = 0;
                slot.RoleChip.Add(slot.RoleLabel);
                slot.Empty = new Label("Seat " + (i + 1).ToString("00") + "\nopen");
                slot.Empty.AddToClassList("mf-crewcard__slot");

                slot.Card.Add(slot.Avatar);
                slot.Card.Add(slot.Name);
                slot.Card.Add(slot.RoleChip);
                slot.Card.Add(slot.Empty);
                SetOccupied(slot, false);
                grid.Add(slot.Card);
                _slots.Add(slot);
            }
        }

        private static void SetOccupied(Slot slot, bool occupied)
        {
            DisplayStyle shown = occupied ? DisplayStyle.Flex : DisplayStyle.None;
            slot.Avatar.style.display = shown;
            slot.Name.style.display = shown;
            slot.RoleChip.style.display = shown;
            slot.Empty.style.display = occupied ? DisplayStyle.None : DisplayStyle.Flex;
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
                    slot.Card.AddToClassList(CardEmptyClass);
                    slot.Card.RemoveFromClassList(CardInClass);
                    slot.Card.RemoveFromClassList(CardAwayClass);
                    SetOccupied(slot, false);
                    continue;
                }

                PlayerInfoDto player = seats[i];
                bool isNew = slot.PlayerId != player.Id;
                slot.PlayerId = player.Id;
                slot.Avatar.SetIdentity(player.Avatar.SuitId, player.Nickname);
                slot.Name.text = player.Nickname;
                string role = RoleLabelFor(player.Id);
                bool hasRole = !string.IsNullOrEmpty(role);
                slot.RoleLabel.text = hasRole ? role : "No role yet";
                slot.RoleChip.EnableInClassList("mf-chip--forge", hasRole);
                slot.RoleChip.EnableInClassList("mf-chip--muted", !hasRole);
                slot.Card.RemoveFromClassList(CardEmptyClass);
                slot.Card.EnableInClassList(CardAwayClass, !player.Connected);
                SetOccupied(slot, true);
                if (isNew)
                {
                    // Re-run the pop-in transition for a newly seated player.
                    slot.Card.RemoveFromClassList(CardInClass);
                    VisualElement card = slot.Card;
                    card.schedule.Execute(() => card.AddToClassList(CardInClass)).StartingIn(40 + i * 30);
                }
            }

            _crewCount.text = crewCount.ToString();
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
            string joinUrl = App.Room.BuildJoinUrl(code, _client != null && _client.RoomCode == code ? _client.JoinUrl : null);
            _joinUrl.text = joinUrl;
            if (_qrTexture != null) Destroy(_qrTexture);
            _qrTexture = QrCodeTexture.Create(joinUrl, QrDark, QrLight);
            _qrImage.style.backgroundImage = new StyleBackground(_qrTexture);
        }
    }
}
