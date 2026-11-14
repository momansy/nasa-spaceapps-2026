import { describe, expect, it } from 'vitest';
import type { AssistLevel, MinigameMode } from '@protocol';
import { feedFrames, replay, type SimInput } from '../MG-09/shared/core';
import { bandOf, DEFAULTS, newSim, phaseOf, resolveConfig, scoreFill, scriptedHold, scriptedValve, VALVE_STEPS, type Mg08bConfig } from './model';

const DUR = 20_000;
const SEEDS = Array.from({ length: 24 }, (_, i) => 3 + i * 2654435);
const STANDARD = resolveConfig({}, 'STANDARD', 'ENGINEER');

type Make = () => ReturnType<typeof newSim>;

function run(config: Mg08bConfig, seed: number, inputs: SimInput[] | ((make: Make) => SimInput[])) {
  const make = () => newSim(config, seed, DUR);
  const list = typeof inputs === 'function' ? inputs(make) : inputs;
  return replay(make, list);
}

const good = (c: Mg08bConfig) => (make: Make) => (c.oneButton ? scriptedHold(make) : scriptedValve(make));

describe('MG-08b scoring', () => {
  it('succeeds at exactly 99 % without overpressure and fails just below', () => {
    expect(scoreFill(0.99, false, 0.5, 0.72, STANDARD).success).toBe(true);
    expect(scoreFill(0.9899, false, 0.5, 0.72, STANDARD).success).toBe(false);
    expect(scoreFill(1, true, 1, 0.72, STANDARD).success).toBe(false);
  });

  it('is perfect with 70 % of the time in band, and perfect implies success', () => {
    expect(scoreFill(0.995, false, 0.7, 0.72, STANDARD)).toMatchObject({ success: true, perfect: true });
    expect(scoreFill(0.995, false, 0.69, 0.72, STANDARD).perfect).toBe(false);
    expect(scoreFill(0.98, false, 1, 0.72, STANDARD).perfect).toBe(false);
    expect(scoreFill(1, true, 1, 0.72, STANDARD).perfect).toBe(false);
  });

  it('takes the thresholds from the host parameters', () => {
    const c = resolveConfig({ fill_fraction_min: 0.95, overpressure_allowed: true }, 'STANDARD', 'ENGINEER');
    expect(scoreFill(0.95, false, 0, 0.7, c).success).toBe(true);
    expect(scoreFill(0.949, false, 0, 0.7, c).success).toBe(false);
    expect(scoreFill(1, true, 0, 0.7, c).success).toBe(true);
    expect(resolveConfig({ fill_fraction_min: 'full' }, 'STANDARD', 'ENGINEER').fillMin).toBe(DEFAULTS.fill_fraction_min);
  });

  it('scores higher for more of the tank and more time in band', () => {
    expect(scoreFill(0.995, false, 0.9, 0.72, STANDARD).score).toBeGreaterThan(scoreFill(0.995, false, 0.4, 0.72, STANDARD).score);
    expect(scoreFill(0.9, false, 0, 0.72, STANDARD).score).toBeGreaterThan(scoreFill(0.8, false, 0, 0.72, STANDARD).score);
  });
});

describe('MG-08b tank', () => {
  it('has fast fill, slow fill and topping phases with their bands', () => {
    expect(phaseOf(0.8, STANDARD)).toBe('fast');
    expect(phaseOf(0.93, STANDARD)).toBe('slow');
    expect(phaseOf(0.985, STANDARD)).toBe('slow');
    expect(phaseOf(0.99, STANDARD)).toBe('top');
    const top = bandOf('top', STANDARD);
    expect(top.lo).toBeLessThan(0);
    expect(top.hi).toBeGreaterThan(0);
  });

  it('boils off with the valve closed', () => {
    const sim = run(STANDARD, 1, []);
    expect(sim.level).toBeLessThan(sim.level0);
    expect(sim.score().success).toBe(false);
  });

  it('overpressures when the valve stays open at the relief level', () => {
    const sim = run(STANDARD, 1, [{ t: 0, k: 's', v: VALVE_STEPS }]);
    expect(sim.overpressure).toBe(true);
    expect(sim.level).toBeLessThanOrEqual(1);
    expect(sim.score().success).toBe(false);
  });

  it('a valve closed just before the relief level does not overpressure', () => {
    const sim = newSim(STANDARD, 2, DUR);
    sim.push({ t: 0, k: 's', v: 5 });
    let t = 0;
    while (sim.level < 0.985 && !sim.done) sim.advanceTo((t += 10));
    sim.push({ t, k: 's', v: 0 });
    sim.finish();
    expect(sim.overpressure).toBe(false);
  });
});

describe('MG-08b modes and difficulty', () => {
  it('Relaxed: wider band, slower boil-off', () => {
    const r = resolveConfig({}, 'RELAXED', 'ENGINEER');
    const w = (c: Mg08bConfig) => bandOf('slow', c).hi - bandOf('slow', c).lo;
    expect(w(r)).toBeGreaterThan(w(STANDARD));
    expect(r.boilScale).toBeLessThan(STANDARD.boilScale);
    // A player who leaves the valve at 2 steps tops up further where boil-off is slow.
    const lazy = (c: Mg08bConfig) => SEEDS.map((s) => run(c, s, [{ t: 0, k: 's', v: 2 }]).level);
    const avg = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
    expect(avg(lazy(r))).toBeGreaterThan(avg(lazy(STANDARD)));
  });

  it('Cadet is easier and Flight Director harder', () => {
    const cadet = resolveConfig({}, 'STANDARD', 'CADET');
    const fd = resolveConfig({}, 'STANDARD', 'FLIGHT_DIRECTOR');
    expect(cadet.boilScale).toBeLessThan(1);
    expect(fd.boilScale).toBeGreaterThan(1);
    const w = (c: Mg08bConfig) => bandOf('fast', c).hi - bandOf('fast', c).lo;
    expect(w(cadet)).toBeGreaterThan(w(STANDARD));
    expect(w(fd)).toBeLessThan(w(STANDARD));
    const inBand = (c: Mg08bConfig) => SEEDS.slice(0, 8).reduce((acc, s) => acc + run(c, s, good(c)).inBandSteps, 0);
    expect(inBand(cadet)).toBeGreaterThan(inBand(fd));
  });
});

describe('MG-08b determinism', () => {
  it('repeats exactly for the same seed and inputs', () => {
    const a = run(STANDARD, 99, good(STANDARD));
    const b = run(STANDARD, 99, good(STANDARD));
    expect(Array.from(a.levelHistory)).toEqual(Array.from(b.levelHistory));
    expect(a.score()).toEqual(b.score());
    expect(newSim(STANDARD, 1, DUR).level0).not.toBe(newSim(STANDARD, 2, DUR).level0);
  });

  it('does not depend on the frame rate', () => {
    const inputs = scriptedValve(() => newSim(STANDARD, 5, DUR), 230, 90);
    const live = (f: (i: number) => number) => feedFrames(newSim(STANDARD, 5, DUR), inputs, f);
    const a = live(() => 1000 / 60);
    const b = live(() => 1000 / 30);
    const c = live((i) => (i % 4 ? 5 : 160));
    expect(Array.from(b.levelHistory)).toEqual(Array.from(a.levelHistory));
    expect(Array.from(c.levelHistory)).toEqual(Array.from(a.levelHistory));
    expect(c.score()).toEqual(a.score());
  });
});

describe('MG-08b play', () => {
  const modes: MinigameMode[] = ['STANDARD', 'RELAXED', 'ONE_BUTTON'];
  const assists: AssistLevel[] = ['CADET', 'ENGINEER', 'FLIGHT_DIRECTOR'];
  for (const mode of modes)
    for (const assist of assists)
      it(`a good player succeeds on 20+ seeds (${mode}, ${assist})`, () => {
        const c = resolveConfig({}, mode, assist);
        const ok = SEEDS.filter((s) => run(c, s, good(c)).score().success).length;
        expect(ok).toBeGreaterThanOrEqual(20);
      });

  it('an idle player fails in every mode', () => {
    for (const mode of modes) for (const s of SEEDS.slice(0, 5)) expect(run(resolveConfig({}, mode, 'ENGINEER'), s, []).score().success).toBe(false);
  });

  it('one button: holding all the time overpressures, never holding underfills, hold-to-toggle works', () => {
    const one = resolveConfig({}, 'ONE_BUTTON', 'ENGINEER');
    expect(run(one, 4, [{ t: 0, k: 'h', v: 1 }]).overpressure).toBe(true);
    expect(run(one, 4, []).score().success).toBe(false);
    const toggle = resolveConfig({ hold_to_toggle: true }, 'ONE_BUTTON', 'ENGINEER');
    expect(toggle.holdToToggle).toBe(true);
    const sim = run(toggle, 4, [
      { t: 0, k: 'h', v: 1 },
      { t: 50, k: 'h', v: 0 },
    ]);
    // One tap latched the valve open: it filled and overpressured.
    expect(sim.overpressure).toBe(true);
    expect(SEEDS.filter((s) => run(toggle, s, (m) => scriptedHold(m)).score().success).length).toBeGreaterThanOrEqual(20);
    // Valve taps do nothing in one-button mode.
    expect(run(one, 4, [{ t: 0, k: 's', v: 6 }]).overpressure).toBe(false);
  });

  it('a good player is usually perfect too, and perfect implies success', () => {
    let perfect = 0;
    for (const s of SEEDS) {
      const r = run(STANDARD, s, good(STANDARD)).score();
      if (r.perfect) {
        perfect++;
        expect(r.success).toBe(true);
      }
    }
    expect(perfect).toBeGreaterThan(SEEDS.length / 2);
  });
});
