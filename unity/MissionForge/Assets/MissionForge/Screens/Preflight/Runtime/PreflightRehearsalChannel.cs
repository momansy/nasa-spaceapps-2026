#if UNITY_EDITOR || MF_REHEARSAL
using System;
using System.Collections.Generic;
using MissionForge.Core.Random;
using MissionForge.Net;
using MissionForge.Screens.BuildBay;
using Newtonsoft.Json.Linq;

namespace MissionForge.Screens.Preflight
{
    /// <summary>
    /// Rehearsal driver of the pre-flight screens (editor, development and <c>MF_REHEARSAL</c> builds; labelled REHEARSAL on
    /// screen): a stand-in for the room server so every screen can be shown without phones. Votes are served by the Build
    /// Bay's seeded <see cref="RehearsalVoteChannel"/> (same stage plan and resolution order as protocol section 7; stage
    /// lengths are shortened per vote profile); <c>poll.open</c> is answered here with seeded <c>poll.call</c> /
    /// <c>poll.answered</c> / <c>poll.result</c> envelopes following protocol section 8 (each connected player is called once, at
    /// the first of their roles in the order; disconnected players are NO_ANSWER at the end).
    /// Player counts 1, 4 and 10: with 10 the vote electorate is 10 seats of which the 4 rehearsal voters cast ballots.
    /// </summary>
    public sealed class PreflightRehearsalChannel : IPreflightChannel
    {
        private static readonly string[] CallOrder = { "BOOSTER", "STRUCT", "GUIDO", "FIDO", "EECOM", "INCO", "PAYLOAD", "RETRO", "PM", "FLIGHT" };

        private readonly RehearsalVoteChannel _votes;
        private readonly List<Seat> _seats = new List<Seat>();
        private readonly List<(long at, Action act)> _queue = new List<(long, Action)>();
        private readonly Func<long> _now;
        private readonly SeededRandom _rng;
        private int _outcomeSeq = 100;
        private int _noGoRoundsDone;

        public PreflightRehearsalChannel(ulong seed, int players = 4, float pace = 1f, Func<long> now = null)
        {
            _now = now ?? (() => DateTimeOffset.UtcNow.ToUnixTimeMilliseconds());
            _rng = new SeededRandom(seed).ForStream("preflight-rehearsal");
            Pace = pace <= 0 ? 1f : pace;
            _votes = new RehearsalVoteChannel(seed, Pace, _now) { Solo = players == 1 };
            _votes.Received += (type, d) => Forward(type, d);
            BuildSeats(players);
        }

        /// <summary>Number of leading poll rounds that contain one NO-GO (FRR: 1 = NO-GO, re-poll, GO; 2 = rework offered).</summary>
        public int NoGoRounds = 1;
        /// <summary>The console that answers NO-GO in those rounds.</summary>
        public string NoGoRole = "EECOM";
        /// <summary>A player who is disconnected during polls (recorded NO_ANSWER); null for none.</summary>
        public string DisconnectedPlayerId;
        /// <summary>
        /// Rehearsal only: an option id listed first for the synthetic voters (their ballots favour the first option), so a
        /// demo can show e.g. a Rework. Display order is free in the protocol; null keeps the host's order.
        /// </summary>
        public string LeanOptionId;
        public float Pace { get; set; }
        public bool HiddenTallies { get => _votes.HiddenTallies; set => _votes.HiddenTallies = value; }

        public bool IsRehearsal => true;
        public bool HasClock => true;
        public RoomSettingsDto Settings => null;
        public IReadOnlyList<Seat> Seats => _seats;
        public event Action<string, JObject> Received;

        public long ServerNowMs() => _votes.ServerNowMs();
        public string PlayerName(string playerId) => _seats.Find(s => s.PlayerId == playerId)?.Name ?? playerId;
        public void SetPaused(bool paused) => _votes.SetPaused(paused);
        public void Dispose() { _votes.Dispose(); _queue.Clear(); }

        public void Send(string type, JObject payload)
        {
            switch (type)
            {
                case "vote.open":
                    Shape((string)payload["kind"]);
                    _votes.Send(type, Lean(payload));
                    break;
                case "poll.open": OpenPoll(payload); break;
                case "vote.cancel": _votes.Send(type, payload); break;
            }
        }

        public void Tick()
        {
            _votes.Tick();
            if (_votes.Paused) return;
            long now = _now();
            while (true)
            {
                int next = -1;
                for (int i = 0; i < _queue.Count; i++) if (_queue[i].at <= now && (next < 0 || _queue[i].at < _queue[next].at)) next = i;
                if (next < 0) break;
                Action act = _queue[next].act;
                _queue.RemoveAt(next);
                act();
            }
        }

        private JObject Lean(JObject open)
        {
            if (LeanOptionId == null || !(open["options"] is JArray options)) return open;
            int index = -1;
            for (int i = 0; i < options.Count; i++) if ((string)options[i]["id"] == LeanOptionId) index = i;
            if (index <= 0) return open;
            var copy = (JObject)open.DeepClone();
            var opts = (JArray)copy["options"];
            JToken lead = opts[index];
            opts.RemoveAt(index);
            opts.Insert(0, lead);
            return copy;
        }

        // ------------------------------------------------------------------ roster

        private void BuildSeats(int players)
        {
            string[] names = { "Ana", "Kofi", "Mei", "Ravi", "Sofia", "Tariq", "Lena", "Diego", "Noor", "Jun" };
            string[][] groups;
            if (players <= 1) groups = new[] { CallOrder };
            else if (players >= 10) groups = Array.ConvertAll(CallOrder, r => new[] { r });
            else groups = new[]
            {
                new[] { "PM", "FLIGHT" }, new[] { "BOOSTER", "STRUCT" }, new[] { "GUIDO", "FIDO" }, new[] { "EECOM", "INCO", "PAYLOAD", "RETRO" },
            };
            for (int i = 0; i < groups.Length; i++)
            {
                var seat = new Seat { PlayerId = "p" + (i + 1), Name = names[i % names.Length] };
                seat.Roles.AddRange(groups[i]);
                _seats.Add(seat);
            }
        }

        // ------------------------------------------------------------------ votes

        /// <summary>Quick profile: VOTE only; CHOICE: REVEAL (+ INSPECT for contracts); stage lengths in rehearsal ms.</summary>
        private void Shape(string kind)
        {
            bool quick = kind == "TEST" || kind == "REVIEW" || kind == "ANOMALY";
            _votes.RevealMs = quick ? 0 : 2000;
            _votes.InspectMs = kind == "CONTRACT" ? 6000 : 0;
            _votes.VoteMs = quick ? 6000 : 8000;
            _votes.ResultMs = quick ? 2000 : 3000;
            _votes.Pace = Pace;
        }

        private void Forward(string type, JObject d)
        {
            if (type == "vote.opened" && _seats.Count > 4 && !(bool)d["solo"])
            {
                var voters = new JArray();
                foreach (Seat s in _seats) voters.Add(s.PlayerId);
                d["voters"] = voters;
            }
            Received?.Invoke(type, d);
        }

        // ------------------------------------------------------------------ polls

        private void OpenPoll(JObject open)
        {
            string pollId = (string)open["pollId"];
            string context = (string)open["context"];
            int round = (int)open["round"];
            int perCall = (int?)open["perCallMs"] ?? 5000;
            var order = new List<string>();
            foreach (JToken r in (JArray)open["order"]) order.Add((string)r);

            // Each connected player is called once, at the first of their roles in the order, answering for all their listed roles.
            var calls = new List<(Seat seat, List<string> roles)>();
            var disconnected = new List<(Seat seat, List<string> roles)>();
            var seen = new HashSet<string>();
            foreach (string role in order)
            {
                Seat seat = _seats.Find(s => s.Roles.Contains(role));
                if (seat == null || !seen.Add(seat.PlayerId)) continue;
                var roles = order.FindAll(r => seat.Roles.Contains(r));
                if (seat.PlayerId == DisconnectedPlayerId) disconnected.Add((seat, roles));
                else calls.Add((seat, roles));
            }

            bool noGoRound = _noGoRoundsDone < NoGoRounds;
            if (noGoRound) _noGoRoundsDone++;
            long t = _now();
            int step = (int)(Math.Max(1200, perCall * 0.32) * Pace);
            var answers = new JArray();
            for (int i = 0; i < calls.Count; i++)
            {
                (Seat seat, List<string> roles) = calls[i];
                long callAt = t + 400 + i * step;
                int index = i + 1;
                bool noGo = noGoRound && roles.Contains(NoGoRole);
                string answer = noGo ? PollAnswer.NoGo : PollAnswer.Go;
                long answerAt = callAt + (long)((700 + _rng.NextInt(0, 700)) * Pace);
                JObject entry = new JObject { ["playerId"] = seat.PlayerId, ["roles"] = new JArray(roles), ["answer"] = answer };
                answers.Add(entry);
                At(callAt, () => Emit("poll.call", new JObject
                {
                    ["pollId"] = pollId, ["context"] = context, ["round"] = round, ["index"] = index, ["total"] = calls.Count,
                    ["playerId"] = seat.PlayerId, ["roles"] = new JArray(roles), ["endsAtMs"] = callAt + (long)(perCall * Pace),
                }));
                At(answerAt, () => Emit("poll.answered", new JObject { ["pollId"] = pollId, ["entry"] = entry }));
            }
            foreach ((Seat seat, List<string> roles) in disconnected)
                answers.Add(new JObject { ["playerId"] = seat.PlayerId, ["roles"] = new JArray(roles), ["answer"] = PollAnswer.NoAnswer });

            int noGoCount = 0;
            foreach (JToken a in answers) if ((string)a["answer"] == PollAnswer.NoGo) noGoCount++;
            long end = t + 400 + calls.Count * step + 300;
            At(end, () => Emit("poll.result", new JObject
            {
                ["outcomeSeq"] = ++_outcomeSeq, ["pollId"] = pollId, ["context"] = context, ["round"] = round,
                ["answers"] = answers, ["allGo"] = noGoCount == 0, ["noGoCount"] = noGoCount,
            }));
        }

        private void At(long at, Action a) => _queue.Add((at, a));
        private void Emit(string type, JObject d) => Received?.Invoke(type, d);
    }
}
#endif
