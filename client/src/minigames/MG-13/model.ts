// MG-13 Ground Station Pass: simulation and scoring. Pure: no DOM, no clock, no Math.random.
// The same seed, parameters and input samples give the same run on every phone.
//
// What is physical and what is a game simplification
// ---------------------------------------------------
// The playfield is a sky plot (a polar az/el chart as used by ground stations): the centre is
// the zenith (90° elevation), the outer ring the horizon (0°), radius ∝ 90° − elevation.
// PHYSICAL (qualitative)
//   • A satellite pass rises, culminates at a maximum elevation and sets; it moves slowly near
//     the horizon and fastest near culmination, and higher passes sweep the azimuth faster.
//   • A link exists only while the station is in view (fact F09).
// GAME SIMPLIFICATIONS (game values)
//   • Pass geometry: a straight-line overflight at constant speed above a flat ground plane
//     (height 1, closest ground distance cot(E_max)), from 5° elevation to 5° elevation.
//     Real passes follow a curved Earth and an orbit; the shape is close for a single pass.
//   • A real pass lasts minutes; it is squeezed into 15 s (Standard) or the whole run (Relaxed).
//   • The antenna slews at most `slewPerS` plot radii per second; the lock circle radius,
//     the data rate and the 95 % "perfect" threshold are game values.
import type { AssistLevel, MgMap, MinigameMode } from '@protocol';
import type { MinigameResult } from '../types';
import { assistFactor, clamp, DT_S, mulberry32, needSteps, numParam, STEP_HZ } from './kit';

/** Defaults of the host parameters (`mg.start.params`). */
export const DEFAULTS = {
  /** Success: locked at least this fraction of the pass (data/minigames.json: 0.75). */
  lock_fraction_min: 0.75,
  /** Perfect: locked at least this fraction (game value). */
  perfect_fraction_min: 0.95,
  /** Lock circle radius in sky-plot radii (horizon = 1), Standard, Engineer (game value). */
  lock_radius: 0.13,
} as const;

/** Elevation mask where the pass starts and ends, degrees (game value; real masks are 5–10°). */
export const MASK_DEG = 5;
/** Downlink rate while locked, Mbit/s (game value, only drives the data bar). */
export const DATA_RATE_MBIT_S = 8;
/** Fraction of `durationMs` the Standard pass lasts; Relaxed uses all of it (game value). */
export const STANDARD_TIME_FRACTION = 0.75;

export interface Mg13Config {
  lockFractionMin: number;
  perfectFractionMin: number;
  /** Lock circle radius, sky-plot radii. */
  lockRadius: number;
  /** Lowest and highest culmination elevation the seed may choose, degrees. */
  maxElLoDeg: number;
  maxElHiDeg: number;
  /** Fixed culmination elevation from the host, degrees, or null for seeded. */
  maxElDeg: number | null;
  /** Fraction of the run the pass lasts. */
  timeFraction: number;
  /** Fastest antenna slew, sky-plot radii per second. */
  slewPerS: number;
  oneButton: boolean;
  /** One-button drift speed range, sky-plot radii per second. */
  driftLo: number;
  driftHi: number;
}

/**
 * Host parameters + input mode (design 16) + difficulty (design 10.1 rule 6) → configuration.
 * Lock radius: Relaxed ×1.45, One-button ×1.15; Cadet ×1.25, Flight Director ×0.8.
 * Culmination range: Cadet 25–55°, Engineer 30–70°, Flight Director 40–78° (higher = faster).
 * Pass time: Standard and One-button 75 % of the run, Relaxed 97 % (slower station).
 */
export function resolveConfig(params: MgMap, mode: MinigameMode, assist: AssistLevel): Mg13Config {
  const success = numParam(params, 'lock_fraction_min', DEFAULTS.lock_fraction_min, 0.05, 1);
  const perfect = Math.max(success, numParam(params, 'perfect_fraction_min', DEFAULTS.perfect_fraction_min, 0.05, 1));
  let radius = numParam(params, 'lock_radius', DEFAULTS.lock_radius, 0.04, 0.4);
  radius *= assistFactor(assist, 1.25, 0.8);
  if (mode === 'RELAXED') radius *= 1.45;
  else if (mode === 'ONE_BUTTON') radius *= 1.15;
  const lo = assist === 'CADET' ? 25 : assist === 'FLIGHT_DIRECTOR' ? 40 : 30;
  const hi = assist === 'CADET' ? 55 : assist === 'FLIGHT_DIRECTOR' ? 78 : 70;
  const fixed = typeof params['max_elevation_deg'] === 'number' ? numParam(params, 'max_elevation_deg', 45, 10, 85) : null;
  const drift = assistFactor(assist, 0.8, 1.2);
  return {
    lockFractionMin: success,
    perfectFractionMin: perfect,
    lockRadius: radius,
    maxElLoDeg: lo,
    maxElHiDeg: hi,
    maxElDeg: fixed,
    timeFraction: mode === 'RELAXED' ? 0.97 : STANDARD_TIME_FRACTION,
    slewPerS: 2.4,
    oneButton: mode === 'ONE_BUTTON',
    driftLo: 0.075 * drift,
    driftHi: 0.11 * drift,
  };
}

const RAD = Math.PI / 180;

export interface Pass {
  /** Culmination elevation, degrees. */
  maxElDeg: number;
  /** Azimuth of culmination, degrees from north, clockwise. */
  culminationAzDeg: number;
  /** +1 the pass runs clockwise on the plot, −1 counter-clockwise. */
  sense: 1 | -1;
  /** Closest ground distance of the straight overflight (height = 1). */
  y0: number;
  /** Half the ground length between the two 5° mask crossings. */
  halfLength: number;
  /** Length of the pass in play time, s. */
  durationS: number;
}

export function createPass(config: Mg13Config, seed: number, runS: number): Pass {
  const rnd = mulberry32(seed ^ 0x13a5);
  const maxEl = config.maxElDeg ?? config.maxElLoDeg + (config.maxElHiDeg - config.maxElLoDeg) * rnd();
  const y0 = 1 / Math.tan(maxEl * RAD);
  const far = 1 / Math.tan(MASK_DEG * RAD);
  return {
    maxElDeg: maxEl,
    culminationAzDeg: Math.floor(rnd() * 360),
    sense: rnd() < 0.5 ? 1 : -1,
    y0,
    halfLength: Math.sqrt(Math.max(0, far * far - y0 * y0)),
    durationS: runS * config.timeFraction,
  };
}

/** A point on the sky plot. x to the east (right), y to the south (down); radius 1 = horizon. */
export interface SkyPoint {
  x: number;
  y: number;
  elDeg: number;
  azDeg: number;
}

/** Writes where the station is at play time `tS` into `out` (no allocation). */
export function passPoint(pass: Pass, tS: number, out: SkyPoint): SkyPoint {
  const tau = clamp(tS / pass.durationS, 0, 1);
  const along = (2 * tau - 1) * pass.halfLength; // ground distance along the track
  const ground = Math.sqrt(along * along + pass.y0 * pass.y0);
  const el = Math.atan(1 / ground) / RAD; // flat-ground overflight at height 1
  const az = pass.culminationAzDeg + pass.sense * (Math.atan2(along, pass.y0) / RAD);
  const r = 1 - el / 90;
  out.elDeg = el;
  out.azDeg = ((az % 360) + 360) % 360;
  out.x = r * Math.sin(az * RAD);
  out.y = -r * Math.cos(az * RAD);
  return out;
}

/** Converts elevation/azimuth to sky-plot coordinates. */
export function skyXY(elDeg: number, azDeg: number): { x: number; y: number } {
  const r = 1 - elDeg / 90;
  return { x: r * Math.sin(azDeg * RAD), y: -r * Math.cos(azDeg * RAD) };
}

export interface Mg13Score {
  success: boolean;
  perfect: boolean;
  score: number;
}

/** Success: locked ≥ `lockFractionMin` of the steps (exactly 75 % counts); perfect ≥ `perfectFractionMin`. */
export function scoreRun(lockSteps: number, totalSteps: number, config: Pick<Mg13Config, 'lockFractionMin' | 'perfectFractionMin'>): Mg13Score {
  if (totalSteps <= 0) return { success: false, perfect: false, score: 0 };
  const success = lockSteps >= needSteps(config.lockFractionMin, totalSteps);
  const perfect = success && lockSteps >= needSteps(config.perfectFractionMin, totalSteps);
  return { success, perfect, score: clamp(lockSteps / totalSteps, 0, 1) };
}

export class Mg13Sim {
  readonly config: Mg13Config;
  readonly pass: Pass;
  readonly totalSteps: number;
  step = 0;
  /** Antenna reticle, sky-plot units. Parks at the zenith. */
  rx = 0;
  ry = 0;
  /** Where the player asks the reticle to be (Standard / Relaxed). */
  aimX = 0;
  aimY = 0;
  /** One-button: offset of the self-tracking antenna from the station. */
  offX = 0;
  offY = 0;
  locked = false;
  lockSteps = 0;
  /** Lock state per step, for the data strip. */
  readonly lockHistory: Uint8Array;
  readonly station: SkyPoint = { x: 0, y: 0, elDeg: 0, azDeg: 0 };
  /** One-button: steps of re-centring left; number of presses. */
  recentre = 0;
  presses = 0;
  private pressQueued = false;
  private readonly rnd: () => number;
  private driftVX = 0;
  private driftVY = 0;
  private nextDriftStep = 0;

  constructor(config: Mg13Config, seed: number, runS: number) {
    this.config = config;
    this.pass = createPass(config, seed, runS);
    this.totalSteps = Math.max(1, Math.round(this.pass.durationS * STEP_HZ));
    this.lockHistory = new Uint8Array(this.totalSteps);
    this.rnd = mulberry32(seed ^ 0x77d1);
    passPoint(this.pass, 0, this.station);
    if (config.oneButton) {
      // The self-tracking antenna starts on the station.
      this.rx = this.station.x;
      this.ry = this.station.y;
    }
    this.locked = this.distance() <= config.lockRadius;
  }

  get done(): boolean {
    return this.step >= this.totalSteps;
  }

  get timeS(): number {
    return this.step * DT_S;
  }

  get lockFraction(): number {
    return this.step === 0 ? 0 : this.lockSteps / this.step;
  }

  /** Data downlinked so far, Mbit (game value rate). */
  get dataMbit(): number {
    return this.lockSteps * DT_S * DATA_RATE_MBIT_S;
  }

  /** Data of a fully locked pass, Mbit. */
  get fullDataMbit(): number {
    return this.totalSteps * DT_S * DATA_RATE_MBIT_S;
  }

  distance(): number {
    return Math.hypot(this.rx - this.station.x, this.ry - this.station.y);
  }

  /** Standard / Relaxed: where the reticle should go (clamped to just past the horizon). */
  aim(x: number, y: number) {
    const r = Math.hypot(x, y);
    const k = r > 1.05 ? 1.05 / r : 1;
    this.aimX = x * k;
    this.aimY = y * k;
  }

  /** One-button: a press re-centres the antenna on the station. */
  press() {
    this.pressQueued = true;
  }

  private drift() {
    if (this.step >= this.nextDriftStep) {
      // A new drift direction: random after a re-centre, otherwise within ±60° of the current
      // offset so an untended antenna keeps wandering off the station.
      const off = Math.hypot(this.offX, this.offY);
      const spread = (this.rnd() - 0.5) * (Math.PI * 2) / 3;
      const a = off > 0.01 ? Math.atan2(this.offY, this.offX) + spread : this.rnd() * Math.PI * 2;
      const v = this.config.driftLo + (this.config.driftHi - this.config.driftLo) * this.rnd();
      this.driftVX = Math.cos(a) * v;
      this.driftVY = Math.sin(a) * v;
      this.nextDriftStep = this.step + Math.round((1.4 + 1.2 * this.rnd()) * STEP_HZ);
    }
  }

  tick() {
    if (this.done) return;
    const t = (this.step + 1) * DT_S;
    passPoint(this.pass, t, this.station);
    if (this.config.oneButton) {
      this.drift();
      if (this.pressQueued) {
        this.pressQueued = false;
        this.presses++;
        this.recentre = Math.round(0.25 * STEP_HZ);
      }
      if (this.recentre > 0) {
        // Re-centring: the offset shrinks quickly (time constant 0.05 s).
        const k = Math.exp(-DT_S / 0.05);
        this.offX *= k;
        this.offY *= k;
        this.recentre--;
      } else {
        this.offX += this.driftVX * DT_S;
        this.offY += this.driftVY * DT_S;
      }
      this.rx = this.station.x + this.offX;
      this.ry = this.station.y + this.offY;
    } else {
      // The antenna slews towards the aim point at a limited rate.
      const dx = this.aimX - this.rx;
      const dy = this.aimY - this.ry;
      const d = Math.hypot(dx, dy);
      const maxStep = this.config.slewPerS * DT_S;
      if (d <= maxStep) {
        this.rx = this.aimX;
        this.ry = this.aimY;
      } else {
        this.rx += (dx / d) * maxStep;
        this.ry += (dy / d) * maxStep;
      }
    }
    this.locked = this.distance() <= this.config.lockRadius;
    if (this.locked) this.lockSteps++;
    this.lockHistory[this.step] = this.locked ? 1 : 0;
    this.step++;
  }

  score(): Mg13Score {
    return scoreRun(this.lockSteps, this.totalSteps, this.config);
  }

  result(): MinigameResult {
    const s = this.score();
    return { success: s.success, perfect: s.perfect, score: s.score };
  }
}

/**
 * Scripted good player (tests, demo, lab `auto=1`): aims where the station will be after a
 * short human reaction lead, with a small wobble. One-button: presses when the drift has used
 * 55 % of the lock circle, at most every 0.3 s.
 */
export class Mg13Autopilot {
  private readonly probe: SkyPoint = { x: 0, y: 0, elDeg: 0, azDeg: 0 };
  private lastPress = -1e9;

  constructor(private readonly wobble = 0.02) {}

  apply(sim: Mg13Sim) {
    if (sim.config.oneButton) {
      const off = Math.hypot(sim.offX, sim.offY);
      if (off > sim.config.lockRadius * 0.55 && sim.step - this.lastPress > 0.3 * STEP_HZ) {
        sim.press();
        this.lastPress = sim.step;
      }
      return;
    }
    passPoint(sim.pass, sim.timeS + 0.12, this.probe);
    const w = this.wobble;
    sim.aim(this.probe.x + w * Math.sin(sim.step / 23), this.probe.y + w * Math.cos(sim.step / 31));
  }
}

/** Plays a whole run with a per-step input function. For tests and tools. */
export function runScripted(config: Mg13Config, seed: number, runS: number, input: (sim: Mg13Sim) => void): Mg13Sim {
  const sim = new Mg13Sim(config, seed, runS);
  while (!sim.done) {
    input(sim);
    sim.tick();
  }
  return sim;
}
