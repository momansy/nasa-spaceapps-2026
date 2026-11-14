// MG-08b Propellant Loading: tank level, fill valve, boil-off, the target band and scoring.
// Pure: no DOM, no clocks, no Math.random. Same seed + params + time-stamped inputs → same run.
//
// What is physical and what is a game simplification
// ---------------------------------------------------
// PHYSICAL (qualitative): super-cold propellant boils off continuously, so the tank is
//   "topped off" until just before launch; loading goes fast fill → slow fill → topping; filling
//   a full tank with the valve open over-pressurises it (the relief valve has to vent).
// GAME VALUES: every number below. Levels are fractions of the tank; rates in % of the tank per
//   second. The last minutes of a real loading are squeezed into 20 s of play.
//   Valve: 6 steps of 0.6 %/s each, following the command with a 0.5 s lag.
//   Boil-off: 0.30–0.40 %/s (seeded) with a ±8 % seeded wobble.
//   Phases and target bands of the net fill rate (fill − boil-off):
//     fast fill   level < 90 %      1.8 … 3.2 %/s
//     slow fill   90 % … 99 %       0.8 … 1.8 %/s
//     topping     ≥ 99 %           −0.45 … 0.35 %/s (keep it full)
//   Relief level 100 %: reaching it with the valve open is an overpressure event.
//   Start level 70–76 % (seeded).
// SIMPLIFICATIONS: one tank, no pressurisation or temperature model, boil-off as a rate.
import type { AssistLevel, MgMap, MinigameMode } from '@protocol';
import { assistFactor, boolParam, clamp, modeFactor, mulberry32, numParam, STEP_HZ, StepSim, type SimInput } from '../MG-09/shared/core';

export const DEFAULTS = {
  /** Success: tank at least this full at T−0 (data). */
  fill_fraction_min: 0.99,
  /** Overpressure is not allowed (data). */
  overpressure_allowed: false,
  /** Perfect: success and the net rate in its band at least this fraction of the time (game value). */
  perfect_in_band_min: 0.7,
} as const;

export const VALVE_STEPS = 6;
/** Fill rate of one valve step, fraction of the tank per second. */
export const STEP_RATE = 0.006;
const VALVE_LAG_S = 0.5;
export const RELIEF = 1.0;
/** One-button: fill rate with the valve held open, fraction per second (like 4 steps). */
const ONE_BUTTON_RATE = 0.024;

export type Phase = 'fast' | 'slow' | 'top';

export interface Band {
  lo: number;
  hi: number;
}

export interface Mg08bConfig {
  fillMin: number;
  overpressureAllowed: boolean;
  perfectInBandMin: number;
  boilScale: number;
  bandScale: number;
  oneButton: boolean;
  holdToToggle: boolean;
  /** Level where the phases change, fractions. */
  slowAt: number;
  topAt: number;
}

/**
 * Relaxed: band width ×1.5, boil-off ×0.6. Cadet: band ×1.25, boil-off ×0.8. Flight Director:
 * band ×0.8, boil-off ×1.25. Game values.
 */
export function resolveConfig(params: MgMap, mode: MinigameMode, assist: AssistLevel): Mg08bConfig {
  const fillMin = numParam(params, 'fill_fraction_min', DEFAULTS.fill_fraction_min, 0.5, 1);
  return {
    fillMin,
    overpressureAllowed: boolParam(params, 'overpressure_allowed', DEFAULTS.overpressure_allowed),
    perfectInBandMin: numParam(params, 'perfect_in_band_min', DEFAULTS.perfect_in_band_min, 0, 1),
    boilScale: assistFactor(assist, 0.8, 1.25) * modeFactor(mode, 0.6),
    bandScale: assistFactor(assist, 1.25, 0.8) * modeFactor(mode, 1.5),
    oneButton: mode === 'ONE_BUTTON',
    holdToToggle: params['hold_to_toggle'] === true,
    slowAt: 0.9,
    topAt: fillMin,
  };
}

const BASE_BANDS: Record<Phase, Band> = {
  fast: { lo: 0.018, hi: 0.032 },
  slow: { lo: 0.008, hi: 0.018 },
  top: { lo: -0.0045, hi: 0.0035 },
};

export function phaseOf(level: number, config: Pick<Mg08bConfig, 'slowAt' | 'topAt'>): Phase {
  return level >= config.topAt ? 'top' : level >= config.slowAt ? 'slow' : 'fast';
}

/** Target band of the net fill rate for a phase, scaled about its centre. */
export function bandOf(phase: Phase, config: Pick<Mg08bConfig, 'bandScale'>): Band {
  const b = BASE_BANDS[phase];
  const c = (b.lo + b.hi) / 2;
  const h = ((b.hi - b.lo) / 2) * config.bandScale;
  return { lo: c - h, hi: c + h };
}

export interface Mg08bScore {
  success: boolean;
  perfect: boolean;
  score: number;
}

/** Success: level at T−0 ≥ fill_fraction_min and no overpressure (unless allowed). */
export function scoreFill(levelEnd: number, overpressure: boolean, inBandFraction: number, level0: number, config: Pick<Mg08bConfig, 'fillMin' | 'overpressureAllowed' | 'perfectInBandMin'>): Mg08bScore {
  const full = levelEnd >= config.fillMin - 1e-9;
  const safe = config.overpressureAllowed || !overpressure;
  const success = full && safe;
  const perfect = success && inBandFraction >= config.perfectInBandMin - 1e-9;
  const progress = clamp((levelEnd - level0) / Math.max(1e-6, config.fillMin - level0), 0, 1);
  const score = success ? 0.5 + 0.5 * clamp(inBandFraction, 0, 1) : 0.45 * progress * (safe ? 1 : 0.5);
  return { success, perfect, score };
}

/**
 * Inputs: `v` valve step change by `v` (±1, Standard / Relaxed); `s` set the valve to `v` steps;
 * `h` one-button state (`v` 1 pressed, 0 released).
 */
export class Mg08bSim extends StepSim {
  readonly config: Mg08bConfig;
  readonly level0: number;
  level: number;
  /** Commanded valve steps (0…6) and the flow the valve delivers now, fraction/s. */
  valve = 0;
  flow = 0;
  /** Boil-off now, fraction/s. */
  boil: number;
  /** Net rate smoothed over about a second (what the band is judged on), fraction/s. */
  netSmooth = 0;
  overpressure = false;
  /** Step at which the overpressure happened (−1 none). */
  overpressureStep = -1;
  inBandSteps = 0;
  readonly levelHistory: Float32Array;
  readonly bandHistory: Int8Array;
  private readonly boil0: number;
  private readonly wobble: Array<{ f: number; p: number }>;
  private pressed = false;
  private latched = false;

  constructor(config: Mg08bConfig, seed: number, durationMs: number) {
    super(durationMs);
    this.config = config;
    const rnd = mulberry32(seed ^ 0x08b08b);
    this.level0 = 0.7 + 0.06 * rnd();
    this.level = this.level0;
    this.boil0 = (0.003 + 0.001 * rnd()) * config.boilScale;
    this.wobble = [
      { f: 0.31 + 0.2 * rnd(), p: rnd() * Math.PI * 2 },
      { f: 0.83 + 0.4 * rnd(), p: rnd() * Math.PI * 2 },
    ];
    this.boil = this.boilAt(0);
    this.netSmooth = -this.boil;
    this.levelHistory = new Float32Array(this.totalSteps + 1);
    this.bandHistory = new Int8Array(this.totalSteps + 1);
    this.levelHistory[0] = this.level;
  }

  boilAt(tS: number): number {
    let w = 0;
    for (const x of this.wobble) w += Math.sin(2 * Math.PI * x.f * tS + x.p);
    return this.boil0 * (1 + 0.04 * w);
  }

  get phase(): Phase {
    return phaseOf(this.level, this.config);
  }

  get band(): Band {
    return bandOf(this.phase, this.config);
  }

  /** −1 below the band, 0 in, +1 above. */
  get zone(): -1 | 0 | 1 {
    const b = this.band;
    return this.netSmooth < b.lo ? -1 : this.netSmooth > b.hi ? 1 : 0;
  }

  get inBandFraction(): number {
    return this.step === 0 ? 1 : this.inBandSteps / this.step;
  }

  /** Valve open in the one-button mode (after hold-to-toggle). */
  get buttonOpen(): boolean {
    return this.config.holdToToggle ? this.latched : this.pressed;
  }

  protected apply(input: SimInput): void {
    if (this.config.oneButton) {
      if (input.k !== 'h') return;
      const down = (input.v ?? 0) > 0;
      if (this.config.holdToToggle && down && !this.pressed) this.latched = !this.latched;
      this.pressed = down;
      return;
    }
    if (input.k === 'v') this.valve = clamp(Math.round(this.valve + (input.v ?? 0)), 0, VALVE_STEPS);
    else if (input.k === 's') this.valve = clamp(Math.round(input.v ?? 0), 0, VALVE_STEPS);
  }

  /** Flow the valve is commanded to deliver now, fraction/s. */
  get commanded(): number {
    return this.config.oneButton ? (this.buttonOpen ? ONE_BUTTON_RATE : 0) : this.valve * STEP_RATE;
  }

  protected tick(): void {
    const dt = 1 / STEP_HZ;
    const tS = this.step * dt;
    const k = 1 - Math.exp(-dt / VALVE_LAG_S);
    this.flow += (this.commanded - this.flow) * k;
    this.boil = this.boilAt(tS);
    const net = this.flow - this.boil;
    this.level += net * dt;
    // Relief level: filling past it with the valve open is an overpressure event; the relief
    // valve vents the excess.
    if (this.level >= RELIEF) {
      if (this.commanded > 0) {
        if (!this.overpressure) this.overpressureStep = this.step;
        this.overpressure = true;
      }
      this.level = RELIEF;
    }
    this.level = Math.max(0, this.level);
    const ks = 1 - Math.exp(-dt / 0.8);
    this.netSmooth += (net - this.netSmooth) * ks;
    const z = this.zone;
    if (z === 0) this.inBandSteps++;
    this.bandHistory[this.step] = z;
    this.levelHistory[this.step + 1] = this.level;
  }

  score(): Mg08bScore {
    return scoreFill(this.level, this.overpressure, this.inBandSteps / this.totalSteps, this.level0, this.config);
  }
}

export function newSim(config: Mg08bConfig, seed: number, durationMs: number): Mg08bSim {
  return new Mg08bSim(config, seed, durationMs);
}

/** Valve steps whose net rate is closest to the middle of the band for the current level. */
export function autoValve(sim: Mg08bSim, levelAhead = 0): number {
  const level = sim.level + levelAhead;
  const ph = phaseOf(level, sim.config);
  const b = bandOf(ph, sim.config);
  const want = (b.lo + b.hi) / 2 + sim.boil;
  // Topping: a trickle while below 99.4 %, closed above (well clear of the relief level).
  if (ph === 'top') return level < 0.994 ? 1 : 0;
  return clamp(Math.round(want / STEP_RATE), 0, VALVE_STEPS);
}

/**
 * Scripted player that taps the valve towards `autoValve`, checked every `everyMs`, reacting
 * `lagMs` late. Produces time-stamped inputs while it runs a private copy of the simulation.
 */
export function scriptedValve(make: () => Mg08bSim, everyMs = 250, lagMs = 150): SimInput[] {
  const sim = make();
  const out: SimInput[] = [];
  for (let t = 0; !sim.done; t += everyMs) {
    sim.advanceTo(t);
    const want = autoValve(sim, 0.002);
    let cur = sim.valve;
    while (cur !== want) {
      const d = want > cur ? 1 : -1;
      cur += d;
      const i = { t: t + lagMs, k: 'v', v: d };
      out.push(i);
      sim.push(i);
    }
  }
  return out;
}

/** Scripted one-button player: holds while below the middle of the band, with a reaction lag. */
export function scriptedHold(make: () => Mg08bSim, everyMs = 200, lagMs = 120): SimInput[] {
  const sim = make();
  const out: SimInput[] = [];
  let held = false;
  for (let t = 0; !sim.done; t += everyMs) {
    sim.advanceTo(t);
    const b = sim.band;
    const mid = (b.lo + b.hi) / 2;
    let want = sim.netSmooth < mid;
    if (sim.level >= 0.994) want = false;
    if (sim.config.holdToToggle) {
      if (want !== sim.buttonOpen) {
        const a = { t: t + lagMs, k: 'h', v: 1 };
        const b2 = { t: t + lagMs + 60, k: 'h', v: 0 };
        out.push(a, b2);
        sim.push(a);
        sim.push(b2);
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
