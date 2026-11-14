// MG-08 Max Q Throttle Bucket: the simulation and the scoring. Pure: no DOM, no clocks, no
// Math.random. The same seed and the same input samples give the same run on every phone.
//
// What is physical and what is a game simplification
// ---------------------------------------------------
// PHYSICAL
//   Dynamic pressure  q = ½ · ρ · v²                              [Pa]
//   Exponential atmosphere  ρ(h) = ρ0 · e^(−h / H)                [kg/m³]
//   For a vertical climb at constant net acceleration a:  v = a·t,  h = ½·a·t²
//   so q rises with speed, peaks ("Max Q") where the thinning air wins, then falls.
//   For this model the peak is  q_max = ρ0 · a · H / e  at  t = √(2H / a).
// REAL-WORLD APPROXIMATE
//   ρ0 = 1.225 kg/m³ (sea level), scale height H ≈ 8,500 m, a structural limit of the order
//   of 35 kPa (real launchers see roughly 30–35 kPa at Max Q).
// GAME SIMPLIFICATIONS (game values)
//   • The climb is vertical with constant net acceleration; there is no gravity turn.
//   • The throttle acts on the load at once: load = q_full · gust · throttle², as if speed
//     followed thrust immediately. A real vehicle slows its *acceleration* when it throttles
//     down, so the effect on q builds up over seconds.
//   • The engine follows the lever with a short first-order lag.
//   • A slice of the climb around Max Q is squeezed into the play time (20 s by default).
//   • Wind shear is three seeded sine waves of a few percent.
//   • The "too slow" floor stands for gravity losses; it is a band edge, not a computed loss.
//   • The band widths, lag, gust size and the 85 % / 97 % thresholds are game values.
import type { AssistLevel, MgMap, MinigameMode } from '@protocol';

/** Fixed simulation rate. The run advances in steps of 1/120 s whatever the frame rate. */
export const STEP_HZ = 120;

/** Sea-level air density, kg/m³ (physical). */
export const RHO0_KG_M3 = 1.225;
/** Atmospheric scale height, m (real-world approximate). */
export const SCALE_HEIGHT_M = 8500;

/** Defaults of the host parameters (`mg.start.params`), all game values except where noted. */
export const DEFAULTS = {
  /** Success: in band at least this fraction of the time (design 10.5: 85 %). */
  in_band_fraction_min: 0.85,
  /** Perfect: in band at least this fraction of the time (game value, not in the design). */
  perfect_fraction_min: 0.97,
  /** Top of the safe band: structural limit, kPa (real-world approximate order of magnitude). */
  limit_kpa: 35,
  /** Bottom of the safe band: below it the vehicle wastes time against gravity, kPa. */
  floor_kpa: 26,
  /** Lowest throttle setting as a fraction of full thrust (0.4 = 40 %). */
  throttle_min: 0.4,
  /** Size of the wind-shear wiggle as a fraction of q (0.05 = ±5 %). */
  gust_fraction: 0.05,
} as const;

/** Engine response time constant, s. */
const ENGINE_LAG_S = 0.18;
/** One-button mode: how fast the lever moves while the button is held or released, per second. */
const ONE_BUTTON_RATE_PER_S = 0.28;

export interface Mg08Config {
  inBandFractionMin: number;
  perfectFractionMin: number;
  /** Safe band actually used (after mode and difficulty scaling), kPa. */
  bandLoKpa: number;
  bandHiKpa: number;
  /** Lowest throttle, fraction of full thrust. */
  throttleMin: number;
  gustFraction: number;
  engineLagS: number;
  /** Show on the lever which throttle range is inside the band right now. */
  showGuide: boolean;
  oneButton: boolean;
  /** One-button mode: a tap switches between "up" and "down" instead of holding. */
  holdToToggle: boolean;
  oneButtonRatePerS: number;
}

function numParam(params: MgMap, key: string, fallback: number, min: number, max: number): number {
  const v = params[key];
  if (typeof v !== 'number' || !Number.isFinite(v)) return fallback;
  return Math.min(max, Math.max(min, v));
}

/**
 * Turns the host parameters, the input mode (design section 16) and the difficulty (design
 * 10.1 rule 6) into the configuration of one run.
 *
 * Band width factor around the band centre: Relaxed ×1.6, One-button ×1.5; Cadet ×1.25,
 * Engineer ×1, Flight Director ×0.85. Gust factor: Relaxed ×0.6, One-button ×0.5; Cadet ×0.6,
 * Flight Director ×1.4. All game values.
 */
export function resolveConfig(params: MgMap, mode: MinigameMode, assist: AssistLevel): Mg08Config {
  const limit = numParam(params, 'limit_kpa', DEFAULTS.limit_kpa, 10, 100);
  const floor = Math.min(numParam(params, 'floor_kpa', DEFAULTS.floor_kpa, 1, 99), limit - 2);
  const centre = (limit + floor) / 2;
  let half = (limit - floor) / 2;
  let gust = numParam(params, 'gust_fraction', DEFAULTS.gust_fraction, 0, 0.15);

  if (assist === 'CADET') {
    half *= 1.25;
    gust *= 0.6;
  } else if (assist === 'FLIGHT_DIRECTOR') {
    half *= 0.85;
    gust *= 1.4;
  }
  if (mode === 'RELAXED') {
    half *= 1.6;
    gust *= 0.6;
  } else if (mode === 'ONE_BUTTON') {
    half *= 1.5;
    gust *= 0.5;
  }
  // The band can never reach zero pressure.
  half = Math.min(half, centre * 0.6);

  const success = numParam(params, 'in_band_fraction_min', DEFAULTS.in_band_fraction_min, 0.05, 1);
  const perfect = Math.max(success, numParam(params, 'perfect_fraction_min', DEFAULTS.perfect_fraction_min, 0.05, 1));

  return {
    inBandFractionMin: success,
    perfectFractionMin: perfect,
    bandLoKpa: centre - half,
    bandHiKpa: centre + half,
    throttleMin: numParam(params, 'throttle_min', DEFAULTS.throttle_min, 0.1, 0.9),
    gustFraction: gust,
    engineLagS: ENGINE_LAG_S,
    showGuide: mode === 'RELAXED' || assist === 'CADET',
    oneButton: mode === 'ONE_BUTTON',
    holdToToggle: params['hold_to_toggle'] === true,
    oneButtonRatePerS: ONE_BUTTON_RATE_PER_S,
  };
}

/** Small seeded generator (mulberry32). Returns numbers in [0, 1). */
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

/**
 * PHYSICAL: dynamic pressure in kPa at mission time `tS` for a vertical climb from rest at
 * constant net acceleration `accelMs2` through an exponential atmosphere.
 */
export function dynamicPressureKpa(tS: number, accelMs2: number): number {
  const v = accelMs2 * tS; // m/s
  const h = 0.5 * accelMs2 * tS * tS; // m
  const rho = RHO0_KG_M3 * Math.exp(-h / SCALE_HEIGHT_M); // kg/m³
  return (0.5 * rho * v * v) / 1000;
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function bisect(f: (x: number) => number, lo: number, hi: number): number {
  let a = lo;
  let b = hi;
  const fa = f(a);
  for (let i = 0; i < 48; i++) {
    const m = (a + b) / 2;
    if (f(m) > 0 === fa > 0) a = m;
    else b = m;
  }
  return (a + b) / 2;
}

export interface Mg08Curve {
  seed: number;
  durationS: number;
  /** Net acceleration of the modelled climb, m/s². */
  accelMs2: number;
  /** Mission time at the start and the end of play, s after lift-off. */
  missionStartS: number;
  missionEndS: number;
  /** Max Q at full throttle without gusts, kPa, and when it happens in play time, s. */
  peakKpa: number;
  peakAtS: number;
  /** Dynamic pressure at full throttle without wind shear at play time `tS`, kPa. */
  qBaseKpa(tS: number): number;
  /** Wind-shear factor around 1 at play time `tS`. */
  gust(tS: number): number;
  /** Dynamic pressure at full throttle including wind shear at play time `tS`, kPa. */
  qFullKpa(tS: number): number;
}

/**
 * Builds the dynamic-pressure curve of one run from the seed. The seed chooses how far Max Q
 * overshoots the limit, where in the band the run starts and ends, and the wind shear.
 */
export function createCurve(config: Mg08Config, seed: number, durationS: number): Mg08Curve {
  const rnd = mulberry32(seed);
  const width = config.bandHiKpa - config.bandLoKpa;

  // Max Q at full throttle is 28–45 % above the limit, so the player has to throttle down.
  const peakKpa = config.bandHiKpa * (1.28 + 0.17 * rnd());
  const accelMs2 = (peakKpa * 1000 * Math.E) / (RHO0_KG_M3 * SCALE_HEIGHT_M);
  const tPeakS = Math.sqrt((2 * SCALE_HEIGHT_M) / accelMs2);

  // Play starts and ends with full throttle inside the band.
  const qStart = config.bandLoKpa + (0.15 + 0.2 * rnd()) * width;
  const qEnd = config.bandLoKpa + (0.3 + 0.3 * rnd()) * width;
  const missionStartS = bisect((t) => dynamicPressureKpa(t, accelMs2) - qStart, 0.01, tPeakS);
  const missionEndS = bisect((t) => dynamicPressureKpa(t, accelMs2) - qEnd, tPeakS, tPeakS * 4);
  const span = missionEndS - missionStartS;

  const waves = [
    { f: 0.22 + 0.16 * rnd(), w: 0.55, p: rnd() * Math.PI * 2 },
    { f: 0.45 + 0.25 * rnd(), w: 0.3, p: rnd() * Math.PI * 2 },
    { f: 0.8 + 0.35 * rnd(), w: 0.15, p: rnd() * Math.PI * 2 },
  ];

  const qBaseKpa = (tS: number) => {
    const tau = Math.min(1, Math.max(0, tS / durationS));
    return dynamicPressureKpa(missionStartS + span * tau, accelMs2);
  };
  const gust = (tS: number) => {
    const tau = tS / durationS;
    // No wind shear in the first and last tenth: the run starts and ends calm.
    const env = smoothstep(0, 0.12, tau) * smoothstep(1, 0.9, tau);
    let s = 0;
    for (const w of waves) s += w.w * Math.sin(2 * Math.PI * w.f * tS + w.p);
    return 1 + config.gustFraction * env * s;
  };

  return {
    seed: seed >>> 0,
    durationS,
    accelMs2,
    missionStartS,
    missionEndS,
    peakKpa,
    peakAtS: ((tPeakS - missionStartS) / span) * durationS,
    qBaseKpa,
    gust,
    qFullKpa: (tS) => qBaseKpa(tS) * gust(tS),
  };
}

/** Where the stress line is: −1 below the band (too slow), 0 inside, +1 above (overload). */
export type Zone = -1 | 0 | 1;

export interface Mg08Score {
  success: boolean;
  perfect: boolean;
  /** In-band fraction 0–1. */
  score: number;
}

/**
 * Scoring. Success: in band for at least `inBandFractionMin` of the steps (exactly 85 % counts).
 * Perfect: at least `perfectFractionMin`. Score: the in-band fraction.
 */
export function scoreRun(inBandSteps: number, totalSteps: number, config: Pick<Mg08Config, 'inBandFractionMin' | 'perfectFractionMin'>): Mg08Score {
  if (totalSteps <= 0) return { success: false, perfect: false, score: 0 };
  // Whole steps, with a tiny tolerance so that 0.85 × 2400 = 2040 is not lost to rounding.
  const need = (fraction: number) => Math.ceil(fraction * totalSteps - 1e-9);
  const success = inBandSteps >= need(config.inBandFractionMin);
  const perfect = success && inBandSteps >= need(config.perfectFractionMin);
  return { success, perfect, score: Math.min(1, Math.max(0, inBandSteps / totalSteps)) };
}

export class Mg08Sim {
  readonly config: Mg08Config;
  readonly curve: Mg08Curve;
  readonly totalSteps: number;
  readonly dtS = 1 / STEP_HZ;
  /** Steps done so far. */
  step = 0;
  /** Lever position: fraction of full thrust, `throttleMin`…1. Starts at full throttle. */
  target = 1;
  /** Engine output after the lag, same scale. */
  throttle = 1;
  /** Stress on the vehicle now, kPa. */
  loadKpa: number;
  zone: Zone = 0;
  inBandSteps = 0;
  overSteps = 0;
  underSteps = 0;
  /** Stress line so far, one sample per step, kPa. */
  readonly loadHistory: Float32Array;
  readonly zoneHistory: Int8Array;
  /** One-button toggle state when `holdToToggle` is on. */
  private latched = false;
  private wasPressed = false;

  constructor(config: Mg08Config, curve: Mg08Curve) {
    this.config = config;
    this.curve = curve;
    this.totalSteps = Math.max(1, Math.round(curve.durationS * STEP_HZ));
    this.loadHistory = new Float32Array(this.totalSteps);
    this.zoneHistory = new Int8Array(this.totalSteps);
    this.loadKpa = curve.qFullKpa(0);
  }

  get done(): boolean {
    return this.step >= this.totalSteps;
  }

  /** Play time so far, s. */
  get timeS(): number {
    return this.step * this.dtS;
  }

  get inBandFraction(): number {
    return this.step === 0 ? 1 : this.inBandSteps / this.step;
  }

  /** Throttle range that would be inside the band right now, clamped to the lever travel. */
  guideRange(): { lo: number; hi: number } {
    const q = this.curve.qFullKpa(this.timeS);
    const clamp = (v: number) => Math.min(1, Math.max(this.config.throttleMin, v));
    return { lo: clamp(Math.sqrt(this.config.bandLoKpa / q)), hi: clamp(Math.sqrt(this.config.bandHiKpa / q)) };
  }

  /** Advances one fixed step with the lever at `target` (fraction of full thrust). */
  stepLever(target: number): void {
    if (this.done) return;
    this.target = Math.min(1, Math.max(this.config.throttleMin, target));
    this.advance();
  }

  /** Advances one fixed step in one-button mode: pressed moves the lever up, released down. */
  stepButton(pressed: boolean): void {
    if (this.done) return;
    let up = pressed;
    if (this.config.holdToToggle) {
      if (pressed && !this.wasPressed) this.latched = !this.latched;
      up = this.latched;
    }
    this.wasPressed = pressed;
    const delta = this.config.oneButtonRatePerS * this.dtS * (up ? 1 : -1);
    this.target = Math.min(1, Math.max(this.config.throttleMin, this.target + delta));
    this.advance();
  }

  private advance(): void {
    const t = (this.step + 1) * this.dtS;
    // Engine lag: first-order response towards the lever (game simplification).
    const k = 1 - Math.exp(-this.dtS / this.config.engineLagS);
    this.throttle += (this.target - this.throttle) * k;
    // Game simplification: the load follows thrust squared at once (see the file header).
    this.loadKpa = this.curve.qFullKpa(t) * this.throttle * this.throttle;
    this.zone = this.loadKpa > this.config.bandHiKpa ? 1 : this.loadKpa < this.config.bandLoKpa ? -1 : 0;
    if (this.zone === 0) this.inBandSteps++;
    else if (this.zone === 1) this.overSteps++;
    else this.underSteps++;
    this.loadHistory[this.step] = this.loadKpa;
    this.zoneHistory[this.step] = this.zone;
    this.step++;
  }

  score(): Mg08Score {
    return scoreRun(this.inBandSteps, this.totalSteps, this.config);
  }
}

/**
 * Converts elapsed real time into whole simulation steps, so that the run does not depend on
 * the frame rate: 60 fps, 30 fps or a stalled tab all produce the same number of steps.
 */
export class FixedStepper {
  private elapsedMs = 0;
  private emitted = 0;

  /** Adds `dtMs` of play time and returns how many new steps are due. */
  advance(dtMs: number): number {
    if (dtMs > 0) this.elapsedMs += dtMs;
    const due = Math.floor((this.elapsedMs * STEP_HZ) / 1000 + 1e-6);
    const n = due - this.emitted;
    this.emitted = due;
    return n;
  }
}

/**
 * Lever position that aims at the middle of the band `leadS` seconds ahead. Used by the demo
 * loop and by the tests; players do not get it.
 */
export function autopilotLever(config: Mg08Config, curve: Mg08Curve, tS: number, leadS = 0.2): number {
  const centre = (config.bandLoKpa + config.bandHiKpa) / 2;
  const q = curve.qFullKpa(Math.min(curve.durationS, tS + leadS));
  return Math.min(1, Math.max(config.throttleMin, Math.sqrt(centre / q)));
}

/** One-button autopilot: press while the stress line is below the middle of the band. */
export function autopilotButton(config: Mg08Config, sim: Mg08Sim): boolean {
  const centre = (config.bandLoKpa + config.bandHiKpa) / 2;
  const q = sim.curve.qFullKpa(sim.timeS + 0.25);
  return q * sim.target * sim.target < centre;
}

/** Runs a whole game with a scripted lever. For tests and tools. */
export function runScripted(config: Mg08Config, seed: number, durationS: number, lever: (sim: Mg08Sim) => number): Mg08Sim {
  const sim = new Mg08Sim(config, createCurve(config, seed, durationS));
  while (!sim.done) sim.stepLever(lever(sim));
  return sim;
}
