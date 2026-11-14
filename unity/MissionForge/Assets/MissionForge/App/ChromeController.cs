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
        private const string StepClass = "mf-step";
        private const string StepDoneClass = "mf-step--done";
        private const string StepCurrentClass = "mf-step--current";

        [SerializeField] private UIDocument document;
        [SerializeField] private RoomClientBehaviour room;

        private VisualElement _topbar;
        private VisualElement _veil;
        private VisualElement _stepper;
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
            _stepper = root.Q<VisualElement>("stepper");
            _connChip = root.Q<VisualElement>("conn-chip");
            _connIcon = root.Q<MfIcon>("conn-icon");
            _connLabel = root.Q<Label>("conn-label");
            _title = root.Q<Label>("screen-title");
            _roomCode = root.Q<Label>("room-code");

            _stepper.Clear();
            foreach (GamePhase phase in GamePhaseMachine.MainLine)
            {
                var step = new Label(GamePhaseMachine.StepLabel(phase)) { name = "step-" + phase };
                step.AddToClassList(StepClass);
                _stepper.Add(step);
            }
        }

        /// <summary>Updates the bar for a screen. The Title screen is full-bleed, so the bar hides there.</summary>
        public void ShowScreen(ScreenInfo info, GamePhase phase)
        {
            if (_topbar == null) return;
            _topbar.EnableInClassList(TopbarShownClass, info.Id != ScreenId.Title);
            _title.text = info.Title;

            int currentIndex = System.Array.IndexOf(GamePhaseMachine.MainLine, phase);
            for (int i = 0; i < _stepper.childCount; i++)
            {
                VisualElement step = _stepper[i];
                step.EnableInClassList(StepDoneClass, currentIndex >= 0 && i < currentIndex);
                step.EnableInClassList(StepCurrentClass, i == currentIndex);
            }
        }

        /// <summary>Fades the black veil away over <paramref name="seconds"/>.</summary>
        public void RevealFromBlack(float seconds)
        {
            _veilFrom = 1f;
            _veilTo = 0f;
            _veilDuration = Mathf.Max(seconds, 0.01f);
            _veilElapsed = 0f;
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
            string code = string.IsNullOrEmpty(client.RoomCode) ? "----" : client.RoomCode;
            if (code != _shownCode)
            {
                _shownCode = code;
                _roomCode.text = code;
            }
            if (client.State == _shownState) return;
            _shownState = client.State;
            ConnectionVisual.Apply(_connChip, _connIcon, _connLabel, client.State, "LIVE", "CONNECTING", "RECONNECTING", "OFFLINE");
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
