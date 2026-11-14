import { describe, expect, it } from 'vitest';
import type { AssistLevel, MinigameMode } from '@protocol';
import { FixedStepper } from '../MG-08/model';
import { dealCards, goodPlayer, makeSim, Mg26Sim, N_CARDS, PLAN, resolveConfig, runScripted, STEP_HZ, WATCH_STEPS, type Mg26Input } from './model';

const DURATION_S = 45;
const SEEDS = Array.from({ length: 24 }, (_, i) => 9 + i * 1931);
const MODES: MinigameMode[] = ['STANDARD', 'RELAXED', 'ONE_BUTTON'];
const buf = (): Mg26Input => ({ op: 0, card: 0, pos: 0, frac: 0 });
const sim1 = (params = {}, mode: MinigameMode = 'STANDARD', assist: AssistLevel = 'ENGINEER', seed = 3) => makeSim(params, seed, mode, assist, DURATION_S);

/** Places every own card at its right place with the given trigger offset (fraction of the span), then sends. */
function program(sim: Mg26Sim, off = 0) {
  for (const c of sim.config.own) sim.place(c, c, sim.targetFrac(c) + off);
  sim.send();
  return sim;
}

describe('MG-26 dealing', () => {
  it('seven cards in the order of the sequence: heat shield … cut cables', () => {
    expect(N_CARDS).toBe(7);
    expect(PLAN).toHaveLength(7);
  });
  it('with one player all seven cards are held; with seven each holds one; with three they are shared out', () => {
    expect(dealCards(0, 1)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    for (let s = 0; s < 7; s++) expect(dealCards(s, 7)).toEqual([s]);
    expect(dealCards(0, 3)).toEqual([0, 3, 6]);
    expect(dealCards(1, 3)).toEqual([1, 4]);
    expect(dealCards(2, 3)).toEqual([2, 5]);
  });
  it('every card is held by someone for any team size 1…12', () => {
    for (let n = 1; n <= 12; n++) {
      const held = new Set<number>();
      for (let s = 0; s < n; s++) dealCards(s, n).forEach((c) => held.add(c));
      expect(held.size).toBe(7);
    }
  });
  it('the player count only changes who holds what, never the difficulty', () => {
    const a = resolveConfig({ slot: 1, slots: 3 }, 'STANDARD', 'ENGINEER', DURATION_S);
    const b = resolveConfig({}, 'STANDARD', 'ENGINEER', DURATION_S);
    expect({ ...a, own: 0, slot: 0, slots: 0 }).toEqual({ ...b, own: 0, slot: 0, slots: 0 });
  });
});

describe('MG-26 success: right place and trigger inside the window (±5 % of the slider span)', () => {
  it('a card in its place with the trigger on the plan succeeds; perfect too', () => {
    const sim = program(sim1());
    expect(sim.success).toBe(true);
    expect(sim.perfect).toBe(true);
  });
  it('succeeds exactly at the edge of the window and not just past it (both sides)', () => {
    for (const sign of [-1, 1]) {
      const at = program(sim1(), sign * 0.05);
      expect(at.success).toBe(true);
      const past = program(sim1(), sign * 0.0502);
      expect(past.success).toBe(false);
    }
  });
  it('perfect is the middle 40 % of the window (±2 % of the span), success without perfect outside it', () => {
    expect(program(sim1(), 0.02).perfect).toBe(true);
    const out = program(sim1(), 0.0202);
    expect(out.perfect).toBe(false);
    expect(out.success).toBe(true);
  });
  it('a card in the wrong place or left in the tray fails', () => {
    const wrong = sim1();
    for (const c of wrong.config.own) wrong.place(c, (c + 1) % 7, wrong.targetFrac(c));
    wrong.send();
    expect(wrong.success).toBe(false);
    expect(wrong.judgeCard(0).placed).toBe(true);
    expect(wrong.judgeCard(0).rightPlace).toBe(false);
    const tray = sim1();
    tray.place(0, 0, tray.targetFrac(0));
    tray.send();
    expect(tray.success).toBe(false);
    expect(tray.judgeCard(3).placed).toBe(false);
  });
  it('takes the window from the host parameters', () => {
    expect(program(sim1({ window_fraction: 0.2 }), 0.19).success).toBe(true);
    expect(program(sim1(), 0.19).success).toBe(false);
  });
  it('only this player’s cards count', () => {
    const sim = sim1({ slot: 1, slots: 3 });
    expect(sim.config.own).toEqual([1, 4]);
    expect(program(sim).success).toBe(true);
  });
  it('placing a card on an occupied position sends the other card back to the tray; actions work only while programming', () => {
    const sim = sim1();
    sim.place(0, 2);
    sim.place(1, 2);
    expect(sim.cardPos[0]).toBe(-1);
    expect(sim.cardPos[1]).toBe(2);
    sim.send();
    expect(sim.place(0, 0)).toBe(false);
    sim.setFrac(1, 0.9);
    expect(sim.frac[1]).toBe(0.5);
  });
});

describe('MG-26 modes and difficulty', () => {
  const win = (m: MinigameMode, a: AssistLevel) => resolveConfig({}, m, a, DURATION_S).windowFraction;
  it('Relaxed has more time to program and a wider window', () => {
    const std = resolveConfig({}, 'STANDARD', 'ENGINEER', DURATION_S);
    const rel = resolveConfig({}, 'RELAXED', 'ENGINEER', DURATION_S);
    expect(rel.deadlineSteps).toBeGreaterThan(std.deadlineSteps);
    expect(rel.windowFraction / std.windowFraction).toBeCloseTo(1.6, 6);
    expect(std.deadlineSteps).toBe(Math.round(0.75 * DURATION_S * STEP_HZ));
    expect(rel.deadlineSteps + WATCH_STEPS).toBeLessThanOrEqual(DURATION_S * STEP_HZ);
  });
  it('Cadet is easier and Flight Director harder by about 25 %', () => {
    expect(win('STANDARD', 'CADET') / win('STANDARD', 'ENGINEER')).toBeCloseTo(1.25, 6);
    expect(win('STANDARD', 'FLIGHT_DIRECTOR') / win('STANDARD', 'ENGINEER')).toBeCloseTo(0.8, 6);
  });
  it('a sloppier trigger passes in Relaxed but not in Standard', () => {
    expect(program(sim1({}, 'STANDARD'), 0.07).success).toBe(false);
    expect(program(sim1({}, 'RELAXED'), 0.07).success).toBe(true);
  });
  it('one-button: positions light up in turn and a press puts the next card there, the trigger is preset', () => {
    const sim = sim1({}, 'ONE_BUTTON');
    expect(sim.highlight).toBe(0);
    const press: Mg26Input = { op: 5, card: 0, pos: 0, frac: 0 };
    sim.advance(press);
    expect(sim.cardPos[0]).toBe(0);
    while (sim.highlight !== 3) sim.advance(buf());
    sim.advance(press);
    expect(sim.cardPos[1]).toBe(3); // the next card in the tray goes where the light is
    expect(sim.judgeCard(0).inWindow).toBe(true); // preset trigger
    sim.setFrac(0, 0.9);
    expect(sim.frac[0]).toBeCloseTo(sim.targetFrac(0), 12); // sliders are off in one-button mode
  });
  it('the programming ends at its deadline by itself and the replay then lasts 6 s', () => {
    const sim = sim1();
    while (sim.phase === 'program') sim.advance(buf());
    expect(sim.step).toBe(sim.config.deadlineSteps);
    expect(sim.watchStart).toBe(sim.config.deadlineSteps);
    runScripted(sim, () => buf());
    expect(sim.step).toBe(sim.watchStart + WATCH_STEPS);
    expect(sim.step).toBeLessThanOrEqual(sim.totalSteps);
  });
});

describe('MG-26 crew, coop and light time', () => {
  it('the light time is seeded inside the real range of fact F20 (3 to 22 minutes)', () => {
    for (const seed of SEEDS) {
      const m = sim1({}, 'STANDARD', 'ENGINEER', seed).lightMin;
      expect(m).toBeGreaterThanOrEqual(3);
      expect(m).toBeLessThanOrEqual(22);
    }
  });
  it('teammates’ cards appear from the seeded crew or from env.coop and never change my result', () => {
    const a = program(sim1({ slot: 1, slots: 3 }));
    const b = sim1({ slot: 1, slots: 3 });
    b.coopSeq = [0, -1, 2, 3, -1, 5, 6];
    program(b);
    expect(b.result()).toEqual(a.result());
    expect(b.cardAt(0)).toEqual({ card: 0, own: false });
    expect(b.cardAt(1)?.own).toBe(true);
    const c = sim1({ slot: 1, slots: 3 });
    expect(c.cardAt(0)).toBeNull();
    while (c.step < 40 * STEP_HZ && c.phase === 'program') c.advance(buf());
    expect(c.cardAt(0)?.own).toBe(false);
  });
});

describe('MG-26 determinism and play', () => {
  const play = (sim: Mg26Sim) => {
    const out = buf();
    return runScripted(sim, (s) => goodPlayer(s, out));
  };
  it('same seed and input give the same run, different seeds differ', () => {
    const a = play(sim1());
    const b = play(sim1());
    expect(a.result()).toEqual(b.result());
    expect(Array.from(a.target)).toEqual(Array.from(b.target));
    expect(Array.from(sim1({}, 'STANDARD', 'ENGINEER', 4).target)).not.toEqual(Array.from(a.target));
  });
  it('does not depend on the frame rate', () => {
    for (const fps of [60, 30, 144]) {
      const st = new FixedStepper();
      const sim = sim1();
      const out = buf();
      for (let t = 0; t < 45000 + 1000 / fps; t += 1000 / fps) for (let n = st.advance(1000 / fps); n > 0 && !sim.done; n--) sim.advance(goodPlayer(sim, out));
      expect(sim.done).toBe(true);
      expect(sim.result().success).toBe(true);
    }
  });
  for (const mode of MODES) {
    for (const slots of [1, 3, 7]) {
      it(`a scripted good player succeeds on ≥ 20 seeds in ${mode} with ${slots} player(s), and perfect implies success`, () => {
        let wins = 0;
        for (const seed of SEEDS) {
          for (const assist of ['CADET', 'ENGINEER', 'FLIGHT_DIRECTOR'] as AssistLevel[]) {
            const sim = play(makeSim({ slot: seed % slots, slots }, seed, mode, assist, DURATION_S));
            const r = sim.result();
            if (assist === 'ENGINEER' && r.success) wins++;
            else if (assist !== 'ENGINEER') expect(r.success).toBe(true);
            if (r.perfect) expect(r.success).toBe(true);
            expect(sim.step).toBeLessThanOrEqual(sim.totalSteps);
          }
        }
        expect(wins).toBeGreaterThanOrEqual(20);
      });
    }
    it(`an idle player fails in ${mode} on every seed`, () => {
      for (const seed of SEEDS) {
        const sim = runScripted(makeSim({}, seed, mode, 'ENGINEER', DURATION_S), () => buf());
        expect(sim.result().success).toBe(false);
        expect(sim.result().score).toBeLessThan(0.5);
      }
    });
  }
  it('a player 8 % of the span off the plan fails in Standard (good order, bad timing)', () => {
    const out = buf();
    const sim = runScripted(sim1(), (s) => goodPlayer(s, out, 0.08));
    expect(sim.result().success).toBe(false);
    expect(sim.judgeCard(0).rightPlace).toBe(true);
  });
  it('the result is stable after the end', () => {
    const sim = play(sim1());
    const r = sim.result();
    sim.advance({ op: 3, card: 0, pos: 0, frac: 0 });
    expect(sim.result()).toEqual(r);
  });
});
