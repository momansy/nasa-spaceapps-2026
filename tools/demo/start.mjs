// One-command MissionForge demo (T029 step 3):  npm --prefix tools/demo run demo
// Starts the room server and serves docs/ (host + phone client) with a /ws proxy to the room server.
// Flags: see tools/demo/README.md.
import { spawn } from 'node:child_process';
import { closeSync, createReadStream, existsSync, openSync, readFileSync, readSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import net from 'node:net';
import { join } from 'node:path';
import qrcode from 'qrcode-terminal';
import WebSocket from 'ws';
import { buildClient } from './build-client.mjs';
import { PATHS, ensureDeps, flag, run } from './lib.mjs';
import { lanCandidates, mimeFor, pickLanIp, safeResolve } from './net-utils.mjs';

const HELP = `MissionForge one-command demo

  npm --prefix tools/demo run demo -- [flags]

  --port <n>          static site + /ws proxy port (default 8080)
  --server-port <n>   room server port (default 8787)
  --lan-ip <ip>       address phones use to reach this laptop (default: detected)
  --no-build          never build; fail if server/dist or docs/play/client is missing
  --mock              static files only, no room server (rehearsal with /play/client/?mock=1; the host cannot create a room)
  --open              open the host URL in the default browser
  --help              this text
`;

function fail(msg) {
  console.error(`\nERROR: ${msg}\n`);
  process.exit(1);
}

const args = process.argv.slice(2);
if (args.includes('--help') || args.includes('-h')) {
  console.log(HELP);
  process.exit(0);
}
const port = Number(flag(args, '--port', 8080));
const serverPort = Number(flag(args, '--server-port', 8787));
const noBuild = args.includes('--no-build');
const mock = args.includes('--mock');
const wantOpen = args.includes('--open');
const lanFlag = flag(args, '--lan-ip', null);
if (lanFlag !== null && (typeof lanFlag !== 'string' || !net.isIPv4(lanFlag))) fail('--lan-ip needs an IPv4 address, for example --lan-ip 192.168.1.20');
for (const name of ['--port', '--server-port']) {
  if (args.includes(name) && (args[args.indexOf(name) + 1] === undefined || args[args.indexOf(name) + 1].startsWith('--'))) fail(`${name} needs a number`);
}
for (const [name, v] of [['--port', port], ['--server-port', serverPort]]) {
  if (!Number.isInteger(v) || v < 1 || v > 65535) fail(`${name} must be a port number 1-65535`);
}
if (!mock && port === serverPort) fail('--port and --server-port must differ');

// ---------------------------------------------------------------------------------- build if missing
if (!existsSync(join(PATHS.playClient, 'index.html'))) {
  if (noBuild) fail('docs/play/client/ is missing and --no-build was given. Run: node tools/demo/build-client.mjs');
  console.log('docs/play/client/ is missing: building the phone client.');
  buildClient();
}
if (!mock && !existsSync(PATHS.serverEntry)) {
  if (noBuild) fail('server/dist is missing and --no-build was given. Run: npm --prefix server run build');
  console.log('server/dist is missing: building the room server.');
  ensureDeps(PATHS.server);
  run('npm run build', PATHS.server);
}
if (!mock && !existsSync(join(PATHS.server, 'node_modules'))) {
  if (noBuild) fail('server/node_modules is missing and --no-build was given. Run: npm --prefix server ci');
  ensureDeps(PATHS.server);
}
if (!existsSync(join(PATHS.docs, 'play', 'host', 'Build', 'host.loader.js'))) {
  console.warn('WARNING: docs/play/host/Build/host.loader.js is missing; the big-screen host will not load.');
}

// ---------------------------------------------------------------------------------- addresses
let lanIp = typeof lanFlag === 'string' ? lanFlag : pickLanIp();
let loopbackOnly = false;
if (!lanIp) {
  loopbackOnly = true;
  lanIp = '127.0.0.1';
}
const shutdownHooks = [];
let shuttingDown = false;

// ---------------------------------------------------------------------------------- room server
function portFree(p) {
  return new Promise((resolve) => {
    const probe = net.createServer();
    probe.once('error', () => resolve(false));
    probe.once('listening', () => probe.close(() => resolve(true)));
    probe.listen(p);
  });
}
if (!mock && !(await portFree(serverPort))) fail(`room server port ${serverPort} is already in use (another demo or room server running?). Stop it or pick another with --server-port <n>.`);
if (!mock) {
  const serverChild = spawn(process.execPath, [PATHS.serverEntry], {
    cwd: PATHS.server,
    env: {
      ...process.env,
      PORT: String(serverPort),
      PROTOCOL_SCHEMA_DIR: PATHS.schemaDir,
      CLIENT_BASE_URL: `http://${lanIp}:${port}/play/client/`,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const prefix = (stream, out) => {
    let buf = '';
    stream.on('data', (d) => {
      buf += d.toString();
      const lines = buf.split(/\r?\n/);
      buf = lines.pop();
      for (const l of lines) if (l.trim()) out(`[room-server] ${l}`);
    });
  };
  prefix(serverChild.stdout, console.log);
  prefix(serverChild.stderr, console.error);
  serverChild.on('exit', (code, signal) => {
    if (!shuttingDown) {
      console.error(`\n[room-server] exited unexpectedly (code ${code}, signal ${signal}). Stopping the demo.`);
      shutdown(1);
    }
  });
  shutdownHooks.push(() => serverChild.kill());
}

// ---------------------------------------------------------------------------------- static site + /ws proxy
const gzipCache = new Map();
function looksGzipped(file) {
  if (!gzipCache.has(file)) {
    const fd = openSync(file, 'r');
    const b = Buffer.alloc(2);
    readSync(fd, b, 0, 2, 0);
    closeSync(fd);
    gzipCache.set(file, b[0] === 0x1f && b[1] === 0x8b);
  }
  return gzipCache.get(file);
}

const NO_CACHE = { 'Cache-Control': 'no-store, no-cache, must-revalidate', Pragma: 'no-cache', Expires: '0' };

function notFound(res) {
  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8', ...NO_CACHE });
  res.end('Not found');
}

const web = createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/') {
    res.writeHead(302, { Location: '/play/' + url.search, ...NO_CACHE });
    return res.end();
  }
  let file = safeResolve(PATHS.docs, url.pathname);
  if (!file || !existsSync(file)) return notFound(res);
  let st = statSync(file);
  if (st.isDirectory()) {
    if (!url.pathname.endsWith('/')) {
      res.writeHead(301, { Location: url.pathname + '/' + url.search, ...NO_CACHE });
      return res.end();
    }
    file = join(file, 'index.html');
    if (!existsSync(file)) return notFound(res);
    st = statSync(file);
  }
  const headers = { 'Content-Type': mimeFor(file), 'Content-Length': st.size, ...NO_CACHE };
  if (file.toLowerCase().endsWith('.unityweb') && looksGzipped(file)) headers['Content-Encoding'] = 'gzip';
  res.writeHead(200, headers);
  if (req.method === 'HEAD') return res.end();
  createReadStream(file).pipe(res);
});

// Raw TCP pipe for WebSocket upgrades on /ws: the phone build connects to same-origin /ws.
web.on('upgrade', (req, socket, head) => {
  const path = new URL(req.url, 'http://x').pathname;
  if (mock || (path !== '/ws' && !path.startsWith('/ws/'))) {
    socket.end('HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n');
    return;
  }
  const upstream = net.connect(serverPort, '127.0.0.1', () => {
    let raw = `${req.method} ${req.url} HTTP/1.1\r\n`;
    for (let i = 0; i < req.rawHeaders.length; i += 2) raw += `${req.rawHeaders[i]}: ${req.rawHeaders[i + 1]}\r\n`;
    upstream.write(raw + '\r\n');
    if (head && head.length) upstream.write(head);
    socket.pipe(upstream);
    upstream.pipe(socket);
  });
  const drop = () => {
    socket.destroy();
    upstream.destroy();
  };
  upstream.on('error', drop);
  socket.on('error', drop);
  upstream.on('close', () => socket.destroy());
  socket.on('close', () => upstream.destroy());
});
web.on('error', (e) => {
  if (e.code === 'EADDRINUSE') fail(`port ${port} is already in use. Pick another with --port <n>.`);
  fail(String(e.message || e));
});
shutdownHooks.push(() => {
  web.close();
  web.closeAllConnections();
});
web.listen(port, '0.0.0.0', () => void onListening());

// ---------------------------------------------------------------------------------- health check
function protocolVersion() {
  try {
    const m = /PROTOCOL_VERSION\s*=\s*(\d+)/.exec(readFileSync(join(PATHS.repo, 'protocol', 'ts', 'messages.ts'), 'utf8'));
    return m ? Number(m[1]) : 1;
  } catch {
    return 1;
  }
}

/** hello -> hello.ok within `timeoutMs` (protocol/messages.md section 2). */
function healthCheck(url, timeoutMs = 5000) {
  return new Promise((resolve) => {
    const ws = new WebSocket(url);
    let finished = false;
    const timer = setTimeout(() => done(false, 'no hello.ok within 5 s'), timeoutMs);
    function done(ok, why) {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      try {
        ws.terminate();
      } catch {
        /* already closed */
      }
      resolve({ ok, why });
    }
    ws.on('open', () =>
      ws.send(
        JSON.stringify({
          t: 'hello',
          seq: 1,
          d: { protocolVersion: protocolVersion(), client: 'PHONE', appVersion: 'demo-healthcheck', lang: 'en' },
        }),
      ),
    );
    ws.on('message', (raw) => {
      try {
        const m = JSON.parse(raw.toString());
        if (m.t === 'hello.ok') done(true);
        else if (m.t === 'error') done(false, `server replied error ${JSON.stringify(m.d)}`);
      } catch {
        /* ignore non-JSON */
      }
    });
    ws.on('error', (e) => done(false, e.message || String(e)));
  });
}

async function waitForServer(url) {
  const until = Date.now() + 15000;
  let last = { ok: false, why: 'not started' };
  while (Date.now() < until) {
    last = await healthCheck(url);
    if (last.ok) return last;
    await new Promise((r) => setTimeout(r, 500));
  }
  return last;
}

// ---------------------------------------------------------------------------------- banner
async function onListening() {
  const base = `http://${lanIp}:${port}`;
  const hostUrl = mock
    ? `http://localhost:${port}/play/host/`
    : `http://localhost:${port}/play/host/?server=ws://localhost:${serverPort}`;
  const phoneUrl = mock ? `${base}/play/client/?mock=1` : `${base}/play/client/`;
  const audienceUrl = `${base}/play/client/?watch=1`;
  const mockUrl = `${base}/play/client/?mock=1`;

  let health = null;
  if (!mock) {
    health = await waitForServer(`ws://127.0.0.1:${serverPort}`);
    if (health.ok) health = await healthCheck(`ws://127.0.0.1:${port}/ws`); // the path phones will use
  }

  const rule = '='.repeat(72);
  console.log(`\n${rule}\n MissionForge demo ${mock ? '(MOCK: static files only, no room server)' : 'is running'}\n${rule}`);
  if (loopbackOnly) {
    console.log(' WARNING: no LAN address found (only loopback). Phones cannot reach this laptop.');
    console.log('          Join a Wi-Fi network or hotspot, or pass --lan-ip <address>. Using 127.0.0.1 for now.\n');
  } else {
    const others = lanCandidates().filter((a) => a.address !== lanIp);
    if (others.length && typeof lanFlag !== 'string') {
      console.log(` Using LAN address ${lanIp}. Also seen: ${others.map((a) => `${a.address} (${a.name})`).join(', ')}.`);
      console.log(' Wrong one? Restart with --lan-ip <address>.\n');
    }
  }
  if (!mock) {
    if (health && health.ok) {
      console.log(` Health check: OK (hello -> hello.ok directly on port ${serverPort} and through the /ws proxy on port ${port}).`);
    } else {
      console.log(` Health check: FAILED (${health && health.why}). The room server is not answering; see its log above.`);
    }
  }
  if (!mock) console.log(`\n Host (big screen; laptop or desktop browser, full screen at 1920x1080):\n   ${hostUrl}`);
  if (mock) {
    console.log(`\n Phone, scripted mock session (no room server, nothing to join):\n   ${phoneUrl}`);
  } else {
    console.log(`\n Phone (players):\n   ${phoneUrl}`);
    console.log(`\n Audience (watch and vote from phones; add &room=CODE or type the code):\n   ${audienceUrl}`);
    console.log(`\n Offline fallback (scripted mock session on the phone, no server needed):\n   ${mockUrl}`);
  }
  console.log(`\n Entry page: ${base}/play/     Credits: ${base}/play/credits.html`);
  console.log('\n Scan to open the phone client:\n');
  qrcode.generate(phoneUrl, { small: true }, (qr) => console.log(qr.split('\n').map((l) => '   ' + l).join('\n')));
  console.log(`\n   ${phoneUrl}`);
  if (!mock) console.log('\n The QR code in the host lobby points phones at the same address with ?room=CODE.');
  console.log('\n If phones cannot connect: allow Node.js through the OS firewall for private networks,');
  console.log(' check that the Wi-Fi or hotspot has no client isolation, and try the phone URL above first.');
  console.log(`\n Press Ctrl+C to stop everything.\n${rule}\n`);
  if (wantOpen) openBrowser(mock ? phoneUrl : hostUrl);
}

function openBrowser(url) {
  const cmd =
    process.platform === 'win32' ? `start "" "${url}"` : process.platform === 'darwin' ? `open "${url}"` : `xdg-open "${url}"`;
  spawn(cmd, { shell: true, stdio: 'ignore', detached: true }).unref();
}

// ---------------------------------------------------------------------------------- shutdown
function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log('\nStopping MissionForge demo...');
  for (const h of shutdownHooks) {
    try {
      h();
    } catch {
      /* best effort */
    }
  }
  setTimeout(() => process.exit(code), 300).unref();
}
process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));
