// T029 step 8 verification. Run against a RUNNING `npm --prefix tools/demo run demo` (default ports).
//   node verify.mjs --repo <fresh-copy> --demo-out <file with the demo's terminal output> --out <evidence dir> --tools <dir with jsqr + pngjs>
// Uses playwright-core from <repo>/client/node_modules (Chromium installed with `npx playwright install chromium`).
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const arg = (n, d) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : d; };
const repo = arg('--repo');
const demoOut = readFileSync(arg('--demo-out'), 'utf8');
const out = arg('--out');
const tools = arg('--tools');
mkdirSync(out, { recursive: true });
const requireClient = createRequire(join(repo, 'client', 'package.json'));
const requireTools = createRequire(join(tools, 'package.json'));
const { chromium } = requireClient('playwright-core');
const jsQR = requireTools('jsqr');
const { PNG } = requireTools('pngjs');

const results = [];
const log = (ok, what, detail = '') => { results.push({ ok, what, detail }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}${detail ? '  -- ' + detail : ''}`); };

// ---- 1. terminal QR -> image -> decode, compare with the printed phone URL
const lines = demoOut.split(/\r?\n/);
const phoneUrl = /Phone \(players\):\s*\n\s*(\S+)/.exec(demoOut)[1];
const start = lines.findIndex((l) => l.includes('Scan to open the phone client')) + 1;
const qr = [];
for (let i = start; i < lines.length; i++) {
  const l = lines[i].replace(/^ {3}/, '');
  if (/^[ ▀▄█]+$/.test(l) && l.trim() !== '') qr.push(l);
  else if (qr.length) break;
}
// qrcode-terminal "small" mode: full block = light/light, upper half = light/dark, lower half = dark/light, space = dark/dark.
const S = 8;
const width = Math.max(...qr.map((l) => l.length));
const png = new PNG({ width: width * S, height: qr.length * 2 * S });
const px = (x, y, v) => { const o = (y * png.width + x) * 4; png.data[o] = png.data[o + 1] = png.data[o + 2] = v; png.data[o + 3] = 255; };
qr.forEach((line, row) => {
  for (let col = 0; col < width; col++) {
    const ch = line[col] ?? ' ';
    const top = ch === '█' || ch === '▀' ? 255 : 0;
    const bottom = ch === '█' || ch === '▄' ? 255 : 0;
    for (let dy = 0; dy < S; dy++) for (let dx = 0; dx < S; dx++) {
      px(col * S + dx, row * 2 * S + dy, top);
      px(col * S + dx, (row * 2 + 1) * S + dy, bottom);
    }
  }
});
writeFileSync(join(out, 'terminal-qr.png'), PNG.sync.write(png));
const decoded = jsQR(new Uint8ClampedArray(png.data), png.width, png.height);
writeFileSync(join(out, 'qr-decoded.txt'), `printed phone URL: ${phoneUrl}\ndecoded QR value:  ${decoded ? decoded.data : '(decode failed)'}\n`);
log(Boolean(decoded) && decoded.data === phoneUrl, 'terminal QR decodes to the printed phone URL', decoded ? decoded.data : 'decode failed');

const base = new URL(phoneUrl).origin; // LAN address, as a phone would use
const GPU = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'];
const hostBrowser = await chromium.launch({ args: GPU }); // the host renders WebGL in software
const browser = await chromium.launch(); // phones and static pages in their own process, so the host cannot starve them

// ---- 2. host at 1920x1080: connects, "New mission" creates a room
const hostCtx = await hostBrowser.newContext({ viewport: { width: 1920, height: 1080 } });
const host = await hostCtx.newPage();
let roomCode = null;
const hostFrames = [];
host.on('websocket', (ws) => {
  ws.on('framereceived', (f) => {
    const s = String(f.payload);
    hostFrames.push(s.slice(0, 240));
    const m = /"t":"room\.created".*?"room":"([A-Z]{4})"/.exec(s);
    if (m) roomCode = m[1];
  });
});
await host.goto('http://localhost:8080/play/host/?server=ws://localhost:8787');
for (let i = 0; i < 120 && !hostFrames.some((f) => f.includes('"hello.ok"')); i++) await host.waitForTimeout(1000); // wasm + data (25 MB, gzip) under software GL
await host.waitForTimeout(3000);
await host.screenshot({ path: join(out, 'host-title-1920x1080.png') });
for (let i = 0; i < 12 && !roomCode; i++) {
  await host.mouse.click(250, 912); // "New mission"
  for (let j = 0; j < 8 && !roomCode; j++) await host.waitForTimeout(1000);
}
await host.waitForTimeout(4000);
await host.screenshot({ path: join(out, 'host-lobby-1920x1080.png') });
log(Boolean(roomCode), 'host creates a room (room.created seen on the host WebSocket)', `code ${roomCode}`);
if (!roomCode) { writeFileSync(join(out, 'host-frames.txt'), hostFrames.join('\n')); throw new Error('no room code'); }

// ---- 3. three phones (390x844): two via the QR URL, one via /play/?room=CODE
async function phone(name, entry) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e)));
  await page.goto(entry);
  if (entry.includes('?room=')) {
    await page.waitForURL(/\/play\/client\/\?room=/, { timeout: 10000 });
  } else {
    await page.getByTestId('join-code').fill(roomCode);
  }
  await page.getByTestId('join-nick').fill(name);
  await page.screenshot({ path: join(out, `phone-${name}-join.png`) });
  await page.getByTestId('join-submit').click();
  let joined = true;
  try { await page.getByTestId('screen-lobby').waitFor({ timeout: 15000 }); } catch { joined = false; }
  await page.waitForTimeout(1500);
  await page.screenshot({ path: join(out, `phone-${name}-lobby.png`) });
  log(joined, `phone ${name} joined via ${entry.includes('?room=') ? '/play/?room=CODE (entry page forward)' : 'the printed QR/phone URL + typed code'}`, page.url() + (errs.length ? ' pageerrors: ' + errs.join('; ') : ''));
  return { ctx, page };
}
const p1 = await phone('Ada', phoneUrl);
const p2 = await phone('Grace', phoneUrl);
const p3 = await phone('Katherine', `${base}/play/?room=${roomCode}`);
await host.waitForTimeout(4000);
await host.screenshot({ path: join(out, 'host-lobby-3-players-1920x1080.png') });
await p1.page.screenshot({ path: join(out, 'phone-Ada-after.png') });

// ---- 4. entry page and credits: local links all 200, no external requests, readable at 390 and 1920
async function pageChecks(path) {
  for (const vp of [{ width: 390, height: 844 }, { width: 1920, height: 1080 }]) {
    const ctx = await browser.newContext({ viewport: vp });
    const page = await ctx.newPage();
    const external = [];
    page.on('request', (r) => { if (!r.url().startsWith(base) && !r.url().startsWith('data:')) external.push(r.url()); });
    await page.goto(`${base}${path}`);
    await page.waitForTimeout(500);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    await page.screenshot({ path: join(out, `${path.replace(/\W+/g, '_')}-${vp.width}.png`), fullPage: vp.width === 390 });
    log(external.length === 0, `${path} at ${vp.width}px makes no external request`, external.join(', '));
    log(overflow <= 0, `${path} at ${vp.width}px has no horizontal page scroll`, `overflow ${overflow}px`);
    await ctx.close();
  }
  const html = await (await fetch(`${base}${path}`)).text();
  const hrefs = [...html.matchAll(/(?:href|src)="([^"]+)"/g)].map((m) => m[1]).filter((h) => !/^(https?:|mailto:|#|data:)/.test(h));
  const external = [...html.matchAll(/(?:src|<link[^>]*href)="(https?:[^"]+)"/g)].map((m) => m[1]);
  log(external.length === 0, `${path}: no external src/stylesheet`, external.join(', '));
  const lines = [];
  for (const h of new Set(hrefs)) {
    const url = new URL(h, `${base}${path}`);
    const r = await fetch(url);
    lines.push(`${r.status}  ${url.pathname}${url.search}`);
    log(r.status === 200, `${path} local link ${h}`, String(r.status));
  }
  return lines;
}
const linkLines = [];
for (const path of ['/play/', '/play/credits.html', '/play/judges.html']) linkLines.push(`# ${path}`, ...(await pageChecks(path)));
writeFileSync(join(out, 'link-check.txt'), linkLines.join('\n') + '\n');

// ---- 5. proxy and headers
const wasm = await fetch(`${base}/play/host/Build/host.wasm.unityweb`, { method: 'HEAD' });
log(wasm.headers.get('content-encoding') === 'gzip' && wasm.headers.get('content-type') === 'application/wasm', 'host.wasm.unityweb served as gzip + application/wasm', `${wasm.headers.get('content-encoding')} ${wasm.headers.get('content-type')}`);
const root = await fetch(`${base}/`, { redirect: 'manual' });
log(root.status === 302 && root.headers.get('location') === '/play/', '/ redirects to /play/');
const trav = await fetch(`${base}/..%2f..%2fREADME.md`);
log(trav.status === 404, 'path traversal returns 404', String(trav.status));

writeFileSync(join(out, 'host-frames.txt'), hostFrames.join('\n') + '\n');
writeFileSync(join(out, 'verify-results.txt'), results.map((r) => `${r.ok ? 'PASS' : 'FAIL'}  ${r.what}${r.detail ? '  -- ' + r.detail : ''}`).join('\n') + '\n');
await browser.close();
await hostBrowser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
