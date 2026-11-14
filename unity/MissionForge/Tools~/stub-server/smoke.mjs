#!/usr/bin/env node
// Dependency-free smoke test for the stub room server.
// Starts server.mjs on a free port and exercises the provisional protocol with Node's
// built-in WebSocket client plus a raw TCP client for the framing edge cases.
// Prints PASS/FAIL lines and exits non-zero when anything fails.

import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MSG, ERR, ROLES, ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH } from './lib/protocol.mjs';
import { FrameParser, OPCODE, computeAcceptKey, encodeClosePayload, encodeFrame } from './lib/websocket.mjs';

const SERVER_SCRIPT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'server.mjs');
const STEP_TIMEOUT_MS = 3000;
const SERVER_START_TIMEOUT_MS = 5000;
const SIMULATED_PLAYERS = 3;
const SIMULATED_ROLES = 2;
const SIMULATE_INTERVAL_MS = 40;
const BIG_PAYLOAD_CHARS = 70_000;
const ROOM_CODE_PATTERN = new RegExp(`^[${ROOM_CODE_ALPHABET}]{${ROOM_CODE_LENGTH}}$`);

let failures = 0;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertEqual(actual, expected, label) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  assert(a === e, `${label}: expected ${e}, got ${a}`);
}

async function step(name, fn) {
  try {
    await fn();
    console.log(`PASS ${name}`);
  } catch (err) {
    failures += 1;
    console.log(`FAIL ${name}: ${err.message}`);
  }
}

function withTimeout(promise, label, ms = STEP_TIMEOUT_MS) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`timed out waiting for ${label}`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/** Starts the stub and resolves once it printed "LISTENING <port>". */
function startServer(extraArgs = []) {
  const child = spawn(process.execPath, [SERVER_SCRIPT, '--port', '0', ...extraArgs], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stderr = '';
  child.stderr.on('data', (chunk) => { stderr += chunk; });

  const listening = new Promise((resolve, reject) => {
    let stdout = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
      const match = /^LISTENING (\d+)$/m.exec(stdout);
      if (match) resolve(Number(match[1]));
    });
    child.on('exit', (code) => reject(new Error(`server exited early (code ${code}): ${stderr}`)));
    child.on('error', reject);
  });

  const stop = () =>
    new Promise((resolve) => {
      if (child.exitCode !== null || child.signalCode !== null) return resolve();
      child.once('exit', resolve);
      child.kill('SIGKILL');
    });

  return withTimeout(listening, 'LISTENING line', SERVER_START_TIMEOUT_MS).then(
    (port) => ({ port, stop }),
    async (err) => {
      await stop();
      throw err;
    },
  );
}

/** Envelope-aware wrapper around the built-in WebSocket client. */
class TestClient {
  #ws;
  #inbox = [];
  #waiters = [];
  #seq = 0;

  static async connect(port) {
    const client = new TestClient();
    await client.#open(`ws://127.0.0.1:${port}`);
    return client;
  }

  #open(url) {
    this.#ws = new WebSocket(url);
    this.#ws.addEventListener('message', (event) => {
      this.#inbox.push(JSON.parse(event.data));
      this.#drain();
    });
    this.closed = new Promise((resolve) => {
      this.#ws.addEventListener('close', (event) => resolve({ code: event.code, reason: event.reason }));
    });
    const opened = new Promise((resolve, reject) => {
      this.#ws.addEventListener('open', resolve);
      this.#ws.addEventListener('error', () => reject(new Error(`could not connect to ${url}`)));
    });
    return withTimeout(opened, `connection to ${url}`);
  }

  #drain() {
    for (let w = 0; w < this.#waiters.length; ) {
      const waiter = this.#waiters[w];
      const index = this.#inbox.findIndex(waiter.predicate);
      if (index < 0) {
        w += 1;
        continue;
      }
      const [envelope] = this.#inbox.splice(index, 1);
      this.#waiters.splice(w, 1);
      waiter.resolve(envelope);
    }
  }

  send(type, data = {}) {
    this.#seq += 1;
    this.#ws.send(JSON.stringify({ t: type, seq: this.#seq, d: data }));
    return this.#seq;
  }

  sendRaw(text) {
    this.#ws.send(text);
  }

  /** Resolves with the next unread envelope of `type` that satisfies `predicate`. */
  next(type, predicate = () => true) {
    const waiting = new Promise((resolve) => {
      this.#waiters.push({ predicate: (env) => env.t === type && predicate(env.d), resolve });
    });
    this.#drain();
    return withTimeout(waiting, `"${type}"`);
  }

  async close() {
    this.#ws.close(1000, 'smoke done');
    return withTimeout(this.closed, 'socket close');
  }
}

/** Raw TCP WebSocket client used to test fragmentation, control frames and masking rules. */
class RawClient {
  #socket;
  #parser = new FrameParser({ requireMasked: false });
  #frames = [];
  #waiters = [];

  static async connect(port) {
    const client = new RawClient();
    await client.#handshake(port);
    return client;
  }

  #handshake(port) {
    const key = crypto.randomBytes(16).toString('base64');
    const done = new Promise((resolve, reject) => {
      let buffered = Buffer.alloc(0);
      const socket = net.connect(port, '127.0.0.1');
      this.#socket = socket;
      socket.on('error', reject);
      socket.on('connect', () => {
        socket.write(
          'GET / HTTP/1.1\r\nHost: 127.0.0.1\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n' +
            `Sec-WebSocket-Key: ${key}\r\nSec-WebSocket-Version: 13\r\n\r\n`,
        );
      });
      const onHandshakeData = (chunk) => {
        buffered = Buffer.concat([buffered, chunk]);
        const end = buffered.indexOf('\r\n\r\n');
        if (end < 0) return;
        socket.off('data', onHandshakeData);
        const head = buffered.subarray(0, end).toString('latin1');
        if (!head.startsWith('HTTP/1.1 101') || !head.includes(`Sec-WebSocket-Accept: ${computeAcceptKey(key)}`)) {
          reject(new Error(`bad handshake response: ${head}`));
          return;
        }
        socket.on('data', (data) => this.#onFrames(data));
        this.#onFrames(buffered.subarray(end + 4));
        resolve();
      };
      socket.on('data', onHandshakeData);
    });
    return withTimeout(done, 'raw handshake');
  }

  #onFrames(chunk) {
    if (chunk.length === 0) return;
    this.#frames.push(...this.#parser.push(chunk));
    while (this.#waiters.length > 0 && this.#frames.length > 0) {
      this.#waiters.shift()(this.#frames.shift());
    }
  }

  sendFrame(opcode, payload, { fin = true, masked = true } = {}) {
    const maskKey = masked ? crypto.randomBytes(4) : null;
    this.#socket.write(encodeFrame(opcode, Buffer.from(payload), { fin, maskKey }));
  }

  nextFrame() {
    if (this.#frames.length > 0) return Promise.resolve(this.#frames.shift());
    return withTimeout(new Promise((resolve) => this.#waiters.push(resolve)), 'raw frame');
  }

  destroy() {
    this.#socket.destroy();
  }
}

async function runRoomFlow(port) {
  let host;
  let phone;
  let code;
  let hostToken;

  await step('host connects', async () => {
    host = await TestClient.connect(port);
  });

  await step('room.create -> room.created with a 4-letter code and host token', async () => {
    host.send(MSG.ROOM_CREATE, { client: 'host', version: 1 });
    const created = await host.next(MSG.ROOM_CREATED);
    code = created.d.code;
    hostToken = created.d.hostToken;
    assert(ROOM_CODE_PATTERN.test(code), `room code "${code}" does not match ${ROOM_CODE_PATTERN}`);
    assert(typeof hostToken === 'string' && hostToken.length >= 16, 'hostToken missing');
    assertEqual(created.seq, 1, 'first server seq');
  });

  await step('host receives the initial room.state (LOBBY, no players, default settings)', async () => {
    const state = (await host.next(MSG.ROOM_STATE)).d;
    assertEqual(state.code, code, 'state.code');
    assertEqual(state.phase, 'LOBBY', 'state.phase');
    assertEqual(state.players, [], 'state.players');
    assertEqual(
      state.settings,
      { roleMode: 'random', assist: 'cadet', voteTimerS: 30, hiddenTallies: false },
      'state.settings',
    );
  });

  await step('room.join -> room.joined, then room.state to host and phone', async () => {
    phone = await TestClient.connect(port);
    phone.send(MSG.ROOM_JOIN, { code: code.toLowerCase(), nickname: '  Nova ', avatar: 'astro_03' });
    const joined = (await phone.next(MSG.ROOM_JOINED)).d;
    assertEqual(joined.playerId, 'p1', 'playerId');
    assert(typeof joined.token === 'string' && joined.token.length >= 16, 'player token missing');

    const expectedPlayer = {
      id: 'p1', nickname: 'Nova', avatar: 'astro_03', role: ROLES[0], connected: true, spectator: false,
    };
    const hostState = (await host.next(MSG.ROOM_STATE)).d;
    assertEqual(hostState.players, [expectedPlayer], 'host players');
    const phoneState = (await phone.next(MSG.ROOM_STATE)).d;
    assertEqual(phoneState.players, [expectedPlayer], 'phone players');
  });

  await step('second joiner gets the next role in order', async () => {
    const second = await TestClient.connect(port);
    second.send(MSG.ROOM_JOIN, { code, nickname: 'Orion', avatar: 'not a valid avatar!' });
    await second.next(MSG.ROOM_JOINED);
    const state = (await host.next(MSG.ROOM_STATE, (d) => d.players.length === 2)).d;
    assertEqual(state.players[1].role, ROLES[1], 'second role');
    assertEqual(state.players[1].avatar, 'astro_01', 'fallback avatar');
    await second.close();
    const after = (await host.next(MSG.ROOM_STATE, (d) => d.players[1].connected === false)).d;
    assertEqual(after.players.length, 2, 'dropped player stays listed');
  });

  await step('join errors: unknown room and invalid nickname', async () => {
    const stranger = await TestClient.connect(port);
    stranger.send(MSG.ROOM_JOIN, { code: 'ZZZZ', nickname: 'Vega', avatar: 'astro_02' });
    assertEqual((await stranger.next(MSG.ERROR)).d.code, ERR.ROOM_NOT_FOUND, 'error code');
    stranger.send(MSG.ROOM_JOIN, { code, nickname: '   ', avatar: 'astro_02' });
    assertEqual((await stranger.next(MSG.ERROR)).d.code, ERR.INVALID_NICKNAME, 'error code');
    await stranger.close();
  });

  await step('room.settings (partial) is merged and broadcast', async () => {
    host.send(MSG.ROOM_SETTINGS, { voteTimerS: 45, hiddenTallies: true });
    const expected = { roleMode: 'random', assist: 'cadet', voteTimerS: 45, hiddenTallies: true };
    assertEqual((await host.next(MSG.ROOM_STATE, (d) => d.settings.voteTimerS === 45)).d.settings, expected, 'host');
    assertEqual((await phone.next(MSG.ROOM_STATE, (d) => d.settings.voteTimerS === 45)).d.settings, expected, 'phone');
  });

  await step('room.settings is rejected for invalid values and for non-hosts', async () => {
    host.send(MSG.ROOM_SETTINGS, { assist: 'god_mode' });
    assertEqual((await host.next(MSG.ERROR)).d.code, ERR.INVALID_SETTINGS, 'invalid value');
    phone.send(MSG.ROOM_SETTINGS, { voteTimerS: 10 });
    assertEqual((await phone.next(MSG.ERROR)).d.code, ERR.NOT_HOST, 'non-host');
  });

  await step('phase.set broadcasts the new phase', async () => {
    host.send(MSG.PHASE_SET, { phase: 'BRIEFING' });
    assertEqual((await host.next(MSG.ROOM_STATE, (d) => d.phase === 'BRIEFING')).d.phase, 'BRIEFING', 'host');
    assertEqual((await phone.next(MSG.ROOM_STATE, (d) => d.phase === 'BRIEFING')).d.phase, 'BRIEFING', 'phone');
  });

  await step('ping -> pong echoes t; bad envelopes and unknown types get error replies', async () => {
    host.send(MSG.PING, { t: 123456 });
    assertEqual((await host.next(MSG.PONG)).d, { t: 123456 }, 'pong');
    host.sendRaw('this is not json');
    assertEqual((await host.next(MSG.ERROR)).d.code, ERR.BAD_ENVELOPE, 'not json');
    host.sendRaw('{"t":"ping","seq":"one"}');
    assertEqual((await host.next(MSG.ERROR)).d.code, ERR.BAD_ENVELOPE, 'bad seq');
    host.send('warp.engage', {});
    assertEqual((await host.next(MSG.ERROR)).d.code, ERR.UNKNOWN_TYPE, 'unknown type');
  });

  await step('a message with a 64-bit payload length is accepted', async () => {
    host.send(MSG.PING, { t: 7, pad: 'x'.repeat(BIG_PAYLOAD_CHARS) });
    assertEqual((await host.next(MSG.PONG)).d, { t: 7 }, 'pong after big frame');
  });

  await step('phone drop marks the player connected:false but keeps it listed', async () => {
    await phone.close();
    const state = (await host.next(MSG.ROOM_STATE, (d) => d.players[0].connected === false)).d;
    assertEqual(state.players[0].nickname, 'Nova', 'nickname kept');
  });

  await step('host reconnects and room.resume restores the room', async () => {
    await host.close();
    host = await TestClient.connect(port);
    host.send(MSG.ROOM_RESUME, { code, hostToken });
    const state = (await host.next(MSG.ROOM_STATE)).d;
    assertEqual(state.code, code, 'code');
    assertEqual(state.phase, 'BRIEFING', 'phase survives');
    assertEqual(state.players.map((p) => p.nickname), ['Nova', 'Orion'], 'players survive');
    assertEqual(state.settings.voteTimerS, 45, 'settings survive');
    host.send(MSG.PHASE_SET, { phase: 'BUILD' });
    assertEqual((await host.next(MSG.ROOM_STATE)).d.phase, 'BUILD', 'resumed host keeps host rights');
  });

  await step('room.resume errors: unknown room and wrong token', async () => {
    const intruder = await TestClient.connect(port);
    intruder.send(MSG.ROOM_RESUME, { code: 'ZZZZ', hostToken });
    assertEqual((await intruder.next(MSG.ERROR)).d.code, ERR.ROOM_NOT_FOUND, 'unknown room');
    intruder.send(MSG.ROOM_RESUME, { code, hostToken: 'wrong' });
    assertEqual((await intruder.next(MSG.ERROR)).d.code, ERR.INVALID_TOKEN, 'wrong token');
    await intruder.close();
  });

  if (host) await host.close();
}

async function runFramingChecks(port) {
  await step('frame codec round-trips 7-, 16- and 64-bit lengths', async () => {
    for (const size of [0, 125, 126, 65_535, 65_536, BIG_PAYLOAD_CHARS]) {
      const payload = Buffer.alloc(size, 0x61);
      const maskKey = crypto.randomBytes(4);
      for (const key of [null, maskKey]) {
        const frames = new FrameParser({ requireMasked: false }).push(encodeFrame(OPCODE.TEXT, payload, { maskKey: key }));
        assertEqual(frames.length, 1, `frame count for ${size} bytes`);
        assert(frames[0].payload.equals(payload), `payload mismatch for ${size} bytes`);
      }
    }
  });

  await step('raw client: ping frame -> pong frame', async () => {
    const raw = await RawClient.connect(port);
    raw.sendFrame(OPCODE.PING, 'hi');
    const frame = await raw.nextFrame();
    assertEqual(frame.opcode, OPCODE.PONG, 'opcode');
    assertEqual(frame.payload.toString(), 'hi', 'pong payload');
    raw.destroy();
  });

  await step('raw client: fragmented text with an interleaved ping is reassembled', async () => {
    const raw = await RawClient.connect(port);
    const message = Buffer.from(JSON.stringify({ t: MSG.PING, seq: 1, d: { t: 42, note: 'héllo ✓' } }));
    const cut1 = 9;
    const cut2 = message.length - 5; // splits the multi-byte "✓" across two fragments
    raw.sendFrame(OPCODE.TEXT, message.subarray(0, cut1), { fin: false });
    raw.sendFrame(OPCODE.PING, 'mid');
    raw.sendFrame(OPCODE.CONTINUATION, message.subarray(cut1, cut2), { fin: false });
    raw.sendFrame(OPCODE.CONTINUATION, message.subarray(cut2), { fin: true });

    const pong = await raw.nextFrame();
    assertEqual(pong.opcode, OPCODE.PONG, 'control frame answered mid-message');
    const reply = await raw.nextFrame();
    assertEqual(reply.opcode, OPCODE.TEXT, 'reply opcode');
    const envelope = JSON.parse(reply.payload.toString());
    assertEqual(envelope.t, MSG.PONG, 'reply type');
    assertEqual(envelope.d, { t: 42 }, 'reply data');

    raw.sendFrame(OPCODE.CLOSE, encodeClosePayload(1000, 'bye'));
    const close = await raw.nextFrame();
    assertEqual(close.opcode, OPCODE.CLOSE, 'close echoed');
    assertEqual(close.payload.readUInt16BE(0), 1000, 'close code echoed');
    raw.destroy();
  });

  await step('raw client: unmasked frame is refused with close 1002', async () => {
    const raw = await RawClient.connect(port);
    raw.sendFrame(OPCODE.TEXT, '{}', { masked: false });
    const close = await raw.nextFrame();
    assertEqual(close.opcode, OPCODE.CLOSE, 'opcode');
    assertEqual(close.payload.readUInt16BE(0), 1002, 'close code');
    raw.destroy();
  });

  await step('raw client: binary message is refused with close 1003', async () => {
    const raw = await RawClient.connect(port);
    raw.sendFrame(OPCODE.BINARY, Buffer.from([1, 2, 3]));
    const close = await raw.nextFrame();
    assertEqual(close.payload.readUInt16BE(0), 1003, 'close code');
    raw.destroy();
  });
}

async function runSimulationFlow() {
  let server;
  try {
    await step(`--simulate-players ${SIMULATED_PLAYERS}: fake players join one by one with roles`, async () => {
      server = await startServer([
        '--simulate-players', String(SIMULATED_PLAYERS),
        '--simulate-interval-ms', String(SIMULATE_INTERVAL_MS),
        '--simulate-roles', String(SIMULATED_ROLES),
      ]);
      const host = await TestClient.connect(server.port);
      host.send(MSG.ROOM_CREATE, { client: 'host', version: 1 });
      await host.next(MSG.ROOM_CREATED);
      for (let count = 0; count <= SIMULATED_PLAYERS; count++) {
        const state = (await host.next(MSG.ROOM_STATE)).d;
        assertEqual(state.players.length, count, 'players grow one at a time');
      }
      host.send(MSG.PHASE_SET, { phase: 'LOBBY' });
      const final = (await host.next(MSG.ROOM_STATE)).d;
      assertEqual(final.players.map((p) => p.nickname), ['Nova', 'Orion', 'Vega'], 'nicknames');
      assertEqual(final.players.map((p) => p.avatar), ['astro_01', 'astro_02', 'astro_03'], 'avatars');
      assertEqual(final.players.map((p) => p.role), [ROLES[0], ROLES[1], null], 'roles');
      await host.close();
    });
  } finally {
    if (server) await server.stop();
  }
}

async function main() {
  let server;
  try {
    await step('server starts on a free port and prints LISTENING', async () => {
      server = await startServer();
      assert(server.port > 0, 'port must be positive');
    });
    if (server) {
      await runRoomFlow(server.port);
      await runFramingChecks(server.port);
    }
  } finally {
    if (server) await server.stop();
  }
  await runSimulationFlow();

  console.log(failures === 0 ? 'SMOKE PASS' : `SMOKE FAIL (${failures} failed)`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.log(`FAIL unexpected error: ${err.stack ?? err}`);
  process.exit(1);
});
