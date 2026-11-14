// MG-30 Mission Patch Design: rules. Pure: no DOM, no clock, no Math.random. Always succeeds.
//
// Phase 1: each player contributes one element; the category follows `slot` mod 4 (shape,
// symbol, colour, motto). Phase 2: the team votes among three patches composed from the
// contributions. Phase 3: the winning patch is shown.
// GAME VALUES: 8 shapes, 8 symbols, 8 colourways, 10 original mottos; Standard plays 75 % of
// `durationMs` (pick 42 %, vote 42 %, reveal 16 % of that), Relaxed and One-button the full time.
import type { AssistLevel, MgMap, MinigameMode } from '@protocol';
import type { MinigameResult } from '../types';
import { boolParam, DT_S, intParam, mulberry32, STANDARD_TIME_FRACTION, STEP_HZ } from '../MG-02/kit';

export const CATEGORIES = ['shape', 'symbol', 'colour', 'motto'] as const;
export type Category = 0 | 1 | 2 | 3;
/** Options per category (shape, symbol, colour, motto), game values. */
export const OPTION_COUNT = [8, 8, 8, 10] as const;
/** Candidate patches in the vote (game value, brief: 2–3). */
export const CANDIDATES = 3;

export interface Mg30Config {
  slot: number;
  slots: number;
  /** This player's category. */
  category: Category;
  pickS: number;
  voteS: number;
  revealS: number;
  oneButton: boolean;
  /** One-button: time each option (or candidate) stays highlighted, s. */
  dwellS: number;
  holdToToggle: boolean;
}

export function resolveConfig(params: MgMap, mode: MinigameMode, _assist: AssistLevel, durationS: number): Mg30Config {
  const total = durationS * (mode === 'STANDARD' ? STANDARD_TIME_FRACTION : 1);
  const slot = intParam(params, 'slot', 0, 0, 63);
  return {
    slot,
    slots: intParam(params, 'slots', 1, 1, 64),
    category: (slot % 4) as Category,
    pickS: total * 0.42,
    voteS: total * 0.42,
    revealS: total * 0.16,
    oneButton: mode === 'ONE_BUTTON',
    dwellS: mode === 'RELAXED' ? 1.2 : 1.0,
    holdToToggle: boolParam(params, 'hold_to_toggle', false),
  };
}

export type Phase = 'pick' | 'vote' | 'reveal' | 'done';

/** Elements of one patch: option per category. */
export type Patch = [number, number, number, number];

export interface Mg30Score extends MinigameResult {
  contributed: boolean;
  voted: boolean;
}

/** Always a success (participation). Perfect: contributed and voted. Score: half each. */
export function scoreRun(contributed: boolean, voted: boolean): Mg30Score {
  return { success: true, perfect: contributed && voted, score: (contributed ? 0.5 : 0) + (voted ? 0.5 : 0), contributed, voted };
}

export class Mg30Sim {
  readonly config: Mg30Config;
  readonly totalSteps: number;
  step = 0;
  /** This player's pick (option index) and vote (candidate), −1 none. */
  pick = -1;
  vote = -1;
  /** Elements from the host per category (−1 unknown). */
  readonly team: number[] = [-1, -1, -1, -1];
  /** Vote counts from the host, or null (then crew votes are simulated). */
  teamVotes: number[] | null = null;
  /** Seeded crew picks per category and alternates for the other candidates. */
  readonly crew: Patch;
  readonly alt: Patch;
  readonly alt2: Patch;
  /** Seeded crew votes (one per crew member). */
  readonly crewVotes: number[];
  private wasPressed = false;
  private pressPending = false;
  /** Seeded order of categories the alternates vary (same on every phone). */
  private readonly varyOrder: number[];

  constructor(config: Mg30Config, seed: number) {
    this.config = config;
    this.totalSteps = Math.max(1, Math.round((config.pickS + config.voteS + config.revealS) * STEP_HZ));
    const rnd = mulberry32(seed ^ 0x3030);
    const pickOf = (c: number) => Math.floor(rnd() * OPTION_COUNT[c]!);
    this.crew = [pickOf(0), pickOf(1), pickOf(2), pickOf(3)];
    const other = (c: number, not: number) => (not + 1 + Math.floor(rnd() * (OPTION_COUNT[c]! - 1))) % OPTION_COUNT[c]!;
    this.alt = [other(0, this.crew[0]), other(1, this.crew[1]), other(2, this.crew[2]), other(3, this.crew[3])];
    this.alt2 = [other(0, this.alt[0]), other(1, this.alt[1]), other(2, this.alt[2]), other(3, this.alt[3])];
    const crewCount = Math.max(2, config.slots - 1);
    this.crewVotes = Array.from({ length: crewCount }, () => Math.floor(rnd() * CANDIDATES));
    const order = [0, 1, 2, 3];
    for (let k = 3; k > 0; k--) {
      const j = Math.floor(rnd() * (k + 1));
      [order[k], order[j]] = [order[j]!, order[k]!];
    }
    this.varyOrder = order;
  }

  get timeS(): number {
    return this.step * DT_S;
  }

  get done(): boolean {
    return this.step >= this.totalSteps;
  }

  get phase(): Phase {
    const t = this.timeS;
    const c = this.config;
    if (t < c.pickS) return 'pick';
    if (t < c.pickS + c.voteS) return 'vote';
    if (t < c.pickS + c.voteS + c.revealS) return 'reveal';
    return 'done';
  }

  /** Seconds left in the current phase. */
  get phaseLeftS(): number {
    const t = this.timeS;
    const c = this.config;
    const ends = [c.pickS, c.pickS + c.voteS, c.pickS + c.voteS + c.revealS];
    for (const e of ends) if (t < e) return e - t;
    return 0;
  }

  /** Element used for category `c`: this player's pick, the team's, or the crew stand-in. */
  element(c: number): number {
    if (c === this.config.category) return this.pick >= 0 ? this.pick : this.crew[c]!;
    const t = this.team[c]!;
    return t >= 0 ? t : this.crew[c]!;
  }

  /** True when category `c` comes from a real teammate (host state). */
  fromTeam(c: number): boolean {
    return c !== this.config.category && this.team[c]! >= 0;
  }

  /**
   * The three candidates. A: everyone's elements. B and C each swap in seeded alternates for
   * seeded categories. They depend only on the seed and the elements, so every phone that has
   * the same shared elements shows the same three patches (the same letter means the same patch).
   */
  candidates(): Patch[] {
    const base: Patch = [this.element(0), this.element(1), this.element(2), this.element(3)];
    const others = this.varyOrder;
    // An alternate that differs from the base element (team picks can equal a seeded alternate).
    const altOf = (cat: number, first: Patch, second: Patch) => (first[cat] !== base[cat] ? first[cat]! : second[cat]!);
    const b: Patch = [...base] as Patch;
    b[others[0]!] = altOf(others[0]!, this.alt, this.alt2);
    b[others[2]!] = altOf(others[2]!, this.alt, this.alt2);
    const c: Patch = [...base] as Patch;
    c[others[1]!] = altOf(others[1]!, this.alt2, this.alt);
    return [base, b, c];
  }

  /** Vote counts per candidate (host counts, else this player's vote plus seeded crew votes). */
  tally(): number[] {
    if (this.teamVotes && this.teamVotes.length >= CANDIDATES) return this.teamVotes.slice(0, CANDIDATES);
    const t = new Array<number>(CANDIDATES).fill(0);
    for (const v of this.crewVotes) t[v]!++;
    if (this.vote >= 0) t[this.vote]!++;
    return t;
  }

  /** Winning candidate: most votes; a tie goes to the lowest letter (the same on every phone). */
  winner(): number {
    const t = this.tally();
    let best = 0;
    for (let i = 1; i < t.length; i++) if (t[i]! > t[best]!) best = i;
    return best;
  }

  /** One-button: highlighted option (pick phase) or candidate (vote phase), −1 otherwise. */
  highlight(): number {
    const t = this.timeS;
    if (this.phase === 'pick') return Math.floor(t / this.config.dwellS) % OPTION_COUNT[this.config.category];
    if (this.phase === 'vote') return Math.floor((t - this.config.pickS) / (this.config.dwellS * 1.2)) % CANDIDATES;
    return -1;
  }

  /** Picks an option of this player's category (pick phase; the last pick counts). */
  choose(option: number): boolean {
    if (this.phase !== 'pick' || option < 0 || option >= OPTION_COUNT[this.config.category]) return false;
    this.pick = option;
    return true;
  }

  /** Votes for a candidate (vote phase; the last vote counts). */
  castVote(candidate: number): boolean {
    if (this.phase !== 'vote' || candidate < 0 || candidate >= CANDIDATES) return false;
    this.vote = candidate;
    return true;
  }

  /** One-button press: takes the highlighted option or candidate. */
  press(): boolean {
    const h = this.highlight();
    if (h < 0) return false;
    return this.phase === 'pick' ? this.choose(h) : this.castVote(h);
  }

  tick(pressed = false): void {
    if (this.done) return;
    if (this.config.oneButton) {
      // Every press is one choice, so `hold_to_toggle` changes nothing here.
      if (pressed && !this.wasPressed) this.pressPending = true;
      this.wasPressed = pressed;
      if (this.pressPending) {
        this.pressPending = false;
        this.press();
      }
    }
    this.step++;
  }

  score(): Mg30Score {
    return scoreRun(this.pick >= 0, this.vote >= 0);
  }

  result(): MinigameResult {
    const s = this.score();
    return { success: s.success, perfect: s.perfect, score: s.score };
  }
}

/** Scripted player: picks option `k` after `reactS`, votes for candidate A after `reactS`. One-button: presses on its targets. */
export class Mg30Autopilot {
  constructor(
    private readonly reactS = 1.5,
    private readonly option = 2,
  ) {}

  /** Returns the one-button state for this step. */
  apply(sim: Mg30Sim): boolean {
    const target = sim.phase === 'pick' ? this.option % OPTION_COUNT[sim.config.category] : 0;
    if (sim.config.oneButton) return (sim.phase === 'pick' ? sim.pick < 0 : sim.phase === 'vote' && sim.vote < 0) && sim.highlight() === target;
    if (sim.phase === 'pick' && sim.pick < 0 && sim.timeS >= this.reactS) sim.choose(target);
    if (sim.phase === 'vote' && sim.vote < 0 && sim.timeS - sim.config.pickS >= this.reactS) sim.castVote(target);
    return false;
  }
}

export function runScripted(config: Mg30Config, seed: number, player: ((sim: Mg30Sim) => boolean) | null): Mg30Sim {
  const sim = new Mg30Sim(config, seed);
  while (!sim.done) sim.tick(player ? player(sim) : false);
  return sim;
}
