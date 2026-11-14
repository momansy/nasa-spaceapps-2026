import { describe, expect, it } from 'vitest';
import { fixedClock } from './clock.js';
import {
  freezeHold,
  holdExpiresAtMs,
  isHoldExpired,
  SLOT_HOLD_MS,
  startHold,
  unfreezeHold,
} from './reconnect.js';

describe('SLOT_HOLD_MS', () => {
  it('is 180000 (3 minutes), protocol/messages.md §4.3', () => {
    expect(SLOT_HOLD_MS).toBe(180_000);
  });
});

describe('startHold', () => {
  it('records the current clock time as startedAtMs with no pause accumulated', () => {
    const clock = fixedClock(1_000);
    const hold = startHold(clock);
    expect(hold).toEqual({ startedAtMs: 1_000, pausedAccumMs: 0, pausedSinceMs: null });
  });
});

describe('holdExpiresAtMs / isHoldExpired — never paused', () => {
  it('expires at exactly 180000ms of unpaused elapsed time', () => {
    const clock = fixedClock(0);
    const hold = startHold(clock);
    expect(holdExpiresAtMs(hold, clock)).toBe(SLOT_HOLD_MS);

    clock.advance(SLOT_HOLD_MS - 1);
    expect(isHoldExpired(hold, clock)).toBe(false);

    clock.advance(1);
    expect(isHoldExpired(hold, clock)).toBe(true);
  });

  it('stays expired well past the deadline', () => {
    const clock = fixedClock(0);
    const hold = startHold(clock);
    clock.advance(SLOT_HOLD_MS + 10_000);
    expect(isHoldExpired(hold, clock)).toBe(true);
  });
});

describe('freezeHold / unfreezeHold — single pause cycle', () => {
  it('does not expire while currently frozen even if huge wall-clock time passes', () => {
    const clock = fixedClock(0);
    let hold = startHold(clock);
    clock.advance(10_000); // 10s of real play before the pause
    hold = freezeHold(hold, clock);

    // Host vanishes for a very long time (bigger than the 3-minute hold itself).
    clock.advance(20 * 60_000); // 20 minutes
    expect(isHoldExpired(hold, clock)).toBe(false);
    // The expiry deadline keeps receding with "now" while frozen.
    expect(holdExpiresAtMs(hold, clock)).toBe(clock.nowMs() + (SLOT_HOLD_MS - 10_000));
  });

  it('preserves the remaining hold time exactly across a freeze/unfreeze boundary', () => {
    // Player disconnects; 20s of unpaused time passes (160s of the 180s budget remain); then the
    // host drops for 20 minutes (room-level pause); on resume the player must still have ~160s left.
    const clock = fixedClock(0);
    let hold = startHold(clock);
    clock.advance(20_000);
    hold = freezeHold(hold, clock);

    clock.advance(20 * 60_000); // 20-minute outage, frozen the whole time
    hold = unfreezeHold(hold, clock);

    // Remaining budget at the moment of resume: 180000 - 20000 = 160000ms.
    expect(holdExpiresAtMs(hold, clock) - clock.nowMs()).toBe(SLOT_HOLD_MS - 20_000);
    expect(isHoldExpired(hold, clock)).toBe(false);

    // Consuming exactly the remaining budget (post-resume, unpaused) now expires the hold.
    clock.advance(SLOT_HOLD_MS - 20_000 - 1);
    expect(isHoldExpired(hold, clock)).toBe(false);
    clock.advance(1);
    expect(isHoldExpired(hold, clock)).toBe(true);
  });

  it('freezeHold is idempotent: a repeated freeze call does not reset the frozen interval', () => {
    const clock = fixedClock(0);
    let hold = startHold(clock);
    hold = freezeHold(hold, clock);
    clock.advance(5_000);
    const refrozen = freezeHold(hold, clock); // should be a no-op, keep original pausedSinceMs
    expect(refrozen).toEqual(hold);
  });

  it('unfreezeHold is a no-op when the hold was not currently frozen', () => {
    const clock = fixedClock(0);
    const hold = startHold(clock);
    const unfrozen = unfreezeHold(hold, clock);
    expect(unfrozen).toEqual(hold);
  });
});

describe('freezeHold / unfreezeHold — multiple cycles', () => {
  it('accumulates paused time correctly across several freeze/unfreeze cycles', () => {
    const clock = fixedClock(0);
    let hold = startHold(clock);

    // 30s unpaused, then a 5-minute pause.
    clock.advance(30_000);
    hold = freezeHold(hold, clock);
    clock.advance(5 * 60_000);
    hold = unfreezeHold(hold, clock);
    expect(hold.pausedAccumMs).toBe(5 * 60_000);

    // Another 40s unpaused, then a 2-minute pause.
    clock.advance(40_000);
    hold = freezeHold(hold, clock);
    clock.advance(2 * 60_000);
    hold = unfreezeHold(hold, clock);
    expect(hold.pausedAccumMs).toBe(5 * 60_000 + 2 * 60_000);

    // Total unpaused elapsed so far: 30s + 40s = 70s. Remaining budget: 180s - 70s = 110s.
    expect(holdExpiresAtMs(hold, clock) - clock.nowMs()).toBe(SLOT_HOLD_MS - 70_000);
    expect(isHoldExpired(hold, clock)).toBe(false);

    clock.advance(SLOT_HOLD_MS - 70_000 - 1);
    expect(isHoldExpired(hold, clock)).toBe(false);
    clock.advance(1);
    expect(isHoldExpired(hold, clock)).toBe(true);
  });

  it('a third freeze after expiry-eligible unpaused time still blocks expiry while frozen', () => {
    const clock = fixedClock(0);
    let hold = startHold(clock);
    clock.advance(179_000); // 1s short of expiring, all unpaused
    hold = freezeHold(hold, clock);
    clock.advance(10 * 60_000); // long pause — would have expired long ago if not frozen
    expect(isHoldExpired(hold, clock)).toBe(false);

    hold = unfreezeHold(hold, clock);
    // Exactly 1s of unpaused budget remains.
    expect(holdExpiresAtMs(hold, clock) - clock.nowMs()).toBe(1_000);
    clock.advance(999);
    expect(isHoldExpired(hold, clock)).toBe(false);
    clock.advance(1);
    expect(isHoldExpired(hold, clock)).toBe(true);
  });
});
