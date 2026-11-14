import { describe, expect, it } from 'vitest';
import { FixedStepper, STEP_HZ } from '../MG-13/kit';
import { CAPACITY_WH, createScenario, ECLIPSE_MIN, LOAD_W, LOADS, Mg18Autopilot, Mg18Sim, ORBIT_SLICE_MIN, resolveConfig, runScripted, scoreRun, SOLAR_W, solarAt, SUN_BEFORE_MIN } from './model';

const RUN_S = 25;
const STANDARD = resolveConfig({}, 'STANDARD', 'ENGINEER');
const SEEDS = Array.from({ length: 24 }, (_, i) => (i * 2654435761 + 7) >>> 0);
const allOn = () => undefined;

describe('MG-18 energy balance (hand-computed)', () => {
  it('solar input is zero in eclipse and full in sunlight', () => {
    expect(solarAt(0)).toBe(SOLAR_W);
    expect(solarAt(SUN_BEFORE_MIN + 10)).toBe(0);
    expect(solarAt(ORBIT_SLICE_MIN)).toBe(SOLAR_W);
  });

  it('all loads on in eclipse drain 74 W: 1.233 Wh per orbit minute', () => {
    const sim = new Mg18Sim(STANDARD, 1, RUN_S);
    while (sim.orbitMin < SUN_BEFORE_MIN + 5) sim.tick();
    const e0 = sim.energyWh;
    const steps = Math.round(1 / sim.minPerStep);
    for (let i = 0; i < steps; i++) sim.tick();
    expect(LOAD_W.heaters + LOAD_W.radio + LOAD_W.instrument + LOAD_W.wheels).toBe(74);
    expect(e0 - sim.energyWh).toBeCloseTo((74 * steps * sim.minPerStep) / 60, 6);
    expect(74 / 60).toBeCloseTo(1.2333, 4);
  });
});

describe('MG-18 scoring', () => {
  it('perfect needs the instrument share as well and implies success', () => {
    expect(scoreRun(true, 0.6, STANDARD).perfect).toBe(true);
    expect(scoreRun(true, 0.5999, STANDARD).perfect).toBe(false);
    expect(scoreRun(false, 1, STANDARD)).toEqual({ success: false, perfect: false, score: 0.5 });
    expect(scoreRun(true, 0.5, STANDARD).score).toBeGreaterThan(scoreRun(true, 0.2, STANDARD).score);
  });

  it('the battery must stay above the red line: reaching it is a failure, just above is not', () => {
    const at = new Mg18Sim({ ...STANDARD, redLineWh: 1 }, 3, RUN_S);
    while (at.orbitMin < SUN_BEFORE_MIN + 2) at.tick();
    expect(at.failure).toBe('none');
    // In eclipse the charge only falls: put it exactly on a red line just below.
    const line = at.energyWh - (74 * at.minPerStep) / 60;
    (at.config as { redLineWh: number }).redLineWh = line;
    at.tick();
    expect(at.energyWh).toBeCloseTo(line, 9);
    expect(at.failure).toBe('battery');
    const above = new Mg18Sim(STANDARD, 3, RUN_S);
    above.energyWh = STANDARD.redLineWh + 1;
    above.tick();
    expect(above.failure).toBe('none');
  });

  it('heaters off fails; radio off in the contact window fails only after the 0.4 s grace', () => {
    const h = runScripted(STANDARD, 5, RUN_S, (s) => {
      if (s.step === 10) s.toggle('heaters');
    });
    expect(h.failure).toBe('heaters');
    const run = (backAfterS: number) => {
      const r = new Mg18Sim({ ...STANDARD, capacityWh: 500, redLineWh: 1 }, 5, RUN_S);
      r.energyWh = 400;
      let offAt = -1;
      while (!r.done) {
        if (r.inContact && offAt < 0) {
          offAt = r.step;
          r.toggle('radio');
        } else if (offAt >= 0 && r.step === offAt + Math.round(backAfterS * STEP_HZ)) r.toggle('radio');
        r.tick();
      }
      return r.failure;
    };
    expect(run(0.3)).toBe('none');
    expect(run(0.6)).toBe('radio');
  });

  it('takes the red line and the perfect share from the host parameters', () => {
    const c = resolveConfig({ red_line_fraction: 0.4, perfect_instrument_fraction: 0.3 }, 'STANDARD', 'ENGINEER');
    expect(c.redLineWh).toBeCloseTo(c.capacityWh * 0.4, 10);
    expect(scoreRun(true, 0.3, c).perfect).toBe(true);
  });
});

describe('MG-18 modes and difficulty', () => {
  it('Relaxed has a bigger battery; Cadet easier and Flight Director harder', () => {
    expect(resolveConfig({}, 'RELAXED', 'ENGINEER').capacityWh).toBeGreaterThan(STANDARD.capacityWh * 1.3);
    expect(resolveConfig({}, 'STANDARD', 'CADET').capacityWh).toBeGreaterThan(STANDARD.capacityWh);
    expect(resolveConfig({}, 'STANDARD', 'FLIGHT_DIRECTOR').capacityWh).toBeLessThan(STANDARD.capacityWh);
    expect(STANDARD.capacityWh).toBe(CAPACITY_WH);
  });

  it('Relaxed lets the same careful player run the instrument longer', () => {
    let a = 0;
    let b = 0;
    for (const seed of SEEDS.slice(0, 8)) {
      const p1 = new Mg18Autopilot();
      a += runScripted(STANDARD, seed, RUN_S, (s) => p1.apply(s)).instrumentFraction;
      const p2 = new Mg18Autopilot();
      b += runScripted(resolveConfig({}, 'RELAXED', 'ENGINEER'), seed, RUN_S, (s) => p2.apply(s)).instrumentFraction;
    }
    expect(b).toBeGreaterThan(a);
  });
});

describe('MG-18 runs', () => {
  for (const mode of ['STANDARD', 'RELAXED', 'ONE_BUTTON'] as const) {
    for (const assist of ['CADET', 'ENGINEER', 'FLIGHT_DIRECTOR'] as const) {
      it(`a scripted good player succeeds on ${SEEDS.length} seeds (${mode}, ${assist})`, () => {
        const cfg = resolveConfig({}, mode, assist);
        for (const seed of SEEDS) {
          const pilot = new Mg18Autopilot();
          const sim = runScripted(cfg, seed, RUN_S, (s) => pilot.apply(s));
          expect(sim.failure, `seed ${seed}`).toBe('none');
          expect(sim.instrumentFraction).toBeGreaterThan(mode === 'ONE_BUTTON' ? 0.15 : 0.3);
        }
      });
    }
  }

  it('leaving everything on fails (battery); switching everything off fails (heaters)', () => {
    for (const seed of SEEDS) {
      expect(runScripted(STANDARD, seed, RUN_S, allOn).failure).toBe('battery');
      const off = runScripted(STANDARD, seed, RUN_S, (s) => {
        if (s.step < LOADS.length) s.toggle(LOADS[s.step]!);
      });
      expect(off.failure).toBe('heaters');
    }
  });

  it('an idle player fails in every mode', () => {
    for (const mode of ['STANDARD', 'RELAXED', 'ONE_BUTTON'] as const) {
      for (const seed of SEEDS) expect(runScripted(resolveConfig({}, mode, 'ENGINEER'), seed, RUN_S, allOn).score().success, `${mode} ${seed}`).toBe(false);
    }
  });

  it('one-button: presses switch the highlighted load and never the heaters', () => {
    const cfg = resolveConfig({}, 'ONE_BUTTON', 'ENGINEER');
    const sim = runScripted(cfg, 9, RUN_S, (s) => {
      if (s.step % 30 === 0) s.press();
    });
    expect(sim.on.heaters).toBe(true);
    expect(sim.toggles).toBeGreaterThan(10);
    const pilot = new Mg18Autopilot();
    expect(runScripted(cfg, 9, RUN_S, (s) => pilot.apply(s)).score().success).toBe(true);
  });

  it('the eclipse lasts 35 of the 42 orbit minutes and the run uses 97 % of the time', () => {
    const sim = runScripted(STANDARD, 2, RUN_S, allOn);
    expect(ECLIPSE_MIN).toBe(35);
    expect(ORBIT_SLICE_MIN).toBe(42);
    expect(sim.step).toBe(Math.round(RUN_S * 0.97 * STEP_HZ));
  });

  it('is deterministic and does not depend on the frame rate', () => {
    const play = (frameMs: number) => {
      const sim = new Mg18Sim(STANDARD, 13, RUN_S);
      const pilot = new Mg18Autopilot();
      const st = new FixedStepper();
      while (!sim.done) {
        for (let k = st.advance(frameMs); k > 0 && !sim.done; k--) {
          pilot.apply(sim);
          sim.tick();
        }
      }
      return [sim.energyWh, sim.instrumentSteps, sim.toggles];
    };
    expect(play(1000 / 30)).toEqual(play(1000 / 60));
    expect(play(1000 / 144)).toEqual(play(1000 / 60));
    expect(createScenario(STANDARD, 4)).toEqual(createScenario(STANDARD, 4));
  });
});
