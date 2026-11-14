import { describe, expect, it } from 'vitest';
import { DT_S, FixedStepper, STEP_HZ } from '../MG-13/kit';
import { DEFAULTS, Mg16Autopilot, Mg16Sim, resolveConfig, runScripted, scoreContact, T_FWD, T_LEFT, THRUST_CM_S2 } from './model';

const RUN_S = 40;
const STANDARD = resolveConfig({}, 'STANDARD', 'ENGINEER');
const SEEDS = Array.from({ length: 24 }, (_, i) => (i * 2654435761 + 23) >>> 0);

describe('MG-16 scoring (strict "below" thresholds)', () => {
  it('alignment and speed must both be strictly below 10', () => {
    expect(scoreContact({ alignCm: 9.99, speedCmS: 9.99 }, STANDARD).success).toBe(true);
    expect(scoreContact({ alignCm: 10, speedCmS: 5 }, STANDARD).success).toBe(false);
    expect(scoreContact({ alignCm: 5, speedCmS: 10 }, STANDARD).success).toBe(false);
  });

  it('perfect below 5 on both; perfect implies success; value is the contact speed or null', () => {
    expect(scoreContact({ alignCm: 4.99, speedCmS: 4.99 }, STANDARD).perfect).toBe(true);
    expect(scoreContact({ alignCm: 5, speedCmS: 4 }, STANDARD).perfect).toBe(false);
    for (let a = 0; a < 15; a += 0.5) {
      for (let v = 0; v < 15; v += 0.5) {
        const r = scoreContact({ alignCm: a, speedCmS: v }, STANDARD);
        if (r.perfect) expect(r.success).toBe(true);
      }
    }
    expect(scoreContact({ alignCm: 2, speedCmS: 6.04 }, STANDARD).value).toBe(6);
    expect(scoreContact(null, STANDARD)).toEqual({ success: false, perfect: false, score: 0, value: null });
    expect(scoreContact({ alignCm: 1, speedCmS: 2 }, STANDARD).score).toBeGreaterThan(scoreContact({ alignCm: 8, speedCmS: 9 }, STANDARD).score);
  });

  it('takes the thresholds from the host parameters', () => {
    const c = resolveConfig({ alignment_error_below_cm: 20, contact_speed_below_cm_s: 15 }, 'STANDARD', 'ENGINEER');
    expect(scoreContact({ alignCm: 19, speedCmS: 14 }, c).success).toBe(true);
    expect(STANDARD.alignBelowCm).toBe(DEFAULTS.alignment_error_below_cm);
  });
});

describe('MG-16 physics', () => {
  it("Newton's first law: with no thrust the closing speed and the drift never change", () => {
    const sim = new Mg16Sim(STANDARD, 4, RUN_S);
    const v0 = sim.closing;
    const vy0 = sim.vy;
    for (let i = 0; i < 600; i++) sim.tick();
    expect(sim.closing).toBe(v0);
    expect(sim.vy).toBe(vy0);
  });

  it('one second of forward thrust adds 3 cm/s; lateral thrust adds 3 cm/s per second too', () => {
    const sim = new Mg16Sim(STANDARD, 4, RUN_S);
    const v0 = sim.closing;
    const vy0 = sim.vy;
    sim.setThrust(T_FWD | T_LEFT);
    for (let i = 0; i < STEP_HZ; i++) sim.tick();
    expect(sim.closing - v0).toBeCloseTo(THRUST_CM_S2, 9);
    expect(sim.vy - vy0).toBeCloseTo(THRUST_CM_S2, 9);
    expect(DT_S * STEP_HZ).toBeCloseTo(1, 12);
  });
});

describe('MG-16 modes and difficulty', () => {
  it('Relaxed: larger alignment target and slower drift', () => {
    const r = resolveConfig({}, 'RELAXED', 'ENGINEER');
    expect(r.alignBelowCm).toBe(15);
    expect(r.speedBelowCmS).toBe(10);
    expect(r.driftHi).toBeLessThan(STANDARD.driftHi);
  });

  it('Cadet drifts less and Flight Director more than Engineer', () => {
    expect(resolveConfig({}, 'STANDARD', 'CADET').driftHi).toBeLessThan(STANDARD.driftHi);
    expect(resolveConfig({}, 'STANDARD', 'FLIGHT_DIRECTOR').driftHi).toBeGreaterThan(STANDARD.driftHi);
  });
});

describe('MG-16 runs', () => {
  for (const mode of ['STANDARD', 'RELAXED', 'ONE_BUTTON'] as const) {
    for (const assist of ['CADET', 'ENGINEER', 'FLIGHT_DIRECTOR'] as const) {
      it(`a scripted good pilot docks on ${SEEDS.length} seeds (${mode}, ${assist})`, () => {
        const cfg = resolveConfig({}, mode, assist);
        for (const seed of SEEDS) {
          const pilot = new Mg16Autopilot();
          const sim = runScripted(cfg, seed, RUN_S, (s) => pilot.apply(s));
          expect(sim.contact, `seed ${seed}`).not.toBeNull();
          expect(sim.score().success, `seed ${seed} ${JSON.stringify(sim.contact)}`).toBe(true);
          expect(sim.step).toBeLessThanOrEqual(RUN_S * STEP_HZ);
        }
      });
    }
  }

  it('an idle pilot fails: Standard misses the port, One-button hits too fast', () => {
    for (const mode of ['STANDARD', 'RELAXED', 'ONE_BUTTON'] as const) {
      for (const seed of SEEDS) expect(runScripted(resolveConfig({}, mode, 'ENGINEER'), seed, RUN_S, () => undefined).score().success, `${mode} ${seed}`).toBe(false);
    }
    const ob = runScripted(resolveConfig({}, 'ONE_BUTTON', 'ENGINEER'), 3, RUN_S, () => undefined);
    expect(ob.contact!.speedCmS).toBeGreaterThan(10);
  });

  it('ramming in at full thrust fails on speed; value reports the speed', () => {
    const sim = runScripted(STANDARD, 6, RUN_S, (s) => s.setThrust(T_FWD));
    expect(sim.contact!.speedCmS).toBeGreaterThan(10);
    expect(sim.result().value).toBeCloseTo(sim.contact!.speedCmS, 0);
  });

  it('one-button: presses fire braking pulses', () => {
    const pilot = new Mg16Autopilot();
    const sim = runScripted(resolveConfig({}, 'ONE_BUTTON', 'ENGINEER'), 8, RUN_S, (s) => pilot.apply(s));
    expect(sim.brakes).toBeGreaterThan(2);
    expect(sim.score().success).toBe(true);
  });

  it('is deterministic and does not depend on the frame rate', () => {
    const play = (frameMs: number) => {
      const sim = new Mg16Sim(STANDARD, 17, RUN_S);
      const pilot = new Mg16Autopilot();
      const st = new FixedStepper();
      while (!sim.done) {
        for (let k = st.advance(frameMs); k > 0 && !sim.done; k--) {
          pilot.apply(sim);
          sim.tick();
        }
      }
      return [sim.contact, sim.step];
    };
    expect(play(1000 / 30)).toEqual(play(1000 / 60));
    expect(play(1000 / 144)).toEqual(play(1000 / 60));
  });
});
