import { describe, expect, it } from 'vitest';
import { newBucket, tryConsume, type Clock, type TokenBucketConfig } from './tokenBucket.js';

/** Trivial local fake clock — no vitest fake timers, per the task brief. */
function fakeClock(startMs = 0): Clock & { set(ms: number): void; advance(ms: number): void } {
  let current = startMs;
  return {
    nowMs(): number {
      return current;
    },
    set(ms: number): void {
      current = ms;
    },
    advance(ms: number): void {
      current += ms;
    },
  };
}

describe('newBucket', () => {
  it('starts full (tokens = burst)', () => {
    const clock = fakeClock(1000);
    const config: TokenBucketConfig = { ratePerSec: 2, burst: 4 };
    const state = newBucket(config, clock);
    expect(state.tokens).toBe(4);
    expect(state.lastRefillMs).toBe(1000);
  });
});

describe('tryConsume — draining and refill', () => {
  const config: TokenBucketConfig = { ratePerSec: 2, burst: 4 };

  it('drains tokens one at a time until exhausted', () => {
    const clock = fakeClock(0);
    let state = newBucket(config, clock);

    for (let i = 0; i < 4; i++) {
      const result = tryConsume(state, config, clock);
      expect(result.allowed).toBe(true);
      state = result.state;
    }
    expect(state.tokens).toBe(0);

    const fifth = tryConsume(state, config, clock);
    expect(fifth.allowed).toBe(false);
  });

  it('refills proportionally to elapsed whole seconds', () => {
    const clock = fakeClock(0);
    let state = newBucket(config, clock);
    // Drain fully.
    for (let i = 0; i < 4; i++) state = tryConsume(state, config, clock).state;
    expect(state.tokens).toBe(0);

    // 1 second elapsed at 2/s => 2 tokens back.
    clock.advance(1000);
    const result = tryConsume(state, config, clock);
    expect(result.allowed).toBe(true);
    // Had 2 tokens, consumed 1 => 1 left.
    expect(result.state.tokens).toBeCloseTo(1, 10);
  });

  it('refills fractionally for sub-second elapsed time', () => {
    const clock = fakeClock(0);
    let state = newBucket(config, clock);
    for (let i = 0; i < 4; i++) state = tryConsume(state, config, clock).state;
    expect(state.tokens).toBe(0);

    // 250ms at 2/s => 0.5 tokens; not enough for a full token, consume should fail.
    clock.advance(250);
    const result = tryConsume(state, config, clock);
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.state.tokens).toBeCloseTo(0.5, 10);
      // Missing 0.5 tokens at 2/s => 250ms more needed.
      expect(result.retryAfterMs).toBe(250);
    }
  });

  it('caps refill at burst even after a very long elapsed time', () => {
    const clock = fakeClock(0);
    let state = newBucket(config, clock);
    state = tryConsume(state, config, clock).state; // tokens = 3
    clock.advance(1_000_000);
    const result = tryConsume(state, config, clock);
    expect(result.allowed).toBe(true);
    expect(result.state.tokens).toBe(config.burst - 1); // refilled to burst, then consumed 1
  });

  it('retryAfterMs is sane: consuming immediately after the suggested wait succeeds', () => {
    const clock = fakeClock(0);
    let state = newBucket(config, clock);
    for (let i = 0; i < 4; i++) state = tryConsume(state, config, clock).state;

    const rejected = tryConsume(state, config, clock);
    expect(rejected.allowed).toBe(false);
    if (rejected.allowed) throw new Error('expected rejection');

    clock.advance(rejected.retryAfterMs);
    const retried = tryConsume(rejected.state, config, clock);
    expect(retried.allowed).toBe(true);
  });

  it('supports a custom cost greater than 1', () => {
    const clock = fakeClock(0);
    const state = newBucket(config, clock); // tokens = 4
    const result = tryConsume(state, config, clock, 3);
    expect(result.allowed).toBe(true);
    expect(result.state.tokens).toBe(1);

    const second = tryConsume(result.state, config, clock, 3);
    expect(second.allowed).toBe(false);
  });
});

describe('tryConsume — ratePerSec === 0 special case ("once ever", e.g. hello)', () => {
  const onceConfig: TokenBucketConfig = { ratePerSec: 0, burst: 1 };

  it('allows exactly one message, ever', () => {
    const clock = fakeClock(0);
    const state = newBucket(onceConfig, clock);
    const first = tryConsume(state, onceConfig, clock);
    expect(first.allowed).toBe(true);
    expect(first.state.tokens).toBe(0);
  });

  it('never refills regardless of elapsed time', () => {
    const clock = fakeClock(0);
    let state = newBucket(onceConfig, clock);
    state = tryConsume(state, onceConfig, clock).state;

    clock.advance(1_000_000_000);
    const result = tryConsume(state, onceConfig, clock);
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.state.tokens).toBe(0);
      expect(result.retryAfterMs).toBe(Number.POSITIVE_INFINITY);
    }
  });
});
