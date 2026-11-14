// Room-level pause state — protocol/messages.md §4.4 "Host disconnect and pause" and §16
// Decision 17: a host disconnect pauses the game at once with reason HOST_DISCONNECTED and a
// 10-minute room-hold deadline (`roomHoldMs` = 600000); a host-requested pause (e.g. a classroom
// teacher pause, §13.3) carries no such deadline — only *losing the host connection* starts the
// room-expiry clock. Either way the room stays paused until the host explicitly sends
// `game.resume`, even after the host reconnects (room resume alone does not resume the game).
// While paused, every server timer and slot-hold countdown (reconnect.ts) is frozen; on
// `game.resumed` every outstanding `…AtMs` deadline moves later by `pausedForMs`, the wall-clock
// duration of the pause — `shiftDeadline` is the one obvious place callers do that.
//
// Pure, clock-driven state + transition functions, mirroring the house style of
// server/src/roles/roles.ts (no classes, typed state plus free functions).

import type { PauseReason } from '../../../protocol/ts/messages.js';
import type { Clock } from './clock.js';

/** §4.4: room-hold duration after a host disconnect, before the room is destroyed. */
export const ROOM_HOLD_MS = 600_000;

export interface PauseState {
  paused: boolean;
  reason: PauseReason | null;
  pausedAtMs: number | null;
  roomExpiresAtMs: number | null;
}

/** The room's initial, never-paused state. */
export function notPaused(): PauseState {
  return { paused: false, reason: null, pausedAtMs: null, roomExpiresAtMs: null };
}

/**
 * Pauses the room now. Only HOST_DISCONNECTED carries the 10-minute room-expiry deadline
 * (§4.4: losing the host connection, not a host-requested pause, starts that clock).
 */
export function pause(clock: Clock, reason: PauseReason): PauseState {
  const now = clock.nowMs();
  return {
    paused: true,
    reason,
    pausedAtMs: now,
    roomExpiresAtMs: reason === 'HOST_DISCONNECTED' ? now + ROOM_HOLD_MS : null,
  };
}

/**
 * Resumes the room (`game.resume`). Returns the resumed state plus `pausedForMs`, the wall-clock
 * duration of the pause that just ended, for the caller to shift every other outstanding deadline
 * via `shiftDeadline`.
 *
 * Decision: calling `resume` on a state that was never paused (no matching `pause`) is not an
 * error — it returns `pausedForMs: 0` and the same not-paused state unchanged. A room server
 * driven by well-formed `game.resume` handling should never hit this path, but treating it as a
 * no-op is safer than throwing for a module with no I/O of its own to validate against.
 */
export function resume(state: PauseState, clock: Clock): { state: PauseState; pausedForMs: number } {
  if (!state.paused || state.pausedAtMs === null) {
    return { state, pausedForMs: 0 };
  }
  const pausedForMs = clock.nowMs() - state.pausedAtMs;
  return { state: notPaused(), pausedForMs };
}

/** True once the room-hold deadline has passed (only possible while paused for HOST_DISCONNECTED). */
export function isRoomExpired(state: PauseState, clock: Clock): boolean {
  if (!state.paused || state.reason !== 'HOST_DISCONNECTED' || state.roomExpiresAtMs === null) return false;
  return clock.nowMs() >= state.roomExpiresAtMs;
}

/** Shifts any outstanding `…AtMs` deadline later by the duration of a pause that just ended. */
export function shiftDeadline(deadlineAtMs: number, pausedForMs: number): number {
  return deadlineAtMs + pausedForMs;
}
