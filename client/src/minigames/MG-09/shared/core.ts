// Pure helpers shared by the launch and ascent minigames of task T020 (MG-07, MG-08b, MG-09,
// MG-10, MG-10a, MG-11, MG-12). No DOM, no clocks, no Math.random.
//
// Every model in the set is a `StepSim`: a fixed 120 Hz simulation that is advanced to a play
// time and fed time-stamped inputs. An input stamped `t` ms is applied before the first step
// that starts at or after `t`, so a run depends only on the seed, the parameters and the input
// time stamps, never on the frame rate. Inputs that arrive late (the frame already simulated
// past their stamp) are applied at the next step during play; the reported result is always
// computed by `replay()` from the input log, which applies every input at its exact step.
import type { AssistLevel, MgMap, MinigameMode } from '@protocol';

/** Fixed simulation rate, steps per second (game value, as MG-08). */
export const STEP_HZ = 120;
export const STEP_MS = 1000 / STEP_HZ;

/** Small seeded generator (mulberry32, copied from MG-08). Returns numbers in [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Mixes a seed with a small integer (slot, stream number) into a new 32-bit seed. */
export function subSeed(seed: number, k: number): number {
  let h = (seed ^ Math.imul(k + 0x9e3779b9, 0x85ebca6b)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x846ca68b) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

/** A finite number parameter, clamped; otherwise the fallback. */
export function numParam(params: MgMap, key: string, fallback: number, min: number, max: number): number {
  const v = params[key];
  if (typeof v !== 'number' || !Number.isFinite(v)) return fallback;
  return clamp(v, min, max);
}

/** A whole-number parameter, clamped; otherwise the fallback. */
export function intParam(params: MgMap, key: string, fallback: number, min: number, max: number): number {
  return Math.round(numParam(params, key, fallback, min, max));
}

export function boolParam(params: MgMap, key: string, fallback: boolean): boolean {
  const v = params[key];
  return typeof v === 'boolean' ? v : fallback;
}

/** A number array parameter (finite values only); otherwise null. */
export function numArrayParam(params: MgMap, key: string): number[] | null {
  const v = params[key];
  if (!Array.isArray(v) || v.length === 0) return null;
  if (!v.every((x) => typeof x === 'number' && Number.isFinite(x))) return null;
  return v.slice();
}

/** This player's slot and the number of active players (host convention, see types.ts). */
export function slotOf(params: MgMap): { slot: number; slots: number } {
  const slots = intParam(params, 'slots', 1, 1, 10);
  return { slot: intParam(params, 'slot', 0, 0, 9), slots };
}

/**
 * Difficulty factor (design 10.1 rule 6): CADET gets `cadet`, ENGINEER 1, FLIGHT_DIRECTOR
 * `director`. Every minigame of the set uses about ±25 % (game value).
 */
export function assistFactor(assist: AssistLevel, cadet: number, director: number): number {
  return assist === 'CADET' ? cadet : assist === 'FLIGHT_DIRECTOR' ? director : 1;
}

export function modeFactor(mode: MinigameMode, relaxed: number, oneButton = 1): number {
  return mode === 'RELAXED' ? relaxed : mode === 'ONE_BUTTON' ? oneButton : 1;
}

/** Whole steps needed for a fraction, with a tiny tolerance so 0.7 × 2400 = 1680 is not lost to rounding. */
export function stepsNeeded(fraction: number, totalSteps: number): number {
  return Math.ceil(fraction * totalSteps - 1e-9);
}

/** One time-stamped input: `t` play ms, `k` kind, `v` and `w` numbers. Plain data (loggable). */
export interface SimInput {
  t: number;
  k: string;
  v?: number;
  w?: number;
}

/** Fixed-step simulation with a time-stamped input queue (see the file header). */
export abstract class StepSim {
  readonly totalSteps: number;
  readonly durationMs: number;
  /** Steps simulated so far. */
  step = 0;
  /** Every input received, in order of arrival. */
  readonly log: SimInput[] = [];
  private readonly queue: SimInput[] = [];
  /** Set by a model whose play ends before the time is up. */
  protected ended = false;

  constructor(durationMs: number) {
    this.durationMs = Math.max(STEP_MS, durationMs);
    this.totalSteps = Math.max(1, Math.round((this.durationMs * STEP_HZ) / 1000));
  }

  get done(): boolean {
    return this.ended || this.step >= this.totalSteps;
  }

  /** Play time simulated so far, ms. */
  get timeMs(): number {
    return this.step * STEP_MS;
  }

  get timeS(): number {
    return this.step / STEP_HZ;
  }

  /** Queues an input. Inputs after the end are ignored. */
  push(input: SimInput): void {
    if (this.done || !Number.isFinite(input.t)) return;
    const i: SimInput = { ...input, t: Math.max(0, input.t) };
    this.log.push(i);
    // Keep the queue sorted by time (stable for equal stamps).
    let at = this.queue.length;
    while (at > 0 && this.queue[at - 1]!.t > i.t) at--;
    this.queue.splice(at, 0, i);
  }

  /** Simulates up to play time `ms`. */
  advanceTo(ms: number): void {
    const target = Math.min(this.totalSteps, Math.floor((ms * STEP_HZ) / 1000 + 1e-6));
    while (this.step < target && !this.ended) {
      const startMs = this.step * STEP_MS;
      while (this.queue.length && this.queue[0]!.t <= startMs + 1e-6) this.apply(this.queue.shift()!);
      if (this.ended) break;
      this.tick();
      this.step++;
    }
    // Inputs stamped exactly at the end still count (a tap on the last moment).
    if (this.step >= this.totalSteps) {
      while (this.queue.length && this.queue[0]!.t <= this.durationMs + 1e-6) this.apply(this.queue.shift()!);
      this.queue.length = 0;
    }
  }

  /** Runs to the end. */
  finish(): void {
    this.advanceTo(this.durationMs);
  }

  /** Applies one input at the current step (`this.step` is about to be simulated). */
  protected abstract apply(input: SimInput): void;
  /** Simulates step `this.step` (the interval from `step` to `step + 1`). */
  protected abstract tick(): void;
}

/** Runs a fresh simulation over a recorded input log: the exact, frame-rate-free result. */
export function replay<S extends StepSim>(make: () => S, log: readonly SimInput[]): S {
  const sim = make();
  for (const i of log) sim.push(i);
  sim.finish();
  return sim;
}

/**
 * Feeds a scripted player into a simulation in fixed frames of `frameMs`, the way the browser
 * does: the script sees the state after each frame and returns the inputs of that frame (time
 * stamped inside the frame). For tests and the demo loop.
 */
export function playFrames<S extends StepSim>(sim: S, frameMs: number | ((i: number) => number), script: (sim: S, nowMs: number) => SimInput[] | SimInput | null): S {
  let now = 0;
  let i = 0;
  let guard = 0;
  while (!sim.done && guard++ < 1_000_000) {
    const out = script(sim, now);
    if (out) for (const x of Array.isArray(out) ? out : [out]) sim.push(x);
    now += typeof frameMs === 'number' ? frameMs : frameMs(i++);
    sim.advanceTo(now);
  }
  return sim;
}

/**
 * Plays recorded inputs through a live simulation in frames of the given lengths: before each
 * frame is simulated, the inputs stamped inside it are queued (as the browser delivers them).
 * Different frame patterns must give the identical run. For tests.
 */
export function feedFrames<S extends StepSim>(sim: S, inputs: readonly SimInput[], frameMs: (i: number) => number): S {
  const sorted = [...inputs].sort((a, b) => a.t - b.t);
  let now = 0;
  let next = 0;
  for (let i = 0; !sim.done && i < 1_000_000; i++) {
    const end = now + Math.max(0.001, frameMs(i));
    while (next < sorted.length && sorted[next]!.t < end) sim.push(sorted[next++]!);
    sim.advanceTo(end);
    now = end;
  }
  return sim;
}
