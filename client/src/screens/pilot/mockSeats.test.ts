// Plays each mock seat headless (same approach as net/mock.test.ts): the real ProtocolClient and
// Store against the in-page mock room, with a scripted phone. Every frame in both directions is
// validated against protocol/schema/.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import Ajv2020 from 'ajv/dist/2020';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Envelope } from '@protocol';
import { createMockConnection, type FrameDirection, type MockOptions } from '../../net/mock';
import { memorySession } from '../../net/wsConnection';
import { currentScreen, mySeat } from '../../state/selectors';
import { Store } from '../../state/store';

const schemaDir = join(__dirname, '../../../../protocol/schema');

function makeValidator() {
  const ajv = new Ajv2020({ strict: false, allErrors: true });
  for (const f of readdirSync(schemaDir)) {
    if (f.endsWith('.schema.json')) ajv.addSchema(JSON.parse(readFileSync(join(schemaDir, f), 'utf8')) as object);
  }
  return (env: Envelope): string | null => {
    if (!ajv.validate('urn:missionforge:protocol:v1:envelope', env)) return `envelope: ${ajv.errorsText()}`;
    return ajv.validate(`urn:missionforge:protocol:v1:${env.t}`, env.d) ? null : `${env.t}: ${ajv.errorsText()} ${JSON.stringify(env.d).slice(0, 300)}`;
  };
}

type Frame = { dir: FrameDirection; env: Envelope; at: number };

function setup(opts: MockOptions = {}, watch = false) {
  const frames: Frame[] = [];
  const conn = createMockConnection('en', { speed: 4, onFrame: (dir, env) => frames.push({ dir, env, at: Date.now() }), ...opts }, memorySession());
  const store = new Store(conn);
  store.join('KQXM', 'Ada', { suitId: 'suit_orange', patchId: 'patch_rocket' }, watch);
  const advance = (ms: number) => vi.advanceTimersByTimeAsync(ms);
  const until = async (pred: () => boolean, maxMs = 120_000) => {
    for (let t = 0; t < maxMs && !pred(); t += 50) await advance(50);
    expect(pred()).toBe(true);
  };
  const out = (t: string) => frames.filter((f) => f.dir === 'in' && f.env.t === t);
  const inn = (t: string) => frames.filter((f) => f.dir === 'out' && f.env.t === t);
  const finish = () => {
    conn.room.stop();
    conn.dispose();
  };
  return { conn, store, frames, advance, until, out, inn, finish, room: conn.room };
}

/** Joins and plays to the first moment the seat screen is up (flight, role card acknowledged). */
async function toFlight(h: ReturnType<typeof setup>) {
  await h.until(() => h.store.getState().roles?.locked === true);
  const s = h.store.getState();
  h.store.ackRoleCard(s.roles!.locked ? s.roles!.groups.filter((g) => g.playerId === s.me?.id).flatMap((g) => g.roles).join('+') : '');
  await h.until(() => h.store.getState().phase?.phase === 'FLIGHT');
}

describe('mock seats', () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: new Date('2026-11-14T10:00:00Z') });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('pilot seat: throttle, STAGE, ABORT reach the host and come back in pilot.hud; frames are valid', async () => {
    const validate = makeValidator();
    const h = setup({ seat: 'pilot' });
    await toFlight(h);
    const { store, room } = h;
    expect(mySeat(store.getState())).toEqual({ kind: 'PILOT', craft: 'VEHICLE' });
    expect(currentScreen(store.getState())).toBe('pilot');
    store.pilotAxes('VEHICLE'); // what the pilot screen does on mount: the sampler waits for the first pilot.hud
    expect(h.out('pilot.input')).toHaveLength(0);
    await h.advance(400);
    expect(h.out('pilot.input').length).toBeGreaterThan(0); // keep-alive started with the seat

    store.pilotInput('VEHICLE', { throttle: 0.8 });
    await h.advance(2500);
    expect(room.seat!.state.throttleCmd).toBe(0.8);
    const hud = store.getState().pilotHud!;
    expect(hud.craft).toBe('VEHICLE');
    expect(hud.throttlePct).toBeCloseTo(80, 0); // the read-back follows the command, slewed

    // STAGE is refused by the phone until the host says canStage; then it is sent once.
    room.seat!.state.force.canStage = true;
    await h.advance(300);
    expect(store.getState().pilotHud!.canStage).toBe(true);
    expect(store.pilotAction('VEHICLE', 'STAGE')).toBe(true);
    await h.advance(300);
    expect(room.seat!.log.map((a) => a.action)).toEqual(['STAGE']);
    expect(store.getState().pilotHud!.canStage).toBe(false);

    store.pilotAction('VEHICLE', 'ATT_HOLD', { attMode: 'PROGRADE' });
    store.pilotAction('VEHICLE', 'RCS_TOGGLE');
    store.pilotAction('VEHICLE', 'ABORT');
    await h.advance(300);
    expect(room.seat!.state.abortRequested).toBe(true);
    expect(store.getState().pilotHud).toMatchObject({ attMode: 'PROGRADE', rcsOn: true });
    expect(store.pilotAction('VEHICLE', 'ATT_HOLD')).toBe(false); // attMode required
    expect(store.pilotAction('VEHICLE', 'DEPLOY')).toBe(false); // deploy required
    expect(store.pilotAction('BOOSTER', 'STAGE')).toBe(false); // not my craft
    expect(store.copilotAction('STAGE')).toBe(false); // not the co-pilot

    const ns = h.out('pilot.action').map((f) => (f.env.d as { n: number }).n);
    expect(ns).toEqual([ns[0]!, ns[0]! + 1, ns[0]! + 2, ns[0]! + 3]);
    expect(ns[0]!).toBeGreaterThan(1_000_000); // a time-based start, so a reload never goes back below the host's last n

    const errors = h.frames.map((f) => validate(f.env)).filter((e): e is string => !!e);
    expect(errors).toEqual([]);
    expect(h.inn('error')).toEqual([]);
    expect(h.inn('pilot.hud').length).toBeGreaterThan(5);
    h.finish();
  }, 60_000);

  it('pilot.input stays at or below 30 Hz with a 5 Hz keep-alive, and pilot.hud at or below 10 Hz', async () => {
    const h = setup({ seat: 'pilot' });
    await toFlight(h);
    h.store.pilotAxes('VEHICLE');
    await h.advance(400);
    // Quiet second: only keep-alive frames.
    await h.advance(1000);
    const t0 = Date.now();
    const quietStart = h.out('pilot.input').filter((f) => f.at >= t0 - 1000).length;
    expect(quietStart).toBeGreaterThanOrEqual(4);
    expect(quietStart).toBeLessThanOrEqual(6);
    // A second of continuous input: one change per millisecond.
    const mark = h.out('pilot.input').length;
    const hudMark = h.inn('pilot.hud').length;
    for (let i = 0; i < 1000; i++) {
      h.store.pilotInput('VEHICLE', { pitch: Math.sin(i / 40), throttle: 0.5 + 0.4 * Math.sin(i / 90) });
      await h.advance(1);
    }
    const sent = h.out('pilot.input').slice(mark);
    expect(sent.length).toBeLessThanOrEqual(30);
    expect(sent.length).toBeGreaterThan(20);
    expect(h.inn('pilot.hud').length - hudMark).toBeLessThanOrEqual(10);
    const ns = h.out('pilot.input').map((f) => (f.env.d as { n: number }).n);
    for (let i = 1; i < ns.length; i++) expect(ns[i]!).toBeGreaterThan(ns[i - 1]!);
    h.finish();
  }, 60_000);

  it('sends nothing while paused, and nothing after the seat moves away; the host refuses a stray frame', async () => {
    const h = setup({ seat: 'pilot' });
    await toFlight(h);
    const { room, store } = h;
    store.pilotAxes('VEHICLE');
    await h.advance(800);

    room.setPaused(true);
    await h.advance(100);
    const inputsAtPause = h.out('pilot.input').length;
    const actionsAtPause = h.out('pilot.action').length;
    store.pilotInput('VEHICLE', { throttle: 0.2, pitch: 0.9 });
    expect(store.pilotAction('VEHICLE', 'CUTOFF')).toBe(false);
    await h.advance(3000);
    expect(h.out('pilot.input').length).toBe(inputsAtPause);
    expect(h.out('pilot.action').length).toBe(actionsAtPause);
    room.setPaused(false);
    await h.advance(200);
    expect(h.out('pilot.input').length).toBeGreaterThan(inputsAtPause); // resumes with the current state
    expect(h.out('pilot.input').at(-1)!.env.d).toMatchObject({ throttle: 0.2 });

    // Seat handed to a bot: the phone falls back to the console and goes silent.
    room.reassign({ pilotId: 'p3', pilotInput: 'PHONE', copilotId: null });
    await h.advance(100);
    expect(currentScreen(store.getState())).toBe('console');
    const quiet = h.out('pilot.input').length;
    store.pilotInput('VEHICLE', { pitch: -0.5 });
    expect(store.pilotAction('VEHICLE', 'STAGE')).toBe(false);
    await h.advance(2000);
    expect(h.out('pilot.input').length).toBe(quiet);

    // A frame forced through anyway is refused with NOT_PILOT (the host never applies it).
    const stray = 2_000_000_000;
    store.conn.send('pilot.input', { craft: 'VEHICLE', n: stray, throttle: 1, pitch: 0, yaw: 0, roll: 0 });
    await h.advance(100);
    expect(h.inn('error').map((f) => (f.env.d as { code: string }).code)).toContain('NOT_PILOT');
    expect(room.seat!.state.lastInputN).toBeLessThan(stray);
    h.finish();
  }, 60_000);

  it('a seat handover never zeroes or reverts the throttle the host holds', async () => {
    const h = setup({ seat: 'pilot' });
    await toFlight(h);
    const { room, store } = h;
    store.pilotAxes('VEHICLE');
    await h.advance(600);
    store.pilotInput('VEHICLE', { throttle: 0.3 });
    await h.advance(300);
    expect(room.seat!.state.throttleCmd).toBe(0.3);
    // Another pilot flies a segment and leaves the throttle at 90 %.
    room.reassign({ pilotId: 'p3', pilotInput: 'PHONE', copilotId: null });
    await h.advance(200);
    room.seat!.state.throttleCmd = 0.9;
    room.seat!.state.throttlePct = 90;
    const mark = h.out('pilot.input').length;
    room.reassign({ pilotId: store.getState().me!.id, pilotInput: 'PHONE', copilotId: null });
    await h.advance(40);
    expect(h.out('pilot.input').length).toBe(mark); // waits for the host's first hud of the seat
    await h.advance(1500);
    const after = h.out('pilot.input').slice(mark).map((f) => (f.env.d as { throttle: number }).throttle);
    expect(after.length).toBeGreaterThan(3);
    expect(after.every((t) => Math.abs(t - 0.9) < 0.011)).toBe(true);
    expect(room.seat!.state.throttleCmd).toBeCloseTo(0.9, 2);
    h.finish();
  }, 60_000);

  it('after a handover with no pilot.hud in sight the phone stays silent until the player moves a control', async () => {
    const h = setup({ seat: 'pilot' });
    await toFlight(h);
    const { room, store } = h;
    store.pilotAxes('VEHICLE');
    await h.advance(600);
    // A blackout: the host sends no pilot.hud. The seat is handed away and back.
    room.send('blackout.set', { active: true, cause: 'OUT_OF_COVERAGE', expectedEndAtMs: null });
    room.reassign({ pilotId: 'p3', pilotInput: 'PHONE', copilotId: null });
    await h.advance(100);
    room.reassign({ pilotId: store.getState().me!.id, pilotInput: 'PHONE', copilotId: null });
    const mark = h.out('pilot.input').length;
    await h.advance(3000); // longer than the wait for a hud
    expect(h.out('pilot.input').length).toBe(mark); // never a blind first frame that could close the host's throttle
    store.pilotInput('VEHICLE', { pitch: 0.4 });
    await h.advance(300);
    expect(h.out('pilot.input').length).toBeGreaterThan(mark);
    h.finish();
  }, 60_000);

  it('host-device seat: the phone keeps the console and sends nothing', async () => {
    const h = setup({ seat: 'booster' });
    await toFlight(h);
    expect(mySeat(h.store.getState())).toEqual({ kind: 'BOOSTER', craft: 'BOOSTER' });
    h.store.pilotAxes('BOOSTER');
    await h.advance(400);
    h.room.reassign({ boosterInput: 'HOST_DEVICE' });
    await h.advance(100);
    expect(mySeat(h.store.getState())).toBeNull();
    expect(currentScreen(h.store.getState())).toBe('console');
    const n = h.out('pilot.input').length;
    h.store.pilotInput('BOOSTER', { throttle: 1 });
    await h.advance(1500);
    expect(h.out('pilot.input').length).toBe(n);
    h.finish();
  }, 60_000);

  it('booster seat flies the booster craft', async () => {
    const validate = makeValidator();
    const h = setup({ seat: 'booster' });
    await toFlight(h);
    h.store.pilotInput('BOOSTER', { throttle: 0.4, pitch: 0.5 });
    await h.advance(1500);
    expect(h.out('pilot.input').at(-1)!.env.d).toMatchObject({ craft: 'BOOSTER', throttle: 0.4 });
    expect(h.store.getState().pilotHud?.craft).toBe('BOOSTER');
    expect(h.store.pilotAction('BOOSTER', 'CUTOFF')).toBe(true);
    await h.advance(400);
    expect(h.room.seat!.log.at(-1)).toMatchObject({ craft: 'BOOSTER', action: 'CUTOFF' });
    expect(h.frames.map((f) => validate(f.env)).filter(Boolean)).toEqual([]);
    h.finish();
  }, 60_000);

  it('co-pilot seat: STAGE and every DEPLOY target send copilot.action; pilot input is not available', async () => {
    const validate = makeValidator();
    const h = setup({ seat: 'copilot' });
    await toFlight(h);
    const { store, room } = h;
    expect(mySeat(store.getState())).toEqual({ kind: 'COPILOT', craft: null });
    expect(currentScreen(store.getState())).toBe('pilot');
    room.seat!.state.force.canStage = true;
    expect(store.copilotAction('STAGE')).toBe(true);
    for (const target of ['CONTEXT', 'FAIRING', 'CHUTES', 'LEGS', 'ARRAYS'] as const) expect(store.copilotAction('DEPLOY', target)).toBe(true);
    expect(store.copilotAction('DEPLOY')).toBe(false);
    await h.advance(600);
    const sent = h.out('copilot.action').map((f) => f.env.d as { n: number; action: string; deploy?: string });
    expect(sent.map((d) => d.n)).toEqual([0, 1, 2, 3, 4, 5].map((i) => sent[0]!.n + i));
    expect(sent.map((d) => d.deploy ?? d.action)).toEqual(['STAGE', 'CONTEXT', 'FAIRING', 'CHUTES', 'LEGS', 'ARRAYS']);
    expect(room.seat!.log).toHaveLength(6);
    expect(store.pilotAction('VEHICLE', 'STAGE')).toBe(false);
    store.pilotInput('VEHICLE', { throttle: 1 });
    await h.advance(1000);
    expect(h.out('pilot.input')).toEqual([]);
    expect(store.getState().pilotHud?.to).toEqual([store.getState().me!.id]);
    expect(h.frames.map((f) => validate(f.env)).filter(Boolean)).toEqual([]);
    h.finish();
  }, 60_000);

  it('watcher: joins as spectator, sees audience windows and the audience bar data, reactions are limited to 1/s', async () => {
    const validate = makeValidator();
    const h = setup({ watch: true }, true);
    await h.until(() => h.store.getState().phase?.phase === 'BRIEFING');
    const { store } = h;
    expect(store.getState().me?.kind).toBe('SPECTATOR');
    expect(currentScreen(store.getState())).toBe('watch');
    await h.until(() => store.getState().audience.length >= 3, 10_000);
    const w = store.getState().audience.at(-1)!;
    expect(w.windowMs).toBe(1000);
    expect(Object.values(w.counts).reduce((a, b) => a + b, 0)).toBeGreaterThan(0);

    // The mock refuses what spectators may not send.
    store.conn.send('vote.cast', { roundId: 'x', optionId: 'a' });
    await h.advance(100);
    expect(h.inn('error').map((f) => (f.env.d as { code: string }).code)).toContain('FORBIDDEN');

    // Spectator reactions: the client limit (1 per second) is the store's job; the mock enforces the protocol limit.
    const before = h.inn('error').length;
    store.react('ROCKET');
    store.react('FIRE');
    store.react('FIRE');
    await h.advance(100);
    expect(h.inn('error').length - before).toBe(1); // third in a burst: RATE_LIMITED
    expect(h.inn('error').at(-1)!.env.d).toMatchObject({ code: 'RATE_LIMITED', reT: 'react.send' });

    // The vote screen carries audience counts.
    await h.until(() => store.getState().vote?.tally != null, 120_000);
    const tally = store.getState().vote!.tally!;
    expect(tally.audienceTotal).toBeGreaterThan(0);
    expect(tally.audienceCounts!.length).toBe(tally.stage === 'VOTE' ? tally.counts!.length : tally.audienceCounts!.length);
    expect(currentScreen(store.getState())).toBe('vote');
    expect(h.frames.map((f) => validate(f.env)).filter(Boolean)).toEqual([]);
    h.finish();
  }, 120_000);

  it('profile: changes nickname and avatar in the lobby, shows the server errors, refuses later', async () => {
    const validate = makeValidator();
    const h = setup({ lobbyHoldMs: 60_000 });
    const { store } = h;
    await h.until(() => store.getState().room?.players.length === 5 && store.getState().phase?.phase === 'LOBBY');
    const ok = store.setProfile('Nova Prime', { suitId: 'suit_teal', patchId: 'patch_comet' });
    await h.advance(300);
    expect(await ok).toEqual({ ok: true, nickname: 'Nova Prime' });
    const me = store.getState().room!.players.find((p) => p.id === store.getState().me!.id)!;
    expect(me).toMatchObject({ nickname: 'Nova Prime', avatar: { suitId: 'suit_teal', patchId: 'patch_comet' } });

    const taken = store.setProfile('Vega', { suitId: 'suit_teal', patchId: 'patch_comet' });
    await h.advance(300);
    expect(await taken).toEqual({ ok: false, code: 'NICK_TAKEN', suggestion: 'Vega-2' });
    const rejected = store.setProfile('Nova_', { suitId: 'suit_teal', patchId: 'patch_comet' });
    await h.advance(300);
    expect(await rejected).toMatchObject({ ok: false, code: 'NICK_REJECTED' });

    // After the lobby: WRONG_PHASE.
    await h.until(() => store.getState().phase?.phase !== 'LOBBY', 200_000);
    const late = store.setProfile('Nova Two', { suitId: 'suit_blue', patchId: 'patch_star' });
    await h.advance(300);
    expect(await late).toMatchObject({ ok: false, code: 'WRONG_PHASE' });
    expect(h.frames.map((f) => validate(f.env)).filter(Boolean)).toEqual([]);
    h.finish();
  }, 120_000);
});
