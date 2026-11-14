// Generic token-bucket primitive backing the per-type rate limits — protocol/messages.md §11
// "Limits", "Per-type limits are token buckets (sustained rate, burst)."
//
// Clock-injectable and pure: no `setTimeout`/`setInterval`, no bare `Date.now()`. `Clock` is the
// same tiny shape used by the sibling `timers/clock.ts` module, redefined locally here on purpose
// (see task brief: this module must not import from `timers/clock.ts`, to avoid coupling two
// otherwise-independent modules to one shared type).

/** Anything that can report the current server-clock time, in milliseconds since the Unix epoch. */
export interface Clock {
  nowMs(): number;
}

/** Sustained refill rate and maximum bucket size for one message type (messages.md §11 table). */
export interface TokenBucketConfig {
  /** Tokens added per second of elapsed time. `0` is the special "once ever" case — see `newBucket`. */
  ratePerSec: number;
  /** Maximum tokens the bucket can hold; also the initial fill and the max burst size. */
  burst: number;
}

/** Current fill level of a bucket, plus the clock time it was last refilled at. */
export interface TokenBucketState {
  tokens: number;
  lastRefillMs: number;
}

/**
 * A fresh bucket, starting full (`tokens = burst`), stamped at the current clock time.
 *
 * Special case — `ratePerSec === 0` ("once", e.g. `hello`, messages.md §11 row `hello` = "once"):
 * there is no refill ever; the bucket starts with exactly `burst` tokens (the brief says `hello`
 * uses `{ ratePerSec: 0, burst: 1 }`, i.e. one token, one lifetime allowance) and `tryConsume` below
 * skips the refill step entirely for this case, so once drained it never refills.
 */
export function newBucket(config: TokenBucketConfig, clock: Clock): TokenBucketState {
  return { tokens: config.burst, lastRefillMs: clock.nowMs() };
}

export type ConsumeResult =
  | { allowed: true; state: TokenBucketState }
  | { allowed: false; state: TokenBucketState; retryAfterMs: number };

/**
 * Refills `state` based on elapsed time since `lastRefillMs` (capped at `burst`), then attempts to
 * consume `cost` tokens (default 1). Returns the new state either way — callers should store it
 * back (this function does not mutate its input).
 *
 * `ratePerSec === 0` special case: no refill is applied at all, regardless of elapsed time — the
 * bucket only ever has the tokens it started with (see `newBucket`). This is what makes `hello`
 * "once ever" rather than "once per (1/0) seconds".
 *
 * On rejection, `retryAfterMs` is the time until enough tokens accumulate for one more message,
 * rounded up to a whole millisecond (`Math.ceil`). For the `ratePerSec === 0` case, once the single
 * token is spent there is no future time at which it becomes available again; `retryAfterMs` is
 * reported as `Number.POSITIVE_INFINITY` to signal "never" rather than a misleading finite number.
 */
export function tryConsume(state: TokenBucketState, config: TokenBucketConfig, clock: Clock, cost = 1): ConsumeResult {
  const now = clock.nowMs();
  const isOnceEver = config.ratePerSec === 0;

  let tokens = state.tokens;
  if (!isOnceEver) {
    const elapsedMs = Math.max(0, now - state.lastRefillMs);
    const refill = (elapsedMs / 1000) * config.ratePerSec;
    tokens = Math.min(config.burst, state.tokens + refill);
  }
  const refilledState: TokenBucketState = { tokens, lastRefillMs: now };

  if (tokens >= cost) {
    return { allowed: true, state: { tokens: tokens - cost, lastRefillMs: now } };
  }

  if (isOnceEver) {
    return { allowed: false, state: refilledState, retryAfterMs: Number.POSITIVE_INFINITY };
  }
  const missing = cost - tokens;
  const retryAfterMs = Math.ceil((missing / config.ratePerSec) * 1000);
  return { allowed: false, state: refilledState, retryAfterMs };
}
