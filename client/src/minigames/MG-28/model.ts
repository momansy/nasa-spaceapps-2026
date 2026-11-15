// MG-28 Root Cause Investigation: the simulation and the scoring. Pure: no DOM, no clocks, no
// Math.random. The same seed, parameters and input samples give the same run on every phone.
//
// What is real and what is a game simplification
// ----------------------------------------------
// REAL-WORLD APPROXIMATE
//   After a real failure an investigation board assembles a chain of evidence from telemetry to
//   find the root cause (design 10.5 fact). The 14 failure modes are those of design 8.4.
// GAME SIMPLIFICATIONS (game values)
//   • The clue cards (`clues.ts`) are written for the game: 3 to 5 telemetry cards per failure mode
//     in the order of the chain of evidence, plus generic red herrings. Frequencies and numbers in
//     them are illustrative, not from a real investigation.
//   • Four cause options (the root cause and three other failure modes), shown in a seeded order.
//   • The vote of this player decides this player's result; teammates' placements and votes only
//     drive the display (`env.coop`), they never change the result.
//
// The contract shared with T024 (the host's Investigation screen) is written in README.md.
import type { AssistLevel, MgMap, MinigameMode } from '@protocol';
import type { MinigameResult } from '../types';
import { clamp, mulberry32, numParam, STEP_HZ } from '../MG-22/kit';
import { chainOf, CLUES, FAILURE_MODES, HERRINGS } from './clues';

export { STEP_HZ };

export const N_OPTIONS = 4;

export const DEFAULTS = {
  /** Standard deadline as a fraction of `durationMs` (rule: about 75 %; Relaxed has all of it). */
  deadline_fraction: 0.75,
  /** One-button: seconds each place stays highlighted (game_value). */
  highlight_s: 0.6,
} as const;

/** After the vote is locked the scene holds this many steps (1.5 s). */
const HOLD_STEPS = Math.round(1.5 * STEP_HZ);

/** The investigation as the host sends it (`mg.start.params`), validated. */
export interface Investigation {
  /** Four indices into the `failure_mode` enum (`FAILURE_MODES`), in the order shown. */
  options: number[];
  /** Index into `options` of the root cause. */
  correct: number;
  /** Clue-card ids (indices into `CLUES`) in play. */
  clues: number[];
  /** Number of places in the chain of evidence. */
  chainLen: number;
}

const isInt = (v: unknown, lo: number, hi: number): v is number => typeof v === 'number' && Number.isInteger(v) && v >= lo && v <= hi;

/** Reads the common parameters `cause_options`, `cause_correct`, `clues`, `chain_len`; null when missing or invalid. */
export function parseInvestigation(params: MgMap): Investigation | null {
  const o = params['cause_options'];
  const cl = params['clues'];
  const cc = params['cause_correct'];
  const len = params['chain_len'];
  if (!Array.isArray(o) || o.length !== N_OPTIONS || !o.every((v) => isInt(v, 0, FAILURE_MODES.length - 1)) || new Set(o).size !== N_OPTIONS) return null;
  if (!isInt(cc, 0, N_OPTIONS - 1)) return null;
  if (!Array.isArray(cl) || cl.length < 2 || cl.length > 40 || !cl.every((v) => isInt(v, 0, CLUES.length - 1)) || new Set(cl).size !== cl.length) return null;
  if (!isInt(len, 1, 8)) return null;
  return { options: o as number[], correct: cc, clues: cl as number[], chainLen: len };
}

/** A seeded investigation: a root cause, three other failure modes, their cards and two red herrings. */
export function buildInvestigation(seed: number): Investigation {
  const rnd = mulberry32(seed);
  const root = Math.floor(rnd() * FAILURE_MODES.length);
  const others: number[] = [];
  while (others.length < 3) {
    const m = Math.floor(rnd() * FAILURE_MODES.length);
    if (m !== root && !others.includes(m)) others.push(m);
  }
  const options = [root, ...others];
  for (let i = options.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [options[i], options[j]] = [options[j]!, options[i]!];
  }
  const chain = chainOf(root);
  const pool: number[] = [...chain];
  for (const m of others) {
    const c = chainOf(m);
    const a = Math.floor(rnd() * c.length);
    let b = Math.floor(rnd() * c.length);
    if (b === a) b = (b + 1) % c.length;
    pool.push(c[a]!, c[b]!);
  }
  const h1 = Math.floor(rnd() * HERRINGS.length);
  const h2 = (h1 + 1 + Math.floor(rnd() * (HERRINGS.length - 1))) % HERRINGS.length;
  pool.push(HERRINGS[h1]!, HERRINGS[h2]!);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [pool[i], pool[j]] = [pool[j]!, pool[i]!];
  }
  return { options, correct: options.indexOf(root), clues: pool, chainLen: chain.length };
}

export interface Mg28Config {
  slot: number;
  slots: number;
  /** Host investigation or null (the sim then builds one from the seed). */
  inv: Investigation | null;
  /** Positions in `inv.clues` dealt to this player, or null to deal by slot. */
  cards: number[] | null;
  deadlineSteps: number;
  oneButton: boolean;
  highlightSteps: number;
  /** Relaxed: mark the starting clue. */
  markStart: boolean;
}

/**
 * Turns the host parameters, the input mode (design section 16) and the difficulty (design 10.1
 * rule 6) into the configuration of one run.
 *
 * RELAXED ("more time to discuss and one clue card is marked as the starting point"): the deadline
 * is the whole run minus the 1.5 s hold (Standard: 75 %). ONE_BUTTON: the places of the chain are
 * highlighted in turn and a press puts your next card there. CADET: deadline ×1.25 (at most 100 %);
 * FLIGHT_DIRECTOR: ×0.8.
 */
export function resolveConfig(params: MgMap, mode: MinigameMode, assist: AssistLevel, durationS: number): Mg28Config {
  const slot = Math.max(0, Math.floor(numParam(params, 'slot', 0, 0, 99)));
  const slots = Math.max(1, Math.floor(numParam(params, 'slots', 1, 1, 99)));
  const inv = parseInvestigation(params);
  const cardsParam = params['cards'];
  let cards: number[] | null = null;
  if (inv && Array.isArray(cardsParam) && cardsParam.every((v) => isInt(v, 0, inv.clues.length - 1))) cards = [...new Set(cardsParam as number[])].sort((a, b) => a - b);
  const total = Math.round(durationS * STEP_HZ);
  let frac = numParam(params, 'deadline_fraction', DEFAULTS.deadline_fraction, 0.2, 1);
  if (assist === 'CADET') frac = Math.min(1, frac * 1.25);
  else if (assist === 'FLIGHT_DIRECTOR') frac *= 0.8;
  const relaxed = mode === 'RELAXED';
  const deadline = relaxed ? total - HOLD_STEPS : Math.min(total - HOLD_STEPS, Math.round(total * frac));
  return {
    slot,
    slots,
    inv,
    cards,
    deadlineSteps: Math.max(STEP_HZ, deadline),
    oneButton: mode === 'ONE_BUTTON',
    highlightSteps: Math.round(numParam(params, 'highlight_s', DEFAULTS.highlight_s, 0.2, 3) * STEP_HZ),
    markStart: relaxed,
  };
}

export interface Mg28Input {
  /** 0 nothing, 1 place clue `a` (index in `clues`) at chain place `b`, 2 clear chain place `a`, 3 vote for option `a`, 4 lock the vote, 5 press (one-button). */
  op: 0 | 1 | 2 | 3 | 4 | 5;
  a: number;
  b: number;
}

/** `ownSlot` values: a chain place 0…chainLen−1, ASIDE, or UNSET (still in hand). */
export const ASIDE = -2;
export const UNSET = -1;

export class Mg28Sim {
  readonly config: Mg28Config;
  readonly inv: Investigation;
  readonly totalSteps: number;
  readonly dtS = 1 / STEP_HZ;
  /** Cards of this player: indices into `inv.clues`. */
  readonly own: number[];
  /** Where each own card is: chain place, ASIDE or UNSET. */
  readonly ownSlot: Int16Array;
  /** The chain as this player built it: index in `inv.clues` per place, or −1. */
  readonly chain: Int16Array;
  /** Votes per option as this phone knows them (own vote only without `env.coop`). */
  readonly votes = new Int16Array(N_OPTIONS);
  /** Shared state from `env.coop` (newest), or null. */
  sharedChain: number[] | null = null;
  sharedVotes: number[] | null = null;
  sharedLocked = false;
  myVote = -1;
  locked = false;
  step = 0;
  private endStep = -1;
  private lastResult: MinigameResult | null = null;

  constructor(config: Mg28Config, seed: number, durationS: number) {
    this.config = config;
    this.inv = config.inv ?? buildInvestigation(seed);
    this.totalSteps = Math.max(1, Math.round(durationS * STEP_HZ));
    const n = this.inv.clues.length;
    if (config.cards) this.own = config.cards;
    else {
      // Dealt round-robin: card i goes to slot i mod slots (one player holds all of them).
      this.own = [];
      for (let i = 0; i < n; i++) if (i % config.slots === config.slot % config.slots) this.own.push(i);
    }
    this.ownSlot = new Int16Array(this.own.length).fill(UNSET);
    this.chain = new Int16Array(this.inv.chainLen).fill(-1);
  }

  get done(): boolean {
    return this.step >= this.totalSteps || (this.endStep >= 0 && this.step >= this.endStep);
  }
  get timeS(): number {
    return this.step * this.dtS;
  }
  get leftS(): number {
    return Math.max(0, (this.config.deadlineSteps - this.step) * this.dtS);
  }
  get correctMode(): number {
    return this.inv.options[this.inv.correct]!;
  }
  clueOf(i: number) {
    return CLUES[this.inv.clues[i]!]!;
  }
  /** Own cards still in hand, ascending. */
  inHand(): number[] {
    return this.own.filter((_, k) => this.ownSlot[k] === UNSET);
  }
  /** One-button phase: placing the cards, then voting. */
  get phase(): 'place' | 'vote' {
    return this.config.oneButton && this.inHand().length > 0 ? 'place' : 'vote';
  }
  /** Highlighted place (one-button): chain places, then "set aside" in the place phase; the options in the vote phase. */
  get highlight(): number {
    const n = this.phase === 'place' ? this.inv.chainLen + 1 : N_OPTIONS;
    return Math.floor(this.step / this.config.highlightSteps) % n;
  }
  /** The chain to draw: the shared one when the host sends it, else this player's own. */
  displayChain(): ArrayLike<number> {
    const s = this.sharedChain;
    return s && s.length === this.inv.chainLen ? s : this.chain;
  }
  displayVotes(): ArrayLike<number> {
    const s = this.sharedVotes;
    return s && s.length === N_OPTIONS ? s : this.votes;
  }
  /** Position of own card `i` in `own`, or −1. */
  private ownIndex(i: number): number {
    return this.own.indexOf(i);
  }
  /** The place in the true chain of a card (its `order`), or −1 when it is not part of it. */
  trueSlot(i: number): number {
    const c = this.clueOf(i);
    return c.mode === this.correctMode && c.order >= 0 && c.order < this.inv.chainLen ? c.order : -1;
  }
  /** The starting clue (place 0 of the true chain) as an index in `clues`, or −1. */
  get startClue(): number {
    return this.inv.clues.findIndex((id) => CLUES[id]!.mode === this.correctMode && CLUES[id]!.order === 0);
  }

  place(i: number, slot: number): boolean {
    const k = this.ownIndex(i);
    if (this.locked || k < 0 || slot < 0 || slot >= this.inv.chainLen) return false;
    // A card on an occupied place sends the other one back to the player's hand (if it is mine).
    const other = this.chain[slot]!;
    if (other >= 0) {
      const ko = this.ownIndex(other);
      if (ko >= 0) this.ownSlot[ko] = UNSET;
    }
    for (let s = 0; s < this.chain.length; s++) if (this.chain[s] === i) this.chain[s] = -1;
    this.chain[slot] = i;
    this.ownSlot[k] = slot;
    return true;
  }
  clear(slot: number): boolean {
    if (this.locked || slot < 0 || slot >= this.inv.chainLen) return false;
    const i = this.chain[slot]!;
    if (i < 0) return false;
    this.chain[slot] = -1;
    const k = this.ownIndex(i);
    if (k >= 0) this.ownSlot[k] = UNSET;
    return true;
  }
  setAside(i: number): boolean {
    const k = this.ownIndex(i);
    if (this.locked || k < 0) return false;
    for (let s = 0; s < this.chain.length; s++) if (this.chain[s] === i) this.chain[s] = -1;
    this.ownSlot[k] = ASIDE;
    return true;
  }
  vote(option: number): boolean {
    if (this.locked || option < 0 || option >= N_OPTIONS) return false;
    if (this.myVote >= 0) this.votes[this.myVote]!--;
    this.myVote = option;
    this.votes[option]!++;
    return true;
  }
  lock(): boolean {
    if (this.locked || this.myVote < 0) return false;
    this.locked = true;
    this.endStep = this.step + HOLD_STEPS;
    return true;
  }

  /** Advances one fixed step with at most one player action. */
  advance(input: Mg28Input): void {
    if (this.done) return;
    if (!this.locked) {
      switch (input.op) {
        case 1:
          this.place(input.a, input.b);
          break;
        case 2:
          this.clear(input.a);
          break;
        case 3:
          this.vote(input.a);
          break;
        case 4:
          this.lock();
          break;
        case 5:
          if (this.phase === 'place') {
            const next = this.inHand()[0];
            if (next !== undefined) {
              const h = this.highlight;
              if (h >= this.inv.chainLen) this.setAside(next);
              else this.place(next, h);
            }
          } else {
            this.vote(this.highlight);
            this.lock();
          }
          break;
        default:
          break;
      }
      if (!this.locked && this.step + 1 >= this.config.deadlineSteps) {
        this.locked = true; // time is up: the current vote (if any) stands
        this.endStep = this.step + 1 + HOLD_STEPS;
      }
    }
    this.step++;
  }

  /** Success: this player's final vote is the root cause. */
  get success(): boolean {
    return this.myVote === this.inv.correct;
  }
  /** Own cards placed correctly: true-chain cards on their place, all other cards off the chain. */
  ownCorrect(): { right: number; total: number } {
    let right = 0;
    this.own.forEach((i, k) => {
      const t = this.trueSlot(i);
      const s = this.ownSlot[k]!;
      if (t >= 0 ? s === t : s < 0) right++;
    });
    return { right, total: this.own.length };
  }
  /** Perfect: success and every own card is in a correct chain position (red herrings off the chain). */
  get perfect(): boolean {
    const c = this.ownCorrect();
    return this.success && c.right === c.total;
  }

  result(): MinigameResult {
    if (this.lastResult) return this.lastResult;
    const c = this.ownCorrect();
    const frac = c.total === 0 ? 1 : c.right / c.total;
    const success = this.success;
    const r: MinigameResult = { success, perfect: this.perfect, score: success ? clamp(0.6 + 0.4 * frac, 0.6, 1) : clamp(0.3 * frac, 0, 0.49) };
    if (this.done) this.lastResult = r;
    return r;
  }

  /** Coarse progress for the host's meter: cards placed right (half) and the right vote (half). */
  progress(): number {
    const c = this.ownCorrect();
    const placed = c.total === 0 ? 1 : c.right / c.total;
    return 0.5 * placed + (this.success ? 0.5 : 0);
  }
}

export function makeSim(params: MgMap, seed: number, mode: MinigameMode, assist: AssistLevel, durationS: number): Mg28Sim {
  return new Mg28Sim(resolveConfig(params, mode, assist, durationS), seed, durationS);
}

/**
 * Scripted good player (tests and the demo): one action every 0.25 s: puts each own true-chain card
 * on its place, then votes for the root cause and locks. In one-button mode it presses when the
 * highlight is on the right place for the next card (or "set aside"), then on the right option.
 * `wrongVote` votes for another option. Players do not get it.
 */
export function goodPlayer(sim: Mg28Sim, out: Mg28Input, wrongVote = false): Mg28Input {
  out.op = 0;
  if (sim.locked) return out;
  const cfg = sim.config;
  const target = wrongVote ? (sim.inv.correct + 1) % N_OPTIONS : sim.inv.correct;
  if (cfg.oneButton) {
    if (sim.step % cfg.highlightSteps !== 0) return out;
    if (sim.phase === 'place') {
      const next = sim.inHand()[0]!;
      const t = sim.trueSlot(next);
      if (sim.highlight === (t >= 0 ? t : sim.inv.chainLen)) out.op = 5;
    } else if (sim.highlight === target) out.op = 5;
    return out;
  }
  if (sim.step % 30 !== 0) return out;
  const hand = sim.inHand().find((i) => sim.trueSlot(i) >= 0);
  if (hand !== undefined) {
    out.op = 1;
    out.a = hand;
    out.b = sim.trueSlot(hand);
  } else if (sim.myVote !== target) {
    out.op = 3;
    out.a = target;
  } else out.op = 4;
  return out;
}

/** Runs a whole game with a scripted player. For tests and tools. */
export function runScripted(sim: Mg28Sim, player: (s: Mg28Sim, out: Mg28Input) => Mg28Input): Mg28Sim {
  const buf: Mg28Input = { op: 0, a: 0, b: 0 };
  while (!sim.done) sim.advance(player(sim, buf));
  return sim;
}
