using System;
using System.Collections.Generic;
using System.Linq;
using MissionForge.EndScreens.Sources;
using MissionForge.Screens.Flight;
using Newtonsoft.Json.Linq;

namespace MissionForge.Screens.Debrief
{
    /// <summary>
    /// 2-D telemetry replay source. Altitude, dynamic pressure and g-load come from a T016 <see cref="FlightRecording"/>
    /// (read only, parsed with <see cref="FlightRecording.FromJson"/>); the failing channel and the failure time come from
    /// the replay fixture until the live flight hands over its own recording.
    /// </summary>
    public sealed class RecordingReplaySource : IReplaySource
    {
        private readonly FlightRecording _recording;
        private readonly JObject _failure;

        public RecordingReplaySource(string recordingJson, string failureJson, bool rehearsal)
        {
            _recording = FlightRecording.FromJson(recordingJson);
            _failure = JObject.Parse(failureJson);
            IsRehearsal = rehearsal;
        }

        public bool IsRehearsal { get; }

        public ReplayView Load()
        {
            double at = (double)_failure["atS"];
            double window = (double?)_failure["windowS"] ?? 8.0;
            double start = at - window;
            List<FlightTelemetry> samples = _recording.samples.Where(s => s.metS >= start - 0.5 && s.metS <= at + 0.01).ToList();
            double[] t = samples.Select(s => s.metS).ToArray();
            var channels = new List<ReplayChannelView>
            {
                new ReplayChannelView("ui.host.debrief.replay.channel.altitude", "km", t, samples.Select(s => s.altitudeM / 1000.0).ToArray(), false, 1),
                new ReplayChannelView("ui.host.debrief.replay.channel.q", "kPa", t, samples.Select(s => s.dynamicPressurePa / 1000.0).ToArray(), false, 1),
                new ReplayChannelView("ui.host.debrief.replay.channel.g", "g", t, samples.Select(s => s.gLoad).ToArray(), false, 2),
            };
            if (_failure["channel"] is JObject c)
            {
                channels.Add(new ReplayChannelView((string)c["key"], (string)c["unit"],
                    ((JArray)c["times"]).Select(v => (double)v).ToArray(), ((JArray)c["values"]).Select(v => (double)v).ToArray(), true, (int?)c["decimals"] ?? 2));
            }
            return new ReplayView
            {
                FailureModeId = (string)_failure["failure"] ?? "",
                FailureAtS = at,
                StartS = start,
                Speed = (double?)_failure["speed"] ?? 0.25,
                Channels = channels,
                IsRehearsal = IsRehearsal,
            };
        }
    }
}
