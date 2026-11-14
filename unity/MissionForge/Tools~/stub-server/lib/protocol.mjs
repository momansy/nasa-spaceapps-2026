// Provisional MissionForge room protocol names used by the stub server.
//
// The C# source of truth is Assets/MissionForge/Net/ProtocolNames.cs. Keep this file in
// sync with it by hand until the formal protocol/messages.md and the real server/ land.

export const PROTOCOL_VERSION = 1;

/** Room codes avoid the confusable letters I, O and L. */
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ';
export const ROOM_CODE_LENGTH = 4;

export const MSG = Object.freeze({
  ROOM_CREATE: 'room.create',
  ROOM_CREATED: 'room.created',
  ROOM_RESUME: 'room.resume',
  ROOM_JOIN: 'room.join',
  ROOM_JOINED: 'room.joined',
  ROOM_STATE: 'room.state',
  ROOM_SETTINGS: 'room.settings',
  PHASE_SET: 'phase.set',
  ERROR: 'error',
  PING: 'ping',
  PONG: 'pong',
});

export const ERR = Object.freeze({
  BAD_ENVELOPE: 'bad_envelope',
  UNKNOWN_TYPE: 'unknown_type',
  ROOM_NOT_FOUND: 'room_not_found',
  INVALID_TOKEN: 'invalid_token',
  INVALID_NICKNAME: 'invalid_nickname',
  INVALID_SETTINGS: 'invalid_settings',
  INVALID_PHASE: 'invalid_phase',
  NOT_HOST: 'not_host',
  SERVER_FULL: 'server_full',
});

export const PHASE_LOBBY = 'LOBBY';

/** Mission Control role ids from the game design document, in assignment order. */
export const ROLES = Object.freeze([
  'FLIGHT', 'BOOSTER', 'STRUCT', 'GUIDO', 'FIDO', 'EECOM', 'INCO', 'PAYLOAD', 'RETRO', 'PM',
]);

export const ROLE_MODES = Object.freeze(['random', 'pick', 'vote']);
export const ASSIST_LEVELS = Object.freeze(['cadet', 'engineer', 'flight_director']);

export const DEFAULT_SETTINGS = Object.freeze({
  roleMode: 'random',
  assist: 'cadet',
  voteTimerS: 30,
  hiddenTallies: false,
});

export const MAX_PLAYERS = 10;
export const MAX_NICKNAME_LENGTH = 16;
export const MIN_VOTE_TIMER_S = 5;
export const MAX_VOTE_TIMER_S = 300;
export const DEFAULT_AVATAR = 'astro_01';
