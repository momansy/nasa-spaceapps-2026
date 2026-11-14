// MG-06 Shake Table: rules and scoring. Pure: no DOM, no clock, no Math.random.
//
// PHYSICAL
//   Base-excitation amplification of a single structural mode (single degree of freedom):
//     A(r, ζ) = 1 / √((1 − r²)² + (2 ζ r)²),  r = f / fn,  ζ = damping ratio.
//   Below resonance A → 1, at r = 1 it is 1 / (2ζ), far above it falls off.
// GAME SIMPLIFICATIONS (game values)
//   • A sine sweep from 8 Hz to 60 Hz and back, time-compressed into the play time (real tests
//     sweep wider and much more slowly); three legs (up, down, up), Relaxed two.
//   • Each player damps one mode (`slot` picks it); natural frequencies seeded from 14 to 34 Hz.
//   • The green band for the damper: from the least damping that keeps A ≤ 1.8 (the red line)
//     up to 0.12 more. Above the band the damper is "overworked" (amber), below it the mode
//     resonates (red). Damping is shown as a percentage of critical damping (ζ × 100).
//   • The team meter is the mean amplification over every mode (teammates from `env.coop`, or
//     seeded crew who track their own band with a short lag).
import type { AssistLevel, MgMap, MinigameMode } from '@protocol';
import type { MinigameResult } from '../types';
import { assistFactor, boolParam, clamp, DT_S, intParam, mulberry32, needSteps, numParam, STEP_HZ } from '../MG-02/kit';

/** Sweep range, Hz (game value). */
export const F_LO_HZ = 8;
export const F_HI_HZ = 60;
/** Red line of the amplification (game value). */
export const A_MAX = 1.8;
/** Damper travel: damping ratio 0 … 0.5 (0–50 % of critical), game value. */
export const ZETA_MAX = 0.5;

export const DEFAULTS = {
  /** Success: in green at least this fraction of play (data `in_green_fraction_min`, ≥). */
  in_green_fraction_min: 0.8,
  /** Perfect: in green at least this fraction (game value). */
  perfect_fraction_min: 0.95,
  /** Green band width, damping ratio (game value). */
  band_zeta: 0.12,
} as const;

/** PHYSICAL: base-excitation amplification of one mode. */
export function amplification(r: number, zeta: number): number {
  const a = 1 - r * r;
  const b = 2 * zeta * r;
  return 1 / Math.sqrt(a * a + b * b);
}

/** Least damping ratio that keeps A(r, ζ) ≤ aMax (0 away from resonance). */
export function zetaNeeded(r: number, aMax = A_MAX): number {
  const a = 1 - r * r;
  const rest = 1 / (aMax * aMax) - a * a;
  return rest <= 0 || r <= 0 ? 0 : Math.sqrt(rest) / (2 * r);
}

export interface Mg06Config {
  inGreenMin: number;
  perfectMin: number;
  bandZeta: number;
  /** Sweep legs over the play time (3: up, down, up). */
  legs: number;
  playS: number;
  slot: number;
  slots: number;
  oneButton: boolean;
  holdToToggle: boolean;
  /** One-button: damper travel speed, damping ratio per second. */
  autoSpeed: number;
}

/**
 * Band width: 0.12 Standard; Relaxed ×1.5 and two legs ("slower sweep, wider green");
 * One-button ×1.6; Cadet ×1.25, Flight Director ×0.8 (all game values).
 */
export function resolveConfig(params: MgMap, mode: MinigameMode, assist: AssistLevel, durationS: number): Mg06Config {
  let band = numParam(params, 'band_zeta', DEFAULTS.band_zeta, 0.03, 0.4) * assistFactor(assist, 1.25, 0.8);
  if (mode === 'RELAXED') band *= 1.5;
  if (mode === 'ONE_BUTTON') band *= 1.6;
  const success = numParam(params, 'in_green_fraction_min', DEFAULTS.in_green_fraction_min, 0.05, 1);
  const slots = intParam(params, 'slots', 1, 1, 8);
  return {
    inGreenMin: success,
    perfectMin: Math.max(success, numParam(params, 'perfect_fraction_min', DEFAULTS.perfect_fraction_min, 0.05, 1)),
    bandZeta: Math.min(band, 0.3),
    legs: mode === 'RELAXED' ? 2 : 3,
    playS: durationS,
    slot: intParam(params, 'slot', 0, 0, 7),
    slots,
    oneButton: mode === 'ONE_BUTTON',
    holdToToggle: boolParam(params, 'hold_to_toggle', false),
    autoSpeed: 0.7, // game_value: one-button damper travel per second
  };
}

/** Number of structural modes on the table: one per player, at most 4 (game value). */
export function modeCount(config: Pick<Mg06Config, 'slots'>): number {
  return clamp(config.slots, 1, 4);
}

export interface Mg06Plan {
  /** Natural frequency of each mode, Hz. */
  fnHz: number[];
  /** The mode this player damps. */
  mine: number;
  /** Damper start setting (above the resting band, so an idle player fails). */
  zeta0: number;
  /** Crew reaction lag per mode, s, and wobble phase. */
  crewLagS: number[];
  crewPhase: number[];
}

export function createPlan(config: Mg06Config, seed: number): Mg06Plan {
  const rnd = mulberry32(seed ^ 0x0606);
  const m = modeCount(config);
  const fnHz: number[] = [];
  for (let i = 0; i < m; i++) {
    const u = (i + 0.25 + rnd() * 0.5) / m;
    fnHz.push(14 * Math.pow(34 / 14, u));
  }
  return {
    fnHz,
    mine: config.slot % m,
    zeta0: 0.36 + rnd() * 0.1,
    crewLagS: fnHz.map(() => 0.3 + rnd() * 0.25),
    crewPhase: fnHz.map(() => rnd() * Math.PI * 2),
  };
}

/** Sweep frequency at play time `tS`, Hz: a triangle in log frequency over `legs` legs. */
export function sweepHz(config: Pick<Mg06Config, 'legs' | 'playS'>, tS: number): number {
  const legT = config.playS / config.legs;
  const u = clamp(tS, 0, config.playS) / legT;
  const leg = Math.min(config.legs - 1, Math.floor(u));
  const frac = u - leg;
  const x = leg % 2 === 0 ? frac : 1 - frac;
  return F_LO_HZ * Math.pow(F_HI_HZ / F_LO_HZ, x);
}

/** +1 while the sweep rises, −1 while it falls. */
export function sweepDir(config: Pick<Mg06Config, 'legs' | 'playS'>, tS: number): 1 | -1 {
  const legT = config.playS / config.legs;
  const leg = Math.min(config.legs - 1, Math.floor(clamp(tS, 0, config.playS) / legT));
  return leg % 2 === 0 ? 1 : -1;
}

/** Green band for mode `i` at play time `tS`: damping ratios [lo, hi]. */
export function band(config: Mg06Config, plan: Mg06Plan, i: number, tS: number): { lo: number; hi: number } {
  const r = sweepHz(config, tS) / plan.fnHz[i]!;
  const lo = Math.min(ZETA_MAX - config.bandZeta, zetaNeeded(r));
  return { lo, hi: lo + config.bandZeta };
}

export interface Mg06Score extends MinigameResult {
  fraction: number;
}

/** Success: in green ≥ `inGreenMin` of the steps (exactly counts). Perfect ≥ `perfectMin`. */
export function scoreRun(inGreen: number, total: number, config: Pick<Mg06Config, 'inGreenMin' | 'perfectMin'>): Mg06Score {
  if (total <= 0) return { success: false, perfect: false, score: 0, fraction: 0 };
  const success = inGreen >= needSteps(config.inGreenMin, total);
  const perfect = success && inGreen >= needSteps(config.perfectMin, total);
  const fraction = clamp(inGreen / total, 0, 1);
  return { success, perfect, score: fraction, fraction };
}

/** Where the damper is: −1 below the band (resonance), 0 in green, +1 above (overworked). */
export type Zone = -1 | 0 | 1;

export class Mg06Sim {
  readonly config: Mg06Config;
  readonly plan: Mg06Plan;
  readonly totalSteps: number;
  step = 0;
  /** This player's damper, damping ratio. */
  zeta: number;
  zone: Zone = 1;
  inGreen = 0;
  /** Damper setting of every mode (this player's included). */
  readonly zetas: Float64Array;
  /** Amplification of every mode now. */
  readonly amps: Float64Array;
  /** Teammates' settings from the host (NaN where unknown → seeded crew). */
  readonly remote: Float64Array;
  /** One-button state. */
  private autoDir = -1;
  private latched = false;
  private wasPressed = false;
  /** History of this player's damper (one sample per step) for the chart. */
  readonly history: Float32Array;

  constructor(config: Mg06Config, seed: number) {
    this.config = config;
    this.plan = createPlan(config, seed);
    this.totalSteps = Math.max(1, Math.round(config.playS * STEP_HZ));
    this.zeta = this.plan.zeta0;
    const m = this.plan.fnHz.length;
    this.zetas = new Float64Array(m);
    this.amps = new Float64Array(m);
    this.remote = new Float64Array(m).fill(NaN);
    this.history = new Float32Array(this.totalSteps);
    this.updateModes(0);
    this.zone = this.zoneOf(0);
  }

  get done(): boolean {
    return this.step >= this.totalSteps;
  }

  get timeS(): number {
    return this.step * DT_S;
  }

  get fHz(): number {
    return sweepHz(this.config, this.timeS);
  }

  /** In-green fraction so far. */
  get fraction(): number {
    return this.step === 0 ? 0 : this.inGreen / this.step;
  }

  /** The team resonance meter: mean amplification over every mode. */
  get meter(): number {
    let s = 0;
    for (let i = 0; i < this.amps.length; i++) s += this.amps[i]!;
    return s / Math.max(1, this.amps.length);
  }

  bandNow(i = this.plan.mine, tS = this.timeS) {
    return band(this.config, this.plan, i, tS);
  }

  private zoneOf(tS: number): Zone {
    const b = band(this.config, this.plan, this.plan.mine, tS);
    return this.zeta < b.lo - 1e-9 ? -1 : this.zeta > b.hi + 1e-9 ? 1 : 0;
  }

  /** Sets the damper directly (drag, keys), damping ratio. */
  setZeta(z: number) {
    if (this.config.oneButton) return;
    this.zeta = clamp(z, 0, ZETA_MAX);
  }

  /** A teammate's damper from the host (damping ratio), for the shared meter only. */
  setRemote(mode: number, zeta: number) {
    if (mode >= 0 && mode < this.remote.length && mode !== this.plan.mine) this.remote[mode] = clamp(zeta, 0, ZETA_MAX);
  }

  /** Crew stand-in: tracks its own band centre with a lag and a small wobble. */
  crewZeta(i: number, tS: number): number {
    const b = band(this.config, this.plan, i, tS - this.plan.crewLagS[i]!);
    return clamp((b.lo + b.hi) / 2 + 0.025 * Math.sin(tS * 1.7 + this.plan.crewPhase[i]!), 0, ZETA_MAX);
  }

  private updateModes(tS: number) {
    const f = sweepHz(this.config, tS);
    for (let i = 0; i < this.plan.fnHz.length; i++) {
      const z = i === this.plan.mine ? this.zeta : Number.isNaN(this.remote[i]!) ? this.crewZeta(i, tS) : this.remote[i]!;
      this.zetas[i] = z;
      this.amps[i] = amplification(f / this.plan.fnHz[i]!, z);
    }
  }

  /** One fixed step. `pressed` is the one button (ignored in the other modes). */
  tick(pressed = false): void {
    if (this.done) return;
    if (this.config.oneButton) {
      let hold = pressed;
      if (this.config.holdToToggle) {
        if (pressed && !this.wasPressed) this.latched = !this.latched;
        hold = this.latched;
      }
      this.wasPressed = pressed;
      if (!hold) {
        this.zeta += this.autoDir * this.config.autoSpeed * DT_S;
        if (this.zeta <= 0) {
          this.zeta = 0;
          this.autoDir = 1;
        } else if (this.zeta >= ZETA_MAX) {
          this.zeta = ZETA_MAX;
          this.autoDir = -1;
        }
      }
    }
    const t = (this.step + 1) * DT_S;
    this.updateModes(t);
    this.zone = this.zoneOf(t);
    if (this.zone === 0) this.inGreen++;
    this.history[this.step] = this.zeta;
    this.step++;
  }

  /** Direction the one-button damper moves when released. */
  get autoDirection(): number {
    return this.autoDir;
  }

  score(): Mg06Score {
    return scoreRun(this.inGreen, this.totalSteps, this.config);
  }

  result(): MinigameResult {
    const s = this.score();
    return { success: s.success, perfect: s.perfect, score: s.score };
  }
}

/**
 * Scripted good player (tests, demo, lab `auto=1`): aims at the centre of the band `leadS`
 * ahead with a limited hand speed. One-button: holds while the damper is well inside the band.
 */
export class Mg06Autopilot {
  constructor(
    private readonly leadS = 0.3,
    private readonly slewPerS = 1.4,
  ) {}

  /** Returns the one-button state to use for this step; moves the damper in the other modes. */
  apply(sim: Mg06Sim): boolean {
    if (sim.config.oneButton) {
      const b = sim.bandNow(sim.plan.mine, sim.timeS + 0.12);
      const m = (b.hi - b.lo) * 0.18;
      return sim.zeta >= b.lo + m && sim.zeta <= b.hi - m;
    }
    const b = sim.bandNow(sim.plan.mine, sim.timeS + this.leadS);
    const target = (b.lo + b.hi) / 2;
    const max = this.slewPerS * DT_S;
    sim.setZeta(sim.zeta + clamp(target - sim.zeta, -max, max));
    return false;
  }
}

export function runScripted(config: Mg06Config, seed: number, player: ((sim: Mg06Sim) => boolean) | null): Mg06Sim {
  const sim = new Mg06Sim(config, seed);
  while (!sim.done) sim.tick(player ? player(sim) : false);
  return sim;
}
