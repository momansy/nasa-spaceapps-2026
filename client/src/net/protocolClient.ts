// Protocol client: the envelope, the handshake, join / resume, the heartbeat with the server
// clock offset, and reconnecting with backoff (protocol/messages.md sections 2 to 4).
import { PROTOCOL_VERSION } from '@protocol';
import type { Envelope, Message, MessageType, MgResultPayload, PayloadMap, RoomJoinPayload } from '@protocol';
import {
  systemClock,
  type ClientSendType,
  type Clock,
  type CloseReason,
  type Connection,
  type ConnStatus,
  type SessionStore,
  type SocketFactory,
  type SocketLike,
} from './connection';

/** Reconnect delays: 0.5 s, 1 s, 2 s, 4 s, then every 5 s (messages.md 3.5). */
export const BACKOFF_MS = [500, 1000, 2000, 4000, 5000] as const;
/** A client that gets no `clock.pong` for this long closes and reconnects (messages.md 3.4). */
export const PONG_TIMEOUT_MS = 10_000;
const BURST_PINGS = 3;
const BURST_GAP_MS = 200;

export interface ProtocolClientOptions {
  kind: 'ws' | 'mock';
  socketFactory: SocketFactory;
  session: SessionStore;
  appVersion: string;
  lang?: string;
  clock?: Clock;
}

type Intent = { kind: 'join'; payload: RoomJoinPayload } | { kind: 'resume'; room: string; token: string };

export class ProtocolClient implements Connection {
  readonly kind: 'ws' | 'mock';
  private readonly opts: ProtocolClientOptions;
  private readonly clock: Clock;
  private socket: SocketLike | null = null;
  private seq = 0;
  private intent: Intent | null = null;
  private status: ConnStatus = { phase: 'idle', attempt: 0, offsetMs: 0, rttMs: null, closeReason: null };
  private listeners = new Set<(m: Message) => void>();
  private statusListeners = new Set<(s: ConnStatus) => void>();
  private heartbeatMs = 5000;
  private heartbeatTimer: unknown = null;
  private retryTimer: unknown = null;
  private burstTimers: unknown[] = [];
  private lastPongAt = 0;
  /** Set once the server said the connection must not be retried. */
  private stopped = false;
  private byeCanResume = false;
  /** A minigame result that could not be delivered yet (not connected, or refused with PAUSED). */
  private pendingResult: MgResultPayload | null = null;
  private lastResult: { seq: number; payload: MgResultPayload } | null = null;
  private disposed = false;

  constructor(opts: ProtocolClientOptions) {
    this.opts = opts;
    this.kind = opts.kind;
    this.clock = opts.clock ?? systemClock;
  }

  // ───────────── public API ─────────────

  join(req: RoomJoinPayload): void {
    this.intent = { kind: 'join', payload: req };
    this.stopped = false;
    this.cancelRetry();
    if (this.socket && this.status.phase === 'handshake') {
      this.sendRaw('room.join', req);
      this.setStatus({ phase: 'joining' });
      return;
    }
    this.openSocket(0);
  }

  resume(): boolean {
    const s = this.opts.session.load();
    if (!s) return false;
    this.intent = { kind: 'resume', room: s.room, token: s.token };
    this.stopped = false;
    this.cancelRetry();
    this.openSocket(0);
    return true;
  }

  hasSession(room?: string): boolean {
    const s = this.opts.session.load();
    return !!s && (!room || s.room === room);
  }

  leave(): void {
    if (this.status.phase === 'open') this.sendRaw('room.leave', {});
    this.opts.session.clear();
    this.intent = null;
    this.stop('USER');
  }

  send<T extends ClientSendType>(t: T, d: PayloadMap[T]): boolean {
    if (t === 'mg.result') {
      const payload = d as MgResultPayload;
      if (this.status.phase !== 'open') {
        this.pendingResult = payload;
        return false;
      }
      const seq = this.sendRaw(t, d);
      this.lastResult = seq ? { seq, payload } : null;
      return seq > 0;
    }
    if (this.status.phase !== 'open') return false;
    return this.sendRaw(t, d) > 0;
  }

  subscribe(cb: (m: Message) => void): () => void {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  }

  subscribeStatus(cb: (s: ConnStatus) => void): () => void {
    this.statusListeners.add(cb);
    return () => {
      this.statusListeners.delete(cb);
    };
  }

  getStatus(): ConnStatus {
    return this.status;
  }

  now(): number {
    return this.clock.now() + this.status.offsetMs;
  }

  dispose(): void {
    this.disposed = true;
    this.cancelRetry();
    this.stopHeartbeat();
    this.dropSocket();
    this.listeners.clear();
    this.statusListeners.clear();
  }

  /** Reconnects at once when the page becomes visible again and the socket is gone. */
  nudge(): void {
    if (this.status.phase === 'reconnecting') {
      this.cancelRetry();
      this.openSocket(this.status.attempt);
    }
  }

  // ───────────── socket ─────────────

  private openSocket(attempt: number) {
    if (this.disposed) return;
    this.dropSocket();
    this.seq = 0;
    this.byeCanResume = false;
    this.setStatus({ phase: attempt > 0 ? 'reconnecting' : 'connecting', attempt, rttMs: null, closeReason: null });
    let socket: SocketLike;
    try {
      socket = this.opts.socketFactory();
    } catch {
      this.scheduleRetry();
      return;
    }
    this.socket = socket;
    socket.onopen = () => {
      if (this.socket !== socket) return;
      this.sendRaw('hello', {
        protocolVersion: PROTOCOL_VERSION,
        client: 'PHONE',
        appVersion: this.opts.appVersion,
        ...(this.opts.lang ? { lang: this.opts.lang } : {}),
      });
      this.setStatus({ phase: 'handshake' });
    };
    socket.onmessage = (data) => {
      if (this.socket !== socket) return;
      this.onFrame(data);
    };
    socket.onclose = () => {
      if (this.socket !== socket) return;
      this.socket = null;
      this.stopHeartbeat();
      this.onClosed();
    };
  }

  private dropSocket() {
    const s = this.socket;
    if (!s) return;
    this.socket = null;
    s.onopen = s.onmessage = s.onclose = null;
    try {
      s.close();
    } catch {
      /* already closed */
    }
  }

  private sendRaw<T extends MessageType>(t: T, d: PayloadMap[T]): number {
    if (!this.socket) return 0;
    const env: Envelope<T> = { t, seq: ++this.seq, d };
    try {
      this.socket.send(JSON.stringify(env));
    } catch {
      return 0;
    }
    return env.seq;
  }

  private onClosed() {
    if (this.stopped && !this.byeCanResume) {
      this.setStatus({ phase: 'closed' });
      return;
    }
    // After a successful join, a reconnect always resumes with the stored token.
    const s = this.opts.session.load();
    if (s) this.intent = { kind: 'resume', room: s.room, token: s.token };
    if (!this.intent) {
      this.setStatus({ phase: 'closed', closeReason: this.status.closeReason });
      return;
    }
    this.scheduleRetry();
  }

  private scheduleRetry() {
    const attempt = this.status.attempt + 1;
    const delay = BACKOFF_MS[Math.min(attempt - 1, BACKOFF_MS.length - 1)]!;
    this.setStatus({ phase: 'reconnecting', attempt });
    this.cancelRetry();
    this.retryTimer = this.clock.setTimeout(() => {
      this.retryTimer = null;
      this.openSocket(attempt);
    }, delay);
  }

  private cancelRetry() {
    if (this.retryTimer != null) {
      this.clock.clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
  }

  private stop(reason: CloseReason) {
    this.stopped = true;
    this.byeCanResume = false;
    this.cancelRetry();
    this.stopHeartbeat();
    this.dropSocket();
    this.setStatus({ phase: 'closed', attempt: 0, closeReason: reason });
  }

  // ───────────── frames ─────────────

  private onFrame(data: string) {
    let msg: Message;
    try {
      const parsed = JSON.parse(data) as Partial<Envelope>;
      if (!parsed || typeof parsed.t !== 'string' || typeof parsed.d !== 'object' || parsed.d === null) return;
      msg = parsed as Message;
    } catch {
      return;
    }

    switch (msg.t) {
      case 'hello.ok': {
        this.heartbeatMs = msg.d.heartbeatMs > 0 ? msg.d.heartbeatMs : 5000;
        // First estimate without a round trip; the pings below refine it.
        this.setStatus({ offsetMs: msg.d.serverTimeMs - this.clock.now() });
        this.startHeartbeat();
        if (this.intent?.kind === 'join') {
          this.sendRaw('room.join', this.intent.payload);
          this.setStatus({ phase: 'joining' });
        } else if (this.intent?.kind === 'resume') {
          this.sendRaw('room.resume', { room: this.intent.room, token: this.intent.token });
          this.setStatus({ phase: 'joining' });
        }
        break;
      }
      case 'clock.pong': {
        const now = this.clock.now();
        this.lastPongAt = now;
        const rtt = Math.max(0, now - msg.d.clientTimeMs);
        // Keep the sample with the smallest round trip (messages.md `clock.ping`).
        if (this.status.rttMs == null || rtt <= this.status.rttMs) {
          this.setStatus({ rttMs: rtt, offsetMs: msg.d.serverTimeMs - (msg.d.clientTimeMs + rtt / 2) });
        }
        return; // not interesting to the app
      }
      case 'room.joined': {
        this.opts.session.save({ room: msg.d.room, token: msg.d.token });
        this.intent = { kind: 'resume', room: msg.d.room, token: msg.d.token };
        this.setStatus({ phase: 'open', attempt: 0 });
        break;
      }
      case 'room.resumed': {
        this.setStatus({ phase: 'open', attempt: 0 });
        break;
      }
      case 'snapshot.end': {
        if (this.pendingResult && this.status.phase === 'open') {
          const p = this.pendingResult;
          this.pendingResult = null;
          const seq = this.sendRaw('mg.result', p);
          this.lastResult = seq ? { seq, payload: p } : null;
        }
        break;
      }
      case 'game.resumed': {
        // A result refused with PAUSED is sent again once the host is back (messages.md 10).
        if (this.pendingResult && this.status.phase === 'open') {
          const p = this.pendingResult;
          this.pendingResult = null;
          const seq = this.sendRaw('mg.result', p);
          this.lastResult = seq ? { seq, payload: p } : null;
        }
        break;
      }
      case 'error': {
        const { code } = msg.d;
        if (code === 'PAUSED' && msg.d.reT === 'mg.result' && this.lastResult && msg.d.re === this.lastResult.seq) {
          this.pendingResult = this.lastResult.payload;
        }
        if (this.status.phase === 'joining') {
          if (this.intent?.kind === 'resume' && (code === 'TOKEN_INVALID' || code === 'ROOM_NOT_FOUND')) {
            // The seat is gone: forget the token and stop (messages.md 3.5).
            this.opts.session.clear();
            this.intent = null;
            this.emit(msg);
            this.stop(code);
            return;
          }
          if (this.intent?.kind === 'join' && !msg.d.fatal) {
            // The join was refused (nickname, room code). The socket stays open for a retry.
            this.intent = null;
            this.setStatus({ phase: 'handshake' });
          }
        }
        if (code === 'VERSION_MISMATCH') {
          this.stopped = true;
          this.setStatus({ closeReason: 'VERSION_MISMATCH' });
        }
        break;
      }
      case 'bye': {
        this.byeCanResume = msg.d.canResume;
        if (!msg.d.canResume) {
          this.stopped = true;
          if (msg.d.reason !== 'REPLACED') {
            this.opts.session.clear();
            this.intent = null;
          }
        }
        this.setStatus({ closeReason: msg.d.reason });
        break;
      }
      default:
        break;
    }
    this.emit(msg);
  }

  private emit(msg: Message) {
    this.listeners.forEach((l) => l(msg));
  }

  // ───────────── heartbeat and clock ─────────────

  private ping() {
    this.sendRaw('clock.ping', { clientTimeMs: this.clock.now() });
  }

  private startHeartbeat() {
    this.stopHeartbeat();
    this.lastPongAt = this.clock.now();
    // Three probes 200 ms apart right after hello.ok, then one per heartbeat interval.
    for (let i = 0; i < BURST_PINGS; i++) {
      this.burstTimers.push(this.clock.setTimeout(() => this.ping(), i * BURST_GAP_MS));
    }
    const tick = () => {
      if (!this.socket) return;
      if (this.clock.now() - this.lastPongAt > PONG_TIMEOUT_MS) {
        // Silent connection: close it ourselves and go through the reconnect path.
        const s = this.socket;
        this.socket = null;
        s.onopen = s.onmessage = s.onclose = null;
        try {
          s.close();
        } catch {
          /* ignore */
        }
        this.stopHeartbeat();
        this.onClosed();
        return;
      }
      this.ping();
      this.heartbeatTimer = this.clock.setTimeout(tick, this.heartbeatMs);
    };
    this.heartbeatTimer = this.clock.setTimeout(tick, this.heartbeatMs);
  }

  private stopHeartbeat() {
    if (this.heartbeatTimer != null) this.clock.clearTimeout(this.heartbeatTimer);
    this.heartbeatTimer = null;
    this.burstTimers.forEach((h) => this.clock.clearTimeout(h));
    this.burstTimers = [];
  }

  private setStatus(patch: Partial<ConnStatus>) {
    const next = { ...this.status, ...patch };
    const same = (Object.keys(next) as Array<keyof ConnStatus>).every((k) => next[k] === this.status[k]);
    if (same) return;
    this.status = next;
    this.statusListeners.forEach((l) => l(next));
  }
}
