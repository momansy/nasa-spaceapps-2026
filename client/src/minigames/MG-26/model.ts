// MG-26 Seven Minutes of Terror: the simulation and the scoring. Pure: no DOM, no clocks, no
// Math.random. The same seed and the same input samples give the same run on every phone.
//
// What is physical and what is a game simplification
// ---------------------------------------------------
// REAL-WORLD APPROXIMATE
//   • The seven steps of a Mars entry, descent and landing in their order: heat shield, parachute,
//     separate the heat shield, radar, descent engines, sky crane, cut the cables.
//   • One-way light time between Earth and Mars: about 3 to 22 minutes (fact F20; the brief says
//     4 to 24, the data fact line is followed). The lander cannot be flown live, so it is
//     programmed before entry and the team watches the result arrive.
// GAME SIMPLIFICATIONS (game values)
//   • The trigger of each step (an altitude in km or a time in s) has a plan value and a window; the
//     plan values are loosely patterned on the sequence, they are not mission data. The slider of a
//     step spans 1.2 × its plan value with the plan at a seeded place, the window is ±5 % of that span.
//   • The cards are dealt by team slot (card c to slot c mod min(slots, 7)); a teammate's cards
//     are placed by a seeded crew (decoration) or come from `env.coop`. Only this player's cards decide
//     this player's result.
//   • The watch phase is a 6 s replay; nothing in it changes the result.
import type { AssistLevel, MgMap, MinigameMode } from '@protocol';
import type { MinigameResult } from '../types';
import { clamp, mulberry32, numParam, STEP_HZ } from '../MG-22/kit';

export { STEP_HZ };

export const CARD_KEYS = ['shield', 'parachute', 'sepshield', 'radar', 'engines', 'skycrane', 'cables'] as const;
export const N_CARDS = CARD_KEYS.length;

/** Plan value of each step: `kind` 0 = altitude in km, 1 = time in s; base value (game_value). */
export const PLAN: ReadonlyArray<{ kind: 0 | 1; base: number }> = [
  { kind: 0, base: 125 },
  { kind: 0, base: 11 },
  { kind: 1, base: 24 },
  { kind: 0, base: 7 },
  { kind: 0, base: 2 },
  { kind: 1, base: 12 },
  { kind: 1, base: 6 },
];

export const DEFAULTS = {
  /** Half-width of a trigger window as a fraction of the slider span (game_value). */
  window_fraction: 0.05,
  /** Perfect: inside the middle fraction of the window (game_value). */
  perfect_fraction: 0.4,
  /** Fraction of `durationMs` available for programming in Standard (game_value, rule: about 75 %). */
  program_fraction: 0.75,
  /** One-button: seconds each position stays highlighted (game_value). */
  highlight_s: 0.7,
} as const;

/** The replay of the sequence lasts this many steps (6 s). */
export const WATCH_STEPS = 6 * STEP_HZ;

export interface Mg26Config {
  /** Cards this player holds, ascending. */
  own: number[];
  slot: number;
  slots: number;
  windowFraction: number;
  perfectFraction: number;
  /** Steps of the programming phase. */
  deadlineSteps: number;
  /** ONE_BUTTON: positions are highlighted in turn; triggers are preset to the plan. */
  oneButton: boolean;
  highlightSteps: number;
  /** Relaxed, Cadet: show the plan value on each card (always in this game); Cadet also marks the right slot. */
  markSlots: boolean;
}

/** Cards of a player: card c is dealt to slot c mod m, m = min(slots, 7); slots beyond seven hold copies. */
export function dealCards(slot: number, slots: number): number[] {
  const m = Math.max(1, Math.min(slots, N_CARDS));
  const mine = slot % m;
  const own: number[] = [];
  for (let c = 0; c < N_CARDS; c++) if (c % m === mine) own.push(c);
  return own;
}

/**
 * Turns the host parameters, the input mode (design section 16) and the difficulty (design 10.1
 * rule 6) into the configuration of one run.
 *
 * RELAXED ("more time to program and the timing window of each step is wider"): the programming
 * deadline is the whole run minus the replay (Standard: 75 % of it) and the window ×1.6. ONE_BUTTON:
 * positions highlighted in turn, triggers preset. CADET: window ×1.25 and the right place is
 * marked; FLIGHT_DIRECTOR: window ×0.8.
 */
export function resolveConfig(params: MgMap, mode: MinigameMode, assist: AssistLevel, durationS: number): Mg26Config {
  const slot = Math.max(0, Math.floor(numParam(params, 'slot', 0, 0, 99)));
  const slots = Math.max(1, Math.floor(numParam(params, 'slots', 1, 1, 99)));
  let win = numParam(params, 'window_fraction', DEFAULTS.window_fraction, 0.005, 0.5);
  if (assist === 'CADET') win *= 1.25;
  else if (assist === 'FLIGHT_DIRECTOR') win *= 0.8;
  if (mode === 'RELAXED') win *= 1.6;
  const total = Math.round(durationS * STEP_HZ);
  const frac = mode === 'RELAXED' ? 1 : numParam(params, 'program_fraction', DEFAULTS.program_fraction, 0.2, 1);
  const deadline = Math.max(STEP_HZ, Math.min(Math.round(total * frac), total - WATCH_STEPS));
  return {
    own: dealCards(slot, slots),
    slot,
    slots,
    windowFraction: win,
    perfectFraction: numParam(params, 'perfect_fraction', DEFAULTS.perfect_fraction, 0.05, 1),
    deadlineSteps: deadline,
    oneButton: mode === 'ONE_BUTTON',
    highlightSteps: Math.round(numParam(params, 'highlight_s', DEFAULTS.highlight_s, 0.2, 3) * STEP_HZ),
    markSlots: assist === 'CADET' || mode === 'RELAXED',
  };
}

export type Phase = 'program' | 'watch';

export interface Mg26Input {
  /** 0 nothing, 1 place card at position, 2 take card off the board, 3 set the trigger fraction, 4 send the program, 5 press (one-button). */
  op: 0 | 1 | 2 | 3 | 4 | 5;
  card: number;
  pos: number;
  /** Trigger as a fraction 0–1 of the slider span (op 3 and op 1). */
  frac: number;
}

export interface CardJudgement {
  placed: boolean;
  rightPlace: boolean;
  /** Distance of the trigger from the plan, in the card's unit (km or s). */
  offUnits: number;
  inWindow: boolean;
  inMiddle: boolean;
  score: number;
}

export class Mg26Sim {
  readonly config: Mg26Config;
  readonly totalSteps: number;
  readonly dtS = 1 / STEP_HZ;
  /** Plan value, slider start and span, per card (seeded). */
  readonly target = new Float64Array(N_CARDS);
  readonly lo = new Float64Array(N_CARDS);
  readonly span = new Float64Array(N_CARDS);
  /** One-way light time, minutes (seeded, 3…22; fact F20). */
  readonly lightMin: number;
  /** Board position of each card (this player's cards), −1 = in the tray. */
  readonly cardPos = new Int8Array(N_CARDS).fill(-1);
  /** Trigger of each card as a fraction of its slider span. */
  readonly frac = new Float64Array(N_CARDS).fill(0.5);
  /** Seeded crew: step at which each other card is placed at its right place (decoration). */
  readonly crewStep = new Int32Array(N_CARDS);
  /** Shared board from `env.coop` (card per position or −1), or null. */
  coopSeq: number[] | null = null;
  step = 0;
  phase: Phase = 'program';
  watchStart = -1;
  /** Card the player is editing / has picked from the tray, or −1. */
  active = -1;
  private lastResult: MinigameResult | null = null;

  constructor(config: Mg26Config, seed: number, durationS: number) {
    this.config = config;
    this.totalSteps = Math.max(1, Math.round(durationS * STEP_HZ));
    const rnd = mulberry32(seed);
    for (let c = 0; c < N_CARDS; c++) {
      const t = PLAN[c]!.base * (1 + (rnd() - 0.5) * 0.2);
      const span = t * 1.2;
      const lo = t - span * (0.3 + rnd() * 0.4);
      this.target[c] = t;
      this.span[c] = span;
      this.lo[c] = lo;
      this.crewStep[c] = Math.round((2 + rnd() * Math.max(1, config.deadlineSteps / STEP_HZ - 6)) * STEP_HZ);
    }
    this.lightMin = 3 + Math.floor(rnd() * 20);
    if (config.oneButton) for (const c of config.own) this.frac[c] = this.targetFrac(c);
    this.active = config.own[0] ?? -1;
  }

  get done(): boolean {
    return this.step >= this.totalSteps || (this.phase === 'watch' && this.step >= this.watchStart + WATCH_STEPS);
  }
  get timeS(): number {
    return this.step * this.dtS;
  }
  /** Programming time left, s. */
  get leftS(): number {
    return Math.max(0, (this.config.deadlineSteps - this.step) * this.dtS);
  }
  isOwn(c: number): boolean {
    return this.config.own.includes(c);
  }
  /** Plan trigger as a fraction of the slider span. */
  targetFrac(c: number): number {
    return (this.target[c]! - this.lo[c]!) / this.span[c]!;
  }
  /** Trigger value of a card in its unit (km or s). */
  valueOf(c: number): number {
    return this.lo[c]! + this.frac[c]! * this.span[c]!;
  }
  /** Half-width of the trigger window in the card's unit. */
  windowUnits(c: number): number {
    return this.config.windowFraction * this.span[c]!;
  }
  /** Position highlighted in turn in one-button mode. */
  get highlight(): number {
    return Math.floor(this.step / this.config.highlightSteps) % N_CARDS;
  }
  /** Own cards still in the tray, ascending. */
  trayCards(): number[] {
    return this.config.own.filter((c) => this.cardPos[c]! < 0);
  }
  /** Card at a board position (own, shared or crew) or −1, for the display. */
  cardAt(pos: number): { card: number; own: boolean } | null {
    for (const c of this.config.own) if (this.cardPos[c] === pos) return { card: c, own: true };
    if (this.coopSeq) {
      const v = this.coopSeq[pos];
      return v !== undefined && v >= 0 && !this.isOwn(v) ? { card: v, own: false } : null;
    }
    const c = pos; // the crew places a card at its right place
    if (!this.isOwn(c) && this.step >= this.crewStep[c]!) return { card: c, own: false };
    return null;
  }

  place(card: number, pos: number, frac?: number): boolean {
    if (this.phase !== 'program' || !this.isOwn(card) || pos < 0 || pos >= N_CARDS) return false;
    for (const c of this.config.own) if (c !== card && this.cardPos[c] === pos) this.cardPos[c] = -1;
    this.cardPos[card] = pos;
    if (frac !== undefined && !this.config.oneButton) this.frac[card] = clamp(frac, 0, 1);
    this.active = card;
    return true;
  }
  unplace(card: number): void {
    if (this.phase === 'program' && this.isOwn(card)) this.cardPos[card] = -1;
  }
  setFrac(card: number, f: number): void {
    if (this.phase !== 'program' || !this.isOwn(card) || this.config.oneButton) return;
    this.frac[card] = clamp(f, 0, 1);
  }
  send(): void {
    if (this.phase !== 'program') return;
    this.phase = 'watch';
    this.watchStart = this.step;
  }

  /** Advances one fixed step with at most one player action. */
  advance(input: Mg26Input): void {
    if (this.done) return;
    if (this.phase === 'program') {
      switch (input.op) {
        case 1:
          this.place(input.card, input.pos, input.frac);
          break;
        case 2:
          this.unplace(input.card);
          break;
        case 3:
          this.setFrac(input.card, input.frac);
          break;
        case 4:
          this.send();
          break;
        case 5: {
          const next = this.trayCards()[0];
          if (next !== undefined) this.place(next, this.highlight);
          break;
        }
        default:
          break;
      }
      if (this.phase === 'program' && this.step + 1 >= this.config.deadlineSteps) {
        this.step++;
        this.send();
        return;
      }
    }
    this.step++;
  }

  judgeCard(c: number): CardJudgement {
    const placed = this.cardPos[c]! >= 0;
    const rightPlace = this.cardPos[c] === c;
    const off = this.valueOf(c) - this.target[c]!;
    const win = this.windowUnits(c);
    const eps = 1e-6;
    const inWindow = Math.abs(off) <= win + eps;
    const inMiddle = Math.abs(off) <= this.config.perfectFraction * win + eps;
    let score = 0;
    if (placed) {
      if (!rightPlace) score = 0.25;
      else if (inWindow) score = 0.6 + 0.4 * (1 - Math.abs(off) / win);
      else score = 0.3 + 0.19 * (1 - Math.min(1, Math.abs(off) / (3 * win)));
    }
    return { placed, rightPlace, offUnits: off, inWindow: placed && rightPlace && inWindow, inMiddle: placed && rightPlace && inMiddle, score: clamp(score, 0, 1) };
  }

  /** Success: every own card is in its right position with its trigger inside the window. */
  get success(): boolean {
    return this.config.own.every((c) => this.judgeCard(c).inWindow);
  }
  get perfect(): boolean {
    return this.config.own.every((c) => this.judgeCard(c).inMiddle);
  }

  result(): MinigameResult {
    if (this.lastResult) return this.lastResult;
    const own = this.config.own;
    const mean = own.length === 0 ? 0 : own.reduce((s, c) => s + this.judgeCard(c).score, 0) / own.length;
    const success = this.success;
    const r: MinigameResult = { success, perfect: this.perfect, score: success ? clamp(mean, 0.6, 1) : Math.min(mean, 0.49) };
    if (this.done) this.lastResult = r;
    return r;
  }

  /** Coarse progress for the host's meter: cards placed correctly of this player's cards. */
  progress(): number {
    const own = this.config.own;
    if (own.length === 0) return 0;
    return own.filter((c) => this.judgeCard(c).inWindow).length / own.length;
  }
}

export function makeSim(params: MgMap, seed: number, mode: MinigameMode, assist: AssistLevel, durationS: number): Mg26Sim {
  return new Mg26Sim(resolveConfig(params, mode, assist, durationS), seed, durationS);
}

const IDLE: Mg26Input = { op: 0, card: 0, pos: 0, frac: 0 };

/**
 * Scripted good player (tests and the demo): one action every 0.2 s, placing each own card at its
 * right position with its trigger at the plan plus `offFraction` of the slider span, then sends. In
 * one-button mode it presses when the highlight is on the next card's own position. Players do not get it.
 */
export function goodPlayer(sim: Mg26Sim, out: Mg26Input, offFraction = 0): Mg26Input {
  out.op = 0;
  const cfg = sim.config;
  if (sim.phase !== 'program') return out;
  if (cfg.oneButton) {
    const next = sim.trayCards()[0];
    if (next !== undefined && sim.highlight === next && sim.step % cfg.highlightSteps === 0) out.op = 5;
    else if (next === undefined) out.op = 4;
    return out;
  }
  if (sim.step % 24 !== 0) return out;
  const next = sim.trayCards()[0];
  if (next !== undefined) {
    out.op = 1;
    out.card = next;
    out.pos = next;
    out.frac = clamp(sim.targetFrac(next) + offFraction, 0, 1);
  } else out.op = 4;
  return out;
}

/** Runs a whole game with a scripted player. For tests and tools. */
export function runScripted(sim: Mg26Sim, player: (s: Mg26Sim, out: Mg26Input) => Mg26Input): Mg26Sim {
  const buf: Mg26Input = { ...IDLE };
  while (!sim.done) sim.advance(player(sim, buf));
  return sim;
}
