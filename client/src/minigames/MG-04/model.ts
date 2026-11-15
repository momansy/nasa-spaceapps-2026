// MG-04 Orientation Check: rules and scoring. Pure: no DOM, no clock, no Math.random.
//
// Each part (an IMU with its axis triad, a g-switch, a keyed circular connector, a
// rectangular connector) is drawn without any mirror symmetry, so a rotation can match its
// drawing but a mirrored drawing can never be matched: that is the "drawing error" to catch
// (fact F21, Genesis: a design error put sensors in the wrong orientation).
// GAME SIMPLIFICATIONS (game values)
//   • 4 parts per run (Cadet 3, Flight Director 5), 90° steps, 1 wrong drawing (FD 2).
//   • Standard play ends at 75 % of `durationMs`; Relaxed and One-button use the full time.
//   • Perfect: everything right with at least 25 % of the play time left.
//   • One-button dwell 0.75 s per orientation and 1.0 s on the error choice (game values).
import type { AssistLevel, MgMap, MinigameMode } from '@protocol';
import type { MinigameResult } from '../types';
import { assistFactor, boolParam, clamp, DT_S, intParam, mulberry32, STANDARD_TIME_FRACTION, STEP_HZ } from '../MG-02/kit';

export type PartKind = 'imu' | 'gswitch' | 'circular' | 'rect';
export const PART_KINDS: readonly PartKind[] = ['imu', 'gswitch', 'circular', 'rect'];

export interface Part {
  kind: PartKind;
  /** Drawing orientation, quarter turns clockwise. */
  drawingRot: number;
  /** True when the drawing is mirrored (cannot be matched: press "drawing error"). */
  wrong: boolean;
  /** Orientation the part arrives in, quarter turns. */
  startRot: number;
}

export type Outcome = 'match' | 'caught' | 'mismatch' | 'missed_error' | 'false_flag' | 'unchecked';
export const GOOD_OUTCOMES: readonly Outcome[] = ['match', 'caught'];

export interface Mg04Config {
  allCorrectRequired: boolean;
  catchRequired: boolean;
  parts: number;
  errors: number;
  /** Length of the host window (the host timer bar), s. Standard play ends earlier (see `playS`). */
  durationS: number;
  playS: number;
  relaxedSnap: boolean;
  oneButton: boolean;
  /** One-button: time each orientation (and the error choice) is offered, s. */
  dwellS: number;
  errorDwellS: number;
  perfectLeftFraction: number;
}

export function resolveConfig(params: MgMap, mode: MinigameMode, assist: AssistLevel, durationS: number): Mg04Config {
  const a = assistFactor(assist, 1.25, 0.8);
  const parts = intParam(params, 'parts', assist === 'CADET' ? 3 : assist === 'FLIGHT_DIRECTOR' ? 5 : 4, 2, 8);
  return {
    allCorrectRequired: boolParam(params, 'all_correct_required', true),
    catchRequired: boolParam(params, 'drawing_error_catch_required', true),
    parts,
    errors: clamp(intParam(params, 'errors', assist === 'FLIGHT_DIRECTOR' ? 2 : 1, 1, 4), 1, parts - 1),
    durationS,
    playS: durationS * (mode === 'STANDARD' ? STANDARD_TIME_FRACTION : 1),
    relaxedSnap: mode === 'RELAXED',
    oneButton: mode === 'ONE_BUTTON',
    dwellS: 0.75 * a,
    errorDwellS: 1.0 * a,
    perfectLeftFraction: 0.25,
  };
}

/** Seeds the parts: kinds without repeats in a row, drawing and arrival orientations, errors. */
export function createParts(config: Mg04Config, seed: number): Part[] {
  const rnd = mulberry32(seed ^ 0x0404);
  const errorAt = new Set<number>();
  while (errorAt.size < config.errors) errorAt.add(Math.floor(rnd() * config.parts));
  const out: Part[] = [];
  let last = -1;
  for (let i = 0; i < config.parts; i++) {
    let k = Math.floor(rnd() * PART_KINDS.length);
    if (k === last) k = (k + 1 + Math.floor(rnd() * (PART_KINDS.length - 1))) % PART_KINDS.length;
    last = k;
    const drawingRot = Math.floor(rnd() * 4);
    // Arrives one to three quarter turns away from the drawing.
    const startRot = (drawingRot + 1 + Math.floor(rnd() * 3)) % 4;
    out.push({ kind: PART_KINDS[k]!, drawingRot, wrong: errorAt.has(i), startRot });
  }
  return out;
}

/** Quarter-turn distance between two orientations (0–2). */
export function rotDistance(a: number, b: number): number {
  const d = (((a - b) % 4) + 4) % 4;
  return Math.min(d, 4 - d);
}

export interface Mg04Score extends MinigameResult {
  correct: number;
}

/**
 * Success (data flags): with `all_correct_required` every part is right, otherwise at most one
 * wrong; with `drawing_error_catch_required` every wrong drawing must be caught (a missed one
 * fails), otherwise a missed wrong drawing is not held against the player. Perfect: everything
 * right with ≥ 25 % of the play time left. Score: right fraction × (0.8 + 0.2 × time left).
 */
export function scoreRun(config: Pick<Mg04Config, 'allCorrectRequired' | 'catchRequired' | 'parts' | 'perfectLeftFraction'>, parts: Part[], outcomes: Outcome[], leftFraction: number): Mg04Score {
  let correct = 0;
  let otherWrong = 0;
  let missedErrors = 0;
  for (let i = 0; i < parts.length; i++) {
    const o = outcomes[i] ?? 'unchecked';
    if (GOOD_OUTCOMES.includes(o)) correct++;
    else if (parts[i]!.wrong) missedErrors++;
    else otherWrong++;
  }
  const errorsCount = config.catchRequired ? missedErrors : 0;
  const wrongs = otherWrong + errorsCount;
  const success = (config.allCorrectRequired ? wrongs === 0 : otherWrong <= 1) && (!config.catchRequired || missedErrors === 0);
  const perfect = success && correct === parts.length && leftFraction >= config.perfectLeftFraction - 1e-9;
  const frac = correct / Math.max(1, parts.length);
  return { success, perfect, score: clamp(frac * (0.8 + 0.2 * clamp(leftFraction, 0, 1)), 0, 1), correct };
}

export class Mg04Sim {
  readonly config: Mg04Config;
  readonly parts: Part[];
  readonly outcomes: Outcome[] = [];
  readonly totalSteps: number;
  step = 0;
  /** Index of the part on screen. */
  current = 0;
  /** Its orientation now, quarter turns. */
  rot: number;
  /** Time the current part appeared, s. */
  shownAtS = 0;
  /** Last resolution, for the drawing. */
  last: { index: number; outcome: Outcome; atS: number } | null = null;

  constructor(config: Mg04Config, seed: number) {
    this.config = config;
    this.parts = createParts(config, seed);
    this.rot = this.parts[0]!.startRot;
    this.totalSteps = Math.max(1, Math.round(config.playS * STEP_HZ));
  }

  get timeS(): number {
    return this.step * DT_S;
  }

  get leftS(): number {
    return Math.max(0, (this.totalSteps - this.step) * DT_S);
  }

  /** Seconds left on the host timer bar (the whole window). The in-game time readout shows this one, so
      it always agrees with the bar; Standard play itself ends at 75 % of the window. */
  get windowLeftS(): number {
    return Math.max(0, this.config.durationS - this.timeS);
  }

  get done(): boolean {
    return this.step >= this.totalSteps || this.current >= this.parts.length;
  }

  get part(): Part | null {
    return this.parts[this.current] ?? null;
  }

  get correct(): number {
    return this.outcomes.filter((o) => GOOD_OUTCOMES.includes(o)).length;
  }

  /** One-button: what is offered now — an orientation (0–3) or 'error'. */
  offer(): number | 'error' {
    const p = this.part;
    if (!p) return 0;
    const cycle = this.config.dwellS * 4 + this.config.errorDwellS;
    const t = (this.timeS - this.shownAtS) % cycle;
    if (t >= this.config.dwellS * 4) return 'error';
    return (p.startRot + Math.floor(t / this.config.dwellS)) % 4;
  }

  /** Turns the part by `dir` quarter turns (+1 clockwise). */
  rotate(dir: 1 | -1): boolean {
    const p = this.part;
    if (!p || this.done || this.config.oneButton) return false;
    this.rot = (this.rot + dir + 4) % 4;
    // Relaxed: snaps onto the drawing's orientation when one step away. Every part snaps, so a
    // part that will not snap never gives a wrong (mirrored) drawing away; it still cannot match.
    if (this.config.relaxedSnap && rotDistance(this.rot, p.drawingRot) === 1) this.rot = p.drawingRot;
    return true;
  }

  private resolve(outcome: Outcome) {
    this.outcomes[this.current] = outcome;
    this.last = { index: this.current, outcome, atS: this.timeS };
    this.current++;
    this.shownAtS = this.timeS;
    const next = this.part;
    if (next) this.rot = next.startRot;
  }

  /** "Matches drawing". */
  confirm(): Outcome | null {
    const p = this.part;
    if (!p || this.done) return null;
    this.resolve(p.wrong ? 'missed_error' : this.rot === p.drawingRot ? 'match' : 'mismatch');
    return this.last!.outcome;
  }

  /** "Drawing error". */
  flag(): Outcome | null {
    const p = this.part;
    if (!p || this.done) return null;
    this.resolve(p.wrong ? 'caught' : 'false_flag');
    return this.last!.outcome;
  }

  /** One-button press: confirms the offered orientation or flags on the error choice. */
  press(): Outcome | null {
    if (!this.config.oneButton || this.done) return null;
    const o = this.offer();
    if (o === 'error') return this.flag();
    this.rot = o;
    return this.confirm();
  }

  tick(): void {
    if (this.done) return;
    this.step++;
    if (this.config.oneButton) {
      const o = this.offer();
      if (o !== 'error') this.rot = o;
    }
    if (this.step >= this.totalSteps) for (let i = this.current; i < this.parts.length; i++) this.outcomes[i] = 'unchecked';
  }

  score(): Mg04Score {
    return scoreRun(this.config, this.parts, this.outcomes, this.leftS / this.config.playS);
  }

  result(): MinigameResult {
    const s = this.score();
    return { success: s.success, perfect: s.perfect, score: s.score };
  }
}

/**
 * Scripted good player: looks for `lookS`, turns the short way (one press per `pressS`), then
 * confirms; on a wrong drawing it tries two turns and flags it. One-button: presses on the
 * matching orientation, or on the error choice for a wrong drawing.
 */
export class Mg04Autopilot {
  private nextS = -1;
  private seen = -1;
  private tries = 0;
  constructor(
    private readonly lookS = 0.5,
    private readonly pressS = 0.28,
  ) {}

  apply(sim: Mg04Sim): void {
    const p = sim.part;
    if (!p) return;
    if (sim.config.oneButton) {
      const o = sim.offer();
      const t = (sim.timeS - sim.shownAtS) % (sim.config.dwellS * 4 + sim.config.errorDwellS);
      const into = o === 'error' ? t - sim.config.dwellS * 4 : t % sim.config.dwellS;
      if (into < 0.25) return;
      if ((o === 'error' && p.wrong) || (o !== 'error' && !p.wrong && o === p.drawingRot)) sim.press();
      return;
    }
    if (this.seen !== sim.current) {
      this.seen = sim.current;
      this.tries = 0;
      this.nextS = sim.timeS + this.lookS;
    }
    if (sim.timeS < this.nextS) return;
    this.nextS = sim.timeS + this.pressS;
    if (p.wrong) {
      if (this.tries < 2) {
        sim.rotate(1);
        this.tries++;
      } else sim.flag();
      return;
    }
    if (sim.rot === p.drawingRot) {
      sim.confirm();
      return;
    }
    const cw = (((p.drawingRot - sim.rot) % 4) + 4) % 4;
    sim.rotate(cw <= 2 ? 1 : -1);
  }
}

export function runScripted(config: Mg04Config, seed: number, player: ((sim: Mg04Sim) => void) | null): Mg04Sim {
  const sim = new Mg04Sim(config, seed);
  while (!sim.done) {
    player?.(sim);
    sim.tick();
  }
  return sim;
}
