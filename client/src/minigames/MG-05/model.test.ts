import { describe, expect, it } from 'vitest';
import type { AssistLevel, MinigameMode } from '@protocol';
import { FixedStepper, STEP_HZ } from '../MG-02/kit';
import { autoSwab, createParticles, LENS, Mg05Autopilot, Mg05Sim, MIRROR, opticAt, resolveConfig, runScripted, scoreRun } from './model';

const DUR_S = 20;
const MODES: MinigameMode[] = ['STANDARD', 'RELAXED', 'ONE_BUTTON'];
const ASSISTS: AssistLevel[] = ['CADET', 'ENGINEER', 'FLIGHT_DIRECTOR'];
const SEEDS = Array.from({ length: 24 }, (_, i) => (i * 2654435761 + 13) >>> 0);
const STD = resolveConfig({}, 'STANDARD', 'ENGINEER', DUR_S);

/** Lets particles land: runs until every particle is on the glass or past. */
function landAll(sim: Mg05Sim) {
  while (sim.particles.some((_, i) => sim.state[i]! < 2) && !sim.done) sim.tick();
}

describe('MG-05 particles', () => {
  it('lands every particle on an optic, early enough to be wiped', () => {
    for (const seed of SEEDS) {
      const ps = createParticles(STD, seed);
      expect(ps.length).toBe(24);
      for (const p of ps) {
        expect(opticAt(p.x, p.y)).toBe(p.optic);
        expect(p.landS).toBeLessThanOrEqual(DUR_S - 2.5 + 1e-9);
      }
    }
    expect(opticAt(LENS.x, LENS.y)).toBe(0);
    expect(opticAt(MIRROR.x, MIRROR.y)).toBe(1);
    expect(opticAt(0.02, 0.62)).toBe(-1);
  });
});

describe('MG-05 scoring', () => {
  it('succeeds at exactly 90 % clean with 0 scratches; fails just past each threshold', () => {
    expect(scoreRun(STD, 0.9, 0).success).toBe(true);
    expect(scoreRun(STD, 0.9 - 1e-6, 0).success).toBe(false);
    expect(scoreRun(STD, 1, 1).success).toBe(false);
  });

  it('takes thresholds from the host parameters', () => {
    const c = resolveConfig({ clean_fraction_min: 0.7, scratches_max: 2, particles: 10, speed_limit: 3 }, 'STANDARD', 'ENGINEER', DUR_S);
    expect(scoreRun(c, 0.7, 2).success).toBe(true);
    expect(scoreRun(c, 0.7, 3).success).toBe(false);
    expect(createParticles(c, 1).length).toBe(10);
    expect(c.speedLimit).toBeCloseTo(3, 9);
  });

  it('perfect needs ≥ 98 % clean and no scratch, and implies success', () => {
    expect(scoreRun(STD, 0.98, 0).perfect).toBe(true);
    expect(scoreRun(STD, 0.97, 0).perfect).toBe(false);
    for (const c of [0, 0.5, 0.9, 0.95, 1])
      for (const s of [0, 1, 2]) {
        const r = scoreRun(STD, c, s);
        if (r.perfect) expect(r.success).toBe(true);
        expect(r.score).toBeGreaterThanOrEqual(0);
        expect(r.score).toBeLessThanOrEqual(1);
      }
  });

  it('a gentle stroke wipes; a fast stroke over glass scratches once per stroke', () => {
    const sim = new Mg05Sim(STD, 3);
    landAll(sim);
    const before = sim.wiped;
    // Gentle: 0.3 field widths in 0.5 s across the lens centre (0.6 w/s).
    sim.press(LENS.x - 0.15, LENS.y);
    for (let k = 1; k <= 60; k++) {
      sim.move(LENS.x - 0.15 + (0.3 * k) / 60, LENS.y);
      sim.tick();
    }
    sim.release();
    expect(sim.scratches.length).toBe(0);
    expect(sim.wiped).toBeGreaterThanOrEqual(before);
    // Fast: 0.5 field widths in 0.1 s (5 w/s), twice inside one stroke → one scratch.
    sim.press(LENS.x - 0.2, LENS.y + 0.05);
    for (let k = 1; k <= 24; k++) {
      sim.move(LENS.x - 0.2 + (0.4 * (k % 12)) / 12, LENS.y + 0.05);
      sim.tick();
    }
    sim.release();
    expect(sim.scratches.length).toBe(1);
  });

  it('stroke speed comes from sample timestamps: the same stroke gives the same result however samples are batched', () => {
    const stroke = (perTick: number) => {
      const sim = new Mg05Sim(STD, 3);
      // A gentle stroke: 0.6 field widths per second, one sample every 16 ms.
      const samples = Array.from({ length: 40 }, (_, k) => ({ x: LENS.x - 0.18 + 0.6 * k * 0.016, t: k * 16 }));
      sim.press(samples[0]!.x, LENS.y, 0);
      for (let k = 1; k < samples.length; k++) {
        sim.move(samples[k]!.x, LENS.y, false, samples[k]!.t);
        if (k % perTick === 0) sim.tick();
      }
      return sim.scratches.length;
    };
    expect(stroke(1)).toBe(0);
    expect(stroke(3)).toBe(0); // 20 fps: three samples per batch
    expect(stroke(8)).toBe(0); // a stutter
    // A fast stroke scratches with any batching.
    const fast = (perTick: number) => {
      const sim = new Mg05Sim(STD, 3);
      sim.press(LENS.x - 0.2, LENS.y, 0);
      for (let k = 1; k <= 10; k++) {
        sim.move(LENS.x - 0.2 + k * 0.04, LENS.y, false, k * 8);
        if (k % perTick === 0) sim.tick();
      }
      return sim.scratches.length;
    };
    expect(fast(1)).toBe(1);
    expect(fast(5)).toBe(1);
  });

  it('Relaxed is more forgiving on real pressure too', () => {
    expect(resolveConfig({}, 'RELAXED', 'ENGINEER', DUR_S).pressureLimit).toBeGreaterThan(STD.pressureLimit);
  });

  it('real pressure above the limit scratches even when slow', () => {
    const sim = new Mg05Sim(STD, 3);
    sim.press(LENS.x, LENS.y);
    for (let k = 0; k < 10; k++) {
      sim.move(LENS.x + k * 0.001, LENS.y, true);
      sim.tick();
    }
    expect(sim.scratches.length).toBe(1);
  });

  it('fast strokes off the glass do not scratch', () => {
    const sim = new Mg05Sim(STD, 3);
    sim.press(0.02, 0.62);
    for (let k = 0; k < 20; k++) {
      sim.move(0.02, 0.62 + (k % 2) * 0.05);
      sim.tick();
    }
    expect(sim.scratches.length).toBe(0);
  });
});

describe('MG-05 modes and difficulty', () => {
  it('Relaxed: particles drift more slowly and the limit is more forgiving', () => {
    const r = resolveConfig({}, 'RELAXED', 'ENGINEER', DUR_S);
    expect(r.driftS).toBeGreaterThan(STD.driftS);
    expect(r.speedLimit).toBeGreaterThan(STD.speedLimit);
  });

  it('Cadet is easier and Flight Director harder', () => {
    const cadet = resolveConfig({}, 'STANDARD', 'CADET', DUR_S);
    const fd = resolveConfig({}, 'STANDARD', 'FLIGHT_DIRECTOR', DUR_S);
    expect(cadet.speedLimit).toBeGreaterThan(STD.speedLimit);
    expect(fd.speedLimit).toBeLessThan(STD.speedLimit);
    expect(cadet.particles).toBeLessThan(fd.particles);
  });

  it('One-button: the swab moves by itself below the limit; holding over clean glass too long scratches', () => {
    let max = 0;
    for (let t = 0; t < DUR_S; t += 0.01) {
      const a = autoSwab(t);
      const b = autoSwab(t + 0.01);
      max = Math.max(max, Math.hypot(b.x - a.x, b.y - a.y) / 0.01);
    }
    expect(max).toBeLessThan(STD.speedLimit * 0.8);
    const c = resolveConfig({}, 'ONE_BUTTON', 'ENGINEER', DUR_S);
    const sim = new Mg05Sim(c, 2);
    for (let k = 0; k < 4 * STEP_HZ; k++) sim.tick(true);
    expect(sim.scratches.length).toBeGreaterThanOrEqual(1);
  });
});

describe('MG-05 runs', () => {
  it('a scripted good player succeeds on 24 seeds in every mode and difficulty', () => {
    for (const mode of MODES)
      for (const assist of ASSISTS) {
        const c = resolveConfig({}, mode, assist, DUR_S);
        for (const seed of SEEDS) {
          const pilot = new Mg05Autopilot();
          const sim = runScripted(c, seed, (s) => pilot.apply(s));
          expect(sim.result().success, `${mode} ${assist} ${seed}: clean ${sim.clean.toFixed(3)} scratches ${sim.scratches.length}`).toBe(true);
        }
      }
  });

  it('an idle player fails in every mode', () => {
    for (const mode of MODES) for (const seed of SEEDS) expect(runScripted(resolveConfig({}, mode, 'ENGINEER', DUR_S), seed, null).result().success).toBe(false);
  });

  it('one-button holds alone reach success', () => {
    const c = resolveConfig({}, 'ONE_BUTTON', 'ENGINEER', DUR_S);
    const sim = new Mg05Sim(c, 5);
    const pilot = new Mg05Autopilot();
    while (!sim.done) sim.tick(pilot.apply(sim));
    expect(sim.result().success).toBe(true);
  });

  it('is deterministic and frame-rate independent', () => {
    const play = (fps: number) => {
      const sim = new Mg05Sim(STD, 17);
      const st = new FixedStepper();
      const p = new Mg05Autopilot(0.7);
      while (!sim.done) for (let n = st.advance(1000 / fps); n > 0 && !sim.done; n--) sim.tick(p.apply(sim));
      return { r: sim.result(), wiped: sim.wiped, x: sim.swabX.toFixed(9) };
    };
    expect(play(60)).toEqual(play(60));
    expect(play(30)).toEqual(play(60));
    expect(play(144)).toEqual(play(60));
  });
});
