import { describe, expect, it } from 'vitest';
import type { AssistLevel, MinigameMode } from '@protocol';
import { feedFrames, replay, type SimInput } from '../MG-09/shared/core';
import { beatInputs, DEFAULTS, newSim, resolveConfig, scoreBeats, type Mg11Config, type Mg11Sim } from './model';

const DUR = 15_000;
const SEEDS = Array.from({ length: 24 }, (_, i) => 17 + i * 7777);
const STANDARD = resolveConfig({}, 'STANDARD', 'ENGINEER');
const P = { slot: 0, slots: 4 };

function run(c: Mg11Config, seed: number, inputs: (s: Mg11Sim) => SimInput[]) {
  return replay(() => newSim(c, P, seed, DUR), inputs(newSim(c, P, seed, DUR)));
}

describe('MG-11 scoring', () => {
  it('succeeds at exactly 70 % of beats and fails one beat below', () => {
    expect(scoreBeats(7, 10, STANDARD).success).toBe(true);
    expect(scoreBeats(6, 10, STANDARD).success).toBe(false);
    expect(scoreBeats(14, 20, STANDARD).success).toBe(true);
    expect(scoreBeats(13, 20, STANDARD).success).toBe(false);
  });

  it('is perfect from 95 %, and perfect implies success', () => {
    expect(scoreBeats(19, 20, STANDARD)).toMatchObject({ success: true, perfect: true });
    expect(scoreBeats(18, 20, STANDARD).perfect).toBe(false);
    for (let g = 0; g <= 20; g++) {
      const s = scoreBeats(g, 20, STANDARD);
      if (s.perfect) expect(s.success).toBe(true);
    }
  });

  it('takes the thresholds and the window from the host parameters', () => {
    const c = resolveConfig({ counter_phase_beats_fraction_min: 0.5, beat_window_s: 0.2 }, 'STANDARD', 'ENGINEER');
    expect(scoreBeats(5, 10, c).success).toBe(true);
    expect(c.windowS).toBeCloseTo(0.2, 9);
    expect(resolveConfig({ counter_phase_beats_fraction_min: 'most' }, 'STANDARD', 'ENGINEER').successMin).toBe(DEFAULTS.counter_phase_beats_fraction_min);
  });
});

describe('MG-11 beats', () => {
  it('beats are the troughs at a tappable 1.25 Hz, inside the play time', () => {
    const sim = newSim(STANDARD, P, 1, DUR);
    expect(sim.periodS).toBeCloseTo(0.8, 9);
    expect(sim.beatsS.length).toBeGreaterThanOrEqual(15);
    for (const b of sim.beatsS) expect(sim.displacement(b)).toBeCloseTo(-1, 6);
    expect(sim.beatsS[sim.beatsS.length - 1]! + STANDARD.windowS).toBeLessThan(15);
  });

  it('counts a tap exactly on the window edge and not just past it', () => {
    const edge = (d: number) => run(STANDARD, 3, (s) => s.beatsS.map((b) => ({ t: (b + d) * 1000, k: 'p' }))).score().score;
    expect(edge(STANDARD.windowS)).toBe(1);
    expect(edge(-STANDARD.windowS)).toBe(1);
    expect(edge(STANDARD.windowS + 0.0005)).toBe(0);
  });

  it('judges the first tap of a cell: mashing fails, one tap per beat succeeds', () => {
    const mash = run(STANDARD, 5, () => {
      const out: SimInput[] = [];
      for (let t = 0; t < DUR; t += 110) out.push({ t, k: 'p' });
      return out;
    });
    expect(mash.score().success).toBe(false);
    expect(run(STANDARD, 5, (s) => beatInputs(s, 0.02)).score()).toMatchObject({ success: true, perfect: true });
  });

  it('damps faster the more of the team is in sync (seeded crew)', () => {
    const good = run(STANDARD, 6, (s) => beatInputs(s, 0));
    const idle = run(STANDARD, 6, () => []);
    expect(good.amp).toBeLessThan(idle.amp);
    const solo = replay(() => newSim(STANDARD, { slot: 0, slots: 1 }, 6, DUR), []);
    expect(solo.amp).toBeGreaterThan(1);
  });
});

describe('MG-11 modes and difficulty', () => {
  it('Relaxed is slower with a wider window', () => {
    const r = resolveConfig({}, 'RELAXED', 'ENGINEER');
    expect(r.hz).toBeLessThan(STANDARD.hz);
    expect(r.windowS).toBeGreaterThan(STANDARD.windowS);
    const sloppy = (c: Mg11Config) => SEEDS.filter((s) => run(c, s, (sim) => beatInputs(sim, 0, 0.17, 0, s)).score().success).length;
    expect(sloppy(r)).toBeGreaterThan(sloppy(STANDARD));
  });

  it('Cadet has a wider window, Flight Director a narrower one', () => {
    const cadet = resolveConfig({}, 'STANDARD', 'CADET');
    const fd = resolveConfig({}, 'STANDARD', 'FLIGHT_DIRECTOR');
    expect(cadet.windowS).toBeGreaterThan(STANDARD.windowS);
    expect(fd.windowS).toBeLessThan(STANDARD.windowS);
    const hits = (c: Mg11Config) => SEEDS.reduce((a, s) => a + run(c, s, (sim) => beatInputs(sim, 0, 0.13, 0, s)).score().score, 0);
    expect(hits(cadet)).toBeGreaterThan(hits(STANDARD));
    expect(hits(fd)).toBeLessThan(hits(STANDARD));
  });
});

describe('MG-11 determinism', () => {
  it('repeats for the same seed and taps', () => {
    const a = run(STANDARD, 8, (s) => beatInputs(s, 0.04, 0.08, 5, 3));
    const b = run(STANDARD, 8, (s) => beatInputs(s, 0.04, 0.08, 5, 3));
    expect(a.score()).toEqual(b.score());
    expect(Array.from(a.ampHistory)).toEqual(Array.from(b.ampHistory));
  });

  it('gives the identical result whatever the frame time stamps', () => {
    const taps = beatInputs(newSim(STANDARD, P, 9, DUR), 0.05, 0.1, 4, 2);
    const runs = [() => 16.7, () => 33.3, (i: number) => (i % 6 ? 6 : 190)].map((f) => feedFrames(newSim(STANDARD, P, 9, DUR), taps, f));
    for (const r of runs) {
      expect(r.score()).toEqual(runs[0]!.score());
      expect(Array.from(r.settled)).toEqual(Array.from(runs[0]!.settled));
    }
  });
});

describe('MG-11 play', () => {
  const modes: MinigameMode[] = ['STANDARD', 'RELAXED', 'ONE_BUTTON'];
  const assists: AssistLevel[] = ['CADET', 'ENGINEER', 'FLIGHT_DIRECTOR'];
  for (const mode of modes)
    for (const assist of assists)
      it(`a good player succeeds on 20+ seeds (${mode}, ${assist})`, () => {
        const c = resolveConfig({}, mode, assist);
        // ±60 ms timing jitter, misses one beat in eight.
        expect(SEEDS.filter((s) => run(c, s, (sim) => beatInputs(sim, 0.01, 0.06, 8, s)).score().success).length).toBeGreaterThanOrEqual(20);
      });

  it('an idle player fails in every mode', () => {
    for (const mode of modes) expect(run(resolveConfig({}, mode, 'ENGINEER'), 1, () => []).score().success).toBe(false);
  });

  it('one button is the same tap game (the whole screen is the button)', () => {
    const one = resolveConfig({}, 'ONE_BUTTON', 'ENGINEER');
    expect(one).toEqual(STANDARD);
    expect(run(one, 2, (s) => beatInputs(s, 0)).score().success).toBe(true);
  });

  it('tapping in phase with the bounce (on the crests) fails', () => {
    const crest = run(STANDARD, 4, (s) => s.beatsS.map((b) => ({ t: (b + s.periodS / 2) * 1000, k: 'p' })));
    expect(crest.score().success).toBe(false);
  });
});
