// MG-21 Science Capture: simulation and scoring. Pure: no DOM, no clock, no Math.random.
//
// A ground track scrolls over a stylised top-down Earth. Targets (hurricane, wildfire,
// glacier, city lights, algae bloom) pass under it. Point the camera frame across the track and
// snap while a target is inside the frame. Clouds spoil optical captures unless the payload is
// a radar (`params.radar`).
//
// What is physical and what is a game simplification
// ---------------------------------------------------
// PHYSICAL (qualitative, the principles behind two Decisions)
//   • An optical camera records reflected sunlight: clouds hide the ground and the night side is
//     dark, so optical targets are placed on the day side, except city lights, which are only
//     visible at night.
//   • An imaging radar sends its own microwaves: it sees through clouds and at night, but it does
//     not record visible light, so city lights are never offered to a radar.
//   • A hurricane is made of clouds: clouds never spoil a hurricane capture.
// GAME SIMPLIFICATIONS (game values)
//   • Units: the half-width of the swath the camera can point across = 1. Ground speed,
//     frame size, the number of targets, cloud size and drift, shutter recovery and the
//     framing tolerance are game values; real ground speed is about 7 km/s.
//   • One terminator crossing per run; the ground is drawn, not mapped.
import type { AssistLevel, MgMap, MinigameMode } from '@protocol';
import type { MinigameResult } from '../types';
import { assistFactor, boolParam, clamp, DT_S, intParam, mulberry32, numParam, STEP_HZ } from '../MG-13/kit';

export const DEFAULTS = {
  /** Success: at least this many good captures (data/minigames.json: 3). */
  good_captures_min: 3,
  /** Targets offered in one run (game value). */
  target_count: 6,
} as const;

export const TARGET_TYPES = ['hurricane', 'wildfire', 'glacier', 'city_lights', 'algae_bloom'] as const;
export type TargetType = (typeof TARGET_TYPES)[number];

/** Fraction of `durationMs` the Standard pass uses; Relaxed uses 97 % (game value). */
export const STANDARD_TIME_FRACTION = 0.75;
/** Time the shutter needs between shots, s (game value). */
export const SHUTTER_S = 0.3;
/** Target radius, swath half-widths (game value). */
export const TARGET_R = 0.1;

export interface Mg21Config {
  goodMin: number;
  targetCount: number;
  radar: boolean;
  /** Ground speed, swath half-widths per second. */
  speed: number;
  /** Camera frame half-size: across and along the track. */
  frameHalfW: number;
  frameHalfH: number;
  /** Fraction of the run the pass uses. */
  timeFraction: number;
  /** Fastest cross-track pointing, half-widths per second. */
  slewPerS: number;
  /** Share of optical targets with a cloud passing over them. */
  cloudShare: number;
  cloudR: number;
  oneButton: boolean;
}

/**
 * Host parameters + mode + difficulty → configuration. Relaxed: ground speed × 0.7 and frame
 * × 1.35 (the run uses 97 % of the time instead of 75 %). One-button: frame × 1.15 and the
 * camera points itself. Cadet: frame × 1.2, fewer clouds; Flight Director: frame × 0.85, more
 * clouds, speed × 1.1.
 */
export function resolveConfig(params: MgMap, mode: MinigameMode, assist: AssistLevel): Mg21Config {
  const count = intParam(params, 'target_count', DEFAULTS.target_count, 3, 10);
  const goodMin = intParam(params, 'good_captures_min', DEFAULTS.good_captures_min, 1, count);
  let frame = assistFactor(assist, 1.2, 0.85);
  let speed = assist === 'FLIGHT_DIRECTOR' ? 1.1 : 1;
  if (mode === 'RELAXED') {
    frame *= 1.35;
    speed *= 0.7;
  } else if (mode === 'ONE_BUTTON') frame *= 1.15;
  return {
    goodMin,
    targetCount: count,
    radar: boolParam(params, 'radar'),
    speed: 0.55 * speed * numParam(params, 'speed_scale', 1, 0.3, 2),
    frameHalfW: 0.32 * frame,
    frameHalfH: 0.36 * frame,
    timeFraction: mode === 'RELAXED' ? 0.97 : STANDARD_TIME_FRACTION,
    slewPerS: 2.6,
    cloudShare: assist === 'CADET' ? 0.35 : assist === 'FLIGHT_DIRECTOR' ? 0.75 : 0.55,
    cloudR: 0.24,
    oneButton: mode === 'ONE_BUTTON',
  };
}

export interface Target {
  index: number;
  type: TargetType;
  /** Along-track position (half-widths from the start) and cross-track position (−1…1). */
  s: number;
  x: number;
  night: boolean;
  /** Cloud over this target: lateral offset of its centre at time t = cloudX0 + cloudV·t. */
  cloud: boolean;
  cloudX0: number;
  cloudV: number;
  /** Capture result: 'none' until snapped well; the first good capture counts. */
  captured: boolean;
  capturedStep: number;
}

export interface Scene {
  targets: Target[];
  /** Along-track position of the day/night terminator, and whether the run starts on the day side. */
  terminatorS: number;
  dayFirst: boolean;
  /** Length of the pass, s, and the along-track length scrolled. */
  durationS: number;
  lengthS: number;
  /** Decorative clouds: along, across, radius, lateral drift per second. */
  clouds: Float32Array;
}

/** Along-track position of the frame centre at play time `tS` (starts below the first target). */
export function frameS(config: Mg21Config, tS: number): number {
  return config.speed * tS;
}

export function createScene(config: Mg21Config, seed: number, runS: number): Scene {
  const rnd = mulberry32(seed ^ 0x2121);
  const durationS = runS * config.timeFraction;
  const lengthS = config.speed * durationS;
  const n = config.targetCount;
  // Targets pass the frame between 1.6 s and 1.2 s before the end, evenly with some jitter.
  const t0 = Math.min(1.6, durationS * 0.12);
  const t1 = durationS - Math.min(1.2, durationS * 0.08);
  const dayFirst = rnd() < 0.6;
  const types: TargetType[] = [];
  // Optical: the run crosses the terminator; city lights sit on the night side. Radar: no
  // city lights. Each run shows variety: shuffle a list that repeats the allowed types.
  const allowed = TARGET_TYPES.filter((ty) => !(config.radar && ty === 'city_lights'));
  const nightCount = config.radar ? 0 : Math.max(1, Math.round(n / 4));
  const dayTypes = allowed.filter((ty) => ty !== 'city_lights');
  const pool: TargetType[] = [];
  while (pool.length < n - nightCount) pool.push(...dayTypes);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [pool[i], pool[j]] = [pool[j]!, pool[i]!];
  }
  const dayList = pool.slice(0, n - nightCount);
  for (let i = 0; i < n; i++) {
    const nightSlot = dayFirst ? i >= n - nightCount : i < nightCount;
    types.push(nightSlot ? 'city_lights' : dayList.shift() ?? 'glacier');
  }
  const gap = (t1 - t0) / Math.max(1, n - 1);
  const targets: Target[] = [];
  let prevX = 0;
  for (let i = 0; i < n; i++) {
    const tPass = t0 + i * gap + (rnd() - 0.5) * gap * 0.25;
    const s = config.speed * tPass;
    // Cross-track: alternate sides often enough that pointing matters.
    let x = (rnd() * 2 - 1) * 0.72;
    if (Math.abs(x - prevX) < 0.25) x = clamp(-Math.sign(prevX || 1) * (0.3 + 0.4 * rnd()), -0.72, 0.72);
    prevX = x;
    const type = types[i]!;
    // Clouds: never over a hurricane (it is clouds) or for a radar; otherwise either clearing
    // from the target as it enters the frame, or closing over it as it leaves, so every
    // target keeps a clear moment of at least ~0.45 s inside the frame.
    const cloudy = !config.radar && type !== 'hurricane' && rnd() < config.cloudShare;
    const windowS = (2 * (config.frameHalfH - TARGET_R / 2)) / config.speed;
    const enter = tPass - windowS / 2;
    const leave = tPass + windowS / 2;
    const v = (0.3 + 0.15 * rnd()) * (rnd() < 0.5 ? -1 : 1);
    const clears = rnd() < 0.5;
    const cover = Math.min(windowS * 0.35, 0.55); // how long the cloud sits on the target in the frame
    // Covered while |cloudX0 + v t| < 0.8 cloudR. Centre the covering time at enter + cover/2
    // (clears) or leave − cover/2 (closes), with the covered span ≈ 1.6 cloudR / |v|.
    const tc = clears ? enter + cover / 2 - (0.8 * config.cloudR) / Math.abs(v) + cover / 2 : leave - cover / 2 + (0.8 * config.cloudR) / Math.abs(v) - cover / 2;
    targets.push({ index: i, type, s, x, night: type === 'city_lights', cloud: cloudy, cloudX0: -v * tc, cloudV: v, captured: false, capturedStep: -1 });
  }
  // Terminator between the day and night groups (optical), or at a seeded place (radar).
  let terminatorS: number;
  if (nightCount > 0) {
    const lastDay = dayFirst ? targets[n - nightCount - 1]! : targets[nightCount]!;
    const firstNight = dayFirst ? targets[n - nightCount]! : targets[nightCount - 1]!;
    terminatorS = (lastDay.s + firstNight.s) / 2;
  } else terminatorS = lengthS * (0.55 + 0.3 * rnd());
  // Decorative clouds away from the targets.
  const deco = 14;
  const clouds = new Float32Array(deco * 4);
  for (let i = 0; i < deco; i++) {
    clouds[i * 4] = rnd() * (lengthS + 3) - 0.5;
    clouds[i * 4 + 1] = (rnd() * 2 - 1) * 1.15;
    clouds[i * 4 + 2] = 0.12 + 0.22 * rnd();
    clouds[i * 4 + 3] = (rnd() - 0.5) * 0.12;
  }
  return { targets, terminatorS, dayFirst, durationS, lengthS, clouds };
}

/** Lateral offset of a target's cloud from the target at play time `tS`. */
export function cloudOffset(t: Target, tS: number): number {
  return t.cloudX0 + t.cloudV * tS;
}

export function isClouded(config: Mg21Config, t: Target, tS: number): boolean {
  if (!t.cloud || config.radar || t.type === 'hurricane') return false;
  return Math.abs(cloudOffset(t, tS)) < config.cloudR * 0.8;
}

export type ShotOutcome = 'good' | 'cloudy' | 'framing' | 'empty' | 'again';

export interface Shot {
  step: number;
  outcome: ShotOutcome;
  target: number;
}

export interface Mg21Score {
  success: boolean;
  perfect: boolean;
  score: number;
}

/**
 * Success: good captures ≥ `goodMin` (exactly 3 counts). Perfect: every offered target captured
 * cleanly. Score: good captures / targets, minus 0.03 per wasted shot (empty, cloudy, badly
 * framed or repeated), within 0–1.
 */
export function scoreRun(good: number, targets: number, wasted: number, config: Pick<Mg21Config, 'goodMin'>): Mg21Score {
  const success = good >= config.goodMin;
  const perfect = success && good >= targets;
  const score = targets > 0 ? clamp(good / targets - 0.03 * wasted, 0, 1) : 0;
  return { success, perfect, score };
}

export class Mg21Sim {
  readonly config: Mg21Config;
  readonly scene: Scene;
  readonly totalSteps: number;
  step = 0;
  /** Camera frame cross-track centre and where the player asks for it. */
  fx = 0;
  aimX = 0;
  good = 0;
  wasted = 0;
  readonly shots: Shot[] = [];
  /** Steps until the shutter is ready again. */
  shutter = 0;
  private queued = false;

  constructor(config: Mg21Config, seed: number, runS: number) {
    this.config = config;
    this.scene = createScene(config, seed, runS);
    this.totalSteps = Math.max(1, Math.round(this.scene.durationS * STEP_HZ));
  }

  get done(): boolean {
    return this.step >= this.totalSteps;
  }

  get timeS(): number {
    return this.step * DT_S;
  }

  /** Along-track position of the frame centre now. */
  get s(): number {
    return frameS(this.config, this.timeS);
  }

  get lastShot(): Shot | null {
    return this.shots.length ? this.shots[this.shots.length - 1]! : null;
  }

  aim(x: number) {
    this.aimX = clamp(x, -1, 1);
  }

  snap() {
    this.queued = true;
  }

  /** The target the frame would photograph now (overlapping the frame, nearest its centre). */
  targetInFrame(): Target | null {
    const c = this.config;
    let best: Target | null = null;
    let bestD = Infinity;
    const s = this.s;
    for (const t of this.scene.targets) {
      const dx = Math.abs(t.x - this.fx);
      const ds = Math.abs(t.s - s);
      if (dx > c.frameHalfW + TARGET_R || ds > c.frameHalfH + TARGET_R) continue;
      const d = dx * dx + ds * ds;
      if (d < bestD) {
        bestD = d;
        best = t;
      }
    }
    return best;
  }

  /** Target fully inside the frame (centre within the frame inset by half a target radius). */
  framed(t: Target): boolean {
    const c = this.config;
    return Math.abs(t.x - this.fx) <= c.frameHalfW - TARGET_R / 2 && Math.abs(t.s - this.s) <= c.frameHalfH - TARGET_R / 2;
  }

  /** What a snap would give now. */
  wouldGet(): { outcome: ShotOutcome; target: Target | null } {
    const t = this.targetInFrame();
    if (!t) return { outcome: 'empty', target: null };
    if (t.captured) return { outcome: 'again', target: t };
    if (!this.framed(t)) return { outcome: 'framing', target: t };
    if (isClouded(this.config, t, this.timeS)) return { outcome: 'cloudy', target: t };
    return { outcome: 'good', target: t };
  }

  /** The next target not yet captured whose frame window has not passed. */
  nextTarget(): Target | null {
    const s = this.s;
    for (const t of this.scene.targets) if (!t.captured && t.s >= s - this.config.frameHalfH + TARGET_R / 2) return t;
    return null;
  }

  tick() {
    if (this.done) return;
    const c = this.config;
    if (c.oneButton) {
      const next = this.nextTarget();
      if (next) this.aimX = next.x;
    }
    const d = this.aimX - this.fx;
    const max = c.slewPerS * DT_S;
    this.fx += clamp(d, -max, max);
    if (this.shutter > 0) this.shutter--;
    if (this.queued) {
      this.queued = false;
      if (this.shutter === 0) {
        this.shutter = Math.round(SHUTTER_S * STEP_HZ);
        const { outcome, target } = this.wouldGet();
        this.shots.push({ step: this.step, outcome, target: target ? target.index : -1 });
        if (outcome === 'good' && target) {
          target.captured = true;
          target.capturedStep = this.step;
          this.good++;
        } else this.wasted++;
      }
    }
    this.step++;
  }

  score(): Mg21Score {
    return scoreRun(this.good, this.scene.targets.length, this.wasted, this.config);
  }

  result(): MinigameResult {
    const s = this.score();
    return { success: s.success, perfect: s.perfect, score: s.score };
  }
}

/**
 * Scripted good player: points at the next target (with a little lag) and snaps once the
 * target has been inside the frame and clear for 0.1 s.
 */
export class Mg21Autopilot {
  private goodSince = -1;
  apply(sim: Mg21Sim) {
    const next = sim.nextTarget();
    if (!sim.config.oneButton && next) sim.aim(next.x + 0.03 * Math.sin(sim.step / 17));
    const w = sim.wouldGet();
    if (w.outcome === 'good') {
      if (this.goodSince < 0) this.goodSince = sim.step;
      if (sim.step - this.goodSince >= 0.1 * STEP_HZ && sim.shutter === 0) {
        sim.snap();
        this.goodSince = -1;
      }
    } else this.goodSince = -1;
  }
}

export function runScripted(config: Mg21Config, seed: number, runS: number, input: (sim: Mg21Sim) => void): Mg21Sim {
  const sim = new Mg21Sim(config, seed, runS);
  while (!sim.done) {
    input(sim);
    sim.tick();
  }
  return sim;
}
