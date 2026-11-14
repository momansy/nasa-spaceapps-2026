// Real transport: one WebSocket to the room server, one JSON text frame per message.
import type { Connection, SessionStore, SocketLike, StoredSession } from './connection';
import { ProtocolClient } from './protocolClient';

declare const __APP_VERSION__: string | undefined;

export const APP_VERSION = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '0.1.0';

/**
 * Room-server URL. Set `VITE_ROOM_SERVER_URL` at build time (for example
 * `wss://rooms.example.org/ws`); without it the client expects the server on the page's own
 * host at `/ws` (messages.md section 2: "One WebSocket per device to wss://<server>/ws").
 */
export function roomServerUrl(): string {
  const configured = import.meta.env.VITE_ROOM_SERVER_URL as string | undefined;
  if (configured) return configured;
  const scheme = location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${scheme}//${location.host}/ws`;
}

function browserSocket(url: string): SocketLike {
  const ws = new WebSocket(url);
  const sock: SocketLike = {
    send: (data) => ws.send(data),
    close: () => ws.close(),
    onopen: null,
    onmessage: null,
    onclose: null,
  };
  ws.onopen = () => sock.onopen?.();
  ws.onmessage = (ev) => {
    // Binary frames are a protocol violation; ignore them.
    if (typeof ev.data === 'string') sock.onmessage?.(ev.data);
  };
  let closed = false;
  const closeOnce = (code: number) => {
    if (closed) return;
    closed = true;
    sock.onclose?.(code);
  };
  ws.onclose = (ev) => closeOnce(ev.code);
  ws.onerror = () => {
    if (ws.readyState === WebSocket.CLOSED || ws.readyState === WebSocket.CLOSING) closeOnce(1006);
  };
  return sock;
}

/** The reconnect token lives in sessionStorage: it survives a refresh and dies with the tab. */
export function browserSession(key: string): SessionStore {
  return {
    load() {
      try {
        const raw = sessionStorage.getItem(key);
        if (!raw) return null;
        const s = JSON.parse(raw) as Partial<StoredSession>;
        return typeof s.room === 'string' && typeof s.token === 'string' ? { room: s.room, token: s.token } : null;
      } catch {
        return null;
      }
    },
    save(s) {
      try {
        sessionStorage.setItem(key, JSON.stringify(s));
      } catch {
        /* private mode: the session simply does not survive a refresh */
      }
    },
    clear() {
      try {
        sessionStorage.removeItem(key);
      } catch {
        /* ignore */
      }
    },
  };
}

export function memorySession(): SessionStore {
  let value: StoredSession | null = null;
  return {
    load: () => value,
    save: (s) => {
      value = s;
    },
    clear: () => {
      value = null;
    },
  };
}

export function createWsConnection(lang: string): Connection {
  const url = roomServerUrl();
  const client = new ProtocolClient({
    kind: 'ws',
    socketFactory: () => browserSocket(url),
    session: browserSession('mf.session'),
    appVersion: APP_VERSION,
    lang,
  });
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') client.nudge();
    });
  }
  return client;
}
