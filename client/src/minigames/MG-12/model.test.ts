import { describe, expect, it } from 'vitest';
import type { AssistLevel, MinigameMode } from '@protocol';
import { feedFrames, replay, type SimInput } from '../MG-09/shared/core';
import { createLayout, DEFAULTS, engineTorque, F_MAX_N, L_M, newSim, resolveConfig, scoreZone, scriptedLock, scriptedPad, type Mg12Config, type Mg12Sim } from './model';

const DUR = 20_000;
const SEEDS = Array.from({ length: 24 }, (_, i) => 21 + i * 99991);
const STANDARD = resolveConfig({}, 'STANDARD', 'ENGINEER');
const P = { slot: 0, slots: 4 };

type Make = () => Mg12Sim;
function run(c: Mg12Config, seed: number, inputs: SimInput[] | ((m: Make) => SimInput[]), params: Record<string, number | number[]> = P) {
  const make = () => newSim(c, params, seed, DUR);
  return replay(make, typeof inputs === 'function' ? inputs(make) : inputs);
}
const good = (c: Mg12Config) => (m: Make) => (c.oneButton ? scriptedLock(m) : scriptedPad(m, 100, -0.1, 0.1));

describe('MG-12 physics', () => {
  it('computes τ = T·Fmax·(x cos δ + L sin δ) about the centre of mass', () => {
    expect(engineTorque(1.6, 1, 0)).toBeCloseTo(1.6 * F_MAX_N, 6);
    expect(engineTorque(0, 1, 90)).toBeCloseTo(L_M * F_MAX_N, 3);
    expect(engineTorque(-3.2, 0.5, 0)).toBeCloseTo(-1.6 * F_MAX_N, 6);
    expect(engineTorque(0, 0, 4)).toBe(0);
  });

  it('balances the cluster when every survivor holds the team share', () => {
    for (const failed of [0, 2, 4]) {
      const l = createLayout({ engines: 5, failed }, 1);
      const net = l.engines.reduce((a, e) => a + (e.failed ? 0 : engineTorque(e.x, 1, l.shareDeg)), 0);
      expect(Math.abs(net)).toBeLessThan(1e-6);
    }
    // An outer engine out leaves a torque that the share has to cancel.
    expect(Math.abs(createLayout({ engines: 5, failed: 0 }, 1).shareDeg)).toBeGreaterThan(1);
  });

  it('builds the layout from params: count or positions, failed index, engine from slot', () => {
    const l = createLayout({ engines: [-2, 0, 2], failed: 1, slot: 1 }, 3);
    expect(l.engines.map((e) => e.x)).toEqual([-2, 0, 2]);
    expect(l.failed).toBe(1);
    expect(l.mine).toBe(2);
    expect(createLayout({ engines: 3, failed: 2, slot: 0 }, 3).mine).toBe(0);
    // The default failed engine is an outer one; the player's engine is never the failed one.
    for (const s of SEEDS) {
      const d = createLayout({ slot: s % 4 }, s);
      expect([0, DEFAULTS.engines - 1]).toContain(d.failed);
      expect(d.mine).not.toBe(d.failed);
    }
  });
});

describe('MG-12 scoring', () => {
  it('succeeds at exactly 70 % in the zone and fails one step below', () => {
    expect(scoreZone(1680, 2400, STANDARD).success).toBe(true);
    expect(scoreZone(1679, 2400, STANDARD).success).toBe(false);
  });
  it('is perfect from 90 %, and perfect implies success', () => {
    expect(scoreZone(2160, 2400, STANDARD)).toMatchObject({ success: true, perfect: true });
    expect(scoreZone(2159, 2400, STANDARD).perfect).toBe(false);
    for (let k = 0; k <= 2400; k += 120) if (scoreZone(k, 2400, STANDARD).perfect) expect(scoreZone(k, 2400, STANDARD).success).toBe(true);
  });
  it('takes the zone and thresholds from the host parameters', () => {
    const c = resolveConfig({ torque_zone_knm: 400, in_zone_fraction_min: 0.5 }, 'STANDARD', 'ENGINEER');
    expect(c.zoneKnm).toBe(400);
    expect(scoreZone(1200, 2400, c).success).toBe(true);
    expect(resolveConfig({ torque_zone_knm: 'small' }, 'STANDARD', 'ENGINEER').zoneKnm).toBe(150);
  });
});

describe('MG-12 modes and difficulty', () => {
  it('Relaxed: wider zone, slower disturbances; easier for a late player', () => {
    const r = resolveConfig({}, 'RELAXED', 'ENGINEER');
    expect(r.zoneKnm).toBeGreaterThan(STANDARD.zoneKnm);
    expect(r.distSpeed).toBeLessThan(STANDARD.distSpeed);
    const late = (c: Mg12Config) => SEEDS.slice(0, 10).reduce((a, s) => a + run(c, s, (m) => scriptedPad(m, 250, -0.9, 0.4)).inZoneSteps, 0);
    expect(late(r)).toBeGreaterThan(late(STANDARD));
  });
  it('Cadet easier, Flight Director harder', () => {
    const cadet = resolveConfig({}, 'STANDARD', 'CADET');
    const fd = resolveConfig({}, 'STANDARD', 'FLIGHT_DIRECTOR');
    expect(cadet.zoneKnm).toBeGreaterThan(STANDARD.zoneKnm);
    expect(fd.zoneKnm).toBeLessThan(STANDARD.zoneKnm);
    const late = (c: Mg12Config) => SEEDS.slice(0, 10).reduce((a, s) => a + run(c, s, (m) => scriptedPad(m, 250, -0.7, 0.3)).inZoneSteps, 0);
    expect(late(cadet)).toBeGreaterThan(late(STANDARD));
    expect(late(fd)).toBeLessThan(late(STANDARD));
  });
});

describe('MG-12 determinism', () => {
  it('repeats for the same seed and inputs', () => {
    const a = run(STANDARD, 5, good(STANDARD));
    const b = run(STANDARD, 5, good(STANDARD));
    expect(Array.from(a.netHistory)).toEqual(Array.from(b.netHistory));
  });
  it('does not depend on the frame rate', () => {
    const inputs = scriptedPad(() => newSim(STANDARD, P, 6, DUR), 70, -0.2, 0.3);
    const runs = [() => 16.7, () => 33.3, (i: number) => (i % 5 ? 4 : 150)].map((f) => feedFrames(newSim(STANDARD, P, 6, DUR), inputs, f));
    for (const r of runs) expect(Array.from(r.netHistory)).toEqual(Array.from(runs[0]!.netHistory));
  });
});

describe('MG-12 play', () => {
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
  it('one button: the throttle sweeps by itself and a press locks it', () => {
    const one = resolveConfig({}, 'ONE_BUTTON', 'ENGINEER');
    const sim = newSim(one, P, 3, DUR);
    sim.advanceTo(800);
    const a = sim.cmdThrottle;
    sim.advanceTo(1200);
    expect(sim.cmdThrottle).not.toBe(a);
    sim.push({ t: 1200, k: 'p' });
    sim.advanceTo(1300);
    const locked = sim.cmdThrottle;
    sim.advanceTo(2500);
    expect(sim.cmdThrottle).toBe(locked);
    // Pad inputs do nothing in one-button mode.
    const padded = run(one, 3, [{ t: 0, k: 'c', v: 1, w: 3 }]);
    expect(padded.cmdGimbalDeg).not.toBe(3);
  });
  it('a careful player is perfect, and perfect implies success', () => {
    const r = run(STANDARD, 9, (m) => scriptedPad(m, 50, 0.05)).score();
    expect(r.perfect).toBe(true);
    expect(r.success).toBe(true);
  });
});
