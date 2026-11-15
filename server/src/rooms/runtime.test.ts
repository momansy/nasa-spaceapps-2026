import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { VoteOption } from '../../../protocol/ts/messages.js';
import { fixedClock, type Clock } from '../timers/clock.js';
import { FakeConnection } from '../wire/connection.js';
import { wireVoteOrchestration } from './orchestrate.js';
import { ABILITY_ANSWER_TIMEOUT_MS, Room, TALLY_MIN_GAP_MS } from './room.js';

const AV = { suitId: 'a', patchId: 'b' };
const opt = (id: string): VoteOption => ({ id, partId: id, label: null, costM: 1, afford: 'OK', overBudgetByM: 0, overScheduleByDays: 0, willNotFly: false, fixExists: false, warnings: [], deltas: [] });
const rooms: Room[] = [];
beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  rooms.splice(0).forEach((r) => r.stopAllTimers());
  vi.useRealTimers();
});

function setup(n = 3, roomClock?: Clock) {
  const clock = fixedClock(1_000_000);
  const room = new Room({ code: 'KQXM', clientBaseUrl: 'https://x.example', clock: roomClock ?? clock, rng: () => 0 });
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

describe('vote.tally throttle (D-101: leading edge + coalesced trailing edge, at most one per 200 ms)', () => {
  /** Room clock that follows vitest's fake Date, so setTimeout and clock.nowMs() advance together. */
  const fakeDateClock: Clock = { nowMs: () => Date.now() };

  /** Opens a VOTE stage and returns the fake-time stamps and counts of every vote.tally the host receives. */
  function voteStage(n: number) {
    vi.setSystemTime(1_000_000);
    const ctx = setup(n, fakeDateClock);
    const tallies: Array<{ atMs: number; counts: Array<{ optionId: string; n: number }>; votedIds: string[] }> = [];
    const send = ctx.host.send.bind(ctx.host);
    ctx.host.send = ((t, d) => {
      if (t === 'vote.tally') tallies.push({ atMs: Date.now(), ...(d as unknown as { counts: Array<{ optionId: string; n: number }>; votedIds: string[] }) });
      send(t, d);
    }) as typeof ctx.host.send;
    openRound(ctx.room);
    ctx.room.armStage('VOTE');
    ctx.room.broadcastExplicit('vote.stage', { roundId: 'r1', stage: 'VOTE' });
    expect(tallies).toHaveLength(1); // the stage-start tally
    vi.advanceTimersByTime(1000); // well past the stage-start tally's window
    return { ...ctx, tallies };
  }

  it('sends the tally for a single cast immediately (no delay) when no tally went out in the last 200 ms', () => {
    const { room, ids, tallies } = voteStage(3);
    const castAt = Date.now();
    room.castBallot(ids[0]!, 'B', false);
    expect(tallies).toHaveLength(2);
    expect(tallies[1]!.atMs - castAt).toBe(0);
    expect(tallies[1]!.votedIds).toEqual([ids[0]]);
    vi.advanceTimersByTime(TALLY_MIN_GAP_MS * 5);
    expect(tallies).toHaveLength(2); // nothing changed, so no trailing tally
  });

  it('coalesces a burst inside 200 ms into one immediate tally plus one trailing tally with the final counts', () => {
    const { room, ids, tallies } = voteStage(7); // one voter never casts, so the stage does not close early
    const burstStart = Date.now();
    room.castBallot(ids[0]!, 'A', false);
    for (let i = 1; i < 6; i++) {
      vi.advanceTimersByTime(30);
      room.castBallot(ids[i]!, i % 2 === 0 ? 'A' : 'B', false);
    }
    vi.advanceTimersByTime(30);
    room.castBallot(ids[1]!, 'A', false); // a changed ballot at +180 ms
    vi.advanceTimersByTime(TALLY_MIN_GAP_MS * 5);
    const burst = tallies.slice(1);
    expect(burst).toHaveLength(2);
    expect(burst[0]!.atMs).toBe(burstStart);
    expect(burst[0]!.votedIds).toEqual([ids[0]]);
    expect(burst[1]!.atMs).toBe(burstStart + TALLY_MIN_GAP_MS);
    expect(burst[1]!.counts).toEqual([{ optionId: 'A', n: 4 }, { optionId: 'B', n: 2 }]);
    expect(burst[1]!.votedIds).toHaveLength(6);
  });

  it('never sends two tallies closer than 200 ms, and always delivers the final state', () => {
    const { room, ids, tallies } = voteStage(7); // one voter never casts, so the stage does not close early
    let rng = 7;
    const next = () => ((rng = (rng * 1103515245 + 12345) % 2147483648) / 2147483648);
    for (let k = 0; k < 200; k++) {
      vi.advanceTimersByTime(Math.floor(next() * 120));
      room.castBallot(ids[Math.floor(next() * 6)]!, next() < 0.5 ? 'A' : 'B', false);
    }
    vi.advanceTimersByTime(TALLY_MIN_GAP_MS * 5);
    for (let i = 1; i < tallies.length; i++) expect(tallies[i]!.atMs - tallies[i - 1]!.atMs).toBeGreaterThanOrEqual(TALLY_MIN_GAP_MS);
    expect(tallies.at(-1)!.counts).toEqual(room.buildTally()!.counts);
    expect(tallies.at(-1)!.votedIds).toEqual(room.buildTally()!.votedIds);
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

describe('roles.state before any player joins (T028 D-001)', () => {
  it('lists all ten roles in at least one group so the frame validates against its schema', () => {
    const { room } = setup(0);
    const state = room.buildRolesState();
    expect(state.groups.length).toBeGreaterThanOrEqual(1);
    expect(state.groups.flatMap((g) => g.roles)).toHaveLength(10);
  });
});
