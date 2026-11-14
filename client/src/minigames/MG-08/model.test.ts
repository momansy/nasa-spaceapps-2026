import { describe, expect, it } from 'vitest';
import {
  autopilotButton,
  autopilotLever,
  createCurve,
  DEFAULTS,
  dynamicPressureKpa,
  FixedStepper,
  Mg08Sim,
  resolveConfig,
  RHO0_KG_M3,
  runScripted,
  SCALE_HEIGHT_M,
  scoreRun,
  STEP_HZ,
} from './model';

const STANDARD = resolveConfig({}, 'STANDARD', 'ENGINEER');
const DURATION_S = 20;
const SEEDS = [1, 8, 42, 1234, 99991, 0xdeadbeef];

describe('MG-08 scoring', () => {
  const total = DURATION_S * STEP_HZ; // 2400 steps

  it('succeeds at exactly 85 % in band', () => {
    const r = scoreRun(0.85 * total, total, STANDARD);
    expect(r.success).toBe(true);
    expect(r.perfect).toBe(false);
    expect(r.score).toBeCloseTo(0.85, 10);
  });

  it('fails one step below 85 %', () => {
    const r = scoreRun(0.85 * total - 1, total, STANDARD);
    expect(r.success).toBe(false);
    expect(r.perfect).toBe(false);
  });

  it('is perfect from 97 % and perfect implies success', () => {
    expect(scoreRun(0.97 * total, total, STANDARD)).toEqual({ success: true, perfect: true, score: 0.97 });
    expect(scoreRun(0.97 * total - 1, total, STANDARD).perfect).toBe(false);
    expect(scoreRun(total, total, STANDARD)).toEqual({ success: true, perfect: true, score: 1 });
  });

  it('scores the in-band fraction between 0 and 1', () => {
    expect(scoreRun(0, total, STANDARD)).toEqual({ success: false, perfect: false, score: 0 });
    expect(scoreRun(600, total, STANDARD).score).toBe(0.25);
    expect(scoreRun(0, 0, STANDARD).score).toBe(0);
  });

  it('takes the thresholds from the host parameters', () => {
    const easy = resolveConfig({ in_band_fraction_min: 0.5, perfect_fraction_min: 0.6 }, 'STANDARD', 'ENGINEER');
    expect(scoreRun(0.5 * total, total, easy).success).toBe(true);
    expect(scoreRun(0.6 * total, total, easy).perfect).toBe(true);
    // A perfect threshold below the success threshold is raised to it.
    const odd = resolveConfig({ in_band_fraction_min: 0.9, perfect_fraction_min: 0.5 }, 'STANDARD', 'ENGINEER');
    expect(odd.perfectFractionMin).toBe(0.9);
  });
});

describe('MG-08 configuration', () => {
  it('uses the design defaults', () => {
    expect(STANDARD.inBandFractionMin).toBe(0.85);
    expect(STANDARD.perfectFractionMin).toBe(0.97);
    expect(STANDARD.bandHiKpa).toBeCloseTo(DEFAULTS.limit_kpa, 10);
    expect(STANDARD.bandLoKpa).toBeCloseTo(DEFAULTS.floor_kpa, 10);
    expect(STANDARD.throttleMin).toBe(0.4);
    expect(STANDARD.oneButton).toBe(false);
  });

  it('makes the Relaxed band wider than the standard band', () => {
    const relaxed = resolveConfig({}, 'RELAXED', 'ENGINEER');
    const width = (c: typeof STANDARD) => c.bandHiKpa - c.bandLoKpa;
    expect(width(relaxed)).toBeGreaterThan(width(STANDARD) * 1.5);
    expect(relaxed.bandHiKpa).toBeGreaterThan(STANDARD.bandHiKpa);
    expect(relaxed.bandLoKpa).toBeLessThan(STANDARD.bandLoKpa);
    expect(relaxed.gustFraction).toBeLessThan(STANDARD.gustFraction);
    expect(relaxed.showGuide).toBe(true);
  });

  it('scales with the difficulty setting', () => {
    const width = (c: typeof STANDARD) => c.bandHiKpa - c.bandLoKpa;
    const cadet = resolveConfig({}, 'STANDARD', 'CADET');
    const director = resolveConfig({}, 'STANDARD', 'FLIGHT_DIRECTOR');
    expect(width(cadet)).toBeGreaterThan(width(STANDARD));
    expect(width(director)).toBeLessThan(width(STANDARD));
    expect(director.gustFraction).toBeGreaterThan(STANDARD.gustFraction);
  });

  it('ignores parameters of the wrong type and clamps wild values', () => {
    const c = resolveConfig({ in_band_fraction_min: 'lots', limit_kpa: 1e9, throttle_min: -3 }, 'STANDARD', 'ENGINEER');
    expect(c.inBandFractionMin).toBe(0.85);
    expect(c.bandHiKpa).toBeLessThanOrEqual(100);
    expect(c.throttleMin).toBeGreaterThanOrEqual(0.1);
  });
});

describe('MG-08 physics', () => {
  it('computes q = ½ρv² with an exponential atmosphere', () => {
    const a = 12; // m/s²
    const t = 30; // s
    const v = a * t;
    const h = 0.5 * a * t * t;
    const expected = (0.5 * RHO0_KG_M3 * Math.exp(-h / SCALE_HEIGHT_M) * v * v) / 1000;
    expect(dynamicPressureKpa(t, a)).toBeCloseTo(expected, 10);
    expect(dynamicPressureKpa(0, a)).toBe(0);
  });

  it('peaks at ρ0·a·H/e when t = √(2H/a) (Max Q of the model)', () => {
    const a = 12;
    const tPeak = Math.sqrt((2 * SCALE_HEIGHT_M) / a);
    const peak = (RHO0_KG_M3 * a * SCALE_HEIGHT_M) / Math.E / 1000;
    expect(dynamicPressureKpa(tPeak, a)).toBeCloseTo(peak, 6);
    expect(dynamicPressureKpa(tPeak - 2, a)).toBeLessThan(peak);
    expect(dynamicPressureKpa(tPeak + 2, a)).toBeLessThan(peak);
  });

  it('builds a curve that starts and ends inside the band and overshoots the limit at Max Q', () => {
    for (const seed of SEEDS) {
      const curve = createCurve(STANDARD, seed, DURATION_S);
      expect(curve.qFullKpa(0)).toBeGreaterThan(STANDARD.bandLoKpa);
      expect(curve.qFullKpa(0)).toBeLessThan(STANDARD.bandHiKpa);
      expect(curve.qFullKpa(DURATION_S)).toBeGreaterThan(STANDARD.bandLoKpa);
      expect(curve.qFullKpa(DURATION_S)).toBeLessThan(STANDARD.bandHiKpa);
      expect(curve.peakKpa).toBeGreaterThan(STANDARD.bandHiKpa * 1.25);
      expect(curve.peakAtS).toBeGreaterThan(0.25 * DURATION_S);
      expect(curve.peakAtS).toBeLessThan(0.75 * DURATION_S);
      expect(curve.qBaseKpa(curve.peakAtS)).toBeCloseTo(curve.peakKpa, 3);
    }
  });
});

describe('MG-08 determinism', () => {
  const script = (sim: Mg08Sim) => 0.7 + 0.25 * Math.sin(sim.step / 97) + 0.05 * Math.sin(sim.step / 13);

  it('gives the identical run for the same seed and the same inputs', () => {
    const a = runScripted(STANDARD, 2026, DURATION_S, script);
    const b = runScripted(STANDARD, 2026, DURATION_S, script);
    expect(a.totalSteps).toBe(DURATION_S * STEP_HZ);
    expect(a.inBandSteps).toBe(b.inBandSteps);
    expect(a.overSteps).toBe(b.overSteps);
    expect(a.underSteps).toBe(b.underSteps);
    expect(Array.from(a.loadHistory)).toEqual(Array.from(b.loadHistory));
    expect(a.score()).toEqual(b.score());
  });

  it('gives a different curve for a different seed', () => {
    const a = createCurve(STANDARD, 1, DURATION_S);
    const b = createCurve(STANDARD, 2, DURATION_S);
    const sample = (c: typeof a) => [2, 5, 9, 13, 17].map((t) => c.qFullKpa(t));
    expect(sample(a)).not.toEqual(sample(b));
    expect(a.peakKpa).not.toBe(b.peakKpa);
  });

  it('does not depend on the frame rate', () => {
    const run = (frameMs: number) => {
      const sim = new Mg08Sim(STANDARD, createCurve(STANDARD, 77, DURATION_S));
      const stepper = new FixedStepper();
      let guard = 0;
      while (!sim.done && guard++ < 100000) {
        for (let n = stepper.advance(frameMs); n > 0 && !sim.done; n--) sim.stepLever(script(sim));
      }
      return sim;
    };
    const at60 = run(1000 / 60);
    const at30 = run(1000 / 30);
    const janky = run(137.3);
    expect(at60.step).toBe(at60.totalSteps);
    expect(Array.from(at30.loadHistory)).toEqual(Array.from(at60.loadHistory));
    expect(Array.from(janky.loadHistory)).toEqual(Array.from(at60.loadHistory));
    expect(at30.score()).toEqual(at60.score());
  });

  it('emits exactly 120 steps per second from the stepper', () => {
    const stepper = new FixedStepper();
    let steps = 0;
    for (let i = 0; i < 600; i++) steps += stepper.advance(1000 / 60);
    expect(steps).toBe(10 * STEP_HZ);
    expect(stepper.advance(0)).toBe(0);
    expect(stepper.advance(-50)).toBe(0);
  });
});

describe('MG-08 play', () => {
  it('starts at full throttle inside the band', () => {
    const sim = new Mg08Sim(STANDARD, createCurve(STANDARD, 5, DURATION_S));
    expect(sim.target).toBe(1);
    expect(sim.loadKpa).toBeGreaterThan(STANDARD.bandLoKpa);
    expect(sim.loadKpa).toBeLessThan(STANDARD.bandHiKpa);
    sim.stepLever(1);
    expect(sim.zone).toBe(0);
  });

  it('is winnable: a careful hand is perfect on every seed', () => {
    for (const seed of SEEDS) {
      const sim = runScripted(STANDARD, seed, DURATION_S, (s) => autopilotLever(s.config, s.curve, s.timeS));
      expect(sim.score().perfect).toBe(true);
    }
  });

  it('forgives a sloppy hand: slow reactions and a jittery thumb still succeed', () => {
    for (const seed of SEEDS) {
      // Reacts 0.45 s late and wobbles ±3 % of thrust.
      const sim = runScripted(STANDARD, seed, DURATION_S, (s) => autopilotLever(s.config, s.curve, s.timeS, -0.45) + 0.03 * Math.sin(s.step / 21));
      expect(sim.score().success).toBe(true);
    }
  });

  it('overloads when the throttle stays wide open', () => {
    for (const seed of SEEDS) {
      const sim = runScripted(STANDARD, seed, DURATION_S, () => 1);
      expect(sim.score().success).toBe(false);
      expect(sim.overSteps).toBeGreaterThan(sim.underSteps);
    }
  });

  it('wastes time against gravity when the throttle stays at minimum', () => {
    const sim = runScripted(STANDARD, 8, DURATION_S, () => STANDARD.throttleMin);
    expect(sim.score().success).toBe(false);
    expect(sim.underSteps).toBeGreaterThan(sim.overSteps);
  });

  it('clamps the lever to its travel and stops at the end', () => {
    const sim = new Mg08Sim(STANDARD, createCurve(STANDARD, 3, 1));
    sim.stepLever(5);
    expect(sim.target).toBe(1);
    sim.stepLever(-5);
    expect(sim.target).toBe(STANDARD.throttleMin);
    while (!sim.done) sim.stepLever(1);
    const steps = sim.step;
    sim.stepLever(1);
    expect(sim.step).toBe(steps);
    expect(steps).toBe(STEP_HZ);
  });

  it('shows a guide range that really is inside the band', () => {
    const relaxed = resolveConfig({}, 'RELAXED', 'ENGINEER');
    const sim = new Mg08Sim(relaxed, createCurve(relaxed, 11, DURATION_S));
    for (let i = 0; i < 9 * STEP_HZ; i++) sim.stepLever(autopilotLever(relaxed, sim.curve, sim.timeS));
    const { lo, hi } = sim.guideRange();
    expect(lo).toBeLessThan(hi);
    expect(sim.target).toBeGreaterThanOrEqual(lo);
    expect(sim.target).toBeLessThanOrEqual(hi);
  });
});

describe('MG-08 one-button mode', () => {
  const ONE = resolveConfig({}, 'ONE_BUTTON', 'ENGINEER');

  it('is winnable with one button: hold to throttle up, release to throttle down', () => {
    for (const seed of SEEDS) {
      const sim = new Mg08Sim(ONE, createCurve(ONE, seed, DURATION_S));
      while (!sim.done) sim.stepButton(autopilotButton(ONE, sim));
      expect(sim.score().success).toBe(true);
    }
  });

  it('fails when the button is held all the time or never', () => {
    const held = new Mg08Sim(ONE, createCurve(ONE, 4, DURATION_S));
    while (!held.done) held.stepButton(true);
    expect(held.score().success).toBe(false);
    const never = new Mg08Sim(ONE, createCurve(ONE, 4, DURATION_S));
    while (!never.done) never.stepButton(false);
    expect(never.score().success).toBe(false);
  });

  it('turns hold into toggle when asked', () => {
    const toggle = resolveConfig({ hold_to_toggle: true }, 'ONE_BUTTON', 'ENGINEER');
    expect(toggle.holdToToggle).toBe(true);
    const sim = new Mg08Sim(toggle, createCurve(toggle, 4, DURATION_S));
    // Starts going down; one tap (press and release) latches "up".
    for (let i = 0; i < 60; i++) sim.stepButton(false);
    const low = sim.target;
    expect(low).toBeLessThan(1);
    sim.stepButton(true);
    for (let i = 0; i < 30; i++) sim.stepButton(false);
    expect(sim.target).toBeGreaterThan(low);
    // A second tap latches "down" again.
    const high = sim.target;
    sim.stepButton(true);
    for (let i = 0; i < 30; i++) sim.stepButton(false);
    expect(sim.target).toBeLessThan(high);
  });
});
