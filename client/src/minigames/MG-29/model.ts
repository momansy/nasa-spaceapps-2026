// MG-29 Predict the Physics: question bank, timeline and scoring. Pure: no DOM, no clock,
// no Math.random.
//
// Each question is player-facing physics; the README gives the principle and the fact id
// where the bank has one. The animation after the choice always shows the true outcome.
// GAME VALUES: choosing time 50 % of `durationMs` (Relaxed 65 %, One-button 62 %; Cadet ×1.2,
// Flight Director ×0.8), animation 3.6 s, one-button dwell 1.0 s per answer.
import type { AssistLevel, MgMap, MinigameMode } from '@protocol';
import type { MinigameResult } from '../types';
import { assistFactor, clamp, DT_S, mulberry32, STEP_HZ } from '../MG-02/kit';

export interface Question {
  /** String id: `minigame.MG-29.q.<id>.*`. */
  id: string;
  /** Number of answers (2 or 3). */
  choices: 2 | 3;
  /** Index of the correct answer. */
  answer: number;
  /** Fact bank id behind the question, or null (textbook mechanics, see the README). */
  fact: string | null;
}

/** The bank (order is the `params.question` index). */
export const QUESTIONS: readonly Question[] = [
  { id: 'hammer_feather', choices: 3, answer: 2, fact: 'F32' },
  { id: 'iss_float', choices: 2, answer: 1, fact: 'F06' },
  { id: 'coast', choices: 3, answer: 1, fact: 'F12' },
  { id: 'orbit_speed', choices: 3, answer: 0, fact: 'F05' },
  { id: 'sideways_drop', choices: 3, answer: 2, fact: null },
  { id: 'moon_pendulum', choices: 3, answer: 1, fact: null },
  { id: 'rocket_vacuum', choices: 2, answer: 0, fact: null },
  { id: 'spin_arms', choices: 3, answer: 0, fact: null },
  { id: 'push_off', choices: 3, answer: 0, fact: null },
];

/** Length of the answer animation, s (game value). */
export const ANIM_S = 3.6;

export interface Mg29Config {
  /** Index into QUESTIONS, or −1 to let the seed choose. */
  question: number;
  /** Time to choose and lock, s. */
  chooseS: number;
  animS: number;
  oneButton: boolean;
  /** One-button: time each answer stays highlighted, s. */
  dwellS: number;
  /** Perfect: locked within this fraction of the choosing time (brief: the first half). */
  perfectFraction: number;
}

export function resolveConfig(params: MgMap, mode: MinigameMode, assist: AssistLevel, durationS: number): Mg29Config {
  const a = assistFactor(assist, 1.2, 0.8);
  const base = mode === 'RELAXED' ? 0.65 : mode === 'ONE_BUTTON' ? 0.62 : 0.5;
  const animS = Math.min(ANIM_S, Math.max(1.5, durationS * 0.36));
  // Choosing plus the animation never exceeds the play time.
  const chooseS = clamp(durationS * base * a, 1.5, Math.max(1.5, durationS - animS - 0.2));
  const q = params['question'];
  return {
    question: typeof q === 'number' && Number.isInteger(q) && q >= 0 && q < QUESTIONS.length ? q : -1,
    chooseS,
    animS,
    oneButton: mode === 'ONE_BUTTON',
    dwellS: 1.0 * a * (mode === 'RELAXED' ? 1.2 : 1),
    perfectFraction: 0.5,
  };
}

/** The question of a run: `params.question` when given, otherwise seeded. */
export function pickQuestion(config: Mg29Config, seed: number): number {
  if (config.question >= 0) return config.question;
  return Math.floor(mulberry32(seed ^ 0x29) () * QUESTIONS.length) % QUESTIONS.length;
}

export interface Mg29Score extends MinigameResult {
  correct: boolean;
}

/**
 * Success: the correct answer (shown at button `correctSlot`) was locked before the animation.
 * Perfect: and within the first half of the choosing time (exactly half counts). Score: 0 when
 * wrong or not locked, else 1 − 0.5 × (lock time / choosing time), 0.5–1.
 */
export function scoreRun(config: Pick<Mg29Config, 'chooseS' | 'perfectFraction'>, correctSlot: number, locked: number, lockedAtS: number): Mg29Score {
  const correct = locked === correctSlot && locked >= 0 && lockedAtS >= 0 && lockedAtS <= config.chooseS + 1e-9;
  const perfect = correct && lockedAtS <= config.chooseS * config.perfectFraction + 1e-9;
  const score = correct ? clamp(1 - 0.5 * (lockedAtS / config.chooseS), 0.5, 1) : 0;
  return { success: correct, perfect, score, correct };
}

export type Phase = 'choose' | 'anim' | 'done';

export class Mg29Sim {
  readonly config: Mg29Config;
  readonly qIndex: number;
  readonly q: Question;
  /** Seeded order of the answers: button i shows answer `order[i]`. */
  readonly order: number[];
  /** Button that shows the correct answer. */
  readonly correctSlot: number;
  /** One-button: seeded first highlighted button. */
  private readonly hiStart: number;
  step = 0;
  /** Locked answer, −1 none. */
  locked = -1;
  lockedAtS = -1;
  /** Animation start, s (the lock, or the end of the choosing time). */
  animAtS = -1;

  constructor(config: Mg29Config, seed: number) {
    this.config = config;
    this.qIndex = pickQuestion(config, seed);
    this.q = QUESTIONS[this.qIndex]!;
    const rnd = mulberry32(seed ^ 0x2929a);
    const order = Array.from({ length: this.q.choices }, (_, i) => i);
    for (let k = order.length - 1; k > 0; k--) {
      const j = Math.floor(rnd() * (k + 1));
      [order[k], order[j]] = [order[j]!, order[k]!];
    }
    this.order = order;
    this.correctSlot = order.indexOf(this.q.answer);
    this.hiStart = Math.floor(rnd() * this.q.choices);
  }

  get timeS(): number {
    return this.step * DT_S;
  }

  get phase(): Phase {
    if (this.animAtS < 0) return 'choose';
    return this.timeS >= this.animAtS + this.config.animS ? 'done' : 'anim';
  }

  get done(): boolean {
    return this.phase === 'done';
  }

  /** Choosing time left, s. */
  get chooseLeftS(): number {
    return this.animAtS >= 0 ? 0 : Math.max(0, this.config.chooseS - this.timeS);
  }

  /** Animation progress 0–1. */
  get animK(): number {
    return this.animAtS < 0 ? 0 : clamp((this.timeS - this.animAtS) / this.config.animS, 0, 1);
  }

  /** One-button: highlighted answer (cycles from the first one). */
  highlight(): number {
    if (!this.config.oneButton || this.phase !== 'choose') return -1;
    return (this.hiStart + Math.floor(this.timeS / this.config.dwellS)) % this.q.choices;
  }

  /** Locks an answer while choosing. Returns true when it was taken. */
  lock(choice: number): boolean {
    if (this.phase !== 'choose' || this.locked >= 0 || choice < 0 || choice >= this.q.choices) return false;
    this.locked = choice;
    this.lockedAtS = this.timeS;
    this.animAtS = this.timeS;
    return true;
  }

  /** One-button press: locks the highlighted answer. */
  press(): boolean {
    const h = this.highlight();
    return h >= 0 && this.lock(h);
  }

  tick(): void {
    if (this.done) return;
    this.step++;
    if (this.animAtS < 0 && this.timeS >= this.config.chooseS - 1e-9) this.animAtS = this.config.chooseS;
  }

  score(): Mg29Score {
    return scoreRun(this.config, this.correctSlot, this.locked, this.lockedAtS);
  }

  result(): MinigameResult {
    const s = this.score();
    return { success: s.success, perfect: s.perfect, score: s.score };
  }
}

/** Scripted good player: locks the right answer `reactS` in (one-button: on its highlight). */
export class Mg29Autopilot {
  private hiSince = -1;
  private hi = -1;
  constructor(private readonly reactS = 1.2) {}

  apply(sim: Mg29Sim): void {
    if (sim.phase !== 'choose' || sim.locked >= 0) return;
    if (sim.config.oneButton) {
      const h = sim.highlight();
      if (h !== this.hi) {
        this.hi = h;
        this.hiSince = sim.timeS;
      }
      if (h === sim.correctSlot && sim.timeS - this.hiSince >= Math.min(0.3, sim.config.dwellS * 0.4)) sim.press();
      return;
    }
    if (sim.timeS >= this.reactS) sim.lock(sim.correctSlot);
  }
}

export function runScripted(config: Mg29Config, seed: number, player: ((sim: Mg29Sim) => void) | null): Mg29Sim {
  const sim = new Mg29Sim(config, seed);
  while (!sim.done) {
    player?.(sim);
    sim.tick();
  }
  return sim;
}

/** Steps in a whole run when nothing is locked (for the host deadline checks). */
export function maxSteps(config: Mg29Config): number {
  return Math.round((config.chooseS + config.animS) * STEP_HZ);
}

