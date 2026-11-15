// MG-24 Hoverslam: the simulation and the scoring. Pure: no DOM, no clocks, no Math.random. The
// same seed and the same input samples give the same run on every phone, at any frame rate.
//
// What is physical and what is a game simplification
// ---------------------------------------------------
// PHYSICAL (exact in this model)
//   • Free fall under g0 = 9.80665 m/s²: h(τ) = H0 − v0·τ − g0·τ²/2, v(τ) = v0 + g0·τ (v is the
//     downward speed). No drag.
//   • One ignition gives a constant net deceleration a = T/m − g0 (T/m = thrust per mass, always
//     greater than g0: the engine's minimum throttle is too high to hover, the point of the fact).
//     From ignition altitude h and speed v:
//       late  (v² > 2·a·h): touchdown speed = √(v² − 2·a·h)
//       ideal (v² = 2·a·h): touchdown speed = 0, i.e. h* = v²/(2a); with the fall that is
//                           h* = (v0² + 2·g0·H0) / (2·T/m)
//       early (v² < 2·a·h): the burn stops the booster at h_stop = h − v²/(2a) above the ground and
//                           the engine cuts; it falls again: touchdown speed = √(2·g0·h_stop).
// GAME SIMPLIFICATIONS (game values)
//   • T/m = 2.5·g0 (a = 1.5·g0 = 14.7 m/s²), start 450…650 m at 15…30 m/s, seeded.
//   • "Bullet time": a tap cannot hit a window 0.2 m tall (a touchdown speed under 2 m/s needs an
//     ignition within about ±0.1 m of h*, which at 90 m/s is a window of 2 ms). Before the ignition,
//     the game clock slows down near h*: dτ/dt = clamp(|h − h*| / 20 m, slow, 1), `slow` = 1/60 in
//     Standard (1/150 in Relaxed, ×0.8 in Cadet…): the window becomes about 0.14 s of real time.
//     The physics stays exact in game time; only the speed of the clock is a game value.
//   • No wind, no gimbal, no fuel: a single burn and then a single landing.
import type { AssistLevel, MgMap, MinigameMode } from '@protocol';
import type { MinigameResult } from '../types';
import { clamp, mulberry32, numParam, STEP_HZ } from '../MG-22/kit';

export { STEP_HZ };

/** Standard gravity, m/s² (physical). */
export const G0 = 9.80665;

export const DEFAULTS = {
  /** Success: touchdown speed strictly below this, m/s (data: `touchdown_speed_below_m_s`). */
  touchdown_speed_below_m_s: 2,
  /** Perfect, "Hoverslam Hero": strictly below this, m/s (brief). */
  perfect_below_m_s: 1,
  /** Thrust per weight at the engine's lowest throttle, T/(m·g0); > 1: it cannot hover (game_value). */
  thrust_to_weight: 2.5,
  /** Seeded start altitude range, m, and downward speed range, m/s (game_value). */
  altitude_m: [450, 650],
  speed_m_s: [15, 30],
  /** Bullet time: distance from h* where the clock starts to slow, m (game_value). */
  slow_zone_m: 20,
  /** Lowest clock rate, 1/60 (game_value). */
  slow_factor: 1 / 60,
  /** How long the ghost of h* stays in Standard, s (Flight Director half of it) (game_value). */
  ghost_fade_s: 3,
} as const;

/** After touchdown the scene holds this many steps (1.2 s) so the player sees the result. */
const HOLD_STEPS = 144;

export interface Mg24Config {
  touchdownBelow: number;
  perfectBelow: number;
  /** T/m / g0. */
  twr: number;
  /** Net deceleration of the burn, m/s². */
  decel: number;
  startAltitudeM: number | null;
  startSpeedMS: number | null;
  slowZoneM: number;
  slowFactor: number;
  /** The ghost never fades (Relaxed, Cadet). */
  ghostStays: boolean;
  ghostFadeS: number;
  /** The whole playfield is the IGNITE button. */
  wholeField: boolean;
}

/**
 * Turns the host parameters, the input mode (design section 16) and the difficulty (design 10.1
 * rule 6) into the configuration of one run.
 *
 * RELAXED ("the ghost stays visible and the ignition window is wider"): the ghost never fades and the
 * bullet-time clock is 2.5× slower (window ×2.5). ONE_BUTTON is already one button: unchanged.
 * CADET: ghost stays, window ×1.25; FLIGHT_DIRECTOR: window ×0.8, ghost fades in half the time.
 */
export function resolveConfig(params: MgMap, mode: MinigameMode, assist: AssistLevel): Mg24Config {
  const twr = numParam(params, 'thrust_to_weight', DEFAULTS.thrust_to_weight, 1.05, 6);
  let slow = numParam(params, 'slow_factor', DEFAULTS.slow_factor, 0.001, 1);
  let fade = numParam(params, 'ghost_fade_s', DEFAULTS.ghost_fade_s, 0.5, 30);
  let stays = false;
  if (assist === 'CADET') {
    slow /= 1.25;
    stays = true;
  } else if (assist === 'FLIGHT_DIRECTOR') {
    slow /= 0.8;
    fade *= 0.5;
  }
  if (mode === 'RELAXED') {
    slow /= 2.5;
    stays = true;
  }
  const alt = params['start_altitude_m'];
  const spd = params['start_speed_m_s'];
  return {
    touchdownBelow: numParam(params, 'touchdown_speed_below_m_s', DEFAULTS.touchdown_speed_below_m_s, 0.1, 50),
    perfectBelow: Math.min(numParam(params, 'perfect_below_m_s', DEFAULTS.perfect_below_m_s, 0.05, 50), numParam(params, 'touchdown_speed_below_m_s', DEFAULTS.touchdown_speed_below_m_s, 0.1, 50)),
    twr,
    decel: (twr - 1) * G0,
    startAltitudeM: typeof alt === 'number' && Number.isFinite(alt) ? clamp(alt, 50, 5000) : null,
    startSpeedMS: typeof spd === 'number' && Number.isFinite(spd) ? clamp(spd, 0, 300) : null,
    slowZoneM: numParam(params, 'slow_zone_m', DEFAULTS.slow_zone_m, 1, 200),
    slowFactor: Math.min(1, slow),
    ghostStays: stays,
    ghostFadeS: fade,
    wholeField: mode === 'ONE_BUTTON',
  };
}

export interface Landing {
  /** The burn stops the booster above the ground and it falls again. */
  early: boolean;
  /** Height where the burn ends (early only), m; 0 otherwise. */
  hStopM: number;
  /** Time from ignition to the end of the burn (early), s. */
  tStopS: number;
  /** Time from ignition to touchdown, s. */
  tTouchS: number;
  /** Touchdown speed, m/s. */
  vTouchMS: number;
}

/**
 * Exact result of one ignition at altitude `h` (m) and downward speed `v` (m/s) with net
 * deceleration `a` (m/s²): late √(v² − 2ah); early: stop at h − v²/(2a), then fall √(2·g0·h_stop).
 */
export function landing(h: number, v: number, a: number): Landing {
  const disc = v * v - 2 * a * h;
  if (disc > 0) {
    const vt = Math.sqrt(disc);
    return { early: false, hStopM: 0, tStopS: v / a, tTouchS: (v - vt) / a, vTouchMS: vt };
  }
  const hStop = h - (v * v) / (2 * a);
  const tf = Math.sqrt((2 * Math.max(0, hStop)) / G0);
  return { early: true, hStopM: Math.max(0, hStop), tStopS: v / a, tTouchS: v / a + tf, vTouchMS: G0 * tf };
}

export type Phase = 'fall' | 'burn' | 'cutoff' | 'down';

export interface Mg24Input {
  /** IGNITE was pressed on or before this step. */
  ignite: boolean;
}

export class Mg24Sim {
  readonly config: Mg24Config;
  readonly h0M: number;
  readonly v0MS: number;
  /** Ideal ignition altitude h* = (v0² + 2·g0·H0) / (2·T/m), m. */
  readonly hStarM: number;
  /** Speed at which the booster would hit the ground without igniting, m/s. */
  readonly crashMS: number;
  readonly totalSteps: number;
  readonly dtS = 1 / STEP_HZ;
  step = 0;
  /** Game time of the free fall, s (runs slower than play time near h*). */
  tauS = 0;
  phase: Phase = 'fall';
  altitudeM: number;
  /** Downward speed, m/s. */
  speedMS: number;
  /** Clock rate now: 1 normally, down to `slowFactor` near h*. */
  clockRate = 1;
  igniteStep = -1;
  hIgniteM = 0;
  vIgniteMS = 0;
  outcome: Landing | null = null;
  /** Steps at which the hold after touchdown ends, or −1. */
  private endStep = -1;
  private lastResult: MinigameResult | null = null;

  constructor(config: Mg24Config, seed: number, durationS: number) {
    this.config = config;
    const rnd = mulberry32(seed);
    const [aLo, aHi] = DEFAULTS.altitude_m;
    const [vLo, vHi] = DEFAULTS.speed_m_s;
    const ha = aLo + rnd() * (aHi - aLo);
    const va = vLo + rnd() * (vHi - vLo);
    this.h0M = config.startAltitudeM ?? ha;
    this.v0MS = config.startSpeedMS ?? va;
    const c = this.v0MS * this.v0MS + 2 * G0 * this.h0M;
    this.hStarM = c / (2 * config.twr * G0);
    this.crashMS = Math.sqrt(c);
    this.totalSteps = Math.max(1, Math.round(durationS * STEP_HZ));
    this.altitudeM = this.h0M;
    this.speedMS = this.v0MS;
  }

  get done(): boolean {
    return this.step >= this.totalSteps || (this.endStep >= 0 && this.step >= this.endStep);
  }
  get timeS(): number {
    return this.step * this.dtS;
  }
  get touchedDown(): boolean {
    return this.phase === 'down';
  }
  /** Touchdown speed, m/s: reached, or exact projection of the ignition made (or of the crash). */
  get touchdownMS(): number {
    return this.outcome ? this.outcome.vTouchMS : this.crashMS;
  }
  get success(): boolean {
    return this.touchdownMS < this.config.touchdownBelow;
  }
  get perfect(): boolean {
    return this.success && this.touchdownMS < this.config.perfectBelow;
  }
  /** Free-fall altitude and speed at game time τ. */
  private fallH(tau: number): number {
    return this.h0M - this.v0MS * tau - 0.5 * G0 * tau * tau;
  }
  /** Opacity 0–1 of the ghost of h*. */
  get ghostAlpha(): number {
    const c = this.config;
    if (c.ghostStays) return 1;
    const t = this.timeS;
    return t <= 1 ? 1 : clamp(1 - (t - 1) / c.ghostFadeS, 0, 1);
  }
  /** The clock rate for a given altitude before the ignition (bullet time, game_value). */
  rateAt(h: number): number {
    const c = this.config;
    return clamp(Math.abs(h - this.hStarM) / c.slowZoneM, c.slowFactor, 1);
  }

  /** Advances one fixed step. A press at the step ignites from the state of that step (once). */
  advance(input: Mg24Input): void {
    if (this.done) return;
    if (this.phase === 'fall') {
      if (input.ignite) {
        this.igniteStep = this.step;
        this.hIgniteM = this.altitudeM;
        this.vIgniteMS = this.speedMS;
        this.outcome = landing(this.hIgniteM, this.vIgniteMS, this.config.decel);
        this.phase = 'burn';
        this.clockRate = 1;
      } else {
        const rate = this.rateAt(this.altitudeM);
        this.clockRate = rate;
        this.tauS += this.dtS * rate;
        const h = this.fallH(this.tauS);
        if (h <= 0) {
          this.altitudeM = 0;
          this.speedMS = this.crashMS;
          this.phase = 'down';
          this.endStep = this.step + 1 + HOLD_STEPS;
        } else {
          this.altitudeM = h;
          this.speedMS = this.v0MS + G0 * this.tauS;
        }
      }
    }
    if (this.phase === 'burn' || this.phase === 'cutoff') {
      const o = this.outcome!;
      const tb = (this.step - this.igniteStep) * this.dtS;
      if (tb >= o.tTouchS) {
        this.altitudeM = 0;
        this.speedMS = o.vTouchMS;
        this.phase = 'down';
        this.endStep = this.step + 1 + HOLD_STEPS;
      } else if (tb < o.tStopS || !o.early) {
        const a = this.config.decel;
        this.altitudeM = this.hIgniteM - this.vIgniteMS * tb + 0.5 * a * tb * tb;
        this.speedMS = this.vIgniteMS - a * tb;
        this.phase = 'burn';
      } else {
        const tf = tb - o.tStopS;
        this.altitudeM = o.hStopM - 0.5 * G0 * tf * tf;
        this.speedMS = G0 * tf;
        this.phase = 'cutoff';
      }
    }
    this.step++;
  }

  result(): MinigameResult {
    if (this.lastResult) return this.lastResult;
    const v = this.touchdownMS;
    const c = this.config;
    let score: number;
    if (v < c.touchdownBelow) score = clamp(0.6 + 0.4 * (1 - v / c.touchdownBelow), 0.6, 1);
    else score = clamp(0.49 * (1 - (v - c.touchdownBelow) / Math.max(1e-9, this.crashMS - c.touchdownBelow)), 0, 0.49);
    const r: MinigameResult = { success: this.success, perfect: this.perfect, score, value: v };
    if (this.done) this.lastResult = r;
    return r;
  }

  /** Coarse progress for the host's meter: 1 on a soft landing, else how far the fall is (× 0.5). */
  progress(): number {
    if (this.phase === 'down') return this.success ? 1 : 0.5;
    return clamp(1 - this.altitudeM / this.h0M, 0, 1) * 0.5;
  }
}

export function makeSim(params: MgMap, seed: number, mode: MinigameMode, assist: AssistLevel, durationS: number): Mg24Sim {
  return new Mg24Sim(resolveConfig(params, mode, assist), seed, durationS);
}

/**
 * Scripted good player (tests and the demo): taps on the first step whose altitude is at or below
 * h* + `offsetM` (positive = early). Players do not get it.
 */
export function goodPlayer(sim: Mg24Sim, offsetM = 0): Mg24Input {
  return { ignite: sim.phase === 'fall' && sim.altitudeM <= sim.hStarM + offsetM };
}

/** Runs a whole game with a scripted player. For tests and tools. */
export function runScripted(sim: Mg24Sim, player: (s: Mg24Sim) => Mg24Input): Mg24Sim {
  while (!sim.done) sim.advance(player(sim));
  return sim;
}
