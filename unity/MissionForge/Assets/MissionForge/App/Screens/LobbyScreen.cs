using System.Collections.Generic;
using MissionForge.Net;
using MissionForge.UI;
using UnityEngine;
using UnityEngine.UIElements;

namespace MissionForge.App.Screens
{
    /// <summary>
    /// Host screen 2 (design 14.1): crew avatars appear as phones join (driven by room.state), each
    /// with a role chip; the host edits mission settings, which go to the server as room.settings.
    /// </summary>
    public sealed class LobbyScreen : ScreenController
    {
        /// <summary>Maximum voting players in a room (design 3.2).</summary>
        public const int MaxCrew = 10;

        private const string CardClass = "mf-crewcard";
        private const string CardInClass = "mf-crewcard--in";
        private const string CardAwayClass = "mf-crewcard--away";
        private const string CardEmptyClass = "mf-crewcard--empty";
        private const string SegmentItemClass = "mf-segment__item";
        private const string SegmentOnClass = "mf-segment__item--on";
        private static readonly Color32 QrDark = new Color32(8, 13, 24, 255);
        private static readonly Color32 QrLight = new Color32(255, 255, 255, 255);

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
            BuildSegment("seg-role-mode", ProtocolNames.Fields.RoleMode,
                ("random", "Random"), ("pick", "Player pick"), ("vote", "Vote"));
            BuildSegment("seg-assist", ProtocolNames.Fields.Assist,
                ("cadet", "Cadet"), ("engineer", "Engineer"), ("flight_director", "Flight Director"));
            BuildSegment("seg-vote-timer", ProtocolNames.Fields.VoteTimerS,
                ("20", "20 s"), ("30", "30 s"), ("45", "45 s"), ("60", "60 s"));
            BuildSegment("seg-tallies", ProtocolNames.Fields.HiddenTallies,
                ("false", "Open"), ("true", "Hidden"));

            _client = App != null && App.Room != null ? App.Room.Client : null;
            if (_client == null) return;
            _client.RoomStateChanged += OnRoomState;
            ShowRoomCode(_client.RoomCode, null);
            if (_client.LastRoomState != null) OnRoomState(_client.LastRoomState);
        }

        protected override void OnExit()
        {
            if (_client != null) _client.RoomStateChanged -= OnRoomState;
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
                slot.Empty = new Label("SEAT " + (i + 1).ToString("00") + "\nOPEN");
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
            SelectSegment(key, value); // Optimistic; the server's room.state confirms or corrects it.
            if (_client == null) return;
            object typed = value;
            if (key == ProtocolNames.Fields.VoteTimerS) typed = int.Parse(value);
            else if (key == ProtocolNames.Fields.HiddenTallies) typed = value == "true";
            _client.Send(ProtocolNames.Messages.RoomSettings, new Dictionary<string, object> { { key, typed } });
        }

        private void SelectSegment(string key, string value)
        {
            if (!_segments.TryGetValue(key, out Dictionary<string, Button> buttons)) return;
            foreach (KeyValuePair<string, Button> pair in buttons)
            {
                pair.Value.EnableInClassList(SegmentOnClass, pair.Key == value);
            }
        }

        private void OnRoomState(RoomStateDto state)
        {
            ShowRoomCode(state.Code, null);

            var crew = new List<PlayerDto>();
            if (state.Players != null)
            {
                foreach (PlayerDto player in state.Players)
                {
                    if (!player.Spectator && crew.Count < MaxCrew) crew.Add(player);
                }
            }

            for (int i = 0; i < _slots.Count; i++)
            {
                Slot slot = _slots[i];
                if (i >= crew.Count)
                {
                    slot.PlayerId = null;
                    slot.Card.AddToClassList(CardEmptyClass);
                    slot.Card.RemoveFromClassList(CardInClass);
                    slot.Card.RemoveFromClassList(CardAwayClass);
                    SetOccupied(slot, false);
                    continue;
                }

                PlayerDto player = crew[i];
                bool isNew = slot.PlayerId != player.Id;
                slot.PlayerId = player.Id;
                slot.Avatar.SetIdentity(player.Avatar, player.Nickname);
                slot.Name.text = player.Nickname;
                bool hasRole = !string.IsNullOrEmpty(player.Role);
                slot.RoleLabel.text = hasRole ? player.Role : "NO ROLE YET";
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

            _crewCount.text = crew.Count.ToString();
            _start.SetEnabled(crew.Count >= 1);
            _hint.text = crew.Count == 0
                ? "Waiting for the first crew member to join."
                : crew.Count < 3
                    ? "Ready when you are. Three or more crew gives the full party feel."
                    : "Crew is assembling. Start the briefing when everyone is in.";

            if (state.Settings != null)
            {
                SelectSegment(ProtocolNames.Fields.RoleMode, state.Settings.RoleMode);
                SelectSegment(ProtocolNames.Fields.Assist, state.Settings.Assist);
                SelectSegment(ProtocolNames.Fields.VoteTimerS, state.Settings.VoteTimerS.ToString());
                SelectSegment(ProtocolNames.Fields.HiddenTallies, state.Settings.HiddenTallies ? "true" : "false");
            }
        }

        private void ShowRoomCode(string code, string serverJoinUrl)
        {
            if (string.IsNullOrEmpty(code) || code == _qrCodeShown) return;
            _qrCodeShown = code;
            _code.text = code;
            string joinUrl = App.Room.BuildJoinUrl(code, serverJoinUrl);
            _joinUrl.text = joinUrl;
            if (_qrTexture != null) Destroy(_qrTexture);
            _qrTexture = QrCodeTexture.Create(joinUrl, QrDark, QrLight);
            _qrImage.style.backgroundImage = new StyleBackground(_qrTexture);
        }
    }
}
