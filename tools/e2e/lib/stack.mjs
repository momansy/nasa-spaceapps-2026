import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { WebSocket, WebSocketServer } from 'ws';
import { clientDir, hostWebDir, schemaDir, serverDir } from './paths.mjs';

const MIME = new Map([
  ['.html', 'text/html; charset=utf-8'], ['.js', 'application/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'], ['.json', 'application/json; charset=utf-8'],
  ['.wasm', 'application/wasm'], ['.svg', 'image/svg+xml'], ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'], ['.jpeg', 'image/jpeg'], ['.glb', 'model/gltf-binary'],
  ['.woff2', 'font/woff2'], ['.unityweb', 'application/octet-stream'],
]);

async function freePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => server.listen(0, '127.0.0.1', resolve).once('error', reject));
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

function resolveFile(urlPath) {
  const clean = decodeURIComponent(urlPath.split('?')[0]);
  if (clean === '/host' || clean.startsWith('/host/')) {
    const rel = clean === '/host' || clean === '/host/' ? 'index.html' : clean.slice('/host/'.length);
    return path.join(hostWebDir, rel);
  }
  const rel = clean === '/' ? 'index.html' : clean.slice(1);
  const candidate = path.join(clientDir, 'dist', rel);
  return fs.existsSync(candidate) && fs.statSync(candidate).isFile() ? candidate : path.join(clientDir, 'dist', 'index.html');
}

// `hosted` (T048): an already running hosted process, e.g. { origin: 'http://localhost:10000' }. No room
// server or static files are started: this recording proxy forwards pages to <origin>/play/client/ and
// WebSocket frames to <origin>/ws, so the phones load the committed docs/play/client build that judges get.
export async function launchStack({ recorder, runDir, hosted = null }) {
  const roomPort = hosted ? 0 : await freePort();
  const stderr = fs.createWriteStream(path.join(runDir, 'server-stderr.log'));
  const stdout = fs.createWriteStream(path.join(runDir, 'server-stdout.log'));
  let connCounter = 0;

  const staticServer = http.createServer(async (req, res) => {
    if (hosted) {
      try {
        const p = req.url ?? '/';
        const target = hosted.origin + (p === '/host' || p.startsWith('/host/') ? '/play' + p : '/play/client' + (p === '/' ? '/' : p));
        const upstream = await fetch(target, { headers: { 'accept-encoding': 'identity' } });
        if (upstream.status >= 400) fs.appendFileSync(path.join(runDir, 'proxy-http-errors.log'), `${upstream.status} ${req.method} ${target}
`);
        const headers = Object.fromEntries([...upstream.headers].filter(([k]) => !['content-encoding', 'content-length', 'transfer-encoding', 'connection'].includes(k)));
        res.writeHead(upstream.status, headers).end(Buffer.from(await upstream.arrayBuffer()));
      } catch (error) { res.writeHead(502).end(error.message); }
      return;
    }
    try {
      const file = resolveFile(req.url ?? '/');
      if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
        res.writeHead(404).end('Not found');
        return;
      }
      const ext = path.extname(file);
      const headers = { 'Content-Type': MIME.get(ext) ?? 'application/octet-stream', 'Cache-Control': 'no-store' };
      if (file.endsWith('.unityweb')) {
        headers['Content-Encoding'] = 'gzip';
        if (file.includes('.wasm.')) headers['Content-Type'] = 'application/wasm';
        else if (file.includes('.framework.js.')) headers['Content-Type'] = 'application/javascript';
      }
      res.writeHead(200, headers);
      fs.createReadStream(file).pipe(res);
    } catch (error) {
      res.writeHead(500).end(error.message);
    }
  });
  await new Promise((resolve, reject) => staticServer.listen(0, '127.0.0.1', resolve).once('error', reject));
  const webPort = staticServer.address().port;

  const room = hosted ? null : spawn(process.execPath, ['dist/server/src/index.js'], {
    cwd: serverDir,
    env: {
      ...process.env,
      PORT: String(roomPort),
      CLIENT_BASE_URL: `http://127.0.0.1:${webPort}/`,
      PROTOCOL_SCHEMA_DIR: schemaDir,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (room) { room.stdout.pipe(stdout); room.stderr.pipe(stderr); }
  if (room) await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('room server did not start in 15 s')), 15000);
    const onData = (chunk) => {
      if (String(chunk).includes('listening')) {
        clearTimeout(timer);
        room.stdout.off('data', onData);
        resolve();
      }
    };
    room.stdout.on('data', onData);
    room.once('exit', (code) => reject(new Error(`room server exited with ${code}`)));
  });

  const wss = new WebSocketServer({ noServer: true });
  staticServer.on('upgrade', (req, socket, head) => {
    if (new URL(req.url, `http://${req.headers.host}`).pathname !== '/ws') {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (client) => wss.emit('connection', client));
  });
  wss.on('connection', (client) => {
    const connId = `c${++connCounter}`;
    let role = 'unknown';
    const upstream = new WebSocket(hosted ? hosted.origin.replace(/^http/, 'ws') + '/ws' : `ws://127.0.0.1:${roomPort}`);
    const pending = [];
    client.on('message', (raw, binary) => {
      if (binary) return client.close(1003, 'text frames only');
      try {
        const env = JSON.parse(raw.toString());
        if (env.t === 'hello') role = env.d.client === 'HOST' ? 'host' : 'player';
        if (env.t === 'room.join' && env.d.as === 'SPECTATOR') role = 'spectator';
      } catch { /* recorder reports it */ }
      recorder.record({ connId, role, direction: 'client_to_server', raw });
      if (upstream.readyState === WebSocket.OPEN) upstream.send(raw.toString()); else pending.push(raw.toString());
    });
    upstream.on('open', () => pending.splice(0).forEach((raw) => upstream.send(raw)));
    upstream.on('message', (raw, binary) => {
      if (binary) return;
      recorder.record({ connId, role, direction: 'server_to_client', raw });
      if (client.readyState === WebSocket.OPEN) client.send(raw.toString());
    });
    client.on('close', () => upstream.close());
    upstream.on('close', (code, reason) => client.readyState === WebSocket.OPEN && client.close(code || 1000, reason.toString()));
    client.on('error', () => upstream.close());
    upstream.on('error', () => client.close(1011, 'upstream error'));
  });

  return {
    webPort,
    roomPort,
    webUrl: `http://127.0.0.1:${webPort}`,
    wsUrl: `ws://127.0.0.1:${webPort}/ws`,
    async close() {
      for (const client of wss.clients) client.terminate();
      wss.close();
      await new Promise((resolve) => staticServer.close(resolve));
      if (room) {
        room.kill();
        await Promise.race([new Promise((resolve) => room.once('exit', resolve)), new Promise((resolve) => setTimeout(resolve, 3000))]);
      }
      stdout.end();
      stderr.end();
    },
  };
}
