using System;
using System.Collections.Generic;
using Newtonsoft.Json.Linq;

namespace MissionForge.Screens.Preflight
{
    /// <summary>GO / NO-GO answer of one console (protocol <c>GoNoGo</c> plus the host's NO_ANSWER).</summary>
    public static class PollAnswer
    {
        public const string Go = "GO";
        public const string NoGo = "NO_GO";
        public const string NoAnswer = "NO_ANSWER";
    }

    /// <summary>One recorded answer: a player and every role they answered for.</summary>
    public sealed class PollEntryState
    {
        public string PlayerId;
        public readonly List<string> Roles = new List<string>();
        public string Answer;
    }

    /// <summary>The final <c>poll.result</c> (protocol/messages.md section 13).</summary>
    public sealed class PollResult
    {
        public string PollId;
        public string Context;
        public int Round;
        public int OutcomeSeq;
        public bool AllGo;
        public int NoGoCount;
        /// <summary>All answers in call order, then disconnected players as NO_ANSWER.</summary>
        public readonly List<PollEntryState> Answers = new List<PollEntryState>();

        /// <summary>Console answers by role: GO / NO_GO / NO_ANSWER; null when the role was not polled.</summary>
        public string AnswerOf(string role)
        {
            foreach (PollEntryState e in Answers) if (e.Roles.Contains(role)) return e.Answer;
            return null;
        }

        /// <summary>Roles that answered GO (<paramref name="go"/>) and NO_GO, counted per console for Core's <c>FrrPoll.Record</c>.</summary>
        public void CountConsoles(out int go, out int noGo)
        {
            go = 0;
            noGo = 0;
            foreach (PollEntryState e in Answers)
            {
                if (e.Answer == PollAnswer.Go) go += e.Roles.Count;
                else if (e.Answer == PollAnswer.NoGo) noGo += e.Roles.Count;
            }
        }

        public static PollResult From(JObject d)
        {
            var r = new PollResult
            {
                PollId = (string)d["pollId"],
                Context = (string)d["context"],
                Round = (int?)d["round"] ?? 1,
                OutcomeSeq = (int?)d["outcomeSeq"] ?? 0,
                AllGo = (bool?)d["allGo"] ?? false,
                NoGoCount = (int?)d["noGoCount"] ?? 0,
            };
            if (d["answers"] is JArray arr) foreach (JToken t in arr) r.Answers.Add(PollModel.Entry(t));
            return r;
        }
    }

    /// <summary>
    /// The host's view of one GO/NO-GO poll round, built only from <c>poll.call</c>, <c>poll.answered</c> and
    /// <c>poll.result</c> exactly as protocol/messages.md section 8 defines them. The poll is opened by the host
    /// (<see cref="Begin"/>); the server calls the consoles one at a time. Pure C#: no Unity, no clock.
    /// </summary>
    public sealed class PollModel
    {
        public string PollId { get; private set; }
        public string Context { get; private set; }
        public int Round { get; private set; }
        public int PerCallMs { get; private set; }
        public readonly List<string> Order = new List<string>();

        /// <summary>1-based call position; 0 before the first <c>poll.call</c>.</summary>
        public int CallIndex { get; private set; }
        public int CallTotal { get; private set; }
        public string CalledPlayerId { get; private set; }
        public readonly List<string> CalledRoles = new List<string>();
        public long CallStartedAtMs { get; private set; }
        public long? CallEndsAtMs { get; private set; }

        public readonly List<PollEntryState> Answers = new List<PollEntryState>();
        public PollResult Result { get; private set; }

        public bool IsActive => PollId != null && Result == null;

        public void Begin(string pollId, string context, int round, IEnumerable<string> order, int perCallMs, long nowMs)
        {
            PollId = pollId;
            Context = context;
            Round = round;
            PerCallMs = perCallMs;
            Order.Clear();
            Order.AddRange(order);
            CallIndex = 0;
            CallTotal = 0;
            CalledPlayerId = null;
            CalledRoles.Clear();
            CallStartedAtMs = nowMs;
            CallEndsAtMs = null;
            Answers.Clear();
            Result = null;
        }

        /// <summary>Applies one server message of this poll. Returns true when the view changed.</summary>
        public bool Apply(string type, JObject d, long nowMs)
        {
            if (d == null || PollId == null || (string)d["pollId"] != PollId) return false;
            switch (type)
            {
                case "poll.call":
                    CallIndex = (int?)d["index"] ?? CallIndex + 1;
                    CallTotal = (int?)d["total"] ?? CallTotal;
                    CalledPlayerId = (string)d["playerId"];
                    CalledRoles.Clear();
                    if (d["roles"] is JArray roles) foreach (JToken r in roles) CalledRoles.Add((string)r);
                    CallStartedAtMs = nowMs;
                    CallEndsAtMs = (long?)d["endsAtMs"];
                    return true;
                case "poll.answered":
                    Answers.Add(Entry(d["entry"]));
                    if (CalledPlayerId == Answers[Answers.Count - 1].PlayerId)
                    {
                        CalledPlayerId = null;
                        CalledRoles.Clear();
                    }
                    return true;
                case "poll.result":
                    Result = PollResult.From(d);
                    CalledPlayerId = null;
                    CalledRoles.Clear();
                    CallEndsAtMs = null;
                    return true;
            }
            return false;
        }

        /// <summary>The answer of a console so far; null while the console is still waiting.</summary>
        public string AnswerOf(string role)
        {
            PollResult r = Result;
            if (r != null)
            {
                string final = r.AnswerOf(role);
                if (final != null) return final;
            }
            foreach (PollEntryState e in Answers) if (e.Roles.Contains(role)) return e.Answer;
            return null;
        }

        public bool IsBeingCalled(string role) => IsActive && CalledRoles.Contains(role);

        internal static PollEntryState Entry(JToken t)
        {
            var e = new PollEntryState { PlayerId = (string)t["playerId"], Answer = (string)t["answer"] ?? PollAnswer.NoAnswer };
            if (t["roles"] is JArray roles) foreach (JToken r in roles) e.Roles.Add((string)r);
            return e;
        }
    }
}
