import { describe, expect, it } from 'vitest';
import { FixedStepper, STEP_HZ } from '../MG-13/kit';
import { DEFAULTS, dvForPeriapsis, Mg20Autopilot, Mg20Sim, MU_EARTH, periapsisKm, periapsisKmFromH, resolveConfig, runScripted, scoreRun, SETTLE_S } from './model';

const RUN_S = 15;
const STANDARD = resolveConfig({}, 'STANDARD', 'ENGINEER');

describe('MG-20 physics (hand-computed)', () => {
  it('a 100 m/s retrograde burn from a 400 km circular orbit lowers the periapsis to about 58 km', () => {
    // r = 6 771 km; v_c = √(3.986e14 / 6.771e6) = 7 672.6 m/s; v_a = 7 572.6 m/s;
    // a = 1 / (2/r − v_a²/μ) = 1 / (2.95377e-7 − 1.43864e-7) = 6 600.1 km; r_p = 2a − r = 6 429.1 km.
    expect(Math.sqrt(MU_EARTH / 6_771_000)).toBeCloseTo(7672.6, 1);
    expect(periapsisKm(400, 100)).toBeCloseTo(58.1, 0);
    expect(periapsisKmFromH(400, 100)).toBeCloseTo(periapsisKm(400, 100), 6);
  });

  it('no burn keeps the circular orbit; more Δv means a lower periapsis', () => {
    expect(periapsisKm(400, 0)).toBeCloseTo(400, 6);
    expect(periapsisKm(400, 50)).toBeGreaterThan(periapsisKm(400, 100));
    expect(dvForPeriapsis(400, 58.1)).toBeCloseTo(100, 0);
  });
});

describe('MG-20 scoring', () => {
  it('success inside the band (inclusive), fails just outside', () => {
    expect(scoreRun(40, STANDARD).success).toBe(true);
    expect(scoreRun(70, STANDARD).success).toBe(true);
    expect(scoreRun(39.9, STANDARD).success).toBe(false);
    expect(scoreRun(70.1, STANDARD).success).toBe(false);
  });

  it('perfect in the middle half and perfect implies success; value is the periapsis in km', () => {
    expect(scoreRun(47.5, STANDARD).perfect).toBe(true);
    expect(scoreRun(62.5, STANDARD).perfect).toBe(true);
    expect(scoreRun(47.4, STANDARD).perfect).toBe(false);
    for (let p = 0; p <= 120; p += 0.5) {
      const r = scoreRun(p, STANDARD);
      if (r.perfect) expect(r.success).toBe(true);
    }
    expect(scoreRun(55, STANDARD).score).toBe(1);
    expect(scoreRun(58.13, STANDARD).value).toBe(58.1);
  });

  it('takes the band, orbit and burn rate from the host parameters', () => {
    const c = resolveConfig({ target_lo_km: 20, target_hi_km: 30, orbit_altitude_km: 300, burn_rate_ms2: 10 }, 'STANDARD', 'ENGINEER');
    expect([c.loKm, c.hiKm, c.altitudeKm, c.burnRate]).toEqual([20, 30, 300, 10]);
    expect(STANDARD.loKm).toBe(DEFAULTS.target_lo_km);
  });
});

describe('MG-20 modes and difficulty', () => {
  it('Relaxed: wider band and a slower marker', () => {
    const r = resolveConfig({}, 'RELAXED', 'ENGINEER');
    expect(r.hiKm - r.loKm).toBeGreaterThan((STANDARD.hiKm - STANDARD.loKm) * 1.4);
    expect(r.burnRate).toBeLessThan(STANDARD.burnRate);
  });

  it('Cadet is easier and Flight Director harder than Engineer', () => {
    const c = resolveConfig({}, 'STANDARD', 'CADET');
    const f = resolveConfig({}, 'STANDARD', 'FLIGHT_DIRECTOR');
    expect(c.hiKm - c.loKm).toBeGreaterThan(STANDARD.hiKm - STANDARD.loKm);
    expect(f.hiKm - f.loKm).toBeLessThan(STANDARD.hiKm - STANDARD.loKm);
    expect(c.burnRate).toBeLessThan(f.burnRate);
  });
});

describe('MG-20 runs', () => {
  const players = [0.6, 0.9, 1.3, 1.7, 2.2];
  for (const mode of ['STANDARD', 'RELAXED', 'ONE_BUTTON'] as const) {
    for (const assist of ['CADET', 'ENGINEER', 'FLIGHT_DIRECTOR'] as const) {
      for (const toggle of [false, true]) {
        it(`scripted good players succeed (${mode}, ${assist}${toggle ? ', toggle' : ''})`, () => {
          const cfg = resolveConfig({ hold_to_toggle: toggle }, mode, assist);
          // 20+ variations: start time and reaction time.
          for (const start of players) {
            for (const react of [0.03, 0.06, 0.08, 0.1]) {
              const pilot = new Mg20Autopilot(start, react);
              const sim = runScripted(cfg, RUN_S, (s) => pilot.apply(s));
              expect(sim.score().success, `start ${start} react ${react}`).toBe(true);
              expect(sim.step).toBeLessThanOrEqual(RUN_S * STEP_HZ);
            }
          }
        });
      }
    }
  }

  it('an idle player fails (periapsis stays at 400 km, value 400)', () => {
    for (const mode of ['STANDARD', 'RELAXED', 'ONE_BUTTON'] as const) {
      const sim = runScripted(resolveConfig({}, mode, 'ENGINEER'), RUN_S, () => undefined);
      expect(sim.result()).toEqual({ success: false, perfect: false, score: 0, value: 400 });
    }
  });

  it('holding too long overshoots the band and fails', () => {
    const sim = runScripted(STANDARD, RUN_S, (s) => s.hold(true));
    expect(sim.periapsisKm).toBeLessThan(STANDARD.loKm);
    expect(sim.score().success).toBe(false);
  });

  it('play ends 1.5 s after a release at or below the band top', () => {
    const pilot = new Mg20Autopilot();
    const sim = runScripted(STANDARD, RUN_S, (s) => pilot.apply(s));
    expect(sim.step).toBeLessThan(sim.totalSteps);
    expect(SETTLE_S).toBe(1.5);
  });

  it('hold-to-toggle: one press starts, the next stops', () => {
    const cfg = resolveConfig({ hold_to_toggle: true }, 'ONE_BUTTON', 'ENGINEER');
    const sim = new Mg20Sim(cfg, RUN_S);
    sim.hold(true);
    sim.tick();
    sim.hold(false);
    for (let i = 0; i < 120; i++) sim.tick();
    expect(sim.dvMs).toBeCloseTo(cfg.burnRate * (121 / STEP_HZ), 6);
    sim.hold(true);
    sim.tick();
    sim.hold(false);
    const dv = sim.dvMs;
    for (let i = 0; i < 60; i++) sim.tick();
    expect(sim.dvMs).toBe(dv);
    expect(sim.burns).toBe(1);
  });

  it('is deterministic and does not depend on the frame rate', () => {
    const play = (frameMs: number) => {
      const sim = new Mg20Sim(STANDARD, RUN_S);
      const pilot = new Mg20Autopilot();
      const st = new FixedStepper();
      while (!sim.done) {
        for (let k = st.advance(frameMs); k > 0 && !sim.done; k--) {
          pilot.apply(sim);
          sim.tick();
        }
      }
      return [sim.dvMs, sim.step];
    };
    expect(play(1000 / 30)).toEqual(play(1000 / 60));
    expect(play(1000 / 144)).toEqual(play(1000 / 60));
  });
});
