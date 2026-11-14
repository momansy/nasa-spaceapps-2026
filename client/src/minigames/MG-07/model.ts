// MG-07 Go/No-Go Poll: the console readings, the relay turn and the call judging. Pure: no
// DOM, no clocks, no Math.random. The answer is judged by its time stamp.
//
// Relay: FLIGHT calls each console in turn. This player's turn starts `slot × turnMs` after
// the start (protocol: RELAY turn = startAtMs + index × params.turnMs) and the answer window
// opens with it. The right call is GO when every reading is within its launch-commit limits
// (limits inclusive), otherwise NO-GO. Success: the right call within the window. The result is
// reported right after the answer, or when the window closes.
//
// Readings come from the per-player params (parallel arrays `channels`, `values`, `limits_lo`,
// `limits_hi`); without them they are generated from the seed and the slot with the
// real-world-approximate limits of CHANNELS below.
import type { AssistLevel, MgMap, MinigameMode } from '@protocol';
import { assistFactor, clamp, intParam, mulberry32, numArrayParam, numParam, slotOf, StepSim, subSeed, type SimInput } from '../MG-09/shared/core';

export interface Channel {
  /** String key suffix: minigame.MG-07.ch.<id>. */
  id: string;
  unit: string;
  /** Launch-commit limits; ±Infinity = no limit on that side. */
  lo: number;
  hi: number;
  decimals: number;
  /** Range drawn on the gauge. */
  min: number;
  max: number;
}

/**
 * Channel table, indexed by the `channels` param. Limits are REAL-WORLD APPROXIMATE orders of
 * magnitude chosen for the game, not the commit criteria of any particular vehicle.
 */
export const CHANNELS: readonly Channel[] = [
  // 0 Upper-level winds: an upper limit only.
  { id: 'winds_aloft', unit: 'm/s', lo: -Infinity, hi: 34, decimals: 0, min: 0, max: 50 },
  // 1 Peak ground wind at the pad.
  { id: 'ground_wind', unit: 'm/s', lo: -Infinity, hi: 15, decimals: 1, min: 0, max: 25 },
  // 2 Liquid-oxygen temperature in the tank (LOX boils near 90 K at sea-level pressure).
  { id: 'lox_temp', unit: 'K', lo: 66, hi: 92, decimals: 1, min: 55, max: 100 },
  // 3 Avionics battery voltage on a 28 V bus.
  { id: 'battery_v', unit: 'V', lo: 26, hi: 32, decimals: 1, min: 22, max: 34 },
  // 4 Nearest lightning: a lower limit only (about 10 nautical miles).
  { id: 'lightning_km', unit: 'km', lo: 18.5, hi: Infinity, decimals: 1, min: 0, max: 60 },
  // 5 Fuel-tank ullage pressure.
  { id: 'fuel_press', unit: 'kPa', lo: 230, hi: 290, decimals: 0, min: 180, max: 330 },
  // 6 Hydraulic supply pressure of the engine gimbals.
  { id: 'hydraulic', unit: 'MPa', lo: 19, hi: 23, decimals: 1, min: 15, max: 26 },
  // 7 Avionics bay temperature.
  { id: 'avionics_temp', unit: '°C', lo: 5, hi: 40, decimals: 0, min: -10, max: 55 },
];

export const DEFAULTS = {
  /** Answer window, s (data). */
  answer_window_s: 5,
  /** Readings per console (data). */
  readings_per_console: 3,
  /**
   * Relay turn length, ms (game value), used only when neither `turnMs` nor the run length is
   * known; otherwise the turn is `turnMs`, else durationMs / slots.
   */
  turnMs: 7500,
  /** Perfect: the right call within this fraction of the window (game value). */
  perfect_fraction: 0.5,
} as const;

export interface Mg07Config {
  turnMs: number;
  windowMs: number;
  perfectMs: number;
  oneButton: boolean;
  /** One button: how long each of GO / NO-GO stays highlighted, ms. */
  highlightMs: number;
  /** Show the gauge bars (hidden for Flight Director: numbers only). */
  showGauges: boolean;
  readings: number;
}

/**
 * Standard window: answer_window_s × difficulty (Cadet ×1.25, Flight Director ×0.8); Relaxed
 * and One-button ×1.5; never longer than the turn. Highlight period 1.1 s (Cadet 1.4 s,
 * Flight Director 0.9 s). All game values except the 5 s of the data.
 */
export function resolveConfig(params: MgMap, mode: MinigameMode, assist: AssistLevel, durationMs?: number): Mg07Config {
  // Without a host `turnMs`, the relay shares the run equally: durationMs / slots.
  const { slots } = slotOf(params);
  const fallback = durationMs && durationMs > 0 ? durationMs / Math.max(1, slots) : DEFAULTS.turnMs;
  const turnMs = numParam(params, 'turnMs', fallback, 1000, 60_000);
  const base = numParam(params, 'answer_window_s', DEFAULTS.answer_window_s, 0.5, 60) * 1000;
  const factor = assistFactor(assist, 1.25, 0.8) * (mode === 'STANDARD' ? 1 : 1.5);
  const windowMs = Math.min(turnMs, base * factor);
  return {
    turnMs,
    windowMs,
    perfectMs: windowMs * clamp(numParam(params, 'perfect_fraction', DEFAULTS.perfect_fraction, 0.05, 1), 0.05, 1),
    oneButton: mode === 'ONE_BUTTON',
    highlightMs: 1100 * assistFactor(assist, 1.4 / 1.1, 0.9 / 1.1),
    showGauges: assist !== 'FLIGHT_DIRECTOR',
    readings: intParam(params, 'readings_per_console', DEFAULTS.readings_per_console, 1, 6),
  };
}

export interface Reading {
  channel: number;
  value: number;
  lo: number;
  hi: number;
}

export function inLimits(r: Reading): boolean {
  return r.value >= r.lo && r.value <= r.hi;
}

/** The right call for a set of readings. */
export function rightCall(readings: readonly Reading[]): 'GO' | 'NOGO' {
  return readings.every(inLimits) ? 'GO' : 'NOGO';
}

const round = (v: number, d: number) => Math.round(v * 10 ** d) / 10 ** d;

/**
 * This player's readings: from the per-player params when they are complete parallel arrays,
 * otherwise generated from the seed and slot (about 40 % of consoles NO-GO, values in limits
 * often close to an edge so the numbers must be read).
 */
export function readingsFor(params: MgMap, seed: number, count: number): Reading[] {
  const ch = numArrayParam(params, 'channels');
  const va = numArrayParam(params, 'values');
  const lo = numArrayParam(params, 'limits_lo');
  const hi = numArrayParam(params, 'limits_hi');
  if (ch && va && lo && hi && va.length >= ch.length && lo.length >= ch.length && hi.length >= ch.length) {
    return ch.map((c, i) => ({ channel: clamp(Math.round(c), 0, CHANNELS.length - 1), value: va[i]!, lo: lo[i]!, hi: hi[i]! }));
  }
  const { slot } = slotOf(params);
  const rnd = mulberry32(subSeed(seed, 700 + slot));
  const pool = CHANNELS.map((_, i) => i);
  const picked: number[] = [];
  for (let i = 0; i < Math.min(count, pool.length); i++) picked.push(pool.splice(Math.floor(rnd() * pool.length), 1)[0]!);
  const nogo = rnd() < 0.4;
  const bad = new Set<number>();
  if (nogo) {
    bad.add(Math.floor(rnd() * picked.length));
    if (picked.length > 1 && rnd() < 0.2) bad.add(Math.floor(rnd() * picked.length));
  }
  return picked.map((c, i) => {
    const chn = CHANNELS[c]!;
    const step = 10 ** -chn.decimals;
    const lo = chn.lo;
    const hi = chn.hi;
    const loE = Number.isFinite(lo) ? lo : chn.min;
    const hiE = Number.isFinite(hi) ? hi : chn.max;
    const span = hiE - loE;
    let v: number;
    if (bad.has(i)) {
      // Out of limits by 6–25 % of the span, on a side that has a limit.
      const sides: number[] = [];
      if (Number.isFinite(lo)) sides.push(-1);
      if (Number.isFinite(hi)) sides.push(1);
      const side = sides[Math.floor(rnd() * sides.length)]!;
      const m = Math.max(step * 2, span * (0.06 + 0.19 * rnd()));
      v = side < 0 ? lo - m : hi + m;
      v = round(v, chn.decimals);
      if (side < 0 && v >= lo) v = lo - step;
      if (side > 0 && v <= hi) v = hi + step;
    } else {
      // Inside: half the time near an edge (3–15 % in), else anywhere in the middle.
      const near = rnd() < 0.5;
      const f = near ? (rnd() < 0.5 ? 0.03 + 0.12 * rnd() : 0.85 + 0.12 * rnd()) : 0.2 + 0.6 * rnd();
      v = round(loE + f * span, chn.decimals);
      v = clamp(v, Number.isFinite(lo) ? lo + step : -Infinity, Number.isFinite(hi) ? hi - step : Infinity);
      v = round(v, chn.decimals);
    }
    return { channel: c, value: v, lo, hi };
  });
}

export interface CrewCall {
  /** When the console answered, ms into its own turn; null = no answer. */
  atMs: number | null;
  go: boolean;
}

export interface Mg07Score {
  success: boolean;
  perfect: boolean;
  score: number;
}

/** Turn start of a slot: slot × turnMs (protocol RELAY), kept inside the run. */
export function turnStartMs(slot: number, turnMs: number, durationMs: number): number {
  const start = slot * turnMs;
  return start + 500 > durationMs ? Math.max(0, durationMs - turnMs) : start;
}

/** Input `k`: `go`, `nogo` (two buttons) or `p` (one button: the highlighted answer). */
export class Mg07Sim extends StepSim {
  readonly config: Mg07Config;
  readonly readings: Reading[];
  readonly right: 'GO' | 'NOGO';
  readonly slot: number;
  readonly slots: number;
  readonly startMs: number;
  readonly crew: CrewCall[];
  answer: 'GO' | 'NOGO' | null = null;
  /** Answer time from the start of the turn, ms. */
  answerMs = -1;
  timedOut = false;

  constructor(config: Mg07Config, params: MgMap, seed: number, durationMs: number) {
    super(durationMs);
    this.config = config;
    const { slot, slots } = slotOf(params);
    this.slot = slot;
    this.slots = Math.max(slots, slot + 1);
    this.startMs = turnStartMs(slot, config.turnMs, this.durationMs);
    this.readings = readingsFor(params, seed, config.readings);
    this.right = rightCall(this.readings);
    const rnd = mulberry32(subSeed(seed, 900 + slot));
    this.crew = Array.from({ length: this.slots }, () => {
      const answered = rnd() > 0.05;
      return { atMs: answered ? Math.round(1200 + 2600 * rnd()) : null, go: rnd() < 0.72 };
    });
  }

  /** Last moment an answer counts, ms of play. */
  get deadlineMs(): number {
    return Math.min(this.durationMs, this.startMs + this.config.windowMs);
  }

  get myTurn(): boolean {
    return this.timeMs >= this.startMs;
  }

  /** Answer highlighted at play time `ms` in one-button mode. */
  highlighted(ms: number): 'GO' | 'NOGO' {
    const k = Math.floor(Math.max(0, ms - this.startMs) / this.config.highlightMs);
    return k % 2 === 0 ? 'GO' : 'NOGO';
  }

  protected apply(input: SimInput): void {
    if (this.answer || this.timedOut) return;
    if (input.t < this.startMs) return;
    if (input.t > this.deadlineMs + 1e-6) return;
    let a: 'GO' | 'NOGO' | null = null;
    if (input.k === 'p' && this.config.oneButton) a = this.highlighted(input.t);
    else if ((input.k === 'go' || input.k === 'nogo') && !this.config.oneButton) a = input.k === 'go' ? 'GO' : 'NOGO';
    if (!a) return;
    this.answer = a;
    this.answerMs = input.t - this.startMs;
    this.ended = true;
  }

  protected tick(): void {
    if (!this.answer && this.timeMs > this.deadlineMs + 1e-6) {
      this.timedOut = true;
      this.ended = true;
    }
  }

  score(): Mg07Score {
    const success = this.answer !== null && this.answer === this.right && this.answerMs <= this.config.windowMs + 1e-6;
    const perfect = success && this.answerMs <= this.config.perfectMs + 1e-6;
    const score = success ? 0.6 + 0.4 * clamp(1 - this.answerMs / this.config.windowMs, 0, 1) : 0;
    return { success, perfect, score };
  }
}

export function newSim(config: Mg07Config, params: MgMap, seed: number, durationMs: number): Mg07Sim {
  return new Mg07Sim(config, params, seed, durationMs);
}

/** Scripted player: answers `call` (default the right one) `afterMs` into the turn. */
export function answerInputs(sim: Mg07Sim, afterMs: number, call?: 'GO' | 'NOGO'): SimInput[] {
  const want = call ?? sim.right;
  const t = sim.startMs + afterMs;
  if (!sim.config.oneButton) return [{ t, k: want === 'GO' ? 'go' : 'nogo' }];
  // One button: press 120 ms into (or after `t` within) the first highlight of the wanted answer.
  const hl = sim.config.highlightMs;
  for (let k = Math.floor(Math.max(0, t - sim.startMs) / hl); k < 200; k++) {
    if ((k % 2 === 0 ? 'GO' : 'NOGO') !== want) continue;
    const segStart = sim.startMs + k * hl;
    const at = Math.max(t, segStart + 120);
    if (at <= segStart + hl - 120) return [{ t: at, k: 'p' }];
  }
  return [];
}
