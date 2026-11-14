// MG-10 Fairing Catch: two fairing halves drifting down under parafoils, this player's recovery
// boat, and scoring. Pure: no DOM, no clocks, no Math.random.
//
// PHYSICAL (qualitative): a parafoil descends slowly and drifts with the wind; a boat has a top
// speed and cannot change speed instantly.
// GAME VALUES: everything numeric. The descent from 1,500 m is squeezed into the play time (a
// real parafoil takes minutes); wind is three seeded sines plus a seeded mean drift, about
// 9 m/s at most; boat top speed 18 m/s, acceleration 12 m/s², steering lag 0.25 s; net
// half-width 15 m; the scene is ±110 m wide and the halves stay inside ±85 m.
// SIMPLIFICATIONS: one horizontal axis, no waves under the boat, the halves do not steer.
import type { AssistLevel, MgMap, MinigameMode } from '@protocol';
import { assistFactor, clamp, modeFactor, mulberry32, numParam, slotOf, STEP_HZ, StepSim, stepsNeeded, subSeed, type SimInput } from '../MG-09/shared/core';

export const DEFAULTS = {
  /** Success: under the target at least this fraction of the time (data). */
  under_target_fraction_min: 0.7,
  /** Host reward only; not a success input (data). */
  fairing_refund_fraction_max: 0.6,
  /** Perfect (game value). */
  perfect_fraction_min: 0.85,
  /** Half-width of the net, m (game value). */
  net_half_width_m: 15,
} as const;

export const SCENE_HALF_M = 110;
const DRIFT_LIMIT_M = 85;
export const START_ALT_M = 1500;
const BOAT_VMAX = 18;
const BOAT_AMAX = 12;
const STEER_LAG_S = 0.25;
/** One button: boat coasting drag time constant, s, and sea current, m/s. */
const COAST_TAU_S = 0.6;
/** One button: pull towards the half while held, 1/s² (a spring: ω ≈ 0.63 rad/s). */
const HOLD_PULL = 0.4;

export interface Mg10Config {
  successMin: number;
  perfectMin: number;
  netHalfM: number;
  windScale: number;
  oneButton: boolean;
  holdToToggle: boolean;
}

/**
 * Relaxed: wind ×0.6 ("drift more slowly"), net ×1.4. Cadet: wind ×0.8, net ×1.25. Flight
 * Director: wind ×1.15, net ×0.8. Game values.
 */
export function resolveConfig(params: MgMap, mode: MinigameMode, assist: AssistLevel): Mg10Config {
  const successMin = numParam(params, 'under_target_fraction_min', DEFAULTS.under_target_fraction_min, 0.05, 1);
  return {
    successMin,
    perfectMin: Math.max(successMin, numParam(params, 'perfect_fraction_min', DEFAULTS.perfect_fraction_min, 0.05, 1)),
    netHalfM: numParam(params, 'net_half_width_m', DEFAULTS.net_half_width_m, 2, 60) * assistFactor(assist, 1.25, 0.8) * modeFactor(mode, 1.4, 1.25),
    windScale: assistFactor(assist, 0.8, 1.15) * modeFactor(mode, 0.6),
    oneButton: mode === 'ONE_BUTTON',
    holdToToggle: params['hold_to_toggle'] === true,
  };
}

export interface Mg10Score {
  success: boolean;
  perfect: boolean;
  score: number;
}

export function scoreUnder(underSteps: number, totalSteps: number, config: Pick<Mg10Config, 'successMin' | 'perfectMin'>): Mg10Score {
  if (totalSteps <= 0) return { success: false, perfect: false, score: 0 };
  const success = underSteps >= stepsNeeded(config.successMin, totalSteps);
  return { success, perfect: success && underSteps >= stepsNeeded(config.perfectMin, totalSteps), score: clamp(underSteps / totalSteps, 0, 1) };
}

interface Drift {
  x: number;
  v: number;
  mean: number;
  waves: Array<{ a: number; f: number; p: number }>;
}

/**
 * Inputs: `x` steer to position `v` (m, Standard / Relaxed: the finger); `k` steer with keys,
 * `v` = −1 left, 0 none, +1 right; `h` one-button state (`v` 1 pressed, 0 released).
 */
export class Mg10Sim extends StepSim {
  readonly config: Mg10Config;
  /** 0 = left half (A), 1 = right half (B). */
  readonly myHalf: 0 | 1;
  readonly slot: number;
  readonly slots: number;
  /** Fairing half positions, m. */
  halfX: [number, number] = [0, 0];
  boatX: number;
  boatV = 0;
  /** Teammate boat (other half), simulated crew, m. */
  crewX: number;
  private crewV = 0;
  targetX: number;
  private keyDir = 0;
  private pressed = false;
  private latched = false;
  underSteps = 0;
  readonly gapHistory: Float32Array;
  private readonly drift: [Drift, Drift];
  private readonly current: number;

  constructor(config: Mg10Config, params: MgMap, seed: number, durationMs: number) {
    super(durationMs);
    this.config = config;
    const { slot, slots } = slotOf(params);
    this.slot = slot;
    this.slots = slots;
    this.myHalf = (slot % 2) as 0 | 1;
    const rnd = mulberry32(seed ^ 0x10f10f);
    const mk = (x0: number): Drift => ({
      x: x0,
      v: 0,
      mean: (rnd() * 2 - 1) * 2.5,
      waves: [
        { a: 5 + 2 * rnd(), f: 0.07 + 0.05 * rnd(), p: rnd() * Math.PI * 2 },
        { a: 2.5 + 1.5 * rnd(), f: 0.18 + 0.1 * rnd(), p: rnd() * Math.PI * 2 },
        { a: 1 + rnd(), f: 0.4 + 0.2 * rnd(), p: rnd() * Math.PI * 2 },
      ],
    });
    this.drift = [mk(-35 - 15 * rnd()), mk(35 + 15 * rnd())];
    this.halfX = [this.drift[0].x, this.drift[1].x];
    this.current = (rnd() * 2 - 1) * 1;
    // This player's boat starts 20–32 m off its half, on a seeded side (per slot); the half's
    // mean drift carries it away from the boat, so an idle boat is left behind.
    const prnd = mulberry32(subSeed(seed, 1010 + slot));
    const side = prnd() < 0.5 ? -1 : 1;
    this.drift[this.myHalf].mean = -side * (2 + 1.5 * prnd());
    this.boatX = clamp(this.halfX[this.myHalf] + side * (config.oneButton ? 36 + 10 * prnd() : 20 + 12 * prnd()), -SCENE_HALF_M + 10, SCENE_HALF_M - 10);
    this.targetX = this.boatX;
    this.crewX = this.halfX[1 - this.myHalf]! + (prnd() * 2 - 1) * 30;
    this.gapHistory = new Float32Array(this.totalSteps + 1);
  }

  /** Altitude of the halves now, m (display: the descent is squeezed into the play time). */
  get altitudeM(): number {
    return START_ALT_M * (1 - this.step / this.totalSteps) + 20 * (this.step / this.totalSteps);
  }

  /** Signed distance from this player's half to the boat, m. */
  get gapM(): number {
    return this.boatX - this.halfX[this.myHalf];
  }

  get under(): boolean {
    return Math.abs(this.gapM) <= this.config.netHalfM + 1e-9;
  }

  get underFraction(): number {
    return this.step === 0 ? 1 : this.underSteps / this.step;
  }

  get holding(): boolean {
    return this.config.holdToToggle ? this.latched : this.pressed;
  }

  windAt(i: 0 | 1, tS: number): number {
    const d = this.drift[i];
    let w = d.mean;
    for (const x of d.waves) w += x.a * Math.sin(2 * Math.PI * x.f * tS + x.p);
    return w * this.config.windScale;
  }

  protected apply(input: SimInput): void {
    if (this.config.oneButton) {
      if (input.k !== 'h') return;
      const down = (input.v ?? 0) > 0;
      if (this.config.holdToToggle && down && !this.pressed) this.latched = !this.latched;
      this.pressed = down;
      return;
    }
    if (input.k === 'x') {
      this.targetX = clamp(input.v ?? this.targetX, -SCENE_HALF_M, SCENE_HALF_M);
      this.keyDir = 0;
    } else if (input.k === 'k') this.keyDir = Math.sign(input.v ?? 0);
  }

  protected tick(): void {
    const dt = 1 / STEP_HZ;
    const tS = this.step * dt;
    // Halves drift with the wind and stay inside the scene (soft walls).
    for (let i = 0; i < 2; i++) {
      const d = this.drift[i as 0 | 1];
      let v = this.windAt(i as 0 | 1, tS);
      if (d.x > DRIFT_LIMIT_M) v -= (d.x - DRIFT_LIMIT_M) * 0.8;
      if (d.x < -DRIFT_LIMIT_M) v -= (d.x + DRIFT_LIMIT_M) * 0.8;
      d.v = v;
      d.x += v * dt;
      this.halfX[i as 0 | 1] = d.x;
    }
    // This player's boat.
    if (this.config.oneButton) {
      if (this.holding) {
        // Held: the boat is pulled towards the half like a spring, without damping, so holding
        // all the time swings past it; letting go at the right moment is the skill.
        this.boatV += clamp((this.halfX[this.myHalf] - this.boatX) * HOLD_PULL, -BOAT_AMAX, BOAT_AMAX) * dt;
        this.boatV = clamp(this.boatV, -BOAT_VMAX * 2, BOAT_VMAX * 2);
      } else {
        // Released: the boat coasts to a stop and drifts with the current.
        const k = 1 - Math.exp(-dt / COAST_TAU_S);
        this.boatV += (this.current - this.boatV) * k;
      }
    } else {
      let desired: number;
      if (this.keyDir !== 0) {
        desired = this.keyDir * BOAT_VMAX;
        this.targetX = this.boatX;
      } else desired = clamp((this.targetX - this.boatX) * 2.5, -BOAT_VMAX, BOAT_VMAX);
      this.boatV += clamp((desired - this.boatV) / STEER_LAG_S, -BOAT_AMAX, BOAT_AMAX) * dt;
    }
    this.boatX = clamp(this.boatX + this.boatV * dt, -SCENE_HALF_M + 4, SCENE_HALF_M - 4);
    // Crew boat: follows its half a little late (decoration).
    const other = this.halfX[1 - this.myHalf]!;
    const cd = clamp((other - this.crewX) * 0.6, -BOAT_VMAX * 0.9, BOAT_VMAX * 0.9);
    this.crewV += clamp((cd - this.crewV) / 0.9, -BOAT_AMAX, BOAT_AMAX) * dt;
    this.crewX += this.crewV * dt;
    if (this.under) this.underSteps++;
    this.gapHistory[this.step] = this.gapM;
  }

  score(): Mg10Score {
    return scoreUnder(this.underSteps, this.totalSteps, this.config);
  }
}

export function newSim(config: Mg10Config, params: MgMap, seed: number, durationMs: number): Mg10Sim {
  return new Mg10Sim(config, params, seed, durationMs);
}

/** Scripted player: points at its half (`leadS` ahead) every `everyMs`, with a wobble. */
export function scriptedSteer(make: () => Mg10Sim, everyMs = 120, leadS = 0.3, wobbleM = 0): SimInput[] {
  const sim = make();
  const out: SimInput[] = [];
  for (let t = 0; !sim.done; t += everyMs) {
    sim.advanceTo(t);
    const h = sim.halfX[sim.myHalf] + sim.windAt(sim.myHalf, t / 1000) * leadS + wobbleM * Math.sin(t / 530);
    const i = { t, k: 'x', v: h };
    out.push(i);
    sim.push(i);
  }
  return out;
}

/** Scripted one-button player: holds while the boat would coast to more than `holdOverM` from its half. */
export function scriptedHoldBoat(make: () => Mg10Sim, everyMs = 100, holdOverM = 4, lagMs = 120): SimInput[] {
  const sim = make();
  const out: SimInput[] = [];
  let held = false;
  for (let t = 0; !sim.done; t += everyMs) {
    sim.advanceTo(t);
    // Where the boat would coast to if released now.
    const want = Math.abs(sim.gapM + sim.boatV * COAST_TAU_S) > holdOverM;
    if (sim.config.holdToToggle) {
      if (want !== sim.holding) {
        const a = { t: t + lagMs, k: 'h', v: 1 };
        const b = { t: t + lagMs + 50, k: 'h', v: 0 };
        out.push(a, b);
        sim.push(a);
        sim.push(b);
        sim.advanceTo(t + lagMs + 60);
      }
    } else if (want !== held) {
      held = want;
      const i = { t: t + lagMs, k: 'h', v: want ? 1 : 0 };
      out.push(i);
      sim.push(i);
    }
  }
  return out;
}
