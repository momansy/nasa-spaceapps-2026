import { describe, expect, it } from 'vitest';
import type { AssistLevel, MinigameMode } from '@protocol';
import { FixedStepper, STEP_HZ } from '../MG-02/kit';
import { createParts, Mg04Autopilot, Mg04Sim, resolveConfig, rotDistance, runScripted, scoreRun, type Outcome } from './model';

const DUR_S = 20;
const MODES: MinigameMode[] = ['STANDARD', 'RELAXED', 'ONE_BUTTON'];
const ASSISTS: AssistLevel[] = ['CADET', 'ENGINEER', 'FLIGHT_DIRECTOR'];
const SEEDS = Array.from({ length: 24 }, (_, i) => (i * 2654435761 + 11) >>> 0);
const STD = resolveConfig({}, 'STANDARD', 'ENGINEER', DUR_S);

describe('MG-04 parts', () => {
  it('every run has at least one wrong drawing and every part arrives turned away from its drawing', () => {
    for (const seed of SEEDS) {
      const parts = createParts(STD, seed);
      expect(parts.length).toBe(4);
      expect(parts.filter((p) => p.wrong).length).toBeGreaterThanOrEqual(1);
      for (let i = 0; i < parts.length; i++) {
        expect(parts[i]!.startRot).not.toBe(parts[i]!.drawingRot);
        if (i > 0) expect(parts[i]!.kind).not.toBe(parts[i - 1]!.kind);
      }
    }
    expect(rotDistance(0, 3)).toBe(1);
    expect(rotDistance(1, 3)).toBe(2);
  });
});

describe('MG-04 scoring', () => {
  const parts = createParts(STD, 1);
  const right = parts.map((p) => (p.wrong ? 'caught' : 'match') as Outcome);

  it('all correct including the catch succeeds; one wrong part or a missed error fails', () => {
    expect(scoreRun(STD, parts, right, 0.5).success).toBe(true);
    const iErr = parts.findIndex((p) => p.wrong);
    const iOk = parts.findIndex((p) => !p.wrong);
    const missed = [...right];
    missed[iErr] = 'missed_error';
    expect(scoreRun(STD, parts, missed, 0.5).success).toBe(false);
    const mis = [...right];
    mis[iOk] = 'mismatch';
    expect(scoreRun(STD, parts, mis, 0.5).success).toBe(false);
    const flagged = [...right];
    flagged[iOk] = 'false_flag';
    expect(scoreRun(STD, parts, flagged, 0.5).success).toBe(false);
    expect(scoreRun(STD, parts, right.slice(0, 3), 0).success).toBe(false); // last one unchecked
  });

  it('takes the two required flags from the host parameters', () => {
    const iErr = parts.findIndex((p) => p.wrong);
    const iOk = parts.findIndex((p) => !p.wrong);
    const lax = resolveConfig({ all_correct_required: false, drawing_error_catch_required: false }, 'STANDARD', 'ENGINEER', DUR_S);
    const o = [...right];
    o[iErr] = 'missed_error';
    o[iOk] = 'mismatch';
    expect(scoreRun(lax, parts, o, 0.5).success).toBe(true); // one wrong part allowed, missed error ignored
    const noCatch = resolveConfig({ drawing_error_catch_required: false }, 'STANDARD', 'ENGINEER', DUR_S);
    const m = [...right];
    m[iErr] = 'missed_error';
    expect(scoreRun(noCatch, parts, m, 0.5).success).toBe(true);
    const catchOnly = resolveConfig({ all_correct_required: false }, 'STANDARD', 'ENGINEER', DUR_S);
    expect(scoreRun(catchOnly, parts, m, 0.5).success).toBe(false);
  });

  it('perfect needs everything right with at least 25 % of the time left (exactly counts); implies success', () => {
    expect(scoreRun(STD, parts, right, 0.25).perfect).toBe(true);
    expect(scoreRun(STD, parts, right, 0.25 - 1 / (STD.playS * STEP_HZ)).perfect).toBe(false);
    expect(scoreRun(STD, parts, right, 0.1).success).toBe(true);
    for (const left of [0, 0.3, 0.9]) {
      const s = scoreRun(STD, parts, right, left);
      if (s.perfect) expect(s.success).toBe(true);
      expect(s.score).toBeGreaterThanOrEqual(0);
      expect(s.score).toBeLessThanOrEqual(1);
    }
  });

  it('a mirrored drawing can never be matched by turning the part', () => {
    for (const seed of SEEDS) {
      const sim = new Mg04Sim(STD, seed);
      while (sim.part && !sim.part.wrong) sim.flag();
      if (!sim.part) continue;
      for (let k = 0; k < 4; k++) sim.rotate(1);
      expect(sim.confirm()).toBe('missed_error');
    }
  });
});

describe('MG-04 modes and difficulty', () => {
  it('Relaxed: the full timer and a snap when one step away', () => {
    const r = resolveConfig({}, 'RELAXED', 'ENGINEER', DUR_S);
    expect(r.playS).toBe(DUR_S);
    expect(STD.playS).toBe(15);
    let tested = false;
    for (const seed of SEEDS) {
      const sim = new Mg04Sim(r, seed);
      const p = sim.part!;
      if (p.wrong || rotDistance(p.startRot, p.drawingRot) !== 2) continue;
      sim.rotate(1);
      expect(sim.rot).toBe(p.drawingRot);
      tested = true;
      break;
    }
    expect(tested).toBe(true);
  });

  it('Relaxed snaps wrong drawings too (no give-away), and they still cannot be matched', () => {
    const r = resolveConfig({}, 'RELAXED', 'ENGINEER', DUR_S);
    let tested = false;
    for (const seed of SEEDS) {
      const sim = new Mg04Sim(r, seed);
      while (sim.part && !sim.part.wrong) sim.flag();
      const p = sim.part;
      if (!p || rotDistance(p.startRot, p.drawingRot) !== 2) continue;
      sim.rotate(1);
      expect(sim.rot).toBe(p.drawingRot);
      expect(sim.confirm()).toBe('missed_error');
      tested = true;
      break;
    }
    expect(tested).toBe(true);
  });

  it('Cadet is easier and Flight Director harder', () => {
    const cadet = resolveConfig({}, 'STANDARD', 'CADET', DUR_S);
    const fd = resolveConfig({}, 'STANDARD', 'FLIGHT_DIRECTOR', DUR_S);
    expect(cadet.parts).toBeLessThan(STD.parts);
    expect(fd.parts).toBeGreaterThan(STD.parts);
    expect(fd.errors).toBeGreaterThan(cadet.errors);
    expect(cadet.dwellS).toBeGreaterThan(fd.dwellS);
  });

  it('One-button turns the part step by step, then offers "drawing error"', () => {
    const c = resolveConfig({}, 'ONE_BUTTON', 'ENGINEER', DUR_S);
    const sim = new Mg04Sim(c, 2);
    const offers: Array<number | 'error'> = [];
    for (let i = 0; i < (c.dwellS * 4 + c.errorDwellS) * STEP_HZ; i += 10) {
      const o = sim.offer();
      if (offers[offers.length - 1] !== o) offers.push(o);
      for (let k = 0; k < 10; k++) sim.tick();
    }
    expect(offers.length).toBe(5);
    expect(offers[4]).toBe('error');
    expect(new Set(offers.slice(0, 4)).size).toBe(4);
  });
});

describe('MG-04 runs', () => {
  it('a scripted good player succeeds on 24 seeds in every mode and difficulty', () => {
    for (const mode of MODES)
      for (const assist of ASSISTS) {
        const c = resolveConfig({}, mode, assist, DUR_S);
        for (const seed of SEEDS) {
          const pilot = new Mg04Autopilot();
          const sim = runScripted(c, seed, (s) => pilot.apply(s));
          expect(sim.result().success, `${mode} ${assist} ${seed}: ${sim.outcomes.join(',')}`).toBe(true);
        }
      }
  });

  it('an idle player fails in every mode; confirming everything without looking fails', () => {
    for (const mode of MODES) for (const seed of SEEDS) expect(runScripted(resolveConfig({}, mode, 'ENGINEER', DUR_S), seed, null).result().success).toBe(false);
    for (const seed of SEEDS) {
      const sim = new Mg04Sim(STD, seed);
      while (sim.part) sim.confirm();
      expect(sim.result().success).toBe(false);
    }
  });

  it('one-button presses alone reach success', () => {
    const c = resolveConfig({}, 'ONE_BUTTON', 'ENGINEER', DUR_S);
    const sim = new Mg04Sim(c, 8);
    while (!sim.done) {
      const p = sim.part!;
      const o = sim.offer();
      if ((o === 'error' && p.wrong) || (o !== 'error' && !p.wrong && o === p.drawingRot)) sim.press();
      sim.tick();
    }
    expect(sim.result().success).toBe(true);
  });

  it('is deterministic and frame-rate independent', () => {
    const play = (fps: number) => {
      const sim = new Mg04Sim(STD, 21);
      const st = new FixedStepper();
      const p = new Mg04Autopilot(0.6, 0.35);
      while (!sim.done) for (let n = st.advance(1000 / fps); n > 0 && !sim.done; n--) {
        p.apply(sim);
        sim.tick();
      }
      return { r: sim.result(), o: sim.outcomes, t: sim.step };
    };
    expect(play(60)).toEqual(play(60));
    expect(play(30)).toEqual(play(60));
    expect(play(144)).toEqual(play(60));
  });
});
