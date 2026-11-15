import { describe, expect, it } from 'vitest';
import type { AssistLevel, MinigameMode } from '@protocol';
import { FixedStepper } from '../MG-08/model';
import { G0, goodPlayer, landing, makeSim, resolveConfig, runScripted, STEP_HZ, type Mg24Input } from './model';

const DURATION_S = 20;
const SEEDS = Array.from({ length: 24 }, (_, i) => 2 + i * 2713);
const MODES: MinigameMode[] = ['STANDARD', 'RELAXED', 'ONE_BUTTON'];
const ASSISTS: AssistLevel[] = ['CADET', 'ENGINEER', 'FLIGHT_DIRECTOR'];
const NOP: Mg24Input = { ignite: false };

// Hand-computed case: H0 = 500 m, v0 = 0, T/m = 2.5 g0 so a = 1.5 g0 = 14.709975 m/s².
// h* = (v0² + 2 g0 H0) / (2 T/m) = 9806.65 / 49.03325 = 200 m exactly (= H0 / 2.5).
const HAND = { start_altitude_m: 500, start_speed_m_s: 0 };
const A = 1.5 * G0;
const speedAt = (h: number) => Math.sqrt(2 * G0 * (500 - h));

describe('MG-24 landing physics (hand-computed, H0 = 500 m, v0 = 0, a = 14.71 m/s²)', () => {
  it('the ideal ignition altitude is h* = 200 m and gives a touchdown speed of zero', () => {
    const sim = makeSim(HAND, 1, 'STANDARD', 'ENGINEER', DURATION_S);
    expect(sim.hStarM).toBeCloseTo(200, 9);
    const l = landing(200, speedAt(200), A);
    expect(speedAt(200) ** 2).toBeCloseTo(2 * A * 200, 6); // v² = 2ah at h*
    expect(l.vTouchMS).toBeLessThan(1e-3); // zero up to the rounding of the square root of a difference
  });
  it('late ignition at 190 m hits at √(v² − 2ah) = √490.33 = 22.14 m/s', () => {
    const l = landing(190, speedAt(190), A);
    expect(l.early).toBe(false);
    expect(speedAt(190) ** 2).toBeCloseTo(6080.123, 3);
    expect(l.vTouchMS).toBeCloseTo(Math.sqrt(6080.123 - 2 * A * 190), 6);
    expect(l.vTouchMS).toBeCloseTo(22.1435, 3);
    expect(l.tTouchS).toBeCloseTo((speedAt(190) - l.vTouchMS) / A, 9);
  });
  it('early ignition at 210 m stops 16.67 m above the ground, then falls: √(2 g0 · 16.67) = 18.08 m/s', () => {
    const l = landing(210, speedAt(210), A);
    expect(l.early).toBe(true);
    expect(l.hStopM).toBeCloseTo(16.6667, 3);
    expect(l.vTouchMS).toBeCloseTo(Math.sqrt(2 * G0 * 16.6667), 3);
    expect(l.vTouchMS).toBeCloseTo(18.0805, 2);
    expect(l.tTouchS).toBeCloseTo(speedAt(210) / A + Math.sqrt((2 * 16.6667) / G0), 3);
  });
  it('near h*, the touchdown speed is √(2·T/m·(h* − h)) late and √(2·g0·(T/m / a)·(h − h*)) early', () => {
    const tm = 2.5 * G0;
    expect(landing(199.9, speedAt(199.9), A).vTouchMS).toBeCloseTo(Math.sqrt(2 * tm * 0.1), 6);
    expect(landing(200.1, speedAt(200.1), A).vTouchMS).toBeCloseTo(Math.sqrt(2 * G0 * (tm / A) * 0.1), 6);
  });
  it('igniting in the sim reproduces the formula exactly at the ignition step', () => {
    const sim = makeSim(HAND, 1, 'STANDARD', 'ENGINEER', DURATION_S);
    runScripted(sim, (s) => goodPlayer(s));
    expect(sim.hIgniteM).toBeLessThanOrEqual(200);
    expect(sim.outcome!.vTouchMS).toBeCloseTo(Math.sqrt(2 * 2.5 * G0 * (200 - sim.hIgniteM)), 6);
    expect(sim.result().value).toBeCloseTo(sim.outcome!.vTouchMS, 12);
    // the booster really arrives with that speed at the end of the burn
    expect(sim.altitudeM).toBe(0);
    expect(sim.speedMS).toBeCloseTo(sim.outcome!.vTouchMS, 9);
  });
  it('without ignition the booster hits at √(v0² + 2 g0 H0) = 99.03 m/s', () => {
    const sim = runScripted(makeSim(HAND, 1, 'STANDARD', 'ENGINEER', DURATION_S), () => NOP);
    expect(sim.touchdownMS).toBeCloseTo(Math.sqrt(2 * G0 * 500), 9);
    expect(sim.result().success).toBe(false);
    expect(sim.result().score).toBe(0);
  });
  it('the altitude during the burn follows h = h_i − v_i·t + a·t²/2', () => {
    const sim = makeSim(HAND, 1, 'STANDARD', 'ENGINEER', DURATION_S);
    while (sim.phase === 'fall') sim.advance(sim.altitudeM <= 250 ? { ignite: true } : NOP);
    for (let i = 0; i < 120; i++) sim.advance(NOP);
    const tb = (sim.step - 1 - sim.igniteStep) / STEP_HZ;
    expect(sim.altitudeM).toBeCloseTo(sim.hIgniteM - sim.vIgniteMS * tb + 0.5 * A * tb * tb, 9);
  });
});

describe('MG-24 success thresholds (strict: touchdown speed < 2 m/s; perfect < 1 m/s)', () => {
  const at = (v: number, params = {}) => {
    const sim = makeSim(params, 1, 'STANDARD', 'ENGINEER', DURATION_S);
    sim.outcome = { early: false, hStopM: 0, tStopS: 1, tTouchS: 1, vTouchMS: v };
    return sim;
  };
  it('2.000 m/s is not a success, 1.999 m/s is', () => {
    expect(at(1.999).success).toBe(true);
    expect(at(2).success).toBe(false);
    expect(at(2.001).success).toBe(false);
  });
  it('1.000 m/s is not perfect, 0.999 m/s is; perfect implies success', () => {
    expect(at(0.999).perfect).toBe(true);
    expect(at(1).perfect).toBe(false);
    for (let v = 0; v < 4; v += 0.01) if (at(v).perfect) expect(at(v).success).toBe(true);
  });
  it('perfect implies success even when the host sets a stricter success threshold than the perfect one', () => {
    const sim = at(0.7, { touchdown_speed_below_m_s: 0.5 });
    expect(sim.success).toBe(false);
    expect(sim.perfect).toBe(false);
  });
  it('takes the thresholds from the host parameters', () => {
    expect(at(4.5, { touchdown_speed_below_m_s: 5 }).success).toBe(true);
    expect(at(5, { touchdown_speed_below_m_s: 5 }).success).toBe(false);
    expect(at(1.5, { perfect_below_m_s: 2 }).perfect).toBe(true);
  });
  it('the score rises as the touchdown gets softer and stays below 0.5 on failure', () => {
    let prev = 2;
    for (let v = 0; v <= 99; v += 0.5) {
      const r = at(v).result();
      expect(r.score).toBeLessThanOrEqual(prev + 1e-9);
      prev = r.score;
      if (!r.success) expect(r.score).toBeLessThan(0.5);
    }
  });
});

describe('MG-24 bullet time and the ignition window', () => {
  /** Number of steps of the free fall in which a tap would give a soft landing. */
  const windowSteps = (mode: MinigameMode, assist: AssistLevel, seed = 3) => {
    const sim = makeSim({}, seed, mode, assist, DURATION_S);
    let n = 0;
    while (sim.phase === 'fall' && !sim.done) {
      if (landing(sim.altitudeM, sim.speedMS, sim.config.decel).vTouchMS < 2) n++;
      sim.advance(NOP);
    }
    return n;
  };
  it('the clock is full speed far from h* and slows to 1/60 at h*', () => {
    const sim = makeSim({}, 3, 'STANDARD', 'ENGINEER', DURATION_S);
    expect(sim.rateAt(sim.hStarM + 100)).toBe(1);
    expect(sim.rateAt(sim.hStarM)).toBeCloseTo(1 / 60, 12);
    expect(sim.rateAt(sim.hStarM + 10)).toBeCloseTo(0.5, 12);
  });
  it('a tap inside about ±0.1 m of h* gives a soft landing: some 10 to 30 steps (80 to 250 ms) in Standard', () => {
    const n = windowSteps('STANDARD', 'ENGINEER');
    expect(n).toBeGreaterThanOrEqual(10);
    expect(n).toBeLessThanOrEqual(30);
  });
  it('Relaxed has a wider window than Standard, Cadet wider and Flight Director narrower; one-button is unchanged', () => {
    const std = windowSteps('STANDARD', 'ENGINEER');
    expect(windowSteps('RELAXED', 'ENGINEER')).toBeGreaterThan(std * 2);
    expect(windowSteps('STANDARD', 'CADET')).toBeGreaterThan(std);
    expect(windowSteps('STANDARD', 'FLIGHT_DIRECTOR')).toBeLessThan(std);
    expect(windowSteps('ONE_BUTTON', 'ENGINEER')).toBe(std);
  });
  it('the ghost fades in Standard (Flight Director faster), and stays in Relaxed and Cadet', () => {
    const alphaAt = (mode: MinigameMode, assist: AssistLevel, s: number) => {
      const sim = makeSim({}, 3, mode, assist, DURATION_S);
      for (let i = 0; i < s * STEP_HZ; i++) sim.advance(NOP);
      return sim.ghostAlpha;
    };
    expect(alphaAt('STANDARD', 'ENGINEER', 0.5)).toBe(1);
    expect(alphaAt('STANDARD', 'ENGINEER', 6)).toBe(0);
    expect(alphaAt('STANDARD', 'FLIGHT_DIRECTOR', 2.5)).toBe(0);
    expect(alphaAt('STANDARD', 'ENGINEER', 2.5)).toBeGreaterThan(0);
    expect(alphaAt('RELAXED', 'ENGINEER', 10)).toBe(1);
    expect(alphaAt('STANDARD', 'CADET', 10)).toBe(1);
  });
  it('the whole run, including an early ignition and a second fall, fits in 20 s', () => {
    for (const seed of SEEDS.slice(0, 8)) {
      for (const igniteAfterS of [0, 1, 2, 3, 4, 5, 6]) {
        const sim = runScripted(makeSim({}, seed, 'STANDARD', 'ENGINEER', DURATION_S), (s) => ({ ignite: s.timeS >= igniteAfterS && s.phase === 'fall' }));
        expect(sim.phase).toBe('down');
        expect(sim.step).toBeLessThan(sim.totalSteps);
      }
    }
  });
  it('igniting at the start is early: the booster stops above the ground, falls again and lands hard', () => {
    const sim = runScripted(makeSim({}, 5, 'STANDARD', 'ENGINEER', DURATION_S), (s) => ({ ignite: s.step === 0 }));
    expect(sim.outcome!.early).toBe(true);
    expect(sim.outcome!.hStopM).toBeGreaterThan(100);
    expect(sim.result().success).toBe(false);
  });
});

describe('MG-24 configuration', () => {
  it('thrust per weight is above 1 so the booster cannot hover: a = (T/m − g0) > 0', () => {
    const c = resolveConfig({}, 'STANDARD', 'ENGINEER');
    expect(c.twr).toBeGreaterThan(1);
    expect(c.decel).toBeCloseTo((c.twr - 1) * G0, 12);
    expect(resolveConfig({ thrust_to_weight: 0.5 }, 'STANDARD', 'ENGINEER').twr).toBeGreaterThan(1);
  });
  it('does not depend on the player count', () => {
    expect(resolveConfig({ slot: 3, slots: 6 }, 'STANDARD', 'ENGINEER')).toEqual(resolveConfig({}, 'STANDARD', 'ENGINEER'));
  });
  it('takes the start state from the host and the seed otherwise', () => {
    const a = makeSim({ start_altitude_m: 300, start_speed_m_s: 10 }, 9, 'STANDARD', 'ENGINEER', DURATION_S);
    expect([a.h0M, a.v0MS]).toEqual([300, 10]);
    const b = makeSim({}, 9, 'STANDARD', 'ENGINEER', DURATION_S);
    expect(b.h0M).toBeGreaterThanOrEqual(450);
    expect(b.h0M).toBeLessThanOrEqual(650);
    expect(b.v0MS).toBeGreaterThanOrEqual(15);
    expect(b.v0MS).toBeLessThanOrEqual(30);
  });
});

describe('MG-24 determinism and play', () => {
  it('same seed and input give the same run, different seeds differ', () => {
    const a = runScripted(makeSim({}, 5, 'STANDARD', 'ENGINEER', DURATION_S), (s) => goodPlayer(s));
    const b = runScripted(makeSim({}, 5, 'STANDARD', 'ENGINEER', DURATION_S), (s) => goodPlayer(s));
    expect(a.result()).toEqual(b.result());
    expect(a.igniteStep).toBe(b.igniteStep);
    expect(makeSim({}, 6, 'STANDARD', 'ENGINEER', DURATION_S).hStarM).not.toBe(makeSim({}, 5, 'STANDARD', 'ENGINEER', DURATION_S).hStarM);
  });
  it('does not depend on the frame rate', () => {
    for (const fps of [60, 30, 144]) {
      const st = new FixedStepper();
      const sim = makeSim({}, 5, 'STANDARD', 'ENGINEER', DURATION_S);
      for (let t = 0; t < 20000 + 1000 / fps; t += 1000 / fps) for (let n = st.advance(1000 / fps); n > 0 && !sim.done; n--) sim.advance(goodPlayer(sim));
      expect(sim.done).toBe(true);
      expect(sim.result().success).toBe(true);
    }
  });
  for (const mode of MODES) {
    for (const assist of ASSISTS) {
      it(`a scripted good player succeeds on ≥ 20 seeds in ${mode} at ${assist}, and perfect implies success`, () => {
        let wins = 0;
        for (const seed of SEEDS) {
          const r = runScripted(makeSim({}, seed, mode, assist, DURATION_S), (s) => goodPlayer(s)).result();
          if (r.success) wins++;
          if (r.perfect) expect(r.success).toBe(true);
        }
        expect(wins).toBeGreaterThanOrEqual(20);
      });
    }
    it(`an idle player fails in ${mode} on every seed (hits at about 100 m/s) and the run ends by itself`, () => {
      for (const seed of SEEDS) {
        const sim = runScripted(makeSim({}, seed, mode, 'ENGINEER', DURATION_S), () => NOP);
        expect(sim.result().success).toBe(false);
        expect(sim.result().value).toBeGreaterThan(80);
        expect(sim.step).toBeLessThan(sim.totalSteps);
      }
    });
  }
  it('a tap 0.3 m too early misses the soft landing, 0.05 m early is still a success', () => {
    const play = (off: number) => runScripted(makeSim({}, 7, 'STANDARD', 'ENGINEER', DURATION_S), (s) => goodPlayer(s, off)).result();
    expect(play(0.3).success).toBe(false);
    expect(play(0.05).success).toBe(true);
  });
  it('the result is stable after the end', () => {
    const sim = runScripted(makeSim({}, 1, 'STANDARD', 'ENGINEER', DURATION_S), (s) => goodPlayer(s));
    const r = sim.result();
    sim.advance({ ignite: true });
    expect(sim.result()).toEqual(r);
  });
});
