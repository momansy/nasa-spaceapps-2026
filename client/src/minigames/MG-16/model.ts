// MG-16 Station Docking: simulation and scoring. Pure: no DOM, no clock, no Math.random.
//
// Final approach to a station docking port. Translation thrusters push left/right, up/down
// (alignment) and forward/back (closing speed). Inertia is real: velocity stays until you
// thrust the other way (Newton's first law, fact F12). Contact happens when the range reaches 0.
//
// What is physical and what is a game simplification
// ---------------------------------------------------
// PHYSICAL
//   Newton's first and second laws without friction: v changes only while a thruster fires
//   (a = F/m), position integrates v. Nothing slows down on its own.
// REAL-WORLD APPROXIMATE
//   Docking contact speeds of a few cm/s; the C3 stretch objective asks for under 5 cm/s.
// GAME SIMPLIFICATIONS (game values)
//   • Translation only (no rotation), one straight axis to the port, start 150 cm away.
//   • Thruster acceleration 3 cm/s² per axis, seeded lateral offset and drift, no plume
//     impingement, no orbital-mechanics (Hill) drift beyond the seeded constant drift.
import type { AssistLevel, MgMap, MinigameMode } from '@protocol';
import type { MinigameResult } from '../types';
import { assistFactor, clamp, DT_S, mulberry32, numParam, STEP_HZ } from '../MG-13/kit';

export const DEFAULTS = {
  /** Success: alignment error strictly below, cm (data/minigames.json: 10). */
  alignment_error_below_cm: 10,
  /** Success: contact speed strictly below, cm/s (data/minigames.json: 10). */
  contact_speed_below_cm_s: 10,
  /** Perfect: both strictly below, cm and cm/s (the C3 stretch is 5 cm/s). */
  perfect_below: 5,
  /** Start range, cm (game value). */
  start_range_cm: 150,
} as const;

/** Thruster bits. */
export const T_LEFT = 1;
export const T_RIGHT = 2;
export const T_UP = 4;
export const T_DOWN = 8;
export const T_FWD = 16;
export const T_BACK = 32;

/** Thruster acceleration per axis, cm/s² (game value). */
export const THRUST_CM_S2 = 3;
/** After contact, play ends this long later, s. */
export const AFTER_CONTACT_S = 1.2;

export interface Mg16Config {
  alignBelowCm: number;
  speedBelowCmS: number;
  perfectBelow: number;
  startRangeCm: number;
  /** Seeded lateral drift speed range, cm/s. */
  driftLo: number;
  driftHi: number;
  timeFraction: number;
  oneButton: boolean;
  /** One-button: closing acceleration of the automatic approach, cm/s², and one braking pulse, cm/s. */
  pushCmS2: number;
  brakeCmS: number;
}

/**
 * Host parameters + mode + difficulty → configuration. Relaxed: alignment target × 1.5 ("the
 * alignment target is larger") and drift × 0.5, 97 % of the run; Standard and One-button 75 %.
 * Cadet: drift × 0.7; Flight Director: drift × 1.3. The speed limit always comes from the data.
 */
export function resolveConfig(params: MgMap, mode: MinigameMode, assist: AssistLevel): Mg16Config {
  let align = numParam(params, 'alignment_error_below_cm', DEFAULTS.alignment_error_below_cm, 1, 100);
  const speed = numParam(params, 'contact_speed_below_cm_s', DEFAULTS.contact_speed_below_cm_s, 1, 100);
  let drift = assistFactor(assist, 0.7, 1.3);
  if (mode === 'RELAXED') {
    align *= 1.5;
    drift *= 0.5;
  }
  return {
    alignBelowCm: align,
    speedBelowCmS: speed,
    perfectBelow: Math.min(numParam(params, 'perfect_below', DEFAULTS.perfect_below, 0.5, 100), align, speed),
    startRangeCm: numParam(params, 'start_range_cm', DEFAULTS.start_range_cm, 40, 1000),
    driftLo: 0.4 * drift,
    driftHi: 1.0 * drift,
    timeFraction: mode === 'RELAXED' ? 0.97 : 0.75,
    oneButton: mode === 'ONE_BUTTON',
    pushCmS2: 0.5 * assistFactor(assist, 0.8, 1.2),
    brakeCmS: 2,
  };
}

export interface Mg16Score {
  success: boolean;
  perfect: boolean;
  score: number;
  /** Contact speed, cm/s, or null without contact. */
  value: number | null;
}

/**
 * Success: contact with alignment < limit AND speed < limit (strict). Perfect: both below
 * `perfectBelow` (5). Score: 0 without contact; otherwise 1 − 0.5 × (alignment / limit) / 2 −
 * 0.5 × (speed / limit) / 2 for a success, a quarter of that for a failed contact.
 */
export function scoreContact(contact: { alignCm: number; speedCmS: number } | null, config: Pick<Mg16Config, 'alignBelowCm' | 'speedBelowCmS' | 'perfectBelow'>): Mg16Score {
  if (!contact) return { success: false, perfect: false, score: 0, value: null };
  const { alignCm, speedCmS } = contact;
  const success = alignCm < config.alignBelowCm && speedCmS < config.speedBelowCmS;
  const perfect = success && alignCm < config.perfectBelow && speedCmS < config.perfectBelow;
  const q = clamp(1 - 0.5 * clamp(alignCm / config.alignBelowCm, 0, 1) - 0.5 * clamp(speedCmS / config.speedBelowCmS, 0, 1), 0, 1);
  return { success, perfect, score: success ? 0.5 + 0.5 * q : 0.25 * q, value: Math.round(speedCmS * 10) / 10 };
}

export class Mg16Sim {
  readonly config: Mg16Config;
  readonly totalSteps: number;
  step = 0;
  /** Lateral offsets of the port from the boresight, cm, and their rates, cm/s. */
  y = 0;
  z = 0;
  vy = 0;
  vz = 0;
  /** Range to contact, cm, and closing speed, cm/s (positive = closing). */
  range: number;
  closing = 3;
  thrust = 0;
  contact: { alignCm: number; speedCmS: number; step: number } | null = null;
  /** One-button: braking pulses fired, and steps of the current pulse left. */
  brakes = 0;
  brakeLeft = 0;
  /** Fuel used, cm/s of Δv summed over axes. */
  dvUsed = 0;
  private queuedPress = false;
  private endStep: number;
  private readonly driftY: number;
  private readonly driftZ: number;

  constructor(config: Mg16Config, seed: number, runS: number) {
    this.config = config;
    const rnd = mulberry32(seed ^ 0x16d0);
    const off = 12 + 13 * rnd();
    const ang = rnd() * Math.PI * 2;
    this.y = Math.cos(ang) * off;
    this.z = Math.sin(ang) * off;
    const dv = config.driftLo + (config.driftHi - config.driftLo) * rnd();
    const da = rnd() * Math.PI * 2;
    this.driftY = Math.cos(da) * dv;
    this.driftZ = Math.sin(da) * dv;
    this.vy = this.driftY;
    this.vz = this.driftZ;
    this.range = config.startRangeCm;
    this.totalSteps = Math.max(1, Math.round(runS * config.timeFraction * STEP_HZ));
    this.endStep = this.totalSteps;
  }

  get done(): boolean {
    return this.step >= this.endStep;
  }

  get timeS(): number {
    return this.step * DT_S;
  }

  get alignCm(): number {
    return Math.hypot(this.y, this.z);
  }

  get endsAt(): number {
    return this.endStep;
  }

  /** Thrusters held this step (bits T_LEFT … T_BACK). */
  setThrust(mask: number) {
    this.thrust = mask;
  }

  /** One-button: one braking pulse. */
  press() {
    this.queuedPress = true;
  }

  tick() {
    if (this.done) return;
    const dt = DT_S;
    if (!this.contact) {
      const a = THRUST_CM_S2 * dt;
      if (this.config.oneButton) {
        // Alignment self-corrects (a calm automatic controller); the approach pushes forward.
        const ky = clamp(-0.9 * this.y - 2.2 * (this.vy - 0), -THRUST_CM_S2, THRUST_CM_S2);
        const kz = clamp(-0.9 * this.z - 2.2 * (this.vz - 0), -THRUST_CM_S2, THRUST_CM_S2);
        this.vy += ky * dt;
        this.vz += kz * dt;
        this.dvUsed += (Math.abs(ky) + Math.abs(kz)) * dt;
        this.closing += this.config.pushCmS2 * dt;
        if (this.queuedPress) {
          this.brakes++;
          this.brakeLeft = Math.round(0.25 * STEP_HZ);
        }
        if (this.brakeLeft > 0) {
          this.closing -= (this.config.brakeCmS / (0.25 * STEP_HZ));
          this.brakeLeft--;
        }
      } else {
        const m = this.thrust;
        if (m & T_RIGHT) this.vy -= a; // thrust right moves the craft right: the port shifts left
        if (m & T_LEFT) this.vy += a;
        if (m & T_UP) this.vz -= a;
        if (m & T_DOWN) this.vz += a;
        if (m & T_FWD) this.closing += a;
        if (m & T_BACK) this.closing -= a;
        let n = 0;
        for (const b of [T_LEFT, T_RIGHT, T_UP, T_DOWN, T_FWD, T_BACK]) if (m & b) n++;
        this.dvUsed += n * a;
      }
      this.y += this.vy * dt;
      this.z += this.vz * dt;
      this.range = Math.min(this.config.startRangeCm * 2, this.range - this.closing * dt);
      if (this.range <= 0) {
        this.range = 0;
        this.contact = { alignCm: this.alignCm, speedCmS: Math.max(0, this.closing), step: this.step };
        this.endStep = Math.min(this.totalSteps, this.step + Math.round(AFTER_CONTACT_S * STEP_HZ));
      }
    }
    this.queuedPress = false;
    this.step++;
  }

  score(): Mg16Score {
    return scoreContact(this.contact, this.config);
  }

  result(): MinigameResult {
    const s = this.score();
    return { success: s.success, perfect: s.perfect, score: s.score, value: s.value };
  }
}

/**
 * Scripted good pilot: nulls the lateral offset with bang-bang thrusters (PD law with a dead
 * band) and follows a closing-speed profile that slows to ~3.2 cm/s near the port.
 * One-button: brakes whenever the closing speed exceeds the profile.
 */
export class Mg16Autopilot {
  apply(sim: Mg16Sim) {
    const target = clamp(3.2 + sim.range * 0.06, 3.2, 9);
    if (sim.config.oneButton) {
      if (sim.closing > target + 0.6 && sim.brakeLeft === 0) sim.press();
      return;
    }
    let m = 0;
    const cy = -0.6 * sim.y - 1.6 * sim.vy;
    const cz = -0.6 * sim.z - 1.6 * sim.vz;
    // Positive cy means vy should grow: fire LEFT (which adds to vy).
    if (cy > 0.4) m |= T_LEFT;
    else if (cy < -0.4) m |= T_RIGHT;
    if (cz > 0.4) m |= T_DOWN;
    else if (cz < -0.4) m |= T_UP;
    if (sim.closing < target - 0.4) m |= T_FWD;
    else if (sim.closing > target + 0.4) m |= T_BACK;
    sim.setThrust(m);
  }
}

export function runScripted(config: Mg16Config, seed: number, runS: number, input: (sim: Mg16Sim) => void): Mg16Sim {
  const sim = new Mg16Sim(config, seed, runS);
  while (!sim.done) {
    input(sim);
    sim.tick();
  }
  return sim;
}
