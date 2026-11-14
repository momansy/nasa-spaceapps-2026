import { describe, expect, it } from 'vitest';
import { FixedStepper, STEP_HZ } from '../MG-13/kit';
import { createScene, DEFAULTS, isClouded, Mg21Autopilot, Mg21Sim, resolveConfig, runScripted, scoreRun, TARGET_R } from './model';

const RUN_S = 20;
const STANDARD = resolveConfig({}, 'STANDARD', 'ENGINEER');
const SEEDS = Array.from({ length: 24 }, (_, i) => (i * 3266489917 + 11) >>> 0);

describe('MG-21 scoring', () => {
  it('succeeds at exactly 3 good captures and fails at 2', () => {
    expect(scoreRun(3, 6, 0, STANDARD).success).toBe(true);
    expect(scoreRun(2, 6, 0, STANDARD).success).toBe(false);
  });

  it('is perfect only when every passing target is captured; perfect implies success', () => {
    expect(scoreRun(6, 6, 0, STANDARD).perfect).toBe(true);
    expect(scoreRun(5, 6, 0, STANDARD).perfect).toBe(false);
    for (let g = 0; g <= 6; g++) {
      const r = scoreRun(g, 6, 0, STANDARD);
      if (r.perfect) expect(r.success).toBe(true);
    }
  });

  it('score rises with good captures and drops with wasted shots', () => {
    expect(scoreRun(4, 6, 0, STANDARD).score).toBeGreaterThan(scoreRun(3, 6, 0, STANDARD).score);
    expect(scoreRun(4, 6, 2, STANDARD).score).toBeLessThan(scoreRun(4, 6, 0, STANDARD).score);
    expect(scoreRun(0, 6, 9, STANDARD).score).toBe(0);
  });

  it('takes the threshold, target count and radar from the host parameters', () => {
    const c = resolveConfig({ good_captures_min: 5, target_count: 8, radar: true }, 'STANDARD', 'ENGINEER');
    expect(c.goodMin).toBe(5);
    expect(c.targetCount).toBe(8);
    expect(c.radar).toBe(true);
    expect(scoreRun(5, 8, 0, c).success).toBe(true);
    expect(scoreRun(4, 8, 0, c).success).toBe(false);
    expect(resolveConfig({}, 'STANDARD', 'ENGINEER').goodMin).toBe(DEFAULTS.good_captures_min);
    expect(createScene(c, 3, RUN_S).targets).toHaveLength(8);
  });
});

describe('MG-21 scene', () => {
  it('optical: city lights only on the night side, other targets on the day side', () => {
    for (const seed of SEEDS) {
      const sc = createScene(STANDARD, seed, RUN_S);
      for (const t of sc.targets) {
        const nightSide = sc.dayFirst ? t.s > sc.terminatorS : t.s < sc.terminatorS;
        expect(nightSide, `seed ${seed} ${t.type}`).toBe(t.type === 'city_lights');
      }
      expect(sc.targets.some((t) => t.type === 'city_lights')).toBe(true);
    }
  });

  it('radar: no city lights and no clouds in the way', () => {
    const radar = resolveConfig({ radar: true }, 'STANDARD', 'ENGINEER');
    for (const seed of SEEDS) {
      const sc = createScene(radar, seed, RUN_S);
      expect(sc.targets.some((t) => t.type === 'city_lights')).toBe(false);
      for (const t of sc.targets) for (let tt = 0; tt < sc.durationS; tt += 0.1) expect(isClouded(radar, t, tt)).toBe(false);
    }
  });

  it('clouds never cover a hurricane, and every target has a clear framed moment', () => {
    for (const seed of SEEDS) {
      const sim = new Mg21Sim(STANDARD, seed, RUN_S);
      for (const t of sim.scene.targets) {
        if (t.type === 'hurricane') expect(t.cloud).toBe(false);
        // Clear time inside the frame (frame centred on the target), at least 0.4 s.
        let clear = 0;
        for (let k = 0; k < sim.totalSteps; k++) {
          const s = (k / STEP_HZ) * STANDARD.speed;
          if (Math.abs(t.s - s) <= STANDARD.frameHalfH - TARGET_R / 2 && !isClouded(STANDARD, t, k / STEP_HZ)) clear++;
        }
        expect(clear / STEP_HZ, `seed ${seed} target ${t.index}`).toBeGreaterThanOrEqual(0.4);
      }
    }
  });

  it('a clouded optical snap is wasted; a framed clear snap is good', () => {
    // Find a target with a cloud and photograph it while clouded, then when clear.
    for (const seed of SEEDS) {
      const sim = new Mg21Sim(STANDARD, seed, RUN_S);
      const t = sim.scene.targets.find((x) => x.cloud);
      if (!t) continue;
      sim.fx = t.x;
      sim.aim(t.x);
      let shotCloudy = false;
      while (!sim.done) {
        const w = sim.wouldGet();
        if (w.target === t && w.outcome === 'cloudy' && !shotCloudy && sim.shutter === 0) {
          sim.snap();
          shotCloudy = true;
        } else if (shotCloudy && w.target === t && w.outcome === 'good' && sim.shutter === 0) sim.snap();
        sim.tick();
        if (t.captured) break;
      }
      expect(shotCloudy).toBe(true);
      expect(sim.shots[0]!.outcome).toBe('cloudy');
      expect(t.captured).toBe(true);
      return;
    }
    throw new Error('no clouded target found');
  });
});

describe('MG-21 modes and difficulty', () => {
  it('Relaxed: slower ground track and a larger frame', () => {
    const r = resolveConfig({}, 'RELAXED', 'ENGINEER');
    expect(r.speed).toBeLessThan(STANDARD.speed);
    expect(r.frameHalfW).toBeGreaterThan(STANDARD.frameHalfW);
    expect(r.frameHalfH).toBeGreaterThan(STANDARD.frameHalfH);
  });

  it('Cadet is easier and Flight Director harder than Engineer', () => {
    const cadet = resolveConfig({}, 'STANDARD', 'CADET');
    const fd = resolveConfig({}, 'STANDARD', 'FLIGHT_DIRECTOR');
    expect(cadet.frameHalfW).toBeGreaterThan(STANDARD.frameHalfW);
    expect(fd.frameHalfW).toBeLessThan(STANDARD.frameHalfW);
    expect(cadet.cloudShare).toBeLessThan(fd.cloudShare);
    expect(fd.speed).toBeGreaterThan(STANDARD.speed);
  });
});

describe('MG-21 runs', () => {
  for (const mode of ['STANDARD', 'RELAXED', 'ONE_BUTTON'] as const) {
    for (const assist of ['CADET', 'ENGINEER', 'FLIGHT_DIRECTOR'] as const) {
      for (const radar of [false, true]) {
        it(`a scripted good player succeeds on ${SEEDS.length} seeds (${mode}, ${assist}, ${radar ? 'radar' : 'optical'})`, () => {
          const cfg = resolveConfig({ radar }, mode, assist);
          for (const seed of SEEDS) {
            const pilot = new Mg21Autopilot();
            const sim = runScripted(cfg, seed, RUN_S, (s) => pilot.apply(s));
            expect(sim.score().success, `seed ${seed}`).toBe(true);
            expect(sim.score().perfect, `seed ${seed} perfect`).toBe(true);
          }
        });
      }
    }
  }

  it('an idle player fails; a shutter-masher wastes shots', () => {
    for (const mode of ['STANDARD', 'RELAXED', 'ONE_BUTTON'] as const) {
      for (const seed of SEEDS) expect(runScripted(resolveConfig({}, mode, 'ENGINEER'), seed, RUN_S, () => undefined).score().success).toBe(false);
    }
    const masher = runScripted(STANDARD, 5, RUN_S, (s) => s.snap());
    expect(masher.wasted).toBeGreaterThan(10);
    expect(masher.score().score).toBeLessThan(0.5);
  });

  it('one-button: the camera points itself and a press snaps', () => {
    const cfg = resolveConfig({}, 'ONE_BUTTON', 'ENGINEER');
    const pilot = new Mg21Autopilot();
    const sim = runScripted(cfg, 77, RUN_S, (s) => pilot.apply(s));
    expect(sim.good).toBe(cfg.targetCount);
    expect(sim.score().success).toBe(true);
  });

  it('never runs past 75 % of the time in Standard', () => {
    const sim = runScripted(STANDARD, 1, RUN_S, () => undefined);
    expect(sim.step).toBe(Math.round(RUN_S * 0.75 * STEP_HZ));
  });

  it('is deterministic from the seed', () => {
    const a = runScripted(STANDARD, 4242, RUN_S, (s) => new Mg21Autopilot().apply(s));
    const b = runScripted(STANDARD, 4242, RUN_S, (s) => new Mg21Autopilot().apply(s));
    expect(a.shots).toEqual(b.shots);
    expect(a.scene.targets.map((t) => t.type)).toEqual(b.scene.targets.map((t) => t.type));
  });

  it('does not depend on the frame rate', () => {
    const play = (frameMs: number) => {
      const sim = new Mg21Sim(STANDARD, 8, RUN_S);
      const pilot = new Mg21Autopilot();
      const stepper = new FixedStepper();
      while (!sim.done) {
        for (let k = stepper.advance(frameMs); k > 0 && !sim.done; k--) {
          pilot.apply(sim);
          sim.tick();
        }
      }
      return sim.shots;
    };
    const a = play(1000 / 60);
    expect(play(1000 / 30)).toEqual(a);
    expect(play(1000 / 90)).toEqual(a);
  });
});
