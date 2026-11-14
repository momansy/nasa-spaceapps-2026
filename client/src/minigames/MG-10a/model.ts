// MG-10a Staging Timing: the staging sequence, tap judging and scoring. Pure: no DOM, no
// clocks, no Math.random. Taps are judged by their own time stamps, so the result does not
// depend on the frame rate.
//
// Sequence (play seconds, all game values except where noted)
//   0 … cutoff     first stage burning, its propellant gauge drains to empty
//   cutoff         main-engine cutoff light (seeded 2.6–3.8 s)
//   sep            the green SEPARATE moment, 0.5 s after cutoff ("just after cutoff")
//   sep … ign      propellant settling: the upper stage's propellant must settle at the
//                  bottom of its tanks before its engine can light (fact F03). Seeded 1.8–2.6 s.
//   ign            the green IGNITE moment
// A tap counts when it is within ± tap_window_s of its moment (data: 0.3 s half-width).
// SEPARATE taps before cutoff are ignored (nothing to separate yet); IGNITE taps before the
// separation are ignored. The first counted tap of each step is judged; later taps do nothing.
// When the SEPARATE window passes without a tap, the backup sequencer separates (the step is
// missed); IGNITE likewise.
//
// What is physical: propellant must settle before an upper-stage engine starts (F03);
// staging after cutoff. Everything else (times, windows, the 0.5 s delay) is a game value; real
// separation-to-ignition gaps and settling methods vary by vehicle.
import type { AssistLevel, MgMap, MinigameMode } from '@protocol';
import { assistFactor, clamp, modeFactor, mulberry32, numParam, slotOf, STEP_HZ, StepSim, subSeed, type SimInput } from '../MG-09/shared/core';

export const DEFAULTS = {
  /** Half-width of each tap window, s (data/minigames.json; design 10.2 "within 0.3 s"). */
  tap_window_s: 0.3,
  /** Perfect: both taps within this, s (game value). */
  perfect_window_s: 0.1,
} as const;

/** SEPARATE moment after the cutoff light, s (game value). */
export const SEP_DELAY_S = 0.5;
/** Time the result stays on screen after the last step, s (game value). */
const AFTER_S = 1.2;
/**
 * The backup sequencer acts this long after a window closes, so that a tap stamped inside the
 * window but delivered after a slow frame is still judged the same way live as in the replay.
 */
const GRACE_S = 0.2;

export interface Mg10aConfig {
  windowS: number;
  perfectWindowS: number;
  oneButton: boolean;
}

/**
 * Relaxed ×5/3 (0.5 s), Cadet ×1.25, Flight Director ×0.8 on the window half-width (game
 * values). One-button keeps the standard window: it changes the input, not the timing.
 */
export function resolveConfig(params: MgMap, mode: MinigameMode, assist: AssistLevel): Mg10aConfig {
  const base = numParam(params, 'tap_window_s', DEFAULTS.tap_window_s, 0.05, 2);
  const windowS = base * assistFactor(assist, 1.25, 0.8) * modeFactor(mode, 5 / 3);
  const perfect = Math.min(windowS, numParam(params, 'perfect_window_s', DEFAULTS.perfect_window_s, 0.01, 2));
  return { windowS, perfectWindowS: perfect, oneButton: mode === 'ONE_BUTTON' };
}

export interface CrewTap {
  /** Offset from the moment, s (null = missed it). */
  sep: number | null;
  ign: number | null;
}

export interface Mg10aPlan {
  cutoffS: number;
  sepS: number;
  settleS: number;
  ignS: number;
  /** First-stage propellant left at the start, fraction (drains to 0 at cutoff). */
  prop0: number;
  /** Seeded teammates for solo display ("crew"), one per other slot. */
  crew: CrewTap[];
}

/** Draws the staging timeline from the seed (shared by every phone) and the crew from seed + slot. */
export function createPlan(seed: number, durationS: number, slots: number, slot: number): Mg10aPlan {
  const rnd = mulberry32(seed ^ 0x10a10a);
  let cutoffS = 2.6 + 1.2 * rnd();
  const settleS = 1.8 + 0.8 * rnd();
  // Keep the whole sequence (plus the widest window and the result) inside the play time.
  const latest = durationS - AFTER_S - GRACE_S - 0.6 - settleS - SEP_DELAY_S;
  cutoffS = clamp(Math.min(cutoffS, latest), 0.8, Math.max(0.8, latest));
  const sepS = cutoffS + SEP_DELAY_S;
  const crewRnd = mulberry32(subSeed(seed, 1000 + slot));
  const crew: CrewTap[] = [];
  for (let i = 0; i < Math.max(0, slots - 1); i++) {
    const one = () => {
      const r = crewRnd();
      if (r < 0.06) return null;
      // Mostly tight, sometimes late (game values).
      const spread = r < 0.8 ? 0.12 : 0.35;
      return Math.round((crewRnd() + crewRnd() - 1) * spread * 1000) / 1000;
    };
    crew.push({ sep: one(), ign: one() });
  }
  return { cutoffS, sepS, settleS, ignS: sepS + settleS, prop0: 0.18 + 0.1 * rnd(), crew };
}

export type StepResult = { dtS: number; ok: boolean } | null;

export interface Mg10aScore {
  success: boolean;
  perfect: boolean;
  score: number;
}

/** Score of one tap: 1 on the moment, 0.5 at the window edge, 0 at twice the window or missed. */
export function tapScore(r: StepResult, windowS: number): number {
  if (!r) return 0;
  return clamp(1 - Math.abs(r.dtS) / (2 * windowS), 0, 1);
}

/** Success: both taps within ± window (inclusive). Perfect: both within ± perfect window. */
export function scoreTaps(sep: StepResult, ign: StepResult, config: Mg10aConfig): Mg10aScore {
  const inW = (r: StepResult, w: number) => !!r && Math.abs(r.dtS) <= w + 1e-9;
  const success = inW(sep, config.windowS) && inW(ign, config.windowS);
  const perfect = success && inW(sep, config.perfectWindowS) && inW(ign, config.perfectWindowS);
  return { success, perfect, score: (tapScore(sep, config.windowS) + tapScore(ign, config.windowS)) / 2 };
}

/** Input `k`: `sep`, `ign` (two-button mode) or `p` (one button: the next step). */
export class Mg10aSim extends StepSim {
  readonly config: Mg10aConfig;
  readonly plan: Mg10aPlan;
  /** Separation done (by tap or backup), and when, s. */
  separated = false;
  sepAtS = -1;
  ignited = false;
  ignAtS = -1;
  sep: StepResult = null;
  ign: StepResult = null;
  /** SEPARATE / IGNITE taps that came too soon to count (before cutoff / before separation). */
  ignoredTaps = 0;
  private endS = Infinity;

  constructor(config: Mg10aConfig, plan: Mg10aPlan, durationMs: number) {
    super(durationMs);
    this.config = config;
    this.plan = plan;
  }

  get cutoff(): boolean {
    return this.timeS >= this.plan.cutoffS;
  }

  /** First-stage propellant now, fraction of the tank. */
  get prop(): number {
    return this.plan.prop0 * clamp(1 - this.timeS / this.plan.cutoffS, 0, 1);
  }

  /** Settling progress 0–1 (from the SEPARATE moment to the IGNITE moment). */
  get settle(): number {
    return clamp((this.timeS - this.plan.sepS) / this.plan.settleS, 0, 1);
  }

  /** Which step a press goes to now. */
  get nextStep(): 'sep' | 'ign' | 'done' {
    return !this.separated ? 'sep' : !this.ignited ? 'ign' : 'done';
  }

  protected apply(input: SimInput): void {
    const tS = input.t / 1000;
    let k = input.k;
    if (k === 'p') {
      if (!this.config.oneButton) return;
      k = this.nextStep;
    } else if (this.config.oneButton) return;
    if (k === 'sep') this.trySep(tS);
    else if (k === 'ign') this.tryIgn(tS);
  }

  private trySep(tS: number) {
    if (this.separated) return;
    if (tS < this.plan.cutoffS) {
      this.ignoredTaps++;
      return;
    }
    const dtS = tS - this.plan.sepS;
    this.sep = { dtS, ok: Math.abs(dtS) <= this.config.windowS + 1e-9 };
    this.separated = true;
    this.sepAtS = tS;
  }

  private tryIgn(tS: number) {
    if (this.ignited) return;
    if (!this.separated) {
      this.ignoredTaps++;
      return;
    }
    const dtS = tS - this.plan.ignS;
    this.ign = { dtS, ok: Math.abs(dtS) <= this.config.windowS + 1e-9 };
    this.ignited = true;
    this.ignAtS = tS;
    this.endS = Math.max(tS, this.plan.ignS) + AFTER_S;
  }

  protected tick(): void {
    // Start of this step: a tap stamped exactly on a window edge is applied before it.
    const tS = this.step / STEP_HZ;
    const w = this.config.windowS;
    // Backup sequencer when a window passes untouched.
    if (!this.separated && tS > this.plan.sepS + w + GRACE_S) {
      this.separated = true;
      this.sepAtS = this.plan.sepS + w;
    }
    if (this.separated && !this.ignited && tS > this.plan.ignS + w + GRACE_S) {
      this.ignited = true;
      this.ignAtS = this.plan.ignS + w;
      this.endS = this.ignAtS + AFTER_S;
    }
    if (tS >= this.endS) this.ended = true;
  }

  score(): Mg10aScore {
    return scoreTaps(this.sep, this.ign, this.config);
  }
}

export function newSim(config: Mg10aConfig, params: MgMap, seed: number, durationMs: number): Mg10aSim {
  const { slot, slots } = slotOf(params);
  return new Mg10aSim(config, createPlan(seed, durationMs / 1000, slots, slot), durationMs);
}

/** Scripted player: taps `sepDt` / `ignDt` seconds off each moment. */
export function tapInputs(sim: Mg10aSim, sepDt = 0.05, ignDt = 0.05): SimInput[] {
  const p = sim.plan;
  if (sim.config.oneButton) {
    return [
      { t: Math.round((p.sepS + sepDt) * 1000), k: 'p' },
      { t: Math.round((p.ignS + ignDt) * 1000), k: 'p' },
    ];
  }
  return [
    { t: Math.round((p.sepS + sepDt) * 1000), k: 'sep' },
    { t: Math.round((p.ignS + ignDt) * 1000), k: 'ign' },
  ];
}
