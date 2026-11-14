#if UNITY_EDITOR || MF_REHEARSAL
using System;
using System.Collections.Generic;
using MissionForge.Core.Random;
using Newtonsoft.Json.Linq;

namespace MissionForge.Screens.BuildBay
{
    /// <summary>
    /// Rehearsal driver (T015 step 5): a stand-in for the room server so the Build Bay can be shown without phones.
    /// It answers the host's <c>vote.open</c> with synthetic, seeded <c>vote.opened</c>, <c>vote.stage</c>,
    /// <c>vote.tally</c>, <c>vote.tags</c>, <c>vote.vetoed</c>, <c>ping.event</c> and <c>vote.result</c> envelopes
    /// from four rehearsal players, following the stage plan and resolution order of protocol/messages.md §7
    /// (plurality; strict-majority runoff between the top two; ties broken by FLIGHT's pick). Only in editor,
    /// development and MF_REHEARSAL builds; labelled REHEARSAL on screen.
    /// </summary>
    public sealed class RehearsalVoteChannel : IBayVoteChannel
    {
        private sealed class Player
        {
            public string Id, Name, Role;
            public string Ballot;
        }

        private readonly List<Player> _players = new List<Player>
        {
            new Player { Id = "p1", Name = "Ana", Role = "FLIGHT" },
            new Player { Id = "p2", Name = "Kofi", Role = "BOOSTER" },
            new Player { Id = "p3", Name = "Mei", Role = "STRUCT" },
            new Player { Id = "p4", Name = "Ravi", Role = "PM" },
        };

        private readonly List<(long at, Action act)> _queue = new List<(long, Action)>();
        private readonly ulong _seed;
        private readonly Func<long> _now;
        private int _outcomeSeq;
        private int _round;
        private bool _vetoUsed;

        /// <param name="seed">Session seed (stream <c>rehearsal</c>).</param>
        /// <param name="pace">Multiplier on every stage duration (1 = the durations below).</param>
        /// <param name="now">Clock, epoch ms (tests pass a fake clock).</param>
        public RehearsalVoteChannel(ulong seed, float pace = 1f, Func<long> now = null)
        {
            _seed = seed;
            Pace = pace <= 0 ? 1f : pace;
            _now = now ?? (() => DateTimeOffset.UtcNow.ToUnixTimeMilliseconds());
        }

        /// <summary>Stage durations at pace 1, ms (shorter than the room defaults so a full C1 build fits a demo). game_value.</summary>
        public int RevealMs = 2000, InspectMs = 5000, VoteMs = 8000, RunoffMs = 5000, PickMs = 2500, ResultMs = 3000;

        public float Pace { get; set; }
        public bool HiddenTallies { get; set; }
        public bool Solo { get; set; }
        /// <summary>Freezes the script (evidence shots hold a stage); deadlines move with the pause.</summary>
        public bool Paused { get; private set; }
        private long _pausedAt;

        public bool IsRehearsal => true;
        public bool HasClock => true;
        public event Action<string, JObject> Received;

        public long ServerNowMs() => Paused ? _pausedAt : _now();

        public string PlayerName(string playerId)
        {
            foreach (Player p in _players) if (p.Id == playerId) return p.Name;
            return playerId;
        }

        public void SetPaused(bool paused)
        {
            if (paused == Paused) return;
            if (paused)
            {
                _pausedAt = _now();
                Paused = true;
                return;
            }
            long shift = _now() - _pausedAt;
            for (int i = 0; i < _queue.Count; i++) _queue[i] = (_queue[i].at + shift, _queue[i].act);
            Paused = false;
        }

        public void Send(string type, JObject payload)
        {
            if (type == "vote.open") Open(payload);
            else if (type == "vote.cancel") Emit("vote.cancelled", new JObject { ["roundId"] = payload["roundId"], ["reason"] = "HOST" });
        }

        public void Tick()
        {
            if (Paused) return;
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

        public void Dispose() => _queue.Clear();

        // ------------------------------------------------------------------ script

        private int Ms(int ms) => (int)(ms * Pace);

        private void At(long at, Action a) => _queue.Add((at, a));

        private void Emit(string type, JObject d) => Received?.Invoke(type, d);

        private void Open(JObject open)
        {
            _round++;
            _queue.Clear();
            string roundId = (string)open["roundId"];
            var rng = new SeededRandom(_seed).ForStream("rehearsal-round:" + _round);
            var options = (JArray)open["options"];
            var ids = new List<string>();
            var winnable = new List<string>();
            foreach (JToken o in options)
            {
                string id = (string)o["id"];
                ids.Add(id);
                bool can = (string)o["afford"] != "NEVER" && !((bool)o["willNotFly"] && !(bool)o["fixExists"]);
                if (can) winnable.Add(id);
            }
            if (winnable.Count == 0) winnable.AddRange(ids);
            var owners = new List<string>();
            foreach (JToken r in (JArray)open["ownerRoles"]) owners.Add((string)r);
            foreach (Player p in _players) p.Ballot = null;

            bool strictMajority = _round % 3 == 0;
            bool veto = !_vetoUsed && _round % 4 == 2 && winnable.Count >= 3;
            long t = _now();
            var plan = new JArray();
            if (!Solo) plan.Add(Plan("REVEAL", Ms(RevealMs)));
            if (!Solo) plan.Add(Plan("INSPECT", Ms(InspectMs)));
            plan.Add(Plan("VOTE", Solo ? (int?)null : Ms(VoteMs)));
            plan.Add(Plan("RESULT", Ms(ResultMs)));
            var voters = new JArray();
            foreach (Player p in Solo ? _players.GetRange(0, 1) : _players) voters.Add(p.Id);
            Emit("vote.opened", new JObject
            {
                ["roundId"] = roundId, ["kind"] = open["kind"], ["subjectId"] = open["subjectId"], ["title"] = open["title"],
                ["why"] = open["why"], ["ownerRoles"] = open["ownerRoles"], ["options"] = options, ["hint"] = null, ["predict"] = null,
                ["voters"] = voters, ["solo"] = Solo, ["vetoAllowed"] = !Solo, ["tagsAllowed"] = !Solo, ["strictMajority"] = strictMajority,
                ["tallyVisibility"] = HiddenTallies ? "HIDDEN" : "OPEN", ["audienceVoteWeight"] = 0, ["plan"] = plan,
            });

            // Favourite of each player: seeded pick among winnable options, biased to the first (cheapest-looking) ones.
            var favourite = new Dictionary<string, string>();
            foreach (Player p in _players) favourite[p.Id] = winnable[Math.Min(winnable.Count - 1, (int)(rng.NextDouble() * rng.NextDouble() * winnable.Count))];

            if (Solo)
            {
                Stage(t, roundId, "VOTE", null, ids);
                At(t + Ms(3000), () => Resolve(roundId, ids, new Dictionary<string, string> { [_players[0].Id] = favourite[_players[0].Id] }, false, "SOLO", rng, ids));
                return;
            }

            Stage(t, roundId, "REVEAL", t + Ms(RevealMs), ids);
            long inspect = t + Ms(RevealMs);
            At(inspect, () => Stage(inspect, roundId, "INSPECT", inspect + Ms(InspectMs), ids));
            // Tags from owner-role holders, a ping, and sometimes PM's veto of the most expensive winnable option.
            Player owner = _players.Find(p => owners.Contains(p.Role));
            if (owner != null)
            {
                string rec = favourite[owner.Id];
                string concern = winnable.Find(x => x != rec);
                At(inspect + Ms(1200), () => Emit("vote.tags", new JObject
                {
                    ["roundId"] = roundId,
                    ["tags"] = new JArray
                    {
                        new JObject { ["optionId"] = rec, ["playerId"] = owner.Id, ["role"] = owner.Role, ["tag"] = "RECOMMENDED" },
                    },
                }));
                if (concern != null)
                {
                    At(inspect + Ms(2600), () => Emit("vote.tags", new JObject
                    {
                        ["roundId"] = roundId,
                        ["tags"] = new JArray
                        {
                            new JObject { ["optionId"] = rec, ["playerId"] = owner.Id, ["role"] = owner.Role, ["tag"] = "RECOMMENDED" },
                            new JObject { ["optionId"] = concern, ["playerId"] = owner.Id, ["role"] = owner.Role, ["tag"] = "CONCERN" },
                        },
                    }));
                }
            }
            string[] pings = { "NEED_MORE_DV", "TOO_EXPENSIVE", "LIKE_THIS", "CHECK_DRAWBACK", "TEST_IT_FIRST", "AGREED", "TRUST_ME", "TOO_HEAVY" };
            Player pinger = _players[rng.NextInt(0, _players.Count)];
            string pingId = pings[rng.NextInt(0, pings.Length)];
            string pingAt = ids[rng.NextInt(0, ids.Count)];
            At(inspect + Ms(1800), () => Emit("ping.event", new JObject { ["playerId"] = pinger.Id, ["pingId"] = pingId, ["roundId"] = roundId, ["optionId"] = pingAt }));
            var live = new List<string>(ids);
            if (veto)
            {
                _vetoUsed = true;
                string target = winnable[winnable.Count - 1];
                winnable.Remove(target);
                live.Remove(target);
                foreach (Player p in _players) if (favourite[p.Id] == target) favourite[p.Id] = winnable[0];
                At(inspect + Ms(3200), () => Emit("vote.vetoed", new JObject
                {
                    ["roundId"] = roundId, ["optionId"] = target, ["playerId"] = "p4", ["clearedVoterIds"] = new JArray(), ["remainingOptionIds"] = new JArray(live),
                }));
            }

            long vote = inspect + Ms(InspectMs);
            At(vote, () => Stage(vote, roundId, "VOTE", vote + Ms(VoteMs), live));
            var ballots = new Dictionary<string, string>();
            for (int i = 0; i < _players.Count; i++)
            {
                Player p = _players[i];
                long castAt = vote + Ms(800 + i * 1300 + rng.NextInt(0, 700));
                At(castAt, () =>
                {
                    ballots[p.Id] = favourite[p.Id];
                    Tally(roundId, "VOTE", live, ballots);
                });
            }
            // One player changes their mind halfway through (ballots may change until the timer ends, §4.1).
            Player changer = _players[rng.NextInt(0, _players.Count)];
            At(vote + Ms(6400), () =>
            {
                string alt = winnable[rng.NextInt(0, winnable.Count)];
                ballots[changer.Id] = alt;
                Tally(roundId, "VOTE", live, ballots);
            });
            At(vote + Ms(VoteMs), () => Close(roundId, live, ballots, strictMajority, rng, vote + Ms(VoteMs)));
        }

        private void Close(string roundId, List<string> live, Dictionary<string, string> ballots, bool strictMajority, SeededRandom rng, long at)
        {
            var counts = Count(live, ballots);
            int top = 0, voted = ballots.Count, withBallots = 0;
            foreach (int n in counts.Values) { top = Math.Max(top, n); if (n > 0) withBallots++; }
            if (strictMajority && top * 2 <= voted && withBallots >= 3)
            {
                // Runoff between the top two (§7 resolution order 2), ballots reset.
                var ordered = new List<string>(live);
                ordered.Sort((a, b) => counts[b].CompareTo(counts[a]));
                var pair = ordered.GetRange(0, 2);
                var runoffBallots = new Dictionary<string, string>();
                Stage(at, roundId, "RUNOFF", at + Ms(RunoffMs), pair);
                Tally(roundId, "RUNOFF", pair, runoffBallots);
                for (int i = 0; i < _players.Count; i++)
                {
                    Player p = _players[i];
                    int idx = i;
                    At(at + Ms(700 + i * 900), () =>
                    {
                        runoffBallots[p.Id] = pair[(idx + (int)(_seed % 3)) % 2 == 0 ? 0 : 1];
                        Tally(roundId, "RUNOFF", pair, runoffBallots);
                    });
                }
                At(at + Ms(RunoffMs), () => Resolve(roundId, pair, runoffBallots, true, "TIMER", rng, live, counts));
                return;
            }
            Resolve(roundId, live, ballots, false, "TIMER", rng, live);
        }

        private void Resolve(string roundId, List<string> candidates, Dictionary<string, string> ballots, bool runoff, string closedBy,
            SeededRandom rng, List<string> all, Dictionary<string, int> firstRound = null)
        {
            var counts = Count(candidates, ballots);
            int top = -1;
            foreach (int n in counts.Values) top = Math.Max(top, n);
            var tied = new List<string>();
            foreach (string c in candidates) if (counts[c] == top) tied.Add(c);
            string method = runoff ? "RUNOFF" : "PLURALITY";
            string winner = tied[0];
            long now = _now();
            if (tied.Count > 1)
            {
                // Tie: FLIGHT's ballot breaks it (§7 resolution order 4), shown as a short TIEBREAK_PICK stage.
                string flight = ballots.TryGetValue("p1", out string b) && tied.Contains(b) ? b : tied[rng.NextInt(0, tied.Count)];
                winner = flight;
                method = "FLIGHT_TIEBREAK";
                Stage(now, roundId, "TIEBREAK_PICK", now + Ms(PickMs), tied, "p1");
                now += Ms(PickMs);
            }
            if (closedBy == "SOLO") method = "PLURALITY";
            string w = winner;
            var final = Counts(all, ballots);
            var tiedArray = new JArray(tied.Count > 1 ? tied.ToArray() : Array.Empty<string>());
            At(now, () =>
            {
                Emit("vote.result", new JObject
                {
                    ["outcomeSeq"] = ++_outcomeSeq, ["roundId"] = roundId, ["kind"] = "PART", ["subjectId"] = null, ["winnerId"] = w,
                    ["method"] = method, ["closedBy"] = closedBy, ["counts"] = final, ["ballots"] = new JArray(),
                    ["audienceCounts"] = new JArray(), ["audienceBallot"] = null,
                    ["firstRoundCounts"] = firstRound != null ? CountsOf(firstRound) : null,
                    ["tiedOptionIds"] = tiedArray, ["triviaWinnerId"] = null, ["vetoes"] = new JArray(), ["emergencyFunding"] = false,
                });
                long r = _now();
                Stage(r, roundId, "RESULT", r + Ms(ResultMs), new List<string> { w });
                At(r + Ms(ResultMs), () => Stage(_now(), roundId, "CLOSED", null, new List<string>()));
            });
        }

        private static Dictionary<string, int> Count(List<string> candidates, Dictionary<string, string> ballots)
        {
            var counts = new Dictionary<string, int>();
            foreach (string c in candidates) counts[c] = 0;
            foreach (string b in ballots.Values) if (b != null && counts.ContainsKey(b)) counts[b]++;
            return counts;
        }

        private static JArray Counts(List<string> candidates, Dictionary<string, string> ballots)
        {
            var arr = new JArray();
            foreach (var kv in Count(candidates, ballots)) arr.Add(new JObject { ["optionId"] = kv.Key, ["n"] = kv.Value });
            return arr;
        }

        private static JArray CountsOf(Dictionary<string, int> counts)
        {
            var arr = new JArray();
            foreach (var kv in counts) arr.Add(new JObject { ["optionId"] = kv.Key, ["n"] = kv.Value });
            return arr;
        }

        private void Tally(string roundId, string stage, List<string> candidates, Dictionary<string, string> ballots)
        {
            var counts = Count(candidates, ballots);
            string leader = null;
            int best = 0;
            foreach (string c in candidates) if (counts[c] > best) { best = counts[c]; leader = c; }
            Emit("vote.tally", new JObject
            {
                ["roundId"] = roundId, ["stage"] = stage,
                ["counts"] = HiddenTallies ? null : Counts(candidates, ballots),
                ["votedIds"] = new JArray(new List<string>(ballots.Keys).ToArray()),
                ["audienceCounts"] = HiddenTallies ? null : new JArray(), ["audienceTotal"] = 0,
                ["leadingOptionId"] = HiddenTallies ? null : leader,
            });
        }

        private void Stage(long startedAt, string roundId, string stage, long? endsAt, List<string> candidates, string picker = null) =>
            Emit("vote.stage", new JObject
            {
                ["roundId"] = roundId, ["stage"] = stage, ["startedAtMs"] = startedAt,
                ["endsAtMs"] = endsAt.HasValue ? (JToken)endsAt.Value : JValue.CreateNull(),
                ["candidateIds"] = new JArray(candidates.ToArray()), ["pickerId"] = picker,
            });

        private static JObject Plan(string stage, int? ms) => new JObject
        {
            ["stage"] = stage, ["durationMs"] = ms.HasValue ? (JToken)ms.Value : JValue.CreateNull(),
        };
    }
}
#endif
