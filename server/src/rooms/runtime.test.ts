import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { VoteOption } from '../../../protocol/ts/messages.js';
import { fixedClock } from '../timers/clock.js';
import { FakeConnection } from '../wire/connection.js';
import { wireVoteOrchestration } from './orchestrate.js';
import { ABILITY_ANSWER_TIMEOUT_MS, Room } from './room.js';

const AV = { suitId: 'a', patchId: 'b' };
const opt = (id: string): VoteOption => ({ id, partId: id, label: null, costM: 1, afford: 'OK', overBudgetByM: 0, overScheduleByDays: 0, willNotFly: false, fixExists: false, warnings: [], deltas: [] });
const rooms: Room[] = [];
beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  rooms.splice(0).forEach((r) => r.stopAllTimers());
  vi.useRealTimers();
});

function setup(n = 3) {
  const clock = fixedClock(1_000_000);
  const room = new Room({ code: 'KQXM', clientBaseUrl: 'https://x.example', clock, rng: () => 0 });
  rooms.push(room);
  wireVoteOrchestration(room);
  const host = new FakeConnection('host');
  room.createByHost(host);
  const conns: FakeConnection[] = [];
  const ids: string[] = [];
  for (let i = 0; i < n; i++) {
    const c = new FakeConnection(`c${i}`);
    conns.push(c);
    ids.push(room.joinPlayer(c, `Player ${i}`, AV, undefined, false).id);
  }
  return { room, clock, host, conns, ids };
}

function openRound(room: Room, voteMs = 30_000) {
  room.openVote({
    roundId: 'r1', kind: 'PART', subjectId: 'cat', title: { key: 't' }, why: null, ownerRoles: [],
    options: [opt('A'), opt('B')], defaultOptionId: null, hint: null, predict: null, trivia: null, coinSeed: 0,
    timers: { revealMs: 0, inspectMs: 0, voteMs },
  });
}

describe('vote.tally', () => {
  it('is sent at the start of VOTE, with counts and the leader when tallies are open', () => {
    const { room, host, ids } = setup();
    openRound(room);
    room.armStage('VOTE');
    room.broadcastExplicit('vote.stage', { roundId: 'r1', stage: 'VOTE' });
    const first = host.last('vote.tally') as { counts: Array<{ optionId: string; n: number }>; votedIds: string[]; leadingOptionId: string | null };
    expect(first.counts).toEqual([{ optionId: 'A', n: 0 }, { optionId: 'B', n: 0 }]);
    room.castBallot(ids[0]!, 'B', false);
    vi.advanceTimersByTime(250);
    const t = host.last('vote.tally') as typeof first;
    expect(t.votedIds).toEqual([ids[0]]);
    expect(t.leadingOptionId).toBe('B');
  });

  it('hides counts, audience counts and the leader (but not who voted) when tallies are hidden', () => {
    const { room, host, ids } = setup();
    room.settings = { ...room.settings, tallyVisibility: 'HIDDEN' };
    openRound(room);
    room.armStage('VOTE');
    room.castBallot(ids[0]!, 'A', false);
    const t = room.buildTally()!;
    expect(t.counts).toBeNull();
    expect(t.audienceCounts).toBeNull();
    expect(t.leadingOptionId).toBeNull();
    expect(t.votedIds).toEqual([ids[0]]);
    void host;
  });

  it('sends at most one tally per 200 ms and coalesces changes inside the window', () => {
    const { room, host, ids } = setup();
    openRound(room);
    room.armStage('VOTE');
    room.broadcastExplicit('vote.stage', { roundId: 'r1', stage: 'VOTE' });
    const before = host.sent.filter((m) => m.t === 'vote.tally').length;
    room.castBallot(ids[0]!, 'A', false);
    room.castBallot(ids[1]!, 'B', false);
    expect(host.sent.filter((m) => m.t === 'vote.tally').length).toBe(before);
    vi.advanceTimersByTime(200);
    expect(host.sent.filter((m) => m.t === 'vote.tally').length).toBe(before + 1);
  });
});

describe('poll per-call timeout', () => {
  it('records NO_ANSWER and moves to the next call, then publishes poll.result', () => {
    const { room, host } = setup(2);
    room.lockRoles();
    const order = room.buildRolesState().groups.map((g) => g.roles[0]!);
    room.openPoll({ pollId: 'poll1', context: 'FRR', round: 1, order, perCallMs: 5000 });
    const call = room.currentPollCall();
    expect(call).not.toBeNull();
    room.broadcastExplicit('poll.call', call as never);
    vi.advanceTimersByTime(5000);
    expect(host.sent.some((m) => m.t === 'poll.answered' && (m.d as { entry: { answer: string } }).entry.answer === 'NO_ANSWER')).toBe(true);
    vi.advanceTimersByTime(5000);
    const result = host.last('poll.result') as { answers: Array<{ answer: string }>; allGo: boolean };
    expect(result.answers.every((a) => a.answer === 'NO_ANSWER')).toBe(true);
    expect(room.poll).toBeNull();
  });
});

describe('pause freezes server timers', () => {
  it('does not close the VOTE stage while paused and resumes with the remaining time', () => {
    const { room, clock, host, ids } = setup();
    openRound(room, 10_000);
    const stage = room.armStage('VOTE');
    room.broadcastExplicit('vote.stage', stage as never);
    room.castBallot(ids[0]!, 'A', false);
    clock.advance(4000);
    vi.advanceTimersByTime(4000);
    room.hostPause();
    clock.advance(60_000);
    vi.advanceTimersByTime(60_000);
    expect(host.sent.some((m) => m.t === 'vote.result')).toBe(false);
    room.hostResume();
    vi.advanceTimersByTime(5900);
    expect(host.sent.some((m) => m.t === 'vote.result')).toBe(false);
    vi.advanceTimersByTime(200);
    expect(host.sent.some((m) => m.t === 'vote.result')).toBe(true);
  });
});

describe('abilities', () => {
  function withPhase(room: Room) {
    room.phase = { phase: 'BUILD' } as never;
  }
  it('auto-declines with ABILITY_REJECTED after 5 s and keeps the ability available', () => {
    const { room, conns, ids } = setup();
    room.lockRoles();
    withPhase(room);
    const holder = room.roleHolderId('EECOM')!;
    const conn = conns[ids.indexOf(holder)]!;
    room.requestAbility(holder, 'EECOM', null, 42);
    vi.advanceTimersByTime(ABILITY_ANSWER_TIMEOUT_MS);
    expect(conn.errors).toContainEqual(expect.objectContaining({ code: 'ABILITY_REJECTED', re: 42 }));
    expect(room.abilitiesUsed.has('EECOM')).toBe(false);
    expect(() => room.requestAbility(holder, 'EECOM', null, 43)).not.toThrow();
  });
  it('treats a second request while one is pending as ABILITY_USED', () => {
    const { room, ids } = setup();
    room.lockRoles();
    withPhase(room);
    const holder = room.roleHolderId('EECOM')!;
    room.requestAbility(holder, 'EECOM', null, 1);
    expect(() => room.requestAbility(holder, 'EECOM', null, 2)).toThrow();
    void ids;
  });
  it('declines pending requests when the host drops', () => {
    const { room, conns, ids, host } = setup();
    room.lockRoles();
    withPhase(room);
    const holder = room.roleHolderId('EECOM')!;
    room.requestAbility(holder, 'EECOM', null, 9);
    room.disconnectHost(host);
    expect(conns[ids.indexOf(holder)]!.errors).toContainEqual(expect.objectContaining({ code: 'ABILITY_REJECTED', re: 9 }));
  });
  it('rejects non-PM abilities in LOBBY with WRONG_PHASE', () => {
    const { room } = setup();
    room.lockRoles();
    const holder = room.roleHolderId('EECOM')!;
    expect(() => room.requestAbility(holder, 'EECOM', null, 1)).toThrow();
  });
});

describe('host stream limits', () => {
  it('drops console.telemetry above 10 Hz per role and everything during a blackout', () => {
    const { room, clock, conns } = setup(2);
    room.lockRoles();
    const role = room.buildRolesState().groups[0]!.roles[0]!;
    const holderConn = conns[room.buildRolesState().groups[0]!.playerId === null ? 0 : [...conns].findIndex((c) => c.playerId === room.buildRolesState().groups[0]!.playerId)]!;
    const count = () => holderConn.sent.filter((m) => m.t === 'console.telemetry').length;
    const send = () => room.broadcastExplicit('console.telemetry', { role, metS: 1, v: {} });
    send();
    send();
    expect(count()).toBe(1);
    clock.advance(100);
    send();
    expect(count()).toBe(2);
    room.broadcastExplicit('blackout.set', { active: true });
    clock.advance(1000);
    send();
    expect(count()).toBe(2);
  });
});

describe('snapshot (messages.md §4.5)', () => {
  it('replays the active round, the player\'s own ballot and sticky host messages to a resuming phone', () => {
    const { room, ids } = setup();
    room.broadcastExplicit('phase.set', { phase: 'BUILD', missionSeq: 0 } as never);
    openRound(room);
    room.armStage('VOTE');
    room.castBallot(ids[0]!, 'A', false);
    const phone = new FakeConnection('re');
    phone.kind = 'PLAYER';
    phone.playerId = ids[0]!;
    const types = room.snapshotMessages(phone, 0).map((m) => m.t);
    expect(types).toEqual(['phase.set', 'vote.opened', 'vote.tags', 'vote.stage', 'vote.tally', 'vote.ack']);
    const ack = room.snapshotMessages(phone, 0).find((m) => m.t === 'vote.ack')!.d as { optionId: string; reason: string };
    expect(ack).toMatchObject({ optionId: 'A', reason: 'SNAPSHOT' });
  });

  it('replays only outcome-log entries after lastOutcomeSeq to the host', () => {
    const { room, host } = setup();
    room.lockRoles();
    const order = room.buildRolesState().groups.map((g) => g.roles[0]!);
    room.openPoll({ pollId: 'p1', context: 'FRR', round: 1, order, perCallMs: 5000 });
    room.broadcastExplicit('poll.result', room.finishPoll() as never);
    expect(room.snapshotMessages(host, 0).map((m) => m.t)).toEqual(['poll.result']);
    expect(room.snapshotMessages(host, 1)).toEqual([]);
  });
});
