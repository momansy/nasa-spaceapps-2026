import { describe, expect, it } from 'vitest';
import { FixedStepper, STEP_HZ } from '../MG-13/kit';
import {
  collisionProbability,
  createScenario,
  cwDisplacement,
  DEFAULTS,
  DIRS,
  DURATIONS_S,
  evaluate,
  meanMotion,
  Mg14Autopilot,
  Mg14Sim,
  MU_EARTH,
  resolveConfig,
  runScripted,
  scoreBurn,
  THRUST_MS2,
  type BurnOption,
} from './model';

const RUN_S = 20;
const STANDARD = resolveConfig({}, 'STANDARD', 'ENGINEER');
const SEEDS = Array.from({ length: 24 }, (_, i) => (i * 2654435761 + 101) >>> 0);
const opt = (dv: number, clears = true): BurnOption => ({ dir: 'retrograde', durS: dv / THRUST_MS2, dvMs: dv, x: 0, y: 0, pc: clears ? 1e-6 : 1e-3, clears });

describe('MG-14 physics (hand-computed)', () => {
  it('mean motion of a 400 km circular orbit', () => {
    const r = 6_771_000;
    // n = √(3.986e14 / 6.771e6³) = √(1.28404e-6) = 1.13316e-3 rad/s; period ≈ 5545 s (92.4 min).
    expect(meanMotion(r)).toBeCloseTo(1.13316e-3, 7);
    expect((2 * Math.PI) / meanMotion(r) / 60).toBeCloseTo(92.4, 1);
    expect(MU_EARTH).toBe(3.986e14);
  });

  it('tangential impulse: along-track drift −3 Δv T after one orbit, no radial offset', () => {
    const n = meanMotion(6_771_000);
    const T = (2 * Math.PI) / n; // one orbit, 5545 s
    const d = cwDisplacement(n, 0, 0.1, T);
    // y = (Δv/n)(4 sin 2π − 3·2π) = −3 Δv T = −3 × 0.1 × 5544.9 = −1663.5 m
    expect(d.y).toBeCloseTo(-3 * 0.1 * T, 6);
    expect(d.y).toBeCloseTo(-1663.5, 0);
    expect(d.x).toBeCloseTo(0, 6);
  });

  it('tangential impulse at half an orbit: radial 4 Δv / n, along-track −3π Δv / n', () => {
    const n = meanMotion(6_771_000);
    const d = cwDisplacement(n, 0, 0.1, Math.PI / n);
    expect(d.x).toBeCloseTo((4 * 0.1) / n, 6); // 353.0 m
    expect(d.x).toBeCloseTo(353.0, 0);
    expect(d.y).toBeCloseTo((-3 * Math.PI * 0.1) / n, 6); // −831.7 m
  });

  it('a radial impulse only oscillates (bounded by 4 Δv / n + Δv / n); a tangential one drifts away', () => {
    const n = meanMotion(6_771_000);
    const bound = (4 * 0.1) / n + 0.1 / n; // 441 m for 0.1 m/s
    for (const f of [0.4, 0.75, 1, 1.5, 3]) {
      const T = (f * 2 * Math.PI) / n;
      const rad = cwDisplacement(n, 0.1, 0, T);
      expect(Math.hypot(rad.x, rad.y)).toBeLessThanOrEqual(bound);
    }
    for (const f of [1, 1.5, 3]) {
      const T = (f * 2 * Math.PI) / n;
      const rad = cwDisplacement(n, 0.1, 0, T);
      const tan = cwDisplacement(n, 0, 0.1, T);
      expect(Math.hypot(rad.x, rad.y)).toBeLessThan(Math.hypot(tan.x, tan.y) / 3);
    }
  });

  it('collision probability falls with miss distance and is capped at 1', () => {
    const k = (20 * 20) / (2 * 100 * 500); // 0.004
    expect(collisionProbability(0, 0, 100, 500, 20)).toBeCloseTo(k, 12);
    expect(collisionProbability(100, 0, 100, 500, 20)).toBeCloseTo(k * Math.exp(-0.5), 12);
    expect(collisionProbability(0, 1500, 100, 500, 20)).toBeCloseTo(k * Math.exp(-4.5), 12);
    expect(collisionProbability(0, 0, 1, 1, 100)).toBe(1);
  });
});

describe('MG-14 scoring', () => {
  it('succeeds at exactly 1.2 × Δv_min and fails just past it', () => {
    expect(scoreBurn(opt(0.12), 0.1, STANDARD).success).toBe(true);
    expect(scoreBurn(opt(0.1201), 0.1, STANDARD).success).toBe(false);
  });

  it('needs a safe miss; perfect is exactly Δv_min and implies success', () => {
    expect(scoreBurn(opt(0.1, false), 0.1, STANDARD).success).toBe(false);
    expect(scoreBurn(null, 0.1, STANDARD).success).toBe(false);
    expect(scoreBurn(opt(0.1), 0.1, STANDARD)).toEqual({ success: true, perfect: true, score: 1 });
    expect(scoreBurn(opt(0.12), 0.1, STANDARD).perfect).toBe(false);
    expect(scoreBurn(opt(0.12), 0.1, STANDARD).score).toBeCloseTo(0.1 / 0.12, 10);
  });

  it('takes the ratio and the threshold from the host parameters', () => {
    const c = resolveConfig({ delta_v_ratio_max: 1.5, pc_threshold: 1e-5 }, 'STANDARD', 'ENGINEER');
    expect(scoreBurn(opt(0.15), 0.1, c).success).toBe(true);
    expect(c.pcThreshold).toBe(1e-5);
    expect(resolveConfig({}, 'STANDARD', 'ENGINEER').ratioMax).toBe(DEFAULTS.delta_v_ratio_max);
    for (const thr of [1e-5, 1e-3]) {
      const cc = resolveConfig({ pc_threshold: thr }, 'STANDARD', 'ENGINEER');
      for (const seed of SEEDS) {
        const sc = createScenario(cc, seed);
        expect(sc.best.clears).toBe(true);
        expect(sc.pc0).toBeGreaterThanOrEqual(thr);
      }
    }
    expect(resolveConfig({ pc_threshold: 1e-9 }, 'STANDARD', 'ENGINEER').pcThreshold).toBe(1e-5);
  });
});

describe('MG-14 scenario', () => {
  it('needs a burn, and Δv_min is the smallest clearing option on the menu', () => {
    for (const seed of SEEDS) {
      const sc = createScenario(STANDARD, seed);
      expect(sc.pc0).toBeGreaterThanOrEqual(STANDARD.pcThreshold);
      expect(sc.best.clears).toBe(true);
      for (const dur of DURATIONS_S) {
        if (dur >= sc.best.durS) break;
        for (const dir of DIRS) expect(evaluate(STANDARD, sc, dir, dur).clears, `seed ${seed} ${dir} ${dur}`).toBe(false);
      }
      expect(sc.dvMin).toBeCloseTo(THRUST_MS2 * sc.best.durS, 12);
      expect(sc.shortList.some((o) => o.dir === sc.best.dir && o.durS === sc.best.durS)).toBe(true);
      expect(sc.shortList.some((o) => !o.clears)).toBe(true);
    }
  });
});

describe('MG-14 modes and difficulty', () => {
  it('Relaxed: more time and a short list', () => {
    const r = resolveConfig({}, 'RELAXED', 'ENGINEER');
    expect(r.chooseFraction).toBeGreaterThan(STANDARD.chooseFraction);
    expect(r.shortList).toBe(true);
    expect(STANDARD.shortList).toBe(false);
  });

  it('Cadet is easier and Flight Director harder than Engineer', () => {
    const cadet = resolveConfig({}, 'ONE_BUTTON', 'CADET');
    const fd = resolveConfig({}, 'ONE_BUTTON', 'FLIGHT_DIRECTOR');
    expect(cadet.cycleS).toBeGreaterThan(fd.cycleS);
    expect(cadet.sigmaT).toBeLessThan(fd.sigmaT);
    const e = resolveConfig({}, 'STANDARD', 'ENGINEER');
    expect(resolveConfig({}, 'STANDARD', 'CADET').chooseFraction).toBeGreaterThan(e.chooseFraction);
    expect(resolveConfig({}, 'STANDARD', 'FLIGHT_DIRECTOR').chooseFraction).toBeLessThan(e.chooseFraction);
  });
});

describe('MG-14 runs', () => {
  for (const mode of ['STANDARD', 'RELAXED', 'ONE_BUTTON'] as const) {
    for (const assist of ['CADET', 'ENGINEER', 'FLIGHT_DIRECTOR'] as const) {
      it(`a scripted good player succeeds on ${SEEDS.length} seeds (${mode}, ${assist})`, () => {
        const cfg = resolveConfig({}, mode, assist);
        for (const seed of SEEDS) {
          const pilot = new Mg14Autopilot();
          const sim = runScripted(cfg, seed, RUN_S, (s) => pilot.apply(s));
          expect(sim.score().perfect, `seed ${seed}`).toBe(true);
          expect(sim.score().success).toBe(true);
          expect(sim.step).toBeLessThanOrEqual(RUN_S * STEP_HZ);
        }
      });
    }
  }

  it('an idle player fails; play ends at the choosing deadline', () => {
    for (const mode of ['STANDARD', 'RELAXED', 'ONE_BUTTON'] as const) {
      for (const seed of SEEDS) {
        const sim = runScripted(resolveConfig({}, mode, 'ENGINEER'), seed, RUN_S, () => undefined);
        expect(sim.score().success).toBe(false);
        expect(sim.step).toBe(sim.chooseSteps);
      }
    }
  });

  it('overburning and the wrong direction are not successes', () => {
    for (const seed of SEEDS.slice(0, 8)) {
      const sc = createScenario(STANDARD, seed);
      const big = evaluate(STANDARD, sc, sc.best.dir, DURATIONS_S[DURATIONS_S.length - 1]!);
      expect(scoreBurn(big, sc.dvMin, STANDARD).success).toBe(false);
      const below = DURATIONS_S.indexOf(sc.best.durS) - 1;
      if (below >= 0) expect(scoreBurn(evaluate(STANDARD, sc, sc.best.dir, DURATIONS_S[below]!), sc.dvMin, STANDARD).success).toBe(false);
    }
  });

  it('the burn ends play early but never past durationMs', () => {
    const sim = runScripted(STANDARD, 3, RUN_S, (s) => {
      if (s.step === 100) s.commit();
    });
    expect(sim.burnStep).toBe(100);
    expect(sim.step).toBe(100 + Math.round(1.6 * STEP_HZ));
    const late = runScripted(resolveConfig({}, 'RELAXED', 'ENGINEER'), 3, RUN_S, (s) => {
      if (s.step === s.chooseSteps - 1) s.commit();
    });
    expect(late.step).toBeLessThanOrEqual(RUN_S * STEP_HZ);
  });

  it('one-button: a press burns the highlighted option', () => {
    const cfg = resolveConfig({}, 'ONE_BUTTON', 'ENGINEER');
    const sim = runScripted(cfg, 9, RUN_S, (s) => {
      if (s.step === 5) s.commit();
    });
    expect(sim.burn).toEqual(sim.scenario.shortList[0]);
  });

  it('is deterministic from the seed', () => {
    const a = createScenario(STANDARD, 777);
    const b = createScenario(STANDARD, 777);
    expect(a).toEqual(b);
    expect(createScenario(STANDARD, 778)).not.toEqual(a);
  });

  it('does not depend on the frame rate', () => {
    const play = (frameMs: number) => {
      const sim = new Mg14Sim(STANDARD, 12, RUN_S);
      const pilot = new Mg14Autopilot();
      const stepper = new FixedStepper();
      while (!sim.done) {
        for (let k = stepper.advance(frameMs); k > 0 && !sim.done; k--) {
          pilot.apply(sim);
          sim.tick();
        }
      }
      return [sim.burnStep, sim.burn?.durS, sim.step];
    };
    expect(play(1000 / 30)).toEqual(play(1000 / 60));
    expect(play(1000 / 144)).toEqual(play(1000 / 60));
  });
});
