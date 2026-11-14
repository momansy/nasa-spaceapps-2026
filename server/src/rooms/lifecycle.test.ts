import { afterEach, describe, expect, it } from 'vitest';
import { fixedClock } from '../timers/clock.js';
import { FakeConnection } from '../wire/connection.js';
import { Room } from './room.js';

const AV = { suitId: 'a', patchId: 'b' };
const rooms: Room[] = [];
afterEach(() => rooms.splice(0).forEach((r) => r.stopAllTimers()));

function setup() {
  const clock = fixedClock(1_000_000);
  const room = new Room({ code: 'KQXM', clientBaseUrl: 'https://x.example', clock, rng: () => 0 });
  rooms.push(room);
  const host = new FakeConnection('host');
  room.createByHost(host);
  return { room, clock, host };
}

describe('slot hold expiry (sweep)', () => {
  it('keeps a dropped player for 3 minutes, then frees the seat and revokes the token', () => {
    const { room, clock } = setup();
    const c = new FakeConnection('c1');
    const j = room.joinPlayer(c, 'Nova One', AV, undefined, false);
    room.joinPlayer(new FakeConnection('c2'), 'Nova Two', AV, undefined, false);
    room.disconnectPlayer(j.id, c);
    clock.advance(179_000);
    room.sweep();
    expect(room.buildRoomState().players).toHaveLength(2);
    clock.advance(1_001);
    room.sweep();
    expect(room.buildRoomState().players).toHaveLength(1);
    expect(room.findPlayerByToken(j.token)).toBeNull();
  });

  it('does not run the hold down while the game is paused', () => {
    const { room, clock } = setup();
    const c = new FakeConnection('c1');
    const j = room.joinPlayer(c, 'Nova One', AV, undefined, false);
    room.disconnectPlayer(j.id, c);
    clock.advance(100_000);
    room.hostPause();
    clock.advance(500_000);
    room.sweep();
    expect(room.findPlayerByToken(j.token)).not.toBeNull();
  });

  it('ignores a late close event from a replaced connection', () => {
    const { room } = setup();
    const old = new FakeConnection('old');
    const j = room.joinPlayer(old, 'Nova One', AV, undefined, false);
    const fresh = new FakeConnection('fresh');
    room.resumePlayer(fresh, room.findPlayerByToken(j.token)!);
    expect(old.closed?.code).toBe(4003);
    expect((old.last('bye') as { reason: string }).reason).toBe('REPLACED');
    room.disconnectPlayer(j.id, old);
    expect(room.buildRoomState().players[0]!.connected).toBe(true);
  });

  it('keeps a dropped spectator resumable for 3 minutes, then forgets it', () => {
    const { room, clock } = setup();
    const c = new FakeConnection('s1');
    const j = room.joinSpectator(c, undefined);
    room.disconnectSpectator(j.id, c);
    clock.advance(120_000);
    room.sweep();
    expect(room.findSpectatorByToken(j.token)).not.toBeNull();
    clock.advance(61_000);
    room.sweep();
    expect(room.findSpectatorByToken(j.token)).toBeNull();
  });
});

describe('room expiry and close', () => {
  it('expires the room 10 minutes after the host drops, with bye ROOM_EXPIRED to everyone', () => {
    const { room, clock, host } = setup();
    const c = new FakeConnection('c1');
    room.joinPlayer(c, 'Nova One', AV, undefined, false);
    let destroyed = false;
    room.onDestroyed = () => (destroyed = true);
    room.disconnectHost(host);
    clock.advance(599_000);
    expect(room.sweep()).toBeNull();
    clock.advance(1_001);
    expect(room.sweep()).toBe('EXPIRED');
    expect(destroyed).toBe(true);
    expect(c.closed?.code).toBe(4004);
    expect((c.last('bye') as { reason: string }).reason).toBe('ROOM_EXPIRED');
  });

  it('room.close sends bye ROOM_CLOSED (4000) to host, players and spectators and revokes tokens', () => {
    const { room, host } = setup();
    const p = new FakeConnection('p');
    const jp = room.joinPlayer(p, 'Nova One', AV, undefined, false);
    const s = new FakeConnection('s');
    const js = room.joinSpectator(s, undefined);
    room.destroyWith('ROOM_CLOSED');
    for (const c of [host, p, s]) {
      expect(c.closed?.code).toBe(4000);
      expect((c.last('bye') as { reason: string }).reason).toBe('ROOM_CLOSED');
    }
    expect(room.findPlayerByToken(jp.token)).toBeNull();
    expect(room.findSpectatorByToken(js.token)).toBeNull();
    expect(room.isHostToken('anything')).toBe(false);
  });
});

describe('promotion of pending players', () => {
  it('promotes a late joiner in join order when a vote opens, keeping the token and rebalancing roles', () => {
    const { room } = setup();
    for (let i = 0; i < 4; i++) room.joinPlayer(new FakeConnection(`c${i}`), `Player ${i}`, AV, undefined, false);
    room.lockRoles();
    const late = new FakeConnection('late');
    const j = room.joinPlayer(late, 'Late Comer', AV, undefined, true);
    expect(j.kind).toBe('SPECTATOR');
    const promoted = room.promotePending();
    expect(promoted).toHaveLength(1);
    const msg = late.last('room.promoted') as { id: string; slot: number; roles: string[] };
    expect(msg.slot).toBe(5);
    expect(msg.roles.length).toBeGreaterThan(0);
    expect(late.kind).toBe('PLAYER');
    expect(room.findPlayerByToken(j.token)?.id).toBe(msg.id);
    expect(room.findSpectatorByToken(j.token)).toBeNull();
    expect(new Set(room.buildRolesState().groups.flatMap((g) => g.roles)).size).toBe(10);
  });

  it('promotes only while seats are free', () => {
    const { room } = setup();
    for (let i = 0; i < 10; i++) room.joinPlayer(new FakeConnection(`c${i}`), `Player ${i}`, AV, undefined, false);
    const late = new FakeConnection('late');
    const j = room.joinPlayer(late, 'Late Comer', AV, undefined, false);
    expect(j.spectatorReason).toBe('ROOM_FULL');
    expect(room.promotePending()).toHaveLength(0);
  });
});

describe('audience reactions', () => {
  it('aggregates spectator reactions into one react.audience per window', () => {
    const { room, host } = setup();
    room.joinSpectator(new FakeConnection('s'), undefined);
    room.recordAudienceReaction('ROCKET');
    room.recordAudienceReaction('ROCKET');
    room.recordAudienceReaction('FIRE');
    room.flushAudienceReactions();
    const d = host.last('react.audience') as { windowMs: number; counts: Record<string, number> };
    expect(d.windowMs).toBe(1000);
    expect(d.counts).toEqual({ ROCKET: 2, THUMBS_UP: 0, GRIMACE: 0, FIRE: 1, THINKING: 0 });
    expect(host.sent.filter((m) => m.t === 'react.audience')).toHaveLength(1);
  });
});
