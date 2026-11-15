// T040 harness: runs the REAL MissionForgeWebSocket.jslib (keepalive code) against the REAL room
// server (server/dist, IDLE_TIMEOUT_MS = 15 s) while the "C# side" (this script) goes silent, which
// is what a backgrounded tab does to the Unity frame loop.
//
//   node orchestration/evidence/T040/keepalive-harness.mjs [--seconds 60] [--no-keepalive] [--no-worker]
//
// Needs `npm ci && npm run build` in server/. Emscripten and browser globals are stubbed just
// enough for the library; the browser WebSocket is the `ws` package, which has the same
// onopen/onmessage API. A Worker stub (setInterval on another timer) stands in for the Web Worker.
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '..', '..', '..');
const require = createRequire(path.join(repo, 'server', 'package.json'));
const { WebSocket } = require('ws');

const args = process.argv.slice(2);
const seconds = Number(args[args.indexOf('--seconds') + 1]) || 60;
const useKeepalive = !args.includes('--no-keepalive');
const useWorker = !args.includes('--no-worker');
const port = 18787 + Math.floor(Math.random() * 1000);
const log = (m) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1).padStart(5)}s] ${m}`);
const t0 = Date.now();

// ── load the jslib with stubbed Emscripten globals ──
let source = fs.readFileSync(path.join(repo, 'unity/MissionForge/Assets/MissionForge/Net/Plugins/MissionForgeWebSocket.jslib'), 'utf8');
const strings = new Map();
let nextPtr = 1;
const sandbox = {
  UTF8ToString: (p) => strings.get(p),
  lengthBytesUTF8: (t) => Buffer.byteLength(t),
  _malloc: () => nextPtr++, stringToUTF8: (t, p) => strings.set(p, t),
  autoAddDeps: () => {}, LibraryManager: { library: {} },
  mergeInto: (target, lib) => Object.assign(target, lib),
};
globalThis.WebSocket = WebSocket;
if (useWorker) {
  globalThis.Blob = class { constructor(parts) { this.src = parts.join(''); } };
  globalThis.URL.createObjectURL = (blob) => blob.src;
  globalThis.URL.revokeObjectURL = () => {};
  globalThis.Worker = class {
    constructor(src) {
      const ms = Number(/}, (\d+)\)/.exec(src)[1]);
      this.timer = setInterval(() => this.onmessage && this.onmessage({}), ms);
    }
    terminate() { clearInterval(this.timer); }
  };
} else {
  delete globalThis.Worker;
}
const lib = new Function(...Object.keys(sandbox), source + '\n;var MFWS = MissionForgeWebSocketLibrary.$MFWS; return {MissionForgeWebSocketLibrary, MFWS};')(...Object.values(sandbox));
const L = lib.MissionForgeWebSocketLibrary;
// Unity's jslib serializer cannot carry RegExp (or other non-plain) values in the $MFWS table: it turned
// the first version's SEQ_PATTERN into {} and every send failed in the real build.
for (const [key, value] of Object.entries(lib.MFWS)) {
  if (value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 0 && key !== 'sockets') {
    console.log(`FAIL: $MFWS.${key} is a non-serializable object`); process.exit(1);
  }
  if (value instanceof RegExp) { console.log(`FAIL: $MFWS.${key} is a RegExp`); process.exit(1); }
}
const MFWS = lib.MFWS; // Emscripten exposes $MFWS to the library functions as a global
const str = (text) => { const p = nextPtr++; strings.set(p, text); return p; };

// ── start the real server ──
const server = spawn('node', [path.join(repo, 'server/dist/server/src/index.js')], { env: { ...process.env, PORT: String(port) }, stdio: ['ignore', 'pipe', 'pipe'] });
server.stdout.on('data', (d) => process.stdout.write(`  [server] ${d}`));
server.stderr.on('data', (d) => process.stdout.write(`  [server:err] ${d}`));
await new Promise((r) => setTimeout(r, 1200));

if (!useKeepalive) {
  // Baseline: no keepalive means no hello.ok handling in the bridge.
  MFWS.onServerText = () => {};
}

// ── play the C# side: RoomClient's first frames, then silence ──
let seq = 0; // the C# seq (RoomClient restarts at 1 per connection)
const id = L.MFWS_Create(str(`ws://127.0.0.1:${port}`));
const poll = () => { const p = L.MFWS_PollEvent(id); return p ? strings.get(p) : null; };
const events = [];
const drain = () => { for (let e = poll(); e; e = poll()) events.push(e); };
const csend = (t, d) => L.MFWS_Send(id, str(JSON.stringify({ t, seq: ++seq, d })));
const waitFor = async (pred, ms) => { const end = Date.now() + ms; while (Date.now() < end) { drain(); if (events.some(pred)) return true; await new Promise((r) => setTimeout(r, 20)); } return false; };

let ok = true;
const check = (cond, msg) => { log(`${cond ? 'PASS' : 'FAIL'}: ${msg}`); if (!cond) ok = false; };

check(await waitFor((e) => e === 'o', 3000), 'socket opened');
csend('hello', { protocolVersion: 1, client: 'HOST', appVersion: '0.0.0' });
check(await waitFor((e) => e.startsWith('m{"t":"hello.ok"'), 3000), 'hello.ok received');
csend('room.create', {});
check(await waitFor((e) => e.includes('"room.created"'), 3000), 'room.created received');
const lastCsharpSeqBeforeStall = seq;

log(`C# side goes silent for ${seconds}s (frame loop suspended, as in a backgrounded tab); keepalive ${useKeepalive ? 'ON' : 'OFF'}`);
const stallEnd = Date.now() + seconds * 1000;
let closed = null;
while (Date.now() < stallEnd) {
  drain(); // the bridge keeps queuing events; C# would only read them after the tab returns
  const c = events.find((e) => e[0] === 'c');
  if (c) { closed = c; break; }
  await new Promise((r) => setTimeout(r, 250));
}
const pongs = events.filter((e) => e.includes('"clock.pong"'));
log(`events during stall: ${events.length}, pongs: ${pongs.length}, first pong: ${pongs[0] ?? 'none'}`);
const bye = events.find((e) => e.includes('"bye"'));
if (bye) log(`server bye: ${bye}`);
if (closed) {
  check(!useKeepalive, `connection closed during stall (${closed}); expected only for the no-keepalive baseline`);
} else {
  check(true, `connection survived ${seconds}s of silence`);
  check(pongs.length > 0 && pongs.every((p) => p.includes('"clientTimeMs":0.25')), 'pongs are keepalive pongs (clientTimeMs 0.25)');
  // The tab returns: C# sends frames again. Their seq must be accepted (no BAD_ENVELOPE / bye).
  const before = events.length;
  csend('clock.ping', { clientTimeMs: 123456 });
  csend('clock.ping', { clientTimeMs: 123556 });
  const gotPong = await waitFor((e) => e.includes('"clientTimeMs":123456') && !e.includes('0.25'), 3000);
  drain();
  check(gotPong, `first frame after the stall is accepted (C# seq ${lastCsharpSeqBeforeStall + 1}, wire seq shifted by ${MFWS.sockets[id]?.seqOffset})`);
  check(!events.slice(before).some((e) => e.includes('"error"') || e.includes('"bye"') || e[0] === 'c'), 'no error/bye/close after the stall');
}
L.MFWS_Destroy(id);
server.kill();
log(ok ? 'RESULT: PASS' : 'RESULT: FAIL');
process.exit(ok ? 0 : 1);
