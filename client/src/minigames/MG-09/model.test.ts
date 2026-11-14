import { describe, expect, it } from 'vitest';
import type { AssistLevel, MinigameMode } from '@protocol';
import { feedFrames, playFrames, replay, STEP_HZ, type SimInput } from './shared/core';
import { createCurve, cueInputs, DEFAULTS, integrateTurn, newSim, resolveConfig, scoreMean, solveKick, tracerInputs, type Mg09Config } from './model';

const DUR_MS = 25_000;
const SEEDS = Array.from({ length: 24 }, (_, i) => 1 + i * 7919);
const STANDARD = resolveConfig({}, 'STANDARD', 'ENGINEER');

function run(config: Mg09Config, seed: number, inputs: (sim: ReturnType<typeof newSim>) => SimInput[]) {
  const sim = newSim(config, seed, DUR_MS);
  for (const i of inputs(sim)) sim.push(i);
  sim.finish();
  return sim;
}

describe('MG-09 scoring', () => {
  it('succeeds at exactly the threshold and fails just past it', () => {
    expect(scoreMean(DEFAULTS.deviation_max_deg, STANDARD).success).toBe(true);
    expect(scoreMean(DEFAULTS.deviation_max_deg + 0.001, STANDARD).success).toBe(false);
  });

  it('is perfect at the perfect threshold, and perfect implies success', () => {
    expect(scoreMean(1.5, STANDARD)).toMatchObject({ success: true, perfect: true });
    expect(scoreMean(1.501, STANDARD).perfect).toBe(false);
    for (let e = 0; e <= 20; e += 0.25) {
      const s = scoreMean(e, STANDARD);
      if (s.perfect) expect(s.success).toBe(true);
    }
  });

  it('reports the mean flight-path-angle error in degrees as value, and a score that falls with it', () => {
    expect(scoreMean(3.456, STANDARD).value).toBe(3.46);
    expect(scoreMean(0, STANDARD).score).toBe(1);
    expect(scoreMean(2, STANDARD).score).toBeGreaterThan(scoreMean(3.5, STANDARD).score);
    expect(scoreMean(30, STANDARD).score).toBe(0);
    expect(scoreMean(3.456, STANDARD).value).toBe(3.46);
  });

  it('takes the thresholds from the host parameters', () => {
    const c = resolveConfig({ deviation_max_deg: 10, perfect_deviation_max_deg: 4 }, 'STANDARD', 'ENGINEER');
    expect(scoreMean(10, c).success).toBe(true);
    expect(scoreMean(10.01, c).success).toBe(false);
    expect(scoreMean(4, c).perfect).toBe(true);
    // A perfect threshold above the success threshold is lowered to it; junk is ignored.
    expect(resolveConfig({ deviation_max_deg: 3, perfect_deviation_max_deg: 9 }, 'STANDARD', 'ENGINEER').perfectDeviationMaxDeg).toBe(3);
    expect(resolveConfig({ deviation_max_deg: 'big' }, 'STANDARD', 'ENGINEER').deviationMaxDeg).toBe(4);
  });
});

describe('MG-09 ascent curve', () => {
  it('is a gravity turn: vertical rise, pitch-over, then the angle eases toward horizontal', () => {
    for (const seed of SEEDS.slice(0, 6)) {
      const c = createCurve(STANDARD, seed, 25);
      expect(c.gammaDeg[0]).toBe(90);
      expect(c.gammaDeg[c.steps]).toBeGreaterThan(10);
      expect(c.gammaDeg[c.steps]).toBeLessThan(35);
      expect(c.hKm[c.steps]).toBeGreaterThan(30);
      expect(c.xKm[c.steps]).toBeGreaterThan(c.xKm[c.steps / 2]!);
      expect(c.cuesS.length).toBeGreaterThanOrEqual(8);
    }
  });

  it('solves the kick so the turn ends at the seeded angle', () => {
    const kick = solveKick(1.5, 8, 22);
    const pts = integrateTurn(1.5, 8, kick, 10);
    expect(pts[pts.length - 1]!.gammaDeg).toBeCloseTo(22, 1);
    // Gravity alone bends the path after the kick: the angle only falls (no bumps here).
    for (let i = 1; i < pts.length; i++) expect(pts[i]!.gammaDeg).toBeLessThanOrEqual(pts[i - 1]!.gammaDeg + 1e-9);
  });

  it('differs between seeds and repeats for the same seed', () => {
    const a = createCurve(STANDARD, 5, 25);
    const b = createCurve(STANDARD, 6, 25);
    const a2 = createCurve(STANDARD, 5, 25);
    expect(Array.from(a.gammaDeg)).toEqual(Array.from(a2.gammaDeg));
    expect(a.gammaDeg[1500]).not.toBe(b.gammaDeg[1500]);
  });
});

describe('MG-09 modes and difficulty', () => {
  it('makes Relaxed easier: larger allowed deviation, slower scroll, smaller corrections', () => {
    const r = resolveConfig({}, 'RELAXED', 'ENGINEER');
    expect(r.deviationMaxDeg).toBeGreaterThan(STANDARD.deviationMaxDeg);
    expect(r.laneSpanS).toBeGreaterThan(STANDARD.laneSpanS);
    expect(r.bumpScale).toBeLessThan(STANDARD.bumpScale);
    // A late, wobbly tracer fails more seeds in Standard than in Relaxed.
    const sloppy = (sim: ReturnType<typeof newSim>) => tracerInputs(sim, { leadS: -1.2, wobbleDeg: 4 });
    const wins = (c: Mg09Config) => SEEDS.filter((s) => run(c, s, sloppy).score().success).length;
    expect(wins(r)).toBeGreaterThan(wins(STANDARD));
  });

  it('scales with difficulty: Cadet sees further ahead, Flight Director less, with larger corrections', () => {
    const cadet = resolveConfig({}, 'STANDARD', 'CADET');
    const fd = resolveConfig({}, 'STANDARD', 'FLIGHT_DIRECTOR');
    expect(cadet.guideAheadS).toBeGreaterThan(STANDARD.guideAheadS);
    expect(fd.guideAheadS).toBeLessThan(STANDARD.guideAheadS);
    expect(fd.cueWindowS).toBeLessThan(STANDARD.cueWindowS);
    expect(cadet.cueWindowS).toBeGreaterThan(STANDARD.cueWindowS);
    const late = (sim: ReturnType<typeof newSim>) => tracerInputs(sim, { leadS: -0.6 });
    const mean = (c: Mg09Config) => SEEDS.reduce((acc, s) => acc + run(c, s, late).score().value, 0);
    expect(mean(cadet)).toBeLessThan(mean(STANDARD));
    expect(mean(fd)).toBeGreaterThan(mean(STANDARD));
  });
});

describe('MG-09 determinism', () => {
  it('gives the identical run for the same seed and inputs', () => {
    const a = run(STANDARD, 2026, (s) => tracerInputs(s, { leadS: -0.3, wobbleDeg: 2 }));
    const b = run(STANDARD, 2026, (s) => tracerInputs(s, { leadS: -0.3, wobbleDeg: 2 }));
    expect(Array.from(a.trace)).toEqual(Array.from(b.trace));
    expect(a.score()).toEqual(b.score());
  });

  it('does not depend on the frame rate, given the same input time stamps', () => {
    const inputs = tracerInputs(newSim(STANDARD, 77, DUR_MS), { leadS: -0.25, wobbleDeg: 3, everyMs: 37, untilMs: 24_500 });
    const live = (frame: (i: number) => number) => feedFrames(newSim(STANDARD, 77, DUR_MS), inputs, frame);
    const a = live(() => 1000 / 60);
    const b = live(() => 1000 / 30);
    const c = live((i) => (i % 7 === 0 ? 120 : 9.3));
    expect(a.score()).toEqual(b.score());
    expect(a.score()).toEqual(c.score());
    expect(Array.from(a.errHistory)).toEqual(Array.from(c.errHistory));
    // Late inputs (a slow frame already simulated past them) cannot change the reported result:
    // it is the replay of the log.
    const late = playFrames(newSim(STANDARD, 77, DUR_MS), 120, (_s, now) => inputs.filter((x) => x.t >= now - 120 && x.t < now));
    expect(replay(() => newSim(STANDARD, 77, DUR_MS), late.log).score()).toEqual(a.score());
  });

  it('runs exactly 120 steps per second of play', () => {
    const sim = newSim(STANDARD, 1, DUR_MS);
    sim.finish();
    expect(sim.step).toBe(25 * STEP_HZ);
  });
});

describe('MG-09 play', () => {
  const modes: MinigameMode[] = ['STANDARD', 'RELAXED', 'ONE_BUTTON'];
  const assists: AssistLevel[] = ['CADET', 'ENGINEER', 'FLIGHT_DIRECTOR'];

  for (const mode of modes)
    for (const assist of assists)
      it(`a good player succeeds on 20+ seeds (${mode}, ${assist})`, () => {
        const c = resolveConfig({}, mode, assist);
        const good = (sim: ReturnType<typeof newSim>) => (mode === 'ONE_BUTTON' ? cueInputs(sim, 0.12) : tracerInputs(sim, { leadS: -0.2, wobbleDeg: 1.5 }));
        const ok = SEEDS.filter((s) => run(c, s, good).score().success).length;
        expect(ok).toBeGreaterThanOrEqual(20);
      });

  it('an idle player fails in every mode', () => {
    for (const mode of modes) {
      const c = resolveConfig({}, mode, 'ENGINEER');
      for (const seed of SEEDS.slice(0, 5)) expect(run(c, seed, () => []).score().success).toBe(false);
    }
  });

  it('one button: hitting every cue succeeds, mashing between cues does not help, missing them fails', () => {
    const c = resolveConfig({}, 'ONE_BUTTON', 'ENGINEER');
    const hit = run(c, 9, (s) => cueInputs(s, 0));
    expect(hit.score().success).toBe(true);
    expect(Array.from(hit.cueHit).every((h) => h === 1)).toBe(true);
    const offBeat = run(c, 9, (s) => s.curve.cuesS.map((q) => ({ t: Math.round((q + 1.2) * 1000), k: 'p' })));
    expect(offBeat.score().success).toBe(false);
    // Pressing every 0.3 s hits every cue but jolts the marker between them: it fails.
    const mash = run(c, 9, () => Array.from({ length: 83 }, (_, i) => ({ t: 300 * i, k: 'p' })));
    expect(mash.wildPresses).toBeGreaterThan(30);
    expect(mash.score().success).toBe(false);
    // Presses in the standard mode do nothing; drags do nothing in one-button mode.
    const drag = run(c, 9, (s) => tracerInputs(s));
    expect(drag.score().success).toBe(false);
  });

  it('a careful tracer is perfect, and the trace and path are recorded', () => {
    const sim = run(STANDARD, 4, (s) => tracerInputs(s, { leadS: 0.02, everyMs: 20 }));
    expect(sim.score().perfect).toBe(true);
    expect(sim.score().success).toBe(true);
    expect(sim.phKm[sim.totalSteps]).toBeGreaterThan(20);
  });
});
