using System;
using System.Collections.Generic;
using System.Globalization;
using MissionForge.EndScreens.Sources;
using MissionForge.UI;
using UnityEngine;
using UnityEngine.UIElements;

namespace MissionForge.Screens.Debrief
{
    /// <summary>
    /// Instant replay of a failure (design 9.9.1) as a 2-D telemetry replay: altitude, dynamic pressure, g-load and the
    /// failing channel traced to the failure marker, played at ×0.25 (game_value). Pause and skip; reduced motion shows the
    /// whole trace at once with no playback movement.
    /// </summary>
    public sealed class ReplayLayer
    {
        /// <summary>Seconds the replay holds on the failure marker before it stops.</summary>
        public const double HoldS = 1.0;

        private readonly VisualElement _host;
        private readonly EndText _text;
        private readonly ReplayView _view;
        private readonly List<ReplayChart> _charts = new List<ReplayChart>();
        private readonly Action _back, _skip;
        private IVisualElementScheduledItem _tick;
        private double _t;
        private bool _paused;
        private float _lastReal;
        private Label _clock;
        private Button _pause;

        public ReplayLayer(VisualElement host, ReplayView view, EndText text, Action back, Action skip)
        {
            _host = host;
            _view = view;
            _text = text;
            _back = back;
            _skip = skip;
        }

        public double Time => _t;
        public bool Paused => _paused;

        public void Open()
        {
            _host.Clear();
            var panel = new MfGlassPanel();
            panel.AddToClassList("mf-glass");
            panel.AddToClassList("mf-end-panel");
            panel.AddToClassList("mf-layer");
            _host.Add(panel);

            var head = new VisualElement();
            head.AddToClassList("mf-layer__head");
            var titles = new VisualElement();
            titles.AddToClassList("mf-layer__titles");
            titles.Add(Label(_text["ui.host.debrief.replay.title"], "mf-h2"));
            titles.Add(Label(_text.Format("ui.host.debrief.replay.sub", EndText.Seconds(_view.FailureAtS - _view.StartS),
                _text["ui.host.debrief.failure_mode." + _view.FailureModeId], "×" + _view.Speed.ToString("0.##", CultureInfo.InvariantCulture)), "mf-label"));
            head.Add(titles);
            _clock = Label("", "mf-kpi");
            _clock.AddToClassList("mf-replay__clock");
            _clock.enableRichText = true;
            head.Add(_clock);
            panel.Add(head);

            var charts = new VisualElement();
            charts.AddToClassList("mf-replay__charts");
            double end = _view.FailureAtS + 0.4;
            foreach (ReplayChannelView c in _view.Channels)
            {
                var chart = new ReplayChart(c, _view.StartS, end, _view.FailureAtS, _text);
                _charts.Add(chart);
                charts.Add(chart);
            }
            panel.Add(charts);

            var actions = new VisualElement();
            actions.AddToClassList("mf-layer__actions");
            var note = Label(_text["ui.host.debrief.replay.note"] + (_view.IsRehearsal ? "  ·  " + _text["ui.host.debrief.rehearsal"] : ""), "mf-label");
            note.AddToClassList("mf-layer__note");
            actions.Add(note);
            actions.Add(Btn("btn-replay-back", _text["ui.host.debrief.replay.back"], "chevron-left", "mf-btn--ghost", _back));
            _pause = Btn("btn-replay-pause", _text["ui.host.debrief.replay.pause"], "pause", "mf-btn--secondary", TogglePause);
            actions.Add(_pause);
            Button skip = Btn("btn-replay-skip", _text["ui.host.debrief.replay.skip"], "scan-line", "mf-btn--primary", _skip);
            actions.Add(skip);
            panel.Add(actions);

            _t = _view.StartS;
            if (MfMotion.Reduced)
            {
                _t = _view.FailureAtS;
                _paused = true;
                _pause.SetEnabled(false);
            }
            Apply();
            _lastReal = UnityEngine.Time.realtimeSinceStartup;
            _tick = panel.schedule.Execute(Step).Every(16);
            skip.Focus();
        }

        public void Close()
        {
            _tick?.Pause();
            _host.Clear();
            _charts.Clear();
        }

        /// <summary>Jumps to <paramref name="t"/> s and pauses (evidence, tests).</summary>
        public void Seek(double t)
        {
            _t = t;
            _paused = true;
            Apply();
        }

        private void TogglePause()
        {
            _paused = !_paused;
            if (!_paused && _t >= _view.FailureAtS) _t = _view.StartS;
            _pause.text = _text[_paused ? "ui.host.debrief.replay.play" : "ui.host.debrief.replay.pause"];
            MfButtons.WithIcon(_pause, _paused ? "play" : "pause");
        }

        private void Step()
        {
            float now = UnityEngine.Time.realtimeSinceStartup;
            float dt = now - _lastReal;
            _lastReal = now;
            if (_paused) return;
            _t += dt * _view.Speed;
            if (_t >= _view.FailureAtS + HoldS * _view.Speed)
            {
                _t = _view.FailureAtS;
                _paused = true;
                _pause.text = _text["ui.host.debrief.replay.play"];
                MfButtons.WithIcon(_pause, "play");
            }
            Apply();
        }

        private void Apply()
        {
            foreach (ReplayChart c in _charts) c.SetTime(_t);
            double shown = Math.Min(_t, _view.FailureAtS);
            _clock.text = MfText.WithUnit("T+" + shown.ToString("0.0", CultureInfo.InvariantCulture), _text["ui.host.debrief.unit.seconds"]);
            _clock.EnableInClassList("mf-replay__clock--failed", _t >= _view.FailureAtS);
        }

        private static Label Label(string text, string cls)
        {
            var l = new Label(text);
            l.AddToClassList(cls);
            return l;
        }

        private static Button Btn(string name, string text, string icon, string variant, Action click)
        {
            var b = new Button(click) { name = name, text = text };
            b.AddToClassList("mf-btn");
            b.AddToClassList("mf-btn--l");
            b.AddToClassList(variant);
            MfButtons.WithIcon(b, icon);
            return b;
        }
    }
}
