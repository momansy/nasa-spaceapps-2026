// Wraps a real `ws` WebSocket as a Connection (protocol/messages.md §2 envelope, §3 lifecycle).
import type { WebSocket } from 'ws';
import type { ErrorCode, MessageType, PayloadMap } from '../../../protocol/ts/messages.js';
import type { Connection, ConnKind, ErrorFields } from './connection.js';
import { encodeEnvelope } from './envelope.js';

export class WsConnection implements Connection {
  readonly connId: string;
  kind: ConnKind = 'UNJOINED';
  playerId: string | null = null;
  spectatorId: string | null = null;
  private outSeq = 0;
  closedAlready = false;

  constructor(
    public readonly ws: WebSocket,
    connId: string,
  ) {
    this.connId = connId;
  }

  send<T extends MessageType>(t: T, d: PayloadMap[T]): void {
    if (this.ws.readyState !== this.ws.OPEN) return;
    this.outSeq += 1;
    this.ws.send(encodeEnvelope(t, this.outSeq, d));
  }

  sendError(d: ErrorFields): void {
    this.send('error' as never, d as never);
  }

  close(code: number, reason: string): void {
    if (this.closedAlready) return;
    this.closedAlready = true;
    try {
      this.ws.close(code, reason);
    } catch {
      // socket already gone
    }
  }
}

export function errorFields(code: ErrorCode, re: number | null, reT: string | null, fatal: boolean, extra: Partial<ErrorFields> = {}): ErrorFields {
  return { code, fatal, re, reT, ...extra };
}
