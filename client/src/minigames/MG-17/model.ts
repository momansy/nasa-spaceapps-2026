// MG-17 Alarm Triage: simulation and scoring. Pure: no DOM, no clock, no Math.random.
//
// Alarm codes arrive; sort the oldest one into IGNORE, MONITOR or ACT using the cheat sheet of
// the player's role. The real program alarms 1201 and 1202 ("computer busy, still working",
// fact F13) are safe to continue: MONITOR. Every other code is fictional and generic, and is
// labelled as simulated on screen.
//
// Accuracy: only 1201 / 1202 are real (Apollo Guidance Computer program alarms meaning the
// computer was overloaded but kept the important tasks running). All other codes, texts and the
// cheat-sheet rules are game values written for this minigame.
import type { AssistLevel, MgMap, MinigameMode } from '@protocol';
import type { MinigameResult } from '../types';
import { assistFactor, clamp, DT_S, intParam, mulberry32, needSteps, numParam, STEP_HZ } from '../MG-13/kit';

export const BINS = ['ignore', 'monitor', 'act'] as const;
export type Bin = (typeof BINS)[number];
export type Category = 'PWR' | 'THM' | 'COM' | 'GNC' | 'PRP' | 'DAT';
export type Level = 'program' | 'advisory' | 'caution' | 'warning';

export interface AlarmDef {
  /** Code shown on the card, e.g. "PWR-03" or "1202". */
  code: string;
  /** String key suffix: minigame.MG-17.alarm.<key>. */
  key: string;
  category: Category | null;
  level: Level;
  /** True only for the real Apollo program alarms. */
  real: boolean;
}

/** The alarm catalogue (all fictional except 1201 and 1202). Code numbers 1–2 advisory, 4–5 caution, 7–9 warning. */
export const CATALOG: readonly AlarmDef[] = [
  { code: '1201', key: 'p1201', category: null, level: 'program', real: true },
  { code: '1202', key: 'p1202', category: null, level: 'program', real: true },
  { code: 'COM-02', key: 'com02', category: 'COM', level: 'advisory', real: false },
  { code: 'DAT-01', key: 'dat01', category: 'DAT', level: 'advisory', real: false },
  { code: 'THM-01', key: 'thm01', category: 'THM', level: 'advisory', real: false },
  { code: 'GNC-02', key: 'gnc02', category: 'GNC', level: 'advisory', real: false },
  { code: 'PWR-05', key: 'pwr05', category: 'PWR', level: 'caution', real: false },
  { code: 'THM-04', key: 'thm04', category: 'THM', level: 'caution', real: false },
  { code: 'COM-05', key: 'com05', category: 'COM', level: 'caution', real: false },
  { code: 'GNC-05', key: 'gnc05', category: 'GNC', level: 'caution', real: false },
  { code: 'PRP-04', key: 'prp04', category: 'PRP', level: 'caution', real: false },
  { code: 'PWR-07', key: 'pwr07', category: 'PWR', level: 'warning', real: false },
  { code: 'THM-09', key: 'thm09', category: 'THM', level: 'warning', real: false },
  { code: 'COM-08', key: 'com08', category: 'COM', level: 'warning', real: false },
  { code: 'GNC-07', key: 'gnc07', category: 'GNC', level: 'warning', real: false },
  { code: 'PRP-09', key: 'prp09', category: 'PRP', level: 'warning', real: false },
];

/** Roles in data/roles.json order; their own subsystems (game value). */
export const ROLE_IDS = ['FLIGHT', 'BOOSTER', 'STRUCT', 'GUIDO', 'FIDO', 'EECOM', 'INCO', 'PAYLOAD', 'RETRO', 'PM'] as const;
const ROLE_SYSTEMS: Record<string, Category[]> = {
  BOOSTER: ['PRP'],
  GUIDO: ['GNC'],
  FIDO: ['GNC'],
  EECOM: ['PWR', 'THM'],
  INCO: ['COM'],
  RETRO: ['PRP'],
};

/** Subsystems the role owns (empty = the generic sheet). `role` is an index or a role id. */
export function roleSystems(role: string | number | null): Category[] {
  if (role === null) return [];
  const id = typeof role === 'number' ? ROLE_IDS[role] : role;
  return id ? ROLE_SYSTEMS[id] ?? [] : [];
}

/**
 * Cheat sheet: program alarms 1201/1202 → MONITOR (safe to continue, keep watching);
 * advisory → IGNORE; caution → MONITOR, but ACT when it is in your own subsystem; warning → ACT.
 */
export function correctBin(a: AlarmDef, systems: readonly Category[]): Bin {
  if (a.level === 'program') return 'monitor';
  if (a.level === 'advisory') return 'ignore';
  if (a.level === 'warning') return 'act';
  return a.category && systems.includes(a.category) ? 'act' : 'monitor';
}

export const DEFAULTS = {
  /** Success: at least this fraction correct (data/minigames.json: 0.85). */
  correct_fraction_min: 0.85,
  /** Alarms in one run (game value). */
  alarm_count: 12,
} as const;

export interface Mg17Config {
  correctMin: number;
  count: number;
  systems: Category[];
  /** Time between arrivals, s, and the first arrival, s. */
  spacingS: number;
  firstS: number;
  timeFraction: number;
  oneButton: boolean;
  cycleS: number;
}

/**
 * Host parameters + mode + difficulty → configuration. Arrival spacing: Standard 1.0 s (the run
 * uses 75 % of the time), Relaxed × 1.45 ("alarm codes arrive more slowly", 97 % of the time);
 * Cadet × 1.2, Flight Director × 0.85. One-button: IGNORE, MONITOR, ACT highlighted in turn every
 * 1.1 s (Cadet 1.4 s, Flight Director 0.9 s), restarting with each new alarm; its alarms come
 * × 1.5 slower and it uses 97 % of the time (waiting for the highlight takes longer).
 */
export function resolveConfig(params: MgMap, mode: MinigameMode, assist: AssistLevel): Mg17Config {
  const roleP = params['role'];
  const role = typeof roleP === 'number' || typeof roleP === 'string' ? roleP : null;
  let spacing = 1.0 * assistFactor(assist, 1.2, 0.85);
  if (mode === 'RELAXED') spacing *= 1.45;
  else if (mode === 'ONE_BUTTON') spacing *= 1.5; // waiting for the highlight takes longer
  return {
    correctMin: numParam(params, 'correct_fraction_min', DEFAULTS.correct_fraction_min, 0.05, 1),
    // One-button sorts slower (waiting for the highlight): 8 alarms unless the host says otherwise.
    count: intParam(params, 'alarm_count', mode === 'ONE_BUTTON' ? 8 : DEFAULTS.alarm_count, 4, 20),
    systems: roleSystems(typeof role === 'number' ? Math.round(role) : role),
    spacingS: spacing,
    firstS: 0.6,
    timeFraction: mode === 'STANDARD' ? 0.75 : 0.97,
    oneButton: mode === 'ONE_BUTTON',
    cycleS: assist === 'CADET' ? 1.4 : assist === 'FLIGHT_DIRECTOR' ? 0.9 : 1.1,
  };
}

export interface Alarm {
  def: AlarmDef;
  answer: Bin;
  arriveStep: number;
  /** The player's bin and when (−1 = not yet). */
  given: Bin | null;
  givenStep: number;
}

/**
 * The run's alarms: both real program alarms, at least one caution in the player's own
 * subsystem when the role has one, then a seeded mix; shuffled; arrivals spaced evenly with a
 * little jitter, all before the last 2 s of the run.
 */
export function createAlarms(config: Mg17Config, seed: number, runS: number): Alarm[] {
  const rnd = mulberry32(seed ^ 0x1717);
  const pick = (list: readonly AlarmDef[]) => list[Math.floor(rnd() * list.length)]!;
  const defs: AlarmDef[] = [CATALOG[0]!, CATALOG[1]!];
  const own = CATALOG.filter((a) => a.level === 'caution' && a.category && config.systems.includes(a.category));
  if (own.length) defs.push(pick(own));
  const levels: Level[] = ['advisory', 'caution', 'warning', 'warning', 'advisory', 'caution'];
  let i = 0;
  while (defs.length < config.count) {
    const lv = levels[i++ % levels.length]!;
    defs.push(pick(CATALOG.filter((a) => a.level === lv)));
  }
  for (let k = defs.length - 1; k > 0; k--) {
    const j = Math.floor(rnd() * (k + 1));
    [defs[k], defs[j]] = [defs[j]!, defs[k]!];
  }
  const last = runS * config.timeFraction - 2;
  const spacing = Math.min(config.spacingS, (last - config.firstS) / Math.max(1, defs.length - 1));
  return defs.map((def, n) => ({
    def,
    answer: correctBin(def, config.systems),
    arriveStep: Math.round((config.firstS + n * spacing + (n > 0 ? (rnd() - 0.5) * spacing * 0.3 : 0)) * STEP_HZ),
    given: null,
    givenStep: -1,
  }));
}

export interface Mg17Score {
  success: boolean;
  perfect: boolean;
  score: number;
}

/** Success: correct ≥ `correctMin` × total (exactly 85 % counts). Perfect: all correct. */
export function scoreRun(correct: number, total: number, config: Pick<Mg17Config, 'correctMin'>): Mg17Score {
  if (total <= 0) return { success: false, perfect: false, score: 0 };
  const success = correct >= needSteps(config.correctMin, total);
  const perfect = success && correct >= total;
  return { success, perfect, score: clamp(correct / total, 0, 1) };
}

/** After the last alarm is sorted, play ends this long later, s. */
export const AFTER_LAST_S = 0.8;

export class Mg17Sim {
  readonly config: Mg17Config;
  readonly alarms: Alarm[];
  readonly totalSteps: number;
  step = 0;
  correct = 0;
  /** One-button: highlighted bin and the step its cycle started. */
  highlight = 0;
  private cycleStart = 0;
  private frontIndex = -1;
  private queued: Bin | 'button' | null = null;
  private endStep: number;

  constructor(config: Mg17Config, seed: number, runS: number) {
    this.config = config;
    this.alarms = createAlarms(config, seed, runS);
    this.totalSteps = Math.max(1, Math.round(runS * config.timeFraction * STEP_HZ));
    this.endStep = this.totalSteps;
  }

  get done(): boolean {
    return this.step >= this.endStep;
  }

  get timeS(): number {
    return this.step * DT_S;
  }

  get endsAt(): number {
    return this.endStep;
  }

  /** The oldest arrived alarm still waiting, or null. */
  get front(): Alarm | null {
    for (const a of this.alarms) if (a.given === null && a.arriveStep <= this.step) return a;
    return null;
  }

  /** Arrived alarms still waiting (front first). */
  waiting(out: Alarm[]): Alarm[] {
    out.length = 0;
    for (const a of this.alarms) if (a.given === null && a.arriveStep <= this.step) out.push(a);
    return out;
  }

  get handled(): number {
    let n = 0;
    for (const a of this.alarms) if (a.given !== null) n++;
    return n;
  }

  get lastHandled(): Alarm | null {
    let best: Alarm | null = null;
    for (const a of this.alarms) if (a.given !== null && (!best || a.givenStep > best.givenStep)) best = a;
    return best;
  }

  /** Sort the front alarm into `bin`. */
  sort(bin: Bin) {
    this.queued = bin;
  }

  /** One-button: choose the highlighted bin. */
  press() {
    this.queued = 'button';
  }

  tick() {
    if (this.done) return;
    const front = this.front;
    const q = this.queued;
    this.queued = null;
    if (q && front) {
      const bin = q === 'button' ? (this.config.oneButton ? BINS[this.highlight]! : null) : q;
      if (bin) {
        front.given = bin;
        front.givenStep = this.step;
        if (bin === front.answer) this.correct++;
        if (this.handled === this.alarms.length) this.endStep = Math.min(this.totalSteps, this.step + Math.round(AFTER_LAST_S * STEP_HZ));
      }
    }
    this.step++;
    if (this.config.oneButton) {
      const f = this.front;
      const idx = f ? this.alarms.indexOf(f) : -1;
      if (idx !== this.frontIndex) {
        this.frontIndex = idx;
        this.cycleStart = this.step;
      }
      const per = Math.max(1, Math.round(this.config.cycleS * STEP_HZ));
      this.highlight = Math.floor((this.step - this.cycleStart) / per) % BINS.length;
    }
  }

  score(): Mg17Score {
    return scoreRun(this.correct, this.alarms.length, this.config);
  }

  result(): MinigameResult {
    const s = this.score();
    return { success: s.success, perfect: s.perfect, score: s.score };
  }
}

/** Scripted good operator: reads each alarm for `readS`, then sorts it by the cheat sheet. */
export class Mg17Autopilot {
  private seenSince = -1;
  private seen: Alarm | null = null;
  constructor(private readonly readS = 0.45, private readonly mistakes: ReadonlySet<number> = new Set()) {}

  apply(sim: Mg17Sim) {
    const f = sim.front;
    if (!f) return;
    if (f !== this.seen) {
      this.seen = f;
      this.seenSince = sim.step;
    }
    if (sim.step - this.seenSince < this.readS * STEP_HZ) return;
    const n = sim.alarms.indexOf(f);
    const want: Bin = this.mistakes.has(n) ? BINS[(BINS.indexOf(f.answer) + 1) % 3]! : f.answer;
    if (sim.config.oneButton) {
      if (BINS[sim.highlight] === want) sim.press();
    } else sim.sort(want);
  }
}

export function runScripted(config: Mg17Config, seed: number, runS: number, input: (sim: Mg17Sim) => void): Mg17Sim {
  const sim = new Mg17Sim(config, seed, runS);
  while (!sim.done) {
    input(sim);
    sim.tick();
  }
  return sim;
}
