// Drives the vote-round stage machine when a stage ends (timer or early close) —
// protocol/messages.md §7.1-§7.6. Room exposes the pure state transitions; this wires them to
// real time by reacting to `room.onStageEndHook`.
import type { OptionId, PayloadMap, VoteStage } from '../../../protocol/ts/messages.js';
import type { Room, StageEndReason } from './room.js';

type CloseOutcome = ReturnType<Room['closeVoteAndResolve']>;

function pollStep(room: Room): void {
  if (!room.poll) return;
  if (room.isPollDone()) {
    room.broadcastExplicit('poll.result', room.finishPoll() as unknown as Record<string, unknown>);
    return;
  }
  const call = room.currentPollCall();
  if (call) room.broadcastExplicit('poll.call', call as unknown as Record<string, unknown>);
}

export function wireVoteOrchestration(room: Room): void {
  room.onPollTimeoutHook = () => {
    const answered = room.timeoutCurrentPollCall();
    if (answered) room.broadcastExplicit('poll.answered', answered as unknown as Record<string, unknown>);
    pollStep(room);
  };
  room.onStageEndHook = (stage, reason) => {
    if (!room.round || room.round.stage !== stage) return;
    try {
      advance(room, stage, reason);
    } catch {
      // A stale timer racing a round that has already moved on; safe to ignore.
    }
  };
}

function advance(room: Room, stage: VoteStage, reason: StageEndReason): void {
  switch (stage) {
    case 'VOTE':
      handleCloseOutcome(room, room.closeVoteAndResolve(closedByFor(room, reason)));
      return;
    case 'RUNOFF':
      handleTieOrResult(room, room.closeRunoffAndResolve());
      return;
    case 'PREDICT': {
      const result = room.finishPredictOutcome();
      room.broadcastExplicit('vote.predict.result', result as unknown as Record<string, unknown>);
      goTo(room, room.nextLinearStage('PREDICT'));
      return;
    }
    case 'TIEBREAK_TRIVIA': {
      const decided = room.resolveDecisionTimeTiebreak();
      if (decided) {
        finalize(room, decided);
        return;
      }
      const result = room.finishTriviaOutcome();
      room.broadcastExplicit('vote.trivia.result', result as unknown as Record<string, unknown>);
      if (room.hasTriviaWinner()) {
        goTo(room, 'TIEBREAK_PICK');
      } else {
        finalize(room, room.resolveAfterTriviaStage(null));
      }
      return;
    }
    case 'TIEBREAK_PICK': {
      const decided = room.resolveDecisionTimeTiebreak();
      if (decided) {
        finalize(room, decided);
        return;
      }
      finalize(room, room.resolveAfterTriviaStage(null));
      return;
    }
    case 'RESULT':
      goTo(room, 'CLOSED');
      return;
    default:
      goTo(room, room.nextLinearStage(stage));
  }
}

function closedByFor(room: Room, reason: StageEndReason): PayloadMap['vote.result']['closedBy'] {
  if (reason === 'TIMER' || reason === 'HOST' || reason === 'DECISION_TIME') return reason;
  return room.round?.solo ? 'SOLO' : 'ALL_VOTED';
}

function handleCloseOutcome(room: Room, outcome: CloseOutcome): void {
  if ('runoff' in outcome) {
    room.broadcastExplicit('vote.stage', outcome.runoff as unknown as Record<string, unknown>);
    return;
  }
  handleTieOrResult(room, outcome);
}

function handleTieOrResult(room: Room, outcome: Exclude<CloseOutcome, { runoff: unknown }> | ReturnType<Room['closeRunoffAndResolve']>): void {
  if ('tie' in outcome) {
    const sync = room.trySyncTieBreak();
    if (sync) {
      finalize(room, sync);
      return;
    }
    if (room.round?.trivia) {
      room.broadcastExplicit('vote.trivia.open', room.buildTriviaOpenPayload() as unknown as Record<string, unknown>);
      goTo(room, 'TIEBREAK_TRIVIA');
    } else {
      finalize(room, room.resolveCoinFlipDirect());
    }
    return;
  }
  finalize(room, outcome);
}

function finalize(room: Room, result: PayloadMap['vote.result']): void {
  room.broadcastExplicit('vote.result', result as unknown as Record<string, unknown>);
  room.flushAbilityAnnouncements();
  goTo(room, 'RESULT');
}

function goTo(room: Room, stage: VoteStage | null): void {
  if (!stage) return;
  if (stage === 'CLOSED') {
    const roundId = room.round?.roundId;
    if (roundId) {
      room.broadcastExplicit('vote.stage', {
        roundId,
        stage: 'CLOSED',
        startedAtMs: room.nowMs(),
        endsAtMs: null,
        candidateIds: [] as OptionId[],
        pickerId: null,
      });
    }
    room.endRound();
    return;
  }
  const payload = room.armStage(stage);
  room.broadcastExplicit('vote.stage', payload as unknown as Record<string, unknown>);
}
