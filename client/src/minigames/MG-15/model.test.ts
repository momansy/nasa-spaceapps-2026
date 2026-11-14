import { describe, expect, it } from 'vitest';
import { FixedStepper, STEP_HZ } from '../MG-13/kit';
import { createPlan, DEFAULTS, MAX_HINGES, Mg15Autopilot, Mg15Sim, panelPowerW, resolveConfig, runScripted, scoreRun } from './model';

const RUN_S = 20;
const STANDARD = resolveConfig({ slot: 1, slots: 4 }, 'STANDARD', 'ENGINEER');
const SEEDS = Array.from({ length: 24 }, (_, i) => (i * 2246822519 + 3) >>> 0);

describe('MG-15 physics', () => {
  it('power is proportional to cos θ (hand-computed)', () => {
    expect(panelPowerW(150, 0)).toBe(150);
    expect(panelPowerW(150, 60)).toBeCloseTo(75, 10); // cos 60° = 0.5
    expect(panelPowerW(150, 15)).toBeCloseTo(144.889, 3); // 150 × 0.96593
    expect(panelPowerW(150, -45)).toBeCloseTo(106.066, 3); // 150 × 0.70711
    expect(panelPowerW(150, 90)).toBeCloseTo(0, 10);
    expect(panelPowerW(150, 120)).toBe(0); // Sun behind the panel
  });
});

describe('MG-15 scoring', () => {
  const n = 840; // 7 s of phase 2

  it('succeeds at exactly 80 % Sun-pointing with the hinge in order, fails one step below', () => {
    expect(scoreRun(true, 0.8 * n, n, STANDARD).success).toBe(true);
    expect(scoreRun(true, 0.8 * n - 1, n, STANDARD).success).toBe(false);
  });

  it('needs the hinge in order as well', () => {
    expect(scoreRun(false, n, n, STANDARD).success).toBe(false);
    expect(scoreRun(false, n, n, STANDARD).perfect).toBe(false);
  });

  it('perfect from 95 % and perfect implies success; score rises with performance', () => {
    expect(scoreRun(true, 0.95 * n, n, STANDARD).perfect).toBe(true);
    expect(scoreRun(true, 0.95 * n - 1, n, STANDARD).perfect).toBe(false);
    let prev = -1;
    for (let k = 0; k <= n; k += 60) {
      const r = scoreRun(true, k, n, STANDARD);
      if (r.perfect) expect(r.success).toBe(true);
      expect(r.score).toBeGreaterThanOrEqual(prev);
      prev = r.score;
    }
    expect(scoreRun(true, n, n, STANDARD).score).toBe(1);
    expect(scoreRun(false, 0, n, STANDARD).score).toBe(0);
  });

  it('takes thresholds, tolerance and power from the host parameters', () => {
    const c = resolveConfig({ sun_pointing_fraction_min: 0.5, perfect_fraction_min: 0.6, pointing_tolerance_deg: 30, peak_power_w: 300 }, 'STANDARD', 'ENGINEER');
    expect(scoreRun(true, 0.5 * n, n, c).success).toBe(true);
    expect(scoreRun(true, 0.6 * n, n, c).perfect).toBe(true);
    expect(c.toleranceDeg).toBe(30);
    expect(c.peakPowerW).toBe(300);
    expect(resolveConfig({}, 'STANDARD', 'ENGINEER').pointingFractionMin).toBe(DEFAULTS.sun_pointing_fraction_min);
  });
});

describe('MG-15 hinges and teams', () => {
  it('maps slot and slots to hinges (2 to 6 hinges, shared beyond six players)', () => {
    expect(resolveConfig({ slot: 0, slots: 1 }, 'STANDARD', 'ENGINEER').hinges).toBe(2);
    expect(resolveConfig({ slot: 3, slots: 4 }, 'STANDARD', 'ENGINEER').myHinge).toBe(3);
    const big = resolveConfig({ slot: 8, slots: 10 }, 'STANDARD', 'ENGINEER');
    expect(big.hinges).toBe(MAX_HINGES);
    expect(big.myHinge).toBe(2);
  });

  it('windows follow the release order and the run fits 75 % of the time (Standard)', () => {
    for (const slots of [1, 2, 4, 6, 10]) {
      const cfg = resolveConfig({ slot: 0, slots }, 'STANDARD', 'ENGINEER');
      const plan = createPlan(cfg, 9, RUN_S);
      for (let k = 1; k < plan.hinges.length; k++) expect(plan.hinges[k]!.openStep).toBeGreaterThan(plan.hinges[k - 1]!.closeStep);
      expect(plan.totalSteps).toBeLessThanOrEqual(0.75 * RUN_S * STEP_HZ);
      expect(plan.phase2Step).toBeGreaterThan(plan.hinges[plan.hinges.length - 1]!.closeStep);
    }
  });

  it('early and late releases are out of order', () => {
    const early = new Mg15Sim(STANDARD, 4, RUN_S);
    early.press();
    early.tick();
    expect(early.mine.state).toBe('early');
    const late = runScripted(STANDARD, 4, RUN_S, () => undefined);
    expect(late.mine.state).toBe('late');
    const onTime = runScripted(STANDARD, 4, RUN_S, (s) => {
      if (s.step === s.mine.closeStep) s.press();
    });
    expect(onTime.mine.state).toBe('done');
    const justLate = runScripted(STANDARD, 4, RUN_S, (s) => {
      if (s.step === s.mine.closeStep + 1) s.press();
    });
    expect(justLate.mine.state).toBe('late');
    const justEarly = runScripted(STANDARD, 4, RUN_S, (s) => {
      if (s.step === s.mine.openStep - 1) s.press();
    });
    expect(justEarly.mine.state).toBe('early');
  });

  it('teammates from env.coop are decoration and never change this phone result', () => {
    const pilot = () => new Mg15Autopilot();
    const p1 = pilot();
    const a = runScripted(STANDARD, 12, RUN_S, (s) => p1.apply(s));
    const p2 = pilot();
    const b = runScripted(STANDARD, 12, RUN_S, (s) => {
      if (s.step === 10) s.crewReleased(0);
      if (s.step === 50) s.crewReleased(3);
      p2.apply(s);
    });
    expect(b.plan.hinges[0]!.fromCoop).toBe(true);
    expect(b.plan.hinges[0]!.state).toBe('early');
    expect(b.result()).toEqual(a.result());
  });
});

describe('MG-15 modes and difficulty', () => {
  it('Relaxed: longer windows and a wider Sun-pointing zone', () => {
    const r = resolveConfig({ slot: 1, slots: 4 }, 'RELAXED', 'ENGINEER');
    expect(r.windowS).toBeGreaterThan(STANDARD.windowS);
    expect(r.gapS).toBeGreaterThan(STANDARD.gapS);
    expect(r.toleranceDeg).toBeGreaterThan(STANDARD.toleranceDeg * 1.5);
    expect(r.bodyRateDegS).toBeLessThan(STANDARD.bodyRateDegS);
  });

  it('Cadet is easier and Flight Director harder than Engineer', () => {
    const cadet = resolveConfig({ slot: 1, slots: 4 }, 'STANDARD', 'CADET');
    const fd = resolveConfig({ slot: 1, slots: 4 }, 'STANDARD', 'FLIGHT_DIRECTOR');
    expect(cadet.toleranceDeg).toBeGreaterThan(STANDARD.toleranceDeg);
    expect(fd.toleranceDeg).toBeLessThan(STANDARD.toleranceDeg);
    expect(cadet.windowS).toBeGreaterThan(fd.windowS);
    expect(cadet.bodyRateDegS).toBeLessThan(fd.bodyRateDegS);
    // A sluggish player (reacts 0.5 s late) points better with Cadet than with Flight Director.
    const sluggish = (cfg: typeof STANDARD) => {
      let sum = 0;
      for (const seed of SEEDS.slice(0, 10)) {
        const sim = runScripted(cfg, seed, RUN_S, (s) => {
          if (s.phase === 2) s.turn(180 - s.bodyAt(s.timeS - 0.5) - s.driveAim);
        });
        sum += sim.score().pointingFraction;
      }
      return sum;
    };
    expect(sluggish(cadet)).toBeGreaterThan(sluggish(fd));
  });
});

describe('MG-15 runs', () => {
  for (const mode of ['STANDARD', 'RELAXED', 'ONE_BUTTON'] as const) {
    for (const assist of ['CADET', 'ENGINEER', 'FLIGHT_DIRECTOR'] as const) {
      it(`a scripted good player succeeds on ${SEEDS.length} seeds (${mode}, ${assist})`, () => {
        for (const seed of SEEDS) {
          for (const [slot, slots] of [[0, 1], [2, 4], [5, 6]] as const) {
            const cfg = resolveConfig({ slot, slots }, mode, assist);
            const pilot = new Mg15Autopilot();
            const sim = runScripted(cfg, seed, RUN_S, (s) => pilot.apply(s));
            expect(sim.score().success, `seed ${seed} slot ${slot}/${slots}`).toBe(true);
          }
        }
      });
    }
  }

  it('an idle player fails in every mode', () => {
    for (const mode of ['STANDARD', 'RELAXED', 'ONE_BUTTON'] as const) {
      for (const seed of SEEDS) {
        const sim = runScripted(resolveConfig({ slot: 1, slots: 3 }, mode, 'ENGINEER'), seed, RUN_S, () => undefined);
        expect(sim.score().success).toBe(false);
      }
    }
  });

  it('one-button: a press releases the hinge, later presses nudge the wing', () => {
    const cfg = resolveConfig({ slot: 1, slots: 3 }, 'ONE_BUTTON', 'ENGINEER');
    const pilot = new Mg15Autopilot();
    const sim = runScripted(cfg, 31, RUN_S, (s) => pilot.apply(s));
    expect(sim.mine.state).toBe('done');
    expect(sim.nudges).toBeGreaterThan(2);
    expect(sim.score().success).toBe(true);
  });

  it('is deterministic from the seed', () => {
    const a = runScripted(STANDARD, 99, RUN_S, (s) => new Mg15Autopilot(6).apply(s));
    const b = runScripted(STANDARD, 99, RUN_S, (s) => new Mg15Autopilot(6).apply(s));
    expect(a.pointSteps).toBe(b.pointSteps);
    expect(a.thetaDeg).toBe(b.thetaDeg);
    expect(a.result()).toEqual(b.result());
  });

  it('does not depend on the frame rate', () => {
    const play = (frameMs: number) => {
      const sim = new Mg15Sim(STANDARD, 7, RUN_S);
      const pilot = new Mg15Autopilot();
      const stepper = new FixedStepper();
      while (!sim.done) {
        for (let k = stepper.advance(frameMs); k > 0 && !sim.done; k--) {
          pilot.apply(sim);
          sim.tick();
        }
      }
      return sim;
    };
    const a = play(1000 / 60);
    expect(play(1000 / 30).pointSteps).toBe(a.pointSteps);
    expect(play(1000 / 120).pointSteps).toBe(a.pointSteps);
  });
});
