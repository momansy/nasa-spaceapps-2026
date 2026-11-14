import { describe, expect, it } from 'vitest';
import type { AssistLevel, MinigameMode } from '@protocol';
import { FixedStepper } from '../MG-08/model';
import { FIELD_KM, goodPlayer, makeSim, Mg27Sim, resolveConfig, runScripted, SPEED_KM_S, STEP_HZ, type Mg27Input } from './model';

const DURATION_S = 20;
const SEEDS = Array.from({ length: 24 }, (_, i) => 4 + i * 2287);
const MODES: MinigameMode[] = ['STANDARD', 'RELAXED', 'ONE_BUTTON'];
const ASSISTS: AssistLevel[] = ['CADET', 'ENGINEER', 'FLIGHT_DIRECTOR'];
const buf = (): Mg27Input => ({ vx: 0, vy: 0, go: false });
const mk = (params = {}, mode: MinigameMode = 'STANDARD', assist: AssistLevel = 'ENGINEER', seed = 3) => makeSim(params, seed, mode, assist, DURATION_S);

/** Puts the unit on the capsule at the given arrival step, so only the schedule decides (hand-made arrivals). */
function arriveAt(sim: Mg27Sim, step: number) {
  while (sim.step < step) sim.advance(buf());
  sim.x = sim.capX;
  sim.y = sim.capY;
  sim.advance(buf());
  return runScripted(sim, () => buf());
}

describe('MG-27 units', () => {
  it('the unit is params.unit, or slot mod 3: swimmers, collar, ship', () => {
    for (const slot of [0, 1, 2, 3, 4, 5, 8]) expect(resolveConfig({ slot }, 'STANDARD', 'ENGINEER', DURATION_S).unit).toBe(slot % 3);
    expect(resolveConfig({ unit: 2, slot: 0 }, 'STANDARD', 'ENGINEER', DURATION_S).unit).toBe(2);
    expect(resolveConfig({ unit: 7 }, 'STANDARD', 'ENGINEER', DURATION_S).unit).toBe(2);
  });
  it('the helicopter is faster than the boat, the boat faster than the ship', () => {
    expect(SPEED_KM_S[0]).toBeGreaterThan(SPEED_KM_S[1]);
    expect(SPEED_KM_S[1]).toBeGreaterThan(SPEED_KM_S[2]);
  });
  it('the window of a unit is after the unit before and before the unit after (swimmers first, ship last)', () => {
    const s0 = mk({ unit: 0 });
    expect(s0.window).toEqual({ fromS: 0, toS: s0.crewS[1] });
    const s1 = mk({ unit: 1 });
    expect(s1.window).toEqual({ fromS: s1.crewS[0], toS: s1.crewS[2] });
    const s2 = mk({ unit: 2 });
    expect(s2.window).toEqual({ fromS: s2.crewS[1], toS: s2.deadlineS });
    expect(s1.crewS[0]).toBeLessThan(s1.crewS[1]!);
    expect(s1.crewS[1]).toBeLessThan(s1.crewS[2]!);
  });
  it('the player count only changes the unit, never the difficulty', () => {
    const a = resolveConfig({ slot: 1, slots: 4 }, 'STANDARD', 'ENGINEER', DURATION_S);
    const b = resolveConfig({ unit: 1 }, 'STANDARD', 'ENGINEER', DURATION_S);
    expect({ ...a, slot: 0, slots: 0 }).toEqual({ ...b, slot: 0, slots: 0 });
  });
});

describe('MG-27 order of arrival (strict on both sides)', () => {
  it('the collar succeeds just after the swimmers and just before the ship, and fails just outside', () => {
    const sim0 = mk({ unit: 1 });
    const from = Math.ceil(sim0.window.fromS * STEP_HZ + 1e-9); // first step strictly after
    const to = Math.ceil(sim0.window.toS * STEP_HZ - 1e-9) - 1; // last step strictly before
    expect(arriveAt(mk({ unit: 1 }), from).success).toBe(true);
    expect(arriveAt(mk({ unit: 1 }), to).success).toBe(true);
    expect(arriveAt(mk({ unit: 1 }), from - 2).success).toBe(false);
    expect(arriveAt(mk({ unit: 1 }), to + 2).success).toBe(false);
  });
  it('the swimmers must beat the collar and the ship must come after it, within the deadline', () => {
    const s0 = mk({ unit: 0 });
    expect(arriveAt(mk({ unit: 0 }), 60).success).toBe(true);
    expect(arriveAt(mk({ unit: 0 }), Math.ceil(s0.crewS[1]! * STEP_HZ) + 5).success).toBe(false);
    const s2 = mk({ unit: 2 });
    expect(arriveAt(mk({ unit: 2 }), Math.floor(s2.crewS[1]! * STEP_HZ) - 5).success).toBe(false);
    expect(arriveAt(mk({ unit: 2 }), Math.ceil(s2.crewS[1]! * STEP_HZ) + 5).success).toBe(true);
    expect(arriveAt(mk({ unit: 2 }), s2.config.deadlineSteps - 3).success).toBe(true);
  });
  it('a unit that never arrives, or arrives after the deadline, fails; Relaxed has more time (the whole run)', () => {
    const std = mk({ unit: 2 });
    expect(std.deadlineS).toBe(15);
    expect(mk({ unit: 2 }, 'RELAXED').deadlineS).toBe(20);
    expect(runScripted(mk({ unit: 2 }), () => buf()).success).toBe(false);
    // the schedule of the ship is 13.3 to 14.7 s: in Standard the window is cut by the 15 s deadline
    expect(arriveAt(mk({ unit: 2 }), 15 * STEP_HZ + 20).success).toBe(false);
  });
  it('perfect = the middle 40 % of the window, and it implies success', () => {
    const sim0 = mk({ unit: 1 });
    const w = sim0.window;
    const mid = Math.round(((w.fromS + w.toS) / 2) * STEP_HZ);
    expect(arriveAt(mk({ unit: 1 }), mid).perfect).toBe(true);
    const edge = Math.round((w.fromS + 0.05 * (w.toS - w.fromS)) * STEP_HZ);
    const e = arriveAt(mk({ unit: 1 }), edge);
    expect(e.success).toBe(true);
    expect(e.perfect).toBe(false);
  });
  it('the crew never changes my result: the schedule alone decides', () => {
    const a = runScripted(mk({ unit: 1 }), (s, o) => goodPlayer(s, o));
    expect(a.arrivalS(0)).toBe(a.crewS[0]); // shown once it has happened
    expect(a.result().success).toBe(true);
  });
});

describe('MG-27 beacon and movement', () => {
  it('the signal rises as the unit closes in and is full at the capsule', () => {
    const sim = mk({ unit: 1 });
    const far = sim.closeness;
    sim.x = sim.capX + 6 * (sim.x < sim.capX ? -1 : 1);
    sim.y = sim.capY;
    sim.advance(buf());
    const mid = sim.closeness;
    sim.x = sim.capX + 1;
    sim.y = sim.capY;
    sim.advance(buf());
    const near = sim.closeness;
    expect(near).toBeGreaterThan(mid);
    expect(mid).toBeGreaterThan(0);
    expect(far).toBeGreaterThanOrEqual(0);
    sim.x = sim.capX;
    sim.y = sim.capY;
    sim.advance(buf());
    expect(sim.closeness).toBeGreaterThan(0.99);
  });
  it('the capsule is not on the screen: the sim never exposes it through the signal alone but it is seeded and stays in the sea', () => {
    for (const seed of SEEDS) {
      const s = mk({}, 'STANDARD', 'ENGINEER', seed);
      for (const v of [s.capX, s.capY, s.x, s.y]) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(FIELD_KM);
      }
    }
  });
  it('the unit cannot move faster than its top speed and stays inside the sea', () => {
    const sim = mk({ unit: 0 });
    let maxV = 0;
    for (let i = 0; i < 600; i++) {
      sim.advance({ vx: 3, vy: 3, go: false });
      maxV = Math.max(maxV, Math.hypot(sim.vx, sim.vy));
    }
    expect(maxV).toBeLessThanOrEqual(SPEED_KM_S[0] + 1e-9);
    expect(sim.x).toBeLessThanOrEqual(FIELD_KM);
    expect(sim.y).toBeLessThanOrEqual(FIELD_KM);
  });
  it('one-button: the unit stays until it is set off, then steers itself to the capsule', () => {
    const sim = mk({ unit: 1 }, 'ONE_BUTTON');
    const x0 = sim.x;
    for (let i = 0; i < 120; i++) sim.advance(buf());
    expect(sim.x).toBe(x0);
    runScripted(sim, (_s, o) => {
      o.go = true;
      return o;
    });
    expect(sim.state).toBe('arrived');
  });
  it('Relaxed has an easier beacon (and an arrow); Cadet has a larger arrival radius and Flight Director a smaller one', () => {
    const c = (m: MinigameMode, a: AssistLevel) => resolveConfig({}, m, a, DURATION_S);
    expect(c('RELAXED', 'ENGINEER').beaconPower).toBeLessThan(c('STANDARD', 'ENGINEER').beaconPower);
    expect(c('RELAXED', 'ENGINEER').arrow).toBe(true);
    expect(c('STANDARD', 'CADET').arriveKm / c('STANDARD', 'ENGINEER').arriveKm).toBeCloseTo(1.25, 6);
    expect(c('STANDARD', 'FLIGHT_DIRECTOR').arriveKm / c('STANDARD', 'ENGINEER').arriveKm).toBeCloseTo(0.8, 6);
  });
});

describe('MG-27 host parameter overrides', () => {
  it('arrive_km sets the arrival radius, deadline_fraction the Standard deadline, perfect_fraction the perfect band', () => {
    expect(mk({ arrive_km: 1 }).config.arriveKm).toBe(1);
    const a = mk({ unit: 1, arrive_km: 2 });
    a.x = a.capX + 1.9;
    a.y = a.capY;
    a.advance(buf());
    expect(a.state).toBe('arrived');
    const b = mk({ unit: 1 });
    b.x = b.capX + 1.9;
    b.y = b.capY;
    b.advance(buf());
    expect(b.state).toBe('search');
    expect(mk({ deadline_fraction: 0.5 }).deadlineS).toBe(10);
    const w = mk({ unit: 1, perfect_fraction: 1 });
    const edge = Math.round((w.window.fromS + 0.05 * (w.window.toS - w.window.fromS)) * STEP_HZ);
    expect(arriveAt(mk({ unit: 1, perfect_fraction: 1 }), edge).perfect).toBe(true);
  });
  it('the scheduled arrivals scale with the run length so a shorter lab run stays winnable', () => {
    const short = makeSim({ unit: 2 }, 3, 'STANDARD', 'ENGINEER', 10);
    expect(short.window.fromS).toBeLessThan(short.deadlineS);
    expect(runScripted(short, (s, o) => goodPlayer(s, o)).success).toBe(true);
  });
});

describe('MG-27 determinism and play', () => {
  it('same seed and input give the same run, different seeds differ', () => {
    const a = runScripted(mk({ unit: 1 }), (s, o) => goodPlayer(s, o));
    const b = runScripted(mk({ unit: 1 }), (s, o) => goodPlayer(s, o));
    expect(a.result()).toEqual(b.result());
    expect(a.arriveStep).toBe(b.arriveStep);
    expect(mk({}, 'STANDARD', 'ENGINEER', 4).capX).not.toBe(a.capX);
  });
  it('does not depend on the frame rate', () => {
    for (const fps of [60, 30, 144]) {
      const st = new FixedStepper();
      const sim = mk({ unit: 1 });
      const o = buf();
      for (let t = 0; t < 20000 + 1000 / fps; t += 1000 / fps) for (let n = st.advance(1000 / fps); n > 0 && !sim.done; n--) sim.advance(goodPlayer(sim, o));
      expect(sim.done).toBe(true);
      expect(sim.result().success).toBe(true);
    }
  });
  for (const mode of MODES) {
    it(`a scripted good player succeeds on ≥ 20 seeds for every unit and difficulty in ${mode}, and perfect implies success`, () => {
      for (const unit of [0, 1, 2]) {
        for (const assist of ASSISTS) {
          let wins = 0;
          for (const seed of SEEDS) {
            const sim = runScripted(makeSim({ unit }, seed, mode, assist, DURATION_S), (s, o) => goodPlayer(s, o));
            const r = sim.result();
            if (r.success) wins++;
            if (r.perfect) expect(r.success).toBe(true);
            expect(sim.step).toBeLessThanOrEqual(sim.totalSteps);
          }
          expect(wins).toBeGreaterThanOrEqual(20);
        }
      }
    });
    it(`an idle player fails in ${mode} on every seed and unit`, () => {
      for (const unit of [0, 1, 2]) {
        for (const seed of SEEDS) {
          const sim = runScripted(makeSim({ unit }, seed, mode, 'ENGINEER', DURATION_S), () => buf());
          expect(sim.result().success).toBe(false);
          expect(sim.result().score).toBeLessThan(0.5);
        }
      }
    });
  }
  it('a collar boat that rushes in at full speed arrives before the swimmers and fails (order matters)', () => {
    let fails = 0;
    for (const seed of SEEDS) {
      const sim = runScripted(makeSim({ unit: 1 }, seed, 'STANDARD', 'ENGINEER', DURATION_S), (s, o) => goodPlayer(s, o, -4));
      if (!sim.result().success) fails++;
    }
    expect(fails).toBeGreaterThan(SEEDS.length * 0.5);
  });
  it('the result is stable after the end', () => {
    const sim = runScripted(mk({ unit: 1 }), (s, o) => goodPlayer(s, o));
    const r = sim.result();
    sim.advance({ vx: 1, vy: 0, go: true });
    expect(sim.result()).toEqual(r);
  });
});
