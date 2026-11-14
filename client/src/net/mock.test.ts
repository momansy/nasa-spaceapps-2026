// Plays the whole scripted mock session headless: the real ProtocolClient and Store against
// the in-page mock room, with a scripted player making the decisions a person would make.
// Every frame in both directions is validated against protocol/schema/.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import Ajv2020 from 'ajv/dist/2020';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Envelope, MessageType } from '@protocol';
import { MESSAGE_TYPES } from '@protocol';
import { Store } from '../state/store';
import type { AppState } from '../state/types';
import { coopChannel } from '../minigames/coop';
import type { CoopState } from '../minigames/types';
import { createMockConnection, type FrameDirection } from './mock';
import { memorySession } from './wsConnection';

const schemaDir = join(__dirname, '../../../protocol/schema');

function makeValidator() {
  const ajv = new Ajv2020({ strict: false, allErrors: true });
  for (const f of readdirSync(schemaDir)) {
    if (f.endsWith('.schema.json')) ajv.addSchema(JSON.parse(readFileSync(join(schemaDir, f), 'utf8')) as object);
  }
  return (env: Envelope): string | null => {
    const envOk = ajv.validate('urn:missionforge:protocol:v1:envelope', env);
    if (!envOk) return `envelope: ${ajv.errorsText()}`;
    const ok = ajv.validate(`urn:missionforge:protocol:v1:${env.t}`, env.d);
    return ok ? null : `${env.t}: ${ajv.errorsText()} ${JSON.stringify(env.d).slice(0, 300)}`;
  };
}

describe('mock session', () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: new Date('2026-11-14T10:00:00Z') });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('plays lobby → votes → poll → flight → minigame → debrief with valid frames', async () => {
    const validate = makeValidator();
    const frames: Array<{ dir: FrameDirection; env: Envelope }> = [];
    const conn = createMockConnection('en', { onFrame: (dir, env) => frames.push({ dir, env }) }, memorySession());
    const store = new Store(conn);

    const done = new Set<string>();
    const once = (key: string, fn: () => void) => {
      if (done.has(key)) return;
      done.add(key);
      fn();
    };
    const choices: Record<string, string> = {
      'm1.r01': 'eng_kerolox_workhorse',
      'm1.r02': 'TEST',
      'm1.r03': 'eng_methalox_vacuum',
      'm1.r04': 'fairing_small',
    };

    const act = (s: AppState) => {
      const v = s.vote;
      if (v?.stage) {
        const id = v.opened.roundId;
        const st = v.stage.stage;
        if (st === 'PREDICT') once(`${id}.predict`, () => setTimeout(() => store.predict(2), 800));
        if (st === 'INSPECT' && id === 'm1.r04') once(`${id}.tag`, () => setTimeout(() => store.tag('fairing_small', 'RECOMMENDED'), 500));
        if (st === 'VOTE') {
          once(`${id}.ping`, () => setTimeout(() => store.ping('LIKE_THIS', choices[id] ?? null), 300));
          once(`${id}.cast1`, () => setTimeout(() => store.castVote(id === 'm1.r01' ? 'eng_methalox_full_flow' : choices[id]!), 1200));
          // Vote change in round 1.
          if (id === 'm1.r01') once(`${id}.cast2`, () => setTimeout(() => store.castVote(choices[id]!), 4000));
          if (id === 'm1.r03') once(`${id}.veto`, () => setTimeout(() => store.veto('eng_hydrolox_vacuum'), 2500));
        }
        if (st === 'TIEBREAK_TRIVIA') once(`${id}.trivia`, () => setTimeout(() => store.answerTrivia(1), 900));
        if (st === 'TIEBREAK_PICK' && v.stage.pickerId === s.me?.id) once(`${id}.pick`, () => setTimeout(() => store.pickTiebreak('fairing_small'), 700));
      }
      if (s.poll && !s.poll.result && s.poll.call.playerId === s.me?.id && !s.poll.myAnswer) once(`${s.poll.pollId}.answer`, () => setTimeout(() => store.answerPoll('GO'), 600));
      for (const a of s.flight.alerts) {
        if (a.role === 'STRUCT' && a.calledAtMs == null) once(`alert.${a.alertId}`, () => setTimeout(() => store.callout(a.role, a.calloutId), 1500));
      }
      if (s.mg && !s.mg.outcome) {
        const run = s.mg.start;
        once(`${run.runId}.ready`, () => {
          store.minigameReady(run.runId);
          const playMs = run.startAtMs - store.now() + run.durationMs;
          setTimeout(() => store.minigameResult(run.runId, { success: true, perfect: false, score: 0.91, value: null, elapsedMs: run.durationMs, mode: 'STANDARD' }), Math.max(0, playMs));
        });
      }
    };
    store.subscribe(() => act(store.getState()));

    store.join('KQXM', 'Ada', { suitId: 'suit_orange', patchId: 'patch_rocket' });

    const seen = new Set<string>();
    const results: Record<string, string> = {};
    for (let i = 0; i < 6000 && !store.getState().debrief.facts; i++) {
      await vi.advanceTimersByTimeAsync(100);
      const s = store.getState();
      if (s.vote?.stage) seen.add(`${s.vote.opened.roundId}:${s.vote.stage.stage}`);
      if (s.vote?.result) results[s.vote.opened.roundId] = s.vote.result.method;
      if (s.poll) seen.add(`poll:${s.poll.result ? 'result' : 'call'}`);
      if (s.mg) seen.add(`mg:${s.mg.summary ? 'summary' : 'run'}`);
      if (s.flight.blackout) seen.add('blackout');
    }

    const s = store.getState();
    // Reached the debrief.
    expect(s.phase?.phase).toBe('DEBRIEF');
    expect(s.debrief.score?.outcome).toBe('SUCCESS');
    expect(s.debrief.awards?.players.find((p) => p.playerId === s.me?.id)?.awardIds.length).toBeGreaterThan(0);

    // Votes: predict, vote change, quick vote, veto, tie → trivia → my pick.
    expect(seen.has('m1.r01:PREDICT')).toBe(true);
    expect(results['m1.r01']).toBe('PLURALITY');
    expect(s.lastVote?.opened.roundId).toBe('m1.r04');
    expect(results['m1.r02']).toBe('PLURALITY');
    expect(seen.has('m1.r03:INSPECT')).toBe(true);
    expect(results['m1.r04']).toBe('TRIVIA');
    expect(s.lastVote?.result?.winnerId).toBe('fairing_small');
    expect(s.lastVote?.result?.triviaWinnerId).toBe(s.me?.id);
    const vetoFrames = frames.filter((f) => f.dir === 'out' && f.env.t === 'vote.vetoed');
    expect(vetoFrames.length).toBe(2);
    expect(s.room?.players.find((p) => p.id === s.me?.id)?.vetoAvailable).toBe(false);
    expect(s.kp.mine).toBe(80);

    // Poll, flight, minigame.
    expect(seen.has('poll:result')).toBe(true);
    expect(frames.some((f) => f.env.t === 'console.goodcall')).toBe(true);
    expect(seen.has('mg:summary')).toBe(true);
    expect(frames.find((f) => f.env.t === 'mg.summary')?.env.d).toMatchObject({ tier: 'SILVER', active: 5, succeeded: 4 });
    expect(seen.has('blackout')).toBe(true);
    expect(s.codex.unlocked).toEqual(expect.arrayContaining(['eng_kerolox_workhorse', 'fairing_small', 'F05']));

    // Every frame valid against protocol/schema/, every type known, sequence numbers per direction.
    const errors = frames.map((f) => validate(f.env)).filter((e): e is string => !!e);
    expect(errors).toEqual([]);
    const types = new Set(frames.map((f) => f.env.t));
    for (const t of types) expect(MESSAGE_TYPES).toContain(t as MessageType);
    expect(frames.filter((f) => f.env.t === 'error')).toEqual([]);
    expect(types.size).toBeGreaterThan(45);

    conn.room.stop();
    conn.dispose();
  }, 60_000);

  it('reconnects after a dropped connection and resumes with the stored token', async () => {
    const session = memorySession();
    const conn = createMockConnection('en', {}, session);
    const store = new Store(conn);
    store.join('KQXM', 'Ada', { suitId: 'suit_orange', patchId: 'patch_rocket' });
    await vi.advanceTimersByTimeAsync(6000);
    expect(store.getState().me?.id).toBe('p1');
    expect(session.load()?.room).toBe('KQXM');
    const token = session.load()!.token;

    conn.room.dropConnection();
    await vi.advanceTimersByTimeAsync(50);
    expect(store.getState().conn.phase).toBe('reconnecting');
    expect(store.getState().conn.attempt).toBe(1);
    await vi.advanceTimersByTimeAsync(1500);
    const st = store.getState();
    expect(st.conn.phase).toBe('open');
    expect(st.me?.id).toBe('p1');
    expect(st.snapshotting).toBe(false);
    expect(session.load()?.token).toBe(token);
    expect(st.room?.players.length).toBeGreaterThan(1);

    conn.room.stop();
    conn.dispose();
  });

  it('estimates the server clock offset', async () => {
    const conn = createMockConnection('en', { serverOffsetMs: 2500 }, memorySession());
    const store = new Store(conn);
    store.join('KQXM', 'Ada', { suitId: 'suit_orange', patchId: 'patch_rocket' });
    await vi.advanceTimersByTimeAsync(1200);
    expect(Math.abs(conn.getStatus().offsetMs - 2500)).toBeLessThan(40);
    expect(Math.abs(store.now() - (Date.now() + 2500))).toBeLessThan(40);
    conn.room.stop();
    conn.dispose();
  });

  it('refuses a taken call sign with a suggestion and keeps the socket for a retry', async () => {
    const conn = createMockConnection('en', {}, memorySession());
    const store = new Store(conn);
    store.join('KQXM', 'Vega', { suitId: 'suit_orange', patchId: 'patch_rocket' });
    await vi.advanceTimersByTimeAsync(300);
    expect(store.getState().joinError).toMatchObject({ code: 'NICK_TAKEN', suggestion: 'Vega-2' });
    expect(conn.getStatus().phase).toBe('handshake');
    store.join('KQXM', 'Vega-2', { suitId: 'suit_orange', patchId: 'patch_rocket' });
    await vi.advanceTimersByTimeAsync(300);
    expect(store.getState().me?.id).toBe('p1');
    conn.room.stop();
    conn.dispose();
  });

  it('relays cooperative moves: env.coop send → mg.action, host mg.state → onState', async () => {
    const validate = makeValidator();
    const frames: Envelope[] = [];
    const conn = createMockConnection('en', { onFrame: (_d, env) => frames.push(env) }, memorySession());
    const store = new Store(conn);
    store.join('KQXM', 'Ada', { suitId: 'suit_orange', patchId: 'patch_rocket' });
    await vi.advanceTimersByTimeAsync(4000);
    conn.room.startRun({
      runId: 't.coop1',
      minigameId: 'MG-99',
      type: 'COOP_SPLIT',
      seed: 7,
      startAtMs: conn.room.now() + 3000,
      durationMs: 20000,
      assistLevel: 'ENGINEER',
      flightPhase: null,
      audience: false,
      params: {},
      assignments: [{ playerId: 'p1', index: 0, params: { piece: 'left' } }],
    });
    await vi.advanceTimersByTimeAsync(100);
    const states: CoopState[] = [];
    const coop = coopChannel(store, 't.coop1');
    const off = coop.onState((st) => states.push(st));
    coop.send({ a: 'place', x: [2, 140] });
    coop.send({ a: 'Bad Name', x: [1] }); // refused locally: not a protocol action name
    await vi.advanceTimersByTimeAsync(700);
    off();
    expect(states.length).toBe(2);
    expect(states[0]!.shared).toMatchObject({ moves: 1, last_a: 'place', last_x: [2, 140], by_0: 1 });
    expect(states[1]!.shared).toMatchObject({ moves: 2 });
    const actions = frames.filter((f) => f.t === 'mg.action');
    expect(actions).toHaveLength(1);
    expect(actions[0]!.d).toEqual({ runId: 't.coop1', n: 1, a: 'place', x: [2, 140] });
    expect(frames.map((f) => validate(f)).filter(Boolean)).toEqual([]);
    conn.room.stop();
    conn.dispose();
  });
});
