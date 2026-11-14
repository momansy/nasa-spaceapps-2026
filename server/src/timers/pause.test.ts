import { describe, expect, it } from 'vitest';
import { fixedClock } from './clock.js';
import { isRoomExpired, notPaused, pause, ROOM_HOLD_MS, resume, shiftDeadline } from './pause.js';

describe('ROOM_HOLD_MS', () => {
  it('is 600000 (10 minutes), protocol/messages.md §4.4', () => {
    expect(ROOM_HOLD_MS).toBe(600_000);
  });
});

describe('notPaused', () => {
  it('returns a not-paused state with no deadlines', () => {
    expect(notPaused()).toEqual({ paused: false, reason: null, pausedAtMs: null, roomExpiresAtMs: null });
  });
});

describe('pause', () => {
  it('HOST_REQUEST does not set a room-expiry deadline', () => {
    const clock = fixedClock(1_000);
    const state = pause(clock, 'HOST_REQUEST');
    expect(state).toEqual({ paused: true, reason: 'HOST_REQUEST', pausedAtMs: 1_000, roomExpiresAtMs: null });
  });

  it('HOST_DISCONNECTED sets roomExpiresAtMs to exactly now + ROOM_HOLD_MS', () => {
    const clock = fixedClock(1_000);
    const state = pause(clock, 'HOST_DISCONNECTED');
    expect(state).toEqual({
      paused: true,
      reason: 'HOST_DISCONNECTED',
      pausedAtMs: 1_000,
      roomExpiresAtMs: 1_000 + ROOM_HOLD_MS,
    });
  });
});

describe('resume', () => {
  it('returns the correct pausedForMs for a pause that lasted 42000ms', () => {
    const clock = fixedClock(0);
    const paused = pause(clock, 'HOST_REQUEST');
    clock.advance(42_000);
    const { state, pausedForMs } = resume(paused, clock);
    expect(pausedForMs).toBe(42_000);
    expect(state).toEqual(notPaused());
  });

  it('works for a HOST_DISCONNECTED pause too, and clears the room-expiry deadline', () => {
    const clock = fixedClock(0);
    const paused = pause(clock, 'HOST_DISCONNECTED');
    clock.advance(5 * 60_000);
    const { state, pausedForMs } = resume(paused, clock);
    expect(pausedForMs).toBe(5 * 60_000);
    expect(state).toEqual(notPaused());
  });

  it('decision: resuming a never-paused state is a no-op — pausedForMs 0, state unchanged', () => {
    const clock = fixedClock(0);
    const initial = notPaused();
    clock.advance(10_000);
    const { state, pausedForMs } = resume(initial, clock);
    expect(pausedForMs).toBe(0);
    expect(state).toEqual(initial);
  });

  it('decision: resuming a state with paused=true but no pausedAtMs (malformed) is also a safe no-op', () => {
    const clock = fixedClock(0);
    const malformed = { paused: true, reason: null, pausedAtMs: null, roomExpiresAtMs: null } as const;
    const { state, pausedForMs } = resume(malformed, clock);
    expect(pausedForMs).toBe(0);
    expect(state).toBe(malformed);
  });
});

describe('isRoomExpired', () => {
  it('is false for a HOST_REQUEST pause regardless of elapsed time (no room-expiry deadline)', () => {
    const clock = fixedClock(0);
    const state = pause(clock, 'HOST_REQUEST');
    clock.advance(ROOM_HOLD_MS + 60_000);
    expect(isRoomExpired(state, clock)).toBe(false);
  });

  it('is false when not paused at all', () => {
    const clock = fixedClock(0);
    expect(isRoomExpired(notPaused(), clock)).toBe(false);
  });

  it('is false right up to the deadline and true at/after it, for HOST_DISCONNECTED', () => {
    const clock = fixedClock(0);
    const state = pause(clock, 'HOST_DISCONNECTED');

    clock.advance(ROOM_HOLD_MS - 1);
    expect(isRoomExpired(state, clock)).toBe(false);

    clock.advance(1);
    expect(isRoomExpired(state, clock)).toBe(true);

    clock.advance(1);
    expect(isRoomExpired(state, clock)).toBe(true);
  });
});

describe('shiftDeadline', () => {
  it('adds pausedForMs to the given deadline', () => {
    expect(shiftDeadline(10_000, 5_000)).toBe(15_000);
    expect(shiftDeadline(0, 0)).toBe(0);
  });

  it('can be used to shift a roomExpiresAtMs-style field forward after a resume', () => {
    const clock = fixedClock(0);
    const paused = pause(clock, 'HOST_DISCONNECTED');
    const originalVoteDeadline = 50_000; // some other subsystem's outstanding …AtMs deadline
    clock.advance(42_000);
    const { pausedForMs } = resume(paused, clock);
    expect(shiftDeadline(originalVoteDeadline, pausedForMs)).toBe(92_000);
  });
});
