using System;
using System.Collections.Generic;

namespace MissionForge.EndScreens.Sources
{
    /// <summary>One telemetry channel of the instant replay: samples over mission elapsed time.</summary>
    public sealed class ReplayChannelView
    {
        public ReplayChannelView(string nameKey, string unit, IReadOnlyList<double> timesS, IReadOnlyList<double> values, bool failing, int decimals)
        {
            NameKey = nameKey;
            Unit = unit;
            TimesS = timesS ?? Array.Empty<double>();
            Values = values ?? Array.Empty<double>();
            Failing = failing;
            Decimals = decimals;
        }

        public string NameKey { get; }
        public string Unit { get; }
        /// <summary>Mission elapsed time of each sample, s.</summary>
        public IReadOnlyList<double> TimesS { get; }
        public IReadOnlyList<double> Values { get; }
        /// <summary>True for the channel that shows the failure.</summary>
        public bool Failing { get; }
        public int Decimals { get; }

        /// <summary>Value at <paramref name="t"/> s, linearly interpolated between samples (display only).</summary>
        public double At(double t)
        {
            if (TimesS.Count == 0) return double.NaN;
            if (t <= TimesS[0]) return Values[0];
            for (int i = 1; i < TimesS.Count; i++)
            {
                if (t <= TimesS[i])
                {
                    double span = TimesS[i] - TimesS[i - 1];
                    double u = span > 0 ? (t - TimesS[i - 1]) / span : 1.0;
                    return Values[i - 1] + (Values[i] - Values[i - 1]) * u;
                }
            }
            return Values[Values.Count - 1];
        }
    }

    /// <summary>The instant replay of a failure (design 9.9.1): the last seconds before the failure, slowed down.</summary>
    public sealed class ReplayView
    {
        public string FailureModeId { get; set; } = "";
        /// <summary>Mission elapsed time of the failure, s.</summary>
        public double FailureAtS { get; set; }
        /// <summary>Start of the replay window, s.</summary>
        public double StartS { get; set; }
        /// <summary>Playback speed, × real time (0.25, game_value).</summary>
        public double Speed { get; set; } = 0.25;
        public IReadOnlyList<ReplayChannelView> Channels { get; set; } = Array.Empty<ReplayChannelView>();
        public bool IsRehearsal { get; set; }
    }

    public interface IReplaySource
    {
        bool IsRehearsal { get; }
        ReplayView Load();
    }
}
