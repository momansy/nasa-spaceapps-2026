import { describe, expect, it } from 'vitest';
import { FixedStepper, STEP_HZ } from './kit';
import { createPass, DEFAULTS, Mg13Autopilot, Mg13Sim, MASK_DEG, passPoint, resolveConfig, runScripted, scoreRun, STANDARD_TIME_FRACTION, type SkyPoint } from './model';

const RUN_S = 20;
const STANDARD = resolveConfig({}, 'STANDARD', 'ENGINEER');
const SEEDS = Array.from({ length: 24 }, (_, i) => (i * 2654435761 + 17) >>> 0);
const pt = (): SkyPoint => ({ x: 0, y: 0, elDeg: 0, azDeg: 0 });

describe('MG-13 scoring', () => {
  const total = RUN_S * STANDARD_TIME_FRACTION * STEP_HZ; // 1800 steps

  it('succeeds at exactly 75 % lock and fails one step below', () => {
    expect(scoreRun(0.75 * total, total, STANDARD).success).toBe(true);
    expect(scoreRun(0.75 * total - 1, total, STANDARD).success).toBe(false);
  });

  it('is perfect from 95 % and perfect implies success', () => {
    expect(scoreRun(0.95 * total, total, STANDARD).perfect).toBe(true);
    expect(scoreRun(0.95 * total - 1, total, STANDARD).perfect).toBe(false);
    for (let k = 0; k <= total; k += 37) {
      const r = scoreRun(k, total, STANDARD);
      if (r.perfect) expect(r.success).toBe(true);
      expect(r.score).toBeGreaterThanOrEqual(0);
      expect(r.score).toBeLessThanOrEqual(1);
    }
  });

  it('takes thresholds and the lock circle from the host parameters', () => {
    const c = resolveConfig({ lock_fraction_min: 0.5, perfect_fraction_min: 0.6, lock_radius: 0.2, max_elevation_deg: 50 }, 'STANDARD', 'ENGINEER');
    expect(c.lockFractionMin).toBe(0.5);
    expect(scoreRun(0.5 * total, total, c).success).toBe(true);
    expect(scoreRun(0.6 * total, total, c).perfect).toBe(true);
    expect(c.lockRadius).toBeCloseTo(0.2, 10);
    expect(createPass(c, 5, RUN_S).maxElDeg).toBe(50);
    // A perfect threshold under the success threshold is raised to it; junk falls back.
    expect(resolveConfig({ lock_fraction_min: 0.9, perfect_fraction_min: 0.3 }, 'STANDARD', 'ENGINEER').perfectFractionMin).toBe(0.9);
    expect(resolveConfig({ lock_fraction_min: 'x' } as never, 'STANDARD', 'ENGINEER').lockFractionMin).toBe(DEFAULTS.lock_fraction_min);
  });
});

describe('MG-13 pass geometry', () => {
  it('rises at the 5° mask, culminates at the seeded elevation and sets at 5°', () => {
    const pass = createPass(STANDARD, 99, RUN_S);
    const p = pt();
    expect(passPoint(pass, 0, p).elDeg).toBeCloseTo(MASK_DEG, 6);
    expect(passPoint(pass, pass.durationS / 2, p).elDeg).toBeCloseTo(pass.maxElDeg, 6);
    expect(passPoint(pass, pass.durationS, p).elDeg).toBeCloseTo(MASK_DEG, 6);
    expect(pass.maxElDeg).toBeGreaterThanOrEqual(STANDARD.maxElLoDeg);
    expect(pass.maxElDeg).toBeLessThanOrEqual(STANDARD.maxElHiDeg);
  });

  it('moves faster across the sky near culmination than near the horizon', () => {
    const pass = createPass(STANDARD, 3, RUN_S);
    const a = pt();
    const b = pt();
    const speed = (t: number) => {
      passPoint(pass, t, a);
      passPoint(pass, t + 0.1, b);
      return Math.hypot(b.x - a.x, b.y - a.y);
    };
    expect(speed(pass.durationS / 2 - 0.05)).toBeGreaterThan(speed(0.2) * 2);
  });
});

describe('MG-13 modes and difficulty', () => {
  it('Relaxed: larger lock circle and a slower station than Standard', () => {
    const relaxed = resolveConfig({}, 'RELAXED', 'ENGINEER');
    expect(relaxed.lockRadius).toBeGreaterThan(STANDARD.lockRadius * 1.3);
    expect(createPass(relaxed, 1, RUN_S).durationS).toBeGreaterThan(createPass(STANDARD, 1, RUN_S).durationS);
  });

  it('Cadet is easier and Flight Director harder than Engineer', () => {
    const cadet = resolveConfig({}, 'STANDARD', 'CADET');
    const fd = resolveConfig({}, 'STANDARD', 'FLIGHT_DIRECTOR');
    expect(cadet.lockRadius).toBeGreaterThan(STANDARD.lockRadius);
    expect(fd.lockRadius).toBeLessThan(STANDARD.lockRadius);
    expect(cadet.maxElHiDeg).toBeLessThan(STANDARD.maxElHiDeg);
    expect(fd.maxElHiDeg).toBeGreaterThan(STANDARD.maxElHiDeg);
    expect(fd.driftHi).toBeGreaterThan(STANDARD.driftHi);
    // A lazy player (aims late by 0.6 s) locks more with Cadet than with Flight Director.
    const lazy = (cfg: typeof STANDARD) => {
      let sum = 0;
      for (const seed of SEEDS.slice(0, 10)) {
        const sim = runScripted(cfg, seed, RUN_S, (s) => {
          const p = passPoint(s.pass, Math.max(0, s.timeS - 0.6), pt());
          s.aim(p.x, p.y);
        });
        sum += sim.lockFraction;
      }
      return sum;
    };
    expect(lazy(cadet)).toBeGreaterThan(lazy(fd));
  });
});

describe('MG-13 runs', () => {
  for (const mode of ['STANDARD', 'RELAXED', 'ONE_BUTTON'] as const) {
    for (const assist of ['CADET', 'ENGINEER', 'FLIGHT_DIRECTOR'] as const) {
      it(`a scripted good player succeeds on ${SEEDS.length} seeds (${mode}, ${assist})`, () => {
        const cfg = resolveConfig({}, mode, assist);
        for (const seed of SEEDS) {
          const pilot = new Mg13Autopilot();
          const sim = runScripted(cfg, seed, RUN_S, (s) => pilot.apply(s));
          expect(sim.score().success, `seed ${seed}`).toBe(true);
        }
      });
    }
  }

  it('an idle player fails (Standard, Relaxed and One-button)', () => {
    for (const mode of ['STANDARD', 'RELAXED', 'ONE_BUTTON'] as const) {
      const cfg = resolveConfig({}, mode, 'ENGINEER');
      for (const seed of SEEDS) {
        const sim = runScripted(cfg, seed, RUN_S, () => undefined);
        expect(sim.score().success, `${mode} seed ${seed}`).toBe(false);
      }
    }
  });

  it('one-button: presses re-centre the drifting antenna', () => {
    const cfg = resolveConfig({}, 'ONE_BUTTON', 'ENGINEER');
    const pilot = new Mg13Autopilot();
    const sim = runScripted(cfg, 42, RUN_S, (s) => pilot.apply(s));
    expect(sim.presses).toBeGreaterThan(3);
    expect(sim.score().success).toBe(true);
  });

  it('is deterministic from the seed', () => {
    const a = runScripted(STANDARD, 1234, RUN_S, (s) => new Mg13Autopilot(0.05).apply(s));
    const b = runScripted(STANDARD, 1234, RUN_S, (s) => new Mg13Autopilot(0.05).apply(s));
    expect(a.lockSteps).toBe(b.lockSteps);
    expect(a.rx).toBe(b.rx);
    expect(Array.from(a.lockHistory)).toEqual(Array.from(b.lockHistory));
    const c = runScripted(STANDARD, 1235, RUN_S, () => undefined);
    expect(c.pass.culminationAzDeg === a.pass.culminationAzDeg && c.pass.maxElDeg === a.pass.maxElDeg).toBe(false);
  });

  it('does not depend on the frame rate', () => {
    const play = (frameMs: number) => {
      const sim = new Mg13Sim(STANDARD, 77, RUN_S);
      const pilot = new Mg13Autopilot();
      const stepper = new FixedStepper();
      while (!sim.done) {
        for (let n = stepper.advance(frameMs); n > 0 && !sim.done; n--) {
          pilot.apply(sim);
          sim.tick();
        }
      }
      return sim;
    };
    const a = play(1000 / 60);
    const b = play(1000 / 30);
    const c = play(1000 / 144);
    expect(b.lockSteps).toBe(a.lockSteps);
    expect(c.lockSteps).toBe(a.lockSteps);
    expect(b.step).toBe(a.step);
  });

  it('never runs past the pass and counts data only while locked', () => {
    const sim = runScripted(STANDARD, 5, RUN_S, (s) => new Mg13Autopilot().apply(s));
    expect(sim.step).toBe(Math.round(RUN_S * STANDARD_TIME_FRACTION * STEP_HZ));
    expect(sim.dataMbit).toBeCloseTo((sim.lockSteps / STEP_HZ) * 8, 6);
    sim.tick();
    expect(sim.step).toBe(sim.totalSteps);
  });
});
