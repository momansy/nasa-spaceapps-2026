// In-memory room logic for the MissionForge stub server (provisional protocol).
// Transport-agnostic: a "connection" only needs sendText(text) and 'text' / 'close' events.

import crypto from 'node:crypto';
import {
  ASSIST_LEVELS,
  DEFAULT_AVATAR,
  DEFAULT_SETTINGS,
  ERR,
  MAX_NICKNAME_LENGTH,
  MAX_PLAYERS,
  MAX_VOTE_TIMER_S,
  MIN_VOTE_TIMER_S,
  MSG,
  PHASE_LOBBY,
  ROLE_MODES,
  ROLES,
  ROOM_CODE_ALPHABET,
  ROOM_CODE_LENGTH,
} from './protocol.mjs';

const MAX_ROOMS = 200;
const TOKEN_BYTES = 16;
const HOST_REPLACED_CLOSE_CODE = 4000;
const SERVER_SHUTDOWN_CLOSE_CODE = 1001;
const PHASE_PATTERN = /^[A-Z][A-Z0-9_]{0,31}$/;
const AVATAR_PATTERN = /^[a-z0-9_]{1,32}$/;
const AVATAR_COUNT = 10;

const SIMULATED_NICKNAMES = Object.freeze([
  'Nova', 'Orion', 'Vega', 'Lyra', 'Altair', 'Juno', 'Kepler', 'Halley', 'Ceres', 'Rigel',
]);

const SETTING_VALIDATORS = Object.freeze({
  roleMode: (v) => ROLE_MODES.includes(v),
  assist: (v) => ASSIST_LEVELS.includes(v),
  voteTimerS: (v) => Number.isInteger(v) && v >= MIN_VOTE_TIMER_S && v <= MAX_VOTE_TIMER_S,
  hiddenTallies: (v) => typeof v === 'boolean',
});

function newToken() {
  return crypto.randomBytes(TOKEN_BYTES).toString('hex');
}

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeCode(value) {
  return typeof value === 'string' ? value.trim().toUpperCase() : '';
}

function publicPlayer(player) {
  return {
    id: player.id,
    nickname: player.nickname,
    avatar: player.avatar,
    role: player.role,
    connected: player.connected,
    spectator: player.spectator,
  };
}

function roomStateOf(room) {
  return {
    code: room.code,
    phase: room.phase,
    players: room.players.map(publicPlayer),
    settings: { ...room.settings },
  };
}

/** Parses and validates one envelope. Returns { envelope } or { error }. */
export function parseEnvelope(text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    return { error: `invalid JSON: ${err.message}` };
  }
  if (!isPlainObject(parsed)) return { error: 'envelope must be a JSON object' };
  if (typeof parsed.t !== 'string' || parsed.t.length === 0) return { error: 'missing string "t"' };
  if (!Number.isInteger(parsed.seq)) return { error: 'missing integer "seq"' };
  if (parsed.d !== undefined && parsed.d !== null && !isPlainObject(parsed.d)) {
    return { error: '"d" must be an object' };
  }
  return { envelope: { t: parsed.t, seq: parsed.seq, d: parsed.d ?? {} } };
}

export class RoomHub {
  #rooms = new Map();
  #sessions = new Set();
  #simulatePlayers;
  #simulateIntervalMs;
  #simulateRoles;
  #handlers;

  /**
   * @param {object} options
   * @param {number} options.simulatePlayers fake players that join every new room
   * @param {number} options.simulateIntervalMs delay between simulated joins
   * @param {number} options.simulateRoles how many of the simulated players receive a role
   */
  constructor({ simulatePlayers = 0, simulateIntervalMs = 1500, simulateRoles = 4 } = {}) {
    this.#simulatePlayers = simulatePlayers;
    this.#simulateIntervalMs = simulateIntervalMs;
    this.#simulateRoles = simulateRoles;
    this.#handlers = {
      [MSG.ROOM_CREATE]: (s) => this.#onCreate(s),
      [MSG.ROOM_RESUME]: (s, d) => this.#onResume(s, d),
      [MSG.ROOM_JOIN]: (s, d) => this.#onJoin(s, d),
      [MSG.ROOM_SETTINGS]: (s, d) => this.#onSettings(s, d),
      [MSG.PHASE_SET]: (s, d) => this.#onPhaseSet(s, d),
      [MSG.PING]: (s, d) => this.#send(s, MSG.PONG, { t: d.t ?? null }),
    };
  }

  get roomCount() {
    return this.#rooms.size;
  }

  /** Registers a new client connection. */
  attach(conn) {
    const session = { conn, seq: 0, room: null, player: null, isHost: false };
    this.#sessions.add(session);
    conn.on('text', (text) => this.#onText(session, text));
    conn.on('close', () => {
      this.#sessions.delete(session);
      this.#detach(session);
    });
  }

  /** Stops simulations and closes every client connection. */
  shutdown() {
    for (const room of this.#rooms.values()) clearInterval(room.simulationTimer);
    for (const session of this.#sessions) {
      session.conn.close(SERVER_SHUTDOWN_CLOSE_CODE, 'server shutting down');
    }
  }

  #send(session, type, data) {
    session.seq += 1;
    session.conn.sendText(JSON.stringify({ t: type, seq: session.seq, d: data }));
  }

  #sendError(session, code, message) {
    this.#send(session, MSG.ERROR, { code, message });
  }

  #broadcastState(room) {
    const state = roomStateOf(room);
    if (room.hostSession) this.#send(room.hostSession, MSG.ROOM_STATE, state);
    for (const player of room.players) {
      if (player.session) this.#send(player.session, MSG.ROOM_STATE, state);
    }
  }

  #onText(session, text) {
    const { envelope, error } = parseEnvelope(text);
    if (error) {
      this.#sendError(session, ERR.BAD_ENVELOPE, error);
      return;
    }
    const handler = this.#handlers[envelope.t];
    if (!handler) {
      this.#sendError(session, ERR.UNKNOWN_TYPE, `unknown message type "${envelope.t}"`);
      return;
    }
    handler(session, envelope.d);
  }

  /** Removes a session from its room: a host leaves the room alive, a player is marked offline. */
  #detach(session) {
    const room = session.room;
    if (!room) return;
    session.room = null;

    if (session.isHost) {
      session.isHost = false;
      if (room.hostSession === session) room.hostSession = null;
      return;
    }
    const player = session.player;
    session.player = null;
    if (player && player.session === session) {
      player.session = null;
      player.connected = false;
      this.#broadcastState(room);
    }
  }

  #newRoomCode() {
    for (;;) {
      let code = '';
      for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
        code += ROOM_CODE_ALPHABET[crypto.randomInt(ROOM_CODE_ALPHABET.length)];
      }
      if (!this.#rooms.has(code)) return code;
    }
  }

  #onCreate(session) {
    if (this.#rooms.size >= MAX_ROOMS) {
      this.#sendError(session, ERR.SERVER_FULL, 'too many rooms on this stub server');
      return;
    }
    this.#detach(session);

    const room = {
      code: this.#newRoomCode(),
      hostToken: newToken(),
      hostSession: session,
      phase: PHASE_LOBBY,
      players: [],
      settings: { ...DEFAULT_SETTINGS },
      nextPlayerNumber: 1,
      simulationTimer: null,
    };
    this.#rooms.set(room.code, room);
    session.room = room;
    session.isHost = true;

    this.#send(session, MSG.ROOM_CREATED, { code: room.code, hostToken: room.hostToken });
    this.#broadcastState(room);
    this.#startSimulation(room);
  }

  #onResume(session, data) {
    const room = this.#rooms.get(normalizeCode(data.code));
    if (!room) {
      this.#sendError(session, ERR.ROOM_NOT_FOUND, 'room not found');
      return;
    }
    if (typeof data.hostToken !== 'string' || data.hostToken !== room.hostToken) {
      this.#sendError(session, ERR.INVALID_TOKEN, 'host token does not match this room');
      return;
    }
    this.#detach(session);

    const previousHost = room.hostSession;
    if (previousHost && previousHost !== session) {
      previousHost.room = null;
      previousHost.isHost = false;
      previousHost.conn.close(HOST_REPLACED_CLOSE_CODE, 'host resumed from another connection');
    }
    room.hostSession = session;
    session.room = room;
    session.isHost = true;
    this.#send(session, MSG.ROOM_STATE, roomStateOf(room));
  }

  #onJoin(session, data) {
    const room = this.#rooms.get(normalizeCode(data.code));
    if (!room) {
      this.#sendError(session, ERR.ROOM_NOT_FOUND, 'room not found');
      return;
    }
    const nickname = typeof data.nickname === 'string' ? data.nickname.trim() : '';
    if (nickname.length === 0 || nickname.length > MAX_NICKNAME_LENGTH) {
      this.#sendError(
        session,
        ERR.INVALID_NICKNAME,
        `nickname must be 1-${MAX_NICKNAME_LENGTH} characters`,
      );
      return;
    }
    this.#detach(session);

    const avatar =
      typeof data.avatar === 'string' && AVATAR_PATTERN.test(data.avatar) ? data.avatar : DEFAULT_AVATAR;
    const player = this.#addPlayer(room, { nickname, avatar, session, assignRole: true });
    session.room = room;
    session.player = player;

    this.#send(session, MSG.ROOM_JOINED, { playerId: player.id, token: player.token });
    this.#broadcastState(room);
  }

  #addPlayer(room, { nickname, avatar, session, assignRole }) {
    const activeCount = room.players.filter((p) => !p.spectator).length;
    const spectator = activeCount >= MAX_PLAYERS;
    const takenRoles = new Set(room.players.map((p) => p.role));
    const freeRole = ROLES.find((role) => !takenRoles.has(role)) ?? null;
    const player = {
      id: `p${room.nextPlayerNumber}`,
      nickname,
      avatar,
      role: assignRole && !spectator ? freeRole : null,
      connected: true,
      spectator,
      token: newToken(),
      session,
    };
    room.nextPlayerNumber += 1;
    room.players.push(player);
    return player;
  }

  #hostRoomOf(session) {
    if (session.isHost && session.room) return session.room;
    this.#sendError(session, ERR.NOT_HOST, 'only the room host may do that');
    return null;
  }

  #onSettings(session, data) {
    const room = this.#hostRoomOf(session);
    if (!room) return;
    for (const [key, value] of Object.entries(data)) {
      const isValid = Object.hasOwn(SETTING_VALIDATORS, key) && SETTING_VALIDATORS[key](value);
      if (!isValid) {
        this.#sendError(session, ERR.INVALID_SETTINGS, `invalid setting "${key}"`);
        return;
      }
    }
    room.settings = { ...room.settings, ...data };
    this.#broadcastState(room);
  }

  #onPhaseSet(session, data) {
    const room = this.#hostRoomOf(session);
    if (!room) return;
    if (typeof data.phase !== 'string' || !PHASE_PATTERN.test(data.phase)) {
      this.#sendError(session, ERR.INVALID_PHASE, 'phase must be an UPPER_SNAKE_CASE string');
      return;
    }
    room.phase = data.phase;
    this.#broadcastState(room);
  }

  #startSimulation(room) {
    if (this.#simulatePlayers <= 0) return;
    let joined = 0;
    room.simulationTimer = setInterval(() => {
      const index = joined;
      const lap = Math.floor(index / SIMULATED_NICKNAMES.length);
      const baseName = SIMULATED_NICKNAMES[index % SIMULATED_NICKNAMES.length];
      this.#addPlayer(room, {
        nickname: lap === 0 ? baseName : `${baseName}${lap + 1}`,
        avatar: `astro_${String((index % AVATAR_COUNT) + 1).padStart(2, '0')}`,
        session: null,
        assignRole: index < this.#simulateRoles,
      });
      joined += 1;
      if (joined >= this.#simulatePlayers) clearInterval(room.simulationTimer);
      this.#broadcastState(room);
    }, this.#simulateIntervalMs);
  }
}
