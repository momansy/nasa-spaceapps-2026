using System;
using System.Collections.Generic;
using Newtonsoft.Json;

namespace MissionForge.Screens.Flight
{
    /// <summary>
    /// A flight recorded from <see cref="CoreFlightFeed"/>: every <see cref="SampleEveryTicks"/>-th Core step is kept,
    /// plus every step that carries events (so no event is lost). Replay is deterministic, for screenshots and tests.
    /// </summary>
    [Serializable]
    public sealed class FlightRecording
    {
        public const int FormatVersion = 1;

        public int version = FormatVersion;
        public string contractId = "";
        public ulong seed;
        public string feed = "CoreFlightFeed";
        public int stageCount;
        /// <summary>Core steps between kept samples (1 = every 1/120 s step).</summary>
        public int sampleEveryTicks = 1;
        public List<FlightTelemetry> samples = new List<FlightTelemetry>();

        public string ToJson() => JsonConvert.SerializeObject(this, Formatting.None, Settings);

        public static FlightRecording FromJson(string json)
        {
            if (string.IsNullOrEmpty(json)) throw new ArgumentException("Empty flight recording.", nameof(json));
            FlightRecording r = JsonConvert.DeserializeObject<FlightRecording>(json, Settings);
            if (r == null || r.samples == null || r.samples.Count == 0) throw new FormatException("Flight recording has no samples.");
            if (r.version != FormatVersion) throw new FormatException("Unsupported flight recording version " + r.version + ".");
            return r;
        }

        /// <summary>Records <paramref name="feed"/> until it finishes or <paramref name="maxTicks"/> steps.</summary>
        public static FlightRecording Record(IFlightFeed feed, string contractId, ulong seed, int sampleEveryTicks, int maxTicks)
        {
            if (feed == null) throw new ArgumentNullException(nameof(feed));
            if (sampleEveryTicks < 1) throw new ArgumentOutOfRangeException(nameof(sampleEveryTicks));
            var r = new FlightRecording { contractId = contractId, seed = seed, stageCount = feed.StageCount, sampleEveryTicks = sampleEveryTicks };
            r.samples.Add(feed.Current.Clone());
            for (int i = 1; i <= maxTicks && !feed.IsFinished; i++)
            {
                FlightTelemetry t = feed.Step();
                if (i % sampleEveryTicks == 0 || t.events.Count > 0 || feed.IsFinished) r.samples.Add(t.Clone());
            }
            return r;
        }

        private static readonly JsonSerializerSettings Settings = new JsonSerializerSettings
        {
            FloatFormatHandling = FloatFormatHandling.String,
            NullValueHandling = NullValueHandling.Ignore,
        };
    }

    /// <summary>Replays a <see cref="FlightRecording"/>. Each <see cref="Step"/> returns the next kept sample.</summary>
    public sealed class RecordedFlightFeed : IFlightFeed, IFlightControlSink
    {
        private readonly FlightRecording _recording;
        private int _index;

        public RecordedFlightFeed(FlightRecording recording)
        {
            _recording = recording ?? throw new ArgumentNullException(nameof(recording));
            if (recording.samples.Count == 0) throw new ArgumentException("Recording has no samples.", nameof(recording));
            Current = recording.samples[0];
            Previous = Current;
        }

        public FlightRecording Recording => _recording;
        public FlightTelemetry Current { get; private set; }
        public FlightTelemetry Previous { get; private set; }
        public int StageCount => _recording.stageCount;
        public bool IsFinished => _index >= _recording.samples.Count - 1;
        public bool BulletTime { get; set; }

        /// <summary>Core steps represented by one replay step (the recording's sample spacing).</summary>
        public int TicksPerStep => _recording.sampleEveryTicks;

        /// <summary>Recordings ignore pilot input; the flight is fixed.</summary>
        public void Submit(FlightControlCommand command) { }

        public FlightTelemetry Step()
        {
            if (IsFinished) return Current;
            _index++;
            Previous = Current;
            Current = _recording.samples[_index];
            return Current;
        }

        /// <summary>Jumps to the first sample at or after <paramref name="metS"/> (evidence captures).</summary>
        public void SeekToMet(double metS)
        {
            for (int i = 0; i < _recording.samples.Count; i++)
            {
                if (_recording.samples[i].metS < metS) continue;
                _index = i;
                Current = _recording.samples[i];
                Previous = i > 0 ? _recording.samples[i - 1] : Current;
                return;
            }
        }
    }
}
