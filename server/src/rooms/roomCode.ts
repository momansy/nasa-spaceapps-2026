// Room code generation and join/spectate URL helpers.
// Rules: protocol/messages.md §4.1 "Room code and URLs" and §14 `RoomCode`.

import type { RoomCode } from '../../../protocol/ts/messages.js';

/**
 * 24-letter alphabet used for room codes: A–Z without I and O, to avoid
 * confusion with 1 and 0 when players read codes off a screen or QR fallback.
 */
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ' as const;

/** Exact shape of a valid `RoomCode`: 4 letters from `ROOM_CODE_ALPHABET`. */
const ROOM_CODE_PATTERN = /^[A-HJ-NP-Z]{4}$/;

/** Maximum number of draws before `generateRoomCode` gives up and throws. */
const MAX_GENERATE_ATTEMPTS = 10000;

/** True if `code` matches the `RoomCode` pattern (4 letters, no I or O). */
export function isValidRoomCode(code: string): boolean {
  return ROOM_CODE_PATTERN.test(code);
}

/**
 * Draws a 4-letter room code from `ROOM_CODE_ALPHABET`, retrying until
 * `isLive` reports the code is not already in use by a live room.
 *
 * @param isLive Returns true if a room with the given code is currently live.
 * @param rng Injectable source of randomness in [0, 1); defaults to `Math.random`.
 * @throws If no unique code is found within `MAX_GENERATE_ATTEMPTS` attempts
 *   (guards against a caller whose `isLive` never returns false).
 */
export function generateRoomCode(isLive: (code: string) => boolean, rng: () => number = Math.random): RoomCode {
  for (let attempt = 0; attempt < MAX_GENERATE_ATTEMPTS; attempt++) {
    let code = '';
    for (let i = 0; i < 4; i++) {
      const index = Math.floor(rng() * ROOM_CODE_ALPHABET.length);
      code += ROOM_CODE_ALPHABET[index];
    }
    if (!isLive(code)) {
      return code;
    }
  }
  throw new Error(`generateRoomCode: no unique room code found after ${MAX_GENERATE_ATTEMPTS} attempts`);
}

/** Player join URL / QR content: `<clientBaseUrl>?room=<CODE>` (protocol §4.1). */
export function buildJoinUrl(clientBaseUrl: string, room: RoomCode): string {
  return `${clientBaseUrl}?room=${room}`;
}

/** Audience (spectator) URL / QR content: `<clientBaseUrl>?room=<CODE>&watch=1` (protocol §4.1). */
export function buildSpectateUrl(clientBaseUrl: string, room: RoomCode): string {
  return `${clientBaseUrl}?room=${room}&watch=1`;
}
