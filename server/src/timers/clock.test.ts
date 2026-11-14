import { describe, expect, it } from 'vitest';
import { fixedClock, systemClock } from './clock.js';

describe('systemClock', () => {
  it('returns a number close to Date.now() (smoke check only)', () => {
    const before = Date.now();
    const value = systemClock.nowMs();
    const after = Date.now();
    expect(typeof value).toBe('number');
    expect(value).toBeGreaterThanOrEqual(before);
    expect(value).toBeLessThanOrEqual(after);
  });
});

describe('fixedClock', () => {
  it('starts at 0 by default', () => {
    const clock = fixedClock();
    expect(clock.nowMs()).toBe(0);
  });

  it('starts at the given startMs', () => {
    const clock = fixedClock(1_000);
    expect(clock.nowMs()).toBe(1_000);
  });

  it('advance() moves the clock forward by the given amount', () => {
    const clock = fixedClock(100);
    clock.advance(50);
    expect(clock.nowMs()).toBe(150);
    clock.advance(0);
    expect(clock.nowMs()).toBe(150);
    clock.advance(25);
    expect(clock.nowMs()).toBe(175);
  });

  it('advance() rejects a negative duration', () => {
    const clock = fixedClock(100);
    expect(() => clock.advance(-1)).toThrow();
  });

  it('set() jumps to an absolute time, forward or backward', () => {
    const clock = fixedClock(100);
    clock.set(5_000);
    expect(clock.nowMs()).toBe(5_000);
    clock.set(0);
    expect(clock.nowMs()).toBe(0);
  });

  it('each fixedClock() call is an independent instance', () => {
    const a = fixedClock(0);
    const b = fixedClock(0);
    a.advance(100);
    expect(a.nowMs()).toBe(100);
    expect(b.nowMs()).toBe(0);
  });
});
