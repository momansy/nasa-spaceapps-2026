// Shared clock abstraction — protocol/messages.md §2 "Transport and conventions", Clock bullet
// (every absolute time uses the server clock; fields are `…AtMs` milliseconds since the Unix
// epoch). All timer logic in this module (`reconnect.ts`, `pause.ts`) takes a `Clock` instead of
// calling `Date.now()` directly, so it stays pure and testable: production code passes
// `systemClock`, tests pass `fixedClock(...)` and advance it by hand — no `setTimeout`, no
// `vi.useFakeTimers`.

/** Anything that can report the current server-clock time, in milliseconds since the Unix epoch. */
export interface Clock {
  nowMs(): number;
}

/** Production clock: thin wrapper over `Date.now()`. */
export const systemClock: Clock = {
  nowMs(): number {
    return Date.now();
  },
};

/** A test double with a manually-advanced clock: starts at `startMs` (default 0). */
export interface FixedClock extends Clock {
  /** Moves the clock forward by `ms` (must be >= 0). */
  advance(ms: number): void;
  /** Jumps the clock to an absolute time. */
  set(ms: number): void;
}

export function fixedClock(startMs = 0): FixedClock {
  let current = startMs;
  return {
    nowMs(): number {
      return current;
    },
    advance(ms: number): void {
      if (ms < 0) throw new Error(`fixedClock.advance: negative duration ${ms}`);
      current += ms;
    },
    set(ms: number): void {
      current = ms;
    },
  };
}
