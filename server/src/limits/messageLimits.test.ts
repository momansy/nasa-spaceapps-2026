import { describe, expect, it } from 'vitest';
import {
  FRAME_SIZE_LIMIT_BEFORE_HELLO,
  FRAME_SIZE_LIMIT_HOST,
  FRAME_SIZE_LIMIT_PHONE,
  HOST_OVERALL_BUDGET,
  newOverallBudgetState,
  PER_TYPE_LIMITS,
  PHONE_OVERALL_BUDGET,
  reactSendLimit,
  recordMessage,
} from './messageLimits.js';
import { newBucket, tryConsume, type Clock } from './tokenBucket.js';

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

describe('PER_TYPE_LIMITS — messages.md §11 table', () => {
  it('vote.cast is 4/s burst 8', () => {
    expect(PER_TYPE_LIMITS['vote.cast']).toEqual({ ratePerSec: 4, burst: 8 });
  });

  it('ping.send is 1 per 2s burst 3', () => {
    expect(PER_TYPE_LIMITS['ping.send']).toEqual({ ratePerSec: 0.5, burst: 3 });
  });

  it('pilot.input is 30/s burst 40', () => {
    expect(PER_TYPE_LIMITS['pilot.input']).toEqual({ ratePerSec: 30, burst: 40 });
  });

  it('hello is the "once" special case', () => {
    expect(PER_TYPE_LIMITS.hello).toEqual({ ratePerSec: 0, burst: 1 });
  });

  it('covers every client-sent type from the §11 table', () => {
    const expectedTypes = [
      'hello',
      'clock.ping',
      'room.create',
      'room.join',
      'room.resume',
      'room.leave',
      'player.profile',
      'player.prefs',
      'roles.pick',
      'roles.vote',
      'ability.use',
      'vote.predict',
      'vote.tag',
      'vote.cast',
      'vote.veto',
      'vote.trivia.answer',
      'vote.trivia.pick',
      'ping.send',
      'poll.answer',
      'pilot.input',
      'pilot.action',
      'copilot.action',
      'console.callout',
      'console.request',
      'mg.ready',
      'mg.progress',
      'mg.action',
      'mg.result',
    ];
    for (const type of expectedTypes) {
      expect(PER_TYPE_LIMITS[type], `missing entry for ${type}`).toBeDefined();
    }
    // react.send is intentionally excluded — handled by reactSendLimit instead.
    expect(PER_TYPE_LIMITS['react.send']).toBeUndefined();
  });

  it('room.leave is 1/s with no stated burst, treated as burst 1', () => {
    expect(PER_TYPE_LIMITS['room.leave']).toEqual({ ratePerSec: 1, burst: 1 });
  });
});

describe('reactSendLimit', () => {
  it('differs by sender kind', () => {
    expect(reactSendLimit('PLAYER')).toEqual({ ratePerSec: 2, burst: 4 });
    expect(reactSendLimit('SPECTATOR')).toEqual({ ratePerSec: 1, burst: 2 });
    expect(reactSendLimit('PLAYER')).not.toEqual(reactSendLimit('SPECTATOR'));
  });
});

describe('frame size constants', () => {
  it('match messages.md §11', () => {
    expect(FRAME_SIZE_LIMIT_PHONE).toBe(2048);
    expect(FRAME_SIZE_LIMIT_HOST).toBe(65536);
    expect(FRAME_SIZE_LIMIT_BEFORE_HELLO).toBe(1024);
  });
});

describe('a per-type bucket wired through tokenBucket.ts end to end', () => {
  it('vote.cast allows a burst of 8 then rejects the 9th', () => {
    const clock = fakeClock(0);
    const config = PER_TYPE_LIMITS['vote.cast']!;
    let state = newBucket(config, clock);
    for (let i = 0; i < 8; i++) {
      const result = tryConsume(state, config, clock);
      expect(result.allowed).toBe(true);
      state = result.state;
    }
    expect(tryConsume(state, config, clock).allowed).toBe(false);
  });
});

describe('overall budget tracker — normal traffic', () => {
  it('allows traffic under budget with no flood', () => {
    const clock = fakeClock(0);
    let state = newOverallBudgetState(clock);
    for (let i = 0; i < 10; i++) {
      const result = recordMessage(state, PHONE_OVERALL_BUDGET, clock, 100);
      expect(result.flood).toBe(false);
      state = result.state;
    }
  });

  it('flags overSustained once the plain (1x) budget is exceeded, without flooding', () => {
    const clock = fakeClock(0);
    let state = newOverallBudgetState(clock);
    let lastOverSustained = false;
    // PHONE budget: 60 msgs/sec. Send 61 messages of 1 byte within the same second.
    for (let i = 0; i < 61; i++) {
      const result = recordMessage(state, PHONE_OVERALL_BUDGET, clock, 1);
      state = result.state;
      lastOverSustained = result.overSustained;
      expect(result.flood).toBe(false); // 61 is nowhere near 3x60=180
    }
    expect(lastOverSustained).toBe(true);
  });
});

describe('overall budget tracker — FLOOD requires two consecutive over-3x seconds', () => {
  it('does not flood after just one over-3x second', () => {
    const clock = fakeClock(0);
    let state = newOverallBudgetState(clock);
    // PHONE: 3x of 60 msgs/s = 180. Send 200 messages within second 0.
    let anyFlood = false;
    for (let i = 0; i < 200; i++) {
      const result = recordMessage(state, PHONE_OVERALL_BUDGET, clock, 1);
      state = result.state;
      anyFlood = anyFlood || result.flood;
    }
    expect(anyFlood).toBe(false);
  });

  it('floods on the message that confirms the second consecutive over-3x second', () => {
    const clock = fakeClock(0);
    let state = newOverallBudgetState(clock);
    // Second 0: blow past 3x (180) msgs/s.
    for (let i = 0; i < 200; i++) {
      state = recordMessage(state, PHONE_OVERALL_BUDGET, clock, 1).state;
    }
    // Move into second 1, and again blow past 3x.
    clock.advance(1000);
    let floodedAt = -1;
    for (let i = 0; i < 200; i++) {
      const result = recordMessage(state, PHONE_OVERALL_BUDGET, clock, 1);
      state = result.state;
      if (result.flood) {
        floodedAt = i;
        break;
      }
    }
    // The 181st message (index 180) in second 1 is the one that pushes this second over 3x too,
    // confirming two consecutive over-3x seconds.
    expect(floodedAt).toBe(180);
  });

  it('bytes-based flood is detected independently of message count', () => {
    const clock = fakeClock(0);
    let state = newOverallBudgetState(clock);
    const overByteBudget = 3 * PHONE_OVERALL_BUDGET.maxBytesPerSec + 1; // one big message, over 3x bytes
    // Second 0: one oversized message.
    state = recordMessage(state, PHONE_OVERALL_BUDGET, clock, overByteBudget).state;
    // Second 1: another oversized message confirms the flood.
    clock.advance(1000);
    const result = recordMessage(state, PHONE_OVERALL_BUDGET, clock, overByteBudget);
    expect(result.flood).toBe(true);
  });

  it('resets (clears the flood flag) immediately once a single good second occurs', () => {
    const clock = fakeClock(0);
    let state = newOverallBudgetState(clock);
    // Second 0: over 3x.
    for (let i = 0; i < 200; i++) {
      state = recordMessage(state, PHONE_OVERALL_BUDGET, clock, 1).state;
    }
    // Second 1: back under budget (good second).
    clock.advance(1000);
    for (let i = 0; i < 5; i++) {
      const result = recordMessage(state, PHONE_OVERALL_BUDGET, clock, 1);
      expect(result.flood).toBe(false);
      state = result.state;
    }
    // Second 2: over 3x again — should NOT flood, because second 1 (immediately prior) was fine.
    clock.advance(1000);
    let anyFlood = false;
    for (let i = 0; i < 200; i++) {
      const result = recordMessage(state, PHONE_OVERALL_BUDGET, clock, 1);
      anyFlood = anyFlood || result.flood;
      state = result.state;
    }
    expect(anyFlood).toBe(false);
  });

  it('applies the HOST budget (400 msgs/s, 262144 bytes/s) distinctly from the phone budget', () => {
    const clock = fakeClock(0);
    let state = newOverallBudgetState(clock);
    // 200 messages/sec is well under 3x host budget (1200), so no flood even though it would have
    // flooded under the phone budget.
    let anyFlood = false;
    for (let i = 0; i < 200; i++) {
      const result = recordMessage(state, HOST_OVERALL_BUDGET, clock, 1);
      anyFlood = anyFlood || result.flood;
      state = result.state;
    }
    expect(anyFlood).toBe(false);
  });

  it('a gap of more than one second does not carry forward a stale over-flood second', () => {
    const clock = fakeClock(0);
    let state = newOverallBudgetState(clock);
    // Second 0: over 3x.
    for (let i = 0; i < 200; i++) {
      state = recordMessage(state, PHONE_OVERALL_BUDGET, clock, 1).state;
    }
    // Jump ahead by 5 seconds (skipping seconds 1-4 entirely) — second 0 is no longer "immediately
    // preceding", so this should not be treated as a consecutive over-3x second.
    clock.advance(5000);
    let anyFlood = false;
    for (let i = 0; i < 200; i++) {
      const result = recordMessage(state, PHONE_OVERALL_BUDGET, clock, 1);
      anyFlood = anyFlood || result.flood;
      state = result.state;
    }
    expect(anyFlood).toBe(false);
  });
});
