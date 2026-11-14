import { describe, expect, it } from 'vitest';
import type { Message, MessageType, PayloadMap, VoteOpenedPayload, VoteOption } from '@protocol';
import { initialState, reducer } from './reducer';
import { canVeto, currentScreen, isWinnable, shownBallot } from './selectors';
import type { Action, AppState } from './types';

let seq = 0;
const msg = <T extends MessageType>(t: T, d: PayloadMap[T]): Action => ({ type: 'msg', msg: { t, seq: ++seq, d } as Message, nowMs: 1_000_000 });

const option = (id: string, extra: Partial<VoteOption> = {}): VoteOption => ({
  id,
  partId: id,
  label: null,
  costM: 1,
  afford: 'OK',
  overBudgetByM: 0,
  overScheduleByDays: 0,
  willNotFly: false,
  fixExists: false,
  warnings: [],
  deltas: [],
  ...extra,
});

const opened = (over: Partial<VoteOpenedPayload> = {}): VoteOpenedPayload => ({
  roundId: 'r1',
  kind: 'PART',
  subjectId: 'first_stage_engine',
  title: { key: 'vote.first_stage_engine.name' },
  why: null,
  ownerRoles: ['BOOSTER'],
  options: [option('a'), option('b'), option('c'), option('d')],
  hint: null,
  predict: null,
  voters: ['p1', 'p2', 'p3'],
  solo: false,
  vetoAllowed: true,
  tagsAllowed: true,
  strictMajority: false,
  tallyVisibility: 'OPEN',
  audienceVoteWeight: 0,
  plan: [],
  ...over,
});

const stage = (s: PayloadMap['vote.stage']['stage'], candidateIds = ['a', 'b', 'c', 'd'], pickerId: string | null = null): Action =>
  msg('vote.stage', { roundId: 'r1', stage: s, startedAtMs: 1, endsAtMs: s === 'CLOSED' ? null : 2, candidateIds, pickerId });

const player = (id: string, slot: number) => ({
  id,
  slot,
  nickname: `Crew ${slot}`,
  avatar: { suitId: 'suit_teal', patchId: 'patch_star' },
  connected: true,
  slotExpiresAtMs: null,
  vetoAvailable: true,
  prefs: initialState().prefs,
});

function joined(): AppState {
  let s = initialState();
  const steps: Action[] = [
    msg('room.joined', { room: 'KQXM', kind: 'PLAYER', id: 'p1', slot: 1, nickname: 'Crew 1', token: 'tok_abcdefghijklmnop', spectatorReason: null, pendingPlayer: false }),
    msg('room.state', { room: 'KQXM', hostConnected: true, paused: false, players: [player('p1', 1), player('p2', 2), player('p3', 3)], spectatorCount: 0, pendingPlayerCount: 0 }),
    msg('roles.state', {
      mode: 'RANDOM',
      locked: true,
      groups: [
        { lead: 'FLIGHT', roles: ['FLIGHT', 'PM'], playerId: 'p2' },
        { lead: 'BOOSTER', roles: ['BOOSTER', 'STRUCT', 'GUIDO', 'FIDO'], playerId: 'p1' },
        { lead: 'EECOM', roles: ['EECOM', 'INCO', 'PAYLOAD', 'RETRO'], playerId: 'p3' },
      ],
      flightVotes: [],
      abilitiesUsed: [],
    }),
    msg('snapshot.end', { serverTimeMs: 1, lastOutcomeSeq: 0 }),
  ];
  for (const a of steps) s = reducer(s, a);
  return s;
}

const run = (s: AppState, ...actions: Action[]) => actions.reduce(reducer, s);

describe('vote flow', () => {
  it('opens a round, shows the vote screen and tracks stages', () => {
    let s = run(joined(), msg('vote.opened', opened()), stage('REVEAL'));
    expect(s.vote?.opened.roundId).toBe('r1');
    expect(currentScreen(s)).toBe('vote');
    s = run(s, stage('INSPECT'), stage('VOTE'));
    expect(s.vote?.stage?.stage).toBe('VOTE');
  });

  it('shows a cast at once, confirms it with vote.ack and changes it', () => {
    let s = run(joined(), msg('vote.opened', opened()), stage('VOTE'));
    s = reducer(s, { type: 'local.cast', roundId: 'r1', optionId: 'a' });
    expect(shownBallot(s.vote!)).toBe('a');
    expect(s.vote!.myBallot).toBeNull();
    s = run(s, msg('vote.ack', { roundId: 'r1', optionId: 'a', reason: 'CAST' }));
    expect(s.vote!.myBallot).toBe('a');
    expect(s.vote!.pendingBallot).toBeNull();
    // Change the vote.
    s = reducer(s, { type: 'local.cast', roundId: 'r1', optionId: 'b' });
    expect(shownBallot(s.vote!)).toBe('b');
    s = run(s, msg('vote.ack', { roundId: 'r1', optionId: 'b', reason: 'CAST' }));
    expect(s.vote!.myBallot).toBe('b');
  });

  it('rolls back an optimistic ballot the server refused', () => {
    let s = run(joined(), msg('vote.opened', opened()), stage('VOTE'));
    s = reducer(s, { type: 'local.cast', roundId: 'r1', optionId: 'c' });
    s = run(s, msg('error', { code: 'OPTION_VETOED', fatal: false, re: 7, reT: 'vote.cast' }));
    expect(shownBallot(s.vote!)).toBeNull();
    expect(s.error?.code).toBe('OPTION_VETOED');
  });

  it('applies a veto: option unwinnable, ballot cleared, veto spent', () => {
    let s = run(joined(), msg('vote.opened', opened()), stage('VOTE'));
    s = run(s, msg('vote.ack', { roundId: 'r1', optionId: 'c', reason: 'CAST' }));
    expect(canVeto(s, s.vote!, s.vote!.opened.options[2]!)).toBe(true);
    s = run(
      s,
      msg('vote.vetoed', { roundId: 'r1', optionId: 'c', playerId: 'p2', clearedVoterIds: ['p1'], remainingOptionIds: ['a', 'b', 'd'] }),
      msg('vote.ack', { roundId: 'r1', optionId: null, reason: 'OPTION_REMOVED' }),
    );
    const c = s.vote!.opened.options[2]!;
    expect(isWinnable(s, s.vote!, c)).toBe(false);
    expect(s.vote!.myBallot).toBeNull();
    expect(s.vote!.ballotNote).toBe('OPTION_REMOVED');
    // Replayed veto (snapshot) is not duplicated.
    s = run(s, msg('vote.vetoed', { roundId: 'r1', optionId: 'c', playerId: 'p2', clearedVoterIds: [], remainingOptionIds: ['a', 'b', 'd'] }));
    expect(s.vote!.vetoes).toHaveLength(1);
  });

  it('refuses a veto that would leave fewer than two winnable options', () => {
    let s = run(joined(), msg('vote.opened', opened({ options: [option('a'), option('b'), option('c')] })), stage('VOTE', ['a', 'b', 'c']));
    s = run(s, msg('vote.vetoed', { roundId: 'r1', optionId: 'c', playerId: 'p2', clearedVoterIds: [], remainingOptionIds: ['a', 'b'] }));
    expect(canVeto(s, s.vote!, s.vote!.opened.options[0]!)).toBe(false);
  });

  it('treats EMERGENCY_FUNDING options as winnable only while PM ability is unspent', () => {
    let s = run(joined(), msg('vote.opened', opened({ options: [option('a'), option('b', { afford: 'EMERGENCY_FUNDING', overBudgetByM: 4 })] })));
    expect(isWinnable(s, s.vote!, s.vote!.opened.options[1]!)).toBe(true);
    s = run(s, msg('roles.state', { ...s.roles!, abilitiesUsed: ['PM'] }));
    expect(isWinnable(s, s.vote!, s.vote!.opened.options[1]!)).toBe(false);
  });

  it('runs a tie through trivia and the pick, then the result and close', () => {
    let s = run(joined(), msg('vote.opened', opened()), stage('VOTE'));
    s = run(
      s,
      stage('TIEBREAK_TRIVIA', ['a', 'b']),
      msg('vote.trivia.open', { roundId: 'r1', question: { id: 'F23', prompt: { key: 'q' }, choices: [{ key: 'x' }, { key: 'y' }] }, tiedOptionIds: ['a', 'b'] }),
    );
    expect(s.vote!.trivia.open?.tiedOptionIds).toEqual(['a', 'b']);
    s = reducer(s, { type: 'local.trivia', roundId: 'r1', choiceIndex: 1 });
    // The first answer is final.
    s = reducer(s, { type: 'local.trivia', roundId: 'r1', choiceIndex: 0 });
    expect(s.vote!.trivia.myChoice).toBe(1);
    s = run(
      s,
      msg('vote.trivia.result', { outcomeSeq: 1, roundId: 'r1', factId: 'F23', correctIndex: 1, winnerId: 'p1', answers: [{ playerId: 'p1', choiceIndex: 1, correct: true }] }),
      stage('TIEBREAK_PICK', ['a', 'b'], 'p1'),
    );
    expect(s.vote!.stage!.pickerId).toBe('p1');
    s = reducer(s, { type: 'local.triviaPick', roundId: 'r1', optionId: 'b' });
    expect(s.vote!.trivia.myPick).toBe('b');
    const result: PayloadMap['vote.result'] = {
      outcomeSeq: 2,
      roundId: 'r1',
      kind: 'PART',
      subjectId: 'first_stage_engine',
      winnerId: 'b',
      method: 'TRIVIA',
      closedBy: 'TIMER',
      counts: [
        { optionId: 'a', n: 1 },
        { optionId: 'b', n: 1 },
      ],
      ballots: [
        { playerId: 'p1', optionId: 'b' },
        { playerId: 'p2', optionId: null },
        { playerId: 'p3', optionId: 'a' },
      ],
      audienceCounts: [],
      audienceBallot: null,
      firstRoundCounts: null,
      tiedOptionIds: ['a', 'b'],
      triviaWinnerId: 'p1',
      vetoes: [],
      emergencyFunding: false,
    };
    s = run(s, msg('vote.result', result), stage('RESULT', ['a', 'b']), msg('vote.commit', { roundId: 'r1', winnerId: 'b', deltas: [], codexIds: ['b'] }));
    expect(s.vote!.result?.method).toBe('TRIVIA');
    expect(s.codex.unlocked).toContain('b');
    expect(s.codex.fresh).toContain('b');
    s = run(s, stage('CLOSED', ['a', 'b']));
    expect(s.vote).toBeNull();
    expect(s.lastVote?.result?.winnerId).toBe('b');
    expect(currentScreen(s)).not.toBe('vote');
  });

  it('keeps the first prediction and rolls it back only on refusal', () => {
    let s = run(joined(), msg('vote.opened', opened({ predict: { id: 'F05', prompt: { key: 'q' }, choices: [{ key: 'a' }, { key: 'b' }] } })), stage('PREDICT'));
    s = reducer(s, { type: 'local.predict', roundId: 'r1', choiceIndex: 0 });
    s = reducer(s, { type: 'local.predict', roundId: 'r1', choiceIndex: 1 });
    expect(s.vote!.predict.myChoice).toBe(0);
    s = run(s, msg('error', { code: 'WRONG_STAGE', fatal: false, re: 3, reT: 'vote.predict' }));
    expect(s.vote!.predict.myChoice).toBeNull();
  });

  it('a phase change or vote.cancelled ends the round', () => {
    let s = run(joined(), msg('vote.opened', opened()), stage('VOTE'));
    s = run(s, msg('vote.cancelled', { roundId: 'r1', reason: 'PHASE_CHANGE' }));
    expect(s.vote).toBeNull();
  });
});

describe('resume', () => {
  it('keeps a round the snapshot replays and the local prediction', () => {
    let s = run(joined(), msg('vote.opened', opened({ predict: { id: 'F05', prompt: { key: 'q' }, choices: [{ key: 'a' }, { key: 'b' }] } })), stage('PREDICT'));
    s = reducer(s, { type: 'local.predict', roundId: 'r1', choiceIndex: 1 });
    s = run(s, msg('room.resumed', { room: 'KQXM', kind: 'PLAYER', id: 'p1', slot: 1, pendingPlayer: false, paused: false }));
    expect(s.snapshotting).toBe(true);
    expect(s.vote!.stale).toBe(true);
    s = run(s, msg('vote.opened', opened({ predict: { id: 'F05', prompt: { key: 'q' }, choices: [{ key: 'a' }, { key: 'b' }] } })), stage('VOTE'), msg('vote.ack', { roundId: 'r1', optionId: 'a', reason: 'SNAPSHOT' }), msg('snapshot.end', { serverTimeMs: 2, lastOutcomeSeq: 0 }));
    expect(s.snapshotting).toBe(false);
    expect(s.vote).not.toBeNull();
    expect(s.vote!.predict.myChoice).toBe(1);
    expect(s.vote!.myBallot).toBe('a');
    expect(s.vote!.ballotNote).toBe('SNAPSHOT');
  });

  it('drops a round that ended while the phone was away', () => {
    let s = run(joined(), msg('vote.opened', opened()), stage('VOTE'));
    s = run(s, msg('room.resumed', { room: 'KQXM', kind: 'PLAYER', id: 'p1', slot: 1, pendingPlayer: false, paused: false }), msg('snapshot.end', { serverTimeMs: 2, lastOutcomeSeq: 3 }));
    expect(s.vote).toBeNull();
    expect(s.me?.id).toBe('p1');
  });

  it('does not flag snapshot codex unlocks as new', () => {
    let s = run(initialState(), msg('room.joined', { room: 'KQXM', kind: 'PLAYER', id: 'p1', slot: 1, nickname: 'Crew 1', token: 'tok_abcdefghijklmnop', spectatorReason: null, pendingPlayer: false }));
    s = run(s, msg('codex.unlock', { codexIds: ['F05'], source: 'DEBRIEF', badge: false, to: null }), msg('snapshot.end', { serverTimeMs: 1, lastOutcomeSeq: 0 }));
    expect(s.codex.unlocked).toContain('F05');
    expect(s.codex.fresh).not.toContain('F05');
  });

  it('a bye without resume returns to the join screen', () => {
    let s = joined();
    s = run(s, msg('bye', { reason: 'KICKED', closeCode: 4002, canResume: false }));
    expect(s.me).toBeNull();
    expect(currentScreen(s)).toBe('join');
  });
});

describe('poll', () => {
  it('records the call window, answers and result', () => {
    let s = joined();
    s = run(s, msg('poll.call', { pollId: 'q1', context: 'FRR', round: 1, index: 2, total: 3, playerId: 'p1', roles: ['BOOSTER'], endsAtMs: 1_005_000 }));
    expect(currentScreen(s)).toBe('poll');
    expect(s.poll!.callAtMs).toBe(1_000_000);
    s = reducer(s, { type: 'local.pollAnswer', pollId: 'q1', answer: 'GO' });
    s = run(s, msg('poll.answered', { pollId: 'q1', entry: { playerId: 'p1', roles: ['BOOSTER'], answer: 'GO' } }));
    expect(s.poll!.answered).toHaveLength(1);
    s = run(s, msg('poll.result', { outcomeSeq: 4, pollId: 'q1', context: 'FRR', round: 1, answers: [{ playerId: 'p1', roles: ['BOOSTER'], answer: 'GO' }], allGo: true, noGoCount: 0 }));
    expect(s.poll!.result?.allGo).toBe(true);
  });
});
