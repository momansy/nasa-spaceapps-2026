// MG-19 Scrubber Fix: simulation and scoring. Pure: no DOM, no clock, no Math.random.
//
// Cooperative split, crewed flights. CO₂ is rising; the crew builds an adapter that joins a
// square filter to a round socket from spare parts (hose, tape, card, bag, sock). This player
// holds one part (`params.part`) and drags it into its slot; a wrong slot costs time. Teammates'
// parts come from `env.coop` or are placed by a simulated crew; the adapter's completion is
// shown but is not a local success input (Decision): each phone decides its own success.
//
// Accuracy and tone: fact F15 (Apollo 13: ground engineers invented a way to fit square CO₂
// filters into round sockets with items aboard, and the crew built it). The slot functions,
// the CO₂ scale and all timings here are game values; the gauge is labelled "game scale" and
// makes no claim about real CO₂ levels or effects.
import type { AssistLevel, MgMap, MinigameMode } from '@protocol';
import type { MinigameResult } from '../types';
import { assistFactor, clamp, DT_S, intParam, mulberry32, STEP_HZ } from '../MG-13/kit';

export const PARTS = ['hose', 'tape', 'card', 'bag', 'sock'] as const;
export type Part = (typeof PARTS)[number];
/** Adapter slots, from the square filter to the round socket (game value functions). */
export const SLOTS = ['cover', 'seal', 'stiffener', 'funnel', 'connector'] as const;
export type Slot = (typeof SLOTS)[number];
/** The slot each part belongs in (index into SLOTS), by part index (game value). */
export const CORRECT_SLOT: readonly number[] = [4, 1, 2, 3, 0]; // hose→connector, tape→seal, card→stiffener, bag→funnel, sock→cover

/** CO₂ on the gauge at the start and at the deadline, % on a game scale (game values). */
export const CO2_START = 1.0;
export const CO2_DEADLINE = 4.0;
/** Coop action name: x = [part index, slot index]. */
export const ACTION_PLACE = 'place';

export interface Mg19Config {
  part: number;
  /** Fraction of the run before the CO₂ deadline. */
  timeFraction: number;
  /** Lock-out after a wrong slot, s. */
  penaltyS: number;
  /** Perfect: correct at the first try within this fraction of the time. */
  perfectFraction: number;
  oneButton: boolean;
  cycleS: number;
}

/**
 * Host parameters + mode + difficulty → configuration. `part` (per player) defaults to
 * `slot mod 5`. Standard and One-button reach the CO₂ deadline at 75 % of the run, Relaxed at
 * 97 % ("CO₂ rises more slowly"). Wrong-slot lock-out 3 s (Cadet 2 s, Flight Director 4 s).
 * One-button: slots highlighted in turn every 1.3 s (Cadet 1.6 s, Flight Director 1.1 s).
 */
export function resolveConfig(params: MgMap, mode: MinigameMode, assist: AssistLevel): Mg19Config {
  const slot = intParam(params, 'slot', 0, 0, 63);
  return {
    part: intParam(params, 'part', slot % PARTS.length, 0, PARTS.length - 1),
    timeFraction: mode === 'RELAXED' ? 0.97 : 0.75,
    penaltyS: 3 * assistFactor(assist, 2 / 3, 4 / 3),
    perfectFraction: 0.5,
    oneButton: mode === 'ONE_BUTTON',
    cycleS: assist === 'CADET' ? 1.6 : assist === 'FLIGHT_DIRECTOR' ? 1.1 : 1.3,
  };
}

export interface Mg19Score {
  success: boolean;
  perfect: boolean;
  score: number;
}

/**
 * Success: this player's part placed in its correct slot before the deadline. Perfect: at the
 * first try and within the first half of the time. Score: 1 − 0.4 × time used − 0.15 per wrong
 * try (at least 0.3) for a success; 0 otherwise.
 */
export function scoreRun(placedStep: number, wrong: number, deadlineSteps: number, config: Pick<Mg19Config, 'perfectFraction'>): Mg19Score {
  if (placedStep < 0 || placedStep >= deadlineSteps) return { success: false, perfect: false, score: 0 };
  const f = placedStep / deadlineSteps;
  return { success: true, perfect: wrong === 0 && f <= config.perfectFraction, score: clamp(1 - 0.4 * f - 0.15 * wrong, 0.3, 1) };
}

/** After this player's part and the whole adapter are in, play ends this long later, s. */
export const AFTER_DONE_S = 1.2;

export class Mg19Sim {
  readonly config: Mg19Config;
  readonly deadlineSteps: number;
  step = 0;
  /** Part index per slot, −1 empty. */
  readonly filled: number[] = [-1, -1, -1, -1, -1];
  /** Who filled each slot: 'you', 'crew' (simulated) or 'team' (env.coop). */
  readonly filledBy: Array<'you' | 'crew' | 'team' | null> = [null, null, null, null, null];
  placedStep = -1;
  wrong = 0;
  /** Steps of lock-out left after a wrong slot; the slot that was wrong. */
  lockout = 0;
  lastWrongSlot = -1;
  /** One-button: highlighted slot. */
  highlight = 0;
  /** Team CO₂ from the host, if any (display only). */
  hostCo2: number | null = null;
  private queued: number | 'button' | null = null;
  private readonly crewAt: number[];
  private endStep: number;
  private readonly useCrew: boolean;

  constructor(config: Mg19Config, seed: number, runS: number, simulateCrew = true) {
    this.config = config;
    this.deadlineSteps = Math.max(1, Math.round(runS * config.timeFraction * STEP_HZ));
    this.endStep = this.deadlineSteps;
    this.useCrew = simulateCrew;
    const rnd = mulberry32(seed ^ 0x19c0);
    // Simulated crew place the other parts between 2 s and 55 % of the time.
    this.crewAt = PARTS.map((_, p) => (p === config.part ? -1 : Math.round((2 + rnd() * (this.deadlineSteps / STEP_HZ * 0.55 - 2)) * STEP_HZ)));
  }

  get done(): boolean {
    return this.step >= this.endStep;
  }

  get timeS(): number {
    return this.step * DT_S;
  }

  get endsAt(): number {
    return this.endStep;
  }

  /** CO₂ on the game scale: rises linearly to the deadline, falls once the adapter is complete. */
  get co2(): number {
    const f = clamp(this.step / this.deadlineSteps, 0, 1);
    const base = CO2_START + (CO2_DEADLINE - CO2_START) * f;
    return this.complete ? Math.max(CO2_START, base - (this.step - this.completeStep) * DT_S * 1.5) : base;
  }

  get complete(): boolean {
    return this.filled.every((p) => p >= 0);
  }

  private completeStep = -1;

  get placed(): boolean {
    return this.placedStep >= 0;
  }

  /** Drop this player's part into slot `i`. */
  place(i: number) {
    this.queued = i;
  }

  /** One-button: place into the highlighted slot. */
  press() {
    this.queued = 'button';
  }

  /** A teammate's placement reported by the host (decoration). */
  teamPlaced(part: number, slot: number) {
    if (part === this.config.part || slot < 0 || slot >= SLOTS.length || this.filled[slot]! >= 0) return;
    if (CORRECT_SLOT[part] !== slot) return;
    this.filled[slot] = part;
    this.filledBy[slot] = 'team';
  }

  tick() {
    if (this.done) return;
    const q = this.queued;
    this.queued = null;
    if (this.lockout > 0) this.lockout--;
    if (q !== null && !this.placed && this.lockout === 0 && this.step < this.deadlineSteps) {
      const slot = q === 'button' ? (this.config.oneButton ? this.highlight : -1) : q;
      if (slot >= 0 && slot < SLOTS.length && this.filled[slot]! < 0) {
        if (CORRECT_SLOT[this.config.part] === slot) {
          this.filled[slot] = this.config.part;
          this.filledBy[slot] = 'you';
          this.placedStep = this.step;
        } else {
          this.wrong++;
          this.lastWrongSlot = slot;
          this.lockout = Math.round(this.config.penaltyS * STEP_HZ);
        }
      }
    }
    if (this.useCrew) {
      for (let p = 0; p < PARTS.length; p++) {
        const at = this.crewAt[p]!;
        const s = CORRECT_SLOT[p]!;
        if (at >= 0 && this.step >= at && this.filled[s]! < 0) {
          this.filled[s] = p;
          this.filledBy[s] = 'crew';
        }
      }
    }
    if (this.complete && this.completeStep < 0) this.completeStep = this.step;
    this.step++;
    if (this.placed && this.complete && this.endStep === this.deadlineSteps) {
      this.endStep = Math.min(this.deadlineSteps, Math.max(this.step, Math.max(this.placedStep, this.completeStep) + Math.round(AFTER_DONE_S * STEP_HZ)));
    }
    if (this.config.oneButton) {
      const per = Math.max(1, Math.round(this.config.cycleS * STEP_HZ));
      this.highlight = Math.floor(this.step / per) % SLOTS.length;
    }
  }

  score(): Mg19Score {
    return scoreRun(this.placedStep, this.wrong, this.deadlineSteps, this.config);
  }

  result(): MinigameResult {
    const s = this.score();
    return { success: s.success, perfect: s.perfect, score: s.score };
  }
}

/** Scripted good crew member: reads the adapter for `readS`, then places the part (one-button: on its slot's highlight). */
export class Mg19Autopilot {
  constructor(private readonly readS = 1.2, private readonly firstWrong = false) {}
  private triedWrong = false;

  apply(sim: Mg19Sim) {
    if (sim.placed || sim.lockout > 0 || sim.timeS < this.readS) return;
    const right = CORRECT_SLOT[sim.config.part]!;
    let want = right;
    if (this.firstWrong && !this.triedWrong) {
      want = sim.filled.findIndex((p, i) => p < 0 && i !== right);
      if (want < 0) want = right;
    }
    if (sim.config.oneButton) {
      if (sim.highlight === want) {
        sim.press();
        if (want !== right) this.triedWrong = true;
      }
      return;
    }
    sim.place(want);
    if (want !== right) this.triedWrong = true;
  }
}

export function runScripted(config: Mg19Config, seed: number, runS: number, input: (sim: Mg19Sim) => void): Mg19Sim {
  const sim = new Mg19Sim(config, seed, runS);
  while (!sim.done) {
    input(sim);
    sim.tick();
  }
  return sim;
}
