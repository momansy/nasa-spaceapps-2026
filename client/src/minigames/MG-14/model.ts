// MG-14 Debris Dodge: simulation and scoring. Pure: no DOM, no clock, no Math.random.
//
// A conjunction warning: a tracked debris object will pass close at the time of closest
// approach (TCA). Choose a burn direction (prograde, retrograde, radial out, radial in) and a
// duration; the predicted position at TCA moves and the collision probability gauge answers.
// Δv_min is the smallest option on the menu that clears the threshold. Success: a safe miss
// with Δv ≤ `delta_v_ratio_max` × Δv_min; perfect: Δv = Δv_min. Overburning wastes fuel.
//
// What is physical and what is a game simplification
// ---------------------------------------------------
// PHYSICAL
//   μ⊕ = 3.986 × 10¹⁴ m³/s² and R⊕ = 6 371 km (core PhysicalConstants.cs, which wins over the
//   3.986004418 × 10¹⁴ of the brief), mean motion n = √(μ / r³) of a circular orbit.
//   Clohessy–Wiltshire (Hill) linearisation for an impulse Δv = (radial Δvx, along-track Δvy)
//   applied a time T before TCA, relative to the unburned orbit:
//     x(T) = (Δvx / n) sin nT + (2 Δvy / n)(1 − cos nT)                     radial, m
//     y(T) = (2 Δvx / n)(cos nT − 1) + (Δvy / n)(4 sin nT − 3 n T)          along-track, m
//   For a tangential burn the along-track drift grows like 3 Δv T; a radial burn gives much
//   less (it only oscillates). A prograde burn raises the orbit, so the spacecraft falls behind.
// REAL-WORLD APPROXIMATE
//   Collision probability of a small object, 2-D Gaussian in the encounter plane:
//     Pc ≈ R² / (2 σr σt) · exp(−½ (x² / σr² + y² / σt²))
//   with a hard-body radius R and position uncertainties σr (radial) < σt (along-track: tracking
//   uncertainty is largest along the track). A threshold of 1 in 10 000 (10⁻⁴) is of the order
//   real operators use to decide on a manoeuvre.
// GAME SIMPLIFICATIONS (game values)
//   • The miss is measured in the radial / along-track plane at TCA; real encounter geometry
//     depends on the relative velocity. σr, σt, R, the 400 km orbit, the thruster acceleration
//     (0.04 m/s²), the duration menu, the lead time (0.4–0.9 orbit) and the seeded nominal miss.
//   • A burn of a few seconds is treated as an impulse.
import type { AssistLevel, MgMap, MinigameMode } from '@protocol';
import type { MinigameResult } from '../types';
import { assistFactor, clamp, DT_S, mulberry32, numParam, STEP_HZ } from '../MG-13/kit';

/** Earth's gravitational parameter, m³/s² (physical; value of core PhysicalConstants.cs). */
export const MU_EARTH = 3.986e14;
/** Earth mean radius, m (physical). */
export const R_EARTH_M = 6_371_000;
/** Orbit altitude of the conjunction, m (game value: a typical low orbit). */
export const ALTITUDE_M = 400_000;
/** Thruster acceleration, m/s² (game value). */
export const THRUST_MS2 = 0.04;
/** Burn duration menu, s: 0.5 s to 8 s in 0.5 s steps (game value). */
export const DURATIONS_S: readonly number[] = Array.from({ length: 16 }, (_, i) => (i + 1) * 0.5);

export const DEFAULTS = {
  /** Success: Δv at most this multiple of Δv_min (data/minigames.json: 1.2). */
  delta_v_ratio_max: 1.2,
  /** Collision probability threshold (real-world approximate order of magnitude). */
  pc_threshold: 1e-4,
} as const;

export type Dir = 'prograde' | 'retrograde' | 'radial_out' | 'radial_in';
export const DIRS: readonly Dir[] = ['prograde', 'retrograde', 'radial_out', 'radial_in'];

/** PHYSICAL: mean motion of a circular orbit of radius `rM`, rad/s. */
export function meanMotion(rM: number): number {
  return Math.sqrt(MU_EARTH / (rM * rM * rM));
}

/** PHYSICAL: Clohessy–Wiltshire displacement `tS` after an impulse (radial dvx, along-track dvy), m. */
export function cwDisplacement(n: number, dvx: number, dvy: number, tS: number): { x: number; y: number } {
  const nt = n * tS;
  const s = Math.sin(nt);
  const c = Math.cos(nt);
  return {
    x: (dvx / n) * s + ((2 * dvy) / n) * (1 - c),
    y: ((2 * dvx) / n) * (c - 1) + (dvy / n) * (4 * s - 3 * nt),
  };
}

/** Radial and along-track components of a unit burn in `dir`. */
export function dirVector(dir: Dir): { x: number; y: number } {
  switch (dir) {
    case 'prograde':
      return { x: 0, y: 1 };
    case 'retrograde':
      return { x: 0, y: -1 };
    case 'radial_out':
      return { x: 1, y: 0 };
    case 'radial_in':
      return { x: -1, y: 0 };
  }
}

/** REAL-WORLD APPROXIMATE: collision probability for a miss (x radial, y along-track), 0–1. */
export function collisionProbability(xM: number, yM: number, sigmaR: number, sigmaT: number, hardBodyM: number): number {
  const k = (hardBodyM * hardBodyM) / (2 * sigmaR * sigmaT);
  return Math.min(1, k * Math.exp(-0.5 * ((xM * xM) / (sigmaR * sigmaR) + (yM * yM) / (sigmaT * sigmaT))));
}

export interface Mg14Config {
  ratioMax: number;
  pcThreshold: number;
  sigmaR: number;
  sigmaT: number;
  hardBodyM: number;
  /** Fraction of the run for choosing; the burn result may use the rest of `durationMs`. */
  chooseFraction: number;
  /** Relaxed and One-button show a short list instead of the full menu. */
  shortList: boolean;
  oneButton: boolean;
  /** One-button: time each option stays highlighted, s. */
  cycleS: number;
}

/**
 * Host parameters + mode + difficulty → configuration. Relaxed: 97 % of the run to choose and
 * the options as a short list. One-button: the short list, highlighted in turn every 1.3 s
 * (Cadet 1.6 s, Flight Director 1.1 s). Difficulty changes the uncertainty: Cadet σ × 0.8 (the
 * threshold is easier to clear and the options differ more), Flight Director σ × 1.2, and the
 * time to choose: Cadet × 1.15, Flight Director × 0.85 (Standard and One-button).
 */
export function resolveConfig(params: MgMap, mode: MinigameMode, assist: AssistLevel): Mg14Config {
  const sig = assistFactor(assist, 0.8, 1.2);
  return {
    ratioMax: numParam(params, 'delta_v_ratio_max', DEFAULTS.delta_v_ratio_max, 1, 5),
    pcThreshold: numParam(params, 'pc_threshold', DEFAULTS.pc_threshold, 1e-5, 1e-3),
    sigmaR: 100 * sig,
    sigmaT: 500 * sig,
    hardBodyM: 20,
    // Time to choose: Cadet × 1.15, Flight Director × 0.85 of the 75 % Standard deadline.
    chooseFraction: mode === 'RELAXED' ? 0.97 : 0.75 * assistFactor(assist, 1.15, 0.85),
    shortList: mode !== 'STANDARD',
    oneButton: mode === 'ONE_BUTTON',
    cycleS: assist === 'CADET' ? 1.6 : assist === 'FLIGHT_DIRECTOR' ? 1.1 : 1.3,
  };
}

export interface BurnOption {
  dir: Dir;
  durS: number;
  dvMs: number;
  /** Predicted miss at TCA, m, and its collision probability. */
  x: number;
  y: number;
  pc: number;
  clears: boolean;
}

export interface Scenario {
  /** Mean motion, rad/s, orbital period, s. */
  n: number;
  periodS: number;
  /** Burn lead time before TCA, s. */
  leadS: number;
  /** Miss without a burn (radial, along-track), m, and its probability. */
  x0: number;
  y0: number;
  pc0: number;
  /** Δv_min and the option(s) that achieve it. */
  dvMin: number;
  best: BurnOption;
  /** Relaxed / One-button list, sorted by Δv. */
  shortList: BurnOption[];
}

export function evaluate(config: Mg14Config, sc: Pick<Scenario, 'n' | 'leadS' | 'x0' | 'y0'>, dir: Dir, durS: number): BurnOption {
  const dv = THRUST_MS2 * durS;
  const u = dirVector(dir);
  const d = cwDisplacement(sc.n, u.x * dv, u.y * dv, sc.leadS);
  const x = sc.x0 + d.x;
  const y = sc.y0 + d.y;
  const pc = collisionProbability(x, y, config.sigmaR, config.sigmaT, config.hardBodyM);
  return { dir, durS, dvMs: dv, x, y, pc, clears: pc < config.pcThreshold };
}

/** Smallest Δv option on the menu that clears, or null. */
export function findBest(config: Mg14Config, sc: Pick<Scenario, 'n' | 'leadS' | 'x0' | 'y0'>): BurnOption | null {
  for (const dur of DURATIONS_S) {
    let best: BurnOption | null = null;
    for (const dir of DIRS) {
      const o = evaluate(config, sc, dir, dur);
      if (o.clears && (!best || o.pc < best.pc)) best = o;
    }
    if (best) return best;
  }
  return null;
}

/**
 * Builds the conjunction from the seed: lead time 0.4–0.9 orbit, a nominal miss inside the
 * uncertainty, and a menu where Δv_min is between 1 s and 5 s of burn (re-drawn until so).
 */
export function createScenario(config: Mg14Config, seed: number): Scenario {
  const rnd = mulberry32(seed ^ 0x14d0);
  const n = meanMotion(R_EARTH_M + ALTITUDE_M);
  const periodS = (2 * Math.PI) / n;
  for (let attempt = 0; ; attempt++) {
    const leadS = periodS * (0.4 + 0.5 * rnd());
    const x0 = (rnd() * 2 - 1) * 0.7 * config.sigmaR;
    const y0 = (rnd() * 2 - 1) * 0.7 * config.sigmaT;
    const base = { n, leadS, x0, y0 };
    const pc0 = collisionProbability(x0, y0, config.sigmaR, config.sigmaT, config.hardBodyM);
    const best = findBest(config, base);
    const ok = pc0 >= config.pcThreshold * 1.5 && best && best.durS >= 1 && best.durS <= 6;
    // Re-draw until the scenario needs a burn and has one that clears (the threshold is
    // clamped to 10⁻⁵…10⁻³, where a few draws always suffice).
    if (!ok && (attempt < 400 || !best || pc0 < config.pcThreshold)) continue;
    const b = best!;
    return { n, periodS, leadS, x0, y0, pc0, dvMin: b.dvMs, best: b, shortList: makeShortList(config, base, b) };
  }
}

/** Six options: just too small, the minimum, 1.2× (or the next step), wrong direction, radial, overburn. */
function makeShortList(config: Mg14Config, sc: Pick<Scenario, 'n' | 'leadS' | 'x0' | 'y0'>, best: BurnOption): BurnOption[] {
  const i = DURATIONS_S.indexOf(best.durS);
  const at = (k: number) => DURATIONS_S[clamp(k, 0, DURATIONS_S.length - 1)]!;
  const opposite: Record<Dir, Dir> = { prograde: 'retrograde', retrograde: 'prograde', radial_out: 'radial_in', radial_in: 'radial_out' };
  const radial: Dir = best.dir === 'radial_out' || best.dir === 'radial_in' ? 'prograde' : 'radial_out';
  const list = [
    evaluate(config, sc, best.dir, at(i - 1)),
    best,
    evaluate(config, sc, best.dir, at(i + 1)),
    evaluate(config, sc, opposite[best.dir], best.durS),
    evaluate(config, sc, radial, at(i + 2)),
    evaluate(config, sc, best.dir, at(i + 5)),
  ];
  // Unique, sorted by Δv then direction order.
  const seen = new Set<string>();
  const out: BurnOption[] = [];
  for (const o of list) {
    const key = `${o.dir}:${o.durS}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(o);
  }
  return out.sort((a, b) => a.dvMs - b.dvMs || DIRS.indexOf(a.dir) - DIRS.indexOf(b.dir));
}

export interface Mg14Score {
  success: boolean;
  perfect: boolean;
  score: number;
}

/**
 * Success: the burn clears the threshold AND Δv ≤ ratioMax × Δv_min (exactly 1.2× counts).
 * Perfect: clears with Δv = Δv_min. Score: Δv_min / Δv for a clearing burn, else 0.
 */
export function scoreBurn(burn: BurnOption | null, dvMin: number, config: Pick<Mg14Config, 'ratioMax'>): Mg14Score {
  if (!burn || !burn.clears || burn.dvMs <= 0) return { success: false, perfect: false, score: 0 };
  const eps = 1e-9;
  const success = burn.dvMs <= config.ratioMax * dvMin + eps;
  const perfect = success && Math.abs(burn.dvMs - dvMin) < eps;
  return { success, perfect, score: clamp(dvMin / burn.dvMs, 0, 1) };
}

/** How long the outcome plays after the burn before play ends, s (game value). */
export const OUTCOME_S = 1.6;

export class Mg14Sim {
  readonly config: Mg14Config;
  readonly scenario: Scenario;
  /** Last step for choosing, and the hard end of the run. */
  readonly chooseSteps: number;
  readonly maxSteps: number;
  step = 0;
  /** Standard: selected direction and duration index. */
  dir: Dir = 'prograde';
  durIndex = 0;
  /** Short list: selected / highlighted row. */
  row = 0;
  burn: BurnOption | null = null;
  burnStep = -1;
  private queued = false;
  private endStep: number;

  constructor(config: Mg14Config, seed: number, runS: number) {
    this.config = config;
    this.scenario = createScenario(config, seed);
    this.maxSteps = Math.max(1, Math.round(runS * STEP_HZ));
    this.chooseSteps = Math.min(this.maxSteps, Math.round(runS * config.chooseFraction * STEP_HZ));
    this.endStep = this.chooseSteps;
  }

  get done(): boolean {
    return this.step >= this.endStep;
  }

  get timeS(): number {
    return this.step * DT_S;
  }

  /** Total steps of this run as it stands (shrinks when the burn comes early). */
  get totalSteps(): number {
    return this.endStep;
  }

  /** The option the player is looking at now. */
  get selection(): BurnOption {
    if (this.config.shortList) return this.scenario.shortList[clamp(this.row, 0, this.scenario.shortList.length - 1)]!;
    return evaluate(this.config, this.scenario, this.dir, DURATIONS_S[this.durIndex]!);
  }

  get choosing(): boolean {
    return this.burn === null && !this.done;
  }

  /** Time to TCA shown to the player, minutes of mission time (the conjunction clock). */
  get tcaMin(): number {
    return (this.scenario.leadS * (1 - 0.08 * Math.min(1, this.step / this.chooseSteps))) / 60;
  }

  selectDir(d: Dir) {
    if (this.choosing && !this.config.shortList) this.dir = d;
  }

  selectDuration(i: number) {
    if (this.choosing && !this.config.shortList) this.durIndex = clamp(Math.round(i), 0, DURATIONS_S.length - 1);
  }

  selectRow(i: number) {
    if (this.choosing && this.config.shortList && !this.config.oneButton) this.row = clamp(Math.round(i), 0, this.scenario.shortList.length - 1);
  }

  /** Burn now with the selected (or highlighted) option. */
  commit() {
    this.queued = true;
  }

  tick() {
    if (this.done) return;
    if (this.burn === null) {
      // A press applies to what was on screen when it was made, before the highlight moves on.
      if (this.queued) {
        this.burn = this.selection;
        this.burnStep = this.step;
        this.endStep = Math.min(this.maxSteps, this.step + Math.round(OUTCOME_S * STEP_HZ));
      }
    }
    this.queued = false;
    this.step++;
    if (this.burn === null && this.config.oneButton) {
      const per = Math.max(1, Math.round(this.config.cycleS * STEP_HZ));
      this.row = Math.floor(this.step / per) % this.scenario.shortList.length;
    }
  }

  score(): Mg14Score {
    return scoreBurn(this.burn, this.scenario.dvMin, this.config);
  }

  result(): MinigameResult {
    const s = this.score();
    return { success: s.success, perfect: s.perfect, score: s.score };
  }
}

/**
 * Scripted good player: studies the options for a moment, picks the smallest clearing one
 * (Standard: walks the direction and the duration there one step at a time), then burns.
 * One-button: after the same look, presses while the smallest clearing option is highlighted.
 */
export class Mg14Autopilot {
  constructor(private readonly thinkS = 2.2) {}

  apply(sim: Mg14Sim) {
    if (!sim.choosing) return;
    const best = sim.scenario.best;
    if (sim.config.oneButton) {
      if (sim.timeS >= this.thinkS && sim.selection.dir === best.dir && sim.selection.durS === best.durS) sim.commit();
      return;
    }
    if (sim.timeS < this.thinkS) {
      // Looking around: first the direction, then the duration, a step every 0.15 s.
      if (sim.step % 18 !== 0) return;
      if (sim.config.shortList) {
        const want = sim.scenario.shortList.findIndex((o) => o.dir === best.dir && o.durS === best.durS);
        if (sim.row !== want) sim.selectRow(sim.row + Math.sign(want - sim.row));
        return;
      }
      if (sim.dir !== best.dir) sim.selectDir(best.dir);
      else {
        const want = DURATIONS_S.indexOf(best.durS);
        if (sim.durIndex !== want) sim.selectDuration(sim.durIndex + Math.sign(want - sim.durIndex));
      }
      return;
    }
    if (sim.selection.durS === best.durS && sim.selection.dir === best.dir) sim.commit();
  }
}

export function runScripted(config: Mg14Config, seed: number, runS: number, input: (sim: Mg14Sim) => void): Mg14Sim {
  const sim = new Mg14Sim(config, seed, runS);
  while (!sim.done) {
    input(sim);
    sim.tick();
  }
  return sim;
}
