#!/usr/bin/env node
// Dependency-free smoke test for the stub room server against the wire contract in protocol/.
// Starts server.mjs on a free port and exercises the protocol with Node's built-in WebSocket
// client plus a raw TCP client for the framing edge cases. Every frame the server sends is
// validated strictly against protocol/schema (envelope + payload, unknown fields rejected),
// and every well-formed frame the test sends is validated too.
// Prints PASS/FAIL lines and exits non-zero when anything fails.

import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadContract } from './lib/contract.mjs';
import { BYE, ERR, MSG, ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH } from './lib/protocol.mjs';
import { FrameParser, OPCODE, computeAcceptKey, encodeClosePayload, encodeFrame } from './lib/websocket.mjs';

const SERVER_SCRIPT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'server.mjs');
const STEP_TIMEOUT_MS = 3000;
const SERVER_START_TIMEOUT_MS = 5000;
const BOTS = 3;
const BOT_INTERVAL_MS = 40;
const SHORT_HOLD_MS = 300;
const ROOM_CODE_PATTERN = new RegExp(`^[${ROOM_CODE_ALPHABET}]{${ROOM_CODE_LENGTH}}$`);
const NOVA_AVATAR = { suitId: 'suit_orange', patchId: 'patch_comet' };

const contract = loadContract();
const schemaViolations = [];
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

const example = (type) => structuredClone(contract.schemas.get(type).examples[0]);

/** A phase.set payload with the given phase and the defaults of the LOBBY row. */
function phaseSet(phase, extra = {}) {
  return {
    missionSeq: 0, mode: 'QUICK', phase, sub: 'NONE', review: null, flightPhase: null,
    segment: null, boosterTrack: false, contractId: null, step: null, ...extra,
  };
}

/** Starts the stub and resolves once it printed "LISTENING <port>". */
function startServer(extraArgs = [], env = {}) {
  const child = spawn(process.execPath, [SERVER_SCRIPT, '--port', '0', ...extraArgs], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, ...env },
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

/** Envelope-aware wrapper around the built-in WebSocket client; validates every frame both ways. */
class TestClient {
  #ws;
  #inbox = [];
  #waiters = [];
  #seq = 0;
  #name;

  static async connect(port, name) {
    const client = new TestClient();
    client.#name = name;
    await client.#open(`ws://127.0.0.1:${port}`);
    return client;
  }

  /** Connects and completes the hello handshake as HOST or PHONE. */
  static async handshake(port, name, client = 'PHONE') {
    const c = await TestClient.connect(port, name);
    c.send(MSG.HELLO, { protocolVersion: 1, client, appVersion: 'smoke-1', lang: 'en' });
    const ok = (await c.next(MSG.HELLO_OK)).d;
    assertEqual(ok.protocolVersion, 1, `${name} hello.ok version`);
    return c;
  }

  #open(url) {
    this.#ws = new WebSocket(url);
    this.#ws.addEventListener('message', (event) => {
      const frame = JSON.parse(event.data);
      const result = contract.check(frame);
      if (!result.ok) schemaViolations.push(`${this.#name} received ${result.message}: ${event.data.slice(0, 200)}`);
      this.#inbox.push(frame);
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

  /** Sends a well-formed frame (validated against the schema unless `invalid` is set). */
  send(type, data = {}, { invalid = false } = {}) {
    this.#seq += 1;
    const frame = { t: type, seq: this.#seq, d: data };
    if (!invalid) {
      const result = contract.check(frame);
      if (!result.ok) schemaViolations.push(`${this.#name} sent ${result.message}`);
    }
    this.#ws.send(JSON.stringify(frame));
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
    return withTimeout(waiting, `"${type}" on ${this.#name}`);
  }

  /** Resolves with the types of the next `count` unread frames, in arrival order. */
  async nextTypes(count) {
    const types = [];
    for (let i = 0; i < count; i++) {
      const env = await withTimeout(
        new Promise((resolve) => {
          this.#waiters.push({ predicate: () => true, resolve });
          this.#drain();
        }),
        `frame ${i + 1} of ${count} on ${this.#name}`,
      );
      types.push(env.t);
    }
    return types;
  }

  /** True when nothing of `type` arrives within `ms`. */
  async receivesNothing(type, ms = 150) {
    await new Promise((resolve) => setTimeout(resolve, ms));
    return !this.#inbox.some((env) => env.t === type);
  }

  drop() {
    this.#inbox.length = 0;
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

async function expectFatal(client, code, byeReason) {
  const error = (await client.next(MSG.ERROR)).d;
  assertEqual([error.code, error.fatal], [code, true], 'fatal error');
  const bye = (await client.next(MSG.BYE)).d;
  assertEqual(bye.reason, byeReason, 'bye reason');
  const closed = await withTimeout(client.closed, 'close after bye');
  assertEqual(closed.code, bye.closeCode, 'close code equals bye.closeCode');
}

async function runRoomFlow(port) {
  let host;
  let phone;
  let code;
  let hostToken;
  let phoneToken;

  await step('host: hello -> hello.ok with HOST limits', async () => {
    host = await TestClient.connect(port, 'host');
    host.send(MSG.HELLO, { protocolVersion: 1, client: 'HOST', appVersion: '0.1.0' });
    const ok = (await host.next(MSG.HELLO_OK)).d;
    assertEqual([ok.heartbeatMs, ok.idleTimeoutMs, ok.maxFrameBytes, ok.maxMsgsPerSec], [5000, 15000, 65536, 400], 'limits');
  });

  await step('clock.ping -> clock.pong echoes clientTimeMs with the server clock', async () => {
    const before = Date.now();
    host.send(MSG.CLOCK_PING, { clientTimeMs: 81234.5 });
    const pong = (await host.next(MSG.CLOCK_PONG)).d;
    assertEqual(pong.clientTimeMs, 81234.5, 'echo');
    assert(pong.serverTimeMs >= before && pong.serverTimeMs <= Date.now(), 'serverTimeMs is the server clock');
  });

  await step('room.create -> room.created, then settings.state, room.state, roles.state, snapshot.end', async () => {
    host.send(MSG.ROOM_CREATE, { settings: { voteTimerS: 30 } });
    const types = await host.nextTypes(5);
    assertEqual(types, [MSG.ROOM_CREATED, MSG.SETTINGS_STATE, MSG.ROOM_STATE, MSG.ROLES_STATE, MSG.SNAPSHOT_END], 'order');
  });

  await step('room.created carries code, token and the join URLs; defaults merged with the patch', async () => {
    // nextTypes consumed the frames; re-create on a second host to inspect the payloads.
    const other = await TestClient.handshake(port, 'host-b', 'HOST');
    other.send(MSG.ROOM_CREATE, { settings: { voteTimerS: 30 } });
    const created = (await other.next(MSG.ROOM_CREATED)).d;
    assert(ROOM_CODE_PATTERN.test(created.room), `room code "${created.room}"`);
    assertEqual(created.joinUrl, `http://localhost:5173/?room=${created.room}`, 'joinUrl');
    assertEqual(created.spectateUrl, `http://localhost:5173/?room=${created.room}&watch=1`, 'spectateUrl');
    assertEqual([created.maxPlayers, created.slotHoldMs, created.roomHoldMs], [10, 180000, 600000], 'limits');
    const settings = (await other.next(MSG.SETTINGS_STATE)).d.settings;
    assertEqual([settings.voteTimerS, settings.roleAssignMode, settings.assistLevel, settings.tallyVisibility], [30, 'RANDOM', 'ENGINEER', 'OPEN'], 'settings');
    const state = (await other.next(MSG.ROOM_STATE)).d;
    assertEqual([state.room, state.hostConnected, state.paused, state.players, state.spectatorCount], [created.room, true, false, [], 0], 'room.state');
    const roles = (await other.next(MSG.ROLES_STATE)).d;
    assertEqual([roles.locked, roles.groups.length, roles.groups[0].playerId], [false, 1, null], 'roles.state');
    assertEqual((await other.next(MSG.SNAPSHOT_END)).d.lastOutcomeSeq, 0, 'snapshot.end');
    other.send(MSG.ROOM_CLOSE, {});
    assertEqual((await other.next(MSG.BYE)).d, { reason: 'ROOM_CLOSED', closeCode: 4000, canResume: false }, 'bye on room.close');
    code = null;
  });

  await step('the first host gets its own room code back (resume needs it)', async () => {
    // Fresh host so the test keeps the room.created payload.
    await host.close();
    host = await TestClient.handshake(port, 'host', 'HOST');
    host.send(MSG.ROOM_CREATE, {});
    const created = (await host.next(MSG.ROOM_CREATED)).d;
    code = created.room;
    hostToken = created.hostToken;
    await host.next(MSG.SNAPSHOT_END);
    host.drop();
  });

  await step('room.join: code must be upper-case (BAD_PAYLOAD field "room"); unknown room -> ROOM_NOT_FOUND', async () => {
    phone = await TestClient.handshake(port, 'phone');
    phone.send(MSG.ROOM_JOIN, { room: code.toLowerCase(), as: 'PLAYER', nickname: 'Nova', avatar: NOVA_AVATAR }, { invalid: true });
    assertEqual((await phone.next(MSG.ERROR)).d.field, 'room', 'field');
    phone.send(MSG.ROOM_JOIN, { room: 'ZZZZ', as: 'PLAYER', nickname: 'Nova', avatar: NOVA_AVATAR });
    assertEqual((await phone.next(MSG.ERROR)).d.code, ERR.ROOM_NOT_FOUND, 'unknown room');
  });

  await step('room.join -> room.joined + snapshot; host gets room.state and roles.state', async () => {
    phone.send(MSG.ROOM_JOIN, { room: code, as: 'PLAYER', nickname: '  Nova ', avatar: NOVA_AVATAR });
    const joined = (await phone.next(MSG.ROOM_JOINED)).d;
    assertEqual([joined.kind, joined.id, joined.slot, joined.nickname, joined.pendingPlayer], ['PLAYER', 'p1', 1, 'Nova', false], 'joined');
    phoneToken = joined.token;
    await phone.next(MSG.SNAPSHOT_END);
    const state = (await host.next(MSG.ROOM_STATE, (d) => d.players.length === 1)).d;
    const p = state.players[0];
    assertEqual([p.id, p.slot, p.nickname, p.avatar, p.connected, p.slotExpiresAtMs, p.vetoAvailable], ['p1', 1, 'Nova', NOVA_AVATAR, true, null, true], 'player');
    await host.next(MSG.ROLES_STATE);
  });

  await step('nickname clash -> NICK_TAKEN with a suggestion; second player gets slot 2; drop keeps the slot', async () => {
    const second = await TestClient.handshake(port, 'second');
    second.send(MSG.ROOM_JOIN, { room: code, as: 'PLAYER', nickname: 'nova', avatar: NOVA_AVATAR });
    const err = (await second.next(MSG.ERROR)).d;
    assertEqual([err.code, err.suggestion], [ERR.NICK_TAKEN, 'nova2'], 'NICK_TAKEN');
    second.send(MSG.ROOM_JOIN, { room: code, as: 'PLAYER', nickname: 'Orion', avatar: { suitId: 'suit_teal', patchId: 'patch_orbit' } });
    assertEqual((await second.next(MSG.ROOM_JOINED)).d.slot, 2, 'slot');
    await second.close();
    const after = (await host.next(MSG.ROOM_STATE, (d) => d.players.length === 2 && d.players[1].connected === false)).d;
    assert(after.players[1].slotExpiresAtMs > Date.now(), 'slotExpiresAtMs is in the future');
  });

  await step('spectator join is counted, not listed, and gets sticky host messages in its snapshot', async () => {
    host.send('sync.meter', example('sync.meter'));
    assertEqual((await phone.next('sync.meter')).d, example('sync.meter'), 'relayed unchanged to players');
    const watcher = await TestClient.handshake(port, 'watcher');
    watcher.send(MSG.ROOM_JOIN, { room: code, as: 'SPECTATOR' });
    const joined = (await watcher.next(MSG.ROOM_JOINED)).d;
    assertEqual([joined.kind, joined.id, joined.slot, joined.spectatorReason], ['SPECTATOR', 's1', null, 'REQUESTED'], 'joined');
    await watcher.next('sync.meter');
    await watcher.next(MSG.SNAPSHOT_END);
    assertEqual((await host.next(MSG.ROOM_STATE, (d) => d.spectatorCount === 1)).d.players.length, 2, 'players unchanged');
    assert(await host.receivesNothing('sync.meter'), 'the host never gets its own relayed message');
    await watcher.close();
  });

  await step('settings.set -> settings.state to everyone; bad value -> BAD_PAYLOAD field; phone -> FORBIDDEN', async () => {
    host.send(MSG.SETTINGS_SET, { settings: { voteTimerS: 45, tallyVisibility: 'HIDDEN' } });
    const s = (await host.next(MSG.SETTINGS_STATE, (d) => d.settings.voteTimerS === 45)).d.settings;
    assertEqual(s.tallyVisibility, 'HIDDEN', 'host');
    await phone.next(MSG.SETTINGS_STATE, (d) => d.settings.voteTimerS === 45);
    host.send(MSG.SETTINGS_SET, { settings: { voteTimerS: 5 } }, { invalid: true });
    assertEqual((await host.next(MSG.ERROR)).d.field, 'settings.voteTimerS', 'field');
    phone.send(MSG.SETTINGS_SET, { settings: { voteTimerS: 30 } });
    assertEqual((await phone.next(MSG.ERROR)).d.code, ERR.FORBIDDEN, 'phone');
  });

  await step('PICK mode: roles.pick claims a group, a non-lead is BAD_PAYLOAD; roles.lock assigns every role', async () => {
    host.send(MSG.SETTINGS_SET, { settings: { roleAssignMode: 'PICK' } });
    await host.next(MSG.ROLES_STATE, (d) => d.mode === 'PICK');
    // Two players: FLIGHT+PM+BOOSTER+STRUCT+GUIDO (lead FLIGHT) and FIDO+EECOM+INCO+PAYLOAD+RETRO (lead FIDO).
    phone.send(MSG.ROLES_PICK, { lead: 'FIDO' });
    const picked = (await host.next(MSG.ROLES_STATE, (d) => d.groups.some((g) => g.playerId === 'p1'))).d;
    assertEqual(picked.groups.find((g) => g.playerId === 'p1').lead, 'FIDO', 'claimed group');
    const seq = phone.send(MSG.ROLES_PICK, { lead: 'GUIDO' });
    assertEqual((await phone.next(MSG.ERROR)).d, { code: 'BAD_PAYLOAD', fatal: false, re: seq, reT: 'roles.pick', field: 'lead' }, 'non-lead');
    host.send(MSG.ROLES_LOCK, {});
    const locked = (await host.next(MSG.ROLES_STATE, (d) => d.locked)).d;
    assert(locked.groups.every((g) => g.playerId !== null), 'every group has a holder');
    assertEqual(locked.groups.flatMap((g) => g.roles).length, 10, 'all ten roles');
    assertEqual(locked.groups.find((g) => g.playerId === 'p1').lead, 'FIDO', 'pick kept');
  });

  await step('phase.set: bad transition -> INVALID_TRANSITION; valid one is relayed to phones only', async () => {
    host.send(MSG.PHASE_SET, phaseSet('FLIGHT', { sub: 'FLYING', flightPhase: 'F2', segment: 'ASCENT' }));
    assertEqual((await host.next(MSG.ERROR)).d.code, ERR.INVALID_TRANSITION, 'LOBBY -> FLIGHT');
    host.send(MSG.PHASE_SET, phaseSet('FRR'));
    assertEqual((await host.next(MSG.ERROR)).d.code, ERR.INVALID_TRANSITION, 'FRR without review');
    host.send(MSG.PHASE_SET, phaseSet('BRIEFING', { missionSeq: 1 }));
    assertEqual((await phone.next(MSG.PHASE_SET)).d.phase, 'BRIEFING', 'phone');
    assert(await host.receivesNothing(MSG.PHASE_SET), 'not echoed to the host');
    host.send(MSG.SETTINGS_SET, { settings: { assistLevel: 'CADET' } });
    assertEqual((await host.next(MSG.ERROR)).d.code, ERR.SETTING_LOCKED, 'lobby-only setting');
  });

  await step('phone -> host relay: mg.ready arrives inside relay with the sender id', async () => {
    phone.send('mg.ready', example('mg.ready'));
    const relay = (await host.next(MSG.RELAY)).d;
    assertEqual(relay, { from: 'p1', t: 'mg.ready', d: example('mg.ready') }, 'relay');
  });

  await step('game.pause -> game.paused; pause-blocked input -> PAUSED; game.resume -> game.resumed', async () => {
    host.send(MSG.GAME_PAUSE, {});
    const paused = (await phone.next(MSG.GAME_PAUSED)).d;
    assertEqual([paused.reason, paused.roomExpiresAtMs], ['HOST_REQUEST', null], 'paused');
    await host.next(MSG.GAME_PAUSED);
    phone.send('vote.cast', example('vote.cast'));
    assertEqual((await phone.next(MSG.ERROR)).d.code, ERR.PAUSED, 'vote.cast while paused');
    host.send(MSG.GAME_RESUME, {});
    assert((await phone.next(MSG.GAME_RESUMED)).d.pausedForMs >= 0, 'pausedForMs');
  });

  await step('host drop pauses the room (HOST_DISCONNECTED); resume with the token restores it', async () => {
    await host.close();
    const paused = (await phone.next(MSG.GAME_PAUSED, (d) => d.reason === 'HOST_DISCONNECTED')).d;
    assert(paused.roomExpiresAtMs > Date.now(), 'roomExpiresAtMs');
    await phone.next(MSG.ROOM_STATE, (d) => d.hostConnected === false && d.paused === true);

    host = await TestClient.handshake(port, 'host', 'HOST');
    host.send(MSG.ROOM_RESUME, { room: code, token: hostToken, lastOutcomeSeq: 0 });
    const resumed = (await host.next(MSG.ROOM_RESUMED)).d;
    assertEqual(resumed, { room: code, kind: 'HOST', id: 'host', slot: null, pendingPlayer: false, paused: true }, 'room.resumed');
    const types = await host.nextTypes(5);
    assertEqual(types, [MSG.SETTINGS_STATE, MSG.ROOM_STATE, MSG.ROLES_STATE, MSG.GAME_PAUSED, MSG.SNAPSHOT_END], 'host snapshot');
    await phone.next(MSG.ROOM_STATE, (d) => d.hostConnected === true);
    host.send(MSG.GAME_RESUME, {});
    await phone.next(MSG.GAME_RESUMED);
  });

  await step('room.resume errors: ROOM_NOT_FOUND, TOKEN_INVALID, FORBIDDEN (token kind vs client kind)', async () => {
    const intruder = await TestClient.handshake(port, 'intruder', 'HOST');
    intruder.send(MSG.ROOM_RESUME, { room: 'ZZZZ', token: hostToken });
    assertEqual((await intruder.next(MSG.ERROR)).d.code, ERR.ROOM_NOT_FOUND, 'unknown room');
    intruder.send(MSG.ROOM_RESUME, { room: code, token: 'x'.repeat(24) });
    assertEqual((await intruder.next(MSG.ERROR)).d.code, ERR.TOKEN_INVALID, 'wrong token');
    intruder.send(MSG.ROOM_RESUME, { room: code, token: phoneToken });
    assertEqual((await intruder.next(MSG.ERROR)).d.code, ERR.FORBIDDEN, 'phone token on a HOST connection');
    await intruder.close();
  });

  await step('a second connection resuming a token replaces the first (bye REPLACED, close 4003)', async () => {
    const newer = await TestClient.handshake(port, 'phone-2');
    newer.send(MSG.ROOM_RESUME, { room: code, token: phoneToken });
    const resumed = (await newer.next(MSG.ROOM_RESUMED)).d;
    assertEqual([resumed.kind, resumed.id, resumed.slot], ['PLAYER', 'p1', 1], 'resumed');
    assertEqual((await phone.next(MSG.BYE)).d, { reason: 'REPLACED', closeCode: 4003, canResume: false }, 'bye');
    assertEqual((await phone.closed).code, 4003, 'close code');
    phone = newer;
    await phone.next(MSG.PHASE_SET); // sticky phase.set in the snapshot
    await phone.next(MSG.SNAPSHOT_END);
  });

  await step('room.kick -> bye KICKED to the player; then UNKNOWN_PLAYER', async () => {
    host.send(MSG.ROOM_KICK, { playerId: 'p1' });
    assertEqual((await phone.next(MSG.BYE)).d.reason, 'KICKED', 'bye');
    assertEqual((await phone.closed).code, 4002, 'close code');
    await host.next(MSG.ROOM_STATE, (d) => !d.players.some((p) => p.id === 'p1'));
    host.send(MSG.ROOM_KICK, { playerId: 'p1' });
    assertEqual((await host.next(MSG.ERROR)).d.code, ERR.UNKNOWN_PLAYER, 'again');
  });

  await step('late join after BUILD: pending spectator (LATE_JOIN)', async () => {
    host.send(MSG.PHASE_SET, phaseSet('BUILD', { missionSeq: 1 }));
    const late = await TestClient.handshake(port, 'late');
    late.send(MSG.ROOM_JOIN, { room: code, as: 'PLAYER', nickname: 'Vega', avatar: NOVA_AVATAR });
    const joined = (await late.next(MSG.ROOM_JOINED)).d;
    assertEqual([joined.kind, joined.spectatorReason, joined.pendingPlayer], ['SPECTATOR', 'LATE_JOIN', true], 'pending');
    await host.next(MSG.ROOM_STATE, (d) => d.pendingPlayerCount === 1);
    await late.close();
  });

  await step('common checks: unknown type, non-increasing seq, missing hello, version mismatch, frame size', async () => {
    host.send('warp.engage', {}, { invalid: true });
    const unknown = (await host.next(MSG.ERROR)).d;
    assertEqual([unknown.code, unknown.fatal, unknown.reT], [ERR.UNKNOWN_TYPE, false, 'warp.engage'], 'unknown type');

    const replay = await TestClient.handshake(port, 'replay');
    replay.sendRaw(JSON.stringify({ t: MSG.CLOCK_PING, seq: 1, d: { clientTimeMs: 1 } }));
    await expectFatal(replay, ERR.BAD_ENVELOPE, 'PROTOCOL_VIOLATION');

    const rude = await TestClient.connect(port, 'rude');
    rude.send(MSG.CLOCK_PING, { clientTimeMs: 1 });
    await expectFatal(rude, ERR.HANDSHAKE_REQUIRED, 'PROTOCOL_VIOLATION');

    const old = await TestClient.connect(port, 'old');
    old.send(MSG.HELLO, { protocolVersion: 2, client: 'PHONE', appVersion: 'x' });
    const err = (await old.next(MSG.ERROR)).d;
    assertEqual([err.code, err.serverProtocolVersion], [ERR.VERSION_MISMATCH, 1], 'version');
    assertEqual((await old.next(MSG.BYE)).d.closeCode, BYE.VERSION_MISMATCH.closeCode, 'bye');

    const big = await TestClient.handshake(port, 'big');
    big.send(MSG.CLOCK_PING, { clientTimeMs: 1, pad: 'x'.repeat(3000) }, { invalid: true });
    await expectFatal(big, ERR.FRAME_TOO_LARGE, 'PROTOCOL_VIOLATION');
  });

  await step('room.close -> bye ROOM_CLOSED to the host', async () => {
    host.send(MSG.ROOM_CLOSE, {});
    assertEqual((await host.next(MSG.BYE)).d.reason, 'ROOM_CLOSED', 'bye');
    assertEqual((await host.closed).code, 4000, 'close code');
  });
}

async function runFramingChecks(port) {
  await step('frame codec round-trips 7-, 16- and 64-bit lengths', async () => {
    for (const size of [0, 125, 126, 65_535, 65_536, 70_000]) {
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

  await step('raw client: fragmented hello with an interleaved ping is reassembled', async () => {
    const raw = await RawClient.connect(port);
    const hello = { t: MSG.HELLO, seq: 1, d: { protocolVersion: 1, client: 'PHONE', appVersion: 'raw', note: 'héllo ✓' } };
    const message = Buffer.from(JSON.stringify(hello));
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
    assertEqual(JSON.parse(reply.payload.toString()).t, MSG.HELLO_OK, 'reply type (unknown field "note" ignored)');

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

/** Creates a room on `port` and returns { host, code }. */
async function createRoom(port, name = 'host') {
  const host = await TestClient.handshake(port, name, 'HOST');
  host.send(MSG.ROOM_CREATE, {});
  const code = (await host.next(MSG.ROOM_CREATED)).d.room;
  await host.next(MSG.SNAPSHOT_END);
  host.drop(); // discard the snapshot so later next() calls only see new broadcasts
  return { host, code };
}

async function runBotFlow() {
  let server;
  try {
    await step(`--bots ${BOTS}: fake players join one by one (room.state + roles.state each time)`, async () => {
      server = await startServer(['--bots', String(BOTS), '--bot-interval-ms', String(BOT_INTERVAL_MS)]);
      const { host } = await createRoom(server.port);
      let state;
      for (let count = 1; count <= BOTS; count++) {
        state = (await host.next(MSG.ROOM_STATE, (d) => d.players.length === count)).d;
        const roles = (await host.next(MSG.ROLES_STATE)).d;
        assertEqual(roles.groups.length, count, 'role groups follow the player count');
      }
      assertEqual(state.players.map((p) => p.nickname), ['Nova', 'Orion', 'Vega'], 'nicknames');
      assertEqual(state.players.map((p) => p.slot), [1, 2, 3], 'slots');
      assertEqual(state.players[0].avatar, { suitId: 'suit_orange', patchId: 'patch_comet' }, 'avatar');
      assert(state.players.every((p) => p.connected), 'bots are connected');
      host.send(MSG.ROLES_LOCK, {});
      const locked = (await host.next(MSG.ROLES_STATE, (d) => d.locked)).d;
      assertEqual(locked.groups.map((g) => g.lead), ['FLIGHT', 'BOOSTER', 'EECOM'], 'three groups');
      await host.close();
    });
  } finally {
    if (server) await server.stop();
  }

  server = null;
  try {
    await step('MISSIONFORGE_STUB_BOTS=2 works like --bots 2', async () => {
      server = await startServer(['--bot-interval-ms', String(BOT_INTERVAL_MS)], { MISSIONFORGE_STUB_BOTS: '2' });
      const { host } = await createRoom(server.port);
      await host.next(MSG.ROOM_STATE, (d) => d.players.length === 2);
      await host.close();
    });
  } finally {
    if (server) await server.stop();
  }
}

async function runHoldFlow() {
  let server;
  try {
    server = await startServer(['--slot-hold-ms', String(SHORT_HOLD_MS), '--room-hold-ms', String(SHORT_HOLD_MS)]);
    await step('slot hold: a dropped player is removed when the hold elapses', async () => {
      const { host, code } = await createRoom(server.port);
      const phone = await TestClient.handshake(server.port, 'phone');
      phone.send(MSG.ROOM_JOIN, { room: code, as: 'PLAYER', nickname: 'Lyra', avatar: NOVA_AVATAR });
      await phone.next(MSG.SNAPSHOT_END);
      await phone.close();
      await host.next(MSG.ROOM_STATE, (d) => d.players.length === 1 && !d.players[0].connected);
      await host.next(MSG.ROOM_STATE, (d) => d.players.length === 0);
      await host.close();
    });

    await step('room hold: a room without its host expires (bye ROOM_EXPIRED to phones)', async () => {
      const { host, code } = await createRoom(server.port);
      const phone = await TestClient.handshake(server.port, 'phone');
      phone.send(MSG.ROOM_JOIN, { room: code, as: 'PLAYER', nickname: 'Juno', avatar: NOVA_AVATAR });
      await phone.next(MSG.SNAPSHOT_END);
      await host.close();
      await phone.next(MSG.GAME_PAUSED, (d) => d.reason === 'HOST_DISCONNECTED');
      assertEqual((await phone.next(MSG.BYE)).d, { reason: 'ROOM_EXPIRED', closeCode: 4004, canResume: false }, 'bye');
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
  await runBotFlow();
  await runHoldFlow();

  await step('every frame sent and received matched protocol/schema', async () => {
    assert(schemaViolations.length === 0, `${schemaViolations.length} violation(s):\n  ${schemaViolations.join('\n  ')}`);
  });

  console.log(failures === 0 ? 'SMOKE PASS' : `SMOKE FAIL (${failures} failed)`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.log(`FAIL unexpected error: ${err.stack ?? err}`);
  process.exit(1);
});
