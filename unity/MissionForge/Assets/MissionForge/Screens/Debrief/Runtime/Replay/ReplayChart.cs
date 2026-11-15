using System;
using System.Globalization;
using MissionForge.EndScreens.Sources;
using MissionForge.UI;
using UnityEngine;
using UnityEngine.UIElements;

namespace MissionForge.Screens.Debrief
{
    /// <summary>
    /// One replay channel as a strip chart: the trace up to the playhead in full colour, the rest dimmed, a playhead and the
    /// failure marker (Fails colour, cross glyph and a word). Name, live readout with unit and the range sit on top.
    /// </summary>
    public sealed class ReplayChart : VisualElement
    {
        private readonly ReplayChannelView _channel;
        private readonly double _start, _end, _failure;
        private readonly Label _readout;
        private readonly VisualElement _plot;
        private double _min, _max;
        private double _t;

        public ReplayChart(ReplayChannelView channel, double startS, double endS, double failureS, EndText text)
        {
            _channel = channel;
            _start = startS;
            _end = endS;
            _failure = failureS;
            AddToClassList("mf-replay-chart");
            EnableInClassList("mf-replay-chart--failing", channel.Failing);
            Range();

            var head = new VisualElement();
            head.AddToClassList("mf-replay-chart__head");
            var name = new Label(text[channel.NameKey]);
            name.AddToClassList("mf-replay-chart__name");
            if (channel.Failing)
            {
                var tag = new MfIcon { kind = "fails" };
                tag.AddToClassList("mf-replay-chart__tag");
                head.Add(tag);
            }
            head.Add(name);
            _readout = new Label { enableRichText = true };
            _readout.AddToClassList("mf-replay-chart__value");
            head.Add(_readout);
            Add(head);

            _plot = new VisualElement();
            _plot.AddToClassList("mf-replay-chart__plot");
            _plot.generateVisualContent += Draw;
            var range = new Label(Fmt(_max) + " / " + Fmt(_min) + " " + channel.Unit);
            range.AddToClassList("mf-replay-chart__range");
            _plot.Add(range);
            Add(_plot);
            SetTime(startS);
        }

        public void SetTime(double t)
        {
            _t = Math.Max(_start, Math.Min(_end, t));
            double v = _channel.At(Math.Min(_t, _failure));
            _readout.text = MfText.WithUnit(Fmt(v), _channel.Unit);
            _plot.MarkDirtyRepaint();
        }

        private string Fmt(double v) => double.IsNaN(v) ? "" : v.ToString("N" + _channel.Decimals, CultureInfo.InvariantCulture);

        private void Range()
        {
            _min = double.MaxValue;
            _max = double.MinValue;
            for (int i = 0; i < _channel.TimesS.Count; i++)
            {
                if (_channel.TimesS[i] < _start - 0.01 || _channel.TimesS[i] > _failure + 0.01) continue;
                _min = Math.Min(_min, _channel.Values[i]);
                _max = Math.Max(_max, _channel.Values[i]);
            }
            if (_min > _max) { _min = 0; _max = 1; }
            double pad = Math.Max(1e-6, (_max - _min) * 0.12);
            _min -= pad;
            _max += pad;
        }

        private void Draw(MeshGenerationContext ctx)
        {
            Rect r = _plot.contentRect;
            if (r.width < 4f || r.height < 4f) return;
            Painter2D p = ctx.painter2D;
            float X(double t) => r.xMin + (float)((t - _start) / (_end - _start)) * r.width;
            float Y(double v) => r.yMax - (float)((v - _min) / (_max - _min)) * r.height;

            // Grid: three faint horizontal lines.
            p.strokeColor = MfPalette.WithAlpha(MfPalette.Ceramic, 0.08f);
            p.lineWidth = 1f;
            for (int k = 1; k <= 3; k++)
            {
                float y = r.yMin + r.height * k / 4f;
                p.BeginPath();
                p.MoveTo(new Vector2(r.xMin, y));
                p.LineTo(new Vector2(r.xMax, y));
                p.Stroke();
            }

            Color colour = _channel.Failing ? MfPalette.Fails : MfPalette.Signal;
            Trace(p, X, Y, double.MinValue, Math.Min(_t, _failure), colour, 3f);
            Trace(p, X, Y, _t, _failure, MfPalette.WithAlpha(colour, 0.22f), 2f);

            // Failure marker.
            float fx = X(_failure);
            p.strokeColor = MfPalette.Fails;
            p.lineWidth = 3f;
            for (float y = r.yMin; y < r.yMax; y += 12f)
            {
                p.BeginPath();
                p.MoveTo(new Vector2(fx, y));
                p.LineTo(new Vector2(fx, Mathf.Min(r.yMax, y + 7f)));
                p.Stroke();
            }

            // Playhead.
            if (_t < _failure)
            {
                float px = X(_t);
                p.strokeColor = MfPalette.Ceramic;
                p.lineWidth = 2f;
                p.BeginPath();
                p.MoveTo(new Vector2(px, r.yMin));
                p.LineTo(new Vector2(px, r.yMax));
                p.Stroke();
            }
        }

        private void Trace(Painter2D p, Func<double, float> x, Func<double, float> y, double from, double to, Color colour, float width)
        {
            p.strokeColor = colour;
            p.lineWidth = width;
            p.lineJoin = LineJoin.Round;
            bool started = false;
            p.BeginPath();
            for (int i = 0; i < _channel.TimesS.Count; i++)
            {
                double t = _channel.TimesS[i];
                if (t < _start || t < from - 1e-6 || t > to + 1e-6) continue;
                var v = new Vector2(x(t), y(_channel.Values[i]));
                if (!started) { p.MoveTo(v); started = true; }
                else p.LineTo(v);
            }
            if (started) p.Stroke();
        }
    }
}
