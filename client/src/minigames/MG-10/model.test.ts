import { describe, expect, it } from 'vitest';
import type { AssistLevel, MinigameMode } from '@protocol';
import { feedFrames, replay, type SimInput } from '../MG-09/shared/core';
import { DEFAULTS, newSim, resolveConfig, SCENE_HALF_M, scoreUnder, scriptedHoldBoat, scriptedSteer, type Mg10Config, type Mg10Sim } from './model';

const DUR = 20_000;
const SEEDS = Array.from({ length: 24 }, (_, i) => 31 + i * 65537);
const STANDARD = resolveConfig({}, 'STANDARD', 'ENGINEER');
const P = { slot: 0, slots: 4 };

type Make = () => Mg10Sim;
function run(c: Mg10Config, seed: number, inputs: SimInput[] | ((m: Make) => SimInput[]), params: Record<string, number | boolean> = P) {
  const make = () => newSim(c, params, seed, DUR);
  return replay(make, typeof inputs === 'function' ? inputs(make) : inputs);
}
const good = (c: Mg10Config) => (m: Make) => (c.oneButton ? scriptedHoldBoat(m) : scriptedSteer(m, 150, 0.2, 2));

describe('MG-10 scoring', () => {
  it('succeeds at exactly 70 % under the target and fails one step below', () => {
    expect(scoreUnder(1680, 2400, STANDARD).success).toBe(true);
    expect(scoreUnder(1679, 2400, STANDARD).success).toBe(false);
  });
  it('is perfect from 85 %, and perfect implies success', () => {
    expect(scoreUnder(2040, 2400, STANDARD)).toMatchObject({ success: true, perfect: true });
    expect(scoreUnder(2039, 2400, STANDARD).perfect).toBe(false);
    for (let k = 0; k <= 2400; k += 100) if (scoreUnder(k, 2400, STANDARD).perfect) expect(scoreUnder(k, 2400, STANDARD).success).toBe(true);
  });
  it('takes the thresholds from the host parameters; the refund is not a success input', () => {
    const c = resolveConfig({ under_target_fraction_min: 0.5, net_half_width_m: 20, fairing_refund_fraction_max: 0.1 }, 'STANDARD', 'ENGINEER');
    expect(scoreUnder(1200, 2400, c).success).toBe(true);
    expect(c.netHalfM).toBe(20);
    expect(resolveConfig({ fairing_refund_fraction_max: 0 }, 'STANDARD', 'ENGINEER')).toEqual(STANDARD);
    expect(resolveConfig({ under_target_fraction_min: 'most' }, 'STANDARD', 'ENGINEER').successMin).toBe(DEFAULTS.under_target_fraction_min);
  });
});

describe('MG-10 scene', () => {
  it('assigns the half by slot parity and starts the boat away from it', () => {
    expect(newSim(STANDARD, { slot: 0 }, 1, DUR).myHalf).toBe(0);
    expect(newSim(STANDARD, { slot: 3 }, 1, DUR).myHalf).toBe(1);
    for (const s of SEEDS) expect(Math.abs(newSim(STANDARD, P, s, DUR).gapM)).toBeGreaterThan(STANDARD.netHalfM);
  });
  it('keeps the halves inside the scene and descends to the sea', () => {
    for (const s of SEEDS.slice(0, 6)) {
      const sim = run(STANDARD, s, []);
      expect(Math.abs(sim.halfX[0])).toBeLessThan(SCENE_HALF_M);
      expect(Math.abs(sim.halfX[1])).toBeLessThan(SCENE_HALF_M);
      expect(sim.altitudeM).toBeLessThan(50);
    }
  });
});

describe('MG-10 modes and difficulty', () => {
  it('Relaxed: slower drift and a larger net', () => {
    const r = resolveConfig({}, 'RELAXED', 'ENGINEER');
    expect(r.windScale).toBeLessThan(STANDARD.windScale);
    expect(r.netHalfM).toBeGreaterThan(STANDARD.netHalfM);
    const late = (c: Mg10Config) => SEEDS.slice(0, 12).reduce((a, s) => a + run(c, s, (m) => scriptedSteer(m, 400, -1.5, 6)).underSteps, 0);
    expect(late(r)).toBeGreaterThan(late(STANDARD));
  });
  it('Cadet easier, Flight Director harder', () => {
    const cadet = resolveConfig({}, 'STANDARD', 'CADET');
    const fd = resolveConfig({}, 'STANDARD', 'FLIGHT_DIRECTOR');
    expect(cadet.netHalfM).toBeGreaterThan(STANDARD.netHalfM);
    expect(fd.netHalfM).toBeLessThan(STANDARD.netHalfM);
    const late = (c: Mg10Config) => SEEDS.slice(0, 12).reduce((a, s) => a + run(c, s, (m) => scriptedSteer(m, 400, -1.5, 6)).underSteps, 0);
    expect(late(cadet)).toBeGreaterThan(late(STANDARD));
    expect(late(fd)).toBeLessThan(late(STANDARD));
  });
});

describe('MG-10 determinism', () => {
  it('repeats for the same seed and inputs', () => {
    const a = run(STANDARD, 5, good(STANDARD));
    const b = run(STANDARD, 5, good(STANDARD));
    expect(Array.from(a.gapHistory)).toEqual(Array.from(b.gapHistory));
  });
  it('does not depend on the frame rate', () => {
    const inputs = scriptedSteer(() => newSim(STANDARD, P, 6, DUR), 90, 0.1, 3);
    const runs = [() => 16.7, () => 33.3, (i: number) => (i % 5 ? 4 : 170)].map((f) => feedFrames(newSim(STANDARD, P, 6, DUR), inputs, f));
    for (const r of runs) expect(Array.from(r.gapHistory)).toEqual(Array.from(runs[0]!.gapHistory));
  });
});

describe('MG-10 play', () => {
  const modes: MinigameMode[] = ['STANDARD', 'RELAXED', 'ONE_BUTTON'];
  const assists: AssistLevel[] = ['CADET', 'ENGINEER', 'FLIGHT_DIRECTOR'];
  for (const mode of modes)
    for (const assist of assists)
      it(`a good player succeeds on 20+ seeds (${mode}, ${assist})`, () => {
        const c = resolveConfig({}, mode, assist);
        expect(SEEDS.filter((s) => run(c, s, good(c), { slot: s % 4, slots: 4 }).score().success).length).toBeGreaterThanOrEqual(20);
      });
  it('an idle player fails in every mode', () => {
    for (const mode of modes) for (const s of SEEDS.slice(0, 5)) expect(run(resolveConfig({}, mode, 'ENGINEER'), s, []).score().success).toBe(false);
  });
  it('one button: holding pulls towards the half but swings past it; timed releases succeed; hold-to-toggle works', () => {
    const one = resolveConfig({}, 'ONE_BUTTON', 'ENGINEER');
    // Holding all the time swings past the half: it fails on most seeds and scores below timed releases.
    const holdAll = SEEDS.map((s) => run(one, s, [{ t: 0, k: 'h', v: 1 }]).score());
    const timed = SEEDS.map((s) => run(one, s, (m) => scriptedHoldBoat(m)).score());
    expect(holdAll.filter((r) => r.success).length).toBeLessThanOrEqual(SEEDS.length / 3);
    expect(holdAll.reduce((a, r) => a + r.score, 0)).toBeLessThan(timed.reduce((a, r) => a + r.score, 0));
    const held = run(one, 3, [{ t: 0, k: 'h', v: 1 }]);
    expect(held.underFraction).toBeGreaterThan(0.05);
    expect(run(one, 3, [{ t: 0, k: 'x', v: 0 }]).score().success).toBe(false);
    const toggle = resolveConfig({ hold_to_toggle: true }, 'ONE_BUTTON', 'ENGINEER');
    const latched = run(toggle, 3, [
      { t: 0, k: 'h', v: 1 },
      { t: 60, k: 'h', v: 0 },
    ]);
    expect(latched.underFraction).toBeGreaterThan(0.05);
    expect(SEEDS.filter((s) => run(toggle, s, (m) => scriptedHoldBoat(m)).score().success).length).toBeGreaterThanOrEqual(20);
  });
  it('keyboard steering moves the boat', () => {
    const left = run(STANDARD, 2, [{ t: 0, k: 'k', v: -1 }]);
    const right = run(STANDARD, 2, [{ t: 0, k: 'k', v: 1 }]);
    expect(left.boatX).toBeLessThan(right.boatX);
  });
  it('a careful player is perfect, and perfect implies success', () => {
    const r = run(STANDARD, 9, (m) => scriptedSteer(m, 60, 0.5)).score();
    expect(r.perfect).toBe(true);
    expect(r.success).toBe(true);
  });
});
