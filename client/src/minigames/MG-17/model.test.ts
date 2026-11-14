import { describe, expect, it } from 'vitest';
import { FixedStepper, STEP_HZ } from '../MG-13/kit';
import { BINS, CATALOG, correctBin, createAlarms, DEFAULTS, Mg17Autopilot, Mg17Sim, resolveConfig, roleSystems, runScripted, scoreRun } from './model';

const RUN_S = 20;
const STANDARD = resolveConfig({}, 'STANDARD', 'ENGINEER');
const SEEDS = Array.from({ length: 24 }, (_, i) => (i * 2654435761 + 31) >>> 0);

describe('MG-17 cheat sheet', () => {
  it('1201 and 1202 are the only real alarms and are safe to continue: MONITOR for every role', () => {
    const real = CATALOG.filter((a) => a.real).map((a) => a.code);
    expect(real).toEqual(['1201', '1202']);
    for (const role of [null, 0, 5, 'INCO']) for (const a of CATALOG.filter((x) => x.real)) expect(correctBin(a, roleSystems(role))).toBe('monitor');
  });

  it('advisory → IGNORE, caution → MONITOR (ACT in your own subsystem), warning → ACT', () => {
    const generic = roleSystems(null);
    const eecom = roleSystems(5); // EECOM owns power and thermal
    const pwr05 = CATALOG.find((a) => a.code === 'PWR-05')!;
    expect(correctBin(CATALOG.find((a) => a.code === 'COM-02')!, generic)).toBe('ignore');
    expect(correctBin(pwr05, generic)).toBe('monitor');
    expect(correctBin(pwr05, eecom)).toBe('act');
    expect(correctBin(CATALOG.find((a) => a.code === 'GNC-07')!, generic)).toBe('act');
    expect(roleSystems('INCO')).toEqual(['COM']);
    expect(roleSystems(0)).toEqual([]);
  });

  it('fictional codes follow the number scheme: 1–2 advisory, 4–5 caution, 7–9 warning', () => {
    for (const a of CATALOG.filter((x) => !x.real)) {
      const n = Number(a.code.slice(-2));
      const lv = n <= 2 ? 'advisory' : n <= 5 ? 'caution' : 'warning';
      expect(a.level, a.code).toBe(lv);
    }
  });
});

describe('MG-17 scoring', () => {
  it('succeeds at exactly 85 % correct and fails one below', () => {
    // 20 alarms: 17 correct is exactly 85 %.
    expect(scoreRun(17, 20, STANDARD).success).toBe(true);
    expect(scoreRun(16, 20, STANDARD).success).toBe(false);
    // 12 alarms: 85 % is 10.2, so 11 are needed.
    expect(scoreRun(11, 12, STANDARD).success).toBe(true);
    expect(scoreRun(10, 12, STANDARD).success).toBe(false);
  });

  it('perfect means all correct and implies success', () => {
    expect(scoreRun(12, 12, STANDARD).perfect).toBe(true);
    expect(scoreRun(11, 12, STANDARD).perfect).toBe(false);
    for (let k = 0; k <= 12; k++) if (scoreRun(k, 12, STANDARD).perfect) expect(scoreRun(k, 12, STANDARD).success).toBe(true);
  });

  it('takes the threshold, count and role from the host parameters', () => {
    const c = resolveConfig({ correct_fraction_min: 0.5, alarm_count: 8, role: 'EECOM' }, 'STANDARD', 'ENGINEER');
    expect(c.count).toBe(8);
    expect(c.systems).toEqual(['PWR', 'THM']);
    expect(scoreRun(4, 8, c).success).toBe(true);
    expect(STANDARD.correctMin).toBe(DEFAULTS.correct_fraction_min);
  });
});

describe('MG-17 alarms', () => {
  it('every run includes 1201 and 1202 and a caution in the role’s own subsystem', () => {
    const c = resolveConfig({ role: 6 }, 'STANDARD', 'ENGINEER'); // INCO
    for (const seed of SEEDS) {
      const al = createAlarms(c, seed, RUN_S);
      expect(al.some((a) => a.def.code === '1201')).toBe(true);
      expect(al.some((a) => a.def.code === '1202')).toBe(true);
      expect(al.some((a) => a.def.category === 'COM' && a.def.level === 'caution' && a.answer === 'act')).toBe(true);
      expect(al[al.length - 1]!.arriveStep).toBeLessThan((RUN_S * 0.75 - 1.5) * STEP_HZ);
    }
  });
});

describe('MG-17 modes and difficulty', () => {
  it('Relaxed: alarms arrive more slowly; Cadet easier, Flight Director harder', () => {
    expect(resolveConfig({}, 'RELAXED', 'ENGINEER').spacingS).toBeGreaterThan(STANDARD.spacingS * 1.4);
    expect(resolveConfig({}, 'STANDARD', 'CADET').spacingS).toBeGreaterThan(STANDARD.spacingS);
    expect(resolveConfig({}, 'STANDARD', 'FLIGHT_DIRECTOR').spacingS).toBeLessThan(STANDARD.spacingS);
    expect(resolveConfig({}, 'ONE_BUTTON', 'CADET').cycleS).toBeGreaterThan(resolveConfig({}, 'ONE_BUTTON', 'FLIGHT_DIRECTOR').cycleS);
  });
});

describe('MG-17 runs', () => {
  for (const mode of ['STANDARD', 'RELAXED', 'ONE_BUTTON'] as const) {
    for (const assist of ['CADET', 'ENGINEER', 'FLIGHT_DIRECTOR'] as const) {
      it(`a scripted good operator succeeds on ${SEEDS.length} seeds (${mode}, ${assist})`, () => {
        for (const seed of SEEDS) {
          const cfg = resolveConfig({ role: seed % 10 }, mode, assist);
          const pilot = new Mg17Autopilot();
          const sim = runScripted(cfg, seed, RUN_S, (s) => pilot.apply(s));
          expect(sim.score().perfect, `seed ${seed} handled ${sim.handled}`).toBe(true);
          expect(sim.step).toBeLessThanOrEqual(RUN_S * STEP_HZ);
        }
      });
    }
  }

  it('one mistake in 12 still succeeds (11/12), two fail (10/12)', () => {
    const one = runScripted(STANDARD, 4, RUN_S, ((p) => (s: Mg17Sim) => p.apply(s))(new Mg17Autopilot(0.45, new Set([3]))));
    expect(one.correct).toBe(11);
    expect(one.score().success).toBe(true);
    const two = runScripted(STANDARD, 4, RUN_S, ((p) => (s: Mg17Sim) => p.apply(s))(new Mg17Autopilot(0.45, new Set([3, 7]))));
    expect(two.score().success).toBe(false);
  });

  it('an idle operator fails; unsorted alarms count as wrong', () => {
    for (const mode of ['STANDARD', 'RELAXED', 'ONE_BUTTON'] as const) {
      for (const seed of SEEDS) {
        const sim = runScripted(resolveConfig({}, mode, 'ENGINEER'), seed, RUN_S, () => undefined);
        expect(sim.score()).toEqual({ success: false, perfect: false, score: 0 });
      }
    }
  });

  it('one-button: a press picks the highlighted bin for the front alarm', () => {
    const cfg = resolveConfig({}, 'ONE_BUTTON', 'ENGINEER');
    const sim = new Mg17Sim(cfg, 2, RUN_S);
    while (!sim.front) sim.tick();
    const f = sim.front!;
    sim.press();
    sim.tick();
    expect(f.given).toBe(BINS[0]);
  });

  it('is deterministic and does not depend on the frame rate', () => {
    const play = (frameMs: number) => {
      const sim = new Mg17Sim(STANDARD, 19, RUN_S);
      const pilot = new Mg17Autopilot();
      const st = new FixedStepper();
      while (!sim.done) {
        for (let k = st.advance(frameMs); k > 0 && !sim.done; k--) {
          pilot.apply(sim);
          sim.tick();
        }
      }
      return sim.alarms.map((a) => [a.def.code, a.given, a.givenStep]);
    };
    expect(play(1000 / 30)).toEqual(play(1000 / 60));
    expect(play(1000 / 144)).toEqual(play(1000 / 60));
  });
});
