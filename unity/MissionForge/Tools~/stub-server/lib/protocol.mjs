// MissionForge wire-contract constants used by the stub server (protocol version 1).
//
// Source of truth: protocol/messages.md at the repository root; the schemas and MESSAGE_META are
// loaded at runtime by lib/contract.mjs. The Unity mirror is
// Assets/MissionForge/Net/ProtocolNames.cs. Only names the stub's own logic needs live here.

export const PROTOCOL_VERSION = 1;

/** Room codes: 4 letters from A–Z without I and O (messages.md 4.1). */
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
export const ROOM_CODE_LENGTH = 4;

export const MSG = Object.freeze({
  HELLO: 'hello',
  HELLO_OK: 'hello.ok',
  CLOCK_PING: 'clock.ping',
  CLOCK_PONG: 'clock.pong',
  ERROR: 'error',
  BYE: 'bye',
  RELAY: 'relay',
  SNAPSHOT_END: 'snapshot.end',
  ROOM_CREATE: 'room.create',
  ROOM_CREATED: 'room.created',
  ROOM_JOIN: 'room.join',
  ROOM_JOINED: 'room.joined',
  ROOM_RESUME: 'room.resume',
  ROOM_RESUMED: 'room.resumed',
  ROOM_STATE: 'room.state',
  ROOM_LEAVE: 'room.leave',
  ROOM_KICK: 'room.kick',
  ROOM_CLOSE: 'room.close',
  ROOM_PROMOTED: 'room.promoted',
  PLAYER_PROFILE: 'player.profile',
  PLAYER_PREFS: 'player.prefs',
  SETTINGS_SET: 'settings.set',
  SETTINGS_STATE: 'settings.state',
  ROLES_PICK: 'roles.pick',
  ROLES_VOTE: 'roles.vote',
  ROLES_LOCK: 'roles.lock',
  ROLES_SET: 'roles.set',
  ROLES_ROTATE: 'roles.rotate',
  ROLES_STATE: 'roles.state',
  PHASE_SET: 'phase.set',
  GAME_PAUSE: 'game.pause',
  GAME_PAUSED: 'game.paused',
  GAME_RESUME: 'game.resume',
  GAME_RESUMED: 'game.resumed',
});

/** Error codes (enum ErrorCode) the stub emits. */
export const ERR = Object.freeze({
  BAD_ENVELOPE: 'BAD_ENVELOPE',
  FRAME_TOO_LARGE: 'FRAME_TOO_LARGE',
  HANDSHAKE_REQUIRED: 'HANDSHAKE_REQUIRED',
  VERSION_MISMATCH: 'VERSION_MISMATCH',
  UNKNOWN_TYPE: 'UNKNOWN_TYPE',
  BAD_PAYLOAD: 'BAD_PAYLOAD',
  FORBIDDEN: 'FORBIDDEN',
  NOT_IN_ROOM: 'NOT_IN_ROOM',
  ALREADY_IN_ROOM: 'ALREADY_IN_ROOM',
  ROOM_NOT_FOUND: 'ROOM_NOT_FOUND',
  TOKEN_INVALID: 'TOKEN_INVALID',
  NICK_TAKEN: 'NICK_TAKEN',
  PAUSED: 'PAUSED',
  WRONG_PHASE: 'WRONG_PHASE',
  INVALID_TRANSITION: 'INVALID_TRANSITION',
  SETTING_LOCKED: 'SETTING_LOCKED',
  UNKNOWN_PLAYER: 'UNKNOWN_PLAYER',
  ROLE_TAKEN: 'ROLE_TAKEN',
  INVALID_ASSIGNMENT: 'INVALID_ASSIGNMENT',
  INTERNAL: 'INTERNAL',
});

/** ByeReason -> fixed close code and canResume (messages.md 15, ByeReason; 13, bye). */
export const BYE = Object.freeze({
  ROOM_CLOSED: { reason: 'ROOM_CLOSED', closeCode: 4000, canResume: false },
  VERSION_MISMATCH: { reason: 'VERSION_MISMATCH', closeCode: 4001, canResume: false },
  KICKED: { reason: 'KICKED', closeCode: 4002, canResume: false },
  REPLACED: { reason: 'REPLACED', closeCode: 4003, canResume: false },
  ROOM_EXPIRED: { reason: 'ROOM_EXPIRED', closeCode: 4004, canResume: false },
  HANDSHAKE_TIMEOUT: { reason: 'HANDSHAKE_TIMEOUT', closeCode: 4005, canResume: false },
  FLOOD: { reason: 'FLOOD', closeCode: 4006, canResume: true },
  PROTOCOL_VIOLATION: { reason: 'PROTOCOL_VIOLATION', closeCode: 4007, canResume: true },
  SERVER_SHUTDOWN: { reason: 'SERVER_SHUTDOWN', closeCode: 4008, canResume: true },
  LEFT: { reason: 'LEFT', closeCode: 4009, canResume: false },
  IDLE_TIMEOUT: { reason: 'IDLE_TIMEOUT', closeCode: 4010, canResume: true },
});

/** Mission Control roles (enum RoleId), canonical order. */
export const ROLES = Object.freeze([
  'FLIGHT', 'BOOSTER', 'STRUCT', 'GUIDO', 'FIDO', 'EECOM', 'INCO', 'PAYLOAD', 'RETRO', 'PM',
]);

/** Role groups by player count (messages.md 5.1); "+" joins roles held together. */
export const ROLE_GROUP_TABLE = Object.freeze({
  10: ['FLIGHT', 'BOOSTER', 'STRUCT', 'GUIDO', 'FIDO', 'EECOM', 'INCO', 'PAYLOAD', 'RETRO', 'PM'],
  9: ['FLIGHT+PM', 'BOOSTER', 'STRUCT', 'GUIDO', 'FIDO', 'EECOM', 'INCO', 'PAYLOAD', 'RETRO'],
  8: ['FLIGHT+PM', 'BOOSTER+STRUCT', 'GUIDO', 'FIDO', 'EECOM', 'INCO', 'PAYLOAD', 'RETRO'],
  7: ['FLIGHT+PM', 'BOOSTER+STRUCT', 'GUIDO+FIDO', 'EECOM', 'INCO', 'PAYLOAD', 'RETRO'],
  6: ['FLIGHT+PM', 'BOOSTER+STRUCT', 'GUIDO+FIDO', 'EECOM+INCO', 'PAYLOAD', 'RETRO'],
  5: ['FLIGHT+PM', 'BOOSTER+STRUCT', 'GUIDO+FIDO', 'EECOM+INCO', 'PAYLOAD+RETRO'],
  4: ['FLIGHT+PM', 'BOOSTER+STRUCT', 'GUIDO+FIDO', 'EECOM+INCO+PAYLOAD+RETRO'],
  3: ['FLIGHT+PM', 'BOOSTER+STRUCT+GUIDO+FIDO', 'EECOM+INCO+PAYLOAD+RETRO'],
  2: ['FLIGHT+PM+BOOSTER+STRUCT+GUIDO', 'FIDO+EECOM+INCO+PAYLOAD+RETRO'],
  1: ['FLIGHT+BOOSTER+STRUCT+GUIDO+FIDO+EECOM+INCO+PAYLOAD+RETRO+PM'],
});

/** Allowed top-level phase transitions (messages.md 6). A phase.set keeping the phase is always allowed. */
export const PHASE_GRAPH = Object.freeze({
  LOBBY: ['BRIEFING'],
  BRIEFING: ['CONTRACT_VOTE', 'BUILD', 'LOBBY'],
  CONTRACT_VOTE: ['BUILD', 'LOBBY'],
  BUILD: ['FRR', 'LOBBY'],
  FRR: ['COUNTDOWN', 'BUILD', 'LOBBY'],
  COUNTDOWN: ['FLIGHT', 'FRR', 'DEBRIEF', 'LOBBY'],
  FLIGHT: ['DEBRIEF', 'LOBBY'],
  DEBRIEF: ['CAMPAIGN_HUB', 'LOBBY', 'BUILD'],
  CAMPAIGN_HUB: ['BRIEFING', 'LOBBY'],
});

/** Phases in which room.join as PLAYER makes a player (messages.md 4.2). */
export const PLAYER_JOIN_PHASES = Object.freeze(['LOBBY', 'BRIEFING', 'CONTRACT_VOTE']);

export const DEFAULT_PREFS = Object.freeze({
  lang: 'en',
  relaxed: false,
  oneButton: false,
  holdToToggle: false,
  reducedMotion: false,
  highContrast: false,
  textScalePct: 100,
  screenReader: false,
  haptics: true,
});

/** RoomSettings defaults at room.create (messages.md 14, RoomSettings). */
export const DEFAULT_SETTINGS = Object.freeze({
  roleAssignMode: 'RANDOM',
  voteTimerS: 20,
  inspectTimerS: 20,
  tallyVisibility: 'OPEN',
  strictMajority: false,
  assistLevel: 'ENGINEER',
  audienceVoteWeight: 0,
  pilotRotation: 'PER_SEGMENT',
  pilotSelect: 'ROTATION',
  passTheControls: false,
  lang: 'en',
  a11y: Object.freeze({
    slowTimers: false,
    relaxedMinigames: false,
    reducedMotion: false,
    highContrast: false,
    subtitles: true,
    explainTooltips: false,
  }),
});

/** hello.ok limits per ClientKind (messages.md 11). */
export const LIMITS = Object.freeze({
  HOST: { maxFrameBytes: 65_536, maxMsgsPerSec: 400, maxBytesPerSec: 262_144 },
  PHONE: { maxFrameBytes: 2_048, maxMsgsPerSec: 60, maxBytesPerSec: 8_192 },
});

export const PRE_HELLO_MAX_FRAME_BYTES = 1_024;
export const HEARTBEAT_MS = 5_000;
export const IDLE_TIMEOUT_MS = 15_000;
export const HELLO_TIMEOUT_MS = 5_000;
export const JOIN_TIMEOUT_MS = 30_000;
export const SLOT_HOLD_MS = 180_000;
export const ROOM_HOLD_MS = 600_000;
export const MAX_PLAYERS = 10;
export const HOST_ID = 'host';
