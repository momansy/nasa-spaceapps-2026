import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { AssistLevel, MgMap, MinigameMode } from '@protocol';
import { FixedStepper } from '../MG-08/model';
import { chainOf, CLUES, FAILURE_MODES, HERRINGS } from './clues';
import { buildInvestigation, goodPlayer, makeSim, Mg28Sim, N_OPTIONS, parseInvestigation, resolveConfig, runScripted, STEP_HZ, type Mg28Input } from './model';

const DURATION_S = 45;
const SEEDS = Array.from({ length: 24 }, (_, i) => 6 + i * 3119);
const MODES: MinigameMode[] = ['STANDARD', 'RELAXED', 'ONE_BUTTON'];
const buf = (): Mg28Input => ({ op: 0, a: 0, b: 0 });
const mk = (params: MgMap = {}, mode: MinigameMode = 'STANDARD', assist: AssistLevel = 'ENGINEER', seed = 3) => makeSim(params, seed, mode, assist, DURATION_S);

/** A fixed investigation: root cause pogo_oscillation (2) among 0, 2, 6, 9; clues = its chain + two cards of others + a herring. */
function fixedParams(extra: MgMap = {}): MgMap {
  const chain = chainOf(2);
  return { cause_options: [6, 2, 0, 9], cause_correct: 1, clues: [chainOf(0)[1]!, ...chain, chainOf(6)[1]!, HERRINGS[0]!], chain_len: chain.length, ...extra };
}

describe('MG-28 clue table (shared with T024)', () => {
  it('failure modes are exactly the enum of data/schema/common.schema.json, in that order', () => {
    const schema = JSON.parse(readFileSync(new URL('../../../../data/schema/common.schema.json', import.meta.url), 'utf8'));
    expect([...FAILURE_MODES]).toEqual(schema.$defs.failure_mode.enum);
    expect(FAILURE_MODES).toHaveLength(14);
  });
  it('every failure mode has 3 to 5 clue cards with orders 0…n−1, and there are generic red herrings', () => {
    for (let m = 0; m < FAILURE_MODES.length; m++) {
      const cards = CLUES.filter((c) => c.mode === m);
      expect(cards.length).toBeGreaterThanOrEqual(3);
      expect(cards.length).toBeLessThanOrEqual(5);
      expect(cards.map((c) => c.order).sort()).toEqual(cards.map((_, i) => i));
      expect(chainOf(m)).toEqual(cards.sort((a, b) => a.order - b.order).map((c) => c.id));
    }
    expect(HERRINGS.length).toBeGreaterThanOrEqual(6);
    CLUES.forEach((c, i) => expect(c.id).toBe(i));
  });
  it('every clue has a text key that exists in en.mg_entry.json, plus its channel, pattern and cause names', () => {
    const strings = JSON.parse(readFileSync(new URL('../../i18n/strings/en.mg_entry.json', import.meta.url), 'utf8')) as Record<string, string>;
    for (const c of CLUES) {
      expect(strings[c.textKey], c.textKey).toBeTruthy();
      expect(strings[`minigame.MG-28.channel.${c.channel}`]).toBeTruthy();
      expect(strings[`minigame.MG-28.pattern.${c.pattern}`]).toBeTruthy();
    }
    for (const m of FAILURE_MODES) expect(strings[`minigame.MG-28.cause.${m}`]).toBeTruthy();
  });
});

describe('MG-28 parameters (the contract of T024)', () => {
  it('reads cause_options, cause_correct, clues and chain_len', () => {
    const inv = parseInvestigation(fixedParams())!;
    expect(inv.options).toEqual([6, 2, 0, 9]);
    expect(inv.correct).toBe(1);
    expect(inv.chainLen).toBe(5);
  });
  it('rejects invalid parameters and falls back to a seeded investigation', () => {
    for (const bad of [{ cause_options: [1, 1, 2, 3] }, { cause_options: [1, 2, 3] }, { cause_correct: 4 }, { clues: [1, 999] }, { chain_len: 0 }] as MgMap[]) {
      expect(parseInvestigation(fixedParams(bad))).toBeNull();
    }
    const sim = mk({ cause_correct: 9 });
    expect(sim.inv.options).toHaveLength(N_OPTIONS);
  });
  it('without clues, builds a seeded investigation: the root cause and 3 other modes, its full chain and a mix of other cards', () => {
    for (const seed of SEEDS) {
      const inv = buildInvestigation(seed);
      expect(new Set(inv.options).size).toBe(4);
      const root = inv.options[inv.correct]!;
      const ids = inv.clues;
      expect(new Set(ids).size).toBe(ids.length);
      for (const id of chainOf(root)) expect(ids).toContain(id);
      expect(inv.chainLen).toBe(chainOf(root).length);
      expect(ids.filter((id) => CLUES[id]!.mode < 0).length).toBe(2);
      expect(JSON.stringify(buildInvestigation(seed))).toBe(JSON.stringify(inv)); // deterministic
    }
    expect(JSON.stringify(buildInvestigation(1))).not.toBe(JSON.stringify(buildInvestigation(2)));
  });
  it('cards: per-player `cards` (indices into clues) or dealt by slot; every card is dealt once', () => {
    expect(mk(fixedParams({ cards: [0, 2, 5] })).own).toEqual([0, 2, 5]);
    const dealt = new Set<number>();
    for (let s = 0; s < 3; s++) mk(fixedParams({ slot: s, slots: 3 })).own.forEach((i) => dealt.add(i));
    expect(dealt.size).toBe(fixedParams().clues && (fixedParams().clues as number[]).length);
    expect(mk(fixedParams()).own).toHaveLength((fixedParams().clues as number[]).length);
  });
});

describe('MG-28 success and perfect', () => {
  it('success is exactly the right final vote', () => {
    for (let opt = 0; opt < 4; opt++) {
      const sim = mk(fixedParams());
      sim.vote(opt);
      sim.lock();
      runScripted(sim, () => buf());
      expect(sim.result().success).toBe(opt === 1);
    }
  });
  it('perfect also needs every own card in a correct place (true-chain cards on their place, other cards off the chain)', () => {
    const base = fixedParams();
    const play = (placeRight: boolean, herringOnChain = false) => {
      const sim = mk(base);
      sim.own.forEach((i) => {
        const t = sim.trueSlot(i);
        if (t >= 0) sim.place(i, placeRight ? t : (t + 1) % sim.inv.chainLen);
      });
      if (herringOnChain) sim.place(sim.own.find((i) => sim.trueSlot(i) < 0)!, 0);
      sim.vote(1);
      sim.lock();
      return runScripted(sim, () => buf()).result();
    };
    const good = play(true);
    expect(good.success && good.perfect).toBe(true);
    const wrong = play(false);
    expect(wrong.success).toBe(true);
    expect(wrong.perfect).toBe(false);
    expect(wrong.score).toBeLessThan(good.score);
    expect(play(true, true).perfect).toBe(false);
  });
  it('perfect implies success; a wrong vote is never perfect, even with every card placed right', () => {
    const sim = mk(fixedParams());
    sim.own.forEach((i) => sim.trueSlot(i) >= 0 && sim.place(i, sim.trueSlot(i)));
    sim.vote(0);
    sim.lock();
    const r = runScripted(sim, () => buf()).result();
    expect(r.success).toBe(false);
    expect(r.perfect).toBe(false);
    expect(r.score).toBeLessThan(0.5);
  });
  it('the vote can change until it is locked, and nothing changes after the lock', () => {
    const sim = mk(fixedParams());
    sim.vote(0);
    sim.vote(2);
    expect(sim.votes[0]).toBe(0);
    expect(sim.votes[2]).toBe(1);
    sim.lock();
    expect(sim.vote(1)).toBe(false);
    expect(sim.place(sim.own[0]!, 0)).toBe(false);
    expect(sim.myVote).toBe(2);
  });
  it('an unlocked vote stands when the time is up; no vote at all fails', () => {
    const a = mk(fixedParams());
    a.vote(1);
    runScripted(a, () => buf());
    expect(a.locked).toBe(true);
    expect(a.result().success).toBe(true);
    expect(runScripted(mk(fixedParams()), () => buf()).result().success).toBe(false);
  });
  it('placing on an occupied place returns the other card to the hand; clear works', () => {
    const sim = mk(fixedParams());
    sim.place(sim.own[0]!, 0);
    sim.place(sim.own[1]!, 0);
    expect(sim.chain[0]).toBe(sim.own[1]);
    expect(sim.ownSlot[0]).toBe(-1);
    expect(sim.clear(0)).toBe(true);
    expect(sim.chain[0]).toBe(-1);
    expect(sim.clear(0)).toBe(false);
  });
});

describe('MG-28 shared state and the fake env.coop', () => {
  it('displays the shared chain and votes when the host sends them, and never lets them change the result', () => {
    const a = mk(fixedParams());
    const b = mk(fixedParams());
    b.sharedChain = [3, -1, 5, -1, -1];
    b.sharedVotes = [0, 3, 1, 0];
    b.sharedLocked = true;
    expect(Array.from(b.displayChain())).toEqual([3, -1, 5, -1, -1]);
    expect(Array.from(b.displayVotes())).toEqual([0, 3, 1, 0]);
    expect(Array.from(a.displayChain())).toEqual(Array.from(a.chain));
    for (const s of [a, b]) {
      s.vote(1);
      s.lock();
      runScripted(s, () => buf());
    }
    expect(b.result()).toEqual(a.result());
  });
  it('ignores a shared chain of the wrong length', () => {
    const sim = mk(fixedParams());
    sim.sharedChain = [1, 2];
    expect(Array.from(sim.displayChain())).toEqual(Array.from(sim.chain));
  });
});

describe('MG-28 modes and difficulty', () => {
  it('Relaxed has more time and marks the starting clue; Standard stops at 75 %', () => {
    const std = resolveConfig({}, 'STANDARD', 'ENGINEER', DURATION_S);
    const rel = resolveConfig({}, 'RELAXED', 'ENGINEER', DURATION_S);
    expect(std.deadlineSteps).toBe(Math.round(0.75 * DURATION_S * STEP_HZ));
    expect(rel.deadlineSteps).toBeGreaterThan(std.deadlineSteps);
    expect(rel.markStart).toBe(true);
    expect(std.markStart).toBe(false);
    const sim = mk(fixedParams(), 'RELAXED');
    expect(sim.clueOf(sim.startClue).order).toBe(0);
    expect(sim.clueOf(sim.startClue).mode).toBe(2);
  });
  it('Cadet has more time and Flight Director less, by about 25 %', () => {
    const d = (a: AssistLevel) => resolveConfig({}, 'STANDARD', a, DURATION_S).deadlineSteps;
    expect(d('CADET')).toBeGreaterThan(d('ENGINEER'));
    expect(d('FLIGHT_DIRECTOR') / d('ENGINEER')).toBeCloseTo(0.8, 2);
  });
  it('one-button: the places light up in turn, a press puts the next card there (or aside), then the options light up and a press votes and locks', () => {
    const sim = mk(fixedParams({ cards: [1, 2] }), 'ONE_BUTTON');
    const press: Mg28Input = { op: 5, a: 0, b: 0 };
    expect(sim.phase).toBe('place');
    expect(sim.highlight).toBe(0);
    sim.advance(press);
    expect(sim.chain[0]).toBe(1);
    while (sim.highlight !== sim.inv.chainLen) sim.advance(buf());
    sim.advance(press); // "set aside" position
    expect(sim.ownSlot[1]).toBe(-2);
    expect(sim.phase).toBe('vote');
    while (sim.highlight !== 1) sim.advance(buf());
    sim.advance(press);
    expect(sim.myVote).toBe(1);
    expect(sim.locked).toBe(true);
    expect(runScripted(sim, () => buf()).result().success).toBe(true);
  });
});

describe('MG-28 determinism and play', () => {
  const play = (sim: Mg28Sim, wrong = false) => {
    const o = buf();
    return runScripted(sim, (s) => goodPlayer(s, o, wrong));
  };
  it('same seed and input give the same run, different seeds differ', () => {
    const a = play(mk());
    const b = play(mk());
    expect(a.result()).toEqual(b.result());
    expect(Array.from(a.chain)).toEqual(Array.from(b.chain));
    expect(mk({}, 'STANDARD', 'ENGINEER', 4).inv.clues).not.toEqual(a.inv.clues);
  });
  it('does not depend on the frame rate', () => {
    for (const fps of [60, 30, 144]) {
      const st = new FixedStepper();
      const sim = mk();
      const o = buf();
      for (let t = 0; t < 45000 + 1000 / fps; t += 1000 / fps) for (let n = st.advance(1000 / fps); n > 0 && !sim.done; n--) sim.advance(goodPlayer(sim, o));
      expect(sim.done).toBe(true);
      expect(sim.result().success).toBe(true);
    }
  });
  for (const mode of MODES) {
    for (const slots of mode === 'ONE_BUTTON' ? [2, 3, 5] : [1, 3, 5]) {
      it(`a scripted good player succeeds on ≥ 20 seeds in ${mode} with ${slots} player(s) at every difficulty, and perfect implies success`, () => {
        for (const assist of ['CADET', 'ENGINEER', 'FLIGHT_DIRECTOR'] as AssistLevel[]) {
          let wins = 0;
          for (const seed of SEEDS) {
            const sim = play(makeSim({ slot: seed % slots, slots }, seed, mode, assist, DURATION_S));
            const r = sim.result();
            if (r.success) wins++;
            if (r.perfect) expect(r.success).toBe(true);
            expect(sim.step).toBeLessThanOrEqual(sim.totalSteps);
          }
          expect(wins).toBeGreaterThanOrEqual(20);
        }
      });
    }
    it(`an idle player fails in ${mode} on every seed`, () => {
      for (const seed of SEEDS) {
        const sim = runScripted(makeSim({}, seed, mode, 'ENGINEER', DURATION_S), () => buf());
        expect(sim.result().success).toBe(false);
        expect(sim.result().score).toBeLessThan(0.5);
      }
    });
    it(`a player who votes for another cause fails in ${mode}, never perfect`, () => {
      for (const seed of SEEDS.slice(0, 8)) {
        const r = play(makeSim({ slot: 0, slots: 3 }, seed, mode, 'ENGINEER', DURATION_S), true).result();
        expect(r.success).toBe(false);
        expect(r.perfect).toBe(false);
      }
    });
  }
  it('the result is stable after the end', () => {
    const sim = play(mk());
    const r = sim.result();
    sim.advance({ op: 3, a: 0, b: 0 });
    expect(sim.result()).toEqual(r);
  });
});
