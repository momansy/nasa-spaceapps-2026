import { describe, expect, it } from 'vitest';
import type { AssistLevel, MinigameMode } from '@protocol';
import { FixedStepper, STEP_HZ } from './kit';
import { createPlan, deltaV, G0, marginalDv, massRatio, Mg02Autopilot, Mg02Sim, resolveConfig, runScripted, scoreRun } from './model';

const DUR_S = 30;
const MODES: MinigameMode[] = ['STANDARD', 'RELAXED', 'ONE_BUTTON'];
const ASSISTS: AssistLevel[] = ['CADET', 'ENGINEER', 'FLIGHT_DIRECTOR'];
const SEEDS = Array.from({ length: 24 }, (_, i) => (i * 2654435761 + 99) >>> 0);
const STD = resolveConfig({}, 'STANDARD', 'ENGINEER', DUR_S);

describe('MG-02 physics', () => {
  it('uses the rocket equation with g0 = 9.80665 m/s²', () => {
    expect(G0).toBe(9.80665);
    // 320 s · 9.80665 · ln(7 / 5)
    expect(deltaV(STD, 1)).toBeCloseTo(320 * 9.80665 * Math.log(7 / 5), 6);
    expect(deltaV(STD, 0)).toBe(0);
    expect(massRatio(STD, 5)).toBeCloseTo(3, 10);
  });

  it('gives every block less Δv than the one before', () => {
    for (let k = 2; k <= 14; k++) expect(marginalDv(STD, k)).toBeLessThan(marginalDv(STD, k - 1));
  });
});

describe('MG-02 plan and scoring', () => {
  it('places a band that admits exactly n*, n*+1 and n*+2 blocks and starts outside it', () => {
    for (const seed of SEEDS) {
      const p = createPlan(STD, seed);
      const inBand = (n: number) => deltaV(STD, n) >= p.loMs && deltaV(STD, n) <= p.hiMs;
      expect(inBand(p.nStar - 1)).toBe(false);
      expect(inBand(p.nStar)).toBe(true);
      expect(inBand(p.nStar + 1)).toBe(true);
      expect(inBand(p.nStar + 2)).toBe(true);
      expect(inBand(p.nStar + 3)).toBe(false);
      expect(inBand(p.n0)).toBe(false);
    }
  });

  it('succeeds with exactly extra_blocks_max (1) extra block and fails one past it', () => {
    const p = createPlan(STD, 5);
    expect(scoreRun(STD, p, p.nStar + 1).success).toBe(true);
    expect(scoreRun(STD, p, p.nStar + 2).success).toBe(false); // still in band, two extra
    expect(scoreRun(STD, p, p.nStar + 2).score).toBeLessThan(scoreRun(STD, p, p.nStar + 1).score);
    expect(scoreRun(STD, p, p.nStar - 1).success).toBe(false); // below the band
  });

  it('reads the band edges inclusively', () => {
    const p = createPlan(STD, 9);
    const edge = { ...p, loMs: deltaV(STD, p.nStar) };
    expect(scoreRun(STD, edge, p.nStar).success).toBe(true);
    const past = { ...p, loMs: deltaV(STD, p.nStar) + 1e-6 };
    expect(scoreRun(STD, past, p.nStar).success).toBe(false);
  });

  it('takes thresholds and the target from the host parameters', () => {
    const c = resolveConfig({ extra_blocks_max: 2 }, 'STANDARD', 'ENGINEER', DUR_S);
    const p = createPlan(c, 5);
    expect(scoreRun(c, p, p.nStar + 2).success).toBe(true);
    const c0 = resolveConfig({ extra_blocks_max: 0 }, 'STANDARD', 'ENGINEER', DUR_S);
    expect(scoreRun(c0, createPlan(c0, 5), createPlan(c0, 5).nStar + 1).success).toBe(false);
    // Target Δv 3.4 km/s with the defaults: Δv(5) = 3.45 km/s is the first block count above it.
    const t = resolveConfig({ target_dv_ms: 3400 }, 'STANDARD', 'ENGINEER', DUR_S);
    expect(createPlan(t, 1).nStar).toBe(5);
    // An explicit band: centre 4000 m/s, width 600 m/s → first count at or above 3700 m/s is 6.
    const b = resolveConfig({ target_dv_ms: 4000, band_ms: 600 }, 'STANDARD', 'ENGINEER', DUR_S);
    const bp = createPlan(b, 1);
    expect(bp.loMs).toBeCloseTo(3700, 6);
    expect(bp.hiMs).toBeCloseTo(4300, 6);
    expect(bp.nStar).toBe(6);
    // Junk falls back to the defaults.
    expect(resolveConfig({ isp_s: 'x' } as never, 'STANDARD', 'ENGINEER', DUR_S).ispS).toBe(320);
  });

  it('perfect means n = n* and always implies success; score stays in 0–1', () => {
    const p = createPlan(STD, 3);
    expect(scoreRun(STD, p, p.nStar).perfect).toBe(true);
    for (let n = 0; n <= 14; n++) {
      const s = scoreRun(STD, p, n);
      if (s.perfect) expect(s.success).toBe(true);
      expect(s.score).toBeGreaterThanOrEqual(0);
      expect(s.score).toBeLessThanOrEqual(1);
    }
  });
});

describe('MG-02 modes and difficulty', () => {
  const width = (c: ReturnType<typeof resolveConfig>) => {
    const p = createPlan(c, 4);
    return p.hiMs - p.loMs;
  };

  it('Relaxed is easier: a wider band and the full timer', () => {
    const r = resolveConfig({}, 'RELAXED', 'ENGINEER', DUR_S);
    expect(width(r)).toBeGreaterThan(width(STD));
    expect(r.playS).toBe(30);
    expect(STD.playS).toBeCloseTo(22.5, 10);
  });

  it('Cadet is easier and Flight Director harder', () => {
    const cadet = resolveConfig({}, 'STANDARD', 'CADET', DUR_S);
    const fd = resolveConfig({}, 'STANDARD', 'FLIGHT_DIRECTOR', DUR_S);
    expect(width(cadet)).toBeGreaterThan(width(STD));
    expect(width(fd)).toBeLessThan(width(STD));
    expect(cadet.needleDamping).toBeGreaterThan(STD.needleDamping);
    expect(fd.needleDamping).toBeLessThan(STD.needleDamping);
  });

  it('One-button starts below the band and cannot remove blocks', () => {
    const c = resolveConfig({}, 'ONE_BUTTON', 'ENGINEER', DUR_S);
    for (const seed of SEEDS) {
      const sim = new Mg02Sim(c, seed);
      expect(sim.plan.n0).toBeLessThan(sim.plan.nStar);
      expect(sim.remove()).toBe(false);
    }
  });
});

describe('MG-02 runs', () => {
  it('a scripted good player succeeds on 24 seeds in every mode and difficulty', () => {
    for (const mode of MODES)
      for (const assist of ASSISTS) {
        const c = resolveConfig({}, mode, assist, DUR_S);
        for (const seed of SEEDS) {
          const pilot = new Mg02Autopilot();
          const sim = runScripted(c, seed, (s) => pilot.apply(s));
          const r = sim.result();
          expect(r.success, `${mode} ${assist} seed ${seed}`).toBe(true);
          expect(r.perfect).toBe(true);
        }
      }
  });

  it('an idle player fails in every mode', () => {
    for (const mode of MODES) {
      const c = resolveConfig({}, mode, 'ENGINEER', DUR_S);
      for (const seed of SEEDS) expect(runScripted(c, seed, null).result().success).toBe(false);
    }
  });

  it('one-button presses alone reach success', () => {
    const c = resolveConfig({}, 'ONE_BUTTON', 'ENGINEER', DUR_S);
    const sim = new Mg02Sim(c, 77);
    const need = sim.plan.nStar - sim.plan.n0;
    for (let i = 0; i < need; i++) {
      sim.add();
      for (let k = 0; k < 0.6 * STEP_HZ; k++) sim.tick();
    }
    while (!sim.done) sim.tick();
    expect(sim.result()).toMatchObject({ success: true, perfect: true });
  });

  it('removing blocks costs handling time only', () => {
    const sim = new Mg02Sim(STD, 1);
    const n = sim.n;
    sim.add();
    for (let k = 0; k < 0.5 * STEP_HZ; k++) sim.tick();
    sim.remove();
    for (let k = 0; k < 0.5 * STEP_HZ; k++) sim.tick();
    expect(sim.n).toBe(n);
    expect(sim.adds).toBe(1);
    expect(sim.removes).toBe(1);
  });

  it('is deterministic: same seed and inputs give the same run', () => {
    const run = () => {
      const pilot = new Mg02Autopilot(0.2);
      const s = runScripted(STD, 1234, (x) => pilot.apply(x));
      return { r: s.result(), n: s.n, needle: s.needleMs, adds: s.adds };
    };
    expect(run()).toEqual(run());
  });

  it('does not depend on the frame rate', () => {
    // Moves arrive at the same play times; frames of 1000/30, 1000/60 and 1000/144 ms.
    const play = (fps: number) => {
      const sim = new Mg02Sim(STD, 42);
      const stepper = new FixedStepper();
      const movesAt = [1.0, 2.0, 3.0, 4.0, 5.0, 6.0].map((t) => Math.round(t * STEP_HZ));
      let done = 0;
      while (!sim.done) {
        for (let n = stepper.advance(1000 / fps); n > 0 && !sim.done; n--) {
          if (done < movesAt.length && sim.step >= movesAt[done]!) {
            sim.add();
            done++;
          }
          sim.tick();
        }
      }
      return { n: sim.n, needle: sim.needleMs.toFixed(6), r: sim.result() };
    };
    expect(play(30)).toEqual(play(60));
    expect(play(144)).toEqual(play(60));
  });
});
