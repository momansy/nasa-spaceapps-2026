using System;
using System.Collections.Generic;
using System.Linq;
using MissionForge.Core.Scoring;
using MissionForge.EndScreens.Investigation;
using MissionForge.Screens.Flight;
using Newtonsoft.Json.Linq;

namespace MissionForge.Screens.Debrief
{
    /// <summary>
    /// The host side of MG-28 (T022 contract): sends <c>mg.start</c>, applies relayed <c>mg.action</c>s through the pure
    /// <see cref="InvestigationReducer"/>, broadcasts <c>mg.state</c> at most every <see cref="StatePeriodS"/>, decides the lock
    /// (everyone voted, or the deadline) and closes the run with <c>mg.summary</c>. Without a room connection a deterministic
    /// <see cref="RehearsalCrew"/> plays the phones.
    /// </summary>
    public sealed class InvestigationHost : IDisposable
    {
        /// <summary>mg.state period, s (protocol: at most 10 Hz).</summary>
        public const double StatePeriodS = 0.1;
        /// <summary>MG-28 play length, ms (data/minigames.json duration_s 45, game_value).</summary>
        public const long DurationMs = 45000;
        /// <summary>Instruction and demo time before play (protocol: at least 3000 ms).</summary>
        public const long LeadInMs = 3000;
        /// <summary>
        /// Once everyone has voted, the host waits this long without any new action before it locks, s (game_value). Phones send
        /// a vote on every tap and keep their LOCK local, so locking on the last vote would freeze the chain mid-play.
        /// </summary>
        public const double QuietLockS = 3.0;

        private readonly IMinigameChannel _channel;
        private readonly ScoringCatalog _catalog;
        private readonly Func<double> _clockS;
        private readonly RehearsalCrew _crew;
        private double _lastBroadcast = double.NegativeInfinity;
        private double _lastApplied;
        private bool _dirty;

        public InvestigationHost(InvestigationSetup setup, IMinigameChannel channel, ScoringCatalog catalog, Func<double> clockS, string runId, uint seed32, string assistLevel)
        {
            Setup = setup ?? throw new ArgumentNullException(nameof(setup));
            _catalog = catalog ?? throw new ArgumentNullException(nameof(catalog));
            _clockS = clockS ?? throw new ArgumentNullException(nameof(clockS));
            _channel = channel != null && channel.IsConnected ? channel : null;
            RunId = runId;
            State = InvestigationReducer.Start(setup);
            StartedAtS = clockS();
            DeadlineS = StartedAtS + (LeadInMs + DurationMs) / 1000.0;
            if (_channel != null)
            {
                _channel.Received += OnReceived;
                long now = _channel.NowMs();
                _channel.Send("mg.start", setup.MgStart(runId, seed32, now + LeadInMs, DurationMs, assistLevel));
            }
            else
            {
                _crew = new RehearsalCrew(setup, StartedAtS);
            }
        }

        public InvestigationSetup Setup { get; }
        public InvestigationState State { get; private set; }
        public string RunId { get; }
        public double StartedAtS { get; }
        public double DeadlineS { get; }
        public bool IsRehearsal => _channel == null;
        public JObject LastSummary { get; private set; }
        /// <summary>Messages sent in rehearsal (what would have gone on the wire), for evidence and tests.</summary>
        public List<KeyValuePair<string, JObject>> Outbox { get; } = new List<KeyValuePair<string, JObject>>();

        public event Action<InvestigationState> Changed;

        public double SecondsLeft => Math.Max(0.0, DeadlineS - _clockS());

        public ActionOutcome Act(string playerId, int n, string action, IReadOnlyList<double> x)
        {
            ActionOutcome o = InvestigationReducer.Apply(Setup, State, playerId, n, action, x, out InvestigationState next);
            State = next;
            if (o == ActionOutcome.Applied)
            {
                _dirty = true;
                _lastApplied = _clockS();
                Changed?.Invoke(State);
            }
            return o;
        }

        /// <summary>Locks now (the host's "close the vote").</summary>
        public void LockNow()
        {
            if (State.Locked) return;
            State = InvestigationReducer.Lock(State);
            _dirty = true;
            Broadcast(_clockS());
            LastSummary = InvestigationReducer.Summary(_catalog, Setup, State, RunId);
            Send("mg.summary", LastSummary);
            Changed?.Invoke(State);
        }

        public void Tick()
        {
            double now = _clockS();
            if (_crew != null)
            {
                foreach (RehearsalCrew.Move m in _crew.Due(now)) Act(m.PlayerId, m.N, m.Action, m.X);
            }
            bool settled = InvestigationReducer.EveryoneVoted(Setup, State) && now - _lastApplied >= QuietLockS;
            if (!State.Locked && (settled || now >= DeadlineS)) LockNow();
            if (_dirty && now - _lastBroadcast >= StatePeriodS) Broadcast(now);
        }

        private void Broadcast(double now)
        {
            _dirty = false;
            _lastBroadcast = now;
            Send("mg.state", new JObject
            {
                { "runId", RunId },
                { "n", State.StateN },
                { "shared", InvestigationReducer.Shared(State) },
                { "progress", new JArray(Setup.PlayerIds.Select(p => new JObject { { "playerId", p }, { "p", State.Votes.ContainsKey(p) ? 1.0 : 0.5 } })) },
            });
        }

        private void Send(string type, JObject payload)
        {
            if (_channel != null) _channel.Send(type, payload);
            else Outbox.Add(new KeyValuePair<string, JObject>(type, payload));
        }

        private void OnReceived(string from, string type, JObject payload)
        {
            if (type != "mg.action" || payload == null) return;
            if (payload["runId"]?.Type != JTokenType.String || (string)payload["runId"] != RunId) return;
            if (payload["n"]?.Type != JTokenType.Integer || payload["a"]?.Type != JTokenType.String) return;
            var x = new List<double>();
            foreach (JToken v in (payload["x"] as JArray) ?? new JArray())
            {
                if (v.Type != JTokenType.Integer && v.Type != JTokenType.Float) return;
                x.Add((double)v);
            }
            long n = (long)payload["n"];
            if (n < 0 || n > int.MaxValue) return;
            Act(from, (int)n, (string)payload["a"], x);
        }

        /// <summary>Closes the run (sends mg.summary if it is still open) and stops listening.</summary>
        public void Dispose()
        {
            if (!State.Locked) LockNow();
            if (_channel != null) _channel.Received -= OnReceived;
        }
    }

    /// <summary>
    /// Rehearsal stand-in for the phones: each player places their true-chain cards in turn, one player first tries a red
    /// herring and takes it off again, and everyone votes (one first leans to a wrong cause, then changes). Deterministic;
    /// every timing is a rehearsal value, not a design value.
    /// </summary>
    public sealed class RehearsalCrew
    {
        /// <summary>Rehearsal: seconds between two moves of the crew.</summary>
        public const double MoveSpacingS = 1.6;

        public readonly struct Move
        {
            public Move(double atS, string playerId, int n, string action, double[] x)
            {
                AtS = atS;
                PlayerId = playerId;
                N = n;
                Action = action;
                X = x;
            }

            public double AtS { get; }
            public string PlayerId { get; }
            public int N { get; }
            public string Action { get; }
            public double[] X { get; }
        }

        private readonly List<Move> _moves = new List<Move>();
        private int _next;

        public RehearsalCrew(InvestigationSetup s, double startS)
        {
            var counters = new Dictionary<string, int>();
            double t = startS + 2.0;
            void Add(string p, string a, params double[] x)
            {
                counters[p] = (counters.TryGetValue(p, out int n) ? n : 0) + 1;
                _moves.Add(new Move(t, p, counters[p], a, x));
                t += MoveSpacingS;
            }
            if (s.PlayerIds.Count == 0) return;

            string Owner(int clueIndex) => s.PlayerIds[s.OwnerSlot(clueIndex)];
            int herring = Enumerable.Range(0, s.Clues.Length).FirstOrDefault(i => s.Table.Clues[s.Clues[i]].IsHerring);
            Add(Owner(herring), "place", herring, 0);
            Add(Owner(herring), "clear", 0);
            for (int place = 0; place < s.ChainLen; place++)
            {
                int card = s.TrueChain[place];
                Add(Owner(card), "place", card, place);
            }
            int wrong = (s.CauseCorrect + 1) % InvestigationSetup.OptionCount;
            for (int i = 0; i < s.PlayerIds.Count; i++)
            {
                Add(s.PlayerIds[i], "vote", i == 0 ? wrong : s.CauseCorrect);
                if (i == 1) Add(s.PlayerIds[0], "vote", s.CauseCorrect);
            }
        }

        public IReadOnlyList<Move> Moves => _moves;

        public IEnumerable<Move> Due(double nowS)
        {
            while (_next < _moves.Count && _moves[_next].AtS <= nowS) yield return _moves[_next++];
        }
    }
}
