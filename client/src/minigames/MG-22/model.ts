// MG-22 Entry Corridor: the simulation and the scoring. Pure: no DOM, no clocks, no
// Math.random. The same seed and the same input samples give the same run on every phone.
//
// What is physical and what is a game simplification
// ---------------------------------------------------
// PHYSICAL
//   The flight-path angle γ is the angle of the velocity vector below the local horizontal.
//   Here it is signed: negative below the horizon (γ = −6.5° is a descent of 6.5°). Entering
//   too steeply loads the heat shield and the crew with more deceleration and heat; entering too
//   shallowly lets the capsule's lift carry it back out of the atmosphere (a "skip").
// GAME SIMPLIFICATIONS (game values; see the tags below)
//   • γ is the only state. The capsule steers it through the rate of change of γ, as a stand-in
//     for rolling the lift vector; real entry guidance works on lift direction, not on γ directly.
//   • Seeded density and lift perturbations are one steady drift (density) plus three sine waves
//     (lift), all in deg/s. They are not computed from an atmosphere model.
// REAL-WORLD APPROXIMATE
//   • The corridor edges, −7.4° (steep) and −5.25° (shallow), are the Apollo 13 entry corridor of
//     fact F17 ("between 5.25° and 7.4° below horizontal"; source: NASA NTRS 20090026451, see
//     data/facts.json). Real corridors depend on the vehicle and the entry speed.
//   • The heat bar and the skip bar are visual feedback only; they do not change the result.
//     Success is exactly the data rule: inside the corridor at least `in_corridor_fraction_min`
//     of the time (design 10.5: 85 %).
//   • `value` is the mean γ over the whole run, in degrees. The host averages it over the team
//     ("the team average sets the real flight path angle", aggregation team_average).
import type { AssistLevel, MgMap, MinigameMode } from '@protocol';
import type { MinigameResult } from '../types';
import { clamp, mulberry32, numParam, STEP_HZ } from './kit';

export { STEP_HZ };

/** Defaults of the host parameters (`mg.start.params`). */
export const DEFAULTS = {
  /** Steep edge of the corridor, degrees (negative: below the horizon). real_world_approximate: Apollo 13, fact F17. */
  corridor_steep_deg: -7.4,
  /** Shallow edge of the corridor, degrees. real_world_approximate: Apollo 13, fact F17. */
  corridor_shallow_deg: -5.25,
  /** Success: inside the corridor at least this fraction of the time (design 10.5: 85 %). */
  in_corridor_fraction_min: 0.85,
  /** Perfect: inside at least this fraction (game_value, not in the design). */
  perfect_fraction_min: 0.97,
  /** Typical size of the steady drift of γ from density, deg/s (game_value). The seed scales it by 0.7–1.3 and picks the sign; the host can force a signed value with `drift_deg_s`. */
  drift_scale_deg_s: 0.32,
} as const;

/** Steering authority at full stick, deg/s (game_value). */
const STICK_RATE_DEG_S = 1.25;
/** One-button steering, deg/s while held (steepen) or released (shallow) (game_value). */
const BUTTON_RATE_DEG_S = 0.85;
/** The lift response follows the stick with this time constant, s (game_value). */
const LIFT_LAG_S = 0.09;
/** Heat and skip bars fill in this many seconds of continuous exceedance at the edge (game_value). */
const BAR_FILL_S = 6;
const BAR_DRAIN_S = 3;

export interface Mg22Config {
  /** Corridor after mode and difficulty scaling, degrees. steepDeg < shallowDeg. */
  steepDeg: number;
  shallowDeg: number;
  inCorridorFractionMin: number;
  perfectFractionMin: number;
  /** Drift (density) magnitude, deg/s, and lift-wave amplitude, deg/s. */
  driftDegS: number;
  waveDegS: number;
  /** Optional fixed values for tests and hosts. */
  fixedDriftDegS: number | null;
  startDeg: number | null;
  stickRateDegS: number;
  buttonRateDegS: number;
  liftLagS: number;
  /** FLIGHT_DIRECTOR: the corridor edges are drawn only when γ is near them (design 9.3). */
  hideEdges: boolean;
  /** Show the aim line of the corridor centre (Relaxed, Cadet). */
  showGuide: boolean;
  oneButton: boolean;
  holdToToggle: boolean;
}

/**
 * Turns the host parameters, the input mode (design section 16) and the difficulty (design 10.1
 * rule 6) into the configuration of one run.
 *
 * Corridor width factor: Relaxed ×1.6, One-button ×1.5; Cadet ×1.25, Engineer ×1, Flight Director
 * ×0.8. Disturbance factor: Relaxed ×0.7, One-button ×0.6. All game values.
 */
export function resolveConfig(params: MgMap, mode: MinigameMode, assist: AssistLevel): Mg22Config {
  const steepIn = numParam(params, 'corridor_steep_deg', DEFAULTS.corridor_steep_deg, -20, -0.5);
  const shallowIn = numParam(params, 'corridor_shallow_deg', DEFAULTS.corridor_shallow_deg, -19, -0.2);
  const shallow = Math.max(shallowIn, steepIn + 0.2);
  const centre = (steepIn + shallow) / 2;
  let half = (shallow - steepIn) / 2;
  let wave = 0.25;
  let drift = DEFAULTS.drift_scale_deg_s;
  if (assist === 'CADET') half *= 1.25;
  else if (assist === 'FLIGHT_DIRECTOR') half *= 0.8;
  if (mode === 'RELAXED') {
    half *= 1.6;
    wave *= 0.7;
    drift *= 0.7;
  } else if (mode === 'ONE_BUTTON') {
    half *= 1.5;
    wave *= 0.6;
    drift *= 0.6;
  }
  const driftParam = params['drift_deg_s'];
  const waveParam = params['wave_deg_s'];
  const startParam = params['start_deg'];
  const success = numParam(params, 'in_corridor_fraction_min', DEFAULTS.in_corridor_fraction_min, 0.05, 1);
  const perfect = Math.max(success, numParam(params, 'perfect_fraction_min', DEFAULTS.perfect_fraction_min, 0.05, 1));
  return {
    steepDeg: centre - half,
    shallowDeg: centre + half,
    inCorridorFractionMin: success,
    perfectFractionMin: perfect,
    driftDegS: drift,
    waveDegS: typeof waveParam === 'number' && Number.isFinite(waveParam) ? Math.max(0, waveParam) : wave,
    fixedDriftDegS: typeof driftParam === 'number' && Number.isFinite(driftParam) ? driftParam : null,
    startDeg: typeof startParam === 'number' && Number.isFinite(startParam) ? startParam : null,
    stickRateDegS: STICK_RATE_DEG_S,
    buttonRateDegS: BUTTON_RATE_DEG_S,
    liftLagS: LIFT_LAG_S,
    hideEdges: assist === 'FLIGHT_DIRECTOR' && mode !== 'RELAXED',
    showGuide: mode === 'RELAXED' || assist === 'CADET',
    oneButton: mode === 'ONE_BUTTON',
    holdToToggle: params['hold_to_toggle'] === true,
  };
}

export interface Mg22Run {
  seed: number;
  durationS: number;
  /** γ at the start of play, degrees. */
  startDeg: number;
  /** Steady drift of γ (density), deg/s; signed. */
  driftDegS: number;
  /** Total disturbance of γ at play time `tS`, deg/s. */
  disturbance(tS: number): number;
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

/**
 * The seeded perturbations of one run. The seed chooses the drift direction and size (density), the
 * start angle inside the corridor, and three sine waves (lift). The first second is calm.
 */
export function createRun(config: Mg22Config, seed: number, durationS: number): Mg22Run {
  const rnd = mulberry32(seed);
  const sign = rnd() < 0.5 ? -1 : 1;
  const size = 0.7 + 0.6 * rnd();
  const drift = config.fixedDriftDegS ?? sign * size * config.driftDegS;
  const centre = (config.steepDeg + config.shallowDeg) / 2;
  const half = (config.shallowDeg - config.steepDeg) / 2;
  const start = config.startDeg ?? centre + (rnd() * 2 - 1) * 0.4 * half;
  const waves = [
    { f: 0.18 + 0.12 * rnd(), w: 0.55, p: rnd() * Math.PI * 2 },
    { f: 0.4 + 0.2 * rnd(), w: 0.3, p: rnd() * Math.PI * 2 },
    { f: 0.75 + 0.3 * rnd(), w: 0.15, p: rnd() * Math.PI * 2 },
  ];
  const disturbance = (tS: number) => {
    let s = 0;
    for (const w of waves) s += w.w * Math.sin(2 * Math.PI * w.f * tS + w.p);
    return (drift + config.waveDegS * s) * smoothstep(0, 1, tS);
  };
  return { seed: seed >>> 0, durationS, startDeg: start, driftDegS: drift, disturbance };
}

/** Where γ is: −1 too shallow (skip-out side), 0 inside the corridor, +1 too steep (heat side). */
export type Zone = -1 | 0 | 1;

/**
 * Scoring. Success: inside for at least `inCorridorFractionMin` of the steps (exactly 85 % counts).
 * Perfect: at least `perfectFractionMin`. Score: the inside fraction. `value`: mean γ, degrees.
 */
export function scoreRun(insideSteps: number, totalSteps: number, meanDeg: number, config: Pick<Mg22Config, 'inCorridorFractionMin' | 'perfectFractionMin'>): MinigameResult {
  if (totalSteps <= 0) return { success: false, perfect: false, score: 0, value: null };
  // Whole steps, with a tiny tolerance so that 0.85 × 3000 = 2550 is not lost to rounding.
  const need = (fraction: number) => Math.ceil(fraction * totalSteps - 1e-9);
  const success = insideSteps >= need(config.inCorridorFractionMin);
  const perfect = success && insideSteps >= need(config.perfectFractionMin);
  return { success, perfect, score: clamp(insideSteps / totalSteps, 0, 1), value: meanDeg };
}

/** Input of one step: stick −1…+1 (positive steepens) or the one button. */
export interface Mg22Input {
  /** Stick deflection −1…+1; positive makes the angle steeper (more negative). */
  stick: number;
  /** One-button: held (or toggled on) steepens, released shallows. */
  pressed: boolean;
}

export class Mg22Sim {
  readonly config: Mg22Config;
  readonly run: Mg22Run;
  readonly totalSteps: number;
  readonly dtS = 1 / STEP_HZ;
  step = 0;
  /** Flight-path angle, degrees (negative below the horizon). */
  gammaDeg: number;
  /** Lift response after the lag, −1…+1. */
  lift = 0;
  /** Stick that the sim received on its last step, −1…+1 (for the view). */
  stick = 0;
  zone: Zone = 0;
  insideSteps = 0;
  steepSteps = 0;
  shallowSteps = 0;
  sumDeg = 0;
  /** Heat load and skip risk bars, 0–1 (visual only). */
  heat = 0;
  skip = 0;
  /** γ after each step, degrees (for the trace). */
  readonly history: Float32Array;
  private latched = false;
  private wasPressed = false;

  constructor(config: Mg22Config, run: Mg22Run) {
    this.config = config;
    this.run = run;
    this.totalSteps = Math.max(1, Math.round(run.durationS * STEP_HZ));
    this.history = new Float32Array(this.totalSteps);
    this.gammaDeg = run.startDeg;
    this.zone = this.zoneOf(run.startDeg);
  }

  get done(): boolean {
    return this.step >= this.totalSteps;
  }
  get timeS(): number {
    return this.step * this.dtS;
  }
  get insideFraction(): number {
    return this.step === 0 ? 1 : this.insideSteps / this.step;
  }
  get meanDeg(): number {
    return this.step === 0 ? this.run.startDeg : this.sumDeg / this.step;
  }

  zoneOf(g: number): Zone {
    return g < this.config.steepDeg ? 1 : g > this.config.shallowDeg ? -1 : 0;
  }

  /** Advances one fixed step. */
  advance(input: Mg22Input): void {
    if (this.done) return;
    const c = this.config;
    let u: number;
    let rate: number;
    if (c.oneButton) {
      let down = input.pressed;
      if (c.holdToToggle) {
        if (input.pressed && !this.wasPressed) this.latched = !this.latched;
        down = this.latched;
      }
      this.wasPressed = input.pressed;
      u = down ? 1 : -1;
      rate = c.buttonRateDegS;
    } else {
      u = clamp(input.stick, -1, 1);
      rate = c.stickRateDegS;
    }
    this.stick = u;
    // Lift response: first-order lag towards the stick (game simplification).
    const k = 1 - Math.exp(-this.dtS / c.liftLagS);
    this.lift += (u - this.lift) * k;
    const t = (this.step + 1) * this.dtS;
    // Positive lift (steepen) lowers γ. Explicit Euler at 120 Hz.
    this.gammaDeg += (-rate * this.lift + this.run.disturbance(t)) * this.dtS;
    this.zone = this.zoneOf(this.gammaDeg);
    if (this.zone === 0) this.insideSteps++;
    else if (this.zone === 1) this.steepSteps++;
    else this.shallowSteps++;
    // Visual bars: fill while outside on that side, drain otherwise.
    this.heat = clamp(this.heat + this.dtS * (this.zone === 1 ? 1 / BAR_FILL_S : -1 / BAR_DRAIN_S), 0, 1);
    this.skip = clamp(this.skip + this.dtS * (this.zone === -1 ? 1 / BAR_FILL_S : -1 / BAR_DRAIN_S), 0, 1);
    this.sumDeg += this.gammaDeg;
    this.history[this.step] = this.gammaDeg;
    this.step++;
  }

  result(): MinigameResult {
    return scoreRun(this.insideSteps, this.totalSteps, this.meanDeg, this.config);
  }
  progress(): number {
    return this.insideFraction;
  }
}

export function makeSim(params: MgMap, seed: number, mode: MinigameMode, assist: AssistLevel, durationS: number): Mg22Sim {
  const config = resolveConfig(params, mode, assist);
  return new Mg22Sim(config, createRun(config, seed, durationS));
}

/**
 * Scripted good player (tests and the demo): a proportional controller on the angle error towards
 * the corridor centre, looking `LEAD` steps ahead of the lag. Players do not get it.
 * In one-button mode: hold while γ is above the centre, release below it.
 */
export function autopilot(sim: Mg22Sim, aimOffsetDeg = 0): Mg22Input {
  const c = sim.config;
  const centre = (c.steepDeg + c.shallowDeg) / 2 + aimOffsetDeg;
  if (c.oneButton) return { stick: 0, pressed: sim.gammaDeg > centre };
  const err = sim.gammaDeg - centre; // positive: too shallow, so steepen
  return { stick: clamp(err * 3.2, -1, 1), pressed: false };
}

/** A player who never touches the screen. */
export const IDLE: Mg22Input = { stick: 0, pressed: false };

/** Runs a whole game with a scripted player. For tests and tools. */
export function runScripted(sim: Mg22Sim, player: (s: Mg22Sim) => Mg22Input): Mg22Sim {
  while (!sim.done) sim.advance(player(sim));
  return sim;
}
