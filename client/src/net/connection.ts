// The one interface the app talks to. Two implementations exist: the real WebSocket client
// (`createWsConnection`) and the in-browser mock room (`createMockConnection`, `?mock=1`).
// Both run the same protocol client (`ProtocolClient`) over a different socket.
import type { ByeReason, Message, MessageType, PayloadMap, RoomJoinPayload } from '@protocol';

/** Message types a phone may send after joining (protocol "Sent by" player / spectator). */
export type ClientSendType = Extract<
  MessageType,
  | 'room.leave'
  | 'player.profile'
  | 'player.prefs'
  | 'roles.pick'
  | 'roles.vote'
  | 'ability.use'
  | 'vote.predict'
  | 'vote.tag'
  | 'vote.cast'
  | 'vote.veto'
  | 'vote.trivia.answer'
  | 'vote.trivia.pick'
  | 'ping.send'
  | 'react.send'
  | 'poll.answer'
  | 'pilot.input'
  | 'pilot.action'
  | 'copilot.action'
  | 'console.callout'
  | 'console.request'
  | 'mg.ready'
  | 'mg.progress'
  | 'mg.action'
  | 'mg.result'
>;

export type ConnPhase =
  /** Nothing started yet. */
  | 'idle'
  /** Socket opening. */
  | 'connecting'
  /** `hello` sent or accepted; no room yet (also while a join was refused and can be retried). */
  | 'handshake'
  /** `room.join` / `room.resume` sent, waiting for the answer. */
  | 'joining'
  /** In the room. */
  | 'open'
  /** Connection lost; waiting to retry. */
  | 'reconnecting'
  /** Stopped for good (see `closeReason`). */
  | 'closed';

export type CloseReason = ByeReason | 'TOKEN_INVALID' | 'ROOM_NOT_FOUND' | 'USER';

export interface ConnStatus {
  phase: ConnPhase;
  /** Reconnect attempt number, 0 while connected. */
  attempt: number;
  /** Server clock minus local clock, milliseconds. */
  offsetMs: number;
  /** Best round-trip time seen on this connection, or null before the first pong. */
  rttMs: number | null;
  /** Why the connection stopped; null unless `phase` is `closed`. */
  closeReason: CloseReason | null;
}

export interface Connection {
  readonly kind: 'ws' | 'mock';
  /** Opens the socket if needed and joins the room. Errors come back as `error` messages. */
  join(req: RoomJoinPayload): void;
  /** Re-attaches with the token kept in sessionStorage. Returns false when there is none. */
  resume(): boolean;
  /** Whether a reconnect token for `room` (or any room) is stored. */
  hasSession(room?: string): boolean;
  /** Leaves the room for good and forgets the token. */
  leave(): void;
  /** Sends one message. Returns false when it could not be sent (not in a room). */
  send<T extends ClientSendType>(t: T, d: PayloadMap[T]): boolean;
  /** Every message received from the server, in order. */
  subscribe(cb: (m: Message) => void): () => void;
  subscribeStatus(cb: (s: ConnStatus) => void): () => void;
  getStatus(): ConnStatus;
  /** Current time on the server clock, milliseconds since the Unix epoch. */
  now(): number;
  dispose(): void;
}

/** Minimal socket surface shared by the browser WebSocket and the mock room. */
export interface SocketLike {
  send(data: string): void;
  close(): void;
  onopen: (() => void) | null;
  onmessage: ((data: string) => void) | null;
  /** Called once when the socket is closed by either side. */
  onclose: ((code: number) => void) | null;
}

export type SocketFactory = () => SocketLike;

/** Where the reconnect token lives (browser sessionStorage; a plain object in tests). */
export interface SessionStore {
  load(): StoredSession | null;
  save(s: StoredSession): void;
  clear(): void;
}

export interface StoredSession {
  room: string;
  token: string;
}

/** Timer functions, injectable so tests can use fake time. */
export interface Clock {
  now(): number;
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

export const systemClock: Clock = {
  now: () => Date.now(),
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
};
