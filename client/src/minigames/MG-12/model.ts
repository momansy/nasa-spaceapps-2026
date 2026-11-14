// MG-12 Engine-Out Rebalance: engine cluster, net torque about the centre of mass, the
// player's throttle and gimbal, disturbances and scoring. Pure: no DOM, no clocks, no Math.random.
//
// What is physical and what is a game simplification
// ---------------------------------------------------
// PHYSICAL
//   Net torque about the centre of mass (pitch plane):  τ = Σ rᵢ × Fᵢ
//   Engine i sits at (xᵢ, −L) from the centre of mass and pushes with Fᵢ = Tᵢ·Fmax tilted by its
//   gimbal angle δᵢ:  Fᵢ = Tᵢ·Fmax·(sin δᵢ, cos δᵢ), so  τᵢ = Tᵢ·Fmax·(xᵢ·cos δᵢ + L·sin δᵢ).
//   A failed engine pushes nothing, so the cluster's thrust no longer passes through the centre
//   of mass; the remaining engines must gimbal (and throttle) to cancel the torque.
// REAL-WORLD APPROXIMATE
//   Fmax ≈ 800 kN per engine (a medium kerosene engine), engines 1.6 m apart, gimbal ±6°.
// GAME VALUES
//   L = 25 m, throttle 60–100 %, actuator lag 0.25 s, disturbance torques (wind, propellant
//   slosh) as three seeded sines of about 350 kN·m, the zero-torque zone ±150 kN·m, 70 % / 90 %.
// SIMPLIFICATIONS
//   One plane (pitch only), engines in a row, no rotation dynamics in the scoring (the drawn tilt
//   is decoration), teammates hold the correct settings on this phone.
import type { AssistLevel, MgMap, MinigameMode } from '@protocol';
import { assistFactor, clamp, intParam, modeFactor, mulberry32, numArrayParam, numParam, slotOf, STEP_HZ, StepSim, stepsNeeded, subSeed, type SimInput } from '../MG-09/shared/core';

/** Thrust of one engine at 100 %, N (real-world approximate). */
export const F_MAX_N = 800_000;
/** Distance from the gimbal plane up to the centre of mass, m (game value). */
export const L_M = 25;
/** Spacing of the engines in the row, m (real-world approximate). */
export const SPACING_M = 1.6;
export const GIMBAL_MAX_DEG = 6;
export const THROTTLE_MIN = 0.6;
const ACTUATOR_LAG_S = 0.25;
const DEG = Math.PI / 180;

export const DEFAULTS = {
  /** Half-width of the zone counted as zero torque, kN·m (game value; design: "near zero"). */
  torque_zone_knm: 150,
  /** Success: in the zone at least this fraction of the time (game value). */
  in_zone_fraction_min: 0.7,
  /** Perfect: in the zone at least this fraction (game value). */
  perfect_in_zone_min: 0.9,
  /** Engines in the cluster. */
  engines: 5,
} as const;

export interface Mg12Config {
  zoneKnm: number;
  inZoneMin: number;
  perfectMin: number;
  /** Disturbance size and speed factors. */
  distScale: number;
  distSpeed: number;
  oneButton: boolean;
  /** One button: seconds for a full throttle sweep up and down. */
  sweepS: number;
}

/**
 * Relaxed: zone ×1.5, disturbances change at 0.6× the speed ("thrust changes more slowly").
 * One button: zone ×1.3, disturbances ×0.3 (the throttle alone must cope). Cadet: zone ×1.25,
 * disturbances ×0.8; Flight Director: zone ×0.8, disturbances ×1.2. Game values.
 */
export function resolveConfig(params: MgMap, mode: MinigameMode, assist: AssistLevel): Mg12Config {
  const zone = numParam(params, 'torque_zone_knm', DEFAULTS.torque_zone_knm, 10, 5000);
  const inZoneMin = numParam(params, 'in_zone_fraction_min', DEFAULTS.in_zone_fraction_min, 0.05, 1);
  return {
    zoneKnm: zone * assistFactor(assist, 1.25, 0.8) * modeFactor(mode, 1.5, 1.3),
    inZoneMin,
    perfectMin: Math.max(inZoneMin, numParam(params, 'perfect_in_zone_min', DEFAULTS.perfect_in_zone_min, 0.05, 1)),
    distScale: assistFactor(assist, 0.8, 1.2) * modeFactor(mode, 1, 0.3),
    distSpeed: modeFactor(mode, 0.6, 0.8),
    oneButton: mode === 'ONE_BUTTON',
    sweepS: 3.2 * assistFactor(assist, 1.25, 0.85),
  };
}

export interface Engine {
  /** Position across the row, m (positive to the right of the centre line). */
  x: number;
  failed: boolean;
}

export interface Layout {
  engines: Engine[];
  failed: number;
  /** Index of this player's engine. */
  mine: number;
  /** Gimbal each surviving engine holds when everything is balanced, degrees (team share). */
  shareDeg: number;
}

/** PHYSICAL: torque of one engine about the centre of mass, N·m. */
export function engineTorque(xM: number, throttle: number, gimbalDeg: number): number {
  return throttle * F_MAX_N * (xM * Math.cos(gimbalDeg * DEG) + L_M * Math.sin(gimbalDeg * DEG));
}

/**
 * Engine layout from params: `engines` (a count in a row, or an array of positions in m),
 * `failed` (index; default: an outer engine chosen by the seed), this player's engine from
 * `slot` (survivors off the centre line first, so the throttle has a lever arm).
 */
export function createLayout(params: MgMap, seed: number): Layout {
  const arr = numArrayParam(params, 'engines');
  const n = arr ? clamp(arr.length, 2, 12) : intParam(params, 'engines', DEFAULTS.engines, 2, 12);
  const xs = arr ? arr.slice(0, n) : Array.from({ length: n }, (_, i) => (i - (n - 1) / 2) * SPACING_M);
  const rnd = mulberry32(seed ^ 0x12c12c);
  const failed = intParam(params, 'failed', rnd() < 0.5 ? 0 : n - 1, 0, n - 1);
  const engines = xs.map((x, i) => ({ x, failed: i === failed }));
  const { slot } = slotOf(params);
  const survivors = engines.map((_, i) => i).filter((i) => i !== failed);
  const offAxis = survivors.filter((i) => Math.abs(engines[i]!.x) > 0.05);
  const pool = offAxis.length ? offAxis : survivors;
  const mine = pool[slot % pool.length]!;
  // Team share: every survivor gimbals the same angle so that, at full throttle, the torque of
  // the cluster is zero.  Σ (xᵢ cos δ + L sin δ) = 0  →  tan δ = −Σxᵢ / (n·L).
  const sumX = survivors.reduce((a, i) => a + engines[i]!.x, 0);
  const shareDeg = Math.atan2(-sumX, survivors.length * L_M) / DEG;
  return { engines, failed, mine, shareDeg };
}

export interface Mg12Score {
  success: boolean;
  perfect: boolean;
  score: number;
}

export function scoreZone(inZoneSteps: number, totalSteps: number, config: Pick<Mg12Config, 'inZoneMin' | 'perfectMin'>): Mg12Score {
  if (totalSteps <= 0) return { success: false, perfect: false, score: 0 };
  const success = inZoneSteps >= stepsNeeded(config.inZoneMin, totalSteps);
  return { success, perfect: success && inZoneSteps >= stepsNeeded(config.perfectMin, totalSteps), score: clamp(inZoneSteps / totalSteps, 0, 1) };
}

/**
 * Inputs: `c` set throttle (`v`, fraction) and gimbal (`w`, degrees) — the control pad; `t` / `g`
 * nudge throttle / gimbal by `v`; `p` one-button press (lock / unlock the sweeping throttle).
 */
export class Mg12Sim extends StepSim {
  readonly config: Mg12Config;
  readonly layout: Layout;
  /** Commanded and actual settings of this player's engine. */
  cmdThrottle = 1;
  cmdGimbalDeg = 0;
  throttle = 1;
  gimbalDeg = 0;
  /** Torques now, N·m: the disturbance and the net. */
  distNm = 0;
  netNm = 0;
  inZoneSteps = 0;
  /** Drawn vehicle tilt, degrees (decoration). */
  tiltDeg = 0;
  readonly netHistory: Float32Array;
  /** One button: locked, and where the sweep is. */
  locked = false;
  private sweepPhase = 0;
  private readonly waves: Array<{ a: number; f: number; p: number }>;
  private readonly othersNm: number;

  constructor(config: Mg12Config, params: MgMap, seed: number, durationMs: number) {
    super(durationMs);
    this.config = config;
    this.layout = createLayout(params, seed);
    // Disturbances are the same on every phone (seed only).
    const rnd = mulberry32(subSeed(seed, 12));
    const base = 350_000 * config.distScale;
    this.waves = [
      { a: base * 0.55, f: (0.11 + 0.08 * rnd()) * config.distSpeed, p: rnd() * Math.PI * 2 },
      { a: base * 0.3, f: (0.27 + 0.15 * rnd()) * config.distSpeed, p: rnd() * Math.PI * 2 },
      { a: base * 0.15, f: (0.6 + 0.3 * rnd()) * config.distSpeed, p: rnd() * Math.PI * 2 },
    ];
    // Teammates hold the team share at full throttle.
    let others = 0;
    this.layout.engines.forEach((e, i) => {
      if (e.failed || i === this.layout.mine) return;
      others += engineTorque(e.x, 1, this.layout.shareDeg);
    });
    this.othersNm = others;
    if (config.oneButton) {
      // The flight computer sets this engine's gimbal so that the balance sits mid-sweep (80 %).
      const mx = this.layout.engines[this.layout.mine]!.x;
      this.cmdGimbalDeg = this.gimbalDeg = this.solveGimbal(-others / 0.8, mx);
      this.cmdThrottle = this.throttle = THROTTLE_MIN;
    }
    this.netHistory = new Float32Array(this.totalSteps + 1);
    this.distNm = this.disturbance(0);
    this.netNm = this.computeNet();
  }

  /** Gimbal (degrees) at which an engine at `x` makes torque `perThrottleNm` at 100 %. */
  solveGimbal(perThrottleNm: number, x: number): number {
    // x cos δ + L sin δ = τ/F  →  R sin(δ + φ) with R = √(x² + L²), φ = atan2(x, L).
    const R = Math.hypot(x, L_M);
    const s = clamp(perThrottleNm / F_MAX_N / R, -1, 1);
    return clamp(Math.asin(s) / DEG - Math.atan2(x, L_M) / DEG, -GIMBAL_MAX_DEG, GIMBAL_MAX_DEG);
  }

  disturbance(tS: number): number {
    let d = 0;
    for (const w of this.waves) d += w.a * Math.sin(2 * Math.PI * w.f * tS + w.p);
    return d;
  }

  /** Torque the other engines (and the disturbance) leave for this player to cancel, N·m. */
  get othersNmNow(): number {
    return this.othersNm + this.distNm;
  }

  private computeNet(): number {
    const x = this.layout.engines[this.layout.mine]!.x;
    return this.othersNm + engineTorque(x, this.throttle, this.gimbalDeg) + this.distNm;
  }

  /** Net torque now, kN·m. */
  get netKnm(): number {
    return this.netNm / 1000;
  }

  get inZone(): boolean {
    return Math.abs(this.netKnm) <= this.config.zoneKnm + 1e-9;
  }

  get inZoneFraction(): number {
    return this.step === 0 ? 1 : this.inZoneSteps / this.step;
  }

  protected apply(input: SimInput): void {
    if (this.config.oneButton) {
      if (input.k === 'p') this.locked = !this.locked;
      return;
    }
    if (input.k === 'c') {
      if (input.v !== undefined) this.cmdThrottle = clamp(input.v, THROTTLE_MIN, 1);
      if (input.w !== undefined) this.cmdGimbalDeg = clamp(input.w, -GIMBAL_MAX_DEG, GIMBAL_MAX_DEG);
    } else if (input.k === 't') this.cmdThrottle = clamp(this.cmdThrottle + (input.v ?? 0), THROTTLE_MIN, 1);
    else if (input.k === 'g') this.cmdGimbalDeg = clamp(this.cmdGimbalDeg + (input.v ?? 0), -GIMBAL_MAX_DEG, GIMBAL_MAX_DEG);
  }

  protected tick(): void {
    const dt = 1 / STEP_HZ;
    const tS = this.step * dt;
    if (this.config.oneButton && !this.locked) {
      // Triangle sweep between 60 % and 100 %.
      this.sweepPhase = (this.sweepPhase + dt / this.config.sweepS) % 1;
      const tri = this.sweepPhase < 0.5 ? this.sweepPhase * 2 : 2 - this.sweepPhase * 2;
      this.cmdThrottle = THROTTLE_MIN + (1 - THROTTLE_MIN) * tri;
    }
    const k = 1 - Math.exp(-dt / ACTUATOR_LAG_S);
    this.throttle += (this.cmdThrottle - this.throttle) * (this.config.oneButton ? 1 : k);
    this.gimbalDeg += (this.cmdGimbalDeg - this.gimbalDeg) * k;
    this.distNm = this.disturbance(tS);
    this.netNm = this.computeNet();
    if (this.inZone) this.inZoneSteps++;
    this.netHistory[this.step] = this.netNm / 1000;
    // Decoration: the vehicle leans with the torque and the attitude control pulls it back.
    this.tiltDeg += (clamp(this.netNm / 1000 / 120, -8, 8) - this.tiltDeg) * (1 - Math.exp(-dt / 0.6));
  }

  score(): Mg12Score {
    return scoreZone(this.inZoneSteps, this.totalSteps, this.config);
  }
}

export function newSim(config: Mg12Config, params: MgMap, seed: number, durationMs: number): Mg12Sim {
  return new Mg12Sim(config, params, seed, durationMs);
}

/**
 * Scripted player at full throttle: every `everyMs` sets the gimbal that cancels the torque
 * `leadS` ahead (negative = late), plus a wobble. Runs a private copy for its observations.
 */
export function scriptedPad(make: () => Mg12Sim, everyMs = 100, leadS = 0.15, wobbleDeg = 0): SimInput[] {
  const sim = make();
  const out: SimInput[] = [];
  const x = sim.layout.engines[sim.layout.mine]!.x;
  for (let t = 0; !sim.done; t += everyMs) {
    sim.advanceTo(t);
    const others = sim.othersNmNow - sim.distNm + sim.disturbance(t / 1000 + leadS + 0.25);
    const g = sim.solveGimbal(-others, x) + wobbleDeg * Math.sin(t / 437);
    const i: SimInput = { t, k: 'c', v: 1, w: g };
    out.push(i);
    sim.push(i);
  }
  return out;
}

/** Scripted one-button player: locks when the needle crosses zero, unlocks when it leaves the zone. */
export function scriptedLock(make: () => Mg12Sim, everyMs = 50, lagMs = 120): SimInput[] {
  const sim = make();
  const out: SimInput[] = [];
  let prev = sim.netKnm;
  for (let t = 0; !sim.done; t += everyMs) {
    sim.advanceTo(t);
    const now = sim.netKnm;
    const crossed = (prev <= 0 && now >= 0) || (prev >= 0 && now <= 0);
    const want = sim.locked ? Math.abs(now) < sim.config.zoneKnm * 0.85 : crossed;
    if (sim.locked !== want) {
      const i = { t: t + lagMs, k: 'p' };
      out.push(i);
      sim.push(i);
      sim.advanceTo(t + lagMs);
    }
    prev = sim.netKnm;
  }
  return out;
}
