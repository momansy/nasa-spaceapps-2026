import { afterEach, describe, expect, it } from 'vitest';
import type { PayloadMap, VoteOption } from '../../../protocol/ts/messages.js';
import { fixedClock } from '../timers/clock.js';
import { FakeConnection } from '../wire/connection.js';
import { Room } from './room.js';

function opt(id: string, extra: Partial<VoteOption> = {}): VoteOption {
  return {
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
  };
}

function makeRoom() {
  const clock = fixedClock(1_000_000);
  const room = new Room({ code: 'KQXM', clientBaseUrl: 'https://play.example.org', clock, rng: () => 0 });
  return { room, clock };
}

const activeRooms: Room[] = [];
afterEach(() => {
  for (const r of activeRooms.splice(0)) r.stopAllTimers();
});

function track(room: Room): Room {
  activeRooms.push(room);
  return room;
}

describe('room lifecycle', () => {
  it('creates a room and joins players into free slots', () => {
    const { room } = makeRoom();
    track(room);
    const host = new FakeConnection('host');
    const created = room.createByHost(host);
    expect(created.room).toBe('KQXM');
    expect(created.maxPlayers).toBe(10);

    const c1 = new FakeConnection('c1');
    const joined1 = room.joinPlayer(c1, 'Comet Rider', { suitId: 'suit_orange', patchId: 'patch_comet' }, undefined, false);
    expect(joined1.kind).toBe('PLAYER');
    expect(joined1.slot).toBe(1);

    const c2 = new FakeConnection('c2');
    const joined2 = room.joinPlayer(c2, 'Lunar Fox', { suitId: 'suit_blue', patchId: 'patch_fox' }, undefined, false);
    expect(joined2.slot).toBe(2);

    const state = room.buildRoomState();
    expect(state.players).toHaveLength(2);
    expect(state.players.map((p) => p.slot)).toEqual([1, 2]);
  });

  it('rejects a duplicate nickname with a suggestion', () => {
    const { room } = makeRoom();
    track(room);
    room.createByHost(new FakeConnection('host'));
    room.joinPlayer(new FakeConnection('c1'), 'Nova Pilot', { suitId: 'a', patchId: 'b' }, undefined, false);
    expect(() => room.joinPlayer(new FakeConnection('c2'), 'nova pilot', { suitId: 'a', patchId: 'b' }, undefined, false)).toThrow();
  });

  it('makes a late joiner a pending spectator once the build has started', () => {
    const { room } = makeRoom();
    track(room);
    room.createByHost(new FakeConnection('host'));
    const joined = room.joinPlayer(new FakeConnection('c1'), 'Nova Pilot', { suitId: 'a', patchId: 'b' }, undefined, true);
    expect(joined.kind).toBe('SPECTATOR');
    expect(joined.pendingPlayer).toBe(true);
    expect(joined.spectatorReason).toBe('LATE_JOIN');
  });
});

describe('roles', () => {
  it('locks a RANDOM assignment covering all ten roles for 5 players', () => {
    const { room } = makeRoom();
    track(room);
    room.createByHost(new FakeConnection('host'));
    for (let i = 0; i < 5; i++) room.joinPlayer(new FakeConnection(`c${i}`), `Player ${i}`, { suitId: 'a', patchId: 'b' }, undefined, false);
    room.lockRoles();
    const state = room.buildRolesState();
    expect(state.locked).toBe(true);
    expect(state.groups.flatMap((g) => g.roles)).toHaveLength(10);
    expect(new Set(state.groups.flatMap((g) => g.roles)).size).toBe(10);
  });

  it('redistributes a leaving player\'s roles as one block to another player', () => {
    const { room } = makeRoom();
    track(room);
    room.createByHost(new FakeConnection('host'));
    const ids: string[] = [];
    for (let i = 0; i < 5; i++) {
      const c = new FakeConnection(`c${i}`);
      const joined = room.joinPlayer(c, `Player ${i}`, { suitId: 'a', patchId: 'b' }, undefined, false);
      ids.push(joined.id);
    }
    room.lockRoles();
    const before = room.buildRolesState();
    const leaverGroup = before.groups[0]!;
    room.leavePlayer(leaverGroup.playerId!);
    const after = room.buildRolesState();
    expect(after.groups.flatMap((g) => g.roles)).toHaveLength(10);
    expect(after.groups.some((g) => g.playerId === leaverGroup.playerId)).toBe(false);
  });
});

describe('reconnect / slot hold', () => {
  it('shows connected: false and a slotExpiresAtMs after a disconnect, frozen while paused', () => {
    const { room, clock } = makeRoom();
    track(room);
    room.createByHost(new FakeConnection('host'));
    const c1 = new FakeConnection('c1');
    const joined = room.joinPlayer(c1, 'Nova Pilot', { suitId: 'a', patchId: 'b' }, undefined, false);
    room.disconnectPlayer(joined.id);
    const state1 = room.buildRoomState();
    const p1 = state1.players.find((p) => p.id === joined.id)!;
    expect(p1.connected).toBe(false);
    expect(p1.slotExpiresAtMs).toBe(1_000_000 + 180000);

    // host drops -> pause -> hold should freeze
    room.disconnectHost();
    clock.advance(600000); // a long outage
    const state2 = room.buildRoomState();
    const p2 = state2.players.find((p) => p.id === joined.id)!;
    expect(p2.slotExpiresAtMs).toBe(1_000_000 + 180000 + 600000); // receded by the same amount, still not expired
  });
});

describe('vote round: plurality', () => {
  it('resolves to the option with the most ballots', () => {
    const { room } = makeRoom();
    track(room);
    room.createByHost(new FakeConnection('host'));
    const players = ['p1', 'p2', 'p3'].map((name, i) => {
      const c = new FakeConnection(`c${i}`);
      return room.joinPlayer(c, name, { suitId: 'a', patchId: 'b' }, undefined, false);
    });

    const openPayload: PayloadMap['vote.open'] = {
      roundId: 'r1',
      kind: 'PART',
      subjectId: 'first_stage_engine',
      title: { key: 'vote.title.engine' },
      why: null,
      ownerRoles: ['BOOSTER'],
      options: [opt('eng_a'), opt('eng_b')],
      defaultOptionId: null,
      hint: null,
      predict: null,
      trivia: null,
      coinSeed: 0,
      timers: { revealMs: 0, inspectMs: 0, voteMs: 50000 },
    };
    room.openVote(openPayload);
    room.armStage('REVEAL');
    room.armStage('INSPECT');
    room.armStage('VOTE');

    room.castBallot(players[0]!.id, 'eng_a', false);
    room.castBallot(players[1]!.id, 'eng_a', false);
    room.castBallot(players[2]!.id, 'eng_b', false);

    const result = room.closeVoteAndResolve('TIMER');
    expect('winnerId' in result).toBe(true);
    if ('winnerId' in result) {
      expect(result.winnerId).toBe('eng_a');
      expect(result.method).toBe('PLURALITY');
    }
  });
});

describe('vote round: veto, tie, and FLIGHT tie-break', () => {
  it('veto removes an option and clears its ballots; a two-way tie is broken by FLIGHT', () => {
    const { room } = makeRoom();
    track(room);
    room.createByHost(new FakeConnection('host'));
    const players = ['p1', 'p2', 'p3', 'flight'].map((name, i) => room.joinPlayer(new FakeConnection(`c${i}`), name, { suitId: 'a', patchId: 'b' }, undefined, false));
    room.setRolesExplicit([
      { playerId: players[3]!.id, roles: ['FLIGHT', 'PM', 'BOOSTER', 'STRUCT', 'GUIDO', 'FIDO', 'EECOM', 'INCO', 'PAYLOAD', 'RETRO'] },
    ]);

    room.openVote({
      roundId: 'r2',
      kind: 'PART',
      subjectId: 'cat',
      title: { key: 't' },
      why: null,
      ownerRoles: [],
      options: [opt('A'), opt('B'), opt('C')],
      defaultOptionId: null,
      hint: null,
      predict: null,
      trivia: null,
      coinSeed: 0,
      timers: { revealMs: 0, inspectMs: 0, voteMs: 50000 },
    });
    room.armStage('REVEAL');
    room.armStage('INSPECT');
    room.armStage('VOTE');
    room.castBallot(players[0]!.id, 'C', false); // will be cleared by the veto
    room.applyVetoToRound(players[0]!.id, 'C');
    expect(room.buildRoomState().players.find((p) => p.id === players[0]!.id)!.vetoAvailable).toBe(false);

    room.castBallot(players[0]!.id, 'A', false);
    room.castBallot(players[1]!.id, 'B', false);
    room.castBallot(players[2]!.id, 'A', false);
    room.castBallot(players[3]!.id, 'B', false); // FLIGHT votes B; A=2, B=2, tied

    const outcome = room.closeVoteAndResolve('TIMER');
    expect('tie' in outcome).toBe(false);
    if (!('tie' in outcome) && !('runoff' in outcome)) {
      expect(outcome.method).toBe('FLIGHT_TIEBREAK');
      expect(outcome.winnerId).toBe('B');
    }
  });
});

describe('vote round: trivia sudden death', () => {
  it('a tie with no Decision Time or FLIGHT ballot goes to trivia, then the winner picks', () => {
    const { room } = makeRoom();
    track(room);
    room.createByHost(new FakeConnection('host'));
    const players = ['p1', 'p2', 'p3'].map((name, i) => room.joinPlayer(new FakeConnection(`c${i}`), name, { suitId: 'a', patchId: 'b' }, undefined, false));

    room.openVote({
      roundId: 'r3',
      kind: 'PART',
      subjectId: 'cat',
      title: { key: 't' },
      why: null,
      ownerRoles: [],
      options: [opt('A'), opt('B')],
      defaultOptionId: null,
      hint: null,
      predict: null,
      trivia: { id: 'F01', prompt: { key: 'q' }, choices: [{ key: 'c0' }, { key: 'c1' }], correctIndex: 1 },
      coinSeed: 0,
      timers: { revealMs: 0, inspectMs: 0, voteMs: 50000 },
    });
    room.armStage('REVEAL');
    room.armStage('INSPECT');
    room.armStage('VOTE');
    room.castBallot(players[0]!.id, 'A', false);
    room.castBallot(players[1]!.id, 'B', false);

    const closed = room.closeVoteAndResolve('TIMER');
    expect('tie' in closed).toBe(true);

    const triviaOpen = room.buildTriviaOpenPayload();
    expect(triviaOpen.tiedOptionIds.sort()).toEqual(['A', 'B']);
    room.armStage('TIEBREAK_TRIVIA');

    const endsNow = room.recordTriviaAnswer(players[2]!.id, 1); // correct
    expect(endsNow).toBe(true);
    room.finishTriviaOutcome();
    room.armStage('TIEBREAK_PICK');
    const result = room.resolveAfterTriviaStage('A');
    expect(result.method).toBe('TRIVIA');
    expect(result.winnerId).toBe('A');
    expect(result.triviaWinnerId).toBe(players[2]!.id);
  });
});

describe('vote round: runoff', () => {
  it('opens a runoff on a three-way near-tie and resolves it from the runoff ballots', () => {
    const { room } = makeRoom();
    track(room);
    room.createByHost(new FakeConnection('host'));
    const players = ['p1', 'p2', 'p3', 'p4', 'p5'].map((name, i) => room.joinPlayer(new FakeConnection(`c${i}`), name, { suitId: 'a', patchId: 'b' }, undefined, false));
    room.applySettingsPatch({ strictMajority: true });

    room.openVote({
      roundId: 'r4',
      kind: 'PART',
      subjectId: 'cat',
      title: { key: 't' },
      why: null,
      ownerRoles: [],
      options: [opt('A'), opt('B'), opt('C')],
      defaultOptionId: null,
      hint: null,
      predict: null,
      trivia: null,
      coinSeed: 0,
      timers: { revealMs: 0, inspectMs: 0, voteMs: 50000, runoffMs: 50000 },
    });
    room.armStage('REVEAL');
    room.armStage('INSPECT');
    room.armStage('VOTE');
    room.castBallot(players[0]!.id, 'A', false);
    room.castBallot(players[1]!.id, 'B', false);
    room.castBallot(players[2]!.id, 'C', false);

    const outcome = room.closeVoteAndResolve('TIMER');
    expect('runoff' in outcome).toBe(true);

    room.castBallot(players[0]!.id, 'A', false);
    room.castBallot(players[1]!.id, 'A', false);
    const final = room.closeRunoffAndResolve();
    expect('tie' in final).toBe(false);
    if (!('tie' in final)) {
      expect(final.method).toBe('RUNOFF');
      expect(final.winnerId).toBe('A');
    }
  });
});

describe('GO/NO-GO poll', () => {
  it('calls connected role holders in order and records disconnected holders as NO_ANSWER', () => {
    const { room } = makeRoom();
    track(room);
    room.createByHost(new FakeConnection('host'));
    const players = ['p1', 'p2'].map((name, i) => room.joinPlayer(new FakeConnection(`c${i}`), name, { suitId: 'a', patchId: 'b' }, undefined, false));
    room.setRolesExplicit([
      { playerId: players[0]!.id, roles: ['FLIGHT', 'BOOSTER', 'STRUCT', 'GUIDO', 'FIDO'] },
      { playerId: players[1]!.id, roles: ['EECOM', 'INCO', 'PAYLOAD', 'RETRO', 'PM'] },
    ]);
    room.disconnectPlayer(players[1]!.id);

    room.openPoll({ pollId: 'poll1', context: 'FRR', round: 1, order: ['FLIGHT', 'EECOM'], perCallMs: 5000 });
    const call = room.currentPollCall();
    expect(call?.playerId).toBe(players[0]!.id);
    room.answerPoll(players[0]!.id, 'GO');
    expect(room.isPollDone()).toBe(true);
    const result = room.finishPoll();
    expect(result.allGo).toBe(true); // disconnected EECOM is NO_ANSWER, which does not block
    expect(result.answers.some((a) => a.answer === 'NO_ANSWER')).toBe(true);
  });

  it('flags noGoCount and allGo = false when a called console answers NO_GO', () => {
    const { room } = makeRoom();
    track(room);
    room.createByHost(new FakeConnection('host'));
    const p = room.joinPlayer(new FakeConnection('c0'), 'p1', { suitId: 'a', patchId: 'b' }, undefined, false);
    room.setRolesExplicit([{ playerId: p.id, roles: ['FLIGHT', 'BOOSTER', 'STRUCT', 'GUIDO', 'FIDO', 'EECOM', 'INCO', 'PAYLOAD', 'RETRO', 'PM'] }]);
    room.openPoll({ pollId: 'poll2', context: 'LAUNCH', round: 1, order: ['FLIGHT'], perCallMs: 5000 });
    room.answerPoll(p.id, 'NO_GO');
    const result = room.finishPoll();
    expect(result.allGo).toBe(false);
    expect(result.noGoCount).toBe(1);
  });
});

describe('pause', () => {
  it('shifts the active vote stage deadline by pausedForMs on resume', () => {
    const { room, clock } = makeRoom();
    track(room);
    room.createByHost(new FakeConnection('host'));
    room.joinPlayer(new FakeConnection('c0'), 'p1', { suitId: 'a', patchId: 'b' }, undefined, false);
    room.openVote({
      roundId: 'r5',
      kind: 'PART',
      subjectId: 'cat',
      title: { key: 't' },
      why: null,
      ownerRoles: [],
      options: [opt('A'), opt('B')],
      defaultOptionId: null,
      hint: null,
      predict: null,
      trivia: null,
      coinSeed: 0,
      timers: { revealMs: 50000 },
    });
    room.armStage('REVEAL');
    const before = room.round!.stageEndsAtMs!;
    room.hostPause();
    clock.advance(42000);
    room.hostResume();
    expect(room.round!.stageEndsAtMs).toBe(before + 42000);
  });
});
