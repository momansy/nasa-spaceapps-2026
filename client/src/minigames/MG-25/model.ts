// MG-25 Reacquire Signal: the simulation and the scoring. Pure: no DOM, no clocks, no Math.random.
// The same seed and the same input samples give the same run on every phone, at any frame rate.
//
// What is physical and what is a game simplification
// ---------------------------------------------------
// PHYSICAL (qualitative)
//   After the plasma blackout the receiver must find the beacon again; the received signal is
//   strongest when the receiver is tuned to the beacon frequency and falls off steeply away from
//   it (fact F19: plasma around the capsule blocks radio during reentry).
// GAME SIMPLIFICATIONS (game values)
//   • The dial spans a 100 kHz window around the nominal carrier (dial 0…1 = −50…+50 kHz); the
//     beacon sits at a seeded position inside it. This is a game scale, not a real link budget.
//   • Signal strength is a Gaussian peak (σ ≈ 4.5 kHz) plus seeded static, shown in percent.
//   • LOCK inside the lock zone (±3 kHz) locks; a LOCK outside costs 1 s of lock time.
//   • The result never depends on the static, only on the dial position and the clock.
import type { AssistLevel, MgMap, MinigameMode } from '@protocol';
import type { MinigameResult } from '../types';
import { clamp, mulberry32, numParam, STEP_HZ } from '../MG-22/kit';

export { STEP_HZ };

/** Dial 0…1 spans this many kHz centred on the nominal carrier (game_value). */
export const DIAL_SPAN_KHZ = 100;
/** Dial position 0…1 to the offset in kHz shown to the player. */
export const dialToKhz = (d: number) => (d - 0.5) * DIAL_SPAN_KHZ;

export const DEFAULTS = {
  /** Success: lock within this many seconds (data: `lock_time_max_s`, design 10.5). */
  lock_time_max_s: 10,
  /** Cost of a LOCK outside the zone, s (game_value, brief). */
  miss_penalty_s: 1,
  /** Half-width of the lock zone, dial units (game_value): ±3 kHz. */
  zone_half: 0.03,
  /** Peak signal of the beacon, 0–1 (game_value). */
  beacon_strength: 0.8,
  /** σ of the signal peak, dial units (game_value): 4.5 kHz. */
  peak_sigma: 0.045,
  /** Perfect: lock with no miss within this fraction of the limit (game_value). */
  perfect_time_fraction: 0.5,
  /** One-button sweep speed, dial units per second (game_value). */
  sweep_per_s: 0.18,
} as const;

/** Fastest knob turn, dial units per second (game_value). */
export const MAX_TURN_PER_S = 0.8;
/** After a missed LOCK the button is dead for this many steps (0.5 s, game_value), so mashing does not work. */
const COOLDOWN_STEPS = 60;
/** After the lock (or the loss of the signal) the scene holds this many steps so the player sees it (1.2 s). */
const HOLD_STEPS = 144;

export interface Mg25Config {
  lockTimeMaxS: number;
  missPenaltyS: number;
  zoneHalf: number;
  beaconStrength: number;
  peakSigma: number;
  noiseAmp: number;
  perfectTimeFraction: number;
  /** One-button: the dial sweeps by itself at this speed (dial units per s); 0 = the player turns it. */
  sweepPerS: number;
  /** The whole playfield is the LOCK button. */
  wholeField: boolean;
  /** Always draw the lock zone on the dial (Relaxed, Cadet); otherwise only when the dial is near it. */
  zoneAlways: boolean;
  /** FLIGHT_DIRECTOR: show the zone only when very close (design 9.3). */
  zoneNearOnly: boolean;
}

/**
 * Turns the host parameters, the input mode (design section 16) and the difficulty (design 10.1
 * rule 6) into the configuration of one run.
 *
 * RELAXED ("the beacon is stronger and the lock zone is wider"): strength 1.0, zone ×1.6, peak ×1.4,
 * static ×0.6. ONE_BUTTON ("the dial sweeps by itself"): sweep 0.18 per s, zone ×1.5 (the timing of a
 * press replaces the steering of the dial). CADET zone ×1.25 and static ×0.7; FLIGHT_DIRECTOR zone
 * ×0.8 and static ×1.3. All game values.
 */
export function resolveConfig(params: MgMap, mode: MinigameMode, assist: AssistLevel): Mg25Config {
  let zone = numParam(params, 'zone_half', DEFAULTS.zone_half, 0.005, 0.3);
  let strength = numParam(params, 'beacon_strength', DEFAULTS.beacon_strength, 0.2, 1);
  let sigma = numParam(params, 'peak_sigma', DEFAULTS.peak_sigma, 0.01, 0.3);
  let noise = 0.06;
  if (assist === 'CADET') {
    zone *= 1.25;
    noise *= 0.7;
  } else if (assist === 'FLIGHT_DIRECTOR') {
    zone *= 0.8;
    noise *= 1.3;
  }
  if (mode === 'RELAXED') {
    zone *= 1.6;
    strength = 1;
    sigma *= 1.4;
    noise *= 0.6;
  } else if (mode === 'ONE_BUTTON') {
    zone *= 1.5;
  }
  return {
    lockTimeMaxS: numParam(params, 'lock_time_max_s', DEFAULTS.lock_time_max_s, 1, 60),
    missPenaltyS: numParam(params, 'miss_penalty_s', DEFAULTS.miss_penalty_s, 0, 5),
    zoneHalf: zone,
    beaconStrength: strength,
    peakSigma: sigma,
    noiseAmp: noise,
    perfectTimeFraction: numParam(params, 'perfect_time_fraction', DEFAULTS.perfect_time_fraction, 0.05, 1),
    sweepPerS: mode === 'ONE_BUTTON' ? numParam(params, 'sweep_per_s', DEFAULTS.sweep_per_s, 0.05, 1) : 0,
    wholeField: mode === 'ONE_BUTTON',
    zoneAlways: mode === 'RELAXED' || assist === 'CADET',
    zoneNearOnly: assist === 'FLIGHT_DIRECTOR',
  };
}

/** Deterministic static in 0…1 for one step (an integer hash; no state, no allocation). */
export function hash01(n: number): number {
  let h = (n ^ 61) ^ (n >>> 16);
  h = Math.imul(h, 9);
  h ^= h >>> 4;
  h = Math.imul(h, 0x27d4eb2d);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

export interface Mg25Input {
  /** Dial change for this step, in dial units (circular drag or keys); ignored in one-button mode. */
  turn: number;
  /** LOCK was pressed on or before this step. */
  lock: boolean;
}

export type Mg25State = 'search' | 'locked' | 'lost';

export class Mg25Sim {
  readonly config: Mg25Config;
  readonly beaconF: number;
  readonly staticSeed: number;
  readonly totalSteps: number;
  readonly dtS = 1 / STEP_HZ;
  readonly maxSteps: number;
  readonly penaltySteps: number;
  step = 0;
  dial = 0.5;
  /** Signal strength 0–1 at the current dial position, with static. */
  signal = 0;
  /** Peak-ness 0–1 (Gaussian only, no static) at the current dial position. */
  closeness = 0;
  bestCloseness = 0;
  misses = 0;
  /** Step of the latest missed LOCK, or −1 (for the "+1 s" flash). */
  lastMissStep = -1;
  state: Mg25State = 'search';
  /** Step of the successful LOCK, or −1. */
  lockStep = -1;
  /** Lock time, steps, including penalties, or −1. */
  lockCostSteps = -1;
  private cooldownEnd = 0;
  private endStep = -1;
  private lastResult: MinigameResult | null = null;

  constructor(config: Mg25Config, seed: number, durationS: number) {
    this.config = config;
    const rnd = mulberry32(seed);
    this.beaconF = 0.15 + rnd() * 0.7;
    this.staticSeed = Math.floor(rnd() * 1e9);
    // The dial starts at a seeded point away from the beacon.
    const side = rnd() < 0.5 ? -1 : 1;
    this.dial = config.sweepPerS > 0 ? 0 : clamp(this.beaconF + side * (0.25 + rnd() * 0.2), 0.03, 0.97);
    this.totalSteps = Math.max(1, Math.round(durationS * STEP_HZ));
    this.maxSteps = Math.round(config.lockTimeMaxS * STEP_HZ);
    this.penaltySteps = Math.round(config.missPenaltyS * STEP_HZ);
    this.measure();
  }

  get done(): boolean {
    return this.step >= this.totalSteps || (this.endStep >= 0 && this.step >= this.endStep);
  }
  get timeS(): number {
    return this.step * this.dtS;
  }
  /** Lock time used so far, s: the clock plus the cost of the missed LOCKs. */
  get usedS(): number {
    return (this.step + this.misses * this.penaltySteps) * this.dtS;
  }
  get leftS(): number {
    return Math.max(0, this.config.lockTimeMaxS - this.usedS);
  }
  /** Distance of the dial from the beacon, dial units. */
  get offset(): number {
    return this.dial - this.beaconF;
  }
  get inZone(): boolean {
    return Math.abs(this.offset) <= this.config.zoneHalf + 1e-9;
  }
  /** Should the lock zone be drawn on the dial now (design 9.3: Flight Director only near it)? */
  get zoneVisible(): boolean {
    const c = this.config;
    if (c.zoneAlways) return true;
    return Math.abs(this.offset) <= c.zoneHalf * (c.zoneNearOnly ? 3 : 5);
  }

  private measure() {
    const c = this.config;
    const z = this.offset / c.peakSigma;
    this.closeness = Math.exp(-0.5 * z * z);
    if (this.closeness > this.bestCloseness) this.bestCloseness = this.closeness;
    this.signal = clamp(c.beaconStrength * this.closeness + hash01(this.staticSeed + this.step) * c.noiseAmp, 0, 1);
  }

  /** Advances one fixed step. */
  advance(input: Mg25Input): void {
    if (this.done) return;
    const c = this.config;
    if (c.sweepPerS > 0) this.dial = (c.sweepPerS * this.step * this.dtS) % 1;
    else if (this.state === 'search') {
      const lim = MAX_TURN_PER_S * this.dtS;
      this.dial = clamp(this.dial + clamp(input.turn, -lim, lim), 0, 1);
    }
    this.measure();
    if (input.lock && this.state === 'search' && this.step >= this.cooldownEnd) {
      if (this.inZone) {
        this.state = 'locked';
        this.lockStep = this.step;
        this.lockCostSteps = this.step + this.misses * this.penaltySteps;
        this.endStep = this.step + HOLD_STEPS;
      } else {
        this.misses++;
        this.lastMissStep = this.step;
        this.cooldownEnd = this.step + COOLDOWN_STEPS;
      }
    }
    this.step++;
    if (this.state === 'search' && this.step + this.misses * this.penaltySteps > this.maxSteps) {
      this.state = 'lost';
      this.endStep = this.step + HOLD_STEPS;
    }
  }

  /** Success: locked inside the zone with lock time (clock + penalties) ≤ `lock_time_max_s`. */
  get success(): boolean {
    return this.state === 'locked' && this.lockCostSteps <= this.maxSteps;
  }
  get perfect(): boolean {
    return this.success && this.misses === 0 && this.lockCostSteps <= this.config.perfectTimeFraction * this.maxSteps + 1e-9;
  }

  result(): MinigameResult {
    if (this.lastResult) return this.lastResult;
    let score: number;
    if (this.success) score = clamp(0.6 + 0.4 * (1 - this.lockCostSteps / this.maxSteps), 0.6, 1);
    else score = clamp(0.45 * this.bestCloseness, 0, 0.49);
    const r: MinigameResult = { success: this.success, perfect: this.perfect, score };
    if (this.done) this.lastResult = r;
    return r;
  }

  /** Coarse progress for the host's meter: locked 1; else the best signal found so far × 0.8. */
  progress(): number {
    return this.state === 'locked' ? 1 : this.bestCloseness * 0.8;
  }
}

export function makeSim(params: MgMap, seed: number, mode: MinigameMode, assist: AssistLevel, durationS: number): Mg25Sim {
  return new Mg25Sim(resolveConfig(params, mode, assist), seed, durationS);
}

/**
 * Scripted good player (tests and the demo): turns the dial towards the beacon (a cheat a real
 * player does not have: they follow the waveform), then LOCKs about 0.4 s after arriving, or in
 * one-button mode when the sweep is at the beacon. `lockOffset` shifts the aim (dial units).
 */
export function goodPlayer(sim: Mg25Sim, lockOffset = 0): Mg25Input {
  const c = sim.config;
  const aim = sim.beaconF + lockOffset;
  if (c.sweepPerS > 0) {
    // The dial that `advance` will use for this step; press when it is inside a third of the zone.
    const d = ((c.sweepPerS * sim.step) / STEP_HZ) % 1;
    return { turn: 0, lock: Math.abs(d - aim) <= c.zoneHalf * 0.35 };
  }
  const err = aim - sim.dial;
  const turn = clamp(err * 3, -0.5, 0.5) * (1 / STEP_HZ);
  // Settled when within a third of the zone; wait 0.4 s of reaction first.
  return { turn, lock: sim.step >= 48 && Math.abs(err) <= c.zoneHalf * 0.35 };
}

/** Runs a whole game with a scripted player. For tests and tools. */
export function runScripted(sim: Mg25Sim, player: (s: Mg25Sim) => Mg25Input): Mg25Sim {
  while (!sim.done) sim.advance(player(sim));
  return sim;
}
