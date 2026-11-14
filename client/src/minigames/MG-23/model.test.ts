import { describe, expect, it } from 'vitest';
import type { AssistLevel, MinigameMode } from '@protocol';
import { FixedStepper } from '../MG-08/model';
import { CANOPIES, createDescent, goodPlayer, judge, makeSim, Mg23Sim, resolveConfig, runScripted, STEP_HZ } from './model';

const DURATION_S = 20;
const SEEDS = Array.from({ length: 24 }, (_, i) => 3 + i * 4421);
const MODES: MinigameMode[] = ['STANDARD', 'RELAXED', 'ONE_BUTTON'];
const STD = resolveConfig({}, 'STANDARD', 'ENGINEER');

describe('MG-23 judgement (gate ±0.9 s, perfect = middle 40 %)', () => {
  const c = 10;
  it('succeeds exactly at both edges of the gate and not just outside', () => {
    expect(judge(c - 0.9, c, STD).outcome).toBe('in_gate');
    expect(judge(c + 0.9, c, STD).outcome).toBe('in_gate');
    expect(judge(c - 0.9 - 0.01, c, STD).outcome).toBe('torn');
    expect(judge(c + 0.9 + 0.01, c, STD).outcome).toBe('late');
  });
  it('is perfect inside the middle 40 % (±0.36 s) only', () => {
    expect(judge(c + 0.36, c, STD).perfect).toBe(true);
    expect(judge(c - 0.36, c, STD).perfect).toBe(true);
    expect(judge(c + 0.37, c, STD).perfect).toBe(false);
    expect(judge(c + 0.37, c, STD).outcome).toBe('in_gate');
  });
  it('perfect implies success and the score rises towards the centre', () => {
    let prev = -1;
    for (let off = 3; off >= 0; off -= 0.05) {
      const j = judge(c + off, c, STD);
      if (j.perfect) expect(j.outcome).toBe('in_gate');
      expect(j.score).toBeGreaterThanOrEqual(prev - 1e-9);
      prev = j.score;
    }
    expect(judge(c, c, STD).score).toBe(1);
    expect(judge(null, c, STD).score).toBe(0);
    expect(judge(c + 5, c, STD).score).toBeLessThan(0.5);
  });
  it('takes the gate and the perfect fraction from the host parameters', () => {
    const wide = resolveConfig({ gate_half_s: 2, perfect_fraction: 0.5 }, 'STANDARD', 'ENGINEER');
    expect(judge(c + 2, c, wide).outcome).toBe('in_gate');
    expect(judge(c + 1, c, wide).perfect).toBe(true);
    expect(judge(c + 1.1, c, wide).perfect).toBe(false);
  });
});

describe('MG-23 configuration', () => {
  it('this player owns stage slot mod 4; extra players are backups', () => {
    for (const slot of [0, 1, 2, 3, 4, 5, 9]) {
      const c = resolveConfig({ slot, slots: 10 }, 'STANDARD', 'ENGINEER');
      expect(c.stage).toBe(slot % 4);
      expect(c.backup).toBe(Math.floor(slot / 4));
    }
    expect(resolveConfig({ stage: 2, slot: 0 }, 'STANDARD', 'ENGINEER').stage).toBe(2);
  });
  it('Relaxed widens the gate; Cadet is easier, Flight Director harder by about 25 %', () => {
    const w = (m: MinigameMode, a: AssistLevel) => resolveConfig({}, m, a).gateHalfS;
    expect(w('RELAXED', 'ENGINEER')).toBeGreaterThan(w('STANDARD', 'ENGINEER'));
    expect(w('STANDARD', 'CADET') / w('STANDARD', 'ENGINEER')).toBeCloseTo(1.25, 6);
    expect(w('STANDARD', 'FLIGHT_DIRECTOR') / w('STANDARD', 'ENGINEER')).toBeCloseTo(0.8, 6);
    expect(resolveConfig({}, 'ONE_BUTTON', 'ENGINEER').wholeField).toBe(true);
  });
  it('a sloppy player does better in Relaxed than STANDARD, Cadet than Flight Director', () => {
    // Deploys 0.75, 1.0, 1.25 and 1.5 s after the gate centre.
    const rate = (m: MinigameMode, a: AssistLevel) => {
      let wins = 0;
      let n = 0;
      for (const off of [0.75, 1.0, 1.25, 1.5])
        for (const seed of SEEDS) {
          if (runScripted(makeSim({}, seed, m, a, DURATION_S), (s) => goodPlayer(s, off)).result().success) wins++;
          n++;
        }
      return wins / n;
    };
    expect(rate('RELAXED', 'ENGINEER')).toBeGreaterThan(rate('STANDARD', 'ENGINEER'));
    expect(rate('STANDARD', 'CADET')).toBeGreaterThan(rate('STANDARD', 'FLIGHT_DIRECTOR'));
  });
});

describe('MG-23 descent (hand-checked values)', () => {
  const d = createDescent(STD, 42, DURATION_S);
  it('starts at 9,000 m and 240 m/s and lands 25 m above the water', () => {
    expect(d.altitude[0]).toBeCloseTo(9000, 3);
    expect(d.speed[0]).toBeGreaterThan(239);
    expect(d.altitude[DURATION_S * STEP_HZ]).toBeCloseTo(25, 1);
  });
  it('speed and altitude fall monotonically and the mains slow it to about 30 km/h (8.3 m/s)', () => {
    for (let i = 1; i < d.speed.length; i++) {
      expect(d.speed[i]!).toBeLessThanOrEqual(d.speed[i - 1]! + 1e-4);
      expect(d.altitude[i]!).toBeLessThan(d.altitude[i - 1]! + 1e-3);
    }
    expect(d.speed[d.speed.length - 1]!).toBeLessThan(8.3 * 1.5);
    expect(d.speed[d.speed.length - 1]! * 3.6).toBeLessThan(45);
  });
  it('the four gates come in order and do not overlap, and the canopies add up to 11', () => {
    for (let k = 1; k < 4; k++) expect(d.centreS[k]! - d.centreS[k - 1]!).toBeGreaterThan(2 * STD.gateHalfS * 1.6);
    expect(CANOPIES.reduce((a, b) => a + b, 0)).toBe(11);
  });
  it('the exponential relaxation is v_k + (v_prev − v_k)·e^(−Δ/τ) per stage', () => {
    // One stage after its centre, 1.3 s (= τ of the first stage): the gap to 200 m/s shrinks by 1/e.
    const i = Math.round((d.centreS[0]! + 1.3) * STEP_HZ);
    const j = Math.round(d.centreS[0]! * STEP_HZ);
    const gap0 = d.speed[j]! - 200;
    const gap1 = d.speed[i]! - 200;
    expect(gap1 / gap0).toBeCloseTo(Math.exp(-1), 1);
  });
});

describe('MG-23 determinism and play', () => {
  it('same seed and input give the same run, different seeds differ', () => {
    const a = runScripted(makeSim({}, 5, 'STANDARD', 'ENGINEER', DURATION_S), (s) => goodPlayer(s));
    const b = runScripted(makeSim({}, 5, 'STANDARD', 'ENGINEER', DURATION_S), (s) => goodPlayer(s));
    expect(a.result()).toEqual(b.result());
    expect(Array.from(a.descent.altitude)).toEqual(Array.from(b.descent.altitude));
    expect(createDescent(STD, 6, DURATION_S).centreS).not.toEqual(createDescent(STD, 5, DURATION_S).centreS);
  });
  it('does not depend on the frame rate', () => {
    for (const fps of [60, 30, 144]) {
      const st = new FixedStepper();
      const sim = makeSim({}, 5, 'STANDARD', 'ENGINEER', DURATION_S);
      for (let t = 0; t < 20000 + 1000 / fps; t += 1000 / fps) for (let n = st.advance(1000 / fps); n > 0 && !sim.done; n--) sim.advance(goodPlayer(sim));
      expect(sim.done).toBe(true);
      expect(sim.result().success).toBe(true);
    }
  });
  for (const mode of MODES) {
    it(`a scripted good player succeeds on ≥ 20 seeds in ${mode}, and perfect implies success`, () => {
      let wins = 0;
      for (const seed of SEEDS) {
        const r = runScripted(makeSim({}, seed, mode, 'ENGINEER', DURATION_S), (s) => goodPlayer(s, 0.2)).result();
        if (r.success) wins++;
        if (r.perfect) expect(r.success).toBe(true);
      }
      expect(wins).toBeGreaterThanOrEqual(20);
    });
    it(`an idle player fails in ${mode} on every seed`, () => {
      for (const seed of SEEDS) expect(runScripted(makeSim({}, seed, mode, 'ENGINEER', DURATION_S), () => ({ deploy: false })).result().success).toBe(false);
    });
  }
  it('too early tears the chute, too late is a hard landing, in time opens', () => {
    const play = (off: number) => runScripted(makeSim({}, 9, 'STANDARD', 'ENGINEER', DURATION_S), (s) => goodPlayer(s, off));
    expect(play(-2).judgement().outcome).toBe('torn');
    expect(play(2).judgement().outcome).toBe('late');
    expect(play(0).judgement().outcome).toBe('in_gate');
    expect(play(0).result().perfect).toBe(true);
  });
  it('only the first press counts and the result is stable after the end', () => {
    const sim = new Mg23Sim(STD, createDescent(STD, 1, DURATION_S));
    while (sim.timeS < sim.ownCentreS) sim.advance({ deploy: false });
    sim.advance({ deploy: true });
    const first = sim.deployS;
    for (let i = 0; i < 30; i++) sim.advance({ deploy: true });
    expect(sim.deployS).toBe(first);
    runScripted(sim, () => ({ deploy: false }));
    const r = sim.result();
    sim.advance({ deploy: true });
    expect(sim.result()).toEqual(r);
  });
  it('teammates (seeded crew or coop) never change this player’s result', () => {
    const a = runScripted(makeSim({ slot: 1, slots: 4 }, 3, 'STANDARD', 'ENGINEER', DURATION_S), (s) => goodPlayer(s));
    const b = makeSim({ slot: 1, slots: 4 }, 3, 'STANDARD', 'ENGINEER', DURATION_S);
    b.coopS[0] = 0.5;
    b.coopS[2] = 19;
    runScripted(b, (s) => goodPlayer(s));
    expect(b.result()).toEqual(a.result());
    expect(b.stageDeployS(0)).toBe(0.5);
  });
});
