// In-memory room server speaking the MissionForge wire contract (protocol version 1).
// Transport-agnostic: a "connection" only needs sendText(text), close(code, reason) and
// 'text' / 'close' events.
//
// Implemented: handshake, clock, common validation (messages.md 12.1, without rate limits),
// rooms, joining, resume, slot hold, host pause/expiry, settings, roles, phase.set, snapshots,
// sticky host messages, host->phone relays and phone->host `relay`. Not simulated: votes,
// polls, abilities (the server-side resolution); those messages are validated and ignored.

import crypto from 'node:crypto';
import { loadContract } from './contract.mjs';
import { RoleBook, applyRolesMessage } from './roles.mjs';
import {
  botIdentity,
  checkNickname,
  isPlainObject,
  newToken,
  nicknameErrorExtra,
  phaseFieldsValid,
  recipients,
  roomStatePayload,
} from './rules.mjs';
import { checkFrame } from './validation.mjs';
import {
  BYE,
  DEFAULT_PREFS,
  DEFAULT_SETTINGS,
  ERR,
  HEARTBEAT_MS,
  HELLO_TIMEOUT_MS,
  HOST_ID,
  IDLE_TIMEOUT_MS,
  JOIN_TIMEOUT_MS,
  LIMITS,
  MAX_PLAYERS,
  MSG,
  PHASE_GRAPH,
  PLAYER_JOIN_PHASES,
  PROTOCOL_VERSION,
  ROOM_CODE_ALPHABET,
  ROOM_CODE_LENGTH,
  ROOM_HOLD_MS,
  SLOT_HOLD_MS,
} from './protocol.mjs';

const MAX_ROOMS = 200;
const SWEEP_INTERVAL_MS = 250;

export class RoomHub {
  #contract;
  #opts;
  #rooms = new Map();
  #sessions = new Set();
  #tokens = new Map(); // token -> { room, kind: 'HOST' | 'PLAYER' | 'SPECTATOR', member }
  #warned = new Set();
  #sweepTimer;
  #handlers;

  /**
   * @param {object} options
   * @param {object} [options.contract] result of loadContract(); loaded from protocol/ when absent
   * @param {number} [options.bots] fake players that join every new room
   * @param {number} [options.botIntervalMs] delay between bot joins
   * @param {string} [options.clientUrl] phone client base URL used for joinUrl / spectateUrl
   * @param {number} [options.slotHoldMs] / [options.roomHoldMs] / [options.idleTimeoutMs]
   */
  constructor(options = {}) {
    this.#contract = options.contract ?? loadContract(options.protocolDir);
    this.#opts = {
      bots: options.bots ?? 0,
      botIntervalMs: options.botIntervalMs ?? 1500,
      clientUrl: options.clientUrl ?? 'http://localhost:5173/',
      slotHoldMs: options.slotHoldMs ?? SLOT_HOLD_MS,
      roomHoldMs: options.roomHoldMs ?? ROOM_HOLD_MS,
      idleTimeoutMs: options.idleTimeoutMs ?? IDLE_TIMEOUT_MS,
      log: options.log ?? ((line) => console.error(line)),
    };
    this.#handlers = {
      [MSG.HELLO]: (s, d) => this.#onHello(s, d),
      [MSG.CLOCK_PING]: (s, d) => this.#send(s, MSG.CLOCK_PONG, { clientTimeMs: d.clientTimeMs, serverTimeMs: Date.now() }),
      [MSG.ROOM_CREATE]: (s, d, c) => this.#onCreate(s, d, c),
      [MSG.ROOM_JOIN]: (s, d, c) => this.#onJoin(s, d, c),
      [MSG.ROOM_RESUME]: (s, d, c) => this.#onResume(s, d, c),
      [MSG.ROOM_LEAVE]: (s) => this.#onLeave(s),
      [MSG.ROOM_KICK]: (s, d, c) => this.#onKick(s, d, c),
      [MSG.ROOM_CLOSE]: (s) => this.#destroyRoom(s.room, BYE.ROOM_CLOSED),
      [MSG.PLAYER_PROFILE]: (s, d, c) => this.#onProfile(s, d, c),
      [MSG.PLAYER_PREFS]: (s, d) => this.#onPrefs(s, d),
      [MSG.SETTINGS_SET]: (s, d, c) => this.#onSettings(s, d, c),
      [MSG.ROLES_PICK]: (s, d, c) => this.#onRoles(s, MSG.ROLES_PICK, d, c),
      [MSG.ROLES_VOTE]: (s, d, c) => this.#onRoles(s, MSG.ROLES_VOTE, d, c),
      [MSG.ROLES_LOCK]: (s, d, c) => this.#onRoles(s, MSG.ROLES_LOCK, d, c),
      [MSG.ROLES_SET]: (s, d, c) => this.#onRoles(s, MSG.ROLES_SET, d, c),
      [MSG.ROLES_ROTATE]: (s, d, c) => this.#onRoles(s, MSG.ROLES_ROTATE, d, c),
      [MSG.PHASE_SET]: (s, d, c) => this.#onPhaseSet(s, d, c),
      [MSG.GAME_PAUSE]: (s) => { if (!s.room.paused) this.#pause(s.room, 'HOST_REQUEST'); },
      [MSG.GAME_RESUME]: (s) => { if (s.room.paused) this.#resume(s.room); },
    };
    this.#sweepTimer = setInterval(() => this.#sweep(), SWEEP_INTERVAL_MS);
    this.#sweepTimer.unref?.();
  }

  get roomCount() {
    return this.#rooms.size;
  }

  /** Registers a new client connection. */
  attach(conn) {
    const now = Date.now();
    const session = {
      conn, outSeq: 0, inSeq: 0, hello: null, helloAt: 0, openedAt: now, lastFrameAt: now,
      room: null, kind: null, member: null, closing: false,
    };
    this.#sessions.add(session);
    conn.on('text', (text) => this.#onText(session, text));
    conn.on('close', () => {
      this.#sessions.delete(session);
      this.#onDisconnect(session);
    });
  }

  /** Sends bye SERVER_SHUTDOWN to everyone and stops all timers. */
  shutdown() {
    clearInterval(this.#sweepTimer);
    for (const room of this.#rooms.values()) this.#clearRoomTimers(room);
    for (const session of this.#sessions) this.#bye(session, BYE.SERVER_SHUTDOWN);
  }

  // ───────────────────────── sending ─────────────────────────

  #send(session, t, d) {
    if (!session || session.closing) return;
    session.outSeq += 1;
    session.conn.sendText(JSON.stringify({ t, seq: session.outSeq, d }));
  }

  #error(session, code, ctx, extra = {}) {
    this.#send(session, MSG.ERROR, { code, fatal: false, re: ctx?.seq ?? null, reT: ctx?.t ?? null, ...extra });
  }

  #bye(session, spec, canResume = spec.canResume) {
    if (session.closing) return;
    this.#send(session, MSG.BYE, { reason: spec.reason, closeCode: spec.closeCode, canResume });
    session.closing = true;
    session.conn.close(spec.closeCode, spec.reason);
  }

  /** Fatal error: error (fatal) + bye + close (messages.md 12.1). */
  #fatal(session, code, ctx, byeSpec = BYE.PROTOCOL_VIOLATION, extra = {}) {
    this.#send(session, MSG.ERROR, { code, fatal: true, re: ctx?.seq ?? null, reT: ctx?.t ?? null, ...extra });
    this.#bye(session, byeSpec, byeSpec.canResume && session.room !== null);
  }

  #hostOf(room) {
    return room.hostSession;
  }

  #clientSessions(room) {
    const out = [];
    for (const p of room.players) if (p.session) out.push(p.session);
    for (const s of room.spectators) if (s.session) out.push(s.session);
    return out;
  }

  /** Sends to the host and every phone, except `except`. */
  #broadcast(room, t, d, except = null) {
    for (const session of [this.#hostOf(room), ...this.#clientSessions(room)]) {
      if (session && session !== except) this.#send(session, t, d);
    }
  }

  #playersView(room) {
    return room.players.map((p) => ({ id: p.id, slot: p.slot, connected: p.connected }));
  }

  #roomState(room) {
    return roomStatePayload(room);
  }

  #rolesState(room) {
    return room.roles.view(room.settings.roleAssignMode, this.#playersView(room));
  }

  #broadcastRoom(room, except = null) {
    this.#broadcast(room, MSG.ROOM_STATE, this.#roomState(room), except);
  }

  #broadcastRoles(room, except = null) {
    this.#broadcast(room, MSG.ROLES_STATE, this.#rolesState(room), except);
  }

  #pausedPayload(room) {
    return { reason: room.paused.reason, atMs: room.paused.atMs, roomExpiresAtMs: room.paused.roomExpiresAtMs };
  }

  /** The snapshot after room.created / room.joined / room.resumed (messages.md 4.5). */
  #snapshot(session, room) {
    this.#send(session, MSG.SETTINGS_STATE, { settings: structuredClone(room.settings) });
    this.#send(session, MSG.ROOM_STATE, this.#roomState(room));
    this.#send(session, MSG.ROLES_STATE, this.#rolesState(room));
    if (room.paused) this.#send(session, MSG.GAME_PAUSED, this.#pausedPayload(room));
    if (session.kind !== 'HOST') {
      if (room.phaseSet) this.#send(session, MSG.PHASE_SET, room.phaseSet);
      for (const { t, d } of room.sticky.values()) {
        if (this.#recipients(room, t, d).includes(session)) this.#send(session, t, d);
      }
    }
    this.#send(session, MSG.SNAPSHOT_END, { serverTimeMs: Date.now(), lastOutcomeSeq: 0 });
  }

  /** Phones that receive a host message routed by MESSAGE_META[t].to. */
  #recipients(room, t, d) {
    return recipients(this.#contract.meta.get(t)?.to, room, d, (id) => room.roles.rolesOf(id));
  }

  // ───────────────────────── receiving ─────────────────────────

  #onText(session, text) {
    if (session.closing) return;
    session.lastFrameAt = Date.now();

    const result = checkFrame(this.#contract, session, text);
    if (result.verdict === 'fatal') {
      this.#fatal(session, result.code, result.ctx);
      return;
    }
    session.inSeq = result.seq; // every frame with a valid envelope advances seq, even if rejected later
    if (result.verdict === 'error') {
      this.#error(session, result.code, result.ctx, result.extra);
      return;
    }

    const { t, d, ctx, meta } = result;
    const handler = this.#handlers[t];
    if (handler) handler(session, d, ctx);
    else this.#route(session, t, d, ctx, meta);
  }

  /** Generic routing for types without a dedicated handler. */
  #route(session, t, d, ctx, meta) {
    const room = session.room;
    if (meta.dir === 'RELAY_H2C') {
      if (meta.sticky) {
        const key = t === 'console.config' ? `${t}:${d.role}` : t;
        room.sticky.set(key, { t, d });
      }
      if (t === 'mg.summary' || t === 'mg.cancel') room.sticky.delete('mg.start');
      for (const target of this.#recipients(room, t, d)) this.#send(target, t, d);
      return;
    }
    if (meta.dir === 'RELAY_C2H') {
      if (!room.hostSession) {
        this.#error(session, ERR.PAUSED, ctx);
        return;
      }
      this.#send(room.hostSession, MSG.RELAY, { from: session.member.id, t, d });
      return;
    }
    if (!this.#warned.has(t)) {
      this.#warned.add(t);
      this.#opts.log(`[stub] "${t}" is valid but not simulated by the stub server; ignored`);
    }
  }

  // ───────────────────────── handshake ─────────────────────────

  #onHello(session, d) {
    if (d.protocolVersion !== PROTOCOL_VERSION) {
      this.#fatal(session, ERR.VERSION_MISMATCH, { seq: session.inSeq, t: MSG.HELLO }, BYE.VERSION_MISMATCH, {
        serverProtocolVersion: PROTOCOL_VERSION,
      });
      return;
    }
    session.hello = { client: d.client, lang: d.lang ?? 'en' };
    session.helloAt = Date.now();
    const limits = LIMITS[d.client];
    this.#send(session, MSG.HELLO_OK, {
      protocolVersion: PROTOCOL_VERSION,
      serverTimeMs: Date.now(),
      heartbeatMs: HEARTBEAT_MS,
      idleTimeoutMs: this.#opts.idleTimeoutMs,
      maxFrameBytes: limits.maxFrameBytes,
      maxMsgsPerSec: limits.maxMsgsPerSec,
      maxBytesPerSec: limits.maxBytesPerSec,
    });
  }

  #sweep() {
    const now = Date.now();
    for (const session of this.#sessions) {
      if (session.closing) continue;
      if (!session.hello && now - session.openedAt > HELLO_TIMEOUT_MS) this.#bye(session, BYE.HANDSHAKE_TIMEOUT);
      else if (session.hello && !session.room && now - session.helloAt > JOIN_TIMEOUT_MS) this.#bye(session, BYE.HANDSHAKE_TIMEOUT);
      else if (now - session.lastFrameAt > this.#opts.idleTimeoutMs) this.#bye(session, BYE.IDLE_TIMEOUT, session.room !== null);
    }
  }

  // ───────────────────────── rooms ─────────────────────────

  #newRoomCode() {
    for (;;) {
      let code = '';
      for (let i = 0; i < ROOM_CODE_LENGTH; i++) code += ROOM_CODE_ALPHABET[crypto.randomInt(ROOM_CODE_ALPHABET.length)];
      if (!this.#rooms.has(code)) return code;
    }
  }

  #mergeSettings(base, patch = {}) {
    const merged = structuredClone(base);
    for (const [key, value] of Object.entries(patch)) {
      if (Object.hasOwn(DEFAULT_SETTINGS, key)) merged[key] = structuredClone(value);
    }
    return merged;
  }

  #onCreate(session, d, ctx) {
    if (session.hello.client !== 'HOST') {
      this.#error(session, ERR.FORBIDDEN, ctx);
      return;
    }
    if (this.#rooms.size >= MAX_ROOMS) {
      this.#error(session, ERR.INTERNAL, ctx);
      return;
    }
    const code = this.#newRoomCode();
    const room = {
      code,
      hostToken: newToken(),
      hostSession: session,
      settings: this.#mergeSettings(DEFAULT_SETTINGS, d.settings),
      players: [],
      spectators: [],
      nextPlayerNo: 1,
      nextSpectatorNo: 1,
      joinCounter: 0,
      phase: 'LOBBY',
      missionSeq: 0,
      phaseSet: null,
      sticky: new Map(),
      roles: new RoleBook(),
      paused: null,
      expiryTimer: null,
      botTimer: null,
    };
    this.#rooms.set(code, room);
    this.#tokens.set(room.hostToken, { room, kind: 'HOST', member: null });
    session.room = room;
    session.kind = 'HOST';

    const base = this.#opts.clientUrl;
    this.#send(session, MSG.ROOM_CREATED, {
      room: code,
      hostToken: room.hostToken,
      joinUrl: `${base}?room=${code}`,
      spectateUrl: `${base}?room=${code}&watch=1`,
      maxPlayers: MAX_PLAYERS,
      slotHoldMs: this.#opts.slotHoldMs,
      roomHoldMs: this.#opts.roomHoldMs,
    });
    this.#snapshot(session, room);
    this.#startBots(room);
  }

  #addPlayer(room, { nickname, avatar, prefs, session = null, token = newToken(), bot = false }) {
    const used = new Set(room.players.map((p) => p.slot));
    let slot = 1;
    while (used.has(slot)) slot += 1;
    const player = {
      id: `p${room.nextPlayerNo++}`,
      slot,
      nickname,
      avatar: { suitId: avatar.suitId, patchId: avatar.patchId },
      connected: true,
      slotExpiresAtMs: null,
      vetoAvailable: true,
      prefs: { ...DEFAULT_PREFS, ...(prefs ?? {}) },
      token,
      session,
      bot,
      holdTimer: null,
      holdRemainingMs: 0,
    };
    room.players.push(player);
    room.players.sort((a, b) => a.slot - b.slot);
    this.#tokens.set(token, { room, kind: 'PLAYER', member: player });
    if (room.roles.locked) room.roles.addPlayer(player.id, this.#playersView(room));
    else room.roles.onCountChanged(this.#playersView(room));
    return player;
  }

  #onJoin(session, d, ctx) {
    if (session.hello.client !== 'PHONE') {
      this.#error(session, ERR.FORBIDDEN, ctx);
      return;
    }
    const room = this.#rooms.get(d.room);
    if (!room) {
      this.#error(session, ERR.ROOM_NOT_FOUND, ctx);
      return;
    }
    const prefs = { ...DEFAULT_PREFS, lang: session.hello.lang, ...(d.prefs ?? {}) };
    let nickname = null;
    if (d.as === 'PLAYER') {
      if (typeof d.nickname !== 'string' || !isPlainObject(d.avatar)) {
        this.#error(session, ERR.BAD_PAYLOAD, ctx, { field: typeof d.nickname !== 'string' ? 'nickname' : 'avatar' });
        return;
      }
      const checked = checkNickname(room.players, d.nickname);
      if (checked.error) {
        this.#error(session, checked.error, ctx, nicknameErrorExtra(checked));
        return;
      }
      nickname = checked.nickname;
    }

    session.room = room;
    const canPlay = d.as === 'PLAYER' && PLAYER_JOIN_PHASES.includes(room.phase) && room.players.length < MAX_PLAYERS;
    if (canPlay) {
      const player = this.#addPlayer(room, { nickname, avatar: d.avatar, prefs, session });
      session.kind = 'PLAYER';
      session.member = player;
      this.#send(session, MSG.ROOM_JOINED, {
        room: room.code, kind: 'PLAYER', id: player.id, slot: player.slot, nickname,
        token: player.token, spectatorReason: null, pendingPlayer: false,
      });
    } else {
      const pending = d.as === 'PLAYER';
      const reason = !pending ? 'REQUESTED' : PLAYER_JOIN_PHASES.includes(room.phase) ? 'ROOM_FULL' : 'LATE_JOIN';
      const spectator = {
        id: `s${room.nextSpectatorNo++}`, token: newToken(), session, connected: true, pendingPlayer: pending,
        spectatorReason: reason, nickname, avatar: d.avatar ?? null, prefs, joinOrder: room.joinCounter++, forgetTimer: null,
      };
      room.spectators.push(spectator);
      this.#tokens.set(spectator.token, { room, kind: 'SPECTATOR', member: spectator });
      session.kind = 'SPECTATOR';
      session.member = spectator;
      this.#send(session, MSG.ROOM_JOINED, {
        room: room.code, kind: 'SPECTATOR', id: spectator.id, slot: null, nickname,
        token: spectator.token, spectatorReason: reason, pendingPlayer: pending,
      });
    }
    this.#snapshot(session, room);
    this.#broadcastRoom(room, session);
    if (canPlay) this.#broadcastRoles(room, session);
  }

  #onResume(session, d, ctx) {
    const room = this.#rooms.get(d.room);
    if (!room) {
      this.#error(session, ERR.ROOM_NOT_FOUND, ctx);
      return;
    }
    const entry = this.#tokens.get(d.token);
    if (!entry || entry.room !== room) {
      this.#error(session, ERR.TOKEN_INVALID, ctx);
      return;
    }
    if ((entry.kind === 'HOST') !== (session.hello.client === 'HOST')) {
      this.#error(session, ERR.FORBIDDEN, ctx);
      return;
    }

    const paused = room.paused !== null;
    if (entry.kind === 'HOST') {
      this.#replace(room.hostSession, session);
      room.hostSession = session;
      clearTimeout(room.expiryTimer);
      room.expiryTimer = null;
      session.room = room;
      session.kind = 'HOST';
      this.#send(session, MSG.ROOM_RESUMED, { room: room.code, kind: 'HOST', id: HOST_ID, slot: null, pendingPlayer: false, paused });
      this.#snapshot(session, room);
      this.#broadcastRoom(room, session);
      return;
    }

    const member = entry.member;
    this.#replace(member.session, session);
    member.session = session;
    member.connected = true;
    session.room = room;
    session.kind = entry.kind;
    session.member = member;
    if (entry.kind === 'PLAYER') {
      clearTimeout(member.holdTimer);
      member.holdTimer = null;
      member.slotExpiresAtMs = null;
    } else {
      clearTimeout(member.forgetTimer);
    }
    this.#send(session, MSG.ROOM_RESUMED, {
      room: room.code, kind: entry.kind, id: member.id,
      slot: entry.kind === 'PLAYER' ? member.slot : null,
      pendingPlayer: entry.kind === 'SPECTATOR' && member.pendingPlayer, paused,
    });
    this.#snapshot(session, room);
    this.#broadcastRoom(room, session);
  }

  /** An older connection using the same token gets bye REPLACED (messages.md 4.3). */
  #replace(oldSession, newSession) {
    if (!oldSession || oldSession === newSession) return;
    oldSession.room = null;
    oldSession.member = null;
    this.#bye(oldSession, BYE.REPLACED);
  }

  /** Removes a player for good: token revoked, slot freed, roles rebalanced. */
  #removePlayer(room, player) {
    clearTimeout(player.holdTimer);
    this.#tokens.delete(player.token);
    room.players = room.players.filter((p) => p !== player);
    room.roles.removePlayer(player.id, this.#playersView(room));
    if (!room.roles.locked) room.roles.onCountChanged(this.#playersView(room));
    if (player.session) {
      player.session.room = null;
      player.session.member = null;
    }
  }

  #removeSpectator(room, spectator) {
    clearTimeout(spectator.forgetTimer);
    this.#tokens.delete(spectator.token);
    room.spectators = room.spectators.filter((s) => s !== spectator);
    if (spectator.session) {
      spectator.session.room = null;
      spectator.session.member = null;
    }
  }

  #onLeave(session) {
    const room = session.room;
    const member = session.member;
    if (session.kind === 'PLAYER') this.#removePlayer(room, member);
    else this.#removeSpectator(room, member);
    this.#bye(session, BYE.LEFT);
    this.#broadcastRoom(room);
    if (session.kind === 'PLAYER') this.#broadcastRoles(room);
  }

  #onKick(session, d, ctx) {
    const room = session.room;
    const player = room.players.find((p) => p.id === d.playerId);
    if (!player) {
      this.#error(session, ERR.UNKNOWN_PLAYER, ctx);
      return;
    }
    const target = player.session;
    this.#removePlayer(room, player);
    if (target) this.#bye(target, BYE.KICKED);
    this.#broadcastRoom(room);
    this.#broadcastRoles(room);
  }

  #onProfile(session, d, ctx) {
    const room = session.room;
    if (room.phase !== 'LOBBY') {
      this.#error(session, ERR.WRONG_PHASE, ctx);
      return;
    }
    const checked = checkNickname(room.players, d.nickname, session.member.id);
    if (checked.error) {
      this.#error(session, checked.error, ctx, nicknameErrorExtra(checked));
      return;
    }
    session.member.nickname = checked.nickname;
    session.member.avatar = { suitId: d.avatar.suitId, patchId: d.avatar.patchId };
    this.#broadcastRoom(room);
  }

  #onPrefs(session, d) {
    session.member.prefs = { ...DEFAULT_PREFS, ...d.prefs };
    if (session.kind === 'PLAYER') this.#broadcastRoom(session.room);
  }

  #onSettings(session, d, ctx) {
    const room = session.room;
    const patch = d.settings;
    const lobbyOnly = Object.hasOwn(patch, 'roleAssignMode') || Object.hasOwn(patch, 'assistLevel');
    if (lobbyOnly && room.phase !== 'LOBBY') {
      this.#error(session, ERR.SETTING_LOCKED, ctx);
      return;
    }
    const modeChanged = Object.hasOwn(patch, 'roleAssignMode') && patch.roleAssignMode !== room.settings.roleAssignMode;
    room.settings = this.#mergeSettings(room.settings, patch);
    this.#broadcast(room, MSG.SETTINGS_STATE, { settings: structuredClone(room.settings) });
    if (modeChanged) {
      room.roles.clearLobbyChoices();
      this.#broadcastRoles(room);
    }
  }

  // ───────────────────────── roles ─────────────────────────

  /** roles.pick / roles.vote / roles.lock / roles.set / roles.rotate: rules in roles.mjs, then roles.state to everyone. */
  #onRoles(session, t, d, ctx) {
    const room = session.room;
    const failure = applyRolesMessage(t, d, {
      book: room.roles,
      mode: room.settings.roleAssignMode,
      phase: room.phase,
      players: this.#playersView(room),
      senderId: session.member?.id ?? null,
    });
    if (failure) {
      this.#error(session, failure.code, ctx, failure.field ? { field: failure.field } : {});
      return;
    }
    this.#broadcastRoles(room);
  }

  // ───────────────────────── phase, pause, missions ─────────────────────────

  #onPhaseSet(session, d, ctx) {
    const room = session.room;
    const previous = room.phase;
    const transitionOk = d.phase === previous || PHASE_GRAPH[previous]?.includes(d.phase);
    if (!transitionOk || !phaseFieldsValid(d) || d.missionSeq < room.missionSeq) {
      this.#error(session, ERR.INVALID_TRANSITION, ctx);
      return;
    }
    const newMission = d.missionSeq > room.missionSeq;
    room.phase = d.phase;
    room.missionSeq = d.missionSeq;
    room.phaseSet = d;
    if (previous === 'DEBRIEF' && d.phase !== 'DEBRIEF') {
      for (const key of ['debrief.score', 'debrief.awards', 'debrief.facts']) room.sticky.delete(key);
    }
    for (const target of this.#recipients(room, MSG.PHASE_SET, d)) this.#send(target, MSG.PHASE_SET, d);

    let rolesChanged = false;
    if (previous === 'LOBBY' && d.phase !== 'LOBBY' && !room.roles.locked && room.players.length > 0) {
      room.roles.lock(room.settings.roleAssignMode, this.#playersView(room));
      rolesChanged = true;
    } else if (previous !== 'LOBBY' && d.phase === 'LOBBY') {
      room.roles.locked = false;
      rolesChanged = true;
    }
    if (newMission) {
      this.#newMission(room);
      rolesChanged = true;
    }
    if (rolesChanged) this.#broadcastRoles(room);
  }

  /** New-mission reset (messages.md 6): vetoes back, abilities cleared, sticky cache emptied, pending promoted. */
  #newMission(room) {
    for (const p of room.players) p.vetoAvailable = true;
    room.roles.newMission();
    room.sticky.clear();
    this.#promotePending(room);
    this.#broadcastRoom(room);
  }

  #promotePending(room) {
    const pending = room.spectators.filter((s) => s.pendingPlayer).sort((a, b) => a.joinOrder - b.joinOrder);
    for (const spectator of pending) {
      if (room.players.length >= MAX_PLAYERS) break;
      this.#removeSpectator(room, spectator);
      const session = spectator.session;
      const player = this.#addPlayer(room, {
        nickname: spectator.nickname, avatar: spectator.avatar, prefs: spectator.prefs, session, token: spectator.token,
      });
      player.connected = spectator.connected;
      if (session) {
        session.room = room;
        session.kind = 'PLAYER';
        session.member = player;
        this.#send(session, MSG.ROOM_PROMOTED, { id: player.id, slot: player.slot, roles: room.roles.rolesOf(player.id) });
      }
    }
  }

  #pause(room, reason) {
    const now = Date.now();
    if (!room.paused) {
      room.paused = { reason, atMs: now, roomExpiresAtMs: null };
      for (const p of room.players) {
        if (p.holdTimer) {
          clearTimeout(p.holdTimer);
          p.holdTimer = null;
          p.holdRemainingMs = Math.max(0, p.slotExpiresAtMs - now);
        }
      }
    }
    if (reason === 'HOST_DISCONNECTED') {
      room.paused.reason = reason;
      room.paused.roomExpiresAtMs = now + this.#opts.roomHoldMs;
    }
    this.#broadcast(room, MSG.GAME_PAUSED, this.#pausedPayload(room));
    this.#broadcastRoom(room);
  }

  #resume(room) {
    const now = Date.now();
    const pausedForMs = Math.max(0, now - room.paused.atMs);
    room.paused = null;
    for (const p of room.players) {
      if (!p.connected && !p.bot) {
        p.slotExpiresAtMs += pausedForMs;
        this.#startHold(room, p, p.holdRemainingMs);
      }
    }
    this.#broadcast(room, MSG.GAME_RESUMED, { atMs: now, pausedForMs });
    this.#broadcastRoom(room);
  }

  #startHold(room, player, ms) {
    clearTimeout(player.holdTimer);
    player.holdTimer = setTimeout(() => {
      player.holdTimer = null;
      this.#removePlayer(room, player);
      this.#broadcastRoom(room);
      this.#broadcastRoles(room);
    }, ms);
    player.holdTimer.unref?.();
  }

  // ───────────────────────── disconnects and teardown ─────────────────────────

  #onDisconnect(session) {
    const room = session.room;
    if (!room) return;
    session.room = null;
    if (session.kind === 'HOST') {
      if (room.hostSession !== session) return;
      room.hostSession = null;
      this.#pause(room, 'HOST_DISCONNECTED');
      room.expiryTimer = setTimeout(() => this.#destroyRoom(room, BYE.ROOM_EXPIRED), this.#opts.roomHoldMs);
      room.expiryTimer.unref?.();
      return;
    }
    const member = session.member;
    if (!member || member.session !== session) return;
    member.session = null;
    member.connected = false;
    if (session.kind === 'PLAYER') {
      member.slotExpiresAtMs = Date.now() + this.#opts.slotHoldMs;
      member.holdRemainingMs = this.#opts.slotHoldMs;
      if (!room.paused) this.#startHold(room, member, this.#opts.slotHoldMs);
    } else {
      member.forgetTimer = setTimeout(() => {
        this.#removeSpectator(room, member);
        this.#broadcastRoom(room);
      }, this.#opts.slotHoldMs);
      member.forgetTimer.unref?.();
    }
    this.#broadcastRoom(room);
  }

  #clearRoomTimers(room) {
    clearTimeout(room.expiryTimer);
    clearInterval(room.botTimer);
    for (const p of room.players) clearTimeout(p.holdTimer);
    for (const s of room.spectators) clearTimeout(s.forgetTimer);
  }

  /** room.close or expiry: bye to everyone, tokens revoked, room gone. */
  #destroyRoom(room, byeSpec) {
    if (!room || !this.#rooms.has(room.code)) return;
    this.#clearRoomTimers(room);
    this.#rooms.delete(room.code);
    for (const [token, entry] of this.#tokens) if (entry.room === room) this.#tokens.delete(token);
    for (const session of [room.hostSession, ...this.#clientSessions(room)]) {
      if (!session) continue;
      session.room = null;
      session.member = null;
      this.#bye(session, byeSpec);
    }
  }

  // ───────────────────────── bots ─────────────────────────

  /** --bots N: fake players (no socket, always connected) join one by one while joining is possible. */
  #startBots(room) {
    if (this.#opts.bots <= 0) return;
    let joined = 0;
    room.botTimer = setInterval(() => {
      if (!this.#rooms.has(room.code) || joined >= this.#opts.bots || room.players.length >= MAX_PLAYERS) {
        clearInterval(room.botTimer);
        return;
      }
      if (!PLAYER_JOIN_PHASES.includes(room.phase)) return;
      const { nickname, avatar } = botIdentity(joined);
      const checked = checkNickname(room.players, nickname);
      const free = checked.error === ERR.NICK_TAKEN && checked.suggestion ? checked.suggestion : nickname;
      this.#addPlayer(room, { nickname: free, avatar, bot: true });
      joined += 1;
      this.#broadcastRoom(room);
      this.#broadcastRoles(room);
      if (joined >= this.#opts.bots) clearInterval(room.botTimer);
    }, this.#opts.botIntervalMs);
    room.botTimer.unref?.();
  }
}

