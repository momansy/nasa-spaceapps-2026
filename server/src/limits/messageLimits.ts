// Per-type rate-limit table, frame-size limits, and the overall inbound-budget tracker —
// protocol/messages.md §11 "Limits".
import type { Clock, TokenBucketConfig } from './tokenBucket.js';

/**
 * Per-type token-bucket configs, messages.md §11 table (lines ~510-541). Keyed by the exact
 * message-type strings from the table. A plain `Record<string, TokenBucketConfig>` is used rather
 * than importing `MessageType` from `protocol/ts/messages.ts`, so this table can be exercised in
 * isolation and against any string a caller looks up (unknown types simply find nothing here —
 * the caller/wire layer decides what "no entry" means, e.g. host-sent types, which messages.md §11
 * says have "no per-type limit other than the telemetry rates" and so are intentionally absent).
 *
 * `hello` uses `{ ratePerSec: 0, burst: 1 }` to signal the "once ever, no refill" special case
 * documented in `tokenBucket.ts` (`hello`'s table row is literally "once", not a rate+burst pair).
 *
 * `react.send` is deliberately NOT in this table: its limit depends on sender kind (players vs.
 * spectators get different buckets for the same message type) — see `reactSendLimit` below.
 */
export const PER_TYPE_LIMITS: Record<string, TokenBucketConfig> = {
  hello: { ratePerSec: 0, burst: 1 },
  'clock.ping': { ratePerSec: 2, burst: 4 },
  'room.create': { ratePerSec: 1, burst: 2 },
  'room.join': { ratePerSec: 1, burst: 3 },
  'room.resume': { ratePerSec: 1, burst: 3 },
  // `room.leave`'s table row states only "1/s" with no burst figure. Documented assumption: burst
  // defaults to the sustained rate (1) when the table omits a burst — i.e. no extra slack beyond
  // the steady 1/s, which is reasonable for a one-shot "I'm leaving" message.
  'room.leave': { ratePerSec: 1, burst: 1 },
  'player.profile': { ratePerSec: 0.5, burst: 2 },
  'player.prefs': { ratePerSec: 1, burst: 2 },
  'roles.pick': { ratePerSec: 2, burst: 4 },
  'roles.vote': { ratePerSec: 2, burst: 4 },
  'ability.use': { ratePerSec: 1, burst: 2 },
  'vote.predict': { ratePerSec: 2, burst: 4 },
  'vote.tag': { ratePerSec: 2, burst: 4 },
  'vote.cast': { ratePerSec: 4, burst: 8 },
  'vote.veto': { ratePerSec: 1, burst: 2 },
  'vote.trivia.answer': { ratePerSec: 2, burst: 4 },
  'vote.trivia.pick': { ratePerSec: 2, burst: 4 },
  'ping.send': { ratePerSec: 0.5, burst: 3 },
  'poll.answer': { ratePerSec: 2, burst: 4 },
  'pilot.input': { ratePerSec: 30, burst: 40 },
  'pilot.action': { ratePerSec: 10, burst: 10 },
  'copilot.action': { ratePerSec: 10, burst: 10 },
  'console.callout': { ratePerSec: 2, burst: 4 },
  'console.request': { ratePerSec: 1, burst: 2 },
  'mg.ready': { ratePerSec: 1, burst: 2 },
  'mg.progress': { ratePerSec: 2, burst: 4 },
  'mg.action': { ratePerSec: 10, burst: 20 },
  'mg.result': { ratePerSec: 1, burst: 2 },
};

/**
 * `react.send` limit by sender kind (messages.md §11: "players 2/s, burst 4; spectators 1/s,
 * burst 2") — same message type, two different buckets depending on sender kind, so it is kept out
 * of `PER_TYPE_LIMITS` and resolved per-connection by the caller instead.
 */
export function reactSendLimit(senderKind: 'PLAYER' | 'SPECTATOR'): TokenBucketConfig {
  return senderKind === 'PLAYER' ? { ratePerSec: 2, burst: 4 } : { ratePerSec: 1, burst: 2 };
}

/** Frame size limits, messages.md §11: "phone → server 2,048 bytes; host → server 65,536 bytes;
 *  before `hello.ok` 1,024 bytes." Not rate limiters — a one-line size check the wire layer does
 *  itself; exported here only as named constants per the task brief. */
export const FRAME_SIZE_LIMIT_PHONE = 2048;
export const FRAME_SIZE_LIMIT_HOST = 65536;
export const FRAME_SIZE_LIMIT_BEFORE_HELLO = 1024;

/** Overall inbound budget for one connection kind, messages.md §11: "phone 60 messages/s and
 *  8,192 bytes/s; host 400 messages/s and 262,144 bytes/s." */
export interface OverallBudgetConfig {
  maxMsgsPerSec: number;
  maxBytesPerSec: number;
}

export const PHONE_OVERALL_BUDGET: OverallBudgetConfig = { maxMsgsPerSec: 60, maxBytesPerSec: 8192 };
export const HOST_OVERALL_BUDGET: OverallBudgetConfig = { maxMsgsPerSec: 400, maxBytesPerSec: 262144 };

/** Multiplier at which a per-second budget is considered "FLOOD-eligible" (messages.md §11:
 *  "More than 3x either for 2 consecutive seconds -> FLOOD (fatal)"). */
const FLOOD_MULTIPLIER = 3;

/**
 * Per-second accounting for the overall inbound budget. Simplification (documented per the task
 * brief): rather than a true sliding window, time is bucketed into fixed 1-second windows keyed off
 * `Math.floor(nowMs / 1000)`. Each call to `recordMessage` either adds to the current window or, if
 * the clock has moved into a new second, rolls over to a fresh window — carrying forward only the
 * boolean "was the just-completed window over 3x either budget", not its counts. This matches the
 * spec's "2 consecutive seconds" wording (calendar-second granularity) at the cost of not catching
 * a flood that straddles a second boundary (e.g. half of second N and half of second N+1) as
 * precisely as a sliding window would; given the fatal FLOOD outcome is meant as a coarse abuse
 * guard rather than a precise rate limit, this is an acceptable trade-off.
 */
export interface OverallBudgetState {
  /** `Math.floor(nowMs / 1000)` for the window currently being accumulated. */
  currentSecond: number;
  /** Message count accumulated so far in `currentSecond`. */
  msgCount: number;
  /** Byte count accumulated so far in `currentSecond`. */
  byteCount: number;
  /** Whether the *previous* fully-completed second was over 3x either budget. */
  previousSecondOverFlood: boolean;
}

export function newOverallBudgetState(clock: Clock): OverallBudgetState {
  return {
    currentSecond: Math.floor(clock.nowMs() / 1000),
    msgCount: 0,
    byteCount: 0,
    previousSecondOverFlood: false,
  };
}

function isOverFlood(config: OverallBudgetConfig, msgCount: number, byteCount: number): boolean {
  return msgCount > FLOOD_MULTIPLIER * config.maxMsgsPerSec || byteCount > FLOOD_MULTIPLIER * config.maxBytesPerSec;
}

export interface RecordMessageResult {
  state: OverallBudgetState;
  /** `true` when this message confirms two consecutive over-3x seconds (fatal FLOOD). */
  flood: boolean;
  /** Nice-to-have: current second's count/bytes already past the plain (1x) sustained budget,
   *  before the 3x FLOOD threshold — not fatal on its own, just informational. */
  overSustained: boolean;
}

/**
 * Records one inbound message of `bytes` length against the per-second budget. Rolls over to a new
 * 1-second bucket when `clock` has moved into a new second since the bucket started, carrying
 * forward whether the just-completed bucket exceeded 3x either budget. Returns `flood: true` when
 * the previous completed second was already over 3x AND the current second (as of and including
 * this message) has also gone over 3x either budget — i.e. two consecutive over-3x seconds, per
 * messages.md §11.
 */
export function recordMessage(state: OverallBudgetState, config: OverallBudgetConfig, clock: Clock, bytes: number): RecordMessageResult {
  const nowSecond = Math.floor(clock.nowMs() / 1000);

  let working = state;
  if (nowSecond !== state.currentSecond) {
    // Roll over. Carry forward whether the second we just finished (`state.currentSecond`) was
    // itself over the 3x threshold; everything in between (if the clock skipped seconds) is treated
    // as empty/under-budget time, so only an immediately-preceding over-3x second counts.
    const justCompletedOverFlood = nowSecond === state.currentSecond + 1 && isOverFlood(config, state.msgCount, state.byteCount);
    working = {
      currentSecond: nowSecond,
      msgCount: 0,
      byteCount: 0,
      previousSecondOverFlood: justCompletedOverFlood,
    };
  }

  const msgCount = working.msgCount + 1;
  const byteCount = working.byteCount + bytes;
  const nextState: OverallBudgetState = { ...working, msgCount, byteCount };

  const overSustained = msgCount > config.maxMsgsPerSec || byteCount > config.maxBytesPerSec;
  const currentOverFlood = isOverFlood(config, msgCount, byteCount);
  const flood = working.previousSecondOverFlood && currentOverFlood;

  return { state: nextState, flood, overSustained };
}
