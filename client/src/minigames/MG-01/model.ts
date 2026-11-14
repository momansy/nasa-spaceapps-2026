// MG-01 Unit Converter Sprint: rules and scoring. Pure: no DOM, no clock, no Math.random.
//
// PHYSICAL (exact by definition)
//   1 lbf = 4.4482216152605 N,  1 ft = 0.3048 m,  1 psi = 6.894757293168 kPa.
//   Values are shown to 3 significant figures.
// GAME SIMPLIFICATIONS (game values)
//   • Each card offers three SI lanes: the correct conversion, the unconverted number with the
//     SI unit (the Mars Climate Orbiter mistake, fact F01) and a wrong factor (pound-mass to kg
//     for lbf, the inverted factor for ft, bar instead of kPa for psi).
//   • 13 cards per run, fall time 4.6 s (Standard, Engineer), spawn interval fitted to the run.
//   • A card that reaches the upload line unsorted counts as wrong (T019 Decision).
import type { AssistLevel, MgMap, MinigameMode } from '@protocol';
import type { MinigameResult } from '../types';
import { assistFactor, clamp, DT_S, formatSig, intParam, mulberry32, STEP_HZ } from '../MG-02/kit';

/** Exact conversion factors (physical, by definition). */
export const LBF_TO_N = 4.4482216152605;
export const FT_TO_M = 0.3048;
export const PSI_TO_KPA = 6.894757293168;

/** Wrong factors used by the "wrong factor" distractor (game value; see the README). */
const WRONG_FACTOR = [0.45359237, 1 / 0.3048, 0.06894757293168];
const FACTOR = [LBF_TO_N, FT_TO_M, PSI_TO_KPA];

export const DEFAULTS = {
  /** Success: at least this many correct (data `correct_min`, ≥). */
  correct_min: 8,
  /** Success: at most this many wrong (data `wrong_max`, ≤). */
  wrong_max: 1,
  /** Cards per run (game value; the brief asks for at least 12). */
  cards: 13,
} as const;

/** Card kinds: 0 lbf → N, 1 ft → m, 2 psi → kPa. */
export type Kind = 0 | 1 | 2;
export const IMPERIAL_UNIT = ['lbf', 'ft', 'psi'] as const;
export const SI_UNIT = ['N', 'm', 'kPa'] as const;
/** What each lane holds. */
export type OptionKind = 'correct' | 'unconverted' | 'factor';

export interface Card {
  index: number;
  kind: Kind;
  /** Imperial value, already rounded to 3 significant figures. */
  value: number;
  /** Lane texts (number only, 3 significant figures), left to right. */
  options: [string, string, string];
  optionKinds: [OptionKind, OptionKind, OptionKind];
  correctLane: number;
  /** Planned spawn time, s (Standard / Relaxed; one-button spawns in turn). */
  spawnS: number;
}

export type CardState = 'waiting' | 'live' | 'correct' | 'wrong' | 'missed';

export interface Mg01Config {
  correctMin: number;
  wrongMax: number;
  cards: number;
  /** Time a card takes from its spawn to the upload line, s. */
  fallS: number;
  /** Playing time, s. */
  playS: number;
  oneButton: boolean;
  /** One-button: time each lane stays highlighted, s. */
  dwellS: number;
  /** One-button: full highlight cycles before a card counts as missed. */
  cycles: number;
}

/**
 * Host parameters + mode + difficulty → configuration (all game values).
 * Fall time 4.6 s; Relaxed ×1.4 ("values move more slowly"); Cadet ×1.25, Flight Director ×0.8.
 * One-button dwell 0.85 s per lane (Relaxed ×1.25, Cadet ×1.25, Flight Director ×0.8), 2 cycles.
 */
export function resolveConfig(params: MgMap, mode: MinigameMode, assist: AssistLevel, durationS: number): Mg01Config {
  const a = assistFactor(assist, 1.25, 0.8);
  const relaxed = mode === 'RELAXED' ? 1.4 : 1;
  return {
    correctMin: intParam(params, 'correct_min', DEFAULTS.correct_min, 1, 40),
    wrongMax: intParam(params, 'wrong_max', DEFAULTS.wrong_max, 0, 40),
    cards: intParam(params, 'cards', DEFAULTS.cards, 4, 40),
    fallS: 4.6 * a * relaxed,
    playS: durationS,
    oneButton: mode === 'ONE_BUTTON',
    dwellS: 0.85 * a * (mode === 'RELAXED' ? 1.25 : 1),
    cycles: 2,
  };
}

/** Rounds to 3 significant figures. */
function sig3(v: number): number {
  const mag = Math.floor(Math.log10(Math.abs(v)));
  const f = Math.pow(10, mag - 2);
  return Math.round(v / f) * f;
}

/** Value ranges per kind as log10 [min, max] (game values: engine thrust, altitude, tank pressure). */
const RANGE: Array<[number, number]> = [
  [2, 4.6], // 100 … 40 000 lbf
  [1.3, 4.4], // 20 … 25 000 ft
  [0.8, 3.4], // 6 … 2 500 psi
];

/** Seeds the deck: kinds, values, lane order and spawn times. */
export function createDeck(config: Mg01Config, seed: number): Card[] {
  const rnd = mulberry32(seed ^ 0x01c0);
  const n = config.cards;
  const interval = Math.max(0.6, (config.playS - config.fallS - 0.6) / Math.max(1, n - 1));
  const cards: Card[] = [];
  let lastKind = -1;
  for (let i = 0; i < n; i++) {
    let kind = Math.floor(rnd() * 3) as Kind;
    if (kind === lastKind) kind = ((kind + 1 + Math.floor(rnd() * 2)) % 3) as Kind;
    lastKind = kind;
    const [lo, hi] = RANGE[kind]!;
    const value = sig3(Math.pow(10, lo + rnd() * (hi - lo)));
    const texts: Record<OptionKind, string> = {
      correct: formatSig(value * FACTOR[kind]!, 3),
      unconverted: formatSig(value, 3),
      factor: formatSig(value * WRONG_FACTOR[kind]!, 3),
    };
    // Seeded lane order (a random permutation of the three options).
    const order: OptionKind[] = ['correct', 'unconverted', 'factor'];
    for (let k = order.length - 1; k > 0; k--) {
      const j = Math.floor(rnd() * (k + 1));
      [order[k], order[j]] = [order[j]!, order[k]!];
    }
    cards.push({
      index: i,
      kind,
      value,
      options: [texts[order[0]!], texts[order[1]!], texts[order[2]!]],
      optionKinds: [order[0]!, order[1]!, order[2]!],
      correctLane: order.indexOf('correct'),
      spawnS: 0.4 + i * interval,
    });
  }
  return cards;
}

export interface Mg01Score extends MinigameResult {
  correct: number;
  wrong: number;
}

/** Success: correct ≥ `correctMin` and wrong ≤ `wrongMax`. Perfect: success with no wrong. */
export function scoreRun(config: Pick<Mg01Config, 'correctMin' | 'wrongMax' | 'cards'>, correct: number, wrong: number): Mg01Score {
  const success = correct >= config.correctMin && wrong <= config.wrongMax;
  const perfect = success && wrong === 0;
  const score = clamp(correct / Math.max(1, config.cards) - 0.08 * wrong, 0, 1);
  return { success, perfect, score, correct, wrong };
}

/** Feedback of the last resolved card, for the drawing. */
export interface Outcome {
  card: number;
  lane: number;
  kind: 'correct' | 'unconverted' | 'factor' | 'missed';
  atS: number;
}

export class Mg01Sim {
  readonly config: Mg01Config;
  readonly deck: Card[];
  readonly state: CardState[];
  /** Time each card went live (one-button: when it appeared), s. */
  readonly liveAtS: Float64Array;
  readonly resolvedAtS: Float64Array;
  readonly totalSteps: number;
  step = 0;
  correct = 0;
  wrong = 0;
  last: Outcome | null = null;
  /** One-button: next card's spawn time. */
  private nextSpawnS = 0.3;

  constructor(config: Mg01Config, seed: number) {
    this.config = config;
    this.deck = createDeck(config, seed);
    this.state = this.deck.map(() => 'waiting' as CardState);
    this.liveAtS = new Float64Array(this.deck.length).fill(-1);
    this.resolvedAtS = new Float64Array(this.deck.length).fill(-1);
    this.totalSteps = Math.max(1, Math.round(config.playS * STEP_HZ));
  }

  get timeS(): number {
    return this.step * DT_S;
  }

  get resolved(): number {
    return this.correct + this.wrong;
  }

  get done(): boolean {
    return this.step >= this.totalSteps || this.resolved >= this.deck.length;
  }

  /** The front card the player sorts now, or −1. */
  get active(): number {
    for (let i = 0; i < this.deck.length; i++) if (this.state[i] === 'live') return i;
    return -1;
  }

  /** Fall progress 0 (spawn) … 1 (upload line) of card `i`. */
  progress(i: number): number {
    const at = this.liveAtS[i]!;
    if (at < 0) return 0;
    if (this.config.oneButton) return clamp((this.timeS - at) / 0.45, 0, 1) * 0.5;
    return clamp((this.timeS - at) / this.config.fallS, 0, 1);
  }

  /** One-button: which lane is highlighted now (−1 while the card enters). */
  highlight(): number {
    const i = this.active;
    if (i < 0 || !this.config.oneButton) return -1;
    const since = this.timeS - this.liveAtS[i]! - 0.45;
    if (since < 0) return -1;
    const start = (this.deck[i]!.index * 7 + this.deck[i]!.correctLane + 1) % 3; // seeded start lane
    return (start + Math.floor(since / this.config.dwellS)) % 3;
  }

  private resolve(i: number, lane: number) {
    const card = this.deck[i]!;
    const kind: Outcome['kind'] = lane < 0 ? 'missed' : card.optionKinds[lane]!;
    if (kind === 'correct') {
      this.correct++;
      this.state[i] = 'correct';
    } else {
      this.wrong++;
      this.state[i] = lane < 0 ? 'missed' : 'wrong';
    }
    this.resolvedAtS[i] = this.timeS;
    this.last = { card: i, lane, kind, atS: this.timeS };
    if (this.config.oneButton) this.nextSpawnS = this.timeS + 0.35;
  }

  /** Sorts the front card into lane 0–2 (left to right). Returns the outcome or null. */
  sort(lane: number): Outcome | null {
    if (this.done || lane < 0 || lane > 2) return null;
    const i = this.active;
    if (i < 0) return null;
    if (this.config.oneButton && this.highlight() < 0) return null;
    this.resolve(i, lane);
    return this.last;
  }

  /** One-button: chooses the highlighted lane. */
  press(): Outcome | null {
    if (!this.config.oneButton) return null;
    const h = this.highlight();
    return h < 0 ? null : this.sort(h);
  }

  tick(): void {
    if (this.done) return;
    this.step++;
    const t = this.timeS;
    if (this.config.oneButton) {
      const a = this.active;
      if (a < 0) {
        const next = this.state.indexOf('waiting');
        if (next >= 0 && t >= this.nextSpawnS) {
          this.state[next] = 'live';
          this.liveAtS[next] = t;
        }
      } else if (t - this.liveAtS[a]! - 0.45 >= this.config.dwellS * 3 * this.config.cycles) {
        this.resolve(a, -1);
      }
      return;
    }
    for (let i = 0; i < this.deck.length; i++) {
      if (this.state[i] === 'waiting' && t >= this.deck[i]!.spawnS) {
        this.state[i] = 'live';
        this.liveAtS[i] = this.deck[i]!.spawnS;
      }
      if (this.state[i] === 'live' && t - this.liveAtS[i]! >= this.config.fallS) this.resolve(i, -1);
    }
  }

  score(): Mg01Score {
    return scoreRun(this.config, this.correct, this.wrong);
  }

  result(): MinigameResult {
    const s = this.score();
    return { success: s.success, perfect: s.perfect, score: s.score };
  }
}

/**
 * Scripted good player (tests, demo, lab `auto=1`): sorts the front card into the correct
 * lane `reactS` after it becomes the front card. One-button: presses `reactS` into the
 * correct lane's highlight.
 */
export class Mg01Autopilot {
  private seen = -1;
  private seenAtS = 0;
  constructor(private readonly reactS = 0.55) {}

  apply(sim: Mg01Sim): Outcome | null {
    const i = sim.active;
    if (i < 0) return null;
    const card = sim.deck[i]!;
    if (sim.config.oneButton) {
      const h = sim.highlight();
      if (h !== card.correctLane) {
        this.seen = -1;
        return null;
      }
      if (this.seen !== i * 10 + h) {
        this.seen = i * 10 + h;
        this.seenAtS = sim.timeS;
      }
      return sim.timeS - this.seenAtS >= Math.min(this.reactS, sim.config.dwellS * 0.6) ? sim.press() : null;
    }
    if (this.seen !== i) {
      this.seen = i;
      this.seenAtS = sim.timeS;
    }
    return sim.timeS - this.seenAtS >= this.reactS ? sim.sort(card.correctLane) : null;
  }
}

export function runScripted(config: Mg01Config, seed: number, player: ((sim: Mg01Sim) => void) | null): Mg01Sim {
  const sim = new Mg01Sim(config, seed);
  while (!sim.done) {
    player?.(sim);
    sim.tick();
  }
  return sim;
}
