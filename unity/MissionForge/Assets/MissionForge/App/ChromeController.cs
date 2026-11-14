using MissionForge.Net;
using MissionForge.UI;
using UnityEngine;
using UnityEngine.UIElements;

namespace MissionForge.App
{
    /// <summary>
    /// The persistent top bar (screen title, phase stepper, room code, connection state) and the
    /// black veil used for the opening reveal. Lives in the Shell scene above every screen.
    /// </summary>
    public sealed class ChromeController : MonoBehaviour
    {
        private const string TopbarShownClass = "mf-topbar--shown";
        private const string RoomEmptyClass = "mf-roomcode__value--empty";
        private const string RoomEmptyText = "Not open";

        [SerializeField] private UIDocument document;
        [SerializeField] private RoomClientBehaviour room;

        private VisualElement _topbar;
        private VisualElement _veil;
        private MfPhaseStepper _stepper;
        private VisualElement _connChip;
        private MfIcon _connIcon;
        private Label _connLabel;
        private Label _title;
        private Label _roomCode;
        private float _veilFrom;
        private float _veilTo;
        private float _veilDuration;
        private float _veilElapsed = -1f;
        private ConnectionState _shownState = (ConnectionState)(-1);
        private string _shownCode;

        private void OnEnable()
        {
            VisualElement root = document.rootVisualElement;
            root.pickingMode = PickingMode.Ignore;
            _topbar = root.Q<VisualElement>("topbar");
            _veil = root.Q<VisualElement>("veil");
            _stepper = root.Q<MfPhaseStepper>("stepper");
            _connChip = root.Q<VisualElement>("conn-chip");
            _connIcon = root.Q<MfIcon>("conn-icon");
            _connLabel = root.Q<Label>("conn-label");
            _title = root.Q<Label>("screen-title");
            _roomCode = root.Q<Label>("room-code");

            var labels = new System.Collections.Generic.List<string>();
            foreach (GamePhase phase in GamePhaseMachine.MainLine) labels.Add(SentenceCase(GamePhaseMachine.StepLabel(phase)));
            _stepper.SetSteps(labels);
        }

        /// <summary>Updates the bar for a screen. The Title screen is full-bleed, so the bar hides there.</summary>
        public void ShowScreen(ScreenInfo info, GamePhase phase)
        {
            if (_topbar == null) return;
            _topbar.EnableInClassList(TopbarShownClass, info.Id != ScreenId.Title);
            _title.text = info.Title;

            _stepper.SetCurrent(System.Array.IndexOf(GamePhaseMachine.MainLine, phase));
        }

        /// <summary>Fades the black veil away over <paramref name="seconds"/>.</summary>
        public void RevealFromBlack(float seconds)
        {
            _veilFrom = 1f;
            _veilTo = 0f;
            _veilDuration = Mathf.Max(seconds, 0.01f);
            _veilElapsed = 0f;
        }

        /// <summary>Phase step labels arrive in capitals ("COUNTDOWN"); identifiers of 3 letters or fewer (FRR) stay caps.</summary>
        private static string SentenceCase(string label)
        {
            if (string.IsNullOrEmpty(label) || label.Length <= 3) return label;
            return label.Substring(0, 1).ToUpperInvariant() + label.Substring(1).ToLowerInvariant();
        }

        private void Update()
        {
            if (_veil != null && _veilElapsed >= 0f)
            {
                _veilElapsed += Time.unscaledDeltaTime;
                float t = Mathf.Clamp01(_veilElapsed / _veilDuration);
                float eased = t * t * (3f - 2f * t);
                _veil.style.opacity = Mathf.Lerp(_veilFrom, _veilTo, eased);
                if (t >= 1f)
                {
                    _veilElapsed = -1f;
                    _veil.style.display = _veilTo <= 0f ? DisplayStyle.None : DisplayStyle.Flex;
                }
            }
            RefreshConnection();
        }

        private void RefreshConnection()
        {
            if (room == null || room.Client == null || _connLabel == null) return;
            RoomClient client = room.Client;
            string code = client.RoomCode ?? string.Empty;
            if (code != _shownCode)
            {
                _shownCode = code;
                bool empty = code.Length == 0;
                _roomCode.text = empty ? RoomEmptyText : code;
                _roomCode.EnableInClassList(RoomEmptyClass, empty);
            }
            if (client.State == _shownState) return;
            _shownState = client.State;
            ConnectionVisual.Apply(_connChip, _connIcon, _connLabel, client.State, "LIVE", "Connecting", "Reconnecting", "Offline");
        }
    }

    /// <summary>Shared mapping from connection state to chip style, icon and words (never colour alone).</summary>
    public static class ConnectionVisual
    {
        public static void Apply(VisualElement chip, MfIcon icon, Label label, ConnectionState state,
            string connected, string connecting, string reconnecting, string offline)
        {
            chip.RemoveFromClassList("mf-chip--good");
            chip.RemoveFromClassList("mf-chip--warn");
            chip.RemoveFromClassList("mf-chip--bad");
            chip.RemoveFromClassList("mf-chip--muted");
            switch (state)
            {
                case ConnectionState.Connected:
                    chip.AddToClassList("mf-chip--good");
                    icon.kind = "check";
                    icon.Tint = MfPalette.Good;
                    label.text = connected;
                    break;
                case ConnectionState.Connecting:
                    chip.AddToClassList("mf-chip--warn");
                    icon.kind = "signal";
                    icon.Tint = MfPalette.Warn;
                    label.text = connecting;
                    break;
                case ConnectionState.Reconnecting:
                    chip.AddToClassList("mf-chip--warn");
                    icon.kind = "warn";
                    icon.Tint = MfPalette.Warn;
                    label.text = reconnecting;
                    break;
                default:
                    chip.AddToClassList("mf-chip--bad");
                    icon.kind = "cross";
                    icon.Tint = MfPalette.Bad;
                    label.text = offline;
                    break;
            }
        }
    }
}
