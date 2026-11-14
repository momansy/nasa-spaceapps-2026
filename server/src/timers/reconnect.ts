// Per-player/spectator slot-hold tracking — protocol/messages.md §4.3 "Disconnects and slot hold"
// and §16 Decision 16: a disconnected player's slot, roles, veto token and nickname are held for
// 3 minutes (`slotHoldMs` = 180000); the hold countdown runs only while the game is not paused (a
// phone that sleeps during a pause keeps its seat), freezing and resuming exactly where it left off
// across any number of pause/resume cycles. §4.3 also covers spectator connections, which are
// forgotten after the same 3 minutes — same tracker, caller just skips redistribution on expiry.
// Deciding *when* the hold has expired is this module's job; revoking the token, freeing the seat
// and redistributing roles (server/src/roles/roles.ts `onLeave`) is the caller's job, not ours.
//
// Pure, clock-driven state + transition functions, mirroring the house style of
// server/src/roles/roles.ts (no classes, typed state plus free functions).

import type { Clock } from './clock.js';

/** §4.3: slot/roles/veto/nickname hold duration after a disconnect. */
export const SLOT_HOLD_MS = 180_000;

/**
 * Tracks one player's (or spectator's) slot hold since disconnect.
 * - `startedAtMs`: clock time the disconnect (hold) started.
 * - `pausedAccumMs`: total milliseconds already folded in from *closed* pause intervals.
 * - `pausedSinceMs`: clock time the current pause interval started, or `null` if not currently
 *   frozen by a pause.
 */
export interface SlotHold {
  startedAtMs: number;
  pausedAccumMs: number;
  pausedSinceMs: number | null;
}

/** Starts a fresh hold at the current clock time (player/spectator just disconnected). */
export function startHold(clock: Clock): SlotHold {
  return { startedAtMs: clock.nowMs(), pausedAccumMs: 0, pausedSinceMs: null };
}

/**
 * The game just paused: freeze the countdown. Idempotent — pausing an already-frozen hold is a
 * no-op (it keeps the original `pausedSinceMs`), since nested/duplicate pause notifications must
 * not restart the frozen interval's clock.
 */
export function freezeHold(hold: SlotHold, clock: Clock): SlotHold {
  if (hold.pausedSinceMs !== null) return hold;
  return { ...hold, pausedSinceMs: clock.nowMs() };
}

/**
 * The game just resumed: fold the just-closed pause interval into `pausedAccumMs` so the
 * countdown picks back up exactly where it left off. A no-op if the hold was not currently
 * frozen (resume without a matching freeze).
 */
export function unfreezeHold(hold: SlotHold, clock: Clock): SlotHold {
  if (hold.pausedSinceMs === null) return hold;
  const frozenFor = clock.nowMs() - hold.pausedSinceMs;
  return {
    ...hold,
    pausedAccumMs: hold.pausedAccumMs + frozenFor,
    pausedSinceMs: null,
  };
}

/**
 * Absolute clock time at which the hold expires, *as of right now* (`clock`): the 3-minute budget
 * is only consumed by unpaused wall-clock time, so every closed pause interval (`pausedAccumMs`)
 * and, if the hold is currently frozen, the still-open interval (computed against `clock.nowMs()`)
 * push the deadline later by the same amount.
 */
export function holdExpiresAtMs(hold: SlotHold, clock: Clock): number {
  const openPauseMs = hold.pausedSinceMs === null ? 0 : clock.nowMs() - hold.pausedSinceMs;
  return hold.startedAtMs + SLOT_HOLD_MS + hold.pausedAccumMs + openPauseMs;
}

/** True once the hold's unpaused elapsed time has reached `SLOT_HOLD_MS`. */
export function isHoldExpired(hold: SlotHold, clock: Clock): boolean {
  return clock.nowMs() >= holdExpiresAtMs(hold, clock);
}
