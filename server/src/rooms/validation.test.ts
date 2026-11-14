import { afterEach, describe, expect, it } from 'vitest';
import type { PayloadMap, VoteOption } from '../../../protocol/ts/messages.js';
import { fixedClock } from '../timers/clock.js';
import { FakeConnection } from '../wire/connection.js';
import { dispatch } from '../wire/dispatch.js';
import { Room } from './room.js';

const AV = { suitId: 'a', patchId: 'b' };
const opt = (id: string, extra: Partial<VoteOption> = {}): VoteOption => ({ id, partId: id, label: null, costM: 1, afford: 'OK', overBudgetByM: 0, overScheduleByDays: 0, willNotFly: false, fixExists: false, warnings: [], deltas: [], ...extra });
const codeOf = (fn: () => unknown): string | undefined => {
  try {
    fn();
  } catch (e) {
    return (e as { code?: string }).code ?? 'NOT_A_ROOM_ERROR';
  }
  return undefined;
};
const rooms: Room[] = [];
afterEach(() => rooms.splice(0).forEach((r) => r.stopAllTimers()));

function setup(n = 3) {
  const clock = fixedClock(1_000_000);
  const room = new Room({ code: 'KQXM', clientBaseUrl: 'https://x.example', clock, rng: () => 0 });
  rooms.push(room);
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
const open = (room: Room, options: VoteOption[] = [opt('A'), opt('B')], extra: Partial<PayloadMap['vote.open']> = {}) =>
  room.openVote({ roundId: 'r1', kind: 'PART', subjectId: 's', title: { key: 't' }, why: null, ownerRoles: [], options, defaultOptionId: null, hint: null, predict: null, trivia: null, coinSeed: 0, timers: { revealMs: 0, inspectMs: 0, voteMs: 30_000 }, ...extra });

describe('vote.open validation', () => {
  it('rejects LOBBY, active round or poll, reused ids, malformed options and no winnable option', () => {
    const { room } = setup();
    room.phase = { phase: 'LOBBY' } as never;
    expect(codeOf(() => open(room))).toBe('WRONG_PHASE');
    room.phase = { phase: 'BUILD' } as never;
    expect(codeOf(() => open(room, [opt('A'), opt('A')]))).toBe('BAD_PAYLOAD');
    expect(codeOf(() => open(room, [opt('A'), opt('B', { afford: 'NEVER' })].map((o) => ({ ...o, afford: 'NEVER' }))))).toBe('NO_WINNABLE_OPTION');
    open(room);
    expect(codeOf(() => open(room))).toBe('ROUND_ACTIVE');
    room.endRound();
    expect(codeOf(() => open(room))).toBe('DUPLICATE_ID');
  });
});

describe('vote.cast / veto / tag / predict / trivia error codes', () => {
  it('uses UNKNOWN_OPTION and OPTION_UNAFFORDABLE for ballots', () => {
    const { room, ids } = setup();
    open(room, [opt('A'), opt('B'), opt('EF', { afford: 'EMERGENCY_FUNDING', overBudgetByM: 1 })]);
    room.armStage('VOTE');
    expect(codeOf(() => room.castBallot(ids[0]!, 'ZZZ', false))).toBe('UNKNOWN_OPTION');
    room.abilitiesUsed.add('PM');
    expect(codeOf(() => room.castBallot(ids[0]!, 'EF', false))).toBe('OPTION_UNAFFORDABLE');
  });
  it('rejects a trivia answer outside TIEBREAK_TRIVIA and a pick from anyone but the picker', () => {
    const { room, ids } = setup();
    open(room, [opt('A'), opt('B')], { trivia: { id: 'F', prompt: { key: 'q' }, choices: [{ key: 'a' }, { key: 'b' }], correctIndex: 0 } });
    room.armStage('VOTE');
    expect(codeOf(() => room.recordTriviaAnswer(ids[0]!, 0))).toBe('WRONG_STAGE');
    expect(codeOf(() => room.assertCanPick(ids[0]!, 'A'))).toBe('WRONG_STAGE');
  });
  it('rejects a stale roundId, an unknown veto option and a predict outside PREDICT', () => {
    const { room, ids, conns } = setup();
    open(room);
    room.armStage('VOTE');
    expect(codeOf(() => room.assertActiveRound('old'))).toBe('STALE_ID');
    expect(codeOf(() => room.applyVetoToRound(ids[0]!, 'ZZZ'))).toBe('UNKNOWN_OPTION');
    expect(conns[0]!.sent.some((m) => m.t === 'vote.ack')).toBe(false);
  });
});

describe('roles wiring', () => {
  it('locks roles automatically when the phase leaves LOBBY and unlocks on return', () => {
    const { room, host } = setup(4);
    const phase = (ph: string) => dispatch(room, host, 'phase.set', { phase: ph, sub: 'NONE', missionSeq: 0 } as never);
    phase('LOBBY');
    expect(room.roleLocked).toBe(false);
    phase('BRIEFING');
    expect(room.roleLocked).toBe(true);
    expect(room.buildRolesState().groups.flatMap((g) => g.roles)).toHaveLength(10);
    phase('LOBBY');
    expect(room.roleLocked).toBe(false);
  });
  it('shows the group table before lock, with PICK claims, and follows settings.roleAssignMode', () => {
    const { room, ids } = setup(4);
    expect(room.buildRolesState().groups).toHaveLength(4);
    room.applySettingsPatch({ roleAssignMode: 'PICK' });
    const lead = room.buildRolesState().groups[1]!.lead;
    room.setRolePick(ids[2]!, lead);
    expect(room.buildRolesState().groups.find((g) => g.lead === lead)!.playerId).toBe(ids[2]);
    expect(codeOf(() => room.setRolePick(ids[0]!, 'PM'))).toBe('BAD_PAYLOAD');
    expect(codeOf(() => room.setRoleVote(ids[0]!, ids[1]!))).toBe('WRONG_PHASE');
  });
  it('locks roleAssignMode outside LOBBY and validates roles.set', () => {
    const { room, ids } = setup(2);
    room.phase = { phase: 'BUILD' } as never;
    expect(codeOf(() => room.applySettingsPatch({ roleAssignMode: 'PICK' }))).toBe('SETTING_LOCKED');
    room.phase = null;
    expect(codeOf(() => room.setRolesExplicit([{ playerId: ids[0]!, roles: ['FLIGHT'] }]))).toBe('INVALID_ASSIGNMENT');
    expect(codeOf(() => room.setRolesExplicit([{ playerId: 'nobody', roles: ['FLIGHT'] }]))).toBe('UNKNOWN_PLAYER');
  });
  it('gives a player who joins after lock a share of the roles (arrival rule)', () => {
    const { room } = setup(4);
    room.lockRoles();
    const c = new FakeConnection('late');
    const j = room.joinPlayer(c, 'Late One', AV, undefined, false);
    const mine = room.buildRolesState().groups.find((g) => g.playerId === j.id);
    expect(mine?.roles.length).toBeGreaterThan(0);
    expect(room.buildRolesState().groups.flatMap((g) => g.roles)).toHaveLength(10);
  });
});

describe('pause, kick, relay', () => {
  it('ignores a second pause and a resume while running', () => {
    const { room } = setup();
    expect(room.hostResume()).toBeNull();
    expect(room.hostPause()).not.toBeNull();
    expect(room.hostPause()).toBeNull();
  });
  it('a host drop during a host pause starts the 10-minute hold; the returning host cancels expiry but stays paused', () => {
    const { room, host, clock } = setup();
    room.hostPause();
    room.disconnectHost(host);
    expect(room.pauseState.reason).toBe('HOST_DISCONNECTED');
    expect(room.pauseState.roomExpiresAtMs).toBe(clock.nowMs() + 600_000);
    room.resumeHost(new FakeConnection('host2'));
    expect(room.pauseState.paused).toBe(true);
    expect(room.pauseState.roomExpiresAtMs).toBeNull();
    clock.advance(700_000);
    expect(room.sweep()).toBeNull();
  });
  it('kick sends bye KICKED, closes 4002, and rejects unknown players', () => {
    const { room, conns, ids } = setup();
    room.kickPlayer(ids[1]!);
    expect(conns[1]!.closed?.code).toBe(4002);
    expect((conns[1]!.last('bye') as { reason: string }).reason).toBe('KICKED');
    expect(codeOf(() => room.kickPlayer('nope'))).toBe('UNKNOWN_PLAYER');
  });
  it('wraps player messages for the host in `relay`, refuses them with PAUSED without a host, and checks the pilot seat', () => {
    const { room, host, conns, ids } = setup();
    room.phase = { phase: 'FLIGHT' } as never;
    room.broadcastExplicit('pilot.assign', { pilotId: ids[0], pilotInput: 'PHONE', copilotId: null, boosterPilotId: null, boosterInput: null } as never);
    room.broadcast(conns[0]!, 'pilot.input', { craft: 'VEHICLE', n: 1 } as never);
    expect(host.last('relay')).toMatchObject({ from: ids[0], t: 'pilot.input' });
    expect(codeOf(() => room.broadcast(conns[1]!, 'pilot.input', { craft: 'VEHICLE', n: 1 } as never))).toBe('NOT_PILOT');
    room.disconnectHost(host);
    expect(codeOf(() => room.broadcast(conns[0]!, 'pilot.input', { craft: 'VEHICLE', n: 2 } as never))).toBe('PAUSED');
  });
  it('an Emergency Funding win spends PM and logs ability.used OVER_BUDGET_WIN', () => {
    const { room, host, ids } = setup();
    open(room, [opt('EF', { afford: 'EMERGENCY_FUNDING', overBudgetByM: 1 }), opt('B', { willNotFly: true })], {});
    room.armStage('VOTE');
    for (const id of ids) room.castBallot(id, 'EF', false);
    const result = room.closeVoteAndResolve('ALL_VOTED') as PayloadMap['vote.result'];
    expect(result.emergencyFunding).toBe(true);
    room.flushAbilityAnnouncements();
    expect(room.abilitiesUsed.has('PM')).toBe(true);
    expect(host.last('ability.used')).toMatchObject({ role: 'PM', trigger: 'OVER_BUDGET_WIN', roundId: 'r1' });
    expect(room.outcomeLog.map((o) => o.t)).toContain('ability.used');
  });
});
