// MG-02 Rocket Equation Balance: rules and scoring. Pure: no DOM, no clock, no Math.random.
//
// PHYSICAL
//   Tsiolkovsky rocket equation  Δv = Isp · g0 · ln(m0 / mf)                     [m/s]
//   g0 = 9.80665 m/s² (standard gravity, by definition).
//   m0 = dry + payload + n · block (wet mass), mf = dry + payload (burn-out mass).
//   Every block adds the same propellant mass, so each adds less Δv than the one before:
//   Δv(n) − Δv(n−1) = Isp · g0 · ln(1 + block / (mf + (n−1) · block)), which shrinks with n.
// GAME SIMPLIFICATIONS (game values)
//   • One stage, propellant only (tank mass is not added per block), no gravity or drag loss.
//   • The target band is placed so that it admits exactly n*, n*+1 and n*+2 blocks; the
//     needle is a damped pointer that swings after each drop (a balance, not a flight
//     computer). The result reads the settled value Δv(n) at the deadline.
//   • Isp 320 s, 4 t dry, 1 t payload, 2 t blocks; n* seeded from 4 to 8 blocks.
//   • Handling time: a block takes 0.45 s to place or lift (game value); moves wait in a queue.
import type { AssistLevel, MgMap, MinigameMode } from '@protocol';
import type { MinigameResult } from '../types';
import { assistFactor, boolParam, clamp, DT_S, intParam, mulberry32, numParam, STANDARD_TIME_FRACTION, STEP_HZ } from './kit';

/** Standard gravity, m/s² (physical, by definition). */
export const G0 = 9.80665;

/** Host parameter defaults (`mg.start.params`), game values unless noted. */
export const DEFAULTS = {
  /** Specific impulse, s (game value in a real-world range for a kerosene upper stage). */
  isp_s: 320,
  /** Stage dry mass, t. */
  dry_mass_t: 4,
  /** Payload mass, t. */
  payload_t: 1,
  /** Propellant per block, t. */
  block_t: 2,
  /** Success: extra blocks beyond n* at most (data/minigames.json `extra_blocks_max`, ≤). */
  extra_blocks_max: 1,
  /** Most blocks the pan holds. */
  max_blocks: 14,
} as const;

/** Seeded n* range (game value). */
export const N_STAR_MIN = 4;
export const N_STAR_MAX = 8;
/** Time to place or lift one block, s (game value). */
export const HANDLING_S = 0.45;
/** Needle natural frequency, Hz (game value). */
const NEEDLE_HZ = 1.15;

export interface Mg02Config {
  ispS: number;
  dryT: number;
  payloadT: number;
  blockT: number;
  maxBlocks: number;
  extraBlocksMax: number;
  /** Host target Δv (band centre), m/s, or null for a seeded target. */
  targetDvMs: number | null;
  /** Host band width, m/s, or null for the automatic band. */
  bandMs: number | null;
  /** How far the automatic band reaches into the neighbouring gaps (0–0.5, game value). */
  gapFraction: number;
  /** Needle damping ratio (game value). */
  needleDamping: number;
  handlingS: number;
  /** Play ends (the scale is read) after this many seconds. */
  playS: number;
  oneButton: boolean;
  /** One-button mode: the run always starts below the band (blocks cannot be removed). */
  startBelowOnly: boolean;
  /** Show the next block's Δv before it is dropped (Cadet aid). */
  showNext: boolean;
}

/**
 * Host parameters + mode + difficulty → one run's configuration.
 * Band reach into the gaps: Standard 0.30; Relaxed ×1.5; Cadet ×1.25; Flight Director ×0.75.
 * Needle damping: Standard 0.32, Cadet 0.45, Flight Director 0.22 (settles faster when higher).
 * Play time: Standard and One-button 75 % of `durationMs`, Relaxed the full time.
 */
export function resolveConfig(params: MgMap, mode: MinigameMode, assist: AssistLevel, durationS: number): Mg02Config {
  let gap = 0.3 * assistFactor(assist, 1.25, 0.75);
  if (mode === 'RELAXED') gap *= 1.5;
  const target = params['target_dv_ms'];
  const band = params['band_ms'];
  return {
    ispS: numParam(params, 'isp_s', DEFAULTS.isp_s, 100, 500),
    dryT: numParam(params, 'dry_mass_t', DEFAULTS.dry_mass_t, 0.5, 200),
    payloadT: numParam(params, 'payload_t', DEFAULTS.payload_t, 0, 200),
    blockT: numParam(params, 'block_t', DEFAULTS.block_t, 0.1, 200),
    maxBlocks: intParam(params, 'max_blocks', DEFAULTS.max_blocks, 6, 20),
    extraBlocksMax: intParam(params, 'extra_blocks_max', DEFAULTS.extra_blocks_max, 0, 10),
    targetDvMs: typeof target === 'number' && Number.isFinite(target) && target > 0 ? target : null,
    bandMs: typeof band === 'number' && Number.isFinite(band) && band > 0 ? band * (mode === 'RELAXED' ? 1.3 : 1) : null,
    gapFraction: clamp(gap, 0.05, 0.48),
    needleDamping: assist === 'CADET' ? 0.45 : assist === 'FLIGHT_DIRECTOR' ? 0.22 : 0.32,
    handlingS: HANDLING_S,
    playS: durationS * (mode === 'RELAXED' ? 1 : STANDARD_TIME_FRACTION),
    oneButton: mode === 'ONE_BUTTON',
    startBelowOnly: mode === 'ONE_BUTTON' || boolParam(params, 'start_below', false),
    showNext: assist === 'CADET' || mode === 'RELAXED',
  };
}

/** PHYSICAL: Δv with `n` blocks, m/s. */
export function deltaV(config: Pick<Mg02Config, 'ispS' | 'dryT' | 'payloadT' | 'blockT'>, n: number): number {
  const mf = config.dryT + config.payloadT;
  return config.ispS * G0 * Math.log((mf + Math.max(0, n) * config.blockT) / mf);
}

/** Δv added by block number `k` (1-based), m/s. Shrinks as k grows. */
export function marginalDv(config: Pick<Mg02Config, 'ispS' | 'dryT' | 'payloadT' | 'blockT'>, k: number): number {
  return deltaV(config, k) - deltaV(config, k - 1);
}

/** Mass ratio m0 / mf with `n` blocks. */
export function massRatio(config: Pick<Mg02Config, 'dryT' | 'payloadT' | 'blockT'>, n: number): number {
  const mf = config.dryT + config.payloadT;
  return (mf + n * config.blockT) / mf;
}

export interface Mg02Plan {
  /** Fewest blocks that reach the band. */
  nStar: number;
  /** Blocks on the pan at the start. */
  n0: number;
  /** Target band, m/s. */
  loMs: number;
  hiMs: number;
}

/** Seeds the target and the start. The band admits n*, n*+1, n*+2 (automatic band). */
export function createPlan(config: Mg02Config, seed: number): Mg02Plan {
  const rnd = mulberry32(seed ^ 0x02a7);
  const dv = (n: number) => deltaV(config, n);
  const maxStar = Math.max(1, Math.min(N_STAR_MAX, config.maxBlocks - 3));
  let nStar = Math.min(maxStar, N_STAR_MIN + Math.floor(rnd() * (N_STAR_MAX - N_STAR_MIN + 1)));
  let lo: number;
  let hi: number;
  if (config.targetDvMs !== null && config.bandMs !== null) {
    lo = config.targetDvMs - config.bandMs / 2;
    hi = config.targetDvMs + config.bandMs / 2;
    nStar = 1;
    while (nStar < config.maxBlocks && dv(nStar) < lo) nStar++;
    if (dv(nStar) > hi) hi = dv(nStar);
    lo = Math.max(lo, dv(nStar - 1) + 1e-6);
  } else {
    if (config.targetDvMs !== null) {
      nStar = 1;
      while (nStar < maxStar && dv(nStar) < config.targetDvMs) nStar++;
    }
    const g = config.gapFraction;
    lo = dv(nStar) - g * (dv(nStar) - dv(nStar - 1));
    hi = dv(nStar + 2) + g * (dv(nStar + 3) - dv(nStar + 2));
  }
  // Start outside the band: below (0 … n*−2) or, unless one-button, above (n*+3 … n*+5).
  const below = config.startBelowOnly || rnd() < 0.5;
  let n0: number;
  if (below) n0 = Math.floor(rnd() * Math.max(1, nStar - 1));
  else n0 = Math.min(config.maxBlocks, nStar + 3 + Math.floor(rnd() * 3));
  while (n0 > 0 && dv(n0) >= lo && dv(n0) <= hi) n0--; // never start in the band
  return { nStar, n0, loMs: lo, hiMs: hi };
}

export interface Mg02Score extends MinigameResult {
  inBand: boolean;
  extra: number;
}

/**
 * Scoring at the deadline. Success: Δv(n) in the band and n − n* ≤ `extraBlocksMax`.
 * Perfect: n = n* (implies success). Score: 1 at n*, −0.25 per extra block; outside the band
 * at most 0.45, falling with the distance in blocks.
 */
export function scoreRun(config: Mg02Config, plan: Mg02Plan, n: number): Mg02Score {
  const dv = deltaV(config, n);
  const inBand = dv >= plan.loMs - 1e-9 && dv <= plan.hiMs + 1e-9;
  const extra = n - plan.nStar;
  const success = inBand && extra <= config.extraBlocksMax;
  const perfect = success && extra === 0;
  let score: number;
  if (inBand) score = clamp(1 - 0.25 * Math.max(0, extra), 0, 1);
  else {
    let k = 0;
    while (k <= config.maxBlocks && !(deltaV(config, k) >= plan.loMs && deltaV(config, k) <= plan.hiMs)) k++;
    const nearest = dv < plan.loMs ? plan.nStar : Math.max(plan.nStar, k);
    score = clamp(0.45 - 0.12 * Math.abs(n - nearest), 0, 0.45);
  }
  return { success, perfect, score, inBand, extra };
}

export type Mg02Move = 1 | -1;
/** Where the reading is: −1 below the band, 0 inside, +1 above. */
export type Zone = -1 | 0 | 1;

export class Mg02Sim {
  readonly config: Mg02Config;
  readonly plan: Mg02Plan;
  readonly totalSteps: number;
  step = 0;
  /** Blocks on the pan. */
  n: number;
  adds = 0;
  removes = 0;
  /** Seconds left in the current placing / lifting. */
  busyS = 0;
  /** The move being handled (for the drawing): +1 placing, −1 lifting, 0 none. */
  moving: -1 | 0 | 1 = 0;
  /** Moves waiting for the hands (at most 3). */
  private queue: Mg02Move[] = [];
  /** Needle reading, m/s, and its rate, m/s per s. */
  needleMs: number;
  needleRate = 0;
  /** Time of the last completed move, s (−1 none). */
  lastMoveS = -1;
  constructor(config: Mg02Config, seed: number) {
    this.config = config;
    this.plan = createPlan(config, seed);
    this.n = this.plan.n0;
    this.needleMs = deltaV(config, this.n);
    this.totalSteps = Math.max(1, Math.round(config.playS * STEP_HZ));
  }

  get done(): boolean {
    return this.step >= this.totalSteps;
  }

  get timeS(): number {
    return this.step * DT_S;
  }

  get leftS(): number {
    return Math.max(0, (this.totalSteps - this.step) * DT_S);
  }

  /** Settled Δv with the blocks on the pan, m/s. */
  get dvMs(): number {
    return deltaV(this.config, this.n);
  }

  get zone(): Zone {
    const dv = this.dvMs;
    return dv < this.plan.loMs ? -1 : dv > this.plan.hiMs ? 1 : 0;
  }

  /** Blocks that will be on the pan once the queue is handled. */
  get pendingN(): number {
    let n = clamp(this.n + this.moving, 0, this.config.maxBlocks);
    for (const m of this.queue) n = clamp(n + m, 0, this.config.maxBlocks);
    return n;
  }

  /** Queues a move. Returns false when it cannot happen (full queue, empty or full pan, ended). */
  move(m: Mg02Move): boolean {
    if (this.done || this.queue.length >= 3) return false;
    if (m === -1 && this.config.oneButton) return false;
    const after = this.pendingN + m;
    if (after < 0 || after > this.config.maxBlocks) return false;
    this.queue.push(m);
    return true;
  }

  add(): boolean {
    return this.move(1);
  }

  remove(): boolean {
    return this.move(-1);
  }

  tick(): void {
    if (this.done) return;
    if (this.busyS > 0) {
      this.busyS -= DT_S;
      if (this.busyS <= 1e-9) {
        this.busyS = 0;
        this.n = clamp(this.n + this.moving, 0, this.config.maxBlocks);
        if (this.moving === 1) this.adds++;
        else if (this.moving === -1) this.removes++;
        this.moving = 0;
        this.lastMoveS = this.timeS;
      }
    }
    if (this.busyS === 0 && this.queue.length > 0) {
      this.moving = this.queue.shift()!;
      this.busyS = this.config.handlingS;
    }
    // Damped needle (game value): x'' = ω²(target − x) − 2ζω x'.
    const w = 2 * Math.PI * NEEDLE_HZ;
    const target = deltaV(this.config, this.n);
    const acc = w * w * (target - this.needleMs) - 2 * this.config.needleDamping * w * this.needleRate;
    this.needleRate += acc * DT_S;
    this.needleMs += this.needleRate * DT_S;
    this.step++;
  }

  score(): Mg02Score {
    return scoreRun(this.config, this.plan, this.n);
  }

  result(): MinigameResult {
    const s = this.score();
    return { success: s.success, perfect: s.perfect, score: s.score };
  }
}

/**
 * Scripted good player (tests, demo, lab `auto=1`): waits `reactS` after each move settles,
 * then adds while the reading is below the band and lifts while a block fewer would still
 * read in the band. One-button: presses while below the band.
 */
export class Mg02Autopilot {
  private waitS = 0;
  constructor(private readonly reactS = 0.35) {}

  /** Decides before a tick. Returns the move made, if any. */
  apply(sim: Mg02Sim): Mg02Move | 0 {
    if (sim.busyS > 0 || sim.pendingN !== sim.n) {
      this.waitS = this.reactS;
      return 0;
    }
    if (this.waitS > 0) {
      this.waitS -= DT_S;
      return 0;
    }
    const lo = sim.plan.loMs;
    const dvNow = deltaV(sim.config, sim.n);
    let m: Mg02Move | 0 = 0;
    if (dvNow < lo) m = 1;
    else if (!sim.config.oneButton && sim.n > 0 && (dvNow > sim.plan.hiMs || deltaV(sim.config, sim.n - 1) >= lo)) m = -1;
    if (m !== 0 && sim.move(m)) {
      this.waitS = this.reactS;
      return m;
    }
    return 0;
  }
}

/** Runs a whole game with a scripted player. For tests and tools. */
export function runScripted(config: Mg02Config, seed: number, player: ((sim: Mg02Sim) => void) | null): Mg02Sim {
  const sim = new Mg02Sim(config, seed);
  while (!sim.done) {
    player?.(sim);
    sim.tick();
  }
  return sim;
}
