// MG-23 Parachute Sequence: the simulation and the scoring. Pure: no DOM, no clocks, no
// Math.random. The same seed and the same input samples give the same run on every phone.
//
// What is physical and what is a game simplification
// ---------------------------------------------------
// PHYSICAL
//   Each parachute stage multiplies the drag area, so the speed relaxes towards a lower terminal
//   speed after the stage opens: v(s) = v_k + (v_prev − v_k)·e^(−(s − s_k)/τ_k).
//   Altitude falls by the integral of the speed.
// REAL-WORLD APPROXIMATE
//   Orion's sequence has 11 canopies in four stages: 3 forward-bay-cover parachutes, 2 drogues,
//   3 pilots, 3 mains (fact F18: 11 parachutes in a precise sequence). The final speed of about
//   30 km/h (8.3 m/s) is the figure of fact F18.
// GAME SIMPLIFICATIONS (game values)
//   • The descent is scripted and the same for every player of the run (a pure function of the
//     seed), so each phone judges its own gate from the seed alone. The player's own deployment
//     does not change the descent; early, late and missing deployments only decide the result.
//   • Time is compressed: 1 s of play stands for about `timeScale` s of real descent; altitudes
//     and speeds are shown in their real units but the profile (start 9,000 m and 240 m/s, stage
//     speeds, gate positions and widths) is a game value, not an Orion flight profile.
//   • The gate of a stage is a window in play time (equivalently in altitude and speed, because
//     both fall monotonically): ±`gate_half_s` around a seeded centre.
//   • Teammates are decoration: a seeded crew deploys the other three stages (or the real
//     deploys come from `env.coop`); they never change this player's result.
import type { AssistLevel, MgMap, MinigameMode } from '@protocol';
import type { MinigameResult } from '../types';
import { clamp, mulberry32, numParam, STEP_HZ } from '../MG-22/kit';

export { STEP_HZ };

/** Stage names in firing order; the keys of `minigame.MG-23.stage.<key>`. */
export const STAGES = ['cover', 'drogue', 'pilot', 'main'] as const;
export type StageKey = (typeof STAGES)[number];
/** Canopies per stage; 3 + 2 + 3 + 3 = 11 (real_world_approximate, F18). */
export const CANOPIES = [3, 2, 3, 3] as const;

export const DEFAULTS = {
  /** Half-width of a gate in play time, s (game_value): the gate is 1.8 s wide. */
  gate_half_s: 0.9,
  /** Perfect: inside the middle fraction of the gate (design brief: middle 40 %). game_value */
  perfect_fraction: 0.4,
  /** Start of the shown descent: altitude, m (game_value). */
  start_altitude_m: 9000,
  /** Speed at the start, m/s (game_value; 864 km/h). */
  start_speed_m_s: 240,
} as const;

/** Speed after each stage opens, m/s: covers, drogues, pilots, mains (final 8.3 m/s = 30 km/h, F18). */
const STAGE_SPEED_M_S = [200, 112, 92, 8.3] as const;
/** Time constant of each stage's slow-down, s of play (game_value). */
const STAGE_TAU_S = [1.3, 1.3, 1.1, 1.5] as const;
/** Nominal gate centres, s of play, before the seeded shift (game_value). */
const GATE_BASE_S = [3.2, 7.0, 10.6, 14.6] as const;

export interface Mg23Config {
  /** This player's stage 0–3 and the backup rank (0 = owner, 1 = first backup…). */
  stage: number;
  backup: number;
  slots: number;
  gateHalfS: number;
  perfectFraction: number;
  startAltitudeM: number;
  startSpeedMS: number;
  /** One press anywhere (ONE_BUTTON); otherwise the DEPLOY button. */
  wholeField: boolean;
  /** Keep the gate drawn from the start with its window (Relaxed, Cadet). */
  showGuide: boolean;
}

/**
 * Turns the host parameters, the input mode (design section 16) and the difficulty (design 10.1
 * rule 6) into the configuration of one run.
 *
 * Gate width: Relaxed ×1.6 ("the gate stays lit longer"), One-button ×1.4; Cadet ×1.25, Engineer
 * ×1, Flight Director ×0.8. All game values. Stage: `params.stage`, else `slot` mod 4.
 */
export function resolveConfig(params: MgMap, mode: MinigameMode, assist: AssistLevel): Mg23Config {
  const slot = Math.max(0, Math.floor(numParam(params, 'slot', 0, 0, 99)));
  const slots = Math.max(1, Math.floor(numParam(params, 'slots', 1, 1, 99)));
  const stageParam = params['stage'];
  const stage = typeof stageParam === 'number' && Number.isFinite(stageParam) ? clamp(Math.floor(stageParam), 0, 3) : slot % 4;
  let half = numParam(params, 'gate_half_s', DEFAULTS.gate_half_s, 0.2, 3);
  if (assist === 'CADET') half *= 1.25;
  else if (assist === 'FLIGHT_DIRECTOR') half *= 0.8;
  if (mode === 'RELAXED') half *= 1.6;
  else if (mode === 'ONE_BUTTON') half *= 1.4;
  return {
    stage,
    backup: Math.floor(slot / 4),
    slots,
    gateHalfS: half,
    perfectFraction: numParam(params, 'perfect_fraction', DEFAULTS.perfect_fraction, 0.05, 1),
    startAltitudeM: numParam(params, 'start_altitude_m', DEFAULTS.start_altitude_m, 2000, 20000),
    startSpeedMS: numParam(params, 'start_speed_m_s', DEFAULTS.start_speed_m_s, 100, 400),
    wholeField: mode === 'ONE_BUTTON',
    showGuide: mode === 'RELAXED' || assist === 'CADET',
  };
}

export interface Mg23Descent {
  seed: number;
  durationS: number;
  /** Gate centres, s of play, per stage. */
  centreS: number[];
  /** Nominal speed (m/s) and altitude (m) at every step. */
  speed: Float32Array;
  altitude: Float32Array;
  /** Real seconds of descent per second of play. */
  timeScale: number;
  /** Seeded crew deploy times of the four stages, s of play (the own stage is overwritten by the player). */
  crewS: number[];
}

/** The scripted descent of one run: a pure function of the seed, the duration and the start values. */
export function createDescent(config: Mg23Config, seed: number, durationS: number): Mg23Descent {
  const rnd = mulberry32(seed);
  const shift = (rnd() * 2 - 1) * 0.5;
  const centreS = GATE_BASE_S.map((b, k) => (b + shift + (rnd() * 2 - 1) * 0.35) * (durationS / 20));
  const total = Math.max(1, Math.round(durationS * STEP_HZ));
  const speed = new Float32Array(total + 1);
  const altitude = new Float32Array(total + 1);
  const dt = 1 / STEP_HZ;
  // Speed profile: starts at v0 and relaxes stage by stage from each gate centre.
  let v = config.startSpeedMS;
  let integral = 0;
  for (let i = 0; i <= total; i++) {
    const s = i * dt;
    let k = -1;
    for (let j = 0; j < 4; j++) if (s >= centreS[j]!) k = j;
    if (k >= 0) {
      const tau = STAGE_TAU_S[k]!;
      v += (STAGE_SPEED_M_S[k]! - v) * (1 - Math.exp(-dt / tau));
    }
    speed[i] = v;
    altitude[i] = integral; // distance fallen so far, in speed-seconds for now
    integral += v * dt;
  }
  // Scale so that the capsule is 25 m above the water at the end of play.
  const fall = config.startAltitudeM - 25;
  const timeScale = fall / Math.max(1e-6, altitude[total]!);
  for (let i = 0; i <= total; i++) altitude[i] = config.startAltitudeM - altitude[i]! * timeScale;
  const crewS = centreS.map((c) => c + (rnd() * 2 - 1) * 0.35 * config.gateHalfS);
  return { seed: seed >>> 0, durationS, centreS, speed, altitude, timeScale, crewS };
}

/** How a deployment went. */
export type Outcome = 'none' | 'torn' | 'in_gate' | 'late';

export interface Mg23Judgement {
  outcome: Outcome;
  /** Signed distance of the deploy from the gate centre, s (negative: early). */
  offsetS: number;
  perfect: boolean;
  score: number;
}

/**
 * Judges one deployment at play time `deployS` against the gate [c − half, c + half]. Success is
 * inside the gate, boundaries included; perfect is inside the middle `perfectFraction` of the
 * gate (|offset| ≤ perfectFraction × half). Score 0–1: inside the gate 0.6…1 by how central, outside
 * below 0.5 by how far, none 0.
 */
export function judge(deployS: number | null, centreS: number, config: Pick<Mg23Config, 'gateHalfS' | 'perfectFraction'>): Mg23Judgement {
  if (deployS === null) return { outcome: 'none', offsetS: 0, perfect: false, score: 0 };
  const half = config.gateHalfS;
  const off = deployS - centreS;
  const eps = 1e-9;
  if (Math.abs(off) <= half + eps) {
    const perfect = Math.abs(off) <= config.perfectFraction * half + eps;
    return { outcome: 'in_gate', offsetS: off, perfect, score: clamp(0.6 + 0.4 * (1 - Math.abs(off) / half), 0.6, 1) };
  }
  const beyond = Math.abs(off) - half;
  return { outcome: off < 0 ? 'torn' : 'late', offsetS: off, perfect: false, score: clamp(0.5 * (1 - beyond / (2 * half)), 0, 0.49) };
}

export interface Mg23Input {
  /** The player pressed DEPLOY on or before this step. */
  deploy: boolean;
}

/** Display state of one stage: waiting, gate open, opened in gate, torn (early), late, or no deploy yet after the gate. */
export type StageState = 'wait' | 'gate' | 'ok' | 'torn' | 'late' | 'missed';

export class Mg23Sim {
  readonly config: Mg23Config;
  readonly descent: Mg23Descent;
  readonly totalSteps: number;
  readonly dtS = 1 / STEP_HZ;
  step = 0;
  /** Own deploy time, s of play, or null. */
  deployS: number | null = null;
  /** Teammates' deploy times from `env.coop` (stage → s of play); override the seeded crew. */
  readonly coopS: Array<number | null> = [null, null, null, null];
  private lastResult: MinigameResult | null = null;

  constructor(config: Mg23Config, descent: Mg23Descent) {
    this.config = config;
    this.descent = descent;
    this.totalSteps = Math.max(1, Math.round(descent.durationS * STEP_HZ));
  }

  get done(): boolean {
    return this.step >= this.totalSteps;
  }
  get timeS(): number {
    return this.step * this.dtS;
  }
  get altitudeM(): number {
    return this.descent.altitude[Math.min(this.step, this.totalSteps)]!;
  }
  get speedMS(): number {
    return this.descent.speed[Math.min(this.step, this.totalSteps)]!;
  }
  get ownCentreS(): number {
    return this.descent.centreS[this.config.stage]!;
  }
  get gateOpenS(): number {
    return this.ownCentreS - this.config.gateHalfS;
  }
  get gateCloseS(): number {
    return this.ownCentreS + this.config.gateHalfS;
  }
  /** The own gate is open now. */
  get gateOpen(): boolean {
    return this.timeS >= this.gateOpenS && this.timeS <= this.gateCloseS;
  }

  /** Altitude and speed at the given play time (clamped to the run). */
  altitudeAt(tS: number): number {
    return this.descent.altitude[clamp(Math.round(tS * STEP_HZ), 0, this.totalSteps)]!;
  }
  speedAt(tS: number): number {
    return this.descent.speed[clamp(Math.round(tS * STEP_HZ), 0, this.totalSteps)]!;
  }

  /** Time at which a stage's chute opened for the display, s, or null if it has not yet. */
  stageDeployS(k: number): number | null {
    if (k === this.config.stage) return this.deployS;
    const t = this.coopS[k] ?? this.descent.crewS[k]!;
    return t <= this.timeS ? t : null;
  }

  stageState(k: number): StageState {
    const c = this.descent.centreS[k]!;
    const d = this.stageDeployS(k);
    const h = this.config.gateHalfS;
    if (d !== null) {
      const j = judge(d, c, this.config);
      return j.outcome === 'in_gate' ? 'ok' : j.outcome === 'torn' ? 'torn' : 'late';
    }
    if (this.timeS < c - h) return 'wait';
    if (this.timeS <= c + h) return 'gate';
    return 'missed';
  }

  /** Advances one fixed step. A press records the deployment at the time of the step (once). */
  advance(input: Mg23Input): void {
    if (this.done) return;
    if (input.deploy && this.deployS === null) this.deployS = this.timeS;
    this.step++;
  }

  judgement(): Mg23Judgement {
    return judge(this.deployS, this.ownCentreS, this.config);
  }

  result(): MinigameResult {
    if (this.lastResult) return this.lastResult;
    const j = this.judgement();
    const r: MinigameResult = { success: j.outcome === 'in_gate', perfect: j.perfect, score: j.score };
    if (this.done) this.lastResult = r;
    return r;
  }

  /** Coarse progress for the host's meter: 1 once the own chute is open in its gate, else the run's elapsed fraction × 0.5. */
  progress(): number {
    return this.judgement().outcome === 'in_gate' ? 1 : Math.min(0.5, this.step / this.totalSteps / 2);
  }
}

export function makeSim(params: MgMap, seed: number, mode: MinigameMode, assist: AssistLevel, durationS: number): Mg23Sim {
  const config = resolveConfig(params, mode, assist);
  return new Mg23Sim(config, createDescent(config, seed, durationS));
}

/**
 * Scripted good player (tests and the demo): deploys at the gate centre plus `offsetS`, with a
 * reaction jitter. Players do not get it.
 */
export function goodPlayer(sim: Mg23Sim, offsetS = 0): Mg23Input {
  return { deploy: sim.timeS >= sim.ownCentreS + offsetS };
}

/** Runs a whole game with a scripted player. For tests and tools. */
export function runScripted(sim: Mg23Sim, player: (s: Mg23Sim) => Mg23Input): Mg23Sim {
  while (!sim.done) sim.advance(player(sim));
  return sim;
}
