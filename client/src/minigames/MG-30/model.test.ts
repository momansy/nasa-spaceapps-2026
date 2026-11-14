import { describe, expect, it } from 'vitest';
import type { AssistLevel, MinigameMode } from '@protocol';
import { FixedStepper, STEP_HZ } from '../MG-02/kit';
import { CANDIDATES, Mg30Autopilot, Mg30Sim, OPTION_COUNT, resolveConfig, runScripted, scoreRun } from './model';
import strings from '../../i18n/strings/en.mg_build.json';

const DUR_S = 30;
const MODES: MinigameMode[] = ['STANDARD', 'RELAXED', 'ONE_BUTTON'];
const ASSISTS: AssistLevel[] = ['CADET', 'ENGINEER', 'FLIGHT_DIRECTOR'];
const SEEDS = Array.from({ length: 24 }, (_, i) => (i * 2654435761 + 17) >>> 0);
const STD = resolveConfig({ slot: 1, slots: 4 }, 'STANDARD', 'ENGINEER', DUR_S);

describe('MG-30 content', () => {
  it('has 8–12 original mottos and a string for every option', () => {
    const s = strings as Record<string, string>;
    expect(OPTION_COUNT[3]).toBeGreaterThanOrEqual(8);
    expect(OPTION_COUNT[3]).toBeLessThanOrEqual(12);
    ['shape', 'symbol', 'colour', 'motto'].forEach((cat, c) => {
      for (let k = 0; k < OPTION_COUNT[c]!; k++) expect(s[`minigame.MG-30.${cat}.${k}`], `${cat}.${k}`).toBeTruthy();
    });
  });

  it('slot picks the category: slot mod 4 (shape, symbol, colour, motto)', () => {
    expect([0, 1, 2, 3, 4, 7].map((slot) => resolveConfig({ slot, slots: 8 }, 'STANDARD', 'ENGINEER', DUR_S).category)).toEqual([0, 1, 2, 3, 0, 3]);
  });
});

describe('MG-30 rules', () => {
  it('always succeeds; perfect means contributed and voted', () => {
    expect(scoreRun(false, false)).toMatchObject({ success: true, perfect: false, score: 0 });
    expect(scoreRun(true, false)).toMatchObject({ success: true, perfect: false, score: 0.5 });
    expect(scoreRun(true, true)).toMatchObject({ success: true, perfect: true, score: 1 });
  });

  it('picks only in the pick phase and votes only in the vote phase; the last choice counts', () => {
    const sim = new Mg30Sim(STD, 1);
    expect(sim.castVote(0)).toBe(false);
    expect(sim.choose(3)).toBe(true);
    expect(sim.choose(5)).toBe(true);
    expect(sim.pick).toBe(5);
    while (sim.phase === 'pick') sim.tick();
    expect(sim.choose(1)).toBe(false);
    expect(sim.castVote(2)).toBe(true);
    expect(sim.castVote(1)).toBe(true);
    expect(sim.vote).toBe(1);
    while (!sim.done) sim.tick();
    expect(sim.result()).toMatchObject({ success: true, perfect: true });
  });

  it('every phone with the same shared elements shows the same three distinct candidates', () => {
    for (const seed of SEEDS) {
      const phones = [0, 1, 2, 3].map((slot) => new Mg30Sim(resolveConfig({ slot, slots: 4 }, 'STANDARD', 'ENGINEER', DUR_S), seed));
      const team = [3, 5, 1, 7];
      for (const p of phones) {
        for (let c = 0; c < 4; c++) if (c !== p.config.category) p.team[c] = team[c]!;
        p.choose(team[p.config.category]! % OPTION_COUNT[p.config.category]);
      }
      const ref = JSON.stringify(phones[0]!.candidates());
      for (const p of phones) expect(JSON.stringify(p.candidates())).toBe(ref);
      const cands = phones[0]!.candidates();
      expect(cands.length).toBe(CANDIDATES);
      expect(cands[0]).toEqual(team);
      expect(new Set(cands.map((p) => p.join(','))).size).toBe(CANDIDATES);
    }
  });

  it('uses the team\'s elements and votes from the host when known, crew otherwise', () => {
    const sim = new Mg30Sim(STD, 3);
    expect(sim.element(0)).toBe(sim.crew[0]);
    sim.team[0] = 6;
    expect(sim.element(0)).toBe(6);
    expect(sim.fromTeam(0)).toBe(true);
    sim.team[STD.category] = 2; // the host's copy of this player's own category is ignored
    expect(sim.element(STD.category)).toBe(sim.crew[STD.category]);
    sim.teamVotes = [0, 5, 1];
    expect(sim.winner()).toBe(1);
  });

  it('ties go to the lowest letter (the same winner on every phone)', () => {
    const sim = new Mg30Sim(STD, 3);
    sim.teamVotes = [1, 2, 2];
    while (sim.phase === 'pick') sim.tick();
    sim.castVote(2);
    expect(sim.winner()).toBe(1);
  });
});

describe('MG-30 modes', () => {
  it('Relaxed (and one-button) get the full time; Standard 75 %; phases add up', () => {
    const r = resolveConfig({}, 'RELAXED', 'ENGINEER', DUR_S);
    expect(r.pickS + r.voteS + r.revealS).toBeCloseTo(DUR_S, 9);
    expect(STD.pickS + STD.voteS + STD.revealS).toBeCloseTo(DUR_S * 0.75, 9);
    expect(r.pickS).toBeGreaterThan(STD.pickS);
    expect(resolveConfig({}, 'ONE_BUTTON', 'ENGINEER', DUR_S).pickS).toBeCloseTo(r.pickS, 9);
  });

  it('difficulty never changes the patch game (cosmetic); one-button highlights every option in the pick phase', () => {
    const a = resolveConfig({ slot: 3 }, 'STANDARD', 'CADET', DUR_S);
    const b = resolveConfig({ slot: 3 }, 'STANDARD', 'FLIGHT_DIRECTOR', DUR_S);
    expect(a).toEqual(b);
    const c = resolveConfig({ slot: 3 }, 'ONE_BUTTON', 'ENGINEER', DUR_S);
    const sim = new Mg30Sim(c, 1);
    const seen = new Set<number>();
    while (sim.phase === 'pick') {
      seen.add(sim.highlight());
      sim.tick();
    }
    expect(seen.size).toBe(OPTION_COUNT[3]);
  });
});

describe('MG-30 runs', () => {
  it('a scripted player contributes and votes (perfect) on 24 seeds in every mode', () => {
    for (const mode of MODES)
      for (const assist of ASSISTS)
        for (const seed of SEEDS) {
          const c = resolveConfig({ slot: seed % 4, slots: 4 }, mode, assist, DUR_S);
          const pilot = new Mg30Autopilot();
          const r = runScripted(c, seed, (s) => pilot.apply(s)).result();
          expect(r, `${mode} ${assist} ${seed}`).toMatchObject({ success: true, perfect: true });
        }
  });

  it('an idle player still succeeds (participation), without perfect', () => {
    for (const mode of MODES) expect(runScripted(resolveConfig({}, mode, 'ENGINEER', DUR_S), 5, null).result()).toMatchObject({ success: true, perfect: false, score: 0 });
  });

  it('one-button presses alone contribute and vote', () => {
    const c = resolveConfig({ slot: 2, slots: 3 }, 'ONE_BUTTON', 'ENGINEER', DUR_S);
    const sim = new Mg30Sim(c, 7);
    let k = 0;
    while (!sim.done) sim.tick(k++ % (STEP_HZ * 3) === STEP_HZ);
    expect(sim.result()).toMatchObject({ perfect: true });
  });

  it('is deterministic and frame-rate independent', () => {
    const play = (fps: number) => {
      const sim = new Mg30Sim(STD, 19);
      const st = new FixedStepper();
      const p = new Mg30Autopilot(2.2, 5);
      while (!sim.done) for (let n = st.advance(1000 / fps); n > 0 && !sim.done; n--) sim.tick(p.apply(sim));
      return { r: sim.result(), pick: sim.pick, vote: sim.vote, w: sim.winner(), c: sim.candidates() };
    };
    expect(play(60)).toEqual(play(60));
    expect(play(30)).toEqual(play(60));
    expect(play(144)).toEqual(play(60));
  });
});
