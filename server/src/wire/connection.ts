// Abstract connection the Room talks to — lets Room logic be tested without a real WebSocket.
import type { ErrorCode, MessageType, PayloadMap } from '../../../protocol/ts/messages.js';

export type ConnKind = 'UNJOINED' | 'HOST' | 'PLAYER' | 'SPECTATOR';

export interface ErrorFields {
  code: ErrorCode;
  fatal: boolean;
  re: number | null;
  reT: string | null;
  retryAfterMs?: number;
  field?: string;
  serverProtocolVersion?: number;
  suggestion?: string;
}

export interface Connection {
  readonly connId: string;
  kind: ConnKind;
  playerId: string | null;
  spectatorId: string | null;
  send<T extends MessageType>(t: T, d: PayloadMap[T]): void;
  sendError(d: ErrorFields): void;
  close(code: number, reason: string): void;
}

/** In-memory fake used by tests: records everything sent instead of touching a socket. */
export class FakeConnection implements Connection {
  readonly connId: string;
  kind: ConnKind = 'UNJOINED';
  playerId: string | null = null;
  spectatorId: string | null = null;
  readonly sent: Array<{ t: string; d: unknown }> = [];
  readonly errors: ErrorFields[] = [];
  closed: { code: number; reason: string } | null = null;

  constructor(connId: string) {
    this.connId = connId;
  }

  send<T extends MessageType>(t: T, d: PayloadMap[T]): void {
    this.sent.push({ t, d });
  }

  sendError(d: ErrorFields): void {
    this.errors.push(d);
  }

  close(code: number, reason: string): void {
    this.closed = { code, reason };
  }

  last(t: string): unknown {
    for (let i = this.sent.length - 1; i >= 0; i--) {
      if (this.sent[i]!.t === t) return this.sent[i]!.d;
    }
    return undefined;
  }

  allOf(t: string): unknown[] {
    return this.sent.filter((m) => m.t === t).map((m) => m.d);
  }
}
