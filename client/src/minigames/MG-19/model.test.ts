import { describe, expect, it } from 'vitest';
import { FixedStepper, STEP_HZ } from '../MG-13/kit';
import { CO2_DEADLINE, CO2_START, CORRECT_SLOT, Mg19Autopilot, Mg19Sim, PARTS, resolveConfig, runScripted, scoreRun, SLOTS } from './model';

const RUN_S = 35;
const STANDARD = resolveConfig({ part: 1 }, 'STANDARD', 'ENGINEER');
const SEEDS = Array.from({ length: 24 }, (_, i) => (i * 2654435761 + 41) >>> 0);

describe('MG-19 rules', () => {
  it('every part has its own slot', () => {
    expect(new Set(CORRECT_SLOT).size).toBe(PARTS.length);
    expect(CORRECT_SLOT.every((s) => s >= 0 && s < SLOTS.length)).toBe(true);
  });

  it('part comes from params.part, else slot mod 5', () => {
    expect(resolveConfig({ part: 3 }, 'STANDARD', 'ENGINEER').part).toBe(3);
    expect(resolveConfig({ slot: 7 }, 'STANDARD', 'ENGINEER').part).toBe(2);
  });

  it('a wrong slot locks the part out for 3 s and counts', () => {
    const sim = new Mg19Sim(STANDARD, 1, RUN_S);
    const wrong = SLOTS.findIndex((_, i) => i !== CORRECT_SLOT[1]);
    sim.place(wrong);
    sim.tick();
    expect(sim.wrong).toBe(1);
    expect(sim.placed).toBe(false);
    sim.place(CORRECT_SLOT[1]!);
    sim.tick();
    expect(sim.placed).toBe(false); // still locked out
    for (let i = 0; i < 3 * STEP_HZ; i++) sim.tick();
    sim.place(CORRECT_SLOT[1]!);
    sim.tick();
    expect(sim.placed).toBe(true);
  });
});

describe('MG-19 scoring', () => {
  const T = Math.round(RUN_S * 0.75 * STEP_HZ);
  it('success when placed before the deadline, not at it', () => {
    expect(scoreRun(T - 1, 0, T, STANDARD).success).toBe(true);
    expect(scoreRun(T, 0, T, STANDARD).success).toBe(false);
    expect(scoreRun(-1, 0, T, STANDARD).success).toBe(false);
  });

  it('perfect: first try within half the time; perfect implies success; score rises with speed', () => {
    expect(scoreRun(T / 2, 0, T, STANDARD).perfect).toBe(true);
    expect(scoreRun(T / 2 + 1, 0, T, STANDARD).perfect).toBe(false);
    expect(scoreRun(10, 1, T, STANDARD).perfect).toBe(false);
    for (let s = 0; s < T; s += 97) for (const w of [0, 1, 2]) {
      const r = scoreRun(s, w, T, STANDARD);
      if (r.perfect) expect(r.success).toBe(true);
    }
    expect(scoreRun(100, 0, T, STANDARD).score).toBeGreaterThan(scoreRun(2000, 0, T, STANDARD).score);
    expect(scoreRun(100, 0, T, STANDARD).score).toBeGreaterThan(scoreRun(100, 1, T, STANDARD).score);
  });
});

describe('MG-19 modes and difficulty', () => {
  it('Relaxed: CO₂ rises more slowly (more time)', () => {
    const r = new Mg19Sim(resolveConfig({ part: 0 }, 'RELAXED', 'ENGINEER'), 1, RUN_S);
    const s = new Mg19Sim(STANDARD, 1, RUN_S);
    expect(r.deadlineSteps).toBeGreaterThan(s.deadlineSteps);
    for (let i = 0; i < 600; i++) {
      r.tick();
      s.tick();
    }
    expect(r.co2).toBeLessThan(s.co2);
  });

  it('Cadet has a shorter wrong-slot penalty and Flight Director a longer one', () => {
    expect(resolveConfig({}, 'STANDARD', 'CADET').penaltyS).toBeLessThan(STANDARD.penaltyS);
    expect(resolveConfig({}, 'STANDARD', 'FLIGHT_DIRECTOR').penaltyS).toBeGreaterThan(STANDARD.penaltyS);
  });

  it('CO₂ goes from the start value to the deadline value on the game scale', () => {
    const sim = new Mg19Sim(STANDARD, 2, RUN_S, false);
    expect(sim.co2).toBeCloseTo(CO2_START, 9);
    while (!sim.done) sim.tick();
    expect(sim.co2).toBeCloseTo(CO2_DEADLINE, 9);
  });
});

describe('MG-19 runs', () => {
  for (const mode of ['STANDARD', 'RELAXED', 'ONE_BUTTON'] as const) {
    for (const assist of ['CADET', 'ENGINEER', 'FLIGHT_DIRECTOR'] as const) {
      it(`a scripted good crew member succeeds on ${SEEDS.length} seeds × 5 parts (${mode}, ${assist})`, () => {
        for (const seed of SEEDS) {
          for (let part = 0; part < PARTS.length; part++) {
            const cfg = resolveConfig({ part }, mode, assist);
            const pilot = new Mg19Autopilot();
            const sim = runScripted(cfg, seed, RUN_S, (s) => pilot.apply(s));
            expect(sim.score().success, `seed ${seed} part ${part}`).toBe(true);
            expect(sim.score().perfect).toBe(true);
            expect(sim.complete).toBe(true);
          }
        }
      });
    }
  }

  it('one wrong try still succeeds but is not perfect', () => {
    const pilot = new Mg19Autopilot(1.2, true);
    const sim = runScripted(STANDARD, 5, RUN_S, (s) => pilot.apply(s));
    expect(sim.wrong).toBe(1);
    expect(sim.score().success).toBe(true);
    expect(sim.score().perfect).toBe(false);
  });

  it('an idle crew member fails', () => {
    for (const mode of ['STANDARD', 'RELAXED', 'ONE_BUTTON'] as const) {
      for (const seed of SEEDS) expect(runScripted(resolveConfig({ part: 2 }, mode, 'ENGINEER'), seed, RUN_S, () => undefined).score().success).toBe(false);
    }
  });

  it('teammates from env.coop fill their slots and never change this phone result', () => {
    const a = new Mg19Sim(STANDARD, 7, RUN_S, false);
    a.teamPlaced(0, CORRECT_SLOT[0]!);
    a.teamPlaced(2, 0); // a wrong report is ignored
    expect(a.filledBy[CORRECT_SLOT[0]!]).toBe('team');
    expect(a.filled.filter((p) => p >= 0)).toHaveLength(1);
    const p1 = new Mg19Autopilot();
    const p2 = new Mg19Autopilot();
    const b = runScripted(STANDARD, 7, RUN_S, (s) => p1.apply(s));
    const c = runScripted(STANDARD, 7, RUN_S, (s) => {
      if (s.step === 50) s.teamPlaced(3, CORRECT_SLOT[3]!);
      p2.apply(s);
    });
    expect(c.result()).toEqual(b.result());
  });

  it('one-button: a press places the part into the highlighted slot', () => {
    const cfg = resolveConfig({ part: 4 }, 'ONE_BUTTON', 'ENGINEER');
    const sim = new Mg19Sim(cfg, 3, RUN_S);
    sim.press();
    sim.tick();
    expect(sim.highlight === 0 || sim.wrong + (sim.placed ? 1 : 0) === 1).toBe(true);
  });

  it('is deterministic and does not depend on the frame rate', () => {
    const play = (frameMs: number) => {
      const sim = new Mg19Sim(STANDARD, 11, RUN_S);
      const pilot = new Mg19Autopilot();
      const st = new FixedStepper();
      while (!sim.done) {
        for (let k = st.advance(frameMs); k > 0 && !sim.done; k--) {
          pilot.apply(sim);
          sim.tick();
        }
      }
      return [sim.placedStep, sim.step, sim.filledBy.join()];
    };
    expect(play(1000 / 30)).toEqual(play(1000 / 60));
    expect(play(1000 / 144)).toEqual(play(1000 / 60));
  });
});
