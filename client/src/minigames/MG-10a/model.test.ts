import { describe, expect, it } from 'vitest';
import type { AssistLevel, MinigameMode } from '@protocol';
import { feedFrames, replay, type SimInput } from '../MG-09/shared/core';
import { createPlan, DEFAULTS, newSim, resolveConfig, scoreTaps, SEP_DELAY_S, tapInputs, type Mg10aConfig, type Mg10aSim } from './model';

const DUR = 10_000;
const SEEDS = Array.from({ length: 24 }, (_, i) => 11 + i * 104729);
const STANDARD = resolveConfig({}, 'STANDARD', 'ENGINEER');
const P = { slot: 0, slots: 4 };

function run(config: Mg10aConfig, seed: number, inputs: (sim: Mg10aSim) => SimInput[], params = P) {
  const sim = newSim(config, params, seed, DUR);
  for (const i of inputs(sim)) sim.push(i);
  sim.finish();
  return sim;
}

/** Exact (unrounded) tap times, for the edge tests. */
const exact = (sepDt: number, ignDt: number) => (sim: Mg10aSim): SimInput[] => [
  { t: (sim.plan.sepS + sepDt) * 1000, k: 'sep' },
  { t: (sim.plan.ignS + ignDt) * 1000, k: 'ign' },
];

describe('MG-10a timing windows', () => {
  it('uses the data half-width of 0.3 s', () => {
    expect(STANDARD.windowS).toBe(DEFAULTS.tap_window_s);
    expect(STANDARD.perfectWindowS).toBe(0.1);
  });

  it('counts taps exactly on the window edges and fails just past them', () => {
    for (const seed of SEEDS.slice(0, 5)) {
      expect(run(STANDARD, seed, exact(0.3, -0.3)).score().success).toBe(true);
      expect(run(STANDARD, seed, exact(-0.3, 0.3)).score().success).toBe(true);
      expect(run(STANDARD, seed, exact(0.3001, 0)).score().success).toBe(false);
      expect(run(STANDARD, seed, exact(0, -0.3001)).score().success).toBe(false);
      expect(run(STANDARD, seed, exact(0, 0.3001)).score().success).toBe(false);
    }
  });

  it('is perfect within ±0.1 s on both taps, and perfect implies success', () => {
    expect(run(STANDARD, 3, exact(0.1, -0.1)).score()).toMatchObject({ success: true, perfect: true });
    expect(run(STANDARD, 3, exact(0.1001, 0)).score()).toMatchObject({ success: true, perfect: false });
    for (const a of [-0.4, -0.2, 0, 0.05, 0.2, 0.35])
      for (const b of [-0.35, -0.1, 0, 0.1, 0.25]) {
        const s = scoreTaps({ dtS: a, ok: true }, { dtS: b, ok: true }, STANDARD);
        if (s.perfect) expect(s.success).toBe(true);
      }
  });

  it('takes the windows from the host parameters', () => {
    const wide = resolveConfig({ tap_window_s: 0.6, perfect_window_s: 0.2 }, 'STANDARD', 'ENGINEER');
    expect(run(wide, 5, exact(0.55, -0.55)).score().success).toBe(true);
    expect(run(wide, 5, exact(0.2, 0.2)).score().perfect).toBe(true);
    expect(resolveConfig({ tap_window_s: 'x' }, 'STANDARD', 'ENGINEER').windowS).toBe(0.3);
  });

  it('scores 1 on the moment, less further off, 0 when missed', () => {
    expect(run(STANDARD, 7, exact(0, 0)).score().score).toBeCloseTo(1, 6);
    expect(run(STANDARD, 7, exact(0.15, 0.15)).score().score).toBeCloseTo(0.75, 6);
    expect(run(STANDARD, 7, () => []).score().score).toBe(0);
  });
});

describe('MG-10a sequence', () => {
  it('puts SEPARATE just after cutoff and IGNITE after the settling time, inside the play time', () => {
    for (const seed of SEEDS) {
      const p = createPlan(seed, 10, 4, 0);
      expect(p.sepS - p.cutoffS).toBeCloseTo(SEP_DELAY_S, 9);
      expect(p.settleS).toBeGreaterThanOrEqual(1.8);
      expect(p.ignS).toBeCloseTo(p.sepS + p.settleS, 9);
      expect(p.ignS + 0.5 + 0.2 + 1.2).toBeLessThanOrEqual(10);
      expect(p.crew).toHaveLength(3);
    }
    // A shorter host run still fits.
    const short = createPlan(1, 6, 1, 0);
    expect(short.ignS + 0.5).toBeLessThanOrEqual(6);
  });

  it('ignores SEPARATE before cutoff and IGNITE before separation', () => {
    const sim = run(STANDARD, 9, (s) => [
      { t: (s.plan.cutoffS - 0.5) * 1000, k: 'sep' },
      { t: (s.plan.cutoffS - 0.2) * 1000, k: 'ign' },
      ...exact(0.02, 0.02)(s),
    ]);
    expect(sim.ignoredTaps).toBe(2);
    expect(sim.score().success).toBe(true);
  });

  it('judges only the first tap of each step: mashing after cutoff fails', () => {
    const sim = run(STANDARD, 9, (s) => {
      const out: SimInput[] = [];
      for (let t = s.plan.cutoffS * 1000; t < s.plan.ignS * 1000 + 600; t += 90) out.push({ t, k: 'sep' }, { t: t + 45, k: 'ign' });
      return out;
    });
    expect(sim.sep!.dtS).toBeLessThan(-0.3);
    expect(sim.score().success).toBe(false);
  });

  it('backs up a missed separation and still lets the player ignite', () => {
    const sim = run(STANDARD, 4, (s) => [{ t: s.plan.ignS * 1000, k: 'ign' }]);
    expect(sim.sep).toBeNull();
    expect(sim.ign!.ok).toBe(true);
    expect(sim.score().success).toBe(false);
  });

  it('ends after the ignition and its result, before the time is up', () => {
    const sim = run(STANDARD, 4, exact(0, 0));
    expect(sim.done).toBe(true);
    expect(sim.timeMs).toBeLessThan(DUR);
  });
});

describe('MG-10a modes and difficulty', () => {
  it('Relaxed has a wider window (0.5 s); Cadet wider, Flight Director narrower', () => {
    const relaxed = resolveConfig({}, 'RELAXED', 'ENGINEER');
    expect(relaxed.windowS).toBeCloseTo(0.5, 9);
    expect(run(relaxed, 2, exact(0.45, -0.45)).score().success).toBe(true);
    expect(run(STANDARD, 2, exact(0.45, -0.45)).score().success).toBe(false);
    const cadet = resolveConfig({}, 'STANDARD', 'CADET');
    const fd = resolveConfig({}, 'STANDARD', 'FLIGHT_DIRECTOR');
    expect(cadet.windowS).toBeGreaterThan(STANDARD.windowS);
    expect(fd.windowS).toBeLessThan(STANDARD.windowS);
    expect(run(cadet, 2, exact(0.35, 0)).score().success).toBe(true);
    expect(run(fd, 2, exact(0.27, 0)).score().success).toBe(false);
  });
});

describe('MG-10a determinism', () => {
  it('gives the identical plan and result for the same seed and taps', () => {
    expect(createPlan(77, 10, 4, 1)).toEqual(createPlan(77, 10, 4, 1));
    expect(createPlan(77, 10, 4, 1).cutoffS).not.toBe(createPlan(78, 10, 4, 1).cutoffS);
    // Every phone shares the timeline; only the seeded crew depends on the slot.
    expect(createPlan(77, 10, 4, 1).sepS).toBe(createPlan(77, 10, 4, 2).sepS);
    expect(run(STANDARD, 77, (s) => tapInputs(s, 0.13, -0.07)).score()).toEqual(run(STANDARD, 77, (s) => tapInputs(s, 0.13, -0.07)).score());
  });

  it('gives the identical result whatever the frame time stamps, given the same tap time stamps', () => {
    const taps = tapInputs(newSim(STANDARD, P, 31, DUR), 0.21, -0.18);
    const frames = [() => 1000 / 60, () => 1000 / 30, (i: number) => (i % 5 === 0 ? 210 : 7.1)];
    const results = frames.map((f) => feedFrames(newSim(STANDARD, P, 31, DUR), taps, f));
    for (const r of results) {
      expect(r.score()).toEqual(results[0]!.score());
      expect(r.sep).toEqual(results[0]!.sep);
    }
    // Taps delivered after a slow frame (140 ms late, past the window edge in the live run) are
    // still judged by their stamps in the reported result, which is the replay of the log.
    const late = newSim(STANDARD, P, 31, DUR);
    late.advanceTo(taps[0]!.t + 140);
    late.push(taps[0]!);
    late.advanceTo(taps[1]!.t + 140);
    late.push(taps[1]!);
    late.finish();
    expect(late.score()).toEqual(results[0]!.score());
    expect(replay(() => newSim(STANDARD, P, 31, DUR), late.log).score()).toEqual(results[0]!.score());
  });
});

describe('MG-10a play', () => {
  const modes: MinigameMode[] = ['STANDARD', 'RELAXED', 'ONE_BUTTON'];
  const assists: AssistLevel[] = ['CADET', 'ENGINEER', 'FLIGHT_DIRECTOR'];
  for (const mode of modes)
    for (const assist of assists)
      it(`a good player succeeds on 20+ seeds (${mode}, ${assist})`, () => {
        const c = resolveConfig({}, mode, assist);
        // Reacts 0.12–0.2 s after each moment (a human reaction to the green light).
        const ok = SEEDS.filter((s) => run(c, s, (sim) => tapInputs(sim, 0.12 + (s % 9) / 100, 0.1 - (s % 7) / 100)).score().success).length;
        expect(ok).toBeGreaterThanOrEqual(20);
      });

  it('an idle player fails in every mode', () => {
    for (const mode of modes) for (const seed of SEEDS.slice(0, 5)) expect(run(resolveConfig({}, mode, 'ENGINEER'), seed, () => []).score().success).toBe(false);
  });

  it('one button: the first press separates, the second ignites; button kinds of the other mode are ignored', () => {
    const one = resolveConfig({}, 'ONE_BUTTON', 'ENGINEER');
    const sim = run(one, 12, (s) => tapInputs(s, 0.04, 0.06));
    expect(sim.sep!.ok && sim.ign!.ok).toBe(true);
    expect(sim.score().success).toBe(true);
    expect(run(one, 12, exact(0, 0)).score().success).toBe(false);
    expect(run(STANDARD, 12, (s) => [{ t: s.plan.sepS * 1000, k: 'p' }]).sep).toBeNull();
  });
});
