// Reducer cases (`pilot.hud`, `react.audience`) and screen routing for the pilot, co-pilot,
// booster and spectator views (T030).
import { describe, expect, it } from 'vitest';
import type { Message, MessageType, PayloadMap, Phase, PilotAssignPayload } from '@protocol';
import { initialState, reducer } from '../../state/reducer';
import { currentHud, currentScreen, mySeat, pilotInputOpen, seatActionOpen } from '../../state/selectors';
import type { AppState } from '../../state/types';

let seq = 0;
const send = (s: AppState, t: MessageType, d: unknown, nowMs = 5000): AppState => reducer(s, { type: 'msg', msg: { t, seq: ++seq, d } as Message, nowMs });
const as = <T extends MessageType>(s: AppState, t: T, d: PayloadMap[T], nowMs?: number) => send(s, t, d, nowMs);

function joined(kind: 'PLAYER' | 'SPECTATOR' = 'PLAYER', id = 'p1'): AppState {
  let s = initialState();
  s = as(s, 'room.joined', { room: 'KQXM', kind, id, slot: kind === 'PLAYER' ? 1 : null, nickname: 'Ada', token: 'tok_abcdefghijklmnop', spectatorReason: null, pendingPlayer: false });
  s = as(s, 'snapshot.end', { serverTimeMs: 1, lastOutcomeSeq: 0 });
  return s;
}

const phase = (s: AppState, p: Phase) =>
  as(s, 'phase.set', { missionSeq: 1, mode: 'QUICK', phase: p, sub: 'NONE', review: null, flightPhase: p === 'FLIGHT' ? 'F2' : null, segment: null, boosterTrack: false, contractId: 'C1', step: null });

const assign = (s: AppState, over: Partial<PilotAssignPayload>) =>
  as(s, 'pilot.assign', { segment: 'ASCENT', pilotId: null, pilotInput: 'HOST_DEVICE', copilotId: null, boosterPilotId: null, boosterInput: null, ...over });

const hud = (to: string[], over: Partial<PayloadMap['pilot.hud']> = {}): PayloadMap['pilot.hud'] => ({
  to,
  craft: 'VEHICLE',
  throttlePct: 72,
  attMode: 'PROGRADE',
  rcsOn: false,
  canStage: false,
  deployTarget: null,
  warp: 1,
  prompts: [],
  cue: null,
  ...over,
});

describe('reducer: pilot.hud and react.audience', () => {
  it('keeps the latest pilot.hud addressed to this phone and ignores others', () => {
    let s = joined();
    s = as(s, 'pilot.hud', hud(['p1', 'p2']));
    expect(s.pilotHud?.throttlePct).toBe(72);
    s = as(s, 'pilot.hud', hud(['p1'], { throttlePct: 40, canStage: true }));
    expect(s.pilotHud).toMatchObject({ throttlePct: 40, canStage: true });
    const other = as(s, 'pilot.hud', hud(['p9'], { throttlePct: 5 }));
    expect(other).toBe(s);
  });

  it('collects audience windows, newest last, at most six', () => {
    let s = joined('SPECTATOR', 's1');
    for (let i = 0; i < 9; i++) s = as(s, 'react.audience', { windowMs: 1000, counts: { ROCKET: i, THUMBS_UP: 0, GRIMACE: 0, FIRE: 1, THINKING: 0 } }, 1000 * i);
    expect(s.audience).toHaveLength(6);
    expect(s.audience[5]!.counts.ROCKET).toBe(8);
    expect(s.audience[0]!.counts.ROCKET).toBe(3);
    expect(new Set(s.audience.map((w) => w.id)).size).toBe(6);
  });

  it('starts with no hud and no audience, and leave clears them', () => {
    const s = initialState();
    expect(s.pilotHud).toBeNull();
    expect(s.audience).toEqual([]);
    let j = joined();
    j = as(j, 'pilot.hud', hud(['p1']));
    j = reducer(j, { type: 'local.leave' });
    expect(j.pilotHud).toBeNull();
  });
});

describe('mySeat', () => {
  const base = joined();
  it('is null without an assignment or for a seat not mine', () => {
    expect(mySeat(base)).toBeNull();
    expect(mySeat(assign(base, { pilotId: 'p2', pilotInput: 'PHONE' }))).toBeNull();
  });
  it('finds the phone pilot, the booster pilot and the co-pilot', () => {
    expect(mySeat(assign(base, { pilotId: 'p1', pilotInput: 'PHONE' }))).toEqual({ kind: 'PILOT', craft: 'VEHICLE' });
    expect(mySeat(assign(base, { boosterPilotId: 'p1', boosterInput: 'PHONE' }))).toEqual({ kind: 'BOOSTER', craft: 'BOOSTER' });
    expect(mySeat(assign(base, { copilotId: 'p1' }))).toEqual({ kind: 'COPILOT', craft: null });
  });
  it('is not a phone seat when the input source is the host device', () => {
    expect(mySeat(assign(base, { pilotId: 'p1', pilotInput: 'HOST_DEVICE' }))).toBeNull();
    expect(mySeat(assign(base, { boosterPilotId: 'p1', boosterInput: 'HOST_DEVICE' }))).toBeNull();
  });
  it('does not exist for spectators', () => {
    const sp = assign(joined('SPECTATOR', 's1'), { pilotId: 's1', pilotInput: 'PHONE' });
    expect(mySeat(sp)).toBeNull();
  });
});

describe('currentScreen routing', () => {
  const phases: Phase[] = ['LOBBY', 'BRIEFING', 'BUILD', 'FRR', 'COUNTDOWN', 'FLIGHT', 'DEBRIEF'];
  const seats: Array<[string, Partial<PilotAssignPayload>]> = [
    ['pilot on phone', { pilotId: 'p1', pilotInput: 'PHONE' }],
    ['pilot on host device', { pilotId: 'p1', pilotInput: 'HOST_DEVICE' }],
    ['booster pilot on phone', { boosterPilotId: 'p1', boosterInput: 'PHONE' }],
    ['booster pilot on host device', { boosterPilotId: 'p1', boosterInput: 'HOST_DEVICE' }],
    ['co-pilot', { copilotId: 'p1' }],
    ['nobody', {}],
    ['someone else', { pilotId: 'p2', pilotInput: 'PHONE', copilotId: 'p3' }],
  ];
  const phoneSeat = new Set(['pilot on phone', 'booster pilot on phone', 'co-pilot']);

  for (const [name, over] of seats) {
    for (const p of phases) {
      it(`${name} in ${p}`, () => {
        const s = phase(assign(joined(), over), p);
        const flying = p === 'COUNTDOWN' || p === 'FLIGHT';
        const expected = p === 'LOBBY' ? 'lobby' : p === 'DEBRIEF' ? 'debrief' : flying ? (phoneSeat.has(name) ? 'pilot' : 'console') : 'build';
        expect(currentScreen(s)).toBe(expected);
      });
    }
  }

  it('a seat change between segments swaps the screen, and a HOST_DEVICE seat falls back to the console', () => {
    let s = phase(assign(joined(), { segment: 'ASCENT', pilotId: 'p1', pilotInput: 'PHONE' }), 'FLIGHT');
    expect(currentScreen(s)).toBe('pilot');
    s = assign(s, { segment: 'ORBIT', pilotId: 'p2', pilotInput: 'PHONE', copilotId: 'p1' });
    expect(mySeat(s)).toEqual({ kind: 'COPILOT', craft: null });
    expect(currentScreen(s)).toBe('pilot');
    s = assign(s, { segment: 'ENTRY', pilotId: 'p1', pilotInput: 'HOST_DEVICE' });
    expect(currentScreen(s)).toBe('console');
    s = assign(s, { segment: 'LANDING', pilotId: 'p2', pilotInput: 'PHONE', boosterPilotId: 'p1', boosterInput: 'PHONE' });
    expect(mySeat(s)).toEqual({ kind: 'BOOSTER', craft: 'BOOSTER' });
    expect(currentScreen(s)).toBe('pilot');
  });

  it('a vote, poll or minigame in front of the flight keeps priority over the pilot screen', () => {
    const s = phase(assign(joined(), { pilotId: 'p1', pilotInput: 'PHONE' }), 'FLIGHT');
    const withMg = as(s, 'mg.start', {
      runId: 'r',
      minigameId: 'MG-08',
      type: 'PARALLEL_SOLO',
      seed: 1,
      startAtMs: 10,
      durationMs: 1000,
      assistLevel: 'ENGINEER',
      flightPhase: 'F4',
      audience: false,
      params: {},
      assignments: [],
    });
    expect(currentScreen(withMg)).toBe('minigame');
  });

  it('spectators watch outside the lobby (the debrief keeps its own screen)', () => {
    const sp = joined('SPECTATOR', 's1');
    expect(currentScreen(phase(sp, 'LOBBY'))).toBe('lobby');
    for (const p of ['BRIEFING', 'BUILD', 'FRR', 'COUNTDOWN', 'FLIGHT'] as Phase[]) expect(currentScreen(phase(sp, p))).toBe('watch');
    expect(currentScreen(phase(sp, 'DEBRIEF'))).toBe('debrief');
  });
});

describe('input and action gates', () => {
  const flying = () => phase(assign(joined(), { pilotId: 'p1', pilotInput: 'PHONE', copilotId: 'p2' }), 'FLIGHT');
  const online = (s: AppState): AppState => ({ ...s, conn: { ...s.conn, phase: 'open' } });

  it('opens for the seat in COUNTDOWN and FLIGHT only', () => {
    expect(pilotInputOpen(online(flying()), 'VEHICLE')).toBe(true);
    expect(pilotInputOpen(online(phase(flying(), 'COUNTDOWN')), 'VEHICLE')).toBe(true);
    expect(pilotInputOpen(online(phase(flying(), 'BUILD')), 'VEHICLE')).toBe(false);
    expect(pilotInputOpen(online(phase(flying(), 'DEBRIEF')), 'VEHICLE')).toBe(false);
  });
  it('is closed for the other craft, while paused and while offline', () => {
    expect(pilotInputOpen(online(flying()), 'BOOSTER')).toBe(false);
    expect(pilotInputOpen(flying(), 'VEHICLE')).toBe(false);
    const paused = as(online(flying()), 'game.paused', { reason: 'HOST_REQUEST', atMs: 1, roomExpiresAtMs: null });
    expect(pilotInputOpen(paused, 'VEHICLE')).toBe(false);
    expect(seatActionOpen(paused)).toBe(false);
    const resumed = as(paused, 'game.resumed', { atMs: 101, pausedForMs: 100 });
    expect(pilotInputOpen(resumed, 'VEHICLE')).toBe(true);
  });
  it('closes the moment the seat moves away', () => {
    const s = online(flying());
    const moved = assign(s, { pilotId: 'p3', pilotInput: 'PHONE' });
    expect(pilotInputOpen(moved, 'VEHICLE')).toBe(false);
    expect(seatActionOpen(moved)).toBe(false);
  });
});

describe('currentHud', () => {
  it('is the latest hud, until a newer pilot.assign makes it stale', () => {
    let s = assign(joined(), { pilotId: 'p1', pilotInput: 'PHONE' });
    expect(currentHud(s)).toBeNull();
    s = as(s, 'pilot.hud', hud(['p1'], { canStage: true }));
    expect(currentHud(s)?.canStage).toBe(true);
    // A handover: the previous holder's canStage must not show as current.
    s = assign(s, { segment: 'ORBIT', pilotId: 'p1', pilotInput: 'PHONE', copilotId: 'p2' });
    expect(currentHud(s)).toBeNull();
    s = as(s, 'pilot.hud', hud(['p1'], { canStage: false }));
    expect(currentHud(s)?.canStage).toBe(false);
  });
});
