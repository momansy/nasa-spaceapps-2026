// MG-20 Deorbit Burn: simulation and scoring. Pure: no DOM, no clock, no Math.random.
//
// Hold the burn button: the engine fires retrograde and the periapsis marker drops. Release
// when the periapsis is inside the target band. The team median of `value` sets the real burn.
//
// What is physical and what is a game simplification
// ---------------------------------------------------
// PHYSICAL
//   μ⊕ = 3.986 × 10¹⁴ m³/s², R⊕ = 6 371 km (core PhysicalConstants.cs).
//   From a circular orbit of radius r the spacecraft moves at v_c = √(μ / r). A retrograde Δv
//   leaves it at v_a = v_c − Δv at the same point, which becomes the apoapsis. Vis-viva gives
//   the new semi-major axis a = 1 / (2/r − v_a²/μ); the periapsis is r_p = 2a − r (equivalently
//   from the angular momentum h = r·v_a: r_p = h² / (μ (1 + e))).
// GAME SIMPLIFICATIONS (game values)
//   • The burn is time-compressed: Δv grows at 25 m/s per second of holding (a real deorbit burn
//     of ~100 m/s takes minutes).
//   • The burn is treated as instantaneous at the current point for the orbit shape.
//   • Target band 40–70 km periapsis altitude by default (game values; a real target depends on
//     the vehicle and the landing site).
import type { AssistLevel, MgMap, MinigameMode } from '@protocol';
import type { MinigameResult } from '../types';
import { assistFactor, boolParam, clamp, DT_S, numParam, STEP_HZ } from '../MG-13/kit';

/** Earth's gravitational parameter, m³/s² (physical; core PhysicalConstants.cs). */
export const MU_EARTH = 3.986e14;
/** Earth mean radius, m (physical). */
export const R_EARTH_M = 6_371_000;

export const DEFAULTS = {
  /** Start orbit altitude, km (game value: a typical low orbit). */
  orbit_altitude_km: 400,
  /** Target band of the periapsis altitude, km (game values). */
  target_lo_km: 40,
  target_hi_km: 70,
  /** Burn rate, m/s of Δv per second of holding (game value). */
  burn_rate_ms2: 25,
} as const;

/** After a release with the periapsis at or below the band top, play ends this long later, s. */
export const SETTLE_S = 1.5;

export interface Mg20Config {
  altitudeKm: number;
  loKm: number;
  hiKm: number;
  burnRate: number;
  /** Fraction of the run for burning. */
  timeFraction: number;
  holdToToggle: boolean;
}

/**
 * Host parameters + mode + difficulty → configuration. Relaxed: band × 1.5 around its middle
 * and burn rate × 0.6 ("the marker drops more slowly"), 97 % of the run; Standard and One-button
 * 75 %. Cadet: band × 1.25, rate × 0.8; Flight Director: band × 0.8, rate × 1.2. One-button is
 * the same hold button; `hold_to_toggle` turns it into press-to-start / press-to-stop.
 */
export function resolveConfig(params: MgMap, mode: MinigameMode, assist: AssistLevel): Mg20Config {
  const alt = numParam(params, 'orbit_altitude_km', DEFAULTS.orbit_altitude_km, 150, 2000);
  let lo = numParam(params, 'target_lo_km', DEFAULTS.target_lo_km, -200, alt - 10);
  let hi = numParam(params, 'target_hi_km', DEFAULTS.target_hi_km, lo + 1, alt - 5);
  const mid = (lo + hi) / 2;
  let half = (hi - lo) / 2;
  let rate = numParam(params, 'burn_rate_ms2', DEFAULTS.burn_rate_ms2, 1, 500);
  half *= assistFactor(assist, 1.25, 0.8);
  rate *= assistFactor(assist, 0.8, 1.2);
  if (mode === 'RELAXED') {
    half *= 1.5;
    rate *= 0.6;
  }
  lo = mid - half;
  hi = mid + half;
  return { altitudeKm: alt, loKm: lo, hiKm: hi, burnRate: rate, timeFraction: mode === 'RELAXED' ? 0.97 : 0.75, holdToToggle: boolParam(params, 'hold_to_toggle') };
}

/** PHYSICAL: periapsis altitude (km) after a retrograde Δv (m/s) from a circular orbit at `altKm`. */
export function periapsisKm(altKm: number, dvMs: number): number {
  const r = R_EARTH_M + altKm * 1000;
  const vc = Math.sqrt(MU_EARTH / r);
  const va = Math.max(0, vc - dvMs);
  const inv = 2 / r - (va * va) / MU_EARTH;
  if (inv <= 0) return altKm; // not bound: cannot happen for retrograde burns
  const a = 1 / inv;
  const rp = Math.min(r, 2 * a - r); // the burn point is the apoapsis
  return (rp - R_EARTH_M) / 1000;
}

/** The same periapsis from angular momentum and eccentricity, for cross-checking (physical). */
export function periapsisKmFromH(altKm: number, dvMs: number): number {
  const r = R_EARTH_M + altKm * 1000;
  const va = Math.sqrt(MU_EARTH / r) - dvMs;
  const h = r * va;
  const eps = (va * va) / 2 - MU_EARTH / r;
  const e = Math.sqrt(Math.max(0, 1 + (2 * eps * h * h) / (MU_EARTH * MU_EARTH)));
  return ((h * h) / (MU_EARTH * (1 + e)) - R_EARTH_M) / 1000;
}

/** Δv (m/s) that brings the periapsis to `targetKm` (bisection on the physical model). */
export function dvForPeriapsis(altKm: number, targetKm: number): number {
  let lo = 0;
  let hi = 2000;
  for (let i = 0; i < 60; i++) {
    const m = (lo + hi) / 2;
    if (periapsisKm(altKm, m) > targetKm) lo = m;
    else hi = m;
  }
  return (lo + hi) / 2;
}

export interface Mg20Score {
  success: boolean;
  perfect: boolean;
  score: number;
  value: number;
}

/**
 * Success: periapsis inside the band (inclusive). Perfect: inside the middle half of the band.
 * Score: 1 at the middle, 0.5 at the edges, falling to 0 one band-width outside. `value` =
 * achieved periapsis altitude, km.
 */
export function scoreRun(pKm: number, config: Pick<Mg20Config, 'loKm' | 'hiKm'>): Mg20Score {
  const mid = (config.loKm + config.hiKm) / 2;
  const half = (config.hiKm - config.loKm) / 2;
  const d = Math.abs(pKm - mid);
  const success = pKm >= config.loKm - 1e-9 && pKm <= config.hiKm + 1e-9;
  const perfect = success && d <= half / 2 + 1e-9;
  const score = d <= half ? 1 - 0.5 * (d / half) : clamp(0.5 - 0.5 * ((d - half) / (2 * half)), 0, 0.5);
  return { success, perfect, score, value: Math.round(pKm * 10) / 10 };
}

export class Mg20Sim {
  readonly config: Mg20Config;
  readonly totalSteps: number;
  step = 0;
  dvMs = 0;
  burning = false;
  /** Number of separate burns. */
  burns = 0;
  private held = false;
  private wasHeld = false;
  private latched = false;
  private endStep: number;
  private releasedAt = -1;

  constructor(config: Mg20Config, runS: number) {
    this.config = config;
    this.totalSteps = Math.max(1, Math.round(runS * config.timeFraction * STEP_HZ));
    this.endStep = this.totalSteps;
  }

  get done(): boolean {
    return this.step >= this.endStep;
  }

  get timeS(): number {
    return this.step * DT_S;
  }

  get periapsisKm(): number {
    return periapsisKm(this.config.altitudeKm, this.dvMs);
  }

  /** Steps the run will last as it stands (shorter once the burn is settled). */
  get endsAt(): number {
    return this.endStep;
  }

  /** The button state this step (held down = true). */
  hold(down: boolean) {
    this.held = down;
  }

  tick() {
    if (this.done) return;
    let on = this.held;
    if (this.config.holdToToggle) {
      if (this.held && !this.wasHeld) this.latched = !this.latched;
      on = this.latched;
    }
    this.wasHeld = this.held;
    if (on && !this.burning) this.burns++;
    if (!on && this.burning) this.releasedAt = this.step;
    this.burning = on;
    if (on) {
      this.dvMs += this.config.burnRate * DT_S;
      this.releasedAt = -1;
    }
    this.step++;
    // Settled: released at or below the top of the band → play ends shortly after.
    if (!on && this.releasedAt >= 0 && this.periapsisKm <= this.config.hiKm && this.endStep === this.totalSteps) {
      this.endStep = Math.min(this.totalSteps, this.releasedAt + Math.round(SETTLE_S * STEP_HZ));
    }
  }

  score(): Mg20Score {
    return scoreRun(this.periapsisKm, this.config);
  }

  result(): MinigameResult {
    const s = this.score();
    return { success: s.success, perfect: s.perfect, score: s.score, value: s.value };
  }
}

/**
 * Scripted good player: holds until the periapsis, predicted `reactS` ahead, reaches the middle
 * of the band, then releases (with hold-to-toggle: presses once to start and once to stop).
 */
export class Mg20Autopilot {
  private phase: 'idle' | 'burn' | 'done' = 'idle';
  constructor(private readonly startS = 0.8, private readonly reactS = 0.08) {}

  apply(sim: Mg20Sim) {
    const mid = (sim.config.loKm + sim.config.hiKm) / 2;
    const ahead = periapsisKm(sim.config.altitudeKm, sim.dvMs + sim.config.burnRate * this.reactS);
    if (this.phase === 'idle' && sim.timeS >= this.startS) this.phase = 'burn';
    if (this.phase === 'burn' && ahead <= mid) this.phase = 'done';
    const want = this.phase === 'burn';
    if (sim.config.holdToToggle) {
      // Press (one step) to change state.
      sim.hold(want !== sim.burning && sim.step % 2 === 0);
    } else sim.hold(want);
  }
}

export function runScripted(config: Mg20Config, runS: number, input: (sim: Mg20Sim) => void): Mg20Sim {
  const sim = new Mg20Sim(config, runS);
  while (!sim.done) {
    input(sim);
    sim.tick();
  }
  return sim;
}
