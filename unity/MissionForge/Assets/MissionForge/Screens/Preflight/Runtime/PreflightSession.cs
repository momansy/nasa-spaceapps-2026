using System;
using System.Threading.Tasks;
using MissionForge.Screens.BuildBay;
using Newtonsoft.Json.Linq;

namespace MissionForge.Screens.Preflight
{
    /// <summary>How a vote round ended, as the host sees it.</summary>
    public sealed class VoteOutcome
    {
        public string RoundId;
        public string WinnerId;
        public string Method;
        public bool Cancelled;
        public string CancelReason;
    }

    /// <summary>
    /// Adapter over the room (or the rehearsal driver) for the pre-flight screens (T027 step 2): sends
    /// <c>vote.open</c> / <c>vote.commit</c> / <c>poll.open</c> / <c>phase.set</c>, applies the server's <c>vote.*</c>,
    /// <c>poll.*</c> and <c>ping.event</c> messages to a <see cref="VoteRoundModel"/> and a <see cref="PollModel"/>, and
    /// turns rounds into awaitable tasks. The room server is the authority for votes and polls; timers are server-clock
    /// deadlines (<see cref="VoteClock"/>) and stay hidden until the clock offset is known.
    /// </summary>
    public sealed class PreflightSession : IDisposable
    {
        private static int s_sequence;
        private TaskCompletionSource<VoteOutcome> _voteTask;
        private TaskCompletionSource<PollResult> _pollTask;
        private string _voteRoundId;

        public PreflightSession(IPreflightChannel channel)
        {
            Channel = channel ?? throw new ArgumentNullException(nameof(channel));
            Channel.Received += OnReceived;
        }

        public IPreflightChannel Channel { get; }
        public VoteRoundModel Round { get; } = new VoteRoundModel();
        public PollModel Poll { get; } = new PollModel();

        /// <summary>Raised after the vote round view changed (open, stage, tally, tags, vetoes, result).</summary>
        public event Action RoundChanged;

        /// <summary>Raised after the poll view changed (call, answer, result).</summary>
        public event Action PollChanged;

        public bool HasClock => Channel.HasClock;
        public long ServerNowMs => Channel.ServerNowMs();

        /// <summary>Whole seconds left in the current stage; null when untimed or the clock is not known yet.</summary>
        public int? SecondsLeft => Channel.HasClock ? VoteClock.SecondsLeft(Round.EndsAtMs, Channel.ServerNowMs()) : null;

        /// <summary>Whole seconds left for the called console's answer window; null when none.</summary>
        public int? PollSecondsLeft => Channel.HasClock ? VoteClock.SecondsLeft(Poll.CallEndsAtMs, Channel.ServerNowMs()) : null;

        public void Tick() => Channel.Tick();

        public static string NewId(string prefix) => "m.t027." + prefix + "." + (++s_sequence);

        /// <summary>Opens a round and completes when the server resolves or cancels it. The caller sends <see cref="Commit"/>.</summary>
        public Task<VoteOutcome> RunVoteAsync(JObject voteOpen)
        {
            _voteRoundId = (string)voteOpen["roundId"];
            _voteTask = new TaskCompletionSource<VoteOutcome>(TaskCreationOptions.RunContinuationsAsynchronously);
            Channel.Send("vote.open", voteOpen);
            return _voteTask.Task;
        }

        /// <summary>The host applied the winner: <c>vote.commit</c> (deltas empty for votes that do not change the build).</summary>
        public void Commit(string roundId, string winnerId, JArray deltas = null) =>
            Channel.Send("vote.commit", new JObject
            {
                ["roundId"] = roundId,
                ["winnerId"] = winnerId,
                ["deltas"] = deltas ?? new JArray(),
                ["codexIds"] = new JArray(),
            });

        public void CancelVote()
        {
            if (Round.RoundId != null && Round.IsOpen) Channel.Send("vote.cancel", new JObject { ["roundId"] = Round.RoundId });
        }

        /// <summary>Opens one GO/NO-GO poll round and completes with the server's <c>poll.result</c>.</summary>
        public Task<PollResult> RunPollAsync(string pollId, string context, int round, string[] order, int perCallMs = 5000)
        {
            _pollTask = new TaskCompletionSource<PollResult>(TaskCreationOptions.RunContinuationsAsynchronously);
            Poll.Begin(pollId, context, round, order, perCallMs, Channel.ServerNowMs());
            Channel.Send("poll.open", new JObject
            {
                ["pollId"] = pollId,
                ["context"] = context,
                ["round"] = round,
                ["order"] = new JArray(order),
                ["perCallMs"] = perCallMs,
            });
            PollChanged?.Invoke();
            return _pollTask.Task;
        }

        /// <summary>
        /// <c>phase.set</c> with sub-state, for the BUILD sub-states the pre-flight screens own (TEST, REVIEW + PDR / CDR) and the
        /// FRR. The host navigator sends the plain top-level phase on its own; this keeps phones on the right sub-screen.
        /// </summary>
        public void SetPhase(int missionSeq, string phase, string sub, string review, string contractId, string mode = "QUICK")
        {
            Channel.Send("phase.set", new JObject
            {
                ["missionSeq"] = missionSeq,
                ["mode"] = mode,
                ["phase"] = phase,
                ["sub"] = sub,
                ["review"] = review,
                ["flightPhase"] = null,
                ["segment"] = null,
                ["boosterTrack"] = false,
                ["contractId"] = contractId,
                ["step"] = null,
            });
        }

        public void Dispose()
        {
            Channel.Received -= OnReceived;
            _voteTask?.TrySetResult(new VoteOutcome { RoundId = _voteRoundId, Cancelled = true, CancelReason = "DISPOSED" });
            Channel.Dispose();
        }

        private void OnReceived(string type, JObject data)
        {
            if (type.StartsWith("poll.", StringComparison.Ordinal))
            {
                if (Poll.Apply(type, data, Channel.ServerNowMs()))
                {
                    PollChanged?.Invoke();
                    if (type == "poll.result" && Poll.Result != null) _pollTask?.TrySetResult(Poll.Result);
                }
                return;
            }

            bool changed = Round.Apply(type, data);
            if (!changed) return;
            RoundChanged?.Invoke();
            if (_voteTask == null) return;
            if (type == "vote.result" && (string)data["roundId"] == _voteRoundId)
                _voteTask.TrySetResult(new VoteOutcome { RoundId = _voteRoundId, WinnerId = Round.WinnerId, Method = Round.Method });
            else if (type == "vote.cancelled" && (string)data["roundId"] == _voteRoundId)
                _voteTask.TrySetResult(new VoteOutcome { RoundId = _voteRoundId, Cancelled = true, CancelReason = Round.CancelReason });
        }
    }
}
