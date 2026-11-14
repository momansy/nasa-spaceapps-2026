import { describe, expect, it } from 'vitest';
import type { AssistLevel, MinigameMode } from '@protocol';
import { FixedStepper } from '../MG-02/kit';
import { BEAD_HALF, createDefects, defectDistance, FILM_H, Mg03Autopilot, Mg03Sim, resolveConfig, runScripted, scannerAt, scoreRun, SEAMS_Y } from './model';

const DUR_S = 25;
const MODES: MinigameMode[] = ['STANDARD', 'RELAXED', 'ONE_BUTTON'];
const ASSISTS: AssistLevel[] = ['CADET', 'ENGINEER', 'FLIGHT_DIRECTOR'];
const SEEDS = Array.from({ length: 24 }, (_, i) => (i * 2654435761 + 3) >>> 0);
const STD = resolveConfig({}, 'STANDARD', 'ENGINEER', DUR_S);

describe('MG-03 film and defects', () => {
  it('seeds spread-out defects on the weld beads, both kinds, every seam used', () => {
    for (const seed of SEEDS) {
      const d = createDefects(STD, seed);
      expect(d.length).toBe(6);
      expect(new Set(d.map((x) => x.kind))).toEqual(new Set(['porosity', 'crack']));
      expect(new Set(d.map((x) => x.seam)).size).toBe(3);
      for (const x of d) {
        expect(Math.abs(x.y - SEAMS_Y[x.seam]!)).toBeLessThanOrEqual(BEAD_HALF);
        expect(x.y).toBeLessThan(FILM_H);
      }
      for (let i = 0; i < d.length; i++) for (let j = i + 1; j < d.length; j++) expect(Math.hypot(d[i]!.x - d[j]!.x, d[i]!.y - d[j]!.y)).toBeGreaterThanOrEqual(0.17);
    }
  });

  it('measures a crack by its line and a cluster by its centre', () => {
    const [p, c] = createDefects(STD, 1);
    expect(defectDistance(p!, p!.x + 0.03, p!.y)).toBeCloseTo(0.03, 9);
    const tipX = c!.x + Math.cos(c!.angle) * c!.halfLen;
    const tipY = c!.y + Math.sin(c!.angle) * c!.halfLen;
    expect(defectDistance(c!, tipX, tipY)).toBeLessThan(1e-9);
  });
});

describe('MG-03 scoring', () => {
  it('succeeds at exactly 80 % found (5 of 6 rounds up to 0.8) and 1 false alarm; fails just past each', () => {
    // 0.8 × 5 = 4 defects exactly.
    expect(scoreRun(STD, 4, 5, 1).success).toBe(true);
    expect(scoreRun(STD, 3, 5, 1).success).toBe(false);
    expect(scoreRun(STD, 4, 5, 2).success).toBe(false);
    // 0.8 × 6 = 4.8 → 5 needed.
    expect(scoreRun(STD, 5, 6, 0).success).toBe(true);
    expect(scoreRun(STD, 4, 6, 0).success).toBe(false);
  });

  it('takes thresholds from the host parameters', () => {
    const c = resolveConfig({ defects_found_fraction_min: 0.5, false_alarms_max: 3, defects: 8 }, 'STANDARD', 'ENGINEER', DUR_S);
    expect(scoreRun(c, 4, 8, 3).success).toBe(true);
    expect(scoreRun(c, 3, 8, 3).success).toBe(false);
    expect(createDefects(c, 2).length).toBe(8);
  });

  it('perfect means all found with no false alarm, and implies success', () => {
    expect(scoreRun(STD, 6, 6, 0).perfect).toBe(true);
    expect(scoreRun(STD, 6, 6, 1).perfect).toBe(false);
    for (let f = 0; f <= 6; f++)
      for (let a = 0; a <= 3; a++) {
        const s = scoreRun(STD, f, 6, a);
        if (s.perfect) expect(s.success).toBe(true);
        expect(s.score).toBeGreaterThanOrEqual(0);
        expect(s.score).toBeLessThanOrEqual(1);
      }
  });

  it('marks: inside the hit radius finds, outside is a false alarm, a repeat is ignored', () => {
    const sim = new Mg03Sim(STD, 9);
    const d = sim.defects[0]!;
    expect(sim.mark(d.x + STD.hitR * 0.9, d.y)).toBe(0);
    expect(sim.mark(d.x, d.y)).toBe(-2);
    expect(sim.falseAlarms).toBe(0);
    expect(sim.mark(0.5, 0.45)).toBe(-1); // between seams, no defect there
    expect(sim.falseAlarms).toBe(1);
  });
});

describe('MG-03 modes and difficulty', () => {
  it('Relaxed: larger defects, a larger hit radius and the full scan time', () => {
    const r = resolveConfig({}, 'RELAXED', 'ENGINEER', DUR_S);
    expect(r.defectSize).toBeGreaterThan(STD.defectSize);
    expect(r.hitR).toBeGreaterThan(STD.hitR);
    expect(r.playS).toBe(DUR_S);
    expect(STD.playS).toBeCloseTo(DUR_S * 0.75, 9);
  });

  it('Cadet is easier and Flight Director harder', () => {
    const cadet = resolveConfig({}, 'STANDARD', 'CADET', DUR_S);
    const fd = resolveConfig({}, 'STANDARD', 'FLIGHT_DIRECTOR', DUR_S);
    expect(cadet.hitR).toBeGreaterThan(STD.hitR);
    expect(fd.hitR).toBeLessThan(STD.hitR);
    expect(cadet.defects).toBeLessThan(fd.defects);
  });

  it('One-button: the scanner sweeps every seam within the play time', () => {
    const c = resolveConfig({}, 'ONE_BUTTON', 'ENGINEER', DUR_S);
    const seen = new Set<number>();
    for (let t = 0; t <= c.playS; t += 0.05) {
      const p = scannerAt(c, t);
      SEAMS_Y.forEach((y, i) => {
        if (Math.abs(p.y - y) < 1e-9 && p.x > 0.85) seen.add(i * 2 + 1);
        if (Math.abs(p.y - y) < 1e-9 && p.x < 0.15) seen.add(i * 2);
      });
    }
    expect(seen.size).toBe(6);
    const sim = new Mg03Sim(c, 1);
    sim.setLens(0.9, 0.9);
    expect(sim.lensX).not.toBe(0.9);
  });
});

describe('MG-03 runs', () => {
  it('a scripted good player succeeds on 24 seeds in every mode and difficulty', () => {
    for (const mode of MODES)
      for (const assist of ASSISTS) {
        const c = resolveConfig({}, mode, assist, DUR_S);
        for (const seed of SEEDS) {
          const pilot = new Mg03Autopilot();
          const sim = runScripted(c, seed, (s) => pilot.apply(s));
          expect(sim.result().success, `${mode} ${assist} ${seed}: ${sim.foundCount}/${sim.defects.length} fa ${sim.falseAlarms}`).toBe(true);
        }
      }
  });

  it('an idle player fails in every mode', () => {
    for (const mode of MODES) for (const seed of SEEDS) expect(runScripted(resolveConfig({}, mode, 'ENGINEER', DUR_S), seed, null).result().success).toBe(false);
  });

  it('tapping everywhere is punished by false alarms', () => {
    const sim = new Mg03Sim(STD, 4);
    for (let x = 0.05; x < 1; x += 0.1) for (let y = 0.1; y < FILM_H; y += 0.1) sim.mark(x, y);
    expect(sim.result().success).toBe(false);
  });

  it('one-button presses alone reach success', () => {
    const c = resolveConfig({}, 'ONE_BUTTON', 'ENGINEER', DUR_S);
    const sim = new Mg03Sim(c, 6);
    while (!sim.done) {
      if (sim.defects.some((d, i) => !sim.found[i] && defectDistance(d, sim.lensX, sim.lensY) < c.hitR * 0.5)) sim.markLens();
      sim.tick();
    }
    expect(sim.result().success).toBe(true);
  });

  it('is deterministic and frame-rate independent', () => {
    const play = (fps: number) => {
      const sim = new Mg03Sim(STD, 13);
      const st = new FixedStepper();
      const p = new Mg03Autopilot(0.5, 0.4);
      while (!sim.done) for (let n = st.advance(1000 / fps); n > 0 && !sim.done; n--) {
        p.apply(sim);
        sim.tick();
      }
      return { r: sim.result(), marks: sim.marks.map((m) => [m.hit, m.atS.toFixed(4)]) };
    };
    expect(play(60)).toEqual(play(60));
    expect(play(30)).toEqual(play(60));
    expect(play(144)).toEqual(play(60));
  });
});
