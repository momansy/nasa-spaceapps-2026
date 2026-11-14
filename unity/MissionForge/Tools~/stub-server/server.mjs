#!/usr/bin/env node
// MissionForge stub room server: a dependency-free, in-memory stand-in for the real server/
// that speaks the wire contract in protocol/ (version 1), so the Unity host screen can be
// developed and tested. See README.md.

import http from 'node:http';
import { loadContract } from './lib/contract.mjs';
import { RoomHub } from './lib/rooms.mjs';
import { acceptUpgrade } from './lib/websocket.mjs';

const DEFAULT_PORT = 8787;
const DEFAULT_BOT_INTERVAL_MS = 1500;
const DEFAULT_CLIENT_URL = 'http://localhost:5173/';
const BOTS_ENV = 'MISSIONFORGE_STUB_BOTS';
const MAX_BOTS = 10;
const MAX_PORT = 65535;
const EXIT_USAGE = 2;
const SHUTDOWN_GRACE_MS = 500;

const USAGE = `Usage: node server.mjs [options]

  --port <n>              TCP port (default ${DEFAULT_PORT}; 0 picks a free port)
  --host <addr>           bind address (default: all interfaces)
  --bots <n>              fake players that join every new room, 0-${MAX_BOTS} (default 0, or env ${BOTS_ENV})
  --bot-interval-ms <n>   delay between bot joins (default ${DEFAULT_BOT_INTERVAL_MS})
  --client-url <url>      phone client base URL for joinUrl / spectateUrl (default ${DEFAULT_CLIENT_URL})
  --slot-hold-ms <n>      how long a dropped player keeps the seat (default 180000)
  --room-hold-ms <n>      how long a room survives without its host (default 600000)
  --idle-timeout-ms <n>   drop connections silent for this long (default 15000)
  --protocol-dir <path>   the protocol/ folder (default: <repo>/protocol)
  --help                  show this help

--simulate-players and --simulate-interval-ms are accepted as aliases of --bots and --bot-interval-ms.
Prints "LISTENING <port>" on stdout once it accepts connections.`;

const INTEGER_OPTIONS = Object.freeze({
  '--port': { key: 'port', min: 0, max: MAX_PORT },
  '--bots': { key: 'bots', min: 0, max: MAX_BOTS },
  '--simulate-players': { key: 'bots', min: 0, max: MAX_BOTS },
  '--bot-interval-ms': { key: 'botIntervalMs', min: 1, max: 3_600_000 },
  '--simulate-interval-ms': { key: 'botIntervalMs', min: 1, max: 3_600_000 },
  '--slot-hold-ms': { key: 'slotHoldMs', min: 0, max: 3_600_000 },
  '--room-hold-ms': { key: 'roomHoldMs', min: 0, max: 3_600_000 },
  '--idle-timeout-ms': { key: 'idleTimeoutMs', min: 1_000, max: 120_000 },
});

/** room.created.joinUrl must match ^https?://[^\s?#]+\?room=CODE$, so the base has no query or fragment. */
const CLIENT_URL_PATTERN = /^https?:\/\/[^\s?#]+$/;

function usageError(message) {
  console.error(`${message}\n\n${USAGE}`);
  process.exit(EXIT_USAGE);
}

function parseArgs(argv) {
  const envBots = process.env[BOTS_ENV];
  const options = {
    port: DEFAULT_PORT,
    host: undefined,
    bots: envBots === undefined || envBots === '' ? 0 : Number(envBots),
    botIntervalMs: DEFAULT_BOT_INTERVAL_MS,
    clientUrl: DEFAULT_CLIENT_URL,
    protocolDir: undefined,
  };
  if (!Number.isInteger(options.bots) || options.bots < 0 || options.bots > MAX_BOTS) {
    usageError(`${BOTS_ENV} must be an integer between 0 and ${MAX_BOTS}`);
  }
  for (let i = 0; i < argv.length; i++) {
    const separator = argv[i].indexOf('=');
    const flag = separator < 0 ? argv[i] : argv[i].slice(0, separator);
    const inlineValue = separator < 0 ? undefined : argv[i].slice(separator + 1);
    if (flag === '--help' || flag === '-h') {
      console.log(USAGE);
      process.exit(0);
    }
    const value = inlineValue ?? argv[++i];
    if (value === undefined) usageError(`Missing value for ${flag}`);

    if (flag === '--host') {
      options.host = value;
      continue;
    }
    if (flag === '--protocol-dir') {
      options.protocolDir = value;
      continue;
    }
    if (flag === '--client-url') {
      if (!CLIENT_URL_PATTERN.test(value)) usageError('--client-url must be an http(s) URL without ? or #');
      options.clientUrl = value;
      continue;
    }
    const spec = INTEGER_OPTIONS[flag];
    if (!spec) usageError(`Unknown option ${flag}`);
    const number = Number(value);
    if (!Number.isInteger(number) || number < spec.min || number > spec.max) {
      usageError(`${flag} must be an integer between ${spec.min} and ${spec.max}`);
    }
    options[spec.key] = number;
  }
  return options;
}

const options = parseArgs(process.argv.slice(2));
let contract;
try {
  contract = loadContract(options.protocolDir);
} catch (err) {
  console.error(`[stub] ${err.message}`);
  process.exit(1);
}
const hub = new RoomHub({ ...options, contract });
const sockets = new Set();

const server = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, rooms: hub.roomCount }));
    return;
  }
  res.writeHead(426, { 'Content-Type': 'text/plain', Upgrade: 'websocket' });
  res.end('MissionForge stub room server: connect with a WebSocket client.\n');
});

server.on('connection', (socket) => {
  sockets.add(socket);
  socket.on('close', () => sockets.delete(socket));
});

server.on('upgrade', (req, socket, head) => {
  const conn = acceptUpgrade(req, socket);
  if (!conn) return;
  conn.on('socketError', (err) => console.error(`[stub] socket error: ${err.code ?? err.message}`));
  hub.attach(conn);
  conn.start(head);
});

server.on('error', (err) => {
  console.error(`[stub] server error: ${err.message}`);
  process.exit(1);
});

server.listen(options.port, options.host, () => {
  console.log(`LISTENING ${server.address().port}`);
});

function shutdown() {
  hub.shutdown();
  server.close();
  // Give clients a moment to finish the closing handshake, then force the exit.
  setTimeout(() => {
    for (const socket of sockets) socket.destroy();
    process.exit(0);
  }, SHUTDOWN_GRACE_MS);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
