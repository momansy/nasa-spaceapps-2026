// Minimal RFC 6455 WebSocket implementation on top of node:crypto and raw sockets.
// Zero npm dependencies. Supports text messages only (binary is rejected with 1003),
// 7/16/64-bit payload lengths, fragmentation, ping/pong and the closing handshake.
// No extensions (permessage-deflate) are negotiated.

import crypto from 'node:crypto';
import { EventEmitter } from 'node:events';

const WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const SUPPORTED_VERSION = '13';

export const OPCODE = Object.freeze({
  CONTINUATION: 0x0,
  TEXT: 0x1,
  BINARY: 0x2,
  CLOSE: 0x8,
  PING: 0x9,
  PONG: 0xa,
});

export const CLOSE_CODE = Object.freeze({
  NORMAL: 1000,
  GOING_AWAY: 1001,
  PROTOCOL_ERROR: 1002,
  UNSUPPORTED_DATA: 1003,
  NO_STATUS: 1005,
  ABNORMAL: 1006,
  INVALID_PAYLOAD: 1007,
  MESSAGE_TOO_BIG: 1009,
});

/** Largest reassembled message the stub accepts. */
export const MAX_MESSAGE_BYTES = 1 << 20;
const MAX_CONTROL_PAYLOAD_BYTES = 125;
const LENGTH_16_BIT_MARKER = 126;
const LENGTH_64_BIT_MARKER = 127;
const MAX_16_BIT_LENGTH = 0xffff;
const MASK_KEY_BYTES = 4;
/** How long to wait for the peer to finish the closing handshake before destroying the socket. */
const CLOSE_LINGER_MS = 1000;

export class WsProtocolError extends Error {
  constructor(closeCode, message) {
    super(message);
    this.name = 'WsProtocolError';
    this.closeCode = closeCode;
  }
}

/** Sec-WebSocket-Accept value for a given Sec-WebSocket-Key. */
export function computeAcceptKey(key) {
  return crypto.createHash('sha1').update(key + WS_GUID).digest('base64');
}

/**
 * Encodes one frame. Server frames are unmasked; pass `maskKey` (4 bytes) to produce a
 * masked client frame (used by the smoke test's raw client).
 */
export function encodeFrame(opcode, payload, { fin = true, maskKey = null } = {}) {
  const length = payload.length;
  let header;
  if (length < LENGTH_16_BIT_MARKER) {
    header = Buffer.alloc(2);
    header[1] = length;
  } else if (length <= MAX_16_BIT_LENGTH) {
    header = Buffer.alloc(4);
    header[1] = LENGTH_16_BIT_MARKER;
    header.writeUInt16BE(length, 2);
  } else {
    header = Buffer.alloc(10);
    header[1] = LENGTH_64_BIT_MARKER;
    header.writeBigUInt64BE(BigInt(length), 2);
  }
  header[0] = (fin ? 0x80 : 0x00) | opcode;
  if (!maskKey) return Buffer.concat([header, payload]);

  header[1] |= 0x80;
  const masked = Buffer.alloc(length);
  for (let i = 0; i < length; i++) masked[i] = payload[i] ^ maskKey[i % MASK_KEY_BYTES];
  return Buffer.concat([header, maskKey, masked]);
}

/** Builds the payload of a close frame: 2-byte code followed by a UTF-8 reason. */
export function encodeClosePayload(code, reason = '') {
  const reasonBytes = Buffer.from(reason, 'utf8').subarray(0, MAX_CONTROL_PAYLOAD_BYTES - 2);
  const payload = Buffer.alloc(2 + reasonBytes.length);
  payload.writeUInt16BE(code, 0);
  reasonBytes.copy(payload, 2);
  return payload;
}

/** Incremental frame parser. `push(chunk)` returns the frames completed by that chunk. */
export class FrameParser {
  constructor({ requireMasked }) {
    this.requireMasked = requireMasked;
    this.buffer = Buffer.alloc(0);
  }

  push(chunk) {
    this.buffer = this.buffer.length === 0 ? chunk : Buffer.concat([this.buffer, chunk]);
    const frames = [];
    for (let frame = this.#readFrame(); frame !== null; frame = this.#readFrame()) {
      frames.push(frame);
    }
    return frames;
  }

  #readFrame() {
    const buf = this.buffer;
    if (buf.length < 2) return null;

    const fin = (buf[0] & 0x80) !== 0;
    const opcode = buf[0] & 0x0f;
    const masked = (buf[1] & 0x80) !== 0;
    let length = buf[1] & 0x7f;
    let offset = 2;

    if ((buf[0] & 0x70) !== 0) {
      throw new WsProtocolError(CLOSE_CODE.PROTOCOL_ERROR, 'reserved bits set');
    }
    if (this.requireMasked && !masked) {
      throw new WsProtocolError(CLOSE_CODE.PROTOCOL_ERROR, 'client frames must be masked');
    }

    const isControl = opcode >= OPCODE.CLOSE;
    if (isControl && (!fin || length > MAX_CONTROL_PAYLOAD_BYTES)) {
      throw new WsProtocolError(CLOSE_CODE.PROTOCOL_ERROR, 'invalid control frame');
    }

    if (length === LENGTH_16_BIT_MARKER) {
      if (buf.length < offset + 2) return null;
      length = buf.readUInt16BE(offset);
      offset += 2;
    } else if (length === LENGTH_64_BIT_MARKER) {
      if (buf.length < offset + 8) return null;
      const bigLength = buf.readBigUInt64BE(offset);
      if (bigLength > BigInt(MAX_MESSAGE_BYTES)) {
        throw new WsProtocolError(CLOSE_CODE.MESSAGE_TOO_BIG, 'frame too large');
      }
      length = Number(bigLength);
      offset += 8;
    }
    if (length > MAX_MESSAGE_BYTES) {
      throw new WsProtocolError(CLOSE_CODE.MESSAGE_TOO_BIG, 'frame too large');
    }

    const maskOffset = offset;
    if (masked) offset += MASK_KEY_BYTES;
    if (buf.length < offset + length) return null;

    const payload = Buffer.from(buf.subarray(offset, offset + length));
    if (masked) {
      for (let i = 0; i < length; i++) payload[i] ^= buf[maskOffset + (i % MASK_KEY_BYTES)];
    }
    this.buffer = buf.subarray(offset + length);
    return { fin, opcode, payload };
  }
}

/**
 * One accepted WebSocket connection.
 * Events: 'text' (string), 'close' (code, reason), 'socketError' (Error).
 */
export class WebSocketConnection extends EventEmitter {
  #socket;
  #parser = new FrameParser({ requireMasked: true });
  #fragments = null;
  #fragmentBytes = 0;
  #closeSent = false;
  #closed = false;
  #decoder = new TextDecoder('utf-8', { fatal: true });

  constructor(socket) {
    super();
    this.#socket = socket;
  }

  get isOpen() {
    return !this.#closed && !this.#closeSent;
  }

  /** Starts reading. Call after attaching listeners; `head` is any data read past the handshake. */
  start(head) {
    this.#socket.on('data', (chunk) => this.#onData(chunk));
    this.#socket.on('error', (err) => this.emit('socketError', err));
    this.#socket.on('close', () => this.#finish(CLOSE_CODE.ABNORMAL, ''));
    if (head && head.length > 0) this.#onData(head);
  }

  /** Sends one unfragmented text message. Returns false when the connection is not open. */
  sendText(text) {
    if (!this.isOpen) return false;
    this.#socket.write(encodeFrame(OPCODE.TEXT, Buffer.from(text, 'utf8')));
    return true;
  }

  /** Starts the closing handshake; the socket is destroyed if the peer does not answer in time. */
  close(code = CLOSE_CODE.NORMAL, reason = '') {
    if (this.#closed || this.#closeSent) return;
    this.#sendClose(code, reason);
    setTimeout(() => this.#socket.destroy(), CLOSE_LINGER_MS).unref();
  }

  #sendClose(code, reason) {
    this.#closeSent = true;
    if (!this.#socket.destroyed) {
      this.#socket.write(encodeFrame(OPCODE.CLOSE, encodeClosePayload(code, reason)));
    }
  }

  #onData(chunk) {
    if (this.#closed) return;
    try {
      for (const frame of this.#parser.push(chunk)) {
        this.#onFrame(frame);
        if (this.#closed) return;
      }
    } catch (err) {
      if (!(err instanceof WsProtocolError)) throw err;
      this.#fail(err.closeCode, err.message);
    }
  }

  #onFrame({ fin, opcode, payload }) {
    switch (opcode) {
      case OPCODE.TEXT:
        if (this.#fragments !== null) {
          throw new WsProtocolError(CLOSE_CODE.PROTOCOL_ERROR, 'expected continuation frame');
        }
        this.#fragments = [];
        this.#fragmentBytes = 0;
        this.#appendFragment(payload, fin);
        return;
      case OPCODE.CONTINUATION:
        if (this.#fragments === null) {
          throw new WsProtocolError(CLOSE_CODE.PROTOCOL_ERROR, 'unexpected continuation frame');
        }
        this.#appendFragment(payload, fin);
        return;
      case OPCODE.BINARY:
        throw new WsProtocolError(CLOSE_CODE.UNSUPPORTED_DATA, 'binary messages are not supported');
      case OPCODE.PING:
        if (!this.#closeSent) this.#socket.write(encodeFrame(OPCODE.PONG, payload));
        return;
      case OPCODE.PONG:
        return;
      case OPCODE.CLOSE:
        this.#onCloseFrame(payload);
        return;
      default:
        throw new WsProtocolError(CLOSE_CODE.PROTOCOL_ERROR, `unknown opcode ${opcode}`);
    }
  }

  #appendFragment(payload, fin) {
    this.#fragmentBytes += payload.length;
    if (this.#fragmentBytes > MAX_MESSAGE_BYTES) {
      throw new WsProtocolError(CLOSE_CODE.MESSAGE_TOO_BIG, 'message too large');
    }
    this.#fragments.push(payload);
    if (!fin) return;

    const message = Buffer.concat(this.#fragments);
    this.#fragments = null;
    let text;
    try {
      text = this.#decoder.decode(message);
    } catch (err) {
      throw new WsProtocolError(CLOSE_CODE.INVALID_PAYLOAD, `invalid UTF-8: ${err.message}`);
    }
    this.emit('text', text);
  }

  #onCloseFrame(payload) {
    const code = payload.length >= 2 ? payload.readUInt16BE(0) : CLOSE_CODE.NO_STATUS;
    const reason = payload.length > 2 ? payload.subarray(2).toString('utf8') : '';
    if (!this.#closeSent) {
      this.#sendClose(payload.length >= 2 ? code : CLOSE_CODE.NORMAL, '');
    }
    this.#socket.end();
    this.#finish(code, reason);
  }

  #fail(code, reason) {
    if (!this.#closeSent) this.#sendClose(code, reason);
    this.#socket.end();
    setTimeout(() => this.#socket.destroy(), CLOSE_LINGER_MS).unref();
    this.#finish(code, reason);
  }

  #finish(code, reason) {
    if (this.#closed) return;
    this.#closed = true;
    this.emit('close', code, reason);
  }
}

/**
 * Completes the opening handshake for an HTTP upgrade request.
 * Returns a WebSocketConnection (call `start(head)` after wiring listeners) or null when the
 * request was not a valid WebSocket upgrade (a 400 response has then been written).
 */
export function acceptUpgrade(req, socket) {
  const key = req.headers['sec-websocket-key'];
  const upgrade = String(req.headers.upgrade || '').toLowerCase();
  const version = req.headers['sec-websocket-version'];

  if (req.method !== 'GET' || upgrade !== 'websocket' || !key || version !== SUPPORTED_VERSION) {
    socket.end(
      'HTTP/1.1 400 Bad Request\r\n' +
        `Sec-WebSocket-Version: ${SUPPORTED_VERSION}\r\n` +
        'Connection: close\r\n\r\n',
    );
    return null;
  }

  socket.write(
    'HTTP/1.1 101 Switching Protocols\r\n' +
      'Upgrade: websocket\r\n' +
      'Connection: Upgrade\r\n' +
      `Sec-WebSocket-Accept: ${computeAcceptKey(key)}\r\n\r\n`,
  );
  socket.setNoDelay(true);
  return new WebSocketConnection(socket);
}
