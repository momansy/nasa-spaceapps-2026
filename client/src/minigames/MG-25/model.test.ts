import { describe, expect, it } from 'vitest';
import type { AssistLevel, MinigameMode } from '@protocol';
import { FixedStepper } from '../MG-08/model';
import { dialToKhz, goodPlayer, hash01, makeSim, Mg25Sim, resolveConfig, runScripted, STEP_HZ, type Mg25Input } from './model';

const DURATION_S = 15;
const SEEDS = Array.from({ length: 24 }, (_, i) => 5 + i * 3571);
const MODES: MinigameMode[] = ['STANDARD', 'RELAXED', 'ONE_BUTTON'];
const NOP: Mg25Input = { turn: 0, lock: false };
const LOCK: Mg25Input = { turn: 0, lock: true };

/** STANDARD sim with the dial parked on the beacon (no turning), so only the clock matters. */
function parked(params = {}, seed = 3, assist: AssistLevel = 'ENGINEER') {
  const sim = makeSim(params, seed, 'STANDARD', assist, DURATION_S);
  sim.dial = sim.beaconF;
  return sim;
}
const idleTo = (sim: Mg25Sim, step: number) => {
  while (sim.step < step && !sim.done) sim.advance(NOP);
};

describe('MG-25 lock time (limit 10 s, a miss costs 1 s)', () => {
  it('succeeds exactly at 10 s and not one step later', () => {
    const at = parked();
    idleTo(at, 10 * STEP_HZ);
    at.advance(LOCK);
    expect(at.state).toBe('locked');
    expect(at.lockCostSteps).toBe(1200);
    expect(runScripted(at, () => NOP).result().success).toBe(true);

    const past = parked();
    idleTo(past, 10 * STEP_HZ + 1);
    expect(past.state).toBe('lost');
    past.advance(LOCK);
    expect(past.state).toBe('lost');
    expect(runScripted(past, () => LOCK).result().success).toBe(false);
  });
  it('a LOCK outside the zone costs 1 s: lock time is the clock plus the penalties', () => {
    const edge = (lockStep: number) => {
      const sim = parked();
      sim.dial = sim.beaconF + 0.2; // outside the zone
      sim.advance(LOCK);
      expect(sim.misses).toBe(1);
      sim.dial = sim.beaconF;
      idleTo(sim, lockStep);
      return sim;
    };
    const ok = edge(1200 - 120);
    ok.advance(LOCK);
    expect(ok.state).toBe('locked');
    expect(ok.lockCostSteps).toBe(1200);
    expect(runScripted(ok, () => NOP).result().success).toBe(true);
    const late = edge(1200 - 120 + 1);
    expect(late.state).toBe('lost');
  });
  it('the button is dead for 0.5 s after a miss, so mashing does not help', () => {
    const sim = parked();
    sim.dial = sim.beaconF + 0.2;
    sim.advance(LOCK);
    sim.dial = sim.beaconF;
    sim.advance(LOCK); // inside the cooldown: ignored
    expect(sim.state).toBe('search');
    expect(sim.misses).toBe(1);
    idleTo(sim, 61);
    sim.advance(LOCK);
    expect(sim.state).toBe('locked');
  });
  it('takes the limit from the host parameters', () => {
    const a = parked({ lock_time_max_s: 5 });
    idleTo(a, 600);
    a.advance(LOCK);
    expect(runScripted(a, () => NOP).result().success).toBe(true);
    const b = parked({ lock_time_max_s: 5 });
    idleTo(b, 601);
    expect(b.state).toBe('lost');
  });
  it('the lock zone is ±3 kHz (0.03 dial units) and a host zone_half overrides it', () => {
    const at = (offset: number, params = {}) => {
      const sim = makeSim(params, 3, 'STANDARD', 'ENGINEER', DURATION_S);
      sim.dial = sim.beaconF + offset;
      sim.advance(LOCK);
      return sim.state;
    };
    expect(at(0.029)).toBe('locked');
    expect(at(0.031)).toBe('search');
    expect(at(0.05, { zone_half: 0.06 })).toBe('locked');
    expect(at(0.05)).toBe('search');
  });
  it('perfect = no miss and within half the limit; it implies success', () => {
    const quick = parked();
    idleTo(quick, 600);
    quick.advance(LOCK);
    expect(runScripted(quick, () => NOP).result().perfect).toBe(true);
    const slow = parked();
    idleTo(slow, 601);
    slow.advance(LOCK);
    const r = runScripted(slow, () => NOP).result();
    expect(r.success).toBe(true);
    expect(r.perfect).toBe(false);
  });
});

describe('MG-25 signal', () => {
  it('peaks at the beacon: hand-computed Gaussian, σ = 0.045', () => {
    const sim = parked();
    sim.advance(NOP);
    expect(sim.closeness).toBeCloseTo(1, 12);
    sim.dial = sim.beaconF + 0.045;
    sim.advance(NOP);
    expect(sim.closeness).toBeCloseTo(Math.exp(-0.5), 12);
    sim.dial = sim.beaconF + 0.09;
    sim.advance(NOP);
    expect(sim.closeness).toBeCloseTo(Math.exp(-2), 12);
  });
  it('the static is deterministic and bounded', () => {
    expect(hash01(123)).toBe(hash01(123));
    for (let i = 0; i < 1000; i++) {
      const v = hash01(i);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
  it('the dial window is −50…+50 kHz', () => {
    expect(dialToKhz(0)).toBe(-50);
    expect(dialToKhz(0.5)).toBe(0);
    expect(dialToKhz(1)).toBe(50);
  });
  it('the knob turns at most 0.8 dial units per second', () => {
    const sim = makeSim({}, 1, 'STANDARD', 'ENGINEER', DURATION_S);
    const d0 = sim.dial;
    for (let i = 0; i < 120; i++) sim.advance({ turn: 5, lock: false });
    expect(Math.abs(sim.dial - d0)).toBeLessThanOrEqual(0.8 + 1e-9);
  });
});

describe('MG-25 configuration', () => {
  const z = (m: MinigameMode, a: AssistLevel) => resolveConfig({}, m, a).zoneHalf;
  it('Relaxed has a stronger beacon and a wider zone; one-button sweeps by itself', () => {
    expect(z('RELAXED', 'ENGINEER')).toBeGreaterThan(z('STANDARD', 'ENGINEER'));
    expect(resolveConfig({}, 'RELAXED', 'ENGINEER').beaconStrength).toBeGreaterThan(resolveConfig({}, 'STANDARD', 'ENGINEER').beaconStrength);
    const ob = resolveConfig({}, 'ONE_BUTTON', 'ENGINEER');
    expect(ob.sweepPerS).toBeGreaterThan(0);
    expect(ob.wholeField).toBe(true);
    expect(resolveConfig({}, 'STANDARD', 'ENGINEER').sweepPerS).toBe(0);
  });
  it('Cadet is easier and Flight Director harder by about 25 %', () => {
    expect(z('STANDARD', 'CADET') / z('STANDARD', 'ENGINEER')).toBeCloseTo(1.25, 6);
    expect(z('STANDARD', 'FLIGHT_DIRECTOR') / z('STANDARD', 'ENGINEER')).toBeCloseTo(0.8, 6);
    expect(resolveConfig({}, 'STANDARD', 'CADET').noiseAmp).toBeLessThan(resolveConfig({}, 'STANDARD', 'FLIGHT_DIRECTOR').noiseAmp);
  });
  it('does not depend on the player count', () => {
    expect(resolveConfig({ slot: 3, slots: 6 }, 'STANDARD', 'ENGINEER')).toEqual(resolveConfig({}, 'STANDARD', 'ENGINEER'));
  });
  it('the lock zone is hidden until the dial is near it (Flight Director nearer), but always drawn in Relaxed and Cadet', () => {
    const far = (m: MinigameMode, a: AssistLevel) => {
      const sim = makeSim({}, 3, m, a, DURATION_S);
      sim.dial = sim.beaconF + 0.4;
      return sim.zoneVisible;
    };
    expect(far('STANDARD', 'ENGINEER')).toBe(false);
    expect(far('RELAXED', 'ENGINEER')).toBe(true);
    expect(far('STANDARD', 'CADET')).toBe(true);
    const near = makeSim({}, 3, 'STANDARD', 'FLIGHT_DIRECTOR', DURATION_S);
    near.dial = near.beaconF + 0.1;
    expect(near.zoneVisible).toBe(false);
    near.dial = near.beaconF + 0.05;
    expect(near.zoneVisible).toBe(true);
  });
});

describe('MG-25 determinism and play', () => {
  it('same seed and input give the same run, different seeds differ', () => {
    const a = runScripted(makeSim({}, 5, 'STANDARD', 'ENGINEER', DURATION_S), (s) => goodPlayer(s));
    const b = runScripted(makeSim({}, 5, 'STANDARD', 'ENGINEER', DURATION_S), (s) => goodPlayer(s));
    expect(a.result()).toEqual(b.result());
    expect(a.lockStep).toBe(b.lockStep);
    expect(makeSim({}, 6, 'STANDARD', 'ENGINEER', DURATION_S).beaconF).not.toBe(makeSim({}, 5, 'STANDARD', 'ENGINEER', DURATION_S).beaconF);
  });
  it('does not depend on the frame rate', () => {
    for (const fps of [60, 30, 144]) {
      const st = new FixedStepper();
      const sim = makeSim({}, 5, 'STANDARD', 'ENGINEER', DURATION_S);
      for (let t = 0; t < 15000 + 1000 / fps; t += 1000 / fps) for (let n = st.advance(1000 / fps); n > 0 && !sim.done; n--) sim.advance(goodPlayer(sim));
      expect(sim.done).toBe(true);
      expect(sim.result().success).toBe(true);
    }
  });
  for (const mode of MODES) {
    for (const assist of ['CADET', 'ENGINEER', 'FLIGHT_DIRECTOR'] as AssistLevel[]) {
      it(`a scripted good player succeeds on ≥ 20 seeds in ${mode} at ${assist}, and perfect implies success`, () => {
        let wins = 0;
        for (const seed of SEEDS) {
          const sim = runScripted(makeSim({}, seed, mode, assist, DURATION_S), (s) => goodPlayer(s));
          const r = sim.result();
          if (r.success) wins++;
          if (r.perfect) expect(r.success).toBe(true);
          expect(sim.step).toBeLessThanOrEqual(DURATION_S * STEP_HZ);
        }
        expect(wins).toBeGreaterThanOrEqual(20);
      });
    }
    it(`an idle player fails in ${mode} on every seed, and the run ends by itself`, () => {
      for (const seed of SEEDS) {
        const sim = runScripted(makeSim({}, seed, mode, 'ENGINEER', DURATION_S), () => NOP);
        expect(sim.result().success).toBe(false);
        expect(sim.result().score).toBeLessThan(0.5);
        expect(sim.state).toBe('lost');
      }
    });
  }
  it('one-button: the dial sweeps 0…1 by itself and a press at the beacon locks', () => {
    const sim = makeSim({}, 4, 'ONE_BUTTON', 'ENGINEER', DURATION_S);
    sim.advance(NOP);
    sim.advance(NOP);
    expect(sim.dial).toBeCloseTo((0.18 * 1) / 120, 9);
    const r = runScripted(sim, (s) => goodPlayer(s)).result();
    expect(r.success).toBe(true);
  });
  it('Relaxed is easier than Standard: a sloppier aim still locks', () => {
    const offset = 0.04; // beyond the Standard zone (0.03), inside the Relaxed zone (0.048)
    const lockAt = (mode: MinigameMode) => {
      const sim = makeSim({}, 3, mode, 'ENGINEER', DURATION_S);
      sim.dial = sim.beaconF + offset;
      sim.advance(LOCK);
      return sim.state;
    };
    expect(lockAt('STANDARD')).toBe('search');
    expect(lockAt('RELAXED')).toBe('locked');
  });
  it('the result is stable after the end', () => {
    const sim = runScripted(makeSim({}, 1, 'STANDARD', 'ENGINEER', DURATION_S), (s) => goodPlayer(s));
    const r = sim.result();
    sim.advance(LOCK);
    expect(sim.result()).toEqual(r);
  });
});
