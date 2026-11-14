// Pure contract rules used by the stub room server: phase field combinations, nicknames,
// routing of host messages, the room.state payload and bot identities. No I/O, no timers.

import crypto from 'node:crypto';

const TOKEN_BYTES = 18; // 24 base64url characters, inside the Token pattern (16–64)
const NICKNAME_PATTERN = /^[\p{L}\p{N}][\p{L}\p{N} _-]{0,14}[\p{L}\p{N}]$/u;
const MAX_NICKNAME_CHARS = 16;
const MAX_SUGGESTION_SUFFIX = 99;

const BOT_NICKNAMES = Object.freeze(['Nova', 'Orion', 'Vega', 'Lyra', 'Altair', 'Juno', 'Kepler', 'Halley', 'Ceres', 'Rigel']);
const BOT_SUITS = Object.freeze([
  'suit_orange', 'suit_white', 'suit_teal', 'suit_blue', 'suit_red',
  'suit_green', 'suit_purple', 'suit_yellow', 'suit_pink', 'suit_silver',
]);
const BOT_PATCHES = Object.freeze(['patch_comet', 'patch_orbit', 'patch_star', 'patch_moon', 'patch_rocket']);

/** FlightPhase -> FlightSegment (messages.md 6). */
const FLIGHT_SEGMENTS = Object.freeze({
  F2: 'ASCENT', F3: 'ASCENT', F4: 'ASCENT', F5: 'ASCENT', F6: 'ASCENT', F7: 'ASCENT',
  F8: 'ORBIT', F9: 'ORBIT', F10: 'ENTRY', F11: 'ENTRY', F12: 'LANDING', F13: 'LANDING',
});

export function newToken() {
  return crypto.randomBytes(TOKEN_BYTES).toString('base64url');
}

export function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** True when sub / review / flightPhase / segment / step fit `phase` (messages.md 6, field combinations). */
export function phaseFieldsValid(d) {
  const nulls = (...keys) => keys.every((k) => d[k] === null);
  if (d.phase !== 'BUILD' && d.step !== null) return false;
  switch (d.phase) {
    case 'LOBBY':
    case 'BRIEFING':
    case 'CONTRACT_VOTE':
    case 'CAMPAIGN_HUB':
      return d.sub === 'NONE' && nulls('review', 'flightPhase', 'segment');
    case 'BUILD': {
      if (!['NONE', 'VOTE_ROUND', 'TEST', 'ANOMALY', 'REVIEW'].includes(d.sub)) return false;
      const reviewOk = d.sub === 'REVIEW' ? ['PDR', 'CDR'].includes(d.review) : d.review === null;
      return reviewOk && nulls('flightPhase', 'segment');
    }
    case 'FRR':
      return d.sub === 'NONE' && d.review === 'FRR' && nulls('flightPhase', 'segment');
    case 'COUNTDOWN':
      return d.sub === 'NONE' && ['F0', 'F1'].includes(d.flightPhase) && nulls('review', 'segment');
    case 'FLIGHT':
      return ['FLYING', 'ABORT'].includes(d.sub) && d.review === null && FLIGHT_SEGMENTS[d.flightPhase] === d.segment;
    case 'DEBRIEF':
      return ['SUMMARY', 'INVESTIGATION'].includes(d.sub) && nulls('review', 'flightPhase', 'segment');
    default:
      return false;
  }
}

/**
 * Normalises a requested nickname (NFC, trim, collapse whitespace) and checks it against the
 * Nickname pattern and the other players (case-insensitive). No profanity filter in the stub.
 * Returns { nickname } or { error, field?, suggestion? }.
 */
export function checkNickname(players, raw, selfId = null) {
  const nickname = raw.normalize('NFC').trim().replace(/\s+/gu, ' ');
  if (!NICKNAME_PATTERN.test(nickname)) return { error: 'BAD_PAYLOAD', field: 'nickname' };
  const taken = (name) => players.some((p) => p.id !== selfId && p.nickname.toLowerCase() === name.toLowerCase());
  if (!taken(nickname)) return { nickname };
  for (let i = 2; i <= MAX_SUGGESTION_SUFFIX; i++) {
    const suffix = String(i);
    const candidate = [...nickname].slice(0, MAX_NICKNAME_CHARS - suffix.length).join('').trimEnd() + suffix;
    if (NICKNAME_PATTERN.test(candidate) && !taken(candidate)) return { error: 'NICK_TAKEN', suggestion: candidate };
  }
  return { error: 'NICK_TAKEN' };
}

/** error extras for a failed checkNickname result. */
export function nicknameErrorExtra(checked) {
  if (checked.field) return { field: checked.field };
  if (checked.suggestion) return { suggestion: checked.suggestion };
  return {};
}

/** Nickname and avatar of the index-th bot. */
export function botIdentity(index) {
  const base = BOT_NICKNAMES[index % BOT_NICKNAMES.length];
  const lap = Math.floor(index / BOT_NICKNAMES.length);
  return {
    nickname: lap === 0 ? base : `${base}${lap + 1}`,
    avatar: { suitId: BOT_SUITS[index % BOT_SUITS.length], patchId: BOT_PATCHES[index % BOT_PATCHES.length] },
  };
}

/**
 * Phone sessions that receive a host message routed by MESSAGE_META[t].to.
 * `rolesOf(playerId)` returns the roles a player holds.
 */
export function recipients(route, room, d, rolesOf) {
  const players = room.players.filter((p) => p.session);
  const playerSessions = players.map((p) => p.session);
  const spectators = room.spectators.filter((s) => s.session).map((s) => s.session);
  const listed = (ids) => players.filter((p) => ids.includes(p.id)).map((p) => p.session);
  switch (route) {
    case 'CLIENTS':
      return [...playerSessions, ...spectators];
    case 'PLAYERS_PLUS_AUDIENCE':
      return [...playerSessions, ...(d.audience === true ? spectators : [])];
    case 'ROLE':
      return players.filter((p) => rolesOf(p.id).includes(d.role)).map((p) => p.session);
    case 'TO':
      return listed(d.to ?? []);
    case 'TO_OR_CLIENTS':
      return Array.isArray(d.to) ? listed(d.to) : [...playerSessions, ...spectators];
    case 'TO_OR_PLAYERS':
      return Array.isArray(d.to) ? listed(d.to) : playerSessions;
    default:
      return [];
  }
}

/** The room.state payload. */
export function roomStatePayload(room) {
  return {
    room: room.code,
    hostConnected: room.hostSession !== null,
    paused: room.paused !== null,
    players: room.players.map((p) => ({
      id: p.id,
      slot: p.slot,
      nickname: p.nickname,
      avatar: { ...p.avatar },
      connected: p.connected,
      slotExpiresAtMs: p.connected ? null : p.slotExpiresAtMs,
      vetoAvailable: p.vetoAvailable,
      prefs: { ...p.prefs },
    })),
    spectatorCount: room.spectators.filter((s) => s.connected).length,
    pendingPlayerCount: room.spectators.filter((s) => s.pendingPlayer).length,
  };
}
