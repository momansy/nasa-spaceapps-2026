import { describe, expect, it } from 'vitest';
import type { AssistLevel, MinigameMode } from '@protocol';
import { FixedStepper, formatSig, STEP_HZ } from '../MG-02/kit';
import { createDeck, FT_TO_M, LBF_TO_N, Mg01Autopilot, Mg01Sim, PSI_TO_KPA, resolveConfig, runScripted, scoreRun } from './model';

const DUR_S = 25;
const MODES: MinigameMode[] = ['STANDARD', 'RELAXED', 'ONE_BUTTON'];
const ASSISTS: AssistLevel[] = ['CADET', 'ENGINEER', 'FLIGHT_DIRECTOR'];
const SEEDS = Array.from({ length: 24 }, (_, i) => (i * 2654435761 + 1) >>> 0);
const STD = resolveConfig({}, 'STANDARD', 'ENGINEER', DUR_S);

describe('MG-01 conversions and deck', () => {
  it('uses the exact factors', () => {
    expect(LBF_TO_N).toBe(4.4482216152605);
    expect(FT_TO_M).toBe(0.3048);
    expect(PSI_TO_KPA).toBe(6.894757293168);
    expect(formatSig(14.7 * PSI_TO_KPA, 3)).toBe('101');
    expect(formatSig(1000 * FT_TO_M, 3)).toBe('305');
    expect(formatSig(1250 * LBF_TO_N, 3)).toBe('5560');
    expect(formatSig(55600, 3)).toBe('55 600');
  });

  it('deals at least 12 cards whose lanes are distinct, with one correct, one unconverted and one wrong factor', () => {
    for (const seed of SEEDS) {
      const deck = createDeck(STD, seed);
      expect(deck.length).toBeGreaterThanOrEqual(12);
      for (const c of deck) {
        expect(new Set(c.options).size).toBe(3);
        expect([...c.optionKinds].sort()).toEqual(['correct', 'factor', 'unconverted']);
        const factor = [LBF_TO_N, FT_TO_M, PSI_TO_KPA][c.kind]!;
        expect(c.options[c.correctLane]).toBe(formatSig(c.value * factor, 3));
        expect(c.options[c.optionKinds.indexOf('unconverted')]).toBe(formatSig(c.value, 3));
        // The last card still reaches the upload line before the end of play.
        expect(c.spawnS + STD.fallS).toBeLessThanOrEqual(DUR_S);
      }
    }
  });
});

describe('MG-01 scoring', () => {
  it('succeeds at exactly 8 correct and 1 wrong, fails just past each threshold', () => {
    expect(scoreRun(STD, 8, 1).success).toBe(true);
    expect(scoreRun(STD, 7, 1).success).toBe(false);
    expect(scoreRun(STD, 8, 2).success).toBe(false);
  });

  it('perfect is success with no wrong; score rises with correct and stays in 0–1', () => {
    expect(scoreRun(STD, 8, 0).perfect).toBe(true);
    expect(scoreRun(STD, 12, 1).perfect).toBe(false);
    for (let c = 0; c <= 13; c++)
      for (let w = 0; w <= 13 - c; w++) {
        const s = scoreRun(STD, c, w);
        if (s.perfect) expect(s.success).toBe(true);
        expect(s.score).toBeGreaterThanOrEqual(0);
        expect(s.score).toBeLessThanOrEqual(1);
      }
    expect(scoreRun(STD, 10, 0).score).toBeGreaterThan(scoreRun(STD, 9, 0).score);
  });

  it('takes thresholds from the host parameters', () => {
    const c = resolveConfig({ correct_min: 5, wrong_max: 3, cards: 16 }, 'STANDARD', 'ENGINEER', DUR_S);
    expect(scoreRun(c, 5, 3).success).toBe(true);
    expect(scoreRun(c, 4, 3).success).toBe(false);
    expect(scoreRun(c, 5, 4).success).toBe(false);
    expect(createDeck(c, 1).length).toBe(16);
    expect(resolveConfig({ correct_min: 'x' } as never, 'STANDARD', 'ENGINEER', DUR_S).correctMin).toBe(8);
  });

  it('a card reaching the upload line unsorted counts as wrong', () => {
    const sim = new Mg01Sim(STD, 3);
    while (sim.timeS < sim.deck[0]!.spawnS + STD.fallS + 0.05) sim.tick();
    expect(sim.state[0]).toBe('missed');
    expect(sim.wrong).toBe(1);
  });

  it('sorting into the unconverted lane is wrong', () => {
    const sim = new Mg01Sim(STD, 4);
    while (sim.active < 0) sim.tick();
    const card = sim.deck[sim.active]!;
    const out = sim.sort(card.optionKinds.indexOf('unconverted'));
    expect(out?.kind).toBe('unconverted');
    expect(sim.wrong).toBe(1);
  });
});

describe('MG-01 modes and difficulty', () => {
  it('Relaxed moves values more slowly than Standard', () => {
    expect(resolveConfig({}, 'RELAXED', 'ENGINEER', DUR_S).fallS).toBeGreaterThan(STD.fallS * 1.3);
  });

  it('Cadet is easier and Flight Director harder', () => {
    const cadet = resolveConfig({}, 'STANDARD', 'CADET', DUR_S);
    const fd = resolveConfig({}, 'STANDARD', 'FLIGHT_DIRECTOR', DUR_S);
    expect(cadet.fallS).toBeGreaterThan(STD.fallS);
    expect(fd.fallS).toBeLessThan(STD.fallS);
    expect(cadet.dwellS).toBeGreaterThan(fd.dwellS);
  });

  it('One-button: cards stop one at a time and the highlighted lane is chosen by a press', () => {
    const c = resolveConfig({}, 'ONE_BUTTON', 'ENGINEER', DUR_S);
    const sim = new Mg01Sim(c, 9);
    while (sim.highlight() < 0) sim.tick();
    expect(sim.state.filter((s) => s === 'live').length).toBe(1);
    expect(sim.sort(0) === null || sim.resolved === 1).toBe(true);
    const sim2 = new Mg01Sim(c, 9);
    while (sim2.highlight() !== sim2.deck[sim2.active]?.correctLane) sim2.tick();
    expect(sim2.press()?.kind).toBe('correct');
  });
});

describe('MG-01 runs', () => {
  it('a scripted good player succeeds on 24 seeds in every mode and difficulty', () => {
    for (const mode of MODES)
      for (const assist of ASSISTS) {
        const c = resolveConfig({}, mode, assist, DUR_S);
        for (const seed of SEEDS) {
          const pilot = new Mg01Autopilot();
          const sim = runScripted(c, seed, (s) => pilot.apply(s));
          const r = sim.result();
          expect(r.success, `${mode} ${assist} seed ${seed}: ${sim.correct}/${sim.wrong}`).toBe(true);
          expect(r.perfect).toBe(true);
        }
      }
  });

  it('an idle player fails in every mode', () => {
    for (const mode of MODES) {
      const c = resolveConfig({}, mode, 'ENGINEER', DUR_S);
      for (const seed of SEEDS) expect(runScripted(c, seed, null).result().success).toBe(false);
    }
  });

  it('one-button presses alone reach success', () => {
    const c = resolveConfig({}, 'ONE_BUTTON', 'ENGINEER', DUR_S);
    const sim = new Mg01Sim(c, 31);
    while (!sim.done) {
      const i = sim.active;
      if (i >= 0 && sim.highlight() === sim.deck[i]!.correctLane) sim.press();
      sim.tick();
    }
    expect(sim.result().success).toBe(true);
  });

  it('is deterministic', () => {
    const run = () => {
      const p = new Mg01Autopilot(0.4);
      const s = runScripted(STD, 555, (x) => p.apply(x));
      return { r: s.result(), state: [...s.state], t: s.step };
    };
    expect(run()).toEqual(run());
  });

  it('does not depend on the frame rate', () => {
    const play = (fps: number) => {
      const sim = new Mg01Sim(STD, 77);
      const stepper = new FixedStepper();
      const pilot = new Mg01Autopilot(0.5);
      while (!sim.done) for (let n = stepper.advance(1000 / fps); n > 0 && !sim.done; n--) {
        pilot.apply(sim);
        sim.tick();
      }
      return { r: sim.result(), resolved: Array.from(sim.resolvedAtS).map((x) => Math.round(x * STEP_HZ)) };
    };
    expect(play(30)).toEqual(play(60));
    expect(play(144)).toEqual(play(60));
  });
});
