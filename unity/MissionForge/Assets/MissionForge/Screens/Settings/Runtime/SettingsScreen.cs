using System;
using System.Collections;
using System.Globalization;
using MissionForge.App;
using MissionForge.Net;
using MissionForge.UI;
using UnityEngine;
using UnityEngine.UIElements;

namespace MissionForge.Settings
{
    /// <summary>
    /// Controller of <c>MF_Settings</c> (design 14.1 screen 16, section 16), an overlay. Left: this screen's
    /// <see cref="HostPreferences"/> (saved locally, applied at once to every open screen). Middle: the six room-wide
    /// accessibility flags, sent with <c>settings.set</c> and shown as the server last confirmed (<c>settings.state</c>).
    /// Right: lobby rules (assist level, vote timer, tally visibility). Depends on no other screen.
    /// </summary>
    public sealed class SettingsScreen : ScreenController
    {
        private const float DataTimeoutSeconds = 20f;

        private Func<string, string> _text = k => "[" + k + "]";
        private HostPreferences _prefs;
        private RoomClient _client;
        private VisualElement _hostRows, _roomRows, _lobbyRows;
        private Coroutine _loading;

        /// <summary>Raised after the rows have been built (evidence waits for it).</summary>
        public event Action Built;

        protected override void OnEnter()
        {
            _prefs = HostPreferences.Current;
            HostPreferencesRuntime.Hook(_prefs);
            _hostRows = Screen.Q("host-rows");
            _roomRows = Screen.Q("room-rows");
            _lobbyRows = Screen.Q("lobby-rows");
            Button closeButton = Screen.Q<Button>("btn-close");
            if (closeButton != null) closeButton.clicked += Close;
            Button resetButton = Screen.Q<Button>("btn-reset");
            if (resetButton != null) resetButton.clicked += () => { _prefs.ResetToDefaults(); BuildHost(); };
            Screen.Query<ScrollView>(className: "mf-settings__scroll").ForEach(sv => MfScrollFade.Attach(sv));
            _loading = StartCoroutine(BuildWhenReady());
        }

        protected override void OnExit()
        {
            if (_loading != null) StopCoroutine(_loading);
            if (_client != null) _client.SettingsChanged -= OnRoomSettings;
            _client = null;
        }

        private IEnumerator BuildWhenReady()
        {
            float until = Time.realtimeSinceStartup + DataTimeoutSeconds;
            while (App == null || App.Data == null || !App.Data.IsReady)
            {
                if (Time.realtimeSinceStartup > until) break;
                yield return null;
            }
            if (App != null && App.Data != null && App.Data.Strings != null) _text = App.Data.Strings.Get;
            _client = App != null && App.Room != null ? App.Room.Client : null;
            if (_client != null) _client.SettingsChanged += OnRoomSettings;
            BuildAll();
            _loading = null;
        }

        private void Close()
        {
            if (App != null && App.Flow != null) App.Flow.CloseOverlay();
        }

        private void OnRoomSettings(RoomSettingsDto _)
        {
            BuildRoom();
            BuildLobby();
        }

        private void BuildAll()
        {
            SetText("settings-title", T("ui.host.settings.title"));
            Button close = Screen.Q<Button>("btn-close");
            if (close != null) { close.text = T("ui.host.settings.close"); MfButtons.WithIcon(close, "x"); FocusWhenShown(close); }
            Button reset = Screen.Q<Button>("btn-reset");
            if (reset != null) { reset.text = T("ui.host.settings.reset"); MfButtons.FitToText(reset); }
            SetText("host-title", T("ui.host.settings.section.host"));
            SetText("host-sub", T("ui.host.settings.section.host.sub"));
            SetText("room-title", T("ui.host.settings.section.room"));
            SetText("room-sub", T("ui.host.settings.section.room.sub"));
            SetText("lobby-title", T("ui.host.settings.section.lobby"));
            SetText("lobby-sub", T("ui.host.settings.section.lobby.sub"));
            BuildHost();
            BuildRoom();
            BuildLobby();
            Built?.Invoke();
        }

        // ---------- this screen ----------

        private void BuildHost()
        {
            if (_hostRows == null) return;
            _hostRows.Clear();
            AddVolume("ui.host.settings.volume.master", () => _prefs.MasterVolume, v => _prefs.MasterVolume = v);
            AddVolume("ui.host.settings.volume.music", () => _prefs.MusicVolume, v => _prefs.MusicVolume = v);
            AddVolume("ui.host.settings.volume.effects", () => _prefs.EffectsVolume, v => _prefs.EffectsVolume = v);
            AddVolume("ui.host.settings.volume.voice", () => _prefs.VoiceVolume, v => _prefs.VoiceVolume = v);
            AddToggle(_hostRows, "ui.host.settings.subtitles", _prefs.Subtitles, true, v => _prefs.Subtitles = v);
            AddToggle(_hostRows, "ui.host.settings.high_contrast", _prefs.HighContrast, true, v => _prefs.HighContrast = v);
            AddToggle(_hostRows, "ui.host.settings.reduced_motion", _prefs.ReducedMotion, true, v => _prefs.ReducedMotion = v);

            var scales = new (string, string)[HostPreferences.TextScaleOptions.Length];
            for (int i = 0; i < scales.Length; i++)
            {
                int p = HostPreferences.TextScaleOptions[i];
                scales[i] = (p.ToString(CultureInfo.InvariantCulture), p.ToString(CultureInfo.InvariantCulture) + " " + T("ui.host.settings.unit.percent"));
            }
            AddSegmented(_hostRows, "ui.host.settings.text_scale", "text-scale", scales, _prefs.TextScalePercent.ToString(CultureInfo.InvariantCulture), true, null,
                v => { _prefs.TextScalePercent = int.Parse(v, CultureInfo.InvariantCulture); });

            var languages = new (string, string)[HostPreferences.Languages.Length];
            for (int i = 0; i < languages.Length; i++) languages[i] = (HostPreferences.Languages[i], T("ui.host.settings.lang." + HostPreferences.Languages[i]));
            AddSegmented(_hostRows, "ui.host.settings.language", "language", languages, _prefs.Language, true, T("ui.host.settings.language.note"), v =>
            {
                _prefs.Language = v;
                Send(RoomSettingsPatches.Language(v));
            });
        }

        private void AddVolume(string key, Func<float> get, Action<float> set)
        {
            var row = Row(_hostRows, key, out Label value);
            value.text = Percent(get());
            var slider = new Slider(0f, 1f) { value = get(), name = "slider-" + key.Substring(key.LastIndexOf('.') + 1) };
            slider.fill = true;
            slider.AddToClassList("mf-slider");
            slider.RegisterValueChangedCallback(e =>
            {
                set(e.newValue);
                value.text = Percent(e.newValue);
            });
            row.Add(slider);
        }

        // ---------- room-wide ----------

        private bool Online => _client != null && _client.State == ConnectionState.Connected && !string.IsNullOrEmpty(_client.RoomCode);

        private void BuildRoom()
        {
            if (_roomRows == null) return;
            _roomRows.Clear();
            bool online = Online;
            VisualElement status = Screen.Q("room-status");
            status?.EnableInClassList("mf-settings__status--online", online);
            MfIcon icon = Screen.Q<MfIcon>("room-status-icon");
            if (icon != null) icon.kind = online ? "wifi" : "wifi-off";
            SetText("room-status-text", online ? T("ui.host.settings.room.synced") : T("ui.host.settings.room.offline"));

            RoomA11yDto a11y = _client?.LastSettings?.A11y;
            AddRoomFlag(RoomA11yFlag.SlowTimers, "ui.host.settings.room.slow_timers", a11y, online);
            AddRoomFlag(RoomA11yFlag.RelaxedMinigames, "ui.host.settings.room.relaxed", a11y, online);
            AddRoomFlag(RoomA11yFlag.ReducedMotion, "ui.host.settings.room.reduced_motion", a11y, online);
            AddRoomFlag(RoomA11yFlag.HighContrast, "ui.host.settings.room.high_contrast", a11y, online);
            AddRoomFlag(RoomA11yFlag.Subtitles, "ui.host.settings.room.subtitles", a11y, online);
            AddRoomFlag(RoomA11yFlag.ExplainTooltips, "ui.host.settings.room.explain", a11y, online);
        }

        private void AddRoomFlag(RoomA11yFlag flag, string key, RoomA11yDto current, bool online)
        {
            AddToggle(_roomRows, key, RoomSettingsPatches.Get(current, flag), online,
                v => Send(RoomSettingsPatches.A11y(_client?.LastSettings?.A11y, flag, v)));
        }

        // ---------- lobby ----------

        private void BuildLobby()
        {
            if (_lobbyRows == null) return;
            _lobbyRows.Clear();
            bool online = Online;
            RoomSettingsDto s = _client?.LastSettings;
            bool inLobby = App != null && App.Flow != null && App.Flow.Phase == GamePhase.Lobby;

            var assist = new (string, string)[RoomSettingsPatches.AssistLevels.Length];
            for (int i = 0; i < assist.Length; i++)
            {
                string level = RoomSettingsPatches.AssistLevels[i];
                assist[i] = (level, T("assist_level." + level.ToLowerInvariant() + ".name"));
            }
            AddSegmented(_lobbyRows, "ui.host.settings.lobby.assist", "assist", assist, s?.AssistLevel ?? ProtocolNames.AssistLevels.Engineer,
                online && inLobby, inLobby ? null : T("ui.host.settings.lobby.locked"), v => Send(RoomSettingsPatches.AssistLevel(v)));

            var timers = new (string, string)[RoomSettingsPatches.VoteTimerOptions.Length];
            for (int i = 0; i < timers.Length; i++)
            {
                int t = RoomSettingsPatches.VoteTimerOptions[i];
                timers[i] = (t.ToString(CultureInfo.InvariantCulture), t.ToString(CultureInfo.InvariantCulture) + " " + T("ui.host.settings.unit.seconds"));
            }
            AddSegmented(_lobbyRows, "ui.host.settings.lobby.vote_timer", "vote-timer", timers,
                (s?.VoteTimerS ?? ProtocolNames.Defaults.VoteTimerS).ToString(CultureInfo.InvariantCulture), online, T("ui.host.settings.lobby.next_round"),
                v => Send(RoomSettingsPatches.VoteTimer(int.Parse(v, CultureInfo.InvariantCulture))));

            var tally = new (string, string)[RoomSettingsPatches.TallyVisibilities.Length];
            for (int i = 0; i < tally.Length; i++) tally[i] = (RoomSettingsPatches.TallyVisibilities[i], T("ui.host.settings.lobby.tally." + RoomSettingsPatches.TallyVisibilities[i]));
            AddSegmented(_lobbyRows, "ui.host.settings.lobby.tally", "tally", tally, s?.TallyVisibility ?? ProtocolNames.TallyVisibilities.Open, online, null,
                v => Send(RoomSettingsPatches.Tally(v)));
        }

        private void Send(SettingsPatchDto patch)
        {
            if (!Online) return;
            try
            {
                _client.UpdateSettings(patch);
            }
            catch (Exception e)
            {
                Debug.LogWarning("[MissionForge] Settings: settings.set was not sent: " + e.Message);
            }
        }

        // ---------- row builders ----------

        private VisualElement Row(VisualElement parent, string key, out Label value)
        {
            var row = new VisualElement();
            row.AddToClassList("mf-settings-row");
            var head = new VisualElement();
            head.AddToClassList("mf-settings-row__head");
            var label = new Label(T(key));
            label.AddToClassList("mf-settings-row__label");
            value = new Label();
            value.AddToClassList("mf-settings-row__value");
            head.Add(label);
            head.Add(value);
            row.Add(head);
            parent.Add(row);
            return row;
        }

        private void AddToggle(VisualElement parent, string key, bool on, bool enabled, Action<bool> changed)
        {
            var row = new VisualElement();
            row.AddToClassList("mf-settings-row");
            row.AddToClassList("mf-settings-row--toggle");
            var toggle = new MfToggle { text = T(key), value = on, name = "toggle-" + key.Substring(key.LastIndexOf('.') + 1) };
            toggle.SetEnabled(enabled);
            toggle.Changed += changed;
            row.Add(toggle);
            parent.Add(row);
        }

        private void AddSegmented(VisualElement parent, string key, string prefix, (string, string)[] options, string selected, bool enabled, string note, Action<string> chosen)
        {
            var row = Row(parent, key, out Label value);
            value.text = LabelOf(options, selected);
            var seg = new MfSegmented { name = "seg-" + prefix };
            seg.SetOptions(prefix, options);
            seg.Select(selected);
            seg.SetEnabled(enabled);
            seg.Clicked += v =>
            {
                seg.Select(v);
                value.text = LabelOf(options, v);
                chosen(v);
            };
            row.Add(seg);
            if (!string.IsNullOrEmpty(note))
            {
                var n = new Label(note);
                n.AddToClassList("mf-settings-row__note");
                row.Add(n);
            }
        }

        private string T(string key) => _text(key);

        private static string LabelOf((string value, string label)[] options, string selected)
        {
            foreach ((string value, string label) in options) if (value == selected) return label;
            return "";
        }

        private static string Percent(float v) => Mathf.RoundToInt(v * 100f).ToString(CultureInfo.InvariantCulture) + " %";

        private void SetText(string name, string value)
        {
            Label l = Screen.Q<Label>(name);
            if (l != null) l.text = value;
        }

        /// <summary>Focuses <paramref name="target"/> once SceneFlow has enabled the screen (it is disabled while fading in).</summary>
        internal static void FocusWhenShown(VisualElement target)
        {
            if (target == null) return;
            int tries = 0;
            IVisualElementScheduledItem item = null;
            item = target.schedule.Execute(() =>
            {
                tries++;
                if (target.panel != null && target.enabledInHierarchy && target.resolvedStyle.display != DisplayStyle.None)
                {
                    target.Focus();
                    if (target.panel.focusController.focusedElement == target || tries > 40) item.Pause();
                }
                else if (tries > 40) item.Pause();
            }).Every(50);
        }
    }
}
