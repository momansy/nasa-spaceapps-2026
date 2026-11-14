#!/usr/bin/env node
// MissionForge stub room server: a dependency-free, in-memory stand-in for the real
// server/ so the Unity host screen can be developed and tested. See README.md.

import http from 'node:http';
import { RoomHub } from './lib/rooms.mjs';
import { acceptUpgrade } from './lib/websocket.mjs';

const DEFAULT_PORT = 8787;
const DEFAULT_SIMULATE_INTERVAL_MS = 1500;
const DEFAULT_SIMULATE_ROLES = 4;
const MAX_PORT = 65535;
const EXIT_USAGE = 2;
const SHUTDOWN_GRACE_MS = 500;

const USAGE = `Usage: node server.mjs [options]

  --port <n>                  TCP port (default ${DEFAULT_PORT}; 0 picks a free port)
  --host <addr>               bind address (default: all interfaces)
  --simulate-players <n>      fake players that join every new room (default 0)
  --simulate-interval-ms <n>  delay between simulated joins (default ${DEFAULT_SIMULATE_INTERVAL_MS})
  --simulate-roles <n>        how many simulated players get a role (default ${DEFAULT_SIMULATE_ROLES})
  --help                      show this help

Prints "LISTENING <port>" on stdout once it accepts connections.`;

const INTEGER_OPTIONS = Object.freeze({
  '--port': { key: 'port', min: 0, max: MAX_PORT },
  '--simulate-players': { key: 'simulatePlayers', min: 0, max: 1000 },
  '--simulate-interval-ms': { key: 'simulateIntervalMs', min: 1, max: 3_600_000 },
  '--simulate-roles': { key: 'simulateRoles', min: 0, max: 1000 },
});

function usageError(message) {
  console.error(`${message}\n\n${USAGE}`);
  process.exit(EXIT_USAGE);
}

function parseArgs(argv) {
  const options = {
    port: DEFAULT_PORT,
    host: undefined,
    simulatePlayers: 0,
    simulateIntervalMs: DEFAULT_SIMULATE_INTERVAL_MS,
    simulateRoles: DEFAULT_SIMULATE_ROLES,
  };
  for (let i = 0; i < argv.length; i++) {
    const [flag, inlineValue] = argv[i].split('=', 2);
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
const hub = new RoomHub(options);
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
