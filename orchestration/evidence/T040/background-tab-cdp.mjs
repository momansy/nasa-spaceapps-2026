// T040 step 4 (true background): drives a real Google Chrome over raw CDP, WITHOUT Playwright's
// "always visible" emulation, so switching tabs really hides the host tab (document.visibilityState
// 'hidden', animation frames stop, page timers throttled). The Unity WebGL host from --host-dir
// (default docs/play/host) talks to the real room server. Records WebSocket frames, closes and
// screenshots under orchestration/evidence/T040/<label>/.
//
//   node orchestration/evidence/T040/background-tab-cdp.mjs [--seconds 60] [--label after-true-background] [--host-dir <dir>]
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '..', '..', '..');
const { WebSocket } = createRequire(path.join(repo, 'server/package.json'))('ws');
const argv = process.argv.slice(2);
const val = (n, d) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : d; };
const seconds = Number(val('--seconds', 60));
const label = val('--label', 'after-true-background');
const hostDir = path.resolve(val('--host-dir', path.join(repo, 'docs/play/host')));
const [vw, vh] = val('--viewport', '1280x720').split('x').map(Number);
const outDir = path.join(here, label);
fs.mkdirSync(outDir, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const t0 = Date.now();
const lines = [];
const log = (m) => { const l = `[${((Date.now() - t0) / 1000).toFixed(1).padStart(6)}s] ${m}`; console.log(l); lines.push(l); };

const roomPort = 19000 + Math.floor(Math.random() * 400);
const webPort = roomPort + 400;
const cdpPort = roomPort + 800;
const server = spawn('node', [path.join(repo, 'server/dist/server/src/index.js')], { env: { ...process.env, PORT: String(roomPort) }, stdio: 'ignore' });
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.wasm': 'application/wasm', '.png': 'image/png', '.css': 'text/css' };
const web = http.createServer((req, res) => {
  const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/play\/host\/?/, '') || 'index.html';
  const file = path.join(hostDir, rel);
  if (!file.startsWith(hostDir) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.statusCode = 404; res.end(); return; }
  res.setHeader('Content-Type', MIME[path.extname(file)] ?? 'application/octet-stream');
  fs.createReadStream(file).pipe(res);
}).listen(webPort);
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 't040-chrome-'));
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [`--remote-debugging-port=${cdpPort}`, `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check', `--window-size=${vw},${vh + 100}`, '--autoplay-policy=no-user-gesture-required', 'about:blank'], { stdio: 'ignore' });
const getJson = (p, method = 'GET') => new Promise((resolve, reject) => { const r = http.request({ host: '127.0.0.1', port: cdpPort, path: p, method }, (res) => { let b = ''; res.on('data', (d) => (b += d)); res.on('end', () => resolve(b)); }); r.on('error', reject); r.end(); });
for (let i = 0; i < 40; i++) { try { await getJson('/json/version'); break; } catch { await sleep(500); } }

class Cdp {
  constructor(wsUrl) { this.id = 0; this.pending = new Map(); this.handlers = []; this.ws = new WebSocket(wsUrl, { perMessageDeflate: false }); this.ready = new Promise((r) => this.ws.on('open', r)); this.ws.on('message', (m) => { const o = JSON.parse(m); if (o.id && this.pending.has(o.id)) { this.pending.get(o.id)(o); this.pending.delete(o.id); } else this.handlers.forEach((h) => h(o)); }); }
  send(method, params = {}) { const id = ++this.id; this.ws.send(JSON.stringify({ id, method, params })); return new Promise((r) => this.pending.set(id, r)); }
  on(h) { this.handlers.push(h); }
}
const newTab = async (url) => { const t = JSON.parse(await getJson(`/json/new?${encodeURIComponent(url)}`, 'PUT')); const c = new Cdp(t.webSocketDebuggerUrl); await c.ready; return { id: t.id, cdp: c }; };

const roomWs = `ws://127.0.0.1:${roomPort}`;
const host = await newTab(`http://127.0.0.1:${webPort}/play/host/?server=${encodeURIComponent(roomWs)}`);
const stats = { keepalivePings: 0, unityPings: 0, closes: 0, opens: 0, byes: [] };
let roomCode = null;
const sockets = new Map();
host.cdp.on((o) => {
  if (o.method === 'Network.webSocketCreated') { stats.opens++; sockets.set(o.params.requestId, o.params.url); log(`host WebSocket created ${o.params.url}`); }
  if (o.method === 'Network.webSocketClosed') { stats.closes++; log('host WebSocket CLOSED'); }
  if (o.method === 'Network.webSocketFrameSent') {
    const p = o.params.response.payloadData;
    if (p.includes('"clock.ping"')) { if (p.includes('"clientTimeMs":0.25')) stats.keepalivePings++; else stats.unityPings++; }
  }
  if (o.method === 'Network.webSocketFrameReceived') {
    const p = o.params.response.payloadData;
    const m = /"t":"room\.created".*?"room":"([A-Z0-9]{4})"/.exec(p);
    if (m) { roomCode = m[1]; log(`room.created ${roomCode}`); }
    if (p.includes('"t":"bye"')) { stats.byes.push(p); log(`server bye: ${p}`); }
  }
});
await host.cdp.send('Network.enable');
await host.cdp.send('Page.enable');
const evalHost = async (expression) => (await host.cdp.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })).result?.result?.value;
const shot = async (name) => {
  await getJson(`/json/activate/${host.id}`);
  await sleep(1500);
  const r = await host.cdp.send('Page.captureScreenshot', { format: 'png' });
  if (r.result?.data) fs.writeFileSync(path.join(outDir, name), Buffer.from(r.result.data, 'base64'));
  log(`screenshot ${name}`);
};
for (let i = 0; i < 90 && !stats.opens; i++) await sleep(1000);
await sleep(15000);
await host.cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: Math.round(250 * vw / 1920), y: Math.round(913 * vh / 1080), button: 'left', clickCount: 1 });
await host.cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: Math.round(250 * vw / 1920), y: Math.round(913 * vh / 1080), button: 'left', clickCount: 1 });
for (let i = 0; i < 60 && !roomCode; i++) await sleep(1000);
log(`room code: ${roomCode}`);
await shot('1-before-background.png');

// Real background: open and activate another tab.
const other = await newTab('about:blank');
await getJson(`/json/activate/${other.id}`);
await sleep(2000);
const visibility = await evalHost('document.visibilityState');
log(`host tab document.visibilityState with another tab in front: ${visibility}`);
const before = { ...stats };
log(`host tab in the background for ${seconds}s`);
await sleep(seconds * 1000);
log(`while backgrounded: keepalive pings ${stats.keepalivePings - before.keepalivePings}, Unity pings ${stats.unityPings - before.unityPings}, WebSocket closes ${stats.closes - before.closes}`);
await shot('2-after-return.png');
log(`host tab visibilityState after return: ${await evalHost('document.visibilityState')}`);
await sleep(20000);
await shot('3-after-return-20s.png');

const result = { label, seconds, roomCode, visibilityWhileBackgrounded: visibility, websocketsOpened: stats.opens, closes: stats.closes, byes: stats.byes, keepalivePings: stats.keepalivePings, unityPings: stats.unityPings };
const pass = !!roomCode && stats.closes === 0 && stats.opens === 1 && visibility === 'hidden';
log(`RESULT ${pass ? 'PASS' : 'FAIL'} ${JSON.stringify(result)}`);
fs.writeFileSync(path.join(outDir, 'run.log'), lines.join('\n') + '\n');
fs.writeFileSync(path.join(outDir, 'result.json'), JSON.stringify({ pass, ...result }, null, 2));
chrome.kill(); web.close(); server.kill();
fs.rmSync(profile, { recursive: true, force: true });
process.exit(pass ? 0 : 1);
