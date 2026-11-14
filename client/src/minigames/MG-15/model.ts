// MG-15 Solar Wing Deploy: simulation and scoring. Pure: no DOM, no clock, no Math.random.
//
// Phase 1 (cooperative split): the wings' hinges release one at a time in the order of the
// diagram. This player owns hinge `slot` and must release it inside its window: a press before
// the window opens (early) or no press before it closes (late) is out of order. Teammates'
// hinges come from `env.coop` or are simulated from the seed ("crew"); they never change this
// phone's result.
// Phase 2: the spacecraft turns; the player drives the wing so its cells face the Sun.
//
// What is physical and what is a game simplification
// ---------------------------------------------------
// PHYSICAL
//   Power from a flat panel ∝ cos θ, θ = angle between the panel normal and the Sun direction
//   (projected area); zero when the Sun is behind the panel (θ ≥ 90°).
// REAL-WORLD APPROXIMATE
//   Peak wing power 150 W: the "Deployable solar wings" part of design 7.2.1 (150 W average).
// GAME SIMPLIFICATIONS (game values)
//   • Hinge windows, the release order (alternating left and right wing, root outwards), the
//     body turn (two seeded sines), the wing-drive speed limit, the tolerance and the 80 % /
//     95 % thresholds. Real deployments are commanded by the spacecraft, not by hand.
//   • Sun-pointing is in one plane: the drive rotates the wing about its long axis.
import type { AssistLevel, MgMap, MinigameMode } from '@protocol';
import type { MinigameResult } from '../types';
import { assistFactor, clamp, DT_S, intParam, mulberry32, needSteps, numParam, STEP_HZ, wrapDeg } from '../MG-13/kit';

export const DEFAULTS = {
  /** Success: Sun-pointing at least this fraction of phase 2 (data/minigames.json: 0.8). */
  sun_pointing_fraction_min: 0.8,
  /** Perfect: Sun-pointing at least this fraction (game value). */
  perfect_fraction_min: 0.95,
  /** "Sun-pointing" means |θ| ≤ this, degrees (game value). */
  pointing_tolerance_deg: 15,
  /** Peak power of the wing, W (real-world approximate: the part's 150 W). */
  peak_power_w: 150,
} as const;

/** Most hinges drawn: two wings × three hinges (game value). More players share hinges. */
export const MAX_HINGES = 6;
/** Time to read the diagram before the first window, s (game value). */
const LEAD_S = 1.0;
/** Time for the last panel to swing open before phase 2, s (game value). */
const SETTLE_S = 0.6;

export interface Mg15Config {
  pointingFractionMin: number;
  perfectFractionMin: number;
  toleranceDeg: number;
  peakPowerW: number;
  hinges: number;
  /** This player's hinge index (turn in the release order). */
  myHinge: number;
  /** Spacing between hinge windows and the length of one window, s. */
  gapS: number;
  windowS: number;
  /** Length of phase 2, s. */
  phase2S: number;
  /** Fraction of the run the whole minigame may use. */
  timeFraction: number;
  /** Peak body turn rate, °/s. */
  bodyRateDegS: number;
  /** Wing drive speed limit, °/s. */
  driveDegS: number;
  oneButton: boolean;
  /** One-button: drift speed range, °/s, and the nudge of one press, degrees. */
  driftLoDegS: number;
  driftHiDegS: number;
  nudgeDeg: number;
}

/**
 * Host parameters + mode + difficulty → configuration. Tolerance: Relaxed ×1.6, One-button
 * ×1.4; Cadet ×1.25, Flight Director ×0.8. Windows: Relaxed gap 1.6 s / window 1.3 s against
 * 1.0 s / 0.8 s; Cadet ×1.15, Flight Director ×0.9. Body turn: Relaxed ×0.7; Cadet ×0.8,
 * Flight Director ×1.25. Standard uses ≤ 75 % of the run, Relaxed ≤ 97 %.
 */
export function resolveConfig(params: MgMap, mode: MinigameMode, assist: AssistLevel): Mg15Config {
  const success = numParam(params, 'sun_pointing_fraction_min', DEFAULTS.sun_pointing_fraction_min, 0.05, 1);
  const perfect = Math.max(success, numParam(params, 'perfect_fraction_min', DEFAULTS.perfect_fraction_min, 0.05, 1));
  let tol = numParam(params, 'pointing_tolerance_deg', DEFAULTS.pointing_tolerance_deg, 2, 60);
  tol *= assistFactor(assist, 1.25, 0.8);
  if (mode === 'RELAXED') tol *= 1.6;
  else if (mode === 'ONE_BUTTON') tol *= 1.4;
  const slots = intParam(params, 'slots', 1, 1, 64);
  const hinges = clamp(slots, 2, MAX_HINGES);
  const slot = intParam(params, 'slot', 0, 0, 63);
  const timing = assistFactor(assist, 1.15, 0.9);
  const relaxed = mode === 'RELAXED';
  const body = assistFactor(assist, 0.8, 1.25) * (relaxed ? 0.7 : 1);
  return {
    pointingFractionMin: success,
    perfectFractionMin: perfect,
    toleranceDeg: Math.min(tol, 80),
    peakPowerW: numParam(params, 'peak_power_w', DEFAULTS.peak_power_w, 1, 100000),
    hinges,
    myHinge: slot % hinges,
    gapS: (relaxed ? 1.6 : 1.0) * timing,
    windowS: (relaxed ? 1.3 : 0.8) * timing,
    phase2S: relaxed ? 7.5 : 7,
    timeFraction: relaxed ? 0.97 : 0.75,
    bodyRateDegS: 20 * body,
    driveDegS: 120,
    oneButton: mode === 'ONE_BUTTON',
    driftLoDegS: 5 * assistFactor(assist, 0.8, 1.2),
    driftHiDegS: 8 * assistFactor(assist, 0.8, 1.2),
    nudgeDeg: 12,
  };
}

/** PHYSICAL: generated power of a flat panel at incidence `thetaDeg`, W. */
export function panelPowerW(peakW: number, thetaDeg: number): number {
  return peakW * Math.max(0, Math.cos((thetaDeg * Math.PI) / 180));
}

export type HingeState = 'wait' | 'open' | 'done' | 'early' | 'late';

export interface Hinge {
  index: number;
  mine: boolean;
  /** Window, steps. */
  openStep: number;
  closeStep: number;
  /** Step the hinge released (−1 not yet). */
  releasedStep: number;
  state: HingeState;
  /** Crew hinge released from `env.coop` (true) or from the seeded crew (false). */
  fromCoop: boolean;
}

export interface Plan {
  hinges: Hinge[];
  /** First step of phase 2 and the total steps. */
  phase2Step: number;
  totalSteps: number;
  /** Time scale applied so the run fits (1 = as configured). */
  scale: number;
}

export function createPlan(config: Mg15Config, seed: number, runS: number): Plan {
  const rnd = mulberry32(seed ^ 0x15de);
  const total = LEAD_S + config.hinges * config.gapS + SETTLE_S + config.phase2S;
  const cap = runS * config.timeFraction;
  const scale = total > cap ? cap / total : 1;
  const hinges: Hinge[] = [];
  for (let k = 0; k < config.hinges; k++) {
    const open = (LEAD_S + k * config.gapS) * scale;
    const close = open + config.windowS * scale;
    const mine = k === config.myHinge;
    hinges.push({
      index: k,
      mine,
      openStep: Math.round(open * STEP_HZ),
      closeStep: Math.round(close * STEP_HZ),
      // Seeded crew: releases somewhere in the middle of its window.
      releasedStep: mine ? -1 : -Math.round((open + (0.25 + 0.4 * rnd()) * config.windowS * scale) * STEP_HZ) - 1,
      state: 'wait',
      fromCoop: false,
    });
  }
  const phase2 = (LEAD_S + config.hinges * config.gapS + SETTLE_S) * scale;
  return { hinges, phase2Step: Math.round(phase2 * STEP_HZ), totalSteps: Math.round(Math.min(cap, total * scale) * STEP_HZ), scale };
}

export interface Mg15Score {
  success: boolean;
  perfect: boolean;
  score: number;
  inOrder: boolean;
  pointingFraction: number;
}

/**
 * Success: own hinge released in order AND Sun-pointing ≥ `pointingFractionMin` of phase 2
 * (exactly 80 % counts). Perfect: in order and ≥ `perfectFractionMin`. Score: 0.25 for the
 * hinge in order + 0.75 × pointing fraction.
 */
export function scoreRun(inOrder: boolean, pointSteps: number, phase2Steps: number, config: Pick<Mg15Config, 'pointingFractionMin' | 'perfectFractionMin'>): Mg15Score {
  const frac = phase2Steps > 0 ? clamp(pointSteps / phase2Steps, 0, 1) : 0;
  const pointed = phase2Steps > 0 && pointSteps >= needSteps(config.pointingFractionMin, phase2Steps);
  const success = inOrder && pointed;
  const perfect = success && pointSteps >= needSteps(config.perfectFractionMin, phase2Steps);
  return { success, perfect, score: clamp((inOrder ? 0.25 : 0) + 0.75 * frac, 0, 1), inOrder, pointingFraction: frac };
}

export class Mg15Sim {
  readonly config: Mg15Config;
  readonly plan: Plan;
  readonly totalSteps: number;
  readonly phase2Steps: number;
  step = 0;
  /** Body attitude (°) and wing drive angle (°); wing normal = body + drive. Sun at 180°. */
  bodyDeg = 0;
  driveDeg = 0;
  /** Drive angle the player asks for (Standard / Relaxed). */
  driveAim = 0;
  /** θ: wing normal minus Sun direction, (−180°, 180°]. */
  thetaDeg = 0;
  pointSteps = 0;
  pointing = false;
  /** Releases attempted by this player (presses in phase 1). */
  presses = 0;
  nudges = 0;
  /** Steps left of the last nudge animation (one-button). */
  nudgeGlow = 0;
  private queued = false;
  private readonly waves: Array<{ a: number; f: number; p: number }>;
  private readonly rnd: () => number;
  private driftDegS = 0;
  private nextDrift = 0;
  /** One-button: tracking error the drift builds up, degrees. */
  errorDeg = 0;

  constructor(config: Mg15Config, seed: number, runS: number) {
    this.config = config;
    this.plan = createPlan(config, seed, runS);
    this.totalSteps = Math.max(1, this.plan.totalSteps);
    this.phase2Steps = Math.max(1, this.totalSteps - this.plan.phase2Step);
    this.rnd = mulberry32(seed ^ 0x5017);
    const r = this.rnd;
    // Body turn: two sines whose rates add up to at most `bodyRateDegS`.
    const f1 = 0.08 + 0.05 * r();
    const f2 = 0.21 + 0.08 * r();
    const share = 0.65;
    const rate = config.bodyRateDegS;
    this.waves = [
      { f: f1, a: (rate * share) / (2 * Math.PI * f1), p: r() * Math.PI * 2 },
      { f: f2, a: (rate * (1 - share)) / (2 * Math.PI * f2), p: r() * Math.PI * 2 },
    ];
    // The wing comes out of its latch 25–45° off the Sun, either side.
    const off = (25 + 20 * r()) * (r() < 0.5 ? -1 : 1);
    this.bodyDeg = this.bodyAt(this.plan.phase2Step * DT_S);
    this.driveDeg = 180 + off - this.bodyDeg;
    this.driveAim = this.driveDeg;
    this.errorDeg = off;
    this.thetaDeg = wrapDeg(this.bodyDeg + this.driveDeg - 180);
  }

  get done(): boolean {
    return this.step >= this.totalSteps;
  }

  get timeS(): number {
    return this.step * DT_S;
  }

  get phase(): 1 | 2 {
    return this.step >= this.plan.phase2Step ? 2 : 1;
  }

  get mine(): Hinge {
    return this.plan.hinges[this.config.myHinge]!;
  }

  /** The hinge whose window is open or comes next (null once all windows are past). */
  get current(): Hinge | null {
    for (const h of this.plan.hinges) if (this.step < h.closeStep) return h;
    return null;
  }

  get inOrder(): boolean {
    return this.mine.state === 'done';
  }

  get powerW(): number {
    return this.phase === 2 ? panelPowerW(this.config.peakPowerW, this.thetaDeg) : 0;
  }

  get pointingFraction(): number {
    const done = this.step - this.plan.phase2Step;
    return done > 0 ? this.pointSteps / done : 0;
  }

  bodyAt(tS: number): number {
    let a = 0;
    for (const w of this.waves) a += w.a * Math.sin(2 * Math.PI * w.f * tS + w.p);
    return a;
  }

  /** The one action: release the hinge (phase 1) or nudge the wing to the Sun (one-button phase 2). */
  press() {
    this.queued = true;
  }

  /** Standard / Relaxed: turn the wing drive by `deltaDeg` (positive = counter-clockwise). */
  turn(deltaDeg: number) {
    this.driveAim += deltaDeg;
  }

  /** A teammate's hinge reported by the host (`env.coop`). Decoration only. */
  crewReleased(k: number) {
    const h = this.plan.hinges[k];
    if (!h || h.mine || h.state !== 'wait' && h.state !== 'open') return;
    h.releasedStep = this.step;
    h.fromCoop = true;
    h.state = this.step < h.openStep ? 'early' : this.step > h.closeStep ? 'late' : 'done';
  }

  tick() {
    if (this.done) return;
    const s = this.step;
    const press = this.queued;
    this.queued = false;

    // ── hinges ──
    for (const h of this.plan.hinges) {
      if (h.state !== 'wait' && h.state !== 'open') continue;
      if (h.mine) {
        if (press && this.phase === 1) {
          this.presses++;
          h.releasedStep = s;
          h.state = s < h.openStep ? 'early' : s <= h.closeStep ? 'done' : 'late';
        } else if (s > h.closeStep) {
          // Missed: the spacecraft's backup timer releases it, out of order.
          h.releasedStep = h.closeStep + 1;
          h.state = 'late';
        } else if (s >= h.openStep) h.state = 'open';
      } else if (!h.fromCoop) {
        const at = -h.releasedStep - 1;
        if (s >= at) {
          h.releasedStep = at;
          h.state = 'done';
        } else if (s >= h.openStep) h.state = 'open';
      }
    }

    // ── wing pointing (phase 2) ──
    const t = (s + 1) * DT_S;
    this.bodyDeg = this.bodyAt(t);
    if (this.phase === 2 || s + 1 >= this.plan.phase2Step) {
      if (this.config.oneButton) {
        // The drive tracks the Sun by itself but builds up an error; a press nudges it back.
        if (s >= this.nextDrift) {
          const sign = Math.abs(this.errorDeg) > 1 ? Math.sign(this.errorDeg) : this.rnd() < 0.5 ? -1 : 1;
          this.driftDegS = sign * (this.config.driftLoDegS + (this.config.driftHiDegS - this.config.driftLoDegS) * this.rnd());
          this.nextDrift = s + Math.round((1.5 + 1.5 * this.rnd()) * STEP_HZ);
        }
        if (press && s >= this.plan.phase2Step) {
          this.nudges++;
          this.nudgeGlow = Math.round(0.3 * STEP_HZ);
          const n = Math.min(Math.abs(this.errorDeg), this.config.nudgeDeg);
          this.errorDeg -= Math.sign(this.errorDeg) * n;
        }
        this.errorDeg = clamp(this.errorDeg + this.driftDegS * DT_S, -170, 170);
        this.driveDeg = 180 + this.errorDeg - this.bodyDeg;
      } else {
        const d = this.driveAim - this.driveDeg;
        const max = this.config.driveDegS * DT_S;
        this.driveDeg += clamp(d, -max, max);
      }
    } else {
      // Phase 1: the folded wing rides with the body.
      this.driveAim = this.driveDeg;
    }
    if (this.nudgeGlow > 0) this.nudgeGlow--;
    this.thetaDeg = wrapDeg(this.bodyDeg + this.driveDeg - 180);
    this.pointing = Math.abs(this.thetaDeg) <= this.config.toleranceDeg;
    if (s >= this.plan.phase2Step && this.pointing) this.pointSteps++;
    this.step++;
  }

  score(): Mg15Score {
    return scoreRun(this.inOrder, this.pointSteps, this.phase2Steps, this.config);
  }

  result(): MinigameResult {
    const s = this.score();
    return { success: s.success, perfect: s.perfect, score: s.score };
  }
}

/**
 * Scripted good player: releases its hinge a third of the way into its window, then keeps the
 * drive aimed at the Sun with a 0.15 s reaction lead and a small wobble. One-button: presses
 * when the error passes 55 % of the tolerance.
 */
export class Mg15Autopilot {
  private lastPress = -1e9;
  constructor(private readonly wobbleDeg = 3) {}

  apply(sim: Mg15Sim) {
    const h = sim.mine;
    if (sim.phase === 1) {
      const at = h.openStep + Math.round((h.closeStep - h.openStep) / 3);
      if ((h.state === 'wait' || h.state === 'open') && sim.step >= at) sim.press();
      return;
    }
    if (sim.config.oneButton) {
      if (Math.abs(sim.errorDeg) > sim.config.toleranceDeg * 0.55 && sim.step - this.lastPress > 0.25 * STEP_HZ) {
        sim.press();
        this.lastPress = sim.step;
      }
      return;
    }
    const body = sim.bodyAt(sim.timeS + 0.15);
    const want = 180 - body + this.wobbleDeg * Math.sin(sim.step / 29);
    sim.turn(want - sim.driveAim);
  }
}

export function runScripted(config: Mg15Config, seed: number, runS: number, input: (sim: Mg15Sim) => void): Mg15Sim {
  const sim = new Mg15Sim(config, seed, runS);
  while (!sim.done) {
    input(sim);
    sim.tick();
  }
  return sim;
}
