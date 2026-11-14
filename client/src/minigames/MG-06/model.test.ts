import { describe, expect, it } from 'vitest';
import type { AssistLevel, MinigameMode } from '@protocol';
import { FixedStepper, STEP_HZ } from '../MG-02/kit';
import { A_MAX, amplification, band, createPlan, F_HI_HZ, F_LO_HZ, Mg06Autopilot, Mg06Sim, resolveConfig, runScripted, scoreRun, sweepHz, zetaNeeded } from './model';

const DUR_S = 30;
const MODES: MinigameMode[] = ['STANDARD', 'RELAXED', 'ONE_BUTTON'];
const ASSISTS: AssistLevel[] = ['CADET', 'ENGINEER', 'FLIGHT_DIRECTOR'];
const SEEDS = Array.from({ length: 24 }, (_, i) => (i * 2654435761 + 7) >>> 0);
const STD = resolveConfig({ slot: 0, slots: 3 }, 'STANDARD', 'ENGINEER', DUR_S);

describe('MG-06 physics', () => {
  it('uses the base-excitation amplification 1 / √((1 − r²)² + (2ζr)²)', () => {
    expect(amplification(0, 0.1)).toBeCloseTo(1, 12);
    expect(amplification(1, 0.1)).toBeCloseTo(5, 12); // 1 / (2ζ) at resonance
    expect(amplification(2, 0.2)).toBeCloseTo(1 / Math.sqrt(9 + 0.64), 12);
  });

  it('zetaNeeded keeps A exactly at the red line, and is 0 away from resonance', () => {
    for (const r of [0.8, 0.95, 1, 1.1, 1.2]) {
      const z = zetaNeeded(r);
      expect(amplification(r, z)).toBeCloseTo(A_MAX, 9);
    }
    expect(zetaNeeded(0.4)).toBe(0);
    expect(zetaNeeded(2)).toBe(0);
  });

  it('sweeps 8 → 60 → 8 → 60 Hz over three legs', () => {
    expect(sweepHz(STD, 0)).toBeCloseTo(F_LO_HZ, 9);
    expect(sweepHz(STD, 10)).toBeCloseTo(F_HI_HZ, 6);
    expect(sweepHz(STD, 20)).toBeCloseTo(F_LO_HZ, 6);
    expect(sweepHz(STD, 30)).toBeCloseTo(F_HI_HZ, 6);
  });

  it('seeds one mode per player (at most 4) and slot picks this player\'s mode', () => {
    expect(createPlan(STD, 1).fnHz.length).toBe(3);
    expect(createPlan(resolveConfig({ slot: 5, slots: 6 }, 'STANDARD', 'ENGINEER', DUR_S), 1).fnHz.length).toBe(4);
    expect(createPlan(resolveConfig({ slot: 2, slots: 3 }, 'STANDARD', 'ENGINEER', DUR_S), 1).mine).toBe(2);
    expect(createPlan(resolveConfig({ slot: 5, slots: 6 }, 'STANDARD', 'ENGINEER', DUR_S), 1).mine).toBe(1);
    for (const s of SEEDS) for (const f of createPlan(STD, s).fnHz) {
      expect(f).toBeGreaterThanOrEqual(14);
      expect(f).toBeLessThanOrEqual(34);
    }
  });

  it('moves the green band up while the sweep passes the mode', () => {
    const p = createPlan(STD, 4);
    const fn = p.fnHz[p.mine]!;
    // Find the time the rising sweep crosses fn.
    let t = 0;
    while (sweepHz(STD, t) < fn) t += 0.01;
    expect(band(STD, p, p.mine, t).lo).toBeGreaterThan(0.2);
    expect(band(STD, p, p.mine, 0).lo).toBe(0);
  });
});

describe('MG-06 scoring', () => {
  const total = DUR_S * STEP_HZ;

  it('succeeds at exactly 80 % in green and fails one step below', () => {
    expect(scoreRun(0.8 * total, total, STD).success).toBe(true);
    expect(scoreRun(0.8 * total - 1, total, STD).success).toBe(false);
  });

  it('takes thresholds from the host parameters', () => {
    const c = resolveConfig({ in_green_fraction_min: 0.6, perfect_fraction_min: 0.7, band_zeta: 0.2 }, 'STANDARD', 'ENGINEER', DUR_S);
    expect(scoreRun(0.6 * total, total, c).success).toBe(true);
    expect(scoreRun(0.7 * total, total, c).perfect).toBe(true);
    expect(c.bandZeta).toBeCloseTo(0.2, 9);
    expect(resolveConfig({ in_green_fraction_min: 'x' } as never, 'STANDARD', 'ENGINEER', DUR_S).inGreenMin).toBe(0.8);
  });

  it('perfect implies success; score is the fraction', () => {
    for (let k = 0; k <= total; k += 97) {
      const s = scoreRun(k, total, STD);
      if (s.perfect) expect(s.success).toBe(true);
      expect(s.score).toBeCloseTo(k / total, 12);
    }
  });
});

describe('MG-06 modes and difficulty', () => {
  it('Relaxed: slower sweep (two legs) and a wider band', () => {
    const r = resolveConfig({}, 'RELAXED', 'ENGINEER', DUR_S);
    expect(r.legs).toBeLessThan(STD.legs);
    expect(r.bandZeta).toBeGreaterThan(STD.bandZeta);
  });

  it('Cadet is easier and Flight Director harder', () => {
    expect(resolveConfig({}, 'STANDARD', 'CADET', DUR_S).bandZeta).toBeGreaterThan(STD.bandZeta);
    expect(resolveConfig({}, 'STANDARD', 'FLIGHT_DIRECTOR', DUR_S).bandZeta).toBeLessThan(STD.bandZeta);
  });

  it('One-button: the damper travels by itself and a held button stops it; hold_to_toggle latches', () => {
    const c = resolveConfig({}, 'ONE_BUTTON', 'ENGINEER', DUR_S);
    const sim = new Mg06Sim(c, 1);
    const z0 = sim.zeta;
    for (let i = 0; i < 30; i++) sim.tick(false);
    expect(sim.zeta).not.toBeCloseTo(z0, 3);
    const z1 = sim.zeta;
    for (let i = 0; i < 30; i++) sim.tick(true);
    expect(sim.zeta).toBeCloseTo(z1, 12);
    sim.setZeta(0.1);
    expect(sim.zeta).toBeCloseTo(z1, 12); // no direct setting in one-button mode
    const t = new Mg06Sim(resolveConfig({ hold_to_toggle: true }, 'ONE_BUTTON', 'ENGINEER', DUR_S), 1);
    t.tick(true);
    const z2 = t.zeta;
    for (let i = 0; i < 30; i++) t.tick(false);
    expect(t.zeta).toBeCloseTo(z2, 12);
  });
});

describe('MG-06 runs', () => {
  it('a scripted good player succeeds on 24 seeds in every mode and difficulty', () => {
    for (const mode of MODES)
      for (const assist of ASSISTS)
        for (const slots of [1, 3]) {
          const c = resolveConfig({ slot: slots - 1, slots }, mode, assist, DUR_S);
          for (const seed of SEEDS) {
            const pilot = new Mg06Autopilot();
            const sim = runScripted(c, seed, (s) => pilot.apply(s));
            expect(sim.result().success, `${mode} ${assist} ${slots} ${seed}: ${sim.fraction.toFixed(3)}`).toBe(true);
          }
        }
  });

  it('an idle player fails in every mode, and parking the damper low fails too', () => {
    for (const mode of MODES) for (const seed of SEEDS) expect(runScripted(resolveConfig({}, mode, 'ENGINEER', DUR_S), seed, null).result().success).toBe(false);
    for (const seed of SEEDS) {
      const sim = runScripted(STD, seed, (s) => {
        s.setZeta(STD.bandZeta / 2);
        return false;
      });
      expect(sim.result().success, `park ${seed}: ${sim.fraction.toFixed(3)}`).toBe(false);
    }
  });

  it('one-button presses alone reach success', () => {
    const c = resolveConfig({}, 'ONE_BUTTON', 'ENGINEER', DUR_S);
    const sim = new Mg06Sim(c, 3);
    while (!sim.done) {
      const b = sim.bandNow(sim.plan.mine, sim.timeS + 0.12);
      const m = (b.hi - b.lo) * 0.18;
      sim.tick(sim.zeta >= b.lo + m && sim.zeta <= b.hi - m);
    }
    expect(sim.result().success).toBe(true);
  });

  it('teammate settings from the host change the team meter, never this player\'s result', () => {
    const a = new Mg06Sim(STD, 5);
    const b = new Mg06Sim(STD, 5);
    const other = (a.plan.mine + 1) % a.plan.fnHz.length;
    b.setRemote(other, 0);
    const pa = new Mg06Autopilot();
    const pb = new Mg06Autopilot();
    let differ = false;
    while (!a.done) {
      a.tick(pa.apply(a));
      b.tick(pb.apply(b));
      if (Math.abs(a.meter - b.meter) > 1e-6) differ = true;
    }
    expect(differ).toBe(true);
    expect(b.result()).toEqual(a.result());
  });

  it('is deterministic and frame-rate independent', () => {
    const play = (fps: number) => {
      const sim = new Mg06Sim(STD, 11);
      const st = new FixedStepper();
      const p = new Mg06Autopilot(0.2, 1.0);
      while (!sim.done) for (let n = st.advance(1000 / fps); n > 0 && !sim.done; n--) sim.tick(p.apply(sim));
      return { r: sim.result(), green: sim.inGreen, z: sim.zeta.toFixed(9) };
    };
    expect(play(60)).toEqual(play(60));
    expect(play(30)).toEqual(play(60));
    expect(play(144)).toEqual(play(60));
  });
});
