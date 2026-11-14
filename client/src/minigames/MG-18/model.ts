// MG-18 Eclipse Power Juggle: simulation and scoring. Pure: no DOM, no clock, no Math.random.
//
// The spacecraft flies from sunlight into Earth's shadow and out again. Switch the loads
// (heaters, radio, instrument, reaction wheels) on and off so the battery stays above the red
// line, while the critical loads stay on: the heaters always, and the radio during the seeded
// must-run contact window (Decision: switching everything off cannot win).
//
// What is physical and what is a game simplification
// ---------------------------------------------------
// PHYSICAL
//   Energy balance of the battery: dE/dt = P_solar − Σ P_load  (W = J/s; 1 Wh = 3 600 J).
//   No solar input in Earth's shadow.
// REAL-WORLD APPROXIMATE
//   About 35 min of eclipse in a ~90 min low-Earth orbit (fact F14). The run shows a 42 min
//   slice: 4 min of sunlight, 35 min of eclipse, 3 min of sunlight.
// GAME SIMPLIFICATIONS (game values)
//   • The 42 orbit minutes are compressed into the run (time compression).
//   • Battery 60 Wh, red line 25 %, solar input 110 W, loads 18 / 14 / 32 / 10 W, a short
//     penumbra ramp of 1 min, no battery efficiency or temperature effects.
//   • The instrument only collects data while the reaction wheels point it (Decision).
import type { AssistLevel, MgMap, MinigameMode } from '@protocol';
import type { MinigameResult } from '../types';
import { assistFactor, clamp, DT_S, mulberry32, numParam, STEP_HZ } from '../MG-13/kit';

export const LOADS = ['heaters', 'radio', 'instrument', 'wheels'] as const;
export type LoadId = (typeof LOADS)[number];

/** Load powers, W (game values). */
export const LOAD_W: Record<LoadId, number> = { heaters: 18, radio: 14, instrument: 32, wheels: 10 };
/** Solar array output in sunlight, W (game value). */
export const SOLAR_W = 110;
/** Orbit-time slice shown, min: sunlight, eclipse (real-world approximate, fact F14), sunlight. */
export const SUN_BEFORE_MIN = 4;
export const ECLIPSE_MIN = 35;
export const SUN_AFTER_MIN = 3;
export const ORBIT_SLICE_MIN = SUN_BEFORE_MIN + ECLIPSE_MIN + SUN_AFTER_MIN;
/** Penumbra ramp, min (game value). */
const PENUMBRA_MIN = 1;
/** Battery capacity, Wh (game value). */
export const CAPACITY_WH = 60;
/** Time after the contact window opens before a radio that is off counts, s of play (game value). */
export const RADIO_GRACE_S = 0.4;

export const DEFAULTS = {
  /** Red line, fraction of capacity (game value). */
  red_line_fraction: 0.25,
  /** Perfect: success and the instrument collecting at least this fraction of the run (game value). */
  perfect_instrument_fraction: 0.6,
} as const;

export interface Mg18Config {
  capacityWh: number;
  redLineWh: number;
  perfectInstrument: number;
  /** Fraction of the run the slice uses. */
  timeFraction: number;
  oneButton: boolean;
  /** One-button: time each load stays highlighted, s. */
  cycleS: number;
}

/**
 * Host parameters + mode + difficulty → configuration. Battery capacity: Relaxed × 1.35 ("the
 * battery drains more slowly"), Cadet × 1.2, Flight Director × 0.88 (the red line stays at the
 * same fraction). One-button highlights radio, instrument and wheels in turn every 1.3 s
 * (Cadet 1.6 s, Flight Director 1.1 s); the heaters are never offered (Decision: one mistimed
 * press would fail the run at once). The slice uses 97 % of `durationMs` in every mode (Relaxed
 * gets a bigger battery, not more time).
 */
export function resolveConfig(params: MgMap, mode: MinigameMode, assist: AssistLevel): Mg18Config {
  let cap = CAPACITY_WH * assistFactor(assist, 1.2, 0.88);
  if (mode === 'RELAXED') cap *= 1.35;
  const red = numParam(params, 'red_line_fraction', DEFAULTS.red_line_fraction, 0.05, 0.6);
  return {
    capacityWh: cap,
    redLineWh: cap * red,
    perfectInstrument: numParam(params, 'perfect_instrument_fraction', DEFAULTS.perfect_instrument_fraction, 0, 1),
    timeFraction: 0.97,
    oneButton: mode === 'ONE_BUTTON',
    cycleS: assist === 'CADET' ? 1.6 : assist === 'FLIGHT_DIRECTOR' ? 1.1 : 1.3,
  };
}

/** Loads offered to the one button, in highlight order. */
export const ONE_BUTTON_LOADS: readonly LoadId[] = ['radio', 'instrument', 'wheels'];

export interface Scenario {
  /** Start charge, Wh. */
  startWh: number;
  /** Contact window in orbit minutes from the start of the slice. */
  contactFromMin: number;
  contactToMin: number;
}

/** Solar input at orbit minute `m`, W (ramps through a short penumbra). */
export function solarAt(m: number): number {
  const inStart = SUN_BEFORE_MIN;
  const inEnd = SUN_BEFORE_MIN + ECLIPSE_MIN;
  if (m <= inStart - PENUMBRA_MIN / 2 || m >= inEnd + PENUMBRA_MIN / 2) return SOLAR_W;
  if (m < inStart + PENUMBRA_MIN / 2) return SOLAR_W * (1 - (m - (inStart - PENUMBRA_MIN / 2)) / PENUMBRA_MIN);
  if (m > inEnd - PENUMBRA_MIN / 2) return SOLAR_W * ((m - (inEnd - PENUMBRA_MIN / 2)) / PENUMBRA_MIN);
  return 0;
}

export function inEclipse(m: number): boolean {
  return m >= SUN_BEFORE_MIN && m < SUN_BEFORE_MIN + ECLIPSE_MIN;
}

/**
 * Builds the scenario: a contact window of 7–10 orbit minutes inside the eclipse, and a start
 * charge (64–74 % of capacity at Engineer) so that running everything all the time would cross
 * the red line but the critical loads alone never would.
 */
export function createScenario(config: Mg18Config, seed: number): Scenario {
  const rnd = mulberry32(seed ^ 0x18ec);
  const len = 7 + 3 * rnd();
  const from = SUN_BEFORE_MIN + 6 + (ECLIPSE_MIN - 12 - len) * rnd();
  const startFrac = 0.64 + 0.1 * rnd();
  return { startWh: config.capacityWh * startFrac, contactFromMin: from, contactToMin: from + len };
}

export interface Mg18Score {
  success: boolean;
  perfect: boolean;
  score: number;
}

/**
 * Success: the battery stayed above the red line at every step, the heaters were always on and
 * the radio was on throughout the contact window (after a 0.4 s grace). Perfect: success and the
 * instrument collected for at least `perfectInstrument` of the run. Score: the instrument share
 * of the run when successful (with a floor of 0.3 for a success), otherwise half of it.
 */
export function scoreRun(ok: boolean, instrumentFraction: number, config: Pick<Mg18Config, 'perfectInstrument'>): Mg18Score {
  const f = clamp(instrumentFraction, 0, 1);
  const success = ok;
  const perfect = success && f >= config.perfectInstrument - 1e-9;
  return { success, perfect, score: success ? clamp(0.3 + 0.7 * f, 0, 1) : 0.5 * f };
}

export type Failure = 'none' | 'battery' | 'heaters' | 'radio';

export class Mg18Sim {
  readonly config: Mg18Config;
  readonly scenario: Scenario;
  readonly totalSteps: number;
  /** Orbit minutes per step. */
  readonly minPerStep: number;
  step = 0;
  energyWh: number;
  readonly on: Record<LoadId, boolean> = { heaters: true, radio: true, instrument: true, wheels: true };
  /** First thing that went wrong (the run continues so the player sees the whole eclipse). */
  failure: Failure = 'none';
  lowestWh: number;
  instrumentSteps = 0;
  /** One-button: highlighted load index in ONE_BUTTON_LOADS. */
  highlight = 0;
  toggles = 0;
  private queued: LoadId | 'button' | null = null;
  private radioOffSince = -1;
  /** Battery history, one sample per step, Wh. */
  readonly history: Float32Array;

  constructor(config: Mg18Config, seed: number, runS: number) {
    this.config = config;
    this.scenario = createScenario(config, seed);
    this.totalSteps = Math.max(1, Math.round(runS * config.timeFraction * STEP_HZ));
    this.minPerStep = ORBIT_SLICE_MIN / this.totalSteps;
    this.energyWh = this.scenario.startWh;
    this.lowestWh = this.energyWh;
    this.history = new Float32Array(this.totalSteps);
  }

  get done(): boolean {
    return this.step >= this.totalSteps;
  }

  get timeS(): number {
    return this.step * DT_S;
  }

  /** Orbit minutes since the start of the slice. */
  get orbitMin(): number {
    return this.step * this.minPerStep;
  }

  get inContact(): boolean {
    const m = this.orbitMin;
    return m >= this.scenario.contactFromMin && m < this.scenario.contactToMin;
  }

  get solarW(): number {
    return solarAt(this.orbitMin);
  }

  get loadW(): number {
    let w = 0;
    for (const id of LOADS) if (this.on[id]) w += LOAD_W[id];
    return w;
  }

  get collecting(): boolean {
    return this.on.instrument && this.on.wheels;
  }

  get instrumentFraction(): number {
    return this.instrumentSteps / this.totalSteps;
  }

  /** Standard / Relaxed: switch one load. */
  toggle(id: LoadId) {
    this.queued = id;
  }

  /** One-button: switch the highlighted load. */
  press() {
    this.queued = 'button';
  }

  tick() {
    if (this.done) return;
    const q = this.queued;
    this.queued = null;
    if (q) {
      const id = q === 'button' ? (this.config.oneButton ? ONE_BUTTON_LOADS[this.highlight]! : null) : this.config.oneButton && q === 'heaters' ? null : q;
      if (id) {
        this.on[id] = !this.on[id];
        this.toggles++;
      }
    }
    const m = this.orbitMin;
    const p = solarAt(m) - this.loadW; // W
    this.energyWh = clamp(this.energyWh + (p * this.minPerStep) / 60, 0, this.config.capacityWh);
    if (this.energyWh < this.lowestWh) this.lowestWh = this.energyWh;
    if (this.collecting) this.instrumentSteps++;
    // Rules.
    if (this.failure === 'none') {
      if (this.energyWh <= this.config.redLineWh) this.failure = 'battery';
      else if (!this.on.heaters) this.failure = 'heaters';
      else if (this.inContact && !this.on.radio) {
        if (this.radioOffSince < 0) this.radioOffSince = this.step;
        if (this.step - this.radioOffSince >= RADIO_GRACE_S * STEP_HZ) this.failure = 'radio';
      }
    }
    if (this.on.radio || !this.inContact) this.radioOffSince = -1;
    this.history[this.step] = this.energyWh;
    this.step++;
    if (this.config.oneButton) {
      const per = Math.max(1, Math.round(this.config.cycleS * STEP_HZ));
      this.highlight = Math.floor(this.step / per) % ONE_BUTTON_LOADS.length;
    }
  }

  score(): Mg18Score {
    return scoreRun(this.failure === 'none', this.instrumentFraction, this.config);
  }

  result(): MinigameResult {
    const s = this.score();
    return { success: s.success, perfect: s.perfect, score: s.score };
  }
}

/** Energy the critical loads still need from orbit minute `m` to the end of the eclipse, Wh. */
export function criticalNeedWh(sim: Mg18Sim, m: number): number {
  const end = SUN_BEFORE_MIN + ECLIPSE_MIN;
  if (m >= end) return 0;
  const dark = end - Math.max(m, SUN_BEFORE_MIN);
  const radio = Math.max(0, Math.min(end, sim.scenario.contactToMin) - Math.max(m, sim.scenario.contactFromMin));
  return (LOAD_W.heaters * dark + LOAD_W.radio * radio) / 60;
}

/**
 * Scripted good player: heaters always on; radio on only for the contact window (switched on a
 * little early); instrument and wheels on while the battery can afford them through the rest
 * of the eclipse with a margin. One-button: presses when the highlighted load is in the wrong state.
 */
export class Mg18Autopilot {
  apply(sim: Mg18Sim) {
    const m = sim.orbitMin;
    // One-button players wait for the highlight: plan a whole highlight cycle ahead.
    const aheadS = sim.config.oneButton ? sim.config.cycleS * ONE_BUTTON_LOADS.length + 0.3 : 0.5;
    const lead = sim.minPerStep * aheadS * STEP_HZ;
    const wantRadio = m + lead >= sim.scenario.contactFromMin && m < sim.scenario.contactToMin;
    const spare = sim.energyWh - sim.config.redLineWh - criticalNeedWh(sim, m);
    const rest = Math.max(0, SUN_BEFORE_MIN + ECLIPSE_MIN - Math.max(m, SUN_BEFORE_MIN));
    const sciNeed = ((LOAD_W.instrument + LOAD_W.wheels) * rest) / 60;
    const margin = sim.config.capacityWh * 0.04 + ((LOAD_W.instrument + LOAD_W.wheels + LOAD_W.radio) * lead) / 60;
    const wantSci = !inEclipse(m) ? true : spare - margin > Math.min(sciNeed, ((LOAD_W.instrument + LOAD_W.wheels) * 2) / 60);
    const want: Record<LoadId, boolean> = { heaters: true, radio: wantRadio, instrument: wantSci, wheels: wantSci };
    if (sim.config.oneButton) {
      const id = ONE_BUTTON_LOADS[sim.highlight]!;
      if (sim.on[id] !== want[id] && sim.step % 12 === 0) sim.press();
      return;
    }
    for (const id of LOADS) {
      if (sim.on[id] !== want[id]) {
        sim.toggle(id);
        return;
      }
    }
  }
}

export function runScripted(config: Mg18Config, seed: number, runS: number, input: (sim: Mg18Sim) => void): Mg18Sim {
  const sim = new Mg18Sim(config, seed, runS);
  while (!sim.done) {
    input(sim);
    sim.tick();
  }
  return sim;
}
