import { describe, expect, it } from 'vitest';
import type { AssistLevel, MgMap, MinigameMode } from '@protocol';
import { feedFrames, replay, type SimInput } from '../MG-09/shared/core';
import { answerInputs, CHANNELS, DEFAULTS, inLimits, newSim, readingsFor, resolveConfig, rightCall, turnStartMs, type Mg07Config, type Mg07Sim } from './model';

const SEEDS = Array.from({ length: 24 }, (_, i) => 5 + i * 31337);
const STANDARD = resolveConfig({}, 'STANDARD', 'ENGINEER');
const dur = (slots: number, c: Mg07Config = STANDARD) => slots * c.turnMs;

function run(config: Mg07Config, params: MgMap, seed: number, inputs: (sim: Mg07Sim) => SimInput[]) {
  const sim = newSim(config, params, seed, dur((params.slots as number) ?? 1, config));
  for (const i of inputs(sim)) sim.push(i);
  sim.finish();
  return sim;
}

const GO_PARAMS = { slot: 0, slots: 1, channels: [0, 2, 3], values: [20, 80, 28], limits_lo: [0, 66, 26], limits_hi: [34, 92, 32] };
const NOGO_PARAMS = { ...GO_PARAMS, values: [20, 95.5, 28] };

describe('MG-07 the right call', () => {
  it('is GO when every reading is within limits (limits inclusive) and NO-GO otherwise', () => {
    expect(rightCall(readingsFor(GO_PARAMS, 1, 3))).toBe('GO');
    expect(rightCall(readingsFor(NOGO_PARAMS, 1, 3))).toBe('NOGO');
    expect(rightCall(readingsFor({ ...GO_PARAMS, values: [34, 66, 32] }, 1, 3))).toBe('GO');
    expect(rightCall(readingsFor({ ...GO_PARAMS, values: [34.01, 66, 32] }, 1, 3))).toBe('NOGO');
    expect(rightCall(readingsFor({ ...GO_PARAMS, values: [20, 65.99, 28] }, 1, 3))).toBe('NOGO');
  });

  it('a GO console answered GO succeeds, NO-GO fails; and the other way round', () => {
    expect(run(STANDARD, GO_PARAMS, 1, (s) => answerInputs(s, 1500, 'GO')).score().success).toBe(true);
    expect(run(STANDARD, GO_PARAMS, 1, (s) => answerInputs(s, 1500, 'NOGO')).score().success).toBe(false);
    expect(run(STANDARD, NOGO_PARAMS, 1, (s) => answerInputs(s, 1500, 'NOGO')).score().success).toBe(true);
    expect(run(STANDARD, NOGO_PARAMS, 1, (s) => answerInputs(s, 1500, 'GO')).score().success).toBe(false);
  });

  it('generates seeded readings with both GO and NO-GO consoles, unambiguous at display precision', () => {
    let go = 0;
    let nogo = 0;
    for (const seed of SEEDS)
      for (let slot = 0; slot < 4; slot++) {
        const r = readingsFor({ slot, slots: 4 }, seed, 3);
        expect(r).toHaveLength(3);
        expect(new Set(r.map((x) => x.channel)).size).toBe(3);
        for (const x of r) {
          const d = CHANNELS[x.channel]!.decimals;
          expect(Math.round(x.value * 10 ** d) / 10 ** d).toBe(x.value);
          // Never sitting exactly on a limit.
          expect(x.value === x.lo || x.value === x.hi).toBe(false);
        }
        if (rightCall(r) === 'GO') go++;
        else nogo++;
        expect(r.every(inLimits)).toBe(rightCall(r) === 'GO');
      }
    expect(go).toBeGreaterThan(20);
    expect(nogo).toBeGreaterThan(20);
  });
});

describe('MG-07 relay turn and window', () => {
  it('starts this player\'s turn slot × turnMs after the start', () => {
    expect(turnStartMs(0, 7500, 30_000)).toBe(0);
    expect(turnStartMs(2, 7500, 30_000)).toBe(15_000);
    expect(turnStartMs(3, 5000, 20_000)).toBe(15_000);
    const sim = newSim(resolveConfig({ turnMs: 6000 }, 'STANDARD', 'ENGINEER'), { slot: 2, slots: 4 }, 1, 24_000);
    expect(sim.startMs).toBe(12_000);
    // Answers before the turn are ignored.
    sim.push({ t: 11_000, k: sim.right === 'GO' ? 'go' : 'nogo' });
    sim.push({ t: 13_000, k: sim.right === 'GO' ? 'go' : 'nogo' });
    sim.finish();
    expect(sim.answerMs).toBe(1000);
    expect(sim.score().success).toBe(true);
  });

  it('without a host turnMs, shares the run equally between the slots', () => {
    const c = resolveConfig({ slot: 3, slots: 4 }, 'STANDARD', 'ENGINEER', 20_000);
    expect(c.turnMs).toBe(5000);
    expect(newSim(c, { slot: 3, slots: 4 }, 1, 20_000).startMs).toBe(15_000);
    expect(resolveConfig({ slots: 4, turnMs: 6000 }, 'STANDARD', 'ENGINEER', 20_000).turnMs).toBe(6000);
  });

  it('counts an answer exactly at the end of the window and not just after', () => {
    const p = { ...GO_PARAMS };
    expect(run(STANDARD, p, 1, (s) => [{ t: s.startMs + 5000, k: 'go' }]).score().success).toBe(true);
    const late = run(STANDARD, p, 1, (s) => [{ t: s.startMs + 5000.5, k: 'go' }]);
    expect(late.score().success).toBe(false);
    expect(late.timedOut).toBe(true);
  });

  it('reports right after the answer, and at the end of the window when there is none', () => {
    const answered = newSim(STANDARD, { slot: 1, slots: 3 }, 2, dur(3));
    answered.push({ t: answered.startMs + 1200, k: 'go' });
    answered.finish();
    expect(answered.done).toBe(true);
    expect(answered.timeMs).toBeLessThanOrEqual(answered.startMs + 1200 + 10);
    const idle = newSim(STANDARD, { slot: 1, slots: 3 }, 2, dur(3));
    idle.finish();
    expect(idle.timedOut).toBe(true);
    expect(idle.timeMs).toBeLessThan(idle.startMs + 5000 + 20);
  });

  it('takes the window, turn and readings from the host parameters', () => {
    const c = resolveConfig({ answer_window_s: 3, turnMs: 4000 }, 'STANDARD', 'ENGINEER');
    expect(c.windowMs).toBe(3000);
    expect(run(c, GO_PARAMS, 1, (s) => [{ t: s.startMs + 3000, k: 'go' }]).score().success).toBe(true);
    expect(run(c, GO_PARAMS, 1, (s) => [{ t: s.startMs + 3100, k: 'go' }]).score().success).toBe(false);
    expect(resolveConfig({ readings_per_console: 4 }, 'STANDARD', 'ENGINEER').readings).toBe(4);
    expect(readingsFor({ slot: 0 }, 9, 4)).toHaveLength(4);
    expect(resolveConfig({ answer_window_s: 'soon' }, 'STANDARD', 'ENGINEER').windowMs).toBe(DEFAULTS.answer_window_s * 1000);
  });
});

describe('MG-07 modes and difficulty', () => {
  it('Relaxed gives more time, but never more than the turn', () => {
    const relaxed = resolveConfig({}, 'RELAXED', 'ENGINEER');
    expect(relaxed.windowMs).toBe(7500);
    expect(run(relaxed, GO_PARAMS, 1, (s) => [{ t: s.startMs + 6500, k: 'go' }]).score().success).toBe(true);
    expect(run(STANDARD, GO_PARAMS, 1, (s) => [{ t: s.startMs + 6500, k: 'go' }]).score().success).toBe(false);
    expect(resolveConfig({ turnMs: 5000 }, 'RELAXED', 'ENGINEER').windowMs).toBe(5000);
  });

  it('Cadet gets more time and the gauges; Flight Director less time and numbers only', () => {
    const cadet = resolveConfig({}, 'STANDARD', 'CADET');
    const fd = resolveConfig({}, 'STANDARD', 'FLIGHT_DIRECTOR');
    expect(cadet.windowMs).toBeGreaterThan(STANDARD.windowMs);
    expect(fd.windowMs).toBeLessThan(STANDARD.windowMs);
    expect(fd.showGauges).toBe(false);
    expect(cadet.showGauges).toBe(true);
    expect(run(fd, GO_PARAMS, 1, (s) => [{ t: s.startMs + 4500, k: 'go' }]).score().success).toBe(false);
    expect(run(cadet, GO_PARAMS, 1, (s) => [{ t: s.startMs + 6000, k: 'go' }]).score().success).toBe(true);
  });
});

describe('MG-07 determinism', () => {
  it('gives the same readings and result for the same seed, slot and answer', () => {
    expect(readingsFor({ slot: 2 }, 44, 3)).toEqual(readingsFor({ slot: 2 }, 44, 3));
    expect(readingsFor({ slot: 2 }, 44, 3)).not.toEqual(readingsFor({ slot: 1 }, 44, 3));
    const a = run(STANDARD, { slot: 1, slots: 2 }, 44, (s) => answerInputs(s, 2222));
    const b = run(STANDARD, { slot: 1, slots: 2 }, 44, (s) => answerInputs(s, 2222));
    expect(a.score()).toEqual(b.score());
  });

  it('judges the answer by its time stamp whatever the frames', () => {
    const params = { slot: 1, slots: 2 };
    const make = () => newSim(STANDARD, params, 8, dur(2));
    const inputs = answerInputs(make(), 4999);
    const results = [() => 16.7, () => 33.3, (i: number) => (i % 3 ? 4 : 250)].map((f) => feedFrames(make(), inputs, f));
    for (const r of results) expect(r.score()).toEqual(results[0]!.score());
    expect(results[0]!.score().success).toBe(true);
    // Delivered late (after the deadline frame): the reported result (replay) is unchanged.
    const late = make();
    late.advanceTo(inputs[0]!.t + 40);
    expect(replay(make, [inputs[0]!]).score()).toEqual(results[0]!.score());
  });
});

describe('MG-07 play', () => {
  const modes: MinigameMode[] = ['STANDARD', 'RELAXED', 'ONE_BUTTON'];
  const assists: AssistLevel[] = ['CADET', 'ENGINEER', 'FLIGHT_DIRECTOR'];
  for (const mode of modes)
    for (const assist of assists)
      it(`a good player succeeds on 20+ seeds (${mode}, ${assist})`, () => {
        const c = resolveConfig({}, mode, assist);
        let ok = 0;
        for (const seed of SEEDS) {
          const params = { slot: seed % 4, slots: 4 };
          if (run(c, params, seed, (s) => answerInputs(s, 1800 + (seed % 700))).score().success) ok++;
        }
        expect(ok).toBeGreaterThanOrEqual(20);
      });

  it('an idle player fails in every mode', () => {
    for (const mode of modes) for (const seed of SEEDS.slice(0, 5)) expect(run(resolveConfig({}, mode, 'ENGINEER'), { slot: 1, slots: 2 }, seed, () => []).score().success).toBe(false);
  });

  it('one button: the press takes the highlighted answer', () => {
    const one = resolveConfig({}, 'ONE_BUTTON', 'ENGINEER');
    const go = run(one, GO_PARAMS, 1, (s) => [{ t: s.startMs + 200, k: 'p' }]);
    expect(go.answer).toBe('GO');
    expect(go.score().success).toBe(true);
    const nogo = run(one, GO_PARAMS, 1, (s) => [{ t: s.startMs + one.highlightMs + 200, k: 'p' }]);
    expect(nogo.answer).toBe('NOGO');
    expect(nogo.score().success).toBe(false);
    // Two-button kinds do nothing in one-button mode, and the other way round.
    expect(run(one, GO_PARAMS, 1, (s) => [{ t: s.startMs + 200, k: 'go' }]).answer).toBeNull();
    expect(run(STANDARD, GO_PARAMS, 1, (s) => [{ t: s.startMs + 200, k: 'p' }]).answer).toBeNull();
    expect(run(one, NOGO_PARAMS, 1, (s) => answerInputs(s, 0)).score().success).toBe(true);
  });

  it('is perfect for a right call in the first half of the window; perfect implies success', () => {
    expect(run(STANDARD, GO_PARAMS, 1, (s) => [{ t: s.startMs + 2500, k: 'go' }]).score()).toMatchObject({ success: true, perfect: true });
    expect(run(STANDARD, GO_PARAMS, 1, (s) => [{ t: s.startMs + 2600, k: 'go' }]).score()).toMatchObject({ success: true, perfect: false });
    expect(run(STANDARD, GO_PARAMS, 1, (s) => [{ t: s.startMs + 100, k: 'nogo' }]).score()).toMatchObject({ success: false, perfect: false });
  });
});
