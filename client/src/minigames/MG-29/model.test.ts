import { describe, expect, it } from 'vitest';
import type { AssistLevel, MinigameMode } from '@protocol';
import { FixedStepper, STEP_HZ } from '../MG-02/kit';
import { maxSteps, Mg29Autopilot, Mg29Sim, pickQuestion, QUESTIONS, resolveConfig, runScripted, scoreRun } from './model';
import strings from '../../i18n/strings/en.mg_build.json';

const DUR_S = 10;
const MODES: MinigameMode[] = ['STANDARD', 'RELAXED', 'ONE_BUTTON'];
const ASSISTS: AssistLevel[] = ['CADET', 'ENGINEER', 'FLIGHT_DIRECTOR'];
const SEEDS = Array.from({ length: 24 }, (_, i) => (i * 2654435761 + 5) >>> 0);
const STD = resolveConfig({}, 'STANDARD', 'ENGINEER', DUR_S);

describe('MG-29 bank', () => {
  it('has at least 8 questions with 2 or 3 answers and every string', () => {
    expect(QUESTIONS.length).toBeGreaterThanOrEqual(8);
    const s = strings as Record<string, string>;
    for (const q of QUESTIONS) {
      expect([2, 3]).toContain(q.choices);
      expect(q.answer).toBeLessThan(q.choices);
      expect(s[`minigame.MG-29.q.${q.id}.text`]).toBeTruthy();
      expect(s[`minigame.MG-29.q.${q.id}.why`]).toBeTruthy();
      for (let k = 0; k < q.choices; k++) expect(s[`minigame.MG-29.q.${q.id}.a${k}`]).toBeTruthy();
    }
    expect(QUESTIONS.map((q) => q.fact).filter(Boolean)).toEqual(expect.arrayContaining(['F32', 'F06', 'F12', 'F05']));
  });

  it('params.question picks the question, otherwise the seed does (all of them reachable)', () => {
    expect(new Mg29Sim(resolveConfig({ question: 3 }, 'STANDARD', 'ENGINEER', DUR_S), 1).q.id).toBe('orbit_speed');
    const seen = new Set<number>();
    for (let s = 0; s < 400; s++) seen.add(pickQuestion(STD, s));
    expect(seen.size).toBe(QUESTIONS.length);
    expect(resolveConfig({ question: 99 }, 'STANDARD', 'ENGINEER', DUR_S).question).toBe(-1);
  });
});

describe('MG-29 scoring', () => {
  const q = QUESTIONS[0]!;

  it('perfect at exactly half the choosing time, not just past it; success up to the end of choosing', () => {
    const half = STD.chooseS / 2;
    expect(scoreRun(STD, q.answer, q.answer, half).perfect).toBe(true);
    expect(scoreRun(STD, q.answer, q.answer, half + 1 / STEP_HZ).perfect).toBe(false);
    expect(scoreRun(STD, q.answer, q.answer, half + 1 / STEP_HZ).success).toBe(true);
    expect(scoreRun(STD, q.answer, q.answer, STD.chooseS).success).toBe(true);
    expect(scoreRun(STD, q.answer, q.answer, STD.chooseS + 1 / STEP_HZ).success).toBe(false);
    expect(scoreRun(STD, q.answer, (q.answer + 1) % 3, 0.5).success).toBe(false);
    expect(scoreRun(STD, q.answer, -1, -1).success).toBe(false);
  });

  it('cannot lock after the choosing time; the animation then plays anyway', () => {
    const sim = new Mg29Sim(STD, 1);
    while (sim.phase === 'choose') sim.tick();
    expect(sim.lock(sim.q.answer)).toBe(false);
    while (!sim.done) sim.tick();
    expect(sim.result().success).toBe(false);
    expect(sim.step).toBeLessThanOrEqual(maxSteps(STD) + 1);
  });

  it('perfect implies success and the score rises with speed', () => {
    for (let t = 0; t <= STD.chooseS; t += 0.25) {
      const s = scoreRun(STD, q.answer, q.answer, t);
      if (s.perfect) expect(s.success).toBe(true);
      expect(s.score).toBeGreaterThanOrEqual(0.5);
      expect(s.score).toBeLessThanOrEqual(1);
    }
    expect(scoreRun(STD, q.answer, q.answer, 1).score).toBeGreaterThan(scoreRun(STD, q.answer, q.answer, 3).score);
  });

  it('shuffles the answer order from the seed; the correct button follows the answer', () => {
    const slots = new Set<number>();
    for (const seed of SEEDS) {
      const sim = new Mg29Sim(resolveConfig({ question: 0 }, 'STANDARD', 'ENGINEER', DUR_S), seed);
      expect(sim.order[sim.correctSlot]).toBe(sim.q.answer);
      expect([...sim.order].sort()).toEqual([0, 1, 2]);
      slots.add(sim.correctSlot);
    }
    expect(slots.size).toBe(3);
  });

  it('a locked prediction cannot be changed', () => {
    const sim = new Mg29Sim(STD, 2);
    sim.tick();
    expect(sim.lock(0)).toBe(true);
    expect(sim.lock(1)).toBe(false);
    expect(sim.locked).toBe(0);
  });
});

describe('MG-29 modes and difficulty', () => {
  it('Relaxed gives more time to choose; choosing plus the animation fits the play time', () => {
    for (const mode of MODES)
      for (const a of ASSISTS) {
        const c = resolveConfig({}, mode, a, DUR_S);
        expect(c.chooseS + c.animS).toBeLessThanOrEqual(DUR_S);
      }
    expect(resolveConfig({}, 'RELAXED', 'ENGINEER', DUR_S).chooseS).toBeGreaterThan(STD.chooseS);
  });

  it('Cadet is easier and Flight Director harder', () => {
    expect(resolveConfig({}, 'STANDARD', 'CADET', DUR_S).chooseS).toBeGreaterThan(STD.chooseS);
    expect(resolveConfig({}, 'STANDARD', 'FLIGHT_DIRECTOR', DUR_S).chooseS).toBeLessThan(STD.chooseS);
  });

  it('One-button cycles the answers and gives each at least two turns', () => {
    const c = resolveConfig({}, 'ONE_BUTTON', 'ENGINEER', DUR_S);
    expect(c.chooseS).toBeGreaterThanOrEqual(c.dwellS * 3 * 2 - 1e-9);
    const sim = new Mg29Sim(c, 3);
    const seen = new Set<number>();
    while (sim.phase === 'choose') {
      seen.add(sim.highlight());
      sim.tick();
    }
    expect(seen.size).toBe(sim.q.choices);
  });
});

describe('MG-29 runs', () => {
  it('a scripted good player succeeds on 24 seeds in every mode and difficulty', () => {
    for (const mode of MODES)
      for (const assist of ASSISTS) {
        const c = resolveConfig({}, mode, assist, DUR_S);
        for (const seed of SEEDS) {
          const pilot = new Mg29Autopilot();
          const r = runScripted(c, seed, (s) => pilot.apply(s)).result();
          expect(r.success, `${mode} ${assist} ${seed}`).toBe(true);
        }
      }
  });

  it('an idle player fails in every mode', () => {
    for (const mode of MODES) for (const seed of SEEDS) expect(runScripted(resolveConfig({}, mode, 'ENGINEER', DUR_S), seed, null).result().success).toBe(false);
  });

  it('one-button presses alone reach success', () => {
    const c = resolveConfig({ question: 4 }, 'ONE_BUTTON', 'ENGINEER', DUR_S);
    const sim = new Mg29Sim(c, 1);
    while (!sim.done) {
      if (sim.highlight() === sim.correctSlot) sim.press();
      sim.tick();
    }
    expect(sim.result().success).toBe(true);
  });

  it('is deterministic and frame-rate independent', () => {
    const play = (fps: number) => {
      const sim = new Mg29Sim(STD, 9);
      const st = new FixedStepper();
      const p = new Mg29Autopilot(2.6);
      while (!sim.done) for (let n = st.advance(1000 / fps); n > 0 && !sim.done; n--) {
        p.apply(sim);
        sim.tick();
      }
      return { r: sim.result(), at: sim.lockedAtS, steps: sim.step };
    };
    expect(play(60)).toEqual(play(60));
    expect(play(30)).toEqual(play(60));
    expect(play(144)).toEqual(play(60));
  });
});
