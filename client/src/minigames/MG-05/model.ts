// MG-05 Clean Room: rules and scoring. Pure: no DOM, no clock, no Math.random.
//
// Field units: width 1, height FIELD_H. A camera lens (top) and a mirror (bottom) collect
// drifting particles; strokes with the swab wipe them. Too hard leaves a scratch.
// GAME SIMPLIFICATIONS (game values)
//   • "Too hard" is stroke speed above 2.0 field widths per second (so it scales with the
//     screen), measured over ≥ 1/30 s windows; or, on a device that reports real pressure,
//     PointerEvent.pressure above 0.75. One scratch at most per stroke, and only over glass.
//   • 24 particles (Cadet 20, Flight Director 28), drifting 1.6 s from the air to the glass;
//     none lands later than 2.5 s before the end (two raster passes in one-button mode).
//   • Clean fraction = 1 − (area of particles still on the glass / area of all that landed).
//   • One-button: the swab follows a fixed raster over both optics (1.1 field widths per
//     second, rows 0.1 apart, down and back up); holding wipes; holding over clean
//     glass for more than 1.5 s in a row rubs it dry and scratches.
import type { AssistLevel, MgMap, MinigameMode } from '@protocol';
import type { MinigameResult } from '../types';
import { assistFactor, boolParam, clamp, DT_S, intParam, mulberry32, numParam, STEP_HZ } from '../MG-02/kit';

/** Field height in field widths (game value). */
export const FIELD_H = 1.45;
/** Optics: centre and radius in field units (game values). */
export const LENS = { x: 0.5, y: 0.36, r: 0.28 };
export const MIRROR = { x: 0.5, y: 1.07, r: 0.27 };

export const DEFAULTS = {
  /** Success: clean fraction at least (data `clean_fraction_min`, ≥). */
  clean_fraction_min: 0.9,
  /** Success: scratches at most (data `scratches_max`, ≤). */
  scratches_max: 0,
  /** Stroke speed limit, field widths per second (game value). */
  speed_limit: 2.0,
} as const;

export interface Particle {
  /** Landing point (field units) and the optic: 0 lens, 1 mirror. */
  x: number;
  y: number;
  optic: 0 | 1;
  size: number;
  /** Fibre (a short curl) or dust speck. */
  fibre: boolean;
  angle: number;
  spawnS: number;
  landS: number;
  /** Drift start offset. */
  dx: number;
}

export interface Mg05Config {
  cleanMin: number;
  scratchesMax: number;
  speedLimit: number;
  particles: number;
  driftS: number;
  swabR: number;
  playS: number;
  oneButton: boolean;
  holdToToggle: boolean;
  dryRubS: number;
  perfectClean: number;
  /** PointerEvent.pressure above this is too hard (devices with real pressure only). */
  pressureLimit: number;
}

export function resolveConfig(params: MgMap, mode: MinigameMode, assist: AssistLevel, durationS: number): Mg05Config {
  const relaxed = mode === 'RELAXED';
  let limit = numParam(params, 'speed_limit', DEFAULTS.speed_limit, 0.3, 10) * assistFactor(assist, 1.25, 0.8);
  if (relaxed) limit *= 1.5;
  return {
    cleanMin: numParam(params, 'clean_fraction_min', DEFAULTS.clean_fraction_min, 0.05, 1),
    scratchesMax: intParam(params, 'scratches_max', DEFAULTS.scratches_max, 0, 20),
    speedLimit: limit,
    particles: intParam(params, 'particles', assist === 'CADET' ? 20 : assist === 'FLIGHT_DIRECTOR' ? 28 : 24, 4, 60),
    driftS: 1.6 * (relaxed ? 1.5 : 1),
    swabR: relaxed ? 0.085 : 0.07,
    playS: durationS,
    oneButton: mode === 'ONE_BUTTON',
    holdToToggle: boolParam(params, 'hold_to_toggle', false),
    dryRubS: 1.5, // game_value
    perfectClean: 0.98, // game_value
    pressureLimit: relaxed ? 0.86 : 0.75, // game_value: Relaxed "more forgiving"
  };
}

/** True when (x, y) is over glass; returns the optic index or −1. */
export function opticAt(x: number, y: number): number {
  if (Math.hypot(x - LENS.x, y - LENS.y) <= LENS.r) return 0;
  if (Math.hypot(x - MIRROR.x, y - MIRROR.y) <= MIRROR.r) return 1;
  return -1;
}

export function createParticles(config: Mg05Config, seed: number): Particle[] {
  const rnd = mulberry32(seed ^ 0x0505);
  // One-button: everything lands at least two raster passes before the end, so a pass covers it.
  const margin = config.oneButton ? 2 * rasterPassS() : 2.5;
  const lastStart = Math.max(0.5, config.playS - config.driftS - margin);
  const out: Particle[] = [];
  for (let i = 0; i < config.particles; i++) {
    const optic: 0 | 1 = rnd() < 0.5 ? 0 : 1;
    const o = optic === 0 ? LENS : MIRROR;
    const a = rnd() * Math.PI * 2;
    const d = Math.sqrt(rnd()) * o.r * 0.88;
    const spawnS = 0.3 + ((lastStart - 0.3) * (i + rnd() * 0.8)) / config.particles;
    out.push({ x: o.x + Math.cos(a) * d, y: o.y + Math.sin(a) * d, optic, size: 0.008 + rnd() * 0.01, fibre: rnd() < 0.3, angle: rnd() * Math.PI, spawnS, landS: spawnS + config.driftS, dx: (rnd() - 0.5) * 0.12 });
  }
  return out;
}

/** One-button swab speed along its path, field widths per second (game value). */
export const AUTO_SPEED = 1.1;
/** Row spacing of the one-button raster (smaller than the swab diameter, so rows overlap). */
const ROW_STEP = 0.1;

/** Waypoints of the one-button raster: rows across each optic's chord, left-right in turn. */
const RASTER: number[] = (() => {
  const pts: number[] = [];
  let i = 0;
  for (let y = LENS.y - LENS.r + 0.03; y <= MIRROR.y + MIRROR.r - 0.02; y += ROW_STEP, i++) {
    let half = 0;
    for (const o of [LENS, MIRROR]) {
      const dy = Math.abs(y - o.y);
      if (dy < o.r) half = Math.max(half, Math.sqrt(o.r * o.r - dy * dy) - 0.02);
    }
    const xl = 0.5 - half;
    const xr = 0.5 + half;
    if (i % 2 === 0) pts.push(xl, y, xr, y);
    else pts.push(xr, y, xl, y);
  }
  return pts;
})();
const RASTER_LEN: number[] = (() => {
  const acc = [0];
  for (let k = 2; k < RASTER.length; k += 2) acc.push(acc[acc.length - 1]! + Math.hypot(RASTER[k]! - RASTER[k - 2]!, RASTER[k + 1]! - RASTER[k - 1]!));
  return acc;
})();

/** One-button swab position: the raster, down and back up (ping-pong), field units. */
export function autoSwab(tS: number): { x: number; y: number } {
  const L = RASTER_LEN[RASTER_LEN.length - 1]!;
  let d = (Math.max(0, tS) * AUTO_SPEED) % (2 * L);
  if (d > L) d = 2 * L - d;
  let k = 1;
  while (k < RASTER_LEN.length - 1 && RASTER_LEN[k]! < d) k++;
  const d0 = RASTER_LEN[k - 1]!;
  const seg = RASTER_LEN[k]! - d0;
  const u = seg > 0 ? (d - d0) / seg : 0;
  const x0 = RASTER[(k - 1) * 2]!;
  const y0 = RASTER[(k - 1) * 2 + 1]!;
  return { x: x0 + (RASTER[k * 2]! - x0) * u, y: y0 + (RASTER[k * 2 + 1]! - y0) * u };
}

/** Time for one full raster pass, s. */
export function rasterPassS(): number {
  return RASTER_LEN[RASTER_LEN.length - 1]! / AUTO_SPEED;
}

export interface Mg05Score extends MinigameResult {
  clean: number;
  scratches: number;
}

/** Success: clean ≥ `cleanMin` and scratches ≤ `scratchesMax`. Perfect: clean ≥ 0.98 and no scratch. */
export function scoreRun(config: Pick<Mg05Config, 'cleanMin' | 'scratchesMax' | 'perfectClean'>, clean: number, scratches: number): Mg05Score {
  const success = clean >= config.cleanMin - 1e-9 && scratches <= config.scratchesMax;
  const perfect = success && clean >= config.perfectClean - 1e-9 && scratches === 0;
  return { success, perfect, score: clamp(clean - 0.25 * scratches, 0, 1), clean, scratches };
}

export interface Scratch {
  /** Polyline in field units (x, y pairs). */
  pts: number[];
}

/** Particle state: 0 waiting, 1 drifting, 2 on the glass, 3 wiped. */
export type PState = 0 | 1 | 2 | 3;

export class Mg05Sim {
  readonly config: Mg05Config;
  readonly particles: Particle[];
  readonly state: Uint8Array;
  readonly scratches: Scratch[] = [];
  readonly totalSteps: number;
  step = 0;
  /** Swab position, field units, and whether it touches the glass. */
  swabX = 0.5;
  swabY = 0.62;
  down = false;
  /** Last measured stroke speed, field widths per second (for the drawing). */
  speed = 0;
  /** True when the last window was too hard. */
  tooHard = false;
  wiped = 0;
  // Stroke measurement.
  private strokeScratched = false;
  private accDist = 0;
  /** Start of the current speed window, ms (sample timestamps). */
  private accFromMs = 0;
  private hardFlag = false;
  private strokePts: number[] = [];
  // One-button.
  private latched = false;
  private wasPressed = false;
  private dryS = 0;

  constructor(config: Mg05Config, seed: number) {
    this.config = config;
    this.particles = createParticles(config, seed);
    this.state = new Uint8Array(this.particles.length);
    this.totalSteps = Math.max(1, Math.round(config.playS * STEP_HZ));
    if (config.oneButton) {
      const p = autoSwab(0);
      this.swabX = p.x;
      this.swabY = p.y;
    }
  }

  get timeS(): number {
    return this.step * DT_S;
  }

  get done(): boolean {
    return this.step >= this.totalSteps;
  }

  /** Clean fraction now (1 when nothing has landed yet). */
  get clean(): number {
    let all = 0;
    let dirty = 0;
    for (let i = 0; i < this.particles.length; i++) {
      const s = this.state[i]!;
      if (s < 2) continue;
      const a = this.particles[i]!.size * this.particles[i]!.size;
      all += a;
      if (s === 2) dirty += a;
    }
    return all <= 0 ? 1 : 1 - dirty / all;
  }

  /** Wipes landed particles within the swab of the segment (x0, y0) → (x1, y1). */
  private sweep(x0: number, y0: number, x1: number, y1: number) {
    const r = this.config.swabR;
    const vx = x1 - x0;
    const vy = y1 - y0;
    const l2 = vx * vx + vy * vy;
    let hit = false;
    for (let i = 0; i < this.particles.length; i++) {
      if (this.state[i] !== 2) continue;
      const p = this.particles[i]!;
      const t = l2 > 0 ? clamp(((p.x - x0) * vx + (p.y - y0) * vy) / l2, 0, 1) : 0;
      if (Math.hypot(p.x - (x0 + vx * t), p.y - (y0 + vy * t)) <= r) {
        this.state[i] = 3;
        this.wiped++;
        hit = true;
      }
    }
    if (hit) this.dryS = 0;
  }

  /**
   * Swab touches down at (x, y) (a new stroke). `tMs` is the sample's timestamp (pointer events:
   * `event.timeStamp`); without it, play time is used. Speed comes from these timestamps, so it
   * does not depend on the frame rate or on how samples are batched between steps.
   */
  press(x: number, y: number, tMs = this.timeS * 1000) {
    if (this.config.oneButton || this.done) return;
    this.down = true;
    this.swabX = clamp(x, 0, 1);
    this.swabY = clamp(y, 0, FIELD_H);
    this.strokeScratched = false;
    this.accDist = 0;
    this.accFromMs = tMs;
    this.hardFlag = false;
    this.strokePts = [this.swabX, this.swabY];
    this.sweep(this.swabX, this.swabY, this.swabX, this.swabY);
  }

  /** Swab moves to (x, y) at sample time `tMs`; `hard` is real pressure above the limit. */
  move(x: number, y: number, hard = false, tMs = this.timeS * 1000) {
    if (this.config.oneButton || this.done) return;
    const nx = clamp(x, 0, 1);
    const ny = clamp(y, 0, FIELD_H);
    if (this.down) {
      this.sweep(this.swabX, this.swabY, nx, ny);
      this.accDist += Math.hypot(nx - this.swabX, ny - this.swabY);
      if (hard && opticAt(nx, ny) >= 0) this.hardFlag = true;
      this.strokePts.push(nx, ny);
      if (this.strokePts.length > 24) this.strokePts.splice(0, this.strokePts.length - 24);
      // Stroke speed over windows of at least 1/30 s of sample time.
      const elapsedS = (tMs - this.accFromMs) / 1000;
      if (elapsedS >= 1 / 30 - 1e-9) {
        this.speed = this.accDist / elapsedS;
        this.tooHard = this.speed > this.config.speedLimit || this.hardFlag;
        if (this.tooHard && opticAt(nx, ny) >= 0) this.addScratch();
        this.accDist = 0;
        this.accFromMs = tMs;
        this.hardFlag = false;
      } else if (this.hardFlag && opticAt(nx, ny) >= 0) {
        this.tooHard = true;
        this.addScratch();
      }
    }
    this.swabX = nx;
    this.swabY = ny;
  }

  /** Swab lifts (end of the stroke). */
  release() {
    this.down = false;
    this.speed = 0;
    this.tooHard = false;
  }

  private addScratch() {
    if (this.strokeScratched) return;
    this.strokeScratched = true;
    const pts = this.strokePts.length >= 4 ? this.strokePts.slice(-8) : [this.swabX - 0.03, this.swabY, this.swabX + 0.03, this.swabY + 0.01];
    this.scratches.push({ pts });
  }

  /** One fixed step; `pressed` is the one button (ignored in the other modes). */
  tick(pressed = false): void {
    if (this.done) return;
    this.step++;
    const t = this.timeS;
    for (let i = 0; i < this.particles.length; i++) {
      const s = this.state[i]!;
      const p = this.particles[i]!;
      if (s === 0 && t >= p.spawnS) this.state[i] = 1;
      if (this.state[i] === 1 && t >= p.landS) this.state[i] = 2;
    }
    if (this.config.oneButton) {
      let hold = pressed;
      if (this.config.holdToToggle) {
        if (pressed && !this.wasPressed) this.latched = !this.latched;
        hold = this.latched;
      }
      this.wasPressed = pressed;
      const p = autoSwab(t);
      const was = { x: this.swabX, y: this.swabY };
      this.swabX = p.x;
      this.swabY = p.y;
      if (hold) {
        if (!this.down) {
          this.down = true;
          this.strokeScratched = false;
          this.strokePts = [];
          this.dryS = 0;
        }
        this.strokePts.push(p.x, p.y);
        if (this.strokePts.length > 24) this.strokePts.splice(0, this.strokePts.length - 24);
        this.sweep(was.x, was.y, p.x, p.y);
        if (opticAt(p.x, p.y) >= 0) {
          this.dryS += DT_S;
          if (this.dryS > this.config.dryRubS) this.addScratch();
        }
        this.speed = Math.hypot(p.x - was.x, p.y - was.y) / DT_S;
      } else {
        this.down = false;
        this.speed = 0;
      }
      return;
    }
  }

  score(): Mg05Score {
    return scoreRun(this.config, this.clean, this.scratches.length);
  }

  result(): MinigameResult {
    const s = this.score();
    return { success: s.success, perfect: s.perfect, score: s.score };
  }
}

/**
 * Scripted good player: keeps the swab down and glides to the nearest particle on the glass at
 * `speed` (well under the limit). One-button: holds while a particle is near the swab's path.
 */
export class Mg05Autopilot {
  constructor(private readonly speed = 0.9) {}

  apply(sim: Mg05Sim): boolean {
    if (sim.config.oneButton) {
      const ahead = autoSwab(sim.timeS + 0.12);
      for (let i = 0; i < sim.particles.length; i++) {
        if (sim.state[i] !== 2) continue;
        const p = sim.particles[i]!;
        if (Math.hypot(p.x - ahead.x, p.y - ahead.y) <= sim.config.swabR * 1.5 || Math.hypot(p.x - sim.swabX, p.y - sim.swabY) <= sim.config.swabR) return true;
      }
      return false;
    }
    let best = -1;
    let bestD = Infinity;
    for (let i = 0; i < sim.particles.length; i++) {
      if (sim.state[i] !== 2) continue;
      const p = sim.particles[i]!;
      const d = Math.hypot(p.x - sim.swabX, p.y - sim.swabY);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    if (best < 0) return false;
    if (!sim.down) sim.press(sim.swabX, sim.swabY);
    const p = sim.particles[best]!;
    const k = Math.min(1, (this.speed * DT_S) / Math.max(1e-9, bestD));
    sim.move(sim.swabX + (p.x - sim.swabX) * k, sim.swabY + (p.y - sim.swabY) * k);
    return false;
  }
}

export function runScripted(config: Mg05Config, seed: number, player: ((sim: Mg05Sim) => boolean) | null): Mg05Sim {
  const sim = new Mg05Sim(config, seed);
  while (!sim.done) sim.tick(player ? player(sim) : false);
  return sim;
}
