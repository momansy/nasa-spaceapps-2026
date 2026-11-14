// Nickname normalization/validation/moderation, id allocation and token
// generation. Rules: protocol/messages.md §14 `Nickname`/`PlayerId`/
// `SpectatorId`/`Token`, §12.2 `NICK_REJECTED`/`NICK_TAKEN`, and
// GAME_DESIGN.md §3.1 "Joining a session" (filtered-list or free-text
// nickname + profanity filter, no personal data).

import { randomBytes } from 'node:crypto';
import type { Nickname, PlayerId, SpectatorId, Token } from '../../../protocol/ts/messages.js';

/**
 * Nickname shape after normalization (protocol §14 `Nickname`): 2-16 chars,
 * Unicode letters/digits/space/underscore/hyphen, first and last char must
 * be a letter or digit.
 */
const NICKNAME_PATTERN = /^[\p{L}\p{N}][\p{L}\p{N} _-]{0,14}[\p{L}\p{N}]$/u;

const NICKNAME_MAX_LENGTH = 16;

/**
 * NFC-normalizes `raw`, trims leading/trailing whitespace and collapses
 * runs of inner whitespace to a single space. Does not enforce length or
 * character-set rules; use `isValidNickname` for that.
 */
export function normalizeNickname(raw: string): string {
  return raw.normalize('NFC').trim().replace(/\s+/g, ' ');
}

/** True if `nick` (already normalized) matches the protocol `Nickname` pattern. */
export function isValidNickname(nick: string): boolean {
  return NICKNAME_PATTERN.test(nick);
}

/**
 * Small built-in blocklist for a hackathon demo, not a production
 * moderation system. Deliberately excludes slurs; covers common English
 * profanity only.
 */
export const PROFANITY_BLOCKLIST: readonly string[] = [
  'fuck',
  'shit',
  'bitch',
  'bastard',
  'asshole',
  'dick',
  'piss',
  'slut',
  'whore',
  'damn',
  'crap',
  'douche',
  'twat',
  'wanker',
  'prick',
  'cunt',
] as const;

/**
 * Checks the normalized, lower-cased nickname against `PROFANITY_BLOCKLIST`
 * as a simple substring match. Limitation: this can false-positive on
 * innocuous words that contain a blocked substring (e.g. "classic" vs
 * "ass"-style matches, the "Scunthorpe problem") — acceptable for a demo.
 */
export function containsProfanity(nick: string): boolean {
  const lower = normalizeNickname(nick).toLowerCase();
  return PROFANITY_BLOCKLIST.some((word) => lower.includes(word));
}

/** Curated space-themed default nicknames offered as a safe filtered list. */
export const SAFE_NICKNAMES: readonly string[] = [
  'Comet Rider',
  'Lunar Fox',
  'Nova Pilot',
  'Star Drifter',
  'Orbit Walker',
  'Solar Scout',
  'Meteor Jay',
  'Nebula Wolf',
  'Cosmic Finch',
  'Gravity Hawk',
  'Rocket Otter',
  'Aurora Lynx',
  'Stellar Pup',
  'Galaxy Wren',
  'Vacuum Panda',
  'Satellite Fox',
  'Asteroid Deer',
  'Zero-G Owl',
  'Launch Sparrow',
  'Capsule Bear',
] as const;

/** Picks a random entry from `SAFE_NICKNAMES` (injectable rng for determinism). */
export function suggestNickname(rng: () => number = Math.random): string {
  const index = Math.floor(rng() * SAFE_NICKNAMES.length);
  return SAFE_NICKNAMES[index] as string;
}

/** Upper bound on numbered-suffix attempts before `suggestVariant` gives up. */
const MAX_VARIANT_ATTEMPTS = 1000;

/**
 * Builds a free variant of `nickname` for the `NICK_TAKEN` case by
 * appending " 2", " 3", … until `taken(candidate)` is false. Truncates the
 * base name when needed so the candidate never exceeds the 16-char
 * `Nickname` limit.
 */
export function suggestVariant(nickname: string, taken: (candidate: string) => boolean): string {
  for (let n = 2; n < 2 + MAX_VARIANT_ATTEMPTS; n++) {
    const suffix = ` ${n}`;
    const maxBaseLength = NICKNAME_MAX_LENGTH - suffix.length;
    const base = nickname.length > maxBaseLength ? nickname.slice(0, maxBaseLength) : nickname;
    const candidate = `${base}${suffix}`;
    if (!taken(candidate)) {
      return candidate;
    }
  }
  throw new Error(`suggestVariant: no free variant of "${nickname}" found after ${MAX_VARIANT_ATTEMPTS} attempts`);
}

/** Result of `checkNickname`: either the normalized, accepted nickname, or a rejection with a suggestion. */
export type NicknameCheckResult =
  | { ok: true; nickname: Nickname }
  | { ok: false; code: 'NICK_REJECTED' | 'NICK_TAKEN'; suggestion: string };

/**
 * Full nickname pipeline run by the room server on `player.profile` /
 * `room.join`: normalize, validate shape, filter profanity, then check for
 * a case-insensitive duplicate against `isTaken`.
 *
 * The protocol error table (§12.2) only defines `NICK_REJECTED` and
 * `NICK_TAKEN` for nicknames, so an invalid shape is reported as
 * `NICK_REJECTED` just like a profanity hit.
 *
 * `isTaken` is caller-supplied and expected to compare case-insensitively
 * (per protocol: "another player has the same nickname (case-insensitive)");
 * this function just forwards the normalized nickname to it.
 */
export function checkNickname(raw: string, isTaken: (nick: string) => boolean): NicknameCheckResult {
  const normalized = normalizeNickname(raw);

  if (!isValidNickname(normalized) || containsProfanity(normalized)) {
    return { ok: false, code: 'NICK_REJECTED', suggestion: suggestNickname() };
  }

  if (isTaken(normalized)) {
    return { ok: false, code: 'NICK_TAKEN', suggestion: suggestVariant(normalized, isTaken) };
  }

  return { ok: true, nickname: normalized };
}

/**
 * Returns a closure allocating monotonically increasing ids of the form
 * "p1", "p2", … or "s1", "s2", … (never reused within the closure's
 * lifetime), matching the `PlayerId`/`SpectatorId` patterns.
 *
 * Mapping these ever-increasing ids to freed/reused seat numbers (1-10) is
 * out of scope here; that belongs to the room's seat-allocation logic.
 */
export function makeIdAllocator(prefix: 'p' | 's'): () => PlayerId | SpectatorId {
  let next = 1;
  return () => `${prefix}${next++}`;
}

/** URL-safe token alphabet (base64url): used only by the seeded branch below. */
const TOKEN_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

const TOKEN_LENGTH = 32;

/**
 * Generates an opaque, URL-safe reconnect token (protocol §14 `Token`):
 * 32 characters matching `/^[A-Za-z0-9_-]{16,64}$/`.
 *
 * Uses `crypto.randomBytes` (base64url-encoded) by default. An `rng` may be
 * supplied for deterministic tests; this is not cryptographically secure
 * and should never be used outside tests.
 */
export function generateToken(rng?: () => number): Token {
  if (!rng) {
    // 24 raw bytes -> exactly 32 base64url characters, no padding.
    return randomBytes(24).toString('base64url');
  }
  let token = '';
  for (let i = 0; i < TOKEN_LENGTH; i++) {
    const index = Math.floor(rng() * TOKEN_ALPHABET.length);
    token += TOKEN_ALPHABET[index];
  }
  return token;
}
