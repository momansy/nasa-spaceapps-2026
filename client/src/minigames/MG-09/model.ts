// MG-09 Gravity Turn Tracer: the ascent curve, the player's trace and the scoring. Pure: no
// DOM, no clocks, no Math.random. Same seed + params + time-stamped inputs → same run.
//
// What is physical and what is a game simplification
// ---------------------------------------------------
// PHYSICAL (equations; the numbers fed into them are game values)
//   Point-mass ascent over a flat Earth without drag:
//     dv/dt = a(t) − g·sin γ          (thrust along the velocity, gravity)
//     dγ/dt = −g·cos γ / v            (gravity turn: gravity alone bends the path)
//     dx/dt = v·cos γ,  dh/dt = v·sin γ
//   a(t) = a0 / (1 − t/τ): thrust acceleration grows as propellant mass burns away.
//   g = 9.81 m/s².
// GAME VALUES
//   Thrust-to-weight 1.40–1.60, vertical rise 6–10 s, pitch-over over 4 s, τ = 260 s, a cap of
//   4 g, 150 s of flight squeezed into the play time, final flight-path angle 18–28°. The kick
//   angle is solved from the seed so that the turn ends at that angle.
//   Guidance corrections: three seeded smooth bumps of 4–8° on the ideal angle, standing for
//   wind and steering corrections. They are what makes the trace a game.
//   Thresholds (4° mean error, 1.5° perfect), guide lengths, cue windows and drift rate.
// SIMPLIFICATIONS
//   No drag, no Earth curvature or rotation, no staging; the player sets the flight-path angle
//   directly (a real vehicle steers its pitch attitude and the path follows).
import type { AssistLevel, MgMap, MinigameMode } from '@protocol';
import { assistFactor, clamp, mulberry32, numParam, smoothstep, STEP_HZ, StepSim, type SimInput } from './shared/core';

/** Standard gravity, m/s² (physical). */
export const G_MS2 = 9.81;
/** Flight time covered by one run, s (game value). */
export const FLIGHT_S = 150;
/** Propellant time constant of the thrust-acceleration growth, s (game value). */
const TAU_S = 260;
/** Acceleration cap, m/s² (game value, 4 g). */
const A_CAP = 4 * G_MS2;
/** One button: drift added by a press outside every cue window, degrees (game value). */
export const WILD_PRESS_DEG = 3;
/** Integration step of the curve, s. */
const CURVE_DT_S = 0.05;

/** Defaults of the host parameters. All game values: the design gives no threshold. */
export const DEFAULTS = {
  /** Success: mean flight-path-angle error at most this, degrees. */
  deviation_max_deg: 4,
  /** Perfect: mean error at most this, degrees. */
  perfect_deviation_max_deg: 1.5,
} as const;

export interface Mg09Config {
  deviationMaxDeg: number;
  perfectDeviationMaxDeg: number;
  /** Seconds of the curve shown ahead of the marker. */
  guideAheadS: number;
  /** Seconds of play across the lane (Relaxed scrolls more slowly). */
  laneSpanS: number;
  /** Size of the guidance corrections, fraction of the seeded size. */
  bumpScale: number;
  oneButton: boolean;
  /** One button: half-width of the window around each pitch cue, s. */
  cueWindowS: number;
  /** One button: drift of the marker away from the line, degrees per second. */
  driftDegPerS: number;
  /** One button: largest drift, degrees. */
  driftMaxDeg: number;
  /** One button: seconds between pitch cues. */
  cueEveryS: number;
}

/**
 * Host params + mode + difficulty → configuration. Relaxed: threshold ×1.5, lane span ×1.4
 * (scrolls more slowly), corrections ×0.7, cue window ×1.5. Cadet: guide 4 s, corrections ×0.8,
 * cue window ×1.25; Engineer: guide 3 s; Flight Director: guide 1.8 s, corrections ×1.2, cue
 * window ×0.8. All game values.
 */
export function resolveConfig(params: MgMap, mode: MinigameMode, assist: AssistLevel): Mg09Config {
  let dev = numParam(params, 'deviation_max_deg', DEFAULTS.deviation_max_deg, 0.5, 45);
  let perfect = numParam(params, 'perfect_deviation_max_deg', DEFAULTS.perfect_deviation_max_deg, 0.1, 45);
  const relaxed = mode === 'RELAXED';
  if (relaxed) {
    dev *= 1.5;
    perfect *= 1.5;
  }
  perfect = Math.min(perfect, dev);
  return {
    deviationMaxDeg: dev,
    perfectDeviationMaxDeg: perfect,
    guideAheadS: assist === 'CADET' ? 4 : assist === 'FLIGHT_DIRECTOR' ? 1.8 : 3,
    laneSpanS: relaxed ? 9.5 : 7,
    bumpScale: assistFactor(assist, 0.8, 1.2) * (relaxed ? 0.7 : 1),
    oneButton: mode === 'ONE_BUTTON',
    cueWindowS: 0.45 * assistFactor(assist, 1.25, 0.8) * (relaxed ? 1.5 : 1),
    driftDegPerS: 1.2,
    driftMaxDeg: 20,
    cueEveryS: 2.4,
  };
}

export interface Mg09Curve {
  seed: number;
  durationS: number;
  steps: number;
  /** Ideal flight-path angle per step (index 0…steps), degrees above the horizontal. */
  gammaDeg: Float32Array;
  /** Speed of the ideal ascent per step, m/s. */
  speedMs: Float32Array;
  /** Ideal path per step: downrange and altitude, km. */
  xKm: Float32Array;
  hKm: Float32Array;
  /** Seeded numbers, for the read-outs and tests. */
  twr: number;
  verticalS: number;
  kickDeg: number;
  endGammaDeg: number;
  /** Pitch cues (one-button), play seconds. */
  cuesS: number[];
}

interface FlightPoint {
  gammaDeg: number;
  v: number;
}

/** PHYSICAL equations, game numbers: integrates the gravity turn and returns γ and v per sample. */
export function integrateTurn(twr: number, verticalS: number, kickDeg: number, samples: number, out?: FlightPoint[]): FlightPoint[] {
  const pts = out ?? [];
  pts.length = 0;
  const a0 = twr * G_MS2;
  let v = 0;
  let gam = 90;
  const total = Math.round(FLIGHT_S / CURVE_DT_S);
  const every = total / samples;
  let next = 0;
  for (let k = 0; k <= total; k++) {
    const t = k * CURVE_DT_S;
    if (k >= next - 1e-9) {
      pts.push({ gammaDeg: gam, v });
      next += every;
    }
    const a = Math.min(A_CAP, a0 / (1 - t / TAU_S));
    if (t < verticalS) gam = 90;
    else if (t < verticalS + 4) gam = 90 - kickDeg * smoothstep(0, 1, (t - verticalS) / 4);
    else gam += ((-G_MS2 * Math.cos((gam * Math.PI) / 180)) / Math.max(1, v)) * CURVE_DT_S * (180 / Math.PI);
    v += (a - G_MS2 * Math.sin((gam * Math.PI) / 180)) * CURVE_DT_S;
  }
  while (pts.length < samples + 1) pts.push({ gammaDeg: gam, v });
  return pts;
}

/** Kick angle that makes the turn end at `endGammaDeg` after FLIGHT_S (bisection). */
export function solveKick(twr: number, verticalS: number, endGammaDeg: number): number {
  let lo = 0;
  let hi = 25;
  const end = (k: number) => {
    const p = integrateTurn(twr, verticalS, k, 1);
    return p[p.length - 1]!.gammaDeg;
  };
  for (let i = 0; i < 32; i++) {
    const m = (lo + hi) / 2;
    if (end(m) > endGammaDeg) lo = m;
    else hi = m;
  }
  return (lo + hi) / 2;
}

/** Builds the ideal curve of one run from the seed. */
export function createCurve(config: Mg09Config, seed: number, durationS: number): Mg09Curve {
  const rnd = mulberry32(seed ^ 0x09a5c3e1);
  const twr = 1.4 + 0.2 * rnd();
  const verticalS = 6 + 4 * rnd();
  const endGammaDeg = 18 + 10 * rnd();
  const kickDeg = solveKick(twr, verticalS, endGammaDeg);
  const steps = Math.max(1, Math.round(durationS * STEP_HZ));
  const flight = integrateTurn(twr, verticalS, kickDeg, steps);

  // Guidance corrections: three smooth bumps in the middle of the run.
  const bumps: Array<{ c: number; w: number; a: number }> = [];
  const lanes = [0.3, 0.55, 0.78];
  for (let i = 0; i < lanes.length; i++) {
    const sign = rnd() < 0.5 ? -1 : 1;
    bumps.push({ c: (lanes[i]! + 0.08 * (rnd() - 0.5)) * durationS, w: 2 + 1.5 * rnd(), a: sign * (4 + 4 * rnd()) * config.bumpScale });
  }

  const gammaDeg = new Float32Array(steps + 1);
  const speedMs = new Float32Array(steps + 1);
  const xKm = new Float32Array(steps + 1);
  const hKm = new Float32Array(steps + 1);
  const flightPerStep = FLIGHT_S / steps; // flight seconds per play step
  let x = 0;
  let h = 0;
  for (let k = 0; k <= steps; k++) {
    const tS = k / STEP_HZ;
    let g = flight[k]!.gammaDeg;
    for (const b of bumps) {
      const d = (tS - b.c) / b.w;
      if (Math.abs(d) < 1) g += b.a * 0.5 * (1 + Math.cos(Math.PI * d));
    }
    g = clamp(g, 2, 90);
    gammaDeg[k] = g;
    speedMs[k] = flight[k]!.v;
    xKm[k] = x;
    hKm[k] = h;
    const rad = (g * Math.PI) / 180;
    x += (flight[k]!.v * Math.cos(rad) * flightPerStep) / 1000;
    h += (flight[k]!.v * Math.sin(rad) * flightPerStep) / 1000;
  }

  // Pitch cues for the one-button mode: regular beats with a little seeded swing.
  const cuesS: number[] = [];
  for (let c = 2 + 0.4 * rnd(); c < durationS - 1; c += config.cueEveryS + 0.4 * (rnd() - 0.5)) cuesS.push(c);

  return { seed: seed >>> 0, durationS, steps, gammaDeg, speedMs, xKm, hKm, twr, verticalS, kickDeg, endGammaDeg, cuesS };
}

export interface Mg09Score {
  success: boolean;
  perfect: boolean;
  score: number;
  /** Mean flight-path-angle error over the run, degrees (protocol `mg.result.value`). */
  value: number;
}

/** Success: mean error ≤ threshold (suffix `_max`, data convention). Perfect: ≤ the perfect threshold. */
export function scoreMean(meanErrDeg: number, config: Pick<Mg09Config, 'deviationMaxDeg' | 'perfectDeviationMaxDeg'>): Mg09Score {
  const mean = Math.max(0, meanErrDeg);
  const success = mean <= config.deviationMaxDeg + 1e-9;
  const perfect = success && mean <= config.perfectDeviationMaxDeg + 1e-9;
  return { success, perfect, score: clamp(1 - mean / (2 * config.deviationMaxDeg), 0, 1), value: Math.round(mean * 100) / 100 };
}

/** Input kinds: `g` set the angle to `v` degrees; `n` nudge by `v` degrees; `p` one-button press. */
export class Mg09Sim extends StepSim {
  readonly config: Mg09Config;
  readonly curve: Mg09Curve;
  /** The player's flight-path angle now, degrees. */
  gammaDeg = 90;
  /** Steps simulated so far and the error sum, degrees × steps. */
  errSum = 0;
  /** The player's angle per step (for the trace) and the error per step. */
  readonly trace: Float32Array;
  readonly errHistory: Float32Array;
  /** The player's path, km (same speed profile as the ideal ascent). */
  readonly pxKm: Float32Array;
  readonly phKm: Float32Array;
  /** One button: time of the last correction, s; cue results (−1 open, 1 hit, 0 missed). */
  lastFixS = 0;
  readonly cueHit: Int8Array;
  driftSign = 1;
  presses = 0;
  /** One button: presses outside every cue window. */
  wildPresses = 0;
  private px = 0;
  private ph = 0;

  constructor(config: Mg09Config, curve: Mg09Curve, durationMs: number) {
    super(durationMs);
    this.config = config;
    this.curve = curve;
    this.trace = new Float32Array(this.totalSteps + 1);
    this.errHistory = new Float32Array(this.totalSteps + 1);
    this.pxKm = new Float32Array(this.totalSteps + 1);
    this.phKm = new Float32Array(this.totalSteps + 1);
    this.cueHit = new Int8Array(curve.cuesS.length).fill(-1);
    this.trace[0] = 90;
  }

  idealAt(step: number): number {
    return this.curve.gammaDeg[clamp(step, 0, this.curve.steps)]!;
  }

  idealAtS(tS: number): number {
    const f = clamp(tS * STEP_HZ, 0, this.curve.steps);
    const i = Math.floor(f);
    const a = this.curve.gammaDeg[i]!;
    const b = this.curve.gammaDeg[Math.min(this.curve.steps, i + 1)]!;
    return a + (b - a) * (f - i);
  }

  /** Mean error so far, degrees. */
  get meanErr(): number {
    return this.step === 0 ? 0 : this.errSum / this.step;
  }

  /** Current error, degrees (signed: + = steeper than the line). */
  get errNow(): number {
    return this.gammaDeg - this.idealAt(this.step);
  }

  /** Index of the pitch cue whose window contains `tS`, or −1. */
  cueAt(tS: number): number {
    const cues = this.curve.cuesS;
    for (let i = 0; i < cues.length; i++) if (Math.abs(tS - cues[i]!) <= this.config.cueWindowS + 1e-9) return i;
    return -1;
  }

  protected apply(input: SimInput): void {
    if (input.k === 'g' && !this.config.oneButton) this.gammaDeg = clamp(input.v ?? this.gammaDeg, 0, 90);
    else if (input.k === 'n' && !this.config.oneButton) this.gammaDeg = clamp(this.gammaDeg + (input.v ?? 0), 0, 90);
    else if (input.k === 'p' && this.config.oneButton) {
      this.presses++;
      const tS = input.t / 1000;
      const i = this.cueAt(tS);
      if (i >= 0 && this.cueHit[i] === -1) {
        this.cueHit[i] = 1;
        this.lastFixS = tS;
        this.driftSign = -this.driftSign;
      } else if (i < 0) {
        // A press away from any cue jolts the marker: the drift jumps by WILD_PRESS_DEG
        // (so pressing all the time cannot catch every cue for free).
        this.wildPresses++;
        this.lastFixS -= WILD_PRESS_DEG / this.config.driftDegPerS;
      }
    }
  }

  protected tick(): void {
    const k = this.step;
    const tS = k / STEP_HZ;
    if (this.config.oneButton) {
      // Missed cues close when their window has passed.
      const cues = this.curve.cuesS;
      for (let i = 0; i < cues.length; i++) if (this.cueHit[i] === -1 && tS > cues[i]! + this.config.cueWindowS) this.cueHit[i] = 0;
      const drift = Math.min(this.config.driftMaxDeg, this.config.driftDegPerS * Math.max(0, tS - this.lastFixS));
      this.gammaDeg = clamp(this.idealAt(k) + this.driftSign * drift, 0, 90);
    }
    const err = Math.abs(this.gammaDeg - this.idealAt(k));
    this.errSum += err;
    this.errHistory[k] = err;
    this.trace[k] = this.gammaDeg;
    // The player's path with the ideal speed profile (for the trajectory inset).
    const rad = (this.gammaDeg * Math.PI) / 180;
    const v = this.curve.speedMs[Math.min(k, this.curve.steps)]!;
    const flightPerStep = FLIGHT_S / this.curve.steps;
    this.pxKm[k] = this.px;
    this.phKm[k] = this.ph;
    this.px += (v * Math.cos(rad) * flightPerStep) / 1000;
    this.ph += (v * Math.sin(rad) * flightPerStep) / 1000;
    this.pxKm[k + 1] = this.px;
    this.phKm[k + 1] = this.ph;
    this.trace[k + 1] = this.gammaDeg;
  }

  score(): Mg09Score {
    return scoreMean(this.step === 0 ? 0 : this.errSum / this.totalSteps, this.config);
  }
}

export function newSim(config: Mg09Config, seed: number, durationMs: number): Mg09Sim {
  return new Mg09Sim(config, createCurve(config, seed, durationMs / 1000), durationMs);
}

/**
 * Scripted tracer: the line `leadS` ahead (negative = late) plus a wobble, sampled every
 * `everyMs`. For tests and the demo.
 */
export function tracerInputs(sim: Mg09Sim, opts: { everyMs?: number; leadS?: number; wobbleDeg?: number; untilMs?: number } = {}): SimInput[] {
  const every = opts.everyMs ?? 50;
  const out: SimInput[] = [];
  const until = opts.untilMs ?? sim.durationMs;
  for (let t = 0; t <= until; t += every) {
    const g = sim.idealAtS(t / 1000 + (opts.leadS ?? 0)) + (opts.wobbleDeg ?? 0) * Math.sin(t / 310);
    out.push({ t, k: 'g', v: g });
  }
  return out;
}

/** Scripted one-button player: presses `offsetS` after each cue (a negative offset is early). */
export function cueInputs(sim: Mg09Sim, offsetS = 0.05): SimInput[] {
  return sim.curve.cuesS.map((c) => ({ t: Math.round((c + offsetS) * 1000), k: 'p' }));
}
