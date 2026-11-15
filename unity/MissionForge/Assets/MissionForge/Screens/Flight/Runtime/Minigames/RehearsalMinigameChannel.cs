using System;
using System.Collections.Generic;
using MissionForge.Core.Random;
using MissionForge.Net;
using Newtonsoft.Json.Linq;

namespace MissionForge.Screens.Flight
{
    /// <summary>
    /// Offline stand-in for four phones ("p1".."p4"), deterministic from a seed. When the host sends <c>mg.start</c>
    /// the channel schedules <c>mg.ready</c>, <c>mg.progress</c> and one <c>mg.result</c> per phone; <see cref="Tick"/>
    /// delivers the ones that are due. All numbers below are rehearsal simulation values, not design values.
    /// </summary>
    public sealed class RehearsalMinigameChannel : IMinigameChannel
    {
        /// <summary>Rehearsal: delay from <c>mg.start</c> to each phone's <c>mg.ready</c>, ms (plus a 50 ms stagger per phone).</summary>
        public const long ReadyDelayMs = 500;
        /// <summary>Rehearsal: progress report period, ms (the protocol allows at most 2 Hz).</summary>
        public const long ProgressPeriodMs = 500;
        /// <summary>Rehearsal: chance a simulated phone succeeds (about 3 of 4 succeed on average).</summary>
        public const double SuccessChance = 0.8;
        /// <summary>Rehearsal: chance a successful phone is also perfect.</summary>
        public const double PerfectChance = 0.25;
        /// <summary>Rehearsal: a phone finishes after this fraction of the play time at the earliest.</summary>
        public const double MinPlayFraction = 0.6;

        private const long ReadyStaggerMs = 50;

        private static readonly string[] Phones = { "p1", "p2", "p3", "p4" };

        private readonly Func<long> _clockMs;
        private readonly ulong _seed;
        private readonly List<Pending> _queue = new List<Pending>();
        private long _order;

        public RehearsalMinigameChannel(ulong seed, Func<long> clockMs)
        {
            _seed = seed;
            _clockMs = clockMs ?? throw new ArgumentNullException(nameof(clockMs));
        }

        public event Action<string, string, JObject> Received;

        /// <summary>Every message the host sent, in order (type, payload).</summary>
        public List<KeyValuePair<string, JObject>> Sent { get; } = new List<KeyValuePair<string, JObject>>();

        public bool IsConnected => true;

        public IReadOnlyList<string> PlayerIds => Phones;

        public long NowMs() => _clockMs();

        public void Send(string type, object payload)
        {
            JObject d = payload as JObject ?? (payload == null ? new JObject() : JObject.FromObject(payload));
            Sent.Add(new KeyValuePair<string, JObject>(type, d));
            if (type == ProtocolNames.Messages.MgStart) Schedule(d, NowMs());
            else if (type == ProtocolNames.Messages.MgCancel || type == ProtocolNames.Messages.MgSummary) _queue.Clear();
        }

        /// <summary>Delivers every simulated phone message due at or before <paramref name="nowMs"/>, in time order.</summary>
        public void Tick(long nowMs)
        {
            if (_queue.Count == 0) return;
            var due = _queue.FindAll(p => p.AtMs <= nowMs);
            if (due.Count == 0) return;
            _queue.RemoveAll(p => p.AtMs <= nowMs);
            due.Sort((a, b) => a.AtMs != b.AtMs ? a.AtMs.CompareTo(b.AtMs) : a.Order.CompareTo(b.Order));
            foreach (Pending p in due) Received?.Invoke(p.From, p.Type, p.Data);
        }

        private void Schedule(JObject start, long sentAtMs)
        {
            _queue.Clear();
            string runId = (string)start["runId"] ?? "";
            string minigameId = (string)start["minigameId"] ?? "";
            long startAtMs = start["startAtMs"]?.Value<long>() ?? sentAtMs;
            long durationMs = start["durationMs"]?.Value<long>() ?? 0;
            SeededRandom rng = new SeededRandom(_seed).ForStream("rehearsal:" + runId);

            for (int i = 0; i < Phones.Length; i++)
            {
                string phone = Phones[i];
                Add(sentAtMs + ReadyDelayMs + i * ReadyStaggerMs, phone, ProtocolNames.Messages.MgReady, new JObject { ["runId"] = runId });

                double playFraction = MinPlayFraction + (1.0 - MinPlayFraction) * rng.NextDouble();
                long playMs = Math.Max(ProgressPeriodMs, (long)Math.Round(durationMs * playFraction));
                for (long t = ProgressPeriodMs; t < playMs; t += ProgressPeriodMs)
                {
                    double p = Math.Round((double)t / playMs, 3);
                    Add(startAtMs + t, phone, ProtocolNames.Messages.MgProgress, new JObject { ["runId"] = runId, ["p"] = p });
                }

                bool success = rng.NextDouble() < SuccessChance;
                bool perfect = success && rng.NextDouble() < PerfectChance;
                double score = Math.Round(success ? 0.7 + 0.3 * rng.NextDouble() : 0.1 + 0.4 * rng.NextDouble(), 3);
                long endMs = startAtMs + playMs;
                Add(endMs, phone, ProtocolNames.Messages.MgResult, new JObject
                {
                    ["runId"] = runId,
                    ["minigameId"] = minigameId,
                    ["success"] = success,
                    ["perfect"] = perfect,
                    ["score"] = score,
                    ["value"] = JValue.CreateNull(),
                    ["elapsedMs"] = playMs,
                    ["finishedAtMs"] = endMs,
                    ["mode"] = "STANDARD",
                });
            }
        }

        private void Add(long atMs, string from, string type, JObject data) =>
            _queue.Add(new Pending(atMs, _order++, from, type, data));

        private sealed class Pending
        {
            public Pending(long atMs, long order, string from, string type, JObject data)
            {
                AtMs = atMs;
                Order = order;
                From = from;
                Type = type;
                Data = data;
            }

            public long AtMs { get; }
            public long Order { get; }
            public string From { get; }
            public string Type { get; }
            public JObject Data { get; }
        }
    }
}
