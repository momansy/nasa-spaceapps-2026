using System;
using System.Collections.Generic;
using MissionForge.Core.Random;
using MissionForge.Core.Scoring;
using MissionForge.Net;
using Newtonsoft.Json.Linq;

namespace MissionForge.Screens.Flight
{
    /// <summary>
    /// Host side of phone minigames during the flight (protocol section 10). Sends <c>mg.start</c>, collects the
    /// relayed <c>mg.ready</c> / <c>mg.progress</c> / <c>mg.result</c>, closes the run and sends <c>mg.summary</c>.
    /// Plain C#: the caller drives it with <see cref="Tick"/> and copies <see cref="IsBulletTime"/> into
    /// <c>IFlightFeed.BulletTime</c>. Boosts are not applied to the flight here (out of scope for this task):
    /// <c>mg.summary.boosts</c> is always sent empty.
    /// </summary>
    public sealed class FlightMinigameHost : IDisposable
    {
        /// <summary>Lead time from <c>mg.start</c> to <c>startAtMs</c>, ms. Protocol 10 rule 1 needs at least 3000 ms; 500 ms margin.</summary>
        public const long IntroLeadMs = 3500;
        /// <summary>Shortest play time the protocol accepts, ms (<c>durationMs</c> 5000…60000).</summary>
        public const long MinDurationMs = 5000;
        /// <summary>Longest play time the protocol accepts, ms.</summary>
        public const long MaxDurationMs = 60000;
        /// <summary>Close margin after the play time, ms (protocol 10 rule 5: 300 ms latency tolerance plus margin).</summary>
        public const long CloseMarginMs = 2000;
        /// <summary>How long the result stays on the big screen after <c>mg.summary</c>, ms (presentation choice).</summary>
        public const long ResultHoldMs = 5000;

        /// <summary>Values of the protocol enum <c>MgCancelReason</c>.</summary>
        public static class CancelReasons
        {
            public const string Host = "HOST";
            public const string Abort = "ABORT";
            public const string PhaseChange = "PHASE_CHANGE";
        }

        private readonly IReadOnlyDictionary<string, MinigameDef> _defs;
        private readonly ScoringCatalog _scoring;
        private readonly IMinigameChannel _channel;
        private readonly SeededRandom _rng;
        private int _runCount;
        private long _lastNowMs;
        private Run _run;

        public FlightMinigameHost(IReadOnlyDictionary<string, string> jsonByPath, IMinigameChannel channel, ulong seed)
        {
            if (jsonByPath == null) throw new ArgumentNullException(nameof(jsonByPath));
            _channel = channel ?? throw new ArgumentNullException(nameof(channel));
            _defs = MinigameDef.LoadAll(jsonByPath);
            _scoring = ScoringCatalog.Load(jsonByPath);
            _rng = new SeededRandom(seed);
            _channel.Received += OnReceived;
        }

        /// <summary>Protocol <c>AssistLevel</c> sent in <c>mg.start</c>; set it from the room settings.</summary>
        public string AssistLevel { get; set; } = ProtocolNames.AssistLevels.Engineer;

        /// <summary>Snapshot for the banner; null when no run is active or being shown.</summary>
        public MinigameRunView Current { get; private set; }

        /// <summary>True while a run is active and not yet in Result: the flight simulation runs at ×0.1.</summary>
        public bool IsBulletTime => Current != null && Current.IsBulletTime;

        /// <summary>The last <c>mg.summary</c> payload sent, or null.</summary>
        public JObject LastSummary { get; private set; }

        /// <summary>Known minigame definitions by id.</summary>
        public IReadOnlyDictionary<string, MinigameDef> Definitions => _defs;

        /// <summary>Starts the run cued by a flight event (<see cref="FlightEventKind.MinigameCue"/>); false otherwise.</summary>
        public bool TryStartFromCue(FlightTelemetryEvent e) =>
            e != null && e.kind == FlightEventKind.MinigameCue && TryStart(e.id, e.phase);

        /// <summary>
        /// Starts a run on every phone. Refused (false) while another run is active (a run showing its result may be
        /// replaced), for an unknown id, or while the channel is disconnected (phones could not receive it).
        /// </summary>
        public bool TryStart(string minigameId, string flightPhase)
        {
            if (_run != null && _run.State != MinigameRunState.Result) return false;
            if (string.IsNullOrEmpty(minigameId) || !_defs.TryGetValue(minigameId, out MinigameDef def)) return false;
            if (!_channel.IsConnected) return false;

            _runCount++;
            string runId = "f" + _runCount + "." + minigameId.ToLowerInvariant();
            uint seed = (uint)(_rng.ForStream("minigame:" + runId).NextUInt64() & 0xFFFFFFFFUL);
            long nowMs = _channel.NowMs();
            long startAtMs = nowMs + IntroLeadMs;
            long durationMs = Math.Max(MinDurationMs, Math.Min(MaxDurationMs, (long)Math.Round(def.DurationS * 1000.0)));

            var payload = new JObject
            {
                ["runId"] = runId,
                ["minigameId"] = def.Id,
                ["type"] = def.WireType,
                ["seed"] = seed,
                ["startAtMs"] = startAtMs,
                ["durationMs"] = durationMs,
                ["assistLevel"] = string.IsNullOrEmpty(AssistLevel) ? ProtocolNames.AssistLevels.Engineer : AssistLevel,
                ["flightPhase"] = string.IsNullOrEmpty(flightPhase) ? JValue.CreateNull() : (JToken)flightPhase,
                ["audience"] = false,
                ["params"] = def.Params.DeepClone(),
                // Per-player pieces for COOP_SPLIT / RELAY / TEAM_SYNC are not generated yet; phones play with params only.
                ["assignments"] = new JArray(),
            };

            _run = new Run(runId, def, startAtMs, durationMs);
            _channel.Send(ProtocolNames.Messages.MgStart, payload);
            _lastNowMs = nowMs;
            Refresh(nowMs);
            return true;
        }

        /// <summary>Advances the run: state by time, close at the deadline or when every active player reported, result hold.</summary>
        public void Tick(long nowMs)
        {
            _lastNowMs = nowMs;
            if (_run == null) return;
            if (_run.State == MinigameRunState.Result)
            {
                if (nowMs >= _run.ResultUntilMs) Clear();
                return;
            }

            if (nowMs >= _run.CloseAtMs || EveryActiveReported()) Close(nowMs);
            else Refresh(nowMs);
        }

        /// <summary>Abandons the active run with <c>mg.cancel</c> (see <see cref="CancelReasons"/>); no boost, no penalty.</summary>
        public void Cancel(string reason)
        {
            if (_run == null) return;
            if (_run.State != MinigameRunState.Result)
            {
                _channel.Send(ProtocolNames.Messages.MgCancel, new JObject
                {
                    ["runId"] = _run.RunId,
                    ["reason"] = string.IsNullOrEmpty(reason) ? CancelReasons.Host : reason,
                });
            }
            Clear();
        }

        public void Dispose() => _channel.Received -= OnReceived;

        private void OnReceived(string from, string type, JObject data)
        {
            if (_run == null || _run.State == MinigameRunState.Result || data == null || string.IsNullOrEmpty(from)) return;
            if ((string)data["runId"] != _run.RunId) return; // stale or foreign run

            if (type == ProtocolNames.Messages.MgReady)
            {
                if (!_run.Ready.Contains(from)) _run.Ready.Add(from);
            }
            else if (type == ProtocolNames.Messages.MgProgress)
            {
                if (_run.Results.ContainsKey(from)) return;
                _run.Progress[from] = Clamp01(data["p"]?.Value<double>() ?? 0.0);
            }
            else if (type == ProtocolNames.Messages.MgResult)
            {
                // "Active" requires mg.ready (protocol rule 28); only the first result per player counts.
                if (!_run.Ready.Contains(from) || _run.Results.ContainsKey(from)) return;
                bool success = data["success"]?.Value<bool>() ?? false;
                bool perfect = success && (data["perfect"]?.Value<bool>() ?? false);
                double score = Clamp01(data["score"]?.Value<double>() ?? 0.0);
                _run.Results[from] = new PlayerResult(success, perfect, score);
            }
            else
            {
                return;
            }
            Refresh(_lastNowMs);
        }

        private List<string> ActiveIds()
        {
            var connected = new HashSet<string>(_channel.PlayerIds ?? Array.Empty<string>());
            return _run.Ready.FindAll(connected.Contains);
        }

        private bool EveryActiveReported()
        {
            List<string> active = ActiveIds();
            return active.Count > 0 && active.TrueForAll(_run.Results.ContainsKey);
        }

        private void Close(long nowMs)
        {
            List<string> active = ActiveIds();
            var succeededIds = new JArray();
            var perfectIds = new JArray();
            foreach (string id in active)
            {
                if (!_run.Results.TryGetValue(id, out PlayerResult r)) continue;
                if (r.Success) succeededIds.Add(id);
                if (r.Perfect) perfectIds.Add(id);
            }

            TierResult tier;
            if (active.Count == 1)
            {
                _run.Results.TryGetValue(active[0], out PlayerResult solo);
                tier = Tiers.ComputeSolo(_scoring, solo?.Score ?? 0.0, solo?.Perfect ?? false);
            }
            else
            {
                tier = Tiers.Compute(_scoring, active.Count, succeededIds.Count, perfectIds.Count);
            }

            LastSummary = new JObject
            {
                ["runId"] = _run.RunId,
                ["minigameId"] = _run.Def.Id,
                ["active"] = active.Count,
                ["succeeded"] = succeededIds.Count,
                ["fraction"] = Math.Round(tier.FractionUnitless, 4),
                ["tier"] = TierWire(tier.Tier),
                ["succeededIds"] = succeededIds,
                ["perfectIds"] = perfectIds,
                ["sparkle"] = tier.Sparkle,
                ["boosts"] = new JArray(), // boost application to the flight is out of scope here
                ["syncDelta"] = SyncDelta(tier.Tier),
                ["points"] = TeamworkPoints(tier.Tier),
                ["factId"] = _run.Def.FactId == null ? JValue.CreateNull() : (JToken)_run.Def.FactId,
            };
            _channel.Send(ProtocolNames.Messages.MgSummary, LastSummary);

            _run.State = MinigameRunState.Result;
            _run.ResultUntilMs = nowMs + ResultHoldMs;
            _run.Active = active.Count;
            _run.Tier = tier.Tier;
            _run.Sparkle = tier.Sparkle;
            Refresh(nowMs);
        }

        private void Refresh(long nowMs)
        {
            if (_run == null) { Current = null; return; }
            if (_run.State != MinigameRunState.Result)
            {
                _run.State = nowMs < _run.StartAtMs ? MinigameRunState.Intro
                    : nowMs < _run.StartAtMs + _run.DurationMs ? MinigameRunState.Playing
                    : MinigameRunState.Closing;
            }

            double sum = 0.0;
            int succeeded = 0;
            foreach (string id in _run.Ready)
            {
                if (_run.Results.TryGetValue(id, out PlayerResult r))
                {
                    sum += 1.0;
                    if (r.Success) succeeded++;
                }
                else if (_run.Progress.TryGetValue(id, out double p)) sum += p;
            }
            double progress = _run.Ready.Count > 0 ? sum / _run.Ready.Count : 0.0;

            Current = new MinigameRunView(_run.RunId, _run.Def.Id, _run.Def.NameKey, _run.Def.HowToPlayKey, _run.State,
                _run.StartAtMs, _run.DurationMs, progress, _run.Ready.Count, _run.Active, succeeded, _run.Tier, _run.Sparkle);
        }

        private void Clear()
        {
            _run = null;
            Current = null;
        }

        /// <summary>Wire token of a tier ("NONE", "BRONZE", …).</summary>
        public static string TierWire(Tier tier) => tier.ToString().ToUpperInvariant();

        /// <summary>Team Sync gained (game_value, protocol 10 / design 10.3): Gold/Platinum 25, Silver 15, Bronze 8, None 0.</summary>
        public static int SyncDelta(Tier tier)
        {
            switch (tier)
            {
                case Tier.Platinum:
                case Tier.Gold: return 25;
                case Tier.Silver: return 15;
                case Tier.Bronze: return 8;
                default: return 0;
            }
        }

        /// <summary>Teamwork points (game_value, protocol 10 / design 10.3): Platinum 250, Gold 200, Silver 120, Bronze 60, None 0.</summary>
        public static int TeamworkPoints(Tier tier)
        {
            switch (tier)
            {
                case Tier.Platinum: return 250;
                case Tier.Gold: return 200;
                case Tier.Silver: return 120;
                case Tier.Bronze: return 60;
                default: return 0;
            }
        }

        private static double Clamp01(double v) => double.IsNaN(v) ? 0.0 : Math.Max(0.0, Math.Min(1.0, v));

        private sealed class PlayerResult
        {
            public PlayerResult(bool success, bool perfect, double score) { Success = success; Perfect = perfect; Score = score; }
            public bool Success { get; }
            public bool Perfect { get; }
            public double Score { get; }
        }

        /// <summary>Mutable bookkeeping of the one active run (private; the public view is the immutable snapshot).</summary>
        private sealed class Run
        {
            public Run(string runId, MinigameDef def, long startAtMs, long durationMs)
            {
                RunId = runId;
                Def = def;
                StartAtMs = startAtMs;
                DurationMs = durationMs;
                CloseAtMs = startAtMs + durationMs + CloseMarginMs;
            }

            public string RunId { get; }
            public MinigameDef Def { get; }
            public long StartAtMs { get; }
            public long DurationMs { get; }
            public long CloseAtMs { get; }
            public MinigameRunState State { get; set; } = MinigameRunState.Intro;
            public long ResultUntilMs { get; set; }
            public int Active { get; set; }
            public Tier Tier { get; set; } = Tier.None;
            public bool Sparkle { get; set; }
            public List<string> Ready { get; } = new List<string>();
            public Dictionary<string, double> Progress { get; } = new Dictionary<string, double>();
            public Dictionary<string, PlayerResult> Results { get; } = new Dictionary<string, PlayerResult>();
        }
    }
}
