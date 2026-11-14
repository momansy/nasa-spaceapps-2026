import { describe, expect, it } from 'vitest';
import type { AssistLevel, MinigameMode } from '@protocol';
import { FixedStepper } from '../MG-08/model';
import { autopilot, createRun, DEFAULTS, IDLE, makeSim, Mg22Sim, resolveConfig, runScripted, scoreRun, STEP_HZ, type Mg22Input } from './model';

const DURATION_S = 25;
const TOTAL = DURATION_S * STEP_HZ; // 3000 steps
const STANDARD = resolveConfig({}, 'STANDARD', 'ENGINEER');
const SEEDS = Array.from({ length: 24 }, (_, i) => 1 + i * 7919);
const MODES: MinigameMode[] = ['STANDARD', 'RELAXED', 'ONE_BUTTON'];

describe('MG-22 scoring', () => {
  it('succeeds at exactly 85 % inside the corridor and not one step below', () => {
    expect(scoreRun(0.85 * TOTAL, TOTAL, -6.5, STANDARD).success).toBe(true);
    expect(scoreRun(0.85 * TOTAL - 1, TOTAL, -6.5, STANDARD).success).toBe(false);
  });
  it('is perfect from 97 % and perfect implies success', () => {
    const r = scoreRun(0.97 * TOTAL, TOTAL, -6.5, STANDARD);
    expect(r.success && r.perfect).toBe(true);
    expect(scoreRun(0.97 * TOTAL - 1, TOTAL, -6.5, STANDARD).perfect).toBe(false);
    for (let n = 0; n <= TOTAL; n += 50) {
      const x = scoreRun(n, TOTAL, -6.5, STANDARD);
      if (x.perfect) expect(x.success).toBe(true);
    }
  });
  it('scores the inside fraction and reports the mean angle as value', () => {
    const r = scoreRun(600, TOTAL, -6.25, STANDARD);
    expect(r.score).toBe(0.2);
    expect(r.value).toBe(-6.25);
    expect(scoreRun(0, 0, 0, STANDARD)).toEqual({ success: false, perfect: false, score: 0, value: null });
  });
  it('takes thresholds and corridor from the host parameters', () => {
    const easy = resolveConfig({ in_corridor_fraction_min: 0.5, perfect_fraction_min: 0.6 }, 'STANDARD', 'ENGINEER');
    expect(scoreRun(0.5 * TOTAL, TOTAL, 0, easy).success).toBe(true);
    expect(scoreRun(0.6 * TOTAL, TOTAL, 0, easy).perfect).toBe(true);
    const odd = resolveConfig({ in_corridor_fraction_min: 0.9, perfect_fraction_min: 0.5 }, 'STANDARD', 'ENGINEER');
    expect(odd.perfectFractionMin).toBe(0.9);
    const narrow = resolveConfig({ corridor_steep_deg: -7, corridor_shallow_deg: -6 }, 'STANDARD', 'ENGINEER');
    expect(narrow.steepDeg).toBeCloseTo(-7, 10);
    expect(narrow.shallowDeg).toBeCloseTo(-6, 10);
  });
  it('uses the Apollo 13 corridor of fact F17 by default (−7.4° to −5.25°, width 2.15°)', () => {
    expect(STANDARD.steepDeg).toBeCloseTo(DEFAULTS.corridor_steep_deg, 10);
    expect(STANDARD.shallowDeg).toBeCloseTo(DEFAULTS.corridor_shallow_deg, 10);
    expect(STANDARD.inCorridorFractionMin).toBe(0.85);
  });
});

describe('MG-22 physics (hand-computed)', () => {
  // With a constant drift b (deg/s), no waves and no stick, γ(t) = γ0 + b·(t − 0.5) for t ≥ 1 s
  // (the first second is calm: the disturbance ramps with a smoothstep whose integral is 0.5 s).
  it('drifts by b·(T − 0.5) after T seconds', () => {
    const cfg = resolveConfig({ drift_deg_s: -0.1, wave_deg_s: 0, start_deg: -6.5 }, 'STANDARD', 'ENGINEER');
    const sim = runScripted(new Mg22Sim(cfg, createRun(cfg, 5, DURATION_S)), () => IDLE);
    expect(sim.gammaDeg).toBeCloseTo(-6.5 + -0.1 * (DURATION_S - 0.5), 1);
  });
  // Mean over [0, T]: γ0 + b/T · (0.15 + (T² − 1)/2 − 0.5·(T − 1)); for T = 25: γ0 + 12.006·b.
  it('reports the mean angle over the run as the value', () => {
    const cfg = resolveConfig({ drift_deg_s: -0.05, wave_deg_s: 0, start_deg: -6.5 }, 'STANDARD', 'ENGINEER');
    const sim = runScripted(new Mg22Sim(cfg, createRun(cfg, 5, DURATION_S)), () => IDLE);
    const expected = -6.5 + (-0.05 / DURATION_S) * (0.15 + (DURATION_S * DURATION_S - 1) / 2 - 0.5 * (DURATION_S - 1));
    expect(expected).toBeCloseTo(-6.5 - 0.05 * 12.006, 3);
    expect(sim.result().value).toBeCloseTo(expected, 2);
  });
  it('holds the start angle when nothing disturbs it', () => {
    const cfg = resolveConfig({ drift_deg_s: 0, wave_deg_s: 0, start_deg: -6.1 }, 'STANDARD', 'ENGINEER');
    const sim = runScripted(new Mg22Sim(cfg, createRun(cfg, 9, DURATION_S)), () => IDLE);
    expect(sim.result().value).toBeCloseTo(-6.1, 6);
    expect(sim.result().success).toBe(true);
    expect(sim.result().perfect).toBe(true);
  });
  it('a full stick steepens at the stick rate (1.25 deg/s) once the lift lag has passed', () => {
    const cfg = resolveConfig({ drift_deg_s: 0, wave_deg_s: 0, start_deg: -6.5 }, 'STANDARD', 'ENGINEER');
    const sim = new Mg22Sim(cfg, createRun(cfg, 1, DURATION_S));
    for (let i = 0; i < 2 * STEP_HZ; i++) sim.advance({ stick: 1, pressed: false });
    // γ(2 s) = −6.5 − 1.25·(2 − lag·(1 − e^(−2/lag))), lag = 0.09 s
    const expected = -6.5 - 1.25 * (2 - 0.09 * (1 - Math.exp(-2 / 0.09)));
    expect(sim.gammaDeg).toBeCloseTo(expected, 1);
    expect(sim.zone).toBe(1);
  });
  it('too steep fills the heat bar and too shallow fills the skip bar', () => {
    const steep = resolveConfig({ drift_deg_s: -0.5, wave_deg_s: 0, start_deg: -6.5 }, 'STANDARD', 'ENGINEER');
    const a = runScripted(new Mg22Sim(steep, createRun(steep, 1, DURATION_S)), () => IDLE);
    expect(a.heat).toBe(1);
    expect(a.skip).toBe(0);
    const shallow = resolveConfig({ drift_deg_s: 0.5, wave_deg_s: 0, start_deg: -6.5 }, 'STANDARD', 'ENGINEER');
    const b = runScripted(new Mg22Sim(shallow, createRun(shallow, 1, DURATION_S)), () => IDLE);
    expect(b.skip).toBe(1);
    expect(b.heat).toBe(0);
  });
});

describe('MG-22 modes and difficulty', () => {
  const width = (mode: MinigameMode, assist: AssistLevel) => {
    const c = resolveConfig({}, mode, assist);
    return c.shallowDeg - c.steepDeg;
  };
  it('Relaxed and One-button widen the corridor', () => {
    expect(width('RELAXED', 'ENGINEER')).toBeGreaterThan(width('STANDARD', 'ENGINEER'));
    expect(width('ONE_BUTTON', 'ENGINEER')).toBeGreaterThan(width('STANDARD', 'ENGINEER'));
  });
  it('Cadet is easier and Flight Director harder, by about 25 %', () => {
    expect(width('STANDARD', 'CADET') / width('STANDARD', 'ENGINEER')).toBeCloseTo(1.25, 6);
    expect(width('STANDARD', 'FLIGHT_DIRECTOR') / width('STANDARD', 'ENGINEER')).toBeCloseTo(0.8, 6);
  });
  it('Flight Director hides the corridor edges; Relaxed and Cadet show a guide', () => {
    expect(resolveConfig({}, 'STANDARD', 'FLIGHT_DIRECTOR').hideEdges).toBe(true);
    expect(resolveConfig({}, 'STANDARD', 'ENGINEER').hideEdges).toBe(false);
    expect(resolveConfig({}, 'RELAXED', 'FLIGHT_DIRECTOR').hideEdges).toBe(false);
    expect(resolveConfig({}, 'RELAXED', 'ENGINEER').showGuide).toBe(true);
  });
  it('a sloppy player does better in Relaxed than in STANDARD, and better at CADET than at FLIGHT_DIRECTOR', () => {
    // Players who aim 0.5°, 0.75°, 0.95° and 1.2° off the centre of the corridor (half-width 1.075°).
    const play = (mode: MinigameMode, assist: AssistLevel) => {
      let total = 0;
      let n = 0;
      for (const off of [0.5, 0.75, 0.95, 1.2])
        for (const seed of SEEDS) {
          total += runScripted(makeSim({}, seed, mode, assist, DURATION_S), (s) => autopilot(s, off)).insideFraction;
          n++;
        }
      return total / n;
    };
    expect(play('RELAXED', 'ENGINEER')).toBeGreaterThan(play('STANDARD', 'ENGINEER'));
    expect(play('STANDARD', 'CADET')).toBeGreaterThan(play('STANDARD', 'ENGINEER'));
    expect(play('STANDARD', 'ENGINEER')).toBeGreaterThan(play('STANDARD', 'FLIGHT_DIRECTOR'));
  });
});

describe('MG-22 determinism', () => {
  it('same seed, params and input give the same run', () => {
    const a = runScripted(makeSim({}, 1234, 'STANDARD', 'ENGINEER', DURATION_S), (s) => autopilot(s));
    const b = runScripted(makeSim({}, 1234, 'STANDARD', 'ENGINEER', DURATION_S), (s) => autopilot(s));
    expect(Array.from(a.history)).toEqual(Array.from(b.history));
    expect(a.result()).toEqual(b.result());
  });
  it('different seeds give different runs', () => {
    const a = runScripted(makeSim({}, 1, 'STANDARD', 'ENGINEER', DURATION_S), () => IDLE);
    const b = runScripted(makeSim({}, 2, 'STANDARD', 'ENGINEER', DURATION_S), () => IDLE);
    expect(a.result().value).not.toBe(b.result().value);
  });
  it('does not depend on the frame rate', () => {
    // Feed the same 25 s through 60 fps, 30 fps and a stalled-tab pattern: always 3000 steps.
    const stepsFor = (frameMs: number[]) => {
      const st = new FixedStepper();
      let n = 0;
      let elapsed = 0;
      for (let i = 0; elapsed < 25000; i++) {
        const dt = frameMs[i % frameMs.length]!;
        elapsed += dt;
        n += st.advance(dt);
      }
      return { n, elapsed };
    };
    for (const pattern of [[1000 / 60], [1000 / 30], [16, 17, 250, 8]]) {
      const { n, elapsed } = stepsFor(pattern);
      expect(Math.abs(n - Math.floor((elapsed * STEP_HZ) / 1000))).toBeLessThanOrEqual(1);
    }
    // The same inputs give the same result however the steps were batched.
    const one = runScripted(makeSim({}, 77, 'STANDARD', 'ENGINEER', DURATION_S), (s) => autopilot(s));
    const sim = makeSim({}, 77, 'STANDARD', 'ENGINEER', DURATION_S);
    while (!sim.done) for (let k = 0; k < 1 + (sim.step % 7) && !sim.done; k++) sim.advance(autopilot(sim));
    expect(sim.result()).toEqual(one.result());
  });
});

describe('MG-22 players', () => {
  for (const mode of MODES) {
    it(`a scripted good player succeeds on ≥ 20 seeds in ${mode}`, () => {
      let wins = 0;
      for (const seed of SEEDS) {
        const r = runScripted(makeSim({}, seed, mode, 'ENGINEER', DURATION_S), (s) => autopilot(s)).result();
        if (r.success) wins++;
        if (r.perfect) expect(r.success).toBe(true);
      }
      expect(wins).toBeGreaterThanOrEqual(20);
    });
    it(`an idle player fails in ${mode} on every seed`, () => {
      for (const seed of SEEDS) {
        const r = runScripted(makeSim({}, seed, mode, 'ENGINEER', DURATION_S), () => IDLE).result();
        expect(r.success).toBe(false);
      }
    });
  }
  it('a good player also succeeds at FLIGHT_DIRECTOR on ≥ 20 seeds', () => {
    let wins = 0;
    for (const seed of SEEDS) if (runScripted(makeSim({}, seed, 'STANDARD', 'FLIGHT_DIRECTOR', DURATION_S), (s) => autopilot(s)).result().success) wins++;
    expect(wins).toBeGreaterThanOrEqual(20);
  });
  it('one-button hold-to-toggle works with a tap on every change', () => {
    const cfg = resolveConfig({ hold_to_toggle: true }, 'ONE_BUTTON', 'ENGINEER');
    expect(cfg.holdToToggle).toBe(true);
    // Tap (press, release) whenever the player would change from holding to releasing or back.
    const sim = new Mg22Sim(cfg, createRun(cfg, 11, DURATION_S));
    let want = false;
    let down = false;
    let wins = 0;
    const centre = (cfg.steepDeg + cfg.shallowDeg) / 2;
    while (!sim.done) {
      const should = sim.gammaDeg > centre;
      const input: Mg22Input = { stick: 0, pressed: false };
      if (should !== want && !down) {
        input.pressed = true;
        down = true;
        want = should;
      } else down = false;
      sim.advance(input);
    }
    if (sim.result().success) wins++;
    expect(wins).toBe(1);
  });
  it('never advances past the end and returns the same result every time', () => {
    const sim = runScripted(makeSim({}, 3, 'STANDARD', 'ENGINEER', DURATION_S), (s) => autopilot(s));
    const r = sim.result();
    sim.advance(IDLE);
    expect(sim.step).toBe(TOTAL);
    expect(sim.result()).toEqual(r);
  });
});
