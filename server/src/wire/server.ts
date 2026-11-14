// Connection manager: WebSocket bootstrap, handshake, room create/join/resume, and per-connection
// envelope checks (protocol/messages.md §2, §3, §11, §12.1) before handing off to Room.dispatch.
import { randomUUID } from 'node:crypto';
import { WebSocketServer, type WebSocket } from 'ws';
import {
  MESSAGE_META,
  PROTOCOL_VERSION,
  type ByeReason,
  type ClientKind,
  type MessageType,
  type PayloadMap,
} from '../../../protocol/ts/messages.js';
import { isValidRoomCode, generateRoomCode } from '../rooms/roomCode.js';
import { Room } from '../rooms/room.js';
import { attachOrchestration, dispatch, PRE_ROOM_TYPES } from './dispatch.js';
import { byteLength, isKnownType, parseEnvelope } from './envelope.js';
import { errorFields, WsConnection } from './wsConnection.js';
import {
  FRAME_SIZE_LIMIT_BEFORE_HELLO,
  FRAME_SIZE_LIMIT_HOST,
  FRAME_SIZE_LIMIT_PHONE,
  HOST_OVERALL_BUDGET,
  newOverallBudgetState,
  PHONE_OVERALL_BUDGET,
  PER_TYPE_LIMITS,
  reactSendLimit,
  recordMessage,
  type OverallBudgetState,
} from '../limits/messageLimits.js';
import { getPayloadValidator } from './validate.js';
import { newBucket, tryConsume, type TokenBucketState } from '../limits/tokenBucket.js';

const HELLO_TIMEOUT_MS = 5000;
const HANDSHAKE_WINDOW_MS = 30000;
const IDLE_TIMEOUT_MS = 15000;

/** Close codes fixed per `ByeReason`, protocol/messages.md §14 `ByeReason` (4000-4010). */
const BYE_CLOSE_CODES: Record<ByeReason, number> = {
  ROOM_CLOSED: 4000,
  VERSION_MISMATCH: 4001,
  KICKED: 4002,
  REPLACED: 4003,
  ROOM_EXPIRED: 4004,
  HANDSHAKE_TIMEOUT: 4005,
  FLOOD: 4006,
  PROTOCOL_VIOLATION: 4007,
  SERVER_SHUTDOWN: 4008,
  LEFT: 4009,
  IDLE_TIMEOUT: 4010,
};

/** "True when the token is still valid and the client should reconnect" (bye.canResume, §12.3). */
const CAN_RESUME_REASONS = new Set<ByeReason>(['SERVER_SHUTDOWN', 'IDLE_TIMEOUT', 'FLOOD', 'PROTOCOL_VIOLATION']);

function sendBye(conn: { send: WsConnection['send']; close: WsConnection['close'] }, reason: ByeReason): void {
  const closeCode = BYE_CLOSE_CODES[reason];
  conn.send('bye', { reason, closeCode, canResume: CAN_RESUME_REASONS.has(reason) });
  conn.close(closeCode, reason);
}

interface Session {
  conn: WsConnection;
  helloReceived: boolean;
  inRoom: boolean;
  room: Room | null;
  lastSeqIn: number;
  lastFrameAtMs: number;
  overall: OverallBudgetState;
  typeBuckets: Map<string, TokenBucketState>;
  client: ClientKind | null;
}

export interface ServerOptions {
  port: number;
  clientBaseUrl: string;
}

export function startServer(opts: ServerOptions): WebSocketServer {
  const rooms = new Map<string, Room>();
  const wss = new WebSocketServer({ port: opts.port });
  // Housekeeping once a second: slot-hold expiry (3 min) and room expiry (10 min host absence).
  const sweeper = setInterval(() => {
    for (const room of [...rooms.values()]) room.sweep();
  }, 1000);
  wss.on('close', () => {
    clearInterval(sweeper);
    for (const room of rooms.values()) room.stopAllTimers();
  });

  wss.on('connection', (ws: WebSocket) => {
    const conn = new WsConnection(ws, randomUUID());
    const session: Session = {
      conn,
      helloReceived: false,
      inRoom: false,
      room: null,
      lastSeqIn: 0,
      lastFrameAtMs: Date.now(),
      overall: newOverallBudgetState({ nowMs: () => Date.now() }),
      typeBuckets: new Map(),
      client: null,
    };

    const helloTimer = setTimeout(() => {
      if (!session.helloReceived) sendBye(conn, 'HANDSHAKE_TIMEOUT');
    }, HELLO_TIMEOUT_MS);
    const roomTimer = setTimeout(() => {
      if (session.helloReceived && !session.inRoom) sendBye(conn, 'HANDSHAKE_TIMEOUT');
    }, HANDSHAKE_WINDOW_MS);
    const idleInterval = setInterval(() => {
      if (Date.now() - session.lastFrameAtMs > IDLE_TIMEOUT_MS) {
        sendBye(conn, 'IDLE_TIMEOUT');
      }
    }, 2000);

    ws.on('message', (raw: Buffer) => {
      session.lastFrameAtMs = Date.now();
      handleFrame(rooms, opts, session, raw.toString('utf8'));
    });
    ws.on('close', () => {
      clearTimeout(helloTimer);
      clearTimeout(roomTimer);
      clearInterval(idleInterval);
      onDisconnect(session);
    });
  });

  return wss;
}

function onDisconnect(session: Session): void {
  const room = session.room;
  if (!room) return;
  if (session.conn.kind === 'HOST') room.disconnectHost(session.conn);
  else if (session.conn.kind === 'PLAYER' && session.conn.playerId) room.disconnectPlayer(session.conn.playerId, session.conn);
  else if (session.conn.kind === 'SPECTATOR' && session.conn.spectatorId) room.disconnectSpectator(session.conn.spectatorId, session.conn);
}

function sizeLimitFor(session: Session): number {
  if (!session.helloReceived) return FRAME_SIZE_LIMIT_BEFORE_HELLO;
  return session.client === 'HOST' ? FRAME_SIZE_LIMIT_HOST : FRAME_SIZE_LIMIT_PHONE;
}

function handleFrame(rooms: Map<string, Room>, opts: ServerOptions, session: Session, raw: string): void {
  const { conn } = session;
  const bytes = byteLength(raw);
  if (bytes > sizeLimitFor(session)) {
    conn.sendError(errorFields('FRAME_TOO_LARGE', null, null, true));
    sendBye(conn, 'PROTOCOL_VIOLATION');
    return;
  }

  const parsed = parseEnvelope(raw);
  if (!parsed.ok) {
    conn.sendError(errorFields('BAD_ENVELOPE', null, null, true));
    sendBye(conn, 'PROTOCOL_VIOLATION');
    return;
  }
  const { t, seq, d } = parsed.envelope;
  if (seq <= session.lastSeqIn) {
    conn.sendError(errorFields('BAD_ENVELOPE', seq, t, true));
    sendBye(conn, 'PROTOCOL_VIOLATION');
    return;
  }
  session.lastSeqIn = seq;

  const budget = session.client === 'HOST' ? HOST_OVERALL_BUDGET : PHONE_OVERALL_BUDGET;
  const overallResult = recordMessage(session.overall, budget, { nowMs: () => Date.now() }, bytes);
  session.overall = overallResult.state;
  if (overallResult.flood) {
    conn.sendError(errorFields('FLOOD', seq, t, true));
    sendBye(conn, 'FLOOD');
    return;
  }

  if (!session.helloReceived) {
    if (t !== 'hello') {
      conn.sendError(errorFields('HANDSHAKE_REQUIRED', seq, t, true));
      sendBye(conn, 'PROTOCOL_VIOLATION');
      return;
    }
    const helloCheck = getPayloadValidator().check('hello', d);
    if (!helloCheck.ok) {
      conn.sendError(errorFields('BAD_PAYLOAD', seq, t, true, { field: helloCheck.field }));
      sendBye(conn, 'PROTOCOL_VIOLATION');
      return;
    }
    handleHello(session, seq, d as unknown as PayloadMap['hello']);
    return;
  }

  if (!isKnownType(t)) {
    conn.sendError(errorFields('UNKNOWN_TYPE', seq, t, false));
    return;
  }

  const limitConfig = t === 'react.send' ? reactSendLimit(conn.kind === 'SPECTATOR' ? 'SPECTATOR' : 'PLAYER') : PER_TYPE_LIMITS[t];
  if (limitConfig) {
    const bucket = session.typeBuckets.get(t) ?? newBucket(limitConfig, { nowMs: () => Date.now() });
    const result = tryConsume(bucket, limitConfig, { nowMs: () => Date.now() });
    session.typeBuckets.set(t, result.state);
    if (!result.allowed) {
      conn.sendError(errorFields('RATE_LIMITED', seq, t, false, { retryAfterMs: result.retryAfterMs }));
      return;
    }
  }

  const meta = MESSAGE_META[t];
  const senderClass = conn.kind;
  if (!(meta.from as readonly string[]).includes(senderClass)) {
    conn.sendError(errorFields('FORBIDDEN', seq, t, false));
    return;
  }

  if (PRE_ROOM_TYPES.includes(t) && t !== 'hello' && t !== 'clock.ping') {
    if (session.inRoom) {
      conn.sendError(errorFields('ALREADY_IN_ROOM', seq, t, false));
      return;
    }
    const preCheck = getPayloadValidator().check(t, d);
    if (!preCheck.ok) {
      conn.sendError(errorFields('BAD_PAYLOAD', seq, t, false, { field: preCheck.field }));
      return;
    }
    handlePreRoom(rooms, opts, session, seq, t, d);
    return;
  }

  if (t === 'clock.ping') {
    const pingCheck = getPayloadValidator().check(t, d);
    if (!pingCheck.ok) {
      conn.sendError(errorFields('BAD_PAYLOAD', seq, t, false, { field: pingCheck.field }));
      return;
    }
    conn.send('clock.pong', { clientTimeMs: (d as { clientTimeMs?: number }).clientTimeMs ?? 0, serverTimeMs: Date.now() });
    return;
  }

  if (!session.inRoom || !session.room) {
    conn.sendError(errorFields('NOT_IN_ROOM', seq, t, false));
    return;
  }

  const payloadCheck = getPayloadValidator().check(t, d);
  if (!payloadCheck.ok) {
    conn.sendError(errorFields('BAD_PAYLOAD', seq, t, false, { field: payloadCheck.field }));
    return;
  }

  const room = session.room;
  if (meta.pauseBlocked && room.pauseState.paused) {
    conn.sendError(errorFields('PAUSED', seq, t, false));
    return;
  }

  try {
    dispatch(room, conn, t, d, seq);
  } catch (e) {
    const code = e instanceof Error && 'code' in e ? (e as unknown as { code: string }).code : 'INTERNAL';
    const extra = e instanceof Error && 'extra' in e ? (e as unknown as { extra: Record<string, unknown> }).extra : {};
    conn.sendError(errorFields(code as never, seq, t, false, extra));
  }
}

function handleHello(session: Session, seq: number, d: PayloadMap['hello']): void {
  const { conn } = session;
  if (d.protocolVersion !== PROTOCOL_VERSION) {
    conn.sendError(errorFields('VERSION_MISMATCH', seq, 'hello', true, { serverProtocolVersion: PROTOCOL_VERSION }));
    sendBye(conn, 'VERSION_MISMATCH');
    return;
  }
  session.helloReceived = true;
  session.client = d.client;
  conn.send('hello.ok', {
    protocolVersion: PROTOCOL_VERSION,
    serverTimeMs: Date.now(),
    heartbeatMs: 5000,
    idleTimeoutMs: IDLE_TIMEOUT_MS,
    maxFrameBytes: d.client === 'HOST' ? FRAME_SIZE_LIMIT_HOST : FRAME_SIZE_LIMIT_PHONE,
    maxMsgsPerSec: d.client === 'HOST' ? HOST_OVERALL_BUDGET.maxMsgsPerSec : PHONE_OVERALL_BUDGET.maxMsgsPerSec,
    maxBytesPerSec: d.client === 'HOST' ? HOST_OVERALL_BUDGET.maxBytesPerSec : PHONE_OVERALL_BUDGET.maxBytesPerSec,
  });
}

function sendSnapshotEnd(conn: WsConnection, room: Room, lastOutcomeSeq = 0): void {
  conn.send('settings.state', { settings: room.settings });
  conn.send('room.state', room.buildRoomState());
  conn.send('roles.state', room.buildRolesState());
  if (room.pauseState.paused) {
    conn.send('game.paused', {
      reason: room.pauseState.reason!,
      atMs: room.pauseState.pausedAtMs!,
      roomExpiresAtMs: room.pauseState.roomExpiresAtMs,
    });
  }
  for (const m of room.snapshotMessages(conn, lastOutcomeSeq)) conn.send(m.t as never, m.d as never);
  conn.send('snapshot.end', { serverTimeMs: Date.now(), lastOutcomeSeq: room.outcomeLog.at(-1)?.outcomeSeq ?? 0 });
}

function handlePreRoom(rooms: Map<string, Room>, opts: ServerOptions, session: Session, seq: number, t: MessageType, d: Record<string, unknown>): void {
  const { conn } = session;
  if ((t === 'room.create' && session.client !== 'HOST') || (t === 'room.join' && session.client !== 'PHONE')) {
    conn.sendError(errorFields('FORBIDDEN', seq, t, false));
    return;
  }
  if (t === 'room.create') {
    const code = generateRoomCode((c) => rooms.has(c));
    const room = new Room({ code, clientBaseUrl: opts.clientBaseUrl });
    attachOrchestration(room);
    rooms.set(code, room);
    room.onDestroyed = () => rooms.delete(code);
    const created = room.createByHost(conn, (d as unknown as PayloadMap['room.create']).settings);
    session.room = room;
    session.inRoom = true;
    conn.send('room.created', created);
    sendSnapshotEnd(conn, room);
    return;
  }
  if (t === 'room.join') {
    const p = d as unknown as PayloadMap['room.join'];
    const room = rooms.get(p.room);
    if (!room || !isValidRoomCode(p.room)) {
      conn.sendError(errorFields('ROOM_NOT_FOUND', seq, t, false));
      return;
    }
    const buildStarted = room.phase !== null && room.phase.phase !== 'LOBBY' && room.phase.phase !== 'BRIEFING' && room.phase.phase !== 'CONTRACT_VOTE';
    const joined =
      p.as === 'PLAYER'
        ? room.joinPlayer(conn, p.nickname ?? '', p.avatar ?? { suitId: 'suit_default', patchId: 'patch_default' }, p.prefs, buildStarted)
        : room.joinSpectator(conn, p.prefs);
    session.room = room;
    session.inRoom = true;
    conn.send('room.joined', joined);
    sendSnapshotEnd(conn, room);
    return;
  }
  if (t === 'room.resume') {
    const p = d as unknown as PayloadMap['room.resume'];
    const room = rooms.get(p.room);
    if (!room) {
      conn.sendError(errorFields('ROOM_NOT_FOUND', seq, t, false));
      return;
    }
    if (room.isHostToken(p.token)) {
      if (session.client !== 'HOST') {
        conn.sendError(errorFields('FORBIDDEN', seq, t, false));
        return;
      }
      room.resumeHost(conn);
      session.room = room;
      session.inRoom = true;
      conn.send('room.resumed', { room: room.code, kind: 'HOST', id: 'host', slot: null, pendingPlayer: false, paused: room.pauseState.paused });
      sendSnapshotEnd(conn, room, p.lastOutcomeSeq ?? 0);
      return;
    }
    const player = room.findPlayerByToken(p.token);
    if (player) {
      room.resumePlayer(conn, player);
      session.room = room;
      session.inRoom = true;
      conn.send('room.resumed', { room: room.code, kind: 'PLAYER', id: player.id, slot: player.slot, pendingPlayer: false, paused: room.pauseState.paused });
      sendSnapshotEnd(conn, room);
      return;
    }
    const spectator = room.findSpectatorByToken(p.token);
    if (spectator) {
      room.resumeSpectator(conn, spectator);
      session.room = room;
      session.inRoom = true;
      conn.send('room.resumed', {
        room: room.code,
        kind: 'SPECTATOR',
        id: spectator.id,
        slot: null,
        pendingPlayer: spectator.pendingPlayer,
        paused: room.pauseState.paused,
      });
      sendSnapshotEnd(conn, room);
      return;
    }
    conn.sendError(errorFields('TOKEN_INVALID', seq, t, false));
  }
}
