// MG-11 Pogo Damper: the lengthwise oscillation, its beats, tap judging and scoring. Pure: no
// DOM, no clocks, no Math.random. Taps are judged by their own time stamps.
//
// The vehicle bounces lengthwise; each trough of the bounce is a beat. A beat counts as
// counter-phase for this player when the first tap inside the beat's cell (half a period either
// side of the trough) is within ± window of the trough. Mashing therefore fails: the first tap
// of a cell lands at its start, far from the trough.
//
// PHYSICAL (qualitative): pogo is a feedback loop between thrust and propellant flow (fact F07);
// acting against the oscillation damps it.
// GAME SIMPLIFICATION: real pogo runs at several to tens of hertz. Here it is slowed to 1.25 Hz
// (Relaxed 1.0 Hz) so that a person can tap against it. Window, damping and growth rates are game
// values. Teammates only change how fast the drawn bounce dies away; each phone judges its own
// taps.
import type { AssistLevel, MgMap, MinigameMode } from '@protocol';
import { assistFactor, clamp, modeFactor, mulberry32, numParam, slotOf, STEP_HZ, StepSim, subSeed, type SimInput } from '../MG-09/shared/core';

export const DEFAULTS = {
  /** Success: counter-phase on at least this fraction of beats (data). */
  counter_phase_beats_fraction_min: 0.7,
  /** Perfect: at least this fraction (game value). */
  perfect_beats_fraction_min: 0.95,
  /** Oscillation frequency, Hz (game value, slowed from real pogo). */
  pogo_hz: 1.25,
  /** Half-width of the beat window, s (game value). */
  beat_window_s: 0.12,
} as const;

/** Silence before the first beat, s: two metronome beats to catch the rhythm. */
const LEAD_S = 1.6;
/** A beat is settled this long after its window closes (late-delivered taps still count live). */
const GRACE_S = 0.2;

export interface Mg11Config {
  hz: number;
  windowS: number;
  successMin: number;
  perfectMin: number;
}

/** Relaxed: 1.0 Hz and window ×1.6. Cadet window ×1.25, Flight Director ×0.8. Game values. */
export function resolveConfig(params: MgMap, mode: MinigameMode, assist: AssistLevel): Mg11Config {
  const hz = numParam(params, 'pogo_hz', DEFAULTS.pogo_hz, 0.4, 3) * (mode === 'RELAXED' ? 0.8 : 1);
  const successMin = numParam(params, 'counter_phase_beats_fraction_min', DEFAULTS.counter_phase_beats_fraction_min, 0.05, 1);
  return {
    hz,
    windowS: Math.min(0.45 / hz, numParam(params, 'beat_window_s', DEFAULTS.beat_window_s, 0.03, 0.4) * assistFactor(assist, 1.25, 0.8) * modeFactor(mode, 1.6)),
    successMin,
    perfectMin: Math.max(successMin, numParam(params, 'perfect_beats_fraction_min', DEFAULTS.perfect_beats_fraction_min, 0.05, 1)),
  };
}

export interface Mg11Score {
  success: boolean;
  perfect: boolean;
  score: number;
}

/** Success: good beats ≥ fraction × beats (exactly 70 % counts). */
export function scoreBeats(good: number, total: number, config: Pick<Mg11Config, 'successMin' | 'perfectMin'>): Mg11Score {
  if (total <= 0) return { success: false, perfect: false, score: 0 };
  const need = (f: number) => Math.ceil(f * total - 1e-9);
  const success = good >= need(config.successMin);
  return { success, perfect: success && good >= need(config.perfectMin), score: clamp(good / total, 0, 1) };
}

/** Input `k`: `p` a tap. */
export class Mg11Sim extends StepSim {
  readonly config: Mg11Config;
  readonly periodS: number;
  readonly t0S: number;
  /** Trough times, s. */
  readonly beatsS: number[];
  /** Offset of the first tap in each beat's cell, s (NaN = none yet). */
  readonly firstTap: Float64Array;
  /** Settled beats: 1 good, 0 missed, −1 open. */
  readonly settled: Int8Array;
  /** Crew in sync per beat (seeded), as a count. */
  readonly crewSync: Uint8Array;
  readonly slots: number;
  /** Teammates in sync per beat from the host, when known (−1 = unknown). */
  readonly liveSync: Int8Array;
  /** Bounce amplitude (1 = start) after each settled beat, and now. */
  amp = 1;
  readonly ampHistory: Float32Array;
  taps = 0;
  private nextSettle = 0;

  constructor(config: Mg11Config, params: MgMap, seed: number, durationMs: number) {
    super(durationMs);
    this.config = config;
    this.periodS = 1 / config.hz;
    const rnd = mulberry32(seed ^ 0x11a11a);
    this.t0S = LEAD_S + 0.25 * rnd();
    const beats: number[] = [];
    const end = this.durationMs / 1000 - config.windowS - GRACE_S - 0.05;
    for (let t = this.t0S; t <= end; t += this.periodS) beats.push(t);
    this.beatsS = beats;
    this.firstTap = new Float64Array(beats.length).fill(NaN);
    this.settled = new Int8Array(beats.length).fill(-1);
    this.ampHistory = new Float32Array(beats.length + 1).fill(1);
    const { slot, slots } = slotOf(params);
    this.slots = slots;
    const crew = mulberry32(subSeed(seed, 1100 + slot));
    this.crewSync = new Uint8Array(beats.length);
    for (let k = 0; k < beats.length; k++) {
      let n = 0;
      for (let i = 0; i < slots - 1; i++) if (crew() < 0.72 + 0.2 * Math.min(1, k / 6)) n++;
      this.crewSync[k] = n;
    }
    this.liveSync = new Int8Array(beats.length).fill(-1);
  }

  /** Beat whose cell contains time `tS` (cell = trough ± half a period), or −1. */
  cellOf(tS: number): number {
    const k = Math.round((tS - this.t0S) / this.periodS);
    return k >= 0 && k < this.beatsS.length ? k : -1;
  }

  /** Lengthwise displacement now, −1…1 × amplitude (troughs at the beats). */
  displacement(tS: number): number {
    // The bounce builds up over the period before the first beat.
    const env = clamp((tS - (this.t0S - 1.5 * this.periodS)) / this.periodS, 0, 1);
    return -this.amp * env * Math.cos((2 * Math.PI * (tS - this.t0S)) / this.periodS);
  }

  get goodBeats(): number {
    let g = 0;
    for (let k = 0; k < this.beatsS.length; k++) if (this.settled[k] === 1) g++;
    return g;
  }

  get settledBeats(): number {
    return this.nextSettle;
  }

  protected apply(input: SimInput): void {
    if (input.k !== 'p') return;
    this.taps++;
    const tS = input.t / 1000;
    const k = this.cellOf(tS);
    if (k < 0 || !Number.isNaN(this.firstTap[k]!)) return;
    this.firstTap[k] = tS - this.beatsS[k]!;
  }

  isGood(k: number): boolean {
    const d = this.firstTap[k]!;
    return !Number.isNaN(d) && Math.abs(d) <= this.config.windowS + 1e-9;
  }

  protected tick(): void {
    const tS = this.step / STEP_HZ;
    while (this.nextSettle < this.beatsS.length && tS > this.beatsS[this.nextSettle]! + this.config.windowS + GRACE_S) {
      const k = this.nextSettle;
      const good = this.isGood(k);
      this.settled[k] = good ? 1 : 0;
      // Damping grows with the share of the team in counter-phase (decoration only).
      const mates = this.liveSync[k]! >= 0 ? this.liveSync[k]! : this.crewSync[k]!;
      const frac = ((good ? 1 : 0) + mates) / Math.max(1, this.slots);
      this.amp = clamp(frac >= 0.3 ? this.amp * (1 - 0.16 * frac) : this.amp * 1.05, 0.08, 1.2);
      this.ampHistory[k + 1] = this.amp;
      this.nextSettle++;
    }
  }

  score(): Mg11Score {
    let good = 0;
    for (let k = 0; k < this.beatsS.length; k++) if (this.isGood(k)) good++;
    return scoreBeats(good, this.beatsS.length, this.config);
  }
}

export function newSim(config: Mg11Config, params: MgMap, seed: number, durationMs: number): Mg11Sim {
  return new Mg11Sim(config, params, seed, durationMs);
}

/** Scripted player: one tap per beat at `offsetS` (plus a seeded jitter of ± `jitterS`), missing every `missEvery`-th. */
export function beatInputs(sim: Mg11Sim, offsetS = 0.03, jitterS = 0, missEvery = 0, seed = 1): SimInput[] {
  const rnd = mulberry32(seed);
  const out: SimInput[] = [];
  sim.beatsS.forEach((b, k) => {
    if (missEvery > 0 && k % missEvery === missEvery - 1) return;
    out.push({ t: (b + offsetS + (rnd() * 2 - 1) * jitterS) * 1000, k: 'p' });
  });
  return out;
}
