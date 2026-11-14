// MG-03 Weld Inspector: rules and scoring. Pure: no DOM, no clock, no Math.random.
//
// The film is a radiograph of three horizontal tank weld seams in film units (width 1,
// height FILM_H). Porosity clusters (gas voids) and cracks are seeded on the weld beads.
// GAME SIMPLIFICATIONS (game values)
//   • 6 defects (Cadet 5, Flight Director 7), half porosity clusters and half cracks.
//   • The scanning lens only enhances contrast (no magnification), so a defect is tapped
//     where it is seen. Hit radius 0.055 film widths (Relaxed ×1.4 with defects ×1.5,
//     Cadet ×1.25, Flight Director ×0.8, One-button ×1.3). The one-button scanner covers its
//     whole path in 90 % of the play time.
//   • A mark near an already found defect is ignored (no false alarm).
//   • Standard play ends at 75 % of `durationMs`, Relaxed uses the full time ("the scan time is
//     longer"); play also ends when every defect is found.
import type { AssistLevel, MgMap, MinigameMode } from '@protocol';
import type { MinigameResult } from '../types';
import { assistFactor, clamp, DT_S, intParam, mulberry32, numParam, STANDARD_TIME_FRACTION, STEP_HZ } from '../MG-02/kit';

/** Film height in film widths (game value). */
export const FILM_H = 1.25;
/** Weld seam centre lines and bead half-height, film widths (game values). */
export const SEAMS_Y = [0.26, 0.64, 1.02];
export const BEAD_HALF = 0.045;
/** Scanner margins along a seam, film widths (game values). */
const X0 = 0.08;
const X1 = 0.92;

export const DEFAULTS = {
  /** Success: found fraction at least (data `defects_found_fraction_min`, ≥). */
  defects_found_fraction_min: 0.8,
  /** Success: false alarms at most (data `false_alarms_max`, ≤). */
  false_alarms_max: 1,
  /** Hit radius, film widths (game value). */
  hit_radius: 0.055,
} as const;

export type DefectKind = 'porosity' | 'crack';

export interface Defect {
  kind: DefectKind;
  x: number;
  y: number;
  /** Size scale (1 normal, 1.5 in Relaxed). */
  size: number;
  /** Crack: half-length and angle; porosity: pore offsets (pairs) and radii. */
  halfLen: number;
  angle: number;
  pores: number[];
  seam: number;
}

export interface Mg03Config {
  foundMin: number;
  falseMax: number;
  defects: number;
  hitR: number;
  defectSize: number;
  /** Lens radius, film widths. */
  lensR: number;
  playS: number;
  oneButton: boolean;
  /** One-button scanner speed, film widths per second. */
  scanSpeed: number;
}

export function resolveConfig(params: MgMap, mode: MinigameMode, assist: AssistLevel, durationS: number): Mg03Config {
  const relaxed = mode === 'RELAXED';
  let hit = numParam(params, 'hit_radius', DEFAULTS.hit_radius, 0.02, 0.2) * assistFactor(assist, 1.25, 0.8);
  if (relaxed) hit *= 1.4;
  if (mode === 'ONE_BUTTON') hit *= 1.3;
  return {
    foundMin: numParam(params, 'defects_found_fraction_min', DEFAULTS.defects_found_fraction_min, 0.05, 1),
    falseMax: intParam(params, 'false_alarms_max', DEFAULTS.false_alarms_max, 0, 20),
    defects: intParam(params, 'defects', assist === 'CADET' ? 5 : assist === 'FLIGHT_DIRECTOR' ? 7 : 6, 2, 10),
    hitR: hit,
    defectSize: relaxed ? 1.5 : 1,
    lensR: relaxed ? 0.14 : 0.115,
    playS: durationS * (relaxed ? 1 : STANDARD_TIME_FRACTION),
    oneButton: mode === 'ONE_BUTTON',
    // The scanner covers the whole path (three seams and two hops) in 90 % of the play time.
    scanSpeed: scanPathLength() / (0.9 * durationS * (relaxed ? 1 : STANDARD_TIME_FRACTION)),
  };
}

/** Seeds the defects: on the beads, spread out, half of each kind. */
export function createDefects(config: Mg03Config, seed: number): Defect[] {
  const rnd = mulberry32(seed ^ 0x0303);
  const out: Defect[] = [];
  let guard = 0;
  while (out.length < config.defects && guard++ < 500) {
    const seam = out.length < 3 ? out.length : Math.floor(rnd() * 3);
    const x = 0.12 + rnd() * 0.76;
    const y = SEAMS_Y[seam]! + (rnd() - 0.5) * BEAD_HALF * 1.2;
    if (out.some((d) => Math.hypot(d.x - x, d.y - y) < 0.17)) continue;
    const kind: DefectKind = out.length % 2 === 0 ? 'porosity' : 'crack';
    const pores: number[] = [];
    const n = 4 + Math.floor(rnd() * 4);
    for (let i = 0; i < n; i++) pores.push((rnd() - 0.5) * 0.05, (rnd() - 0.5) * 0.03, 0.004 + rnd() * 0.005);
    out.push({ kind, x, y, size: config.defectSize, halfLen: 0.035 + rnd() * 0.025, angle: (rnd() - 0.5) * 1.2, pores, seam });
  }
  return out;
}

/** Distance from (x, y) to a defect (to the crack line, or to the cluster centre). */
export function defectDistance(d: Defect, x: number, y: number): number {
  if (d.kind === 'porosity') return Math.hypot(x - d.x, y - d.y);
  const hx = Math.cos(d.angle) * d.halfLen * d.size;
  const hy = Math.sin(d.angle) * d.halfLen * d.size;
  const ax = d.x - hx;
  const ay = d.y - hy;
  const bx = d.x + hx;
  const by = d.y + hy;
  const vx = bx - ax;
  const vy = by - ay;
  const t = clamp(((x - ax) * vx + (y - ay) * vy) / (vx * vx + vy * vy), 0, 1);
  return Math.hypot(x - (ax + vx * t), y - (ay + vy * t));
}

/** Length of the one-button scanner path, film widths. */
export function scanPathLength(): number {
  return SEAMS_Y.length * (X1 - X0) + (SEAMS_Y.length - 1) * (SEAMS_Y[1]! - SEAMS_Y[0]!);
}

/** One-button scanner path: along each seam in turn (alternating direction). */
export function scannerAt(config: Mg03Config, tS: number): { x: number; y: number } {
  const len = X1 - X0;
  const hop = SEAMS_Y[1]! - SEAMS_Y[0]!;
  let d = Math.max(0, tS) * config.scanSpeed;
  for (let i = 0; i < SEAMS_Y.length; i++) {
    const dir = i % 2 === 0 ? 1 : -1;
    if (d <= len) return { x: dir > 0 ? X0 + d : X1 - d, y: SEAMS_Y[i]! };
    d -= len;
    if (i < SEAMS_Y.length - 1) {
      if (d <= hop) return { x: dir > 0 ? X1 : X0, y: SEAMS_Y[i]! + d };
      d -= hop;
    }
  }
  return { x: SEAMS_Y.length % 2 === 1 ? X1 : X0, y: SEAMS_Y[SEAMS_Y.length - 1]! };
}

export interface Mg03Score extends MinigameResult {
  found: number;
  falseAlarms: number;
}

/**
 * Success: found / total ≥ `foundMin` (whole defects: 5 of 6 at 0.8) and false alarms ≤
 * `falseMax`. Perfect: every defect found and no false alarm. Score: found fraction − 0.1 per
 * false alarm, 0–1.
 */
export function scoreRun(config: Pick<Mg03Config, 'foundMin' | 'falseMax'>, found: number, total: number, falseAlarms: number): Mg03Score {
  const need = Math.ceil(config.foundMin * total - 1e-9);
  const success = found >= need && falseAlarms <= config.falseMax;
  const perfect = success && found === total && falseAlarms === 0;
  const score = clamp(found / Math.max(1, total) - 0.1 * falseAlarms, 0, 1);
  return { success, perfect, score, found, falseAlarms };
}

export interface Mark {
  x: number;
  y: number;
  hit: number;
  atS: number;
}

export class Mg03Sim {
  readonly config: Mg03Config;
  readonly defects: Defect[];
  readonly found: boolean[];
  readonly marks: Mark[] = [];
  readonly totalSteps: number;
  step = 0;
  falseAlarms = 0;
  /** Lens centre, film units (input or one-button scanner). */
  lensX = 0.5;
  lensY = SEAMS_Y[0]!;

  constructor(config: Mg03Config, seed: number) {
    this.config = config;
    this.defects = createDefects(config, seed);
    this.found = this.defects.map(() => false);
    this.totalSteps = Math.max(1, Math.round(config.playS * STEP_HZ));
    if (config.oneButton) {
      const p = scannerAt(config, 0);
      this.lensX = p.x;
      this.lensY = p.y;
    }
  }

  get timeS(): number {
    return this.step * DT_S;
  }

  get leftS(): number {
    return Math.max(0, (this.totalSteps - this.step) * DT_S);
  }

  get foundCount(): number {
    return this.found.filter(Boolean).length;
  }

  get done(): boolean {
    return this.step >= this.totalSteps || this.foundCount === this.defects.length;
  }

  /** Moves the lens (ignored in one-button mode, where the scanner moves itself). */
  setLens(x: number, y: number) {
    if (this.config.oneButton) return;
    this.lensX = clamp(x, 0, 1);
    this.lensY = clamp(y, 0, FILM_H);
  }

  /** Marks a point. Returns the defect index found, −1 for a false alarm, −2 when ignored. */
  mark(x: number, y: number): number {
    if (this.done) return -2;
    let best = -1;
    let bestD = Infinity;
    for (let i = 0; i < this.defects.length; i++) {
      const d = defectDistance(this.defects[i]!, x, y);
      if (d <= this.config.hitR && d < bestD) {
        best = i;
        bestD = d;
      }
    }
    if (best >= 0 && this.found[best]) return -2;
    if (best >= 0) {
      this.found[best] = true;
      this.marks.push({ x, y, hit: best, atS: this.timeS });
      return best;
    }
    this.falseAlarms++;
    this.marks.push({ x, y, hit: -1, atS: this.timeS });
    return -1;
  }

  /** Marks at the lens centre (keyboard, one button). */
  markLens(): number {
    return this.mark(this.lensX, this.lensY);
  }

  tick(): void {
    if (this.done) return;
    this.step++;
    if (this.config.oneButton) {
      const p = scannerAt(this.config, this.timeS);
      this.lensX = p.x;
      this.lensY = p.y;
    }
  }

  score(): Mg03Score {
    return scoreRun(this.config, this.foundCount, this.defects.length, this.falseAlarms);
  }

  result(): MinigameResult {
    const s = this.score();
    return { success: s.success, perfect: s.perfect, score: s.score };
  }
}

/**
 * Scripted good player: sweeps the lens to the next unfound defect along the seams at a
 * limited hand speed, then marks it after `reactS`. One-button: presses when the scanner is
 * over a defect.
 */
export class Mg03Autopilot {
  private waitS = 0;
  constructor(
    private readonly speed = 0.75,
    private readonly reactS = 0.3,
  ) {}

  apply(sim: Mg03Sim): void {
    if (sim.config.oneButton) {
      for (let i = 0; i < sim.defects.length; i++) {
        if (!sim.found[i] && defectDistance(sim.defects[i]!, sim.lensX, sim.lensY) < sim.config.hitR * 0.5) {
          sim.markLens();
          return;
        }
      }
      return;
    }
    let target = -1;
    let bestD = Infinity;
    for (let i = 0; i < sim.defects.length; i++) {
      if (sim.found[i]) continue;
      const d = Math.hypot(sim.defects[i]!.x - sim.lensX, sim.defects[i]!.y - sim.lensY);
      if (d < bestD) {
        bestD = d;
        target = i;
      }
    }
    if (target < 0) return;
    const d = sim.defects[target]!;
    const step = this.speed * DT_S;
    if (bestD > 0.01) {
      const k = Math.min(1, step / bestD);
      sim.setLens(sim.lensX + (d.x - sim.lensX) * k, sim.lensY + (d.y - sim.lensY) * k);
      this.waitS = this.reactS;
      return;
    }
    if (this.waitS > 0) {
      this.waitS -= DT_S;
      return;
    }
    sim.mark(d.x, d.y);
  }
}

export function runScripted(config: Mg03Config, seed: number, player: ((sim: Mg03Sim) => void) | null): Mg03Sim {
  const sim = new Mg03Sim(config, seed);
  while (!sim.done) {
    player?.(sim);
    sim.tick();
  }
  return sim;
}
