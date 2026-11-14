// MG-27 Recovery Team: the simulation and the scoring. Pure: no DOM, no clocks, no Math.random.
// The same seed and the same input samples give the same run on every phone, at any frame rate.
//
// What is physical and what is a game simplification
// ---------------------------------------------------
// REAL-WORLD APPROXIMATE
//   After a splashdown a recovery team reaches the capsule in a set order: swimmers by helicopter
//   first, then the flotation collar by boat, then the recovery ship; a beacon helps to find it.
// GAME SIMPLIFICATIONS (game values)
//   • The sea is a 12 km × 12 km square, the capsule is at a seeded point and its position is NOT
//     shown: the beacon signal (0–100 %) rises as the unit closes in, with a little seeded static.
//   • Time is compressed (about 1 s of play stands for 1 min): helicopter 2.4 km/s, boat 0.9 km/s, ship
//     0.6 km/s. Units start 3 to 9 km away, so the natural order of arrival is not guaranteed.
//   • The other two units arrive at seeded scheduled times (about 6.5 s, 10.5 s and 14 s for swimmers,
//     collar and ship, ±0.7 s). They are decoration: `env.coop` only changes the display, the result
//     of every phone is decided from the seed and the parameters alone (rule of the brief).
//   • Success: this player's unit arrives after the unit before it and before the unit after it.
import type { AssistLevel, MgMap, MinigameMode } from '@protocol';
import type { MinigameResult } from '../types';
import { clamp, mulberry32, numParam, STEP_HZ } from '../MG-22/kit';
import { hash01 } from '../MG-25/model';

export { STEP_HZ };

export const UNITS = ['swimmers', 'collar', 'ship'] as const;
export const N_UNITS = UNITS.length;

/** Side of the sea, km (game_value). */
export const FIELD_KM = 12;
/** Top speed of each unit, km/s of play (game_value; time compressed). */
export const SPEED_KM_S = [2.4, 0.9, 0.6] as const;
/** The unit's velocity follows the stick with this time constant, s (game_value). */
const VEL_TAU_S = 0.3;
/** Start distance range from the capsule per unit, km (game_value). */
const START_KM: ReadonlyArray<readonly [number, number]> = [
  [7, 9],
  [4, 5],
  [3, 4],
];
/** Scheduled arrival of each unit, s of play, before the seeded jitter (game_value). */
const CREW_S = [6.5, 10.5, 14] as const;

export const DEFAULTS = {
  /** The unit has arrived when it is this close to the capsule, km (game_value). */
  arrive_km: 0.35,
  /** Standard deadline: this fraction of `durationMs` (rule: about 75 %; Relaxed has all of it). */
  deadline_fraction: 0.75,
  /** Perfect: arrival inside the middle fraction of the allowed window (game_value). */
  perfect_fraction: 0.4,
} as const;

/** After the arrival the scene holds this many steps (1.2 s). */
const HOLD_STEPS = 144;

export interface Mg27Config {
  unit: number;
  slot: number;
  slots: number;
  arriveKm: number;
  /** Exponent of the beacon falloff (smaller = easier to follow). */
  beaconPower: number;
  noiseAmp: number;
  /** Relaxed: draw a faint arrow towards the capsule. */
  arrow: boolean;
  deadlineSteps: number;
  perfectFraction: number;
  /** ONE_BUTTON: the unit steers itself once set off. */
  oneButton: boolean;
}

/**
 * Turns the host parameters, the input mode (design section 16) and the difficulty (design 10.1
 * rule 6) into the configuration of one run.
 *
 * The unit is `params.unit` (0 swimmers, 1 collar, 2 ship) or else `slot` mod 3. RELAXED ("the beacon
 * is easier to follow and there is more time to arrive"): beacon exponent 1.5 instead of 2, less static,
 * a faint arrow, and the deadline is the whole run (Standard: 75 %). ONE_BUTTON: the unit steers itself.
 * CADET: arrival radius ×1.25, static ×0.7; FLIGHT_DIRECTOR: ×0.8, static ×1.3.
 */
export function resolveConfig(params: MgMap, mode: MinigameMode, assist: AssistLevel, durationS: number): Mg27Config {
  const slot = Math.max(0, Math.floor(numParam(params, 'slot', 0, 0, 99)));
  const slots = Math.max(1, Math.floor(numParam(params, 'slots', 1, 1, 99)));
  const unitParam = params['unit'];
  const unit = typeof unitParam === 'number' && Number.isFinite(unitParam) ? clamp(Math.floor(unitParam), 0, N_UNITS - 1) : slot % N_UNITS;
  let arrive = numParam(params, 'arrive_km', DEFAULTS.arrive_km, 0.05, 3);
  let noise = 0.03;
  if (assist === 'CADET') {
    arrive *= 1.25;
    noise *= 0.7;
  } else if (assist === 'FLIGHT_DIRECTOR') {
    arrive *= 0.8;
    noise *= 1.3;
  }
  const relaxed = mode === 'RELAXED';
  if (relaxed) noise *= 0.6;
  const total = Math.round(durationS * STEP_HZ);
  const frac = relaxed ? 1 : numParam(params, 'deadline_fraction', DEFAULTS.deadline_fraction, 0.3, 1);
  return {
    unit,
    slot,
    slots,
    arriveKm: arrive,
    beaconPower: relaxed ? 1.5 : 2,
    noiseAmp: noise,
    arrow: relaxed,
    deadlineSteps: Math.max(STEP_HZ, Math.round(total * frac)),
    perfectFraction: numParam(params, 'perfect_fraction', DEFAULTS.perfect_fraction, 0.05, 1),
    oneButton: mode === 'ONE_BUTTON',
  };
}

export interface Mg27Input {
  /** Stick, a vector inside the unit disc (ignored in one-button mode). */
  vx: number;
  vy: number;
  /** ONE_BUTTON: set off (latched). */
  go: boolean;
}

export type Mg27State = 'search' | 'arrived' | 'late';

export interface Window27 {
  /** Allowed arrival window in s of play: after `fromS`, before `toS`. */
  fromS: number;
  toS: number;
}

export class Mg27Sim {
  readonly config: Mg27Config;
  readonly capX: number;
  readonly capY: number;
  readonly totalSteps: number;
  readonly dtS = 1 / STEP_HZ;
  readonly vmax: number;
  /** Scheduled arrival of every unit, s of play (the own unit's entry is unused). */
  readonly crewS: number[] = [];
  readonly staticSeed: number;
  step = 0;
  x: number;
  y: number;
  vx = 0;
  vy = 0;
  /** One-button: the unit has been set off. */
  started = false;
  state: Mg27State = 'search';
  arriveStep = -1;
  /** Beacon signal 0–1 at the unit's position, with static. */
  signal = 0;
  /** Beacon strength without static, 0–1. */
  closeness = 0;
  bestCloseness = 0;
  private endStep = -1;
  private lastResult: MinigameResult | null = null;

  constructor(config: Mg27Config, seed: number, durationS: number) {
    this.config = config;
    const rnd = mulberry32(seed);
    this.capX = 2 + rnd() * (FIELD_KM - 4);
    this.capY = 2 + rnd() * (FIELD_KM - 4);
    // Scheduled times scale with the run length (the data length is 20 s), like the gates of MG-23.
    for (let u = 0; u < N_UNITS; u++) this.crewS.push((CREW_S[u]! + (rnd() * 2 - 1) * 0.7) * (durationS / 20));
    this.staticSeed = Math.floor(rnd() * 1e9);
    this.vmax = SPEED_KM_S[config.unit]!;
    // Start at a seeded bearing and distance from the capsule, kept inside the sea.
    const [dLo, dHi] = START_KM[config.unit]!;
    const dist = dLo + rnd() * (dHi - dLo);
    let sx = 0;
    let sy = 0;
    for (let tries = 0; tries < 12; tries++) {
      const a = rnd() * Math.PI * 2;
      sx = this.capX + Math.cos(a) * dist;
      sy = this.capY + Math.sin(a) * dist;
      if (sx >= 0.5 && sx <= FIELD_KM - 0.5 && sy >= 0.5 && sy <= FIELD_KM - 0.5) break;
      sx = clamp(sx, 0.5, FIELD_KM - 0.5);
      sy = clamp(sy, 0.5, FIELD_KM - 0.5);
    }
    this.x = sx;
    this.y = sy;
    this.totalSteps = Math.max(1, Math.round(durationS * STEP_HZ));
    this.measure();
  }

  get done(): boolean {
    return this.step >= this.totalSteps || (this.endStep >= 0 && this.step >= this.endStep);
  }
  get timeS(): number {
    return this.step * this.dtS;
  }
  get deadlineS(): number {
    return this.config.deadlineSteps * this.dtS;
  }
  /** Distance to the capsule, km. */
  get distanceKm(): number {
    return Math.hypot(this.capX - this.x, this.capY - this.y);
  }
  /** Seconds of play this unit needs at full speed from here, straight to the capsule. */
  get etaS(): number {
    return Math.max(0, this.distanceKm - this.config.arriveKm) / this.vmax;
  }
  /** Allowed window of the own arrival, from the schedule of the neighbours. */
  get window(): Window27 {
    const u = this.config.unit;
    return { fromS: u > 0 ? this.crewS[u - 1]! : 0, toS: u < N_UNITS - 1 ? this.crewS[u + 1]! : this.deadlineS };
  }
  /** Scheduled arrival of a unit as shown to the player: the own unit's real arrival once it happened. */
  arrivalS(u: number): number | null {
    if (u === this.config.unit) return this.arriveStep >= 0 ? this.arriveStep * this.dtS : null;
    return this.crewS[u]! <= this.timeS ? this.crewS[u]! : null;
  }

  private measure() {
    const c = this.config;
    const d = this.distanceKm;
    this.closeness = Math.pow(clamp(1 - d / (FIELD_KM * 1.2), 0, 1), c.beaconPower);
    if (this.closeness > this.bestCloseness) this.bestCloseness = this.closeness;
    this.signal = clamp(this.closeness + (hash01(this.staticSeed + this.step) - 0.5) * 2 * c.noiseAmp, 0, 1);
  }

  /** Advances one fixed step. */
  advance(input: Mg27Input): void {
    if (this.done) return;
    const c = this.config;
    if (this.state === 'search') {
      let tx = 0;
      let ty = 0;
      if (c.oneButton) {
        if (input.go) this.started = true;
        if (this.started) {
          const dx = this.capX - this.x;
          const dy = this.capY - this.y;
          const d = Math.hypot(dx, dy) || 1;
          // Full speed, slowing down for the last 0.4 s of travel so that it does not overshoot.
          const sp = Math.min(1, Math.max(0, d - c.arriveKm * 0.5) / (this.vmax * 0.4));
          tx = (dx / d) * this.vmax * sp;
          ty = (dy / d) * this.vmax * sp;
        }
      } else {
        const m = Math.hypot(input.vx, input.vy);
        const k = m > 1 ? 1 / m : 1;
        tx = input.vx * k * this.vmax;
        ty = input.vy * k * this.vmax;
      }
      const a = 1 - Math.exp(-this.dtS / VEL_TAU_S);
      this.vx += (tx - this.vx) * a;
      this.vy += (ty - this.vy) * a;
      this.x = clamp(this.x + this.vx * this.dtS, 0, FIELD_KM);
      this.y = clamp(this.y + this.vy * this.dtS, 0, FIELD_KM);
      this.measure();
      if (this.distanceKm <= c.arriveKm) {
        this.state = 'arrived';
        this.arriveStep = this.step;
        this.endStep = this.step + HOLD_STEPS;
        this.vx = 0;
        this.vy = 0;
      } else if (this.step + 1 >= c.deadlineSteps) {
        this.state = 'late';
        this.endStep = this.step + 1 + HOLD_STEPS;
      }
    }
    this.step++;
  }

  /** Arrival time in s of play, or null. */
  get arrivalTimeS(): number | null {
    return this.arriveStep >= 0 ? this.arriveStep * this.dtS : null;
  }
  /** The unit arrived after the one before it and before the one after it (strictly), within the deadline. */
  get success(): boolean {
    const t = this.arrivalTimeS;
    if (t === null) return false;
    const w = this.window;
    return t > w.fromS && t < w.toS;
  }
  get perfect(): boolean {
    const t = this.arrivalTimeS;
    if (t === null || !this.success) return false;
    const w = this.window;
    const mid = (w.fromS + w.toS) / 2;
    return Math.abs(t - mid) <= (this.config.perfectFraction * (w.toS - w.fromS)) / 2 + 1e-9;
  }

  result(): MinigameResult {
    if (this.lastResult) return this.lastResult;
    const t = this.arrivalTimeS;
    let score: number;
    if (this.success && t !== null) {
      const w = this.window;
      score = clamp(0.6 + 0.4 * (1 - Math.abs(t - (w.fromS + w.toS) / 2) / ((w.toS - w.fromS) / 2)), 0.6, 1);
    } else if (t !== null) score = 0.3; // arrived, but in the wrong order
    else score = clamp(0.4 * this.bestCloseness, 0, 0.29);
    const r: MinigameResult = { success: this.success, perfect: this.perfect, score };
    if (this.done) this.lastResult = r;
    return r;
  }

  /** Coarse progress for the host's meter: 1 once in the right order, else how close the unit got × 0.8. */
  progress(): number {
    if (this.state === 'arrived') return this.success ? 1 : 0.5;
    return this.bestCloseness * 0.8;
  }
}

export function makeSim(params: MgMap, seed: number, mode: MinigameMode, assist: AssistLevel, durationS: number): Mg27Sim {
  return new Mg27Sim(resolveConfig(params, mode, assist, durationS), seed, durationS);
}

/**
 * Scripted good player (tests and the demo): waits until the straight run at full speed (plus the
 * lag of the stick) ends in the middle of the allowed window, then goes straight to the capsule (it
 * cheats: a real player follows the beacon). In one-button mode it presses at that time. `shiftS`
 * moves the intended arrival (later = positive).
 */
export function goodPlayer(sim: Mg27Sim, out: Mg27Input, shiftS = 0): Mg27Input {
  const w = sim.window;
  const mid = (w.fromS + w.toS) / 2 + shiftS;
  const lag = VEL_TAU_S + 0.2;
  const leave = sim.timeS + sim.etaS + lag >= mid;
  out.vx = 0;
  out.vy = 0;
  out.go = false;
  if (sim.config.oneButton) {
    out.go = leave;
    return out;
  }
  if (leave) {
    const dx = sim.capX - sim.x;
    const dy = sim.capY - sim.y;
    const d = Math.hypot(dx, dy) || 1;
    const sp = Math.min(1, Math.max(0, d - sim.config.arriveKm * 0.5) / (sim.vmax * 0.4));
    out.vx = (dx / d) * sp;
    out.vy = (dy / d) * sp;
  }
  return out;
}

/** Runs a whole game with a scripted player. For tests and tools. */
export function runScripted(sim: Mg27Sim, player: (s: Mg27Sim, out: Mg27Input) => Mg27Input): Mg27Sim {
  const buf: Mg27Input = { vx: 0, vy: 0, go: false };
  while (!sim.done) sim.advance(player(sim, buf));
  return sim;
}
