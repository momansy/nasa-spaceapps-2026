// T061 helper: stands in for the person at the Unity machine. Opens the committed WebGL host (docs/play/host/) served by a
// running `npm --prefix server run start:hosted`, presses New mission, prints the room code and keeps the host page open.
//   node open-webgl-host.mjs [--origin http://localhost:10000] [--headed] [--screenshot-dir DIR]
// Prints one line `ROOM=XXXX` when room.created arrives; stop it with Ctrl+C (or kill it) to end the room.
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from '@playwright/test';

const argv = process.argv.slice(2);
const value = (name, fallback) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : fallback; };
const origin = value('--origin', 'http://localhost:10000').replace(/\/$/, '');
const shotDir = value('--screenshot-dir', null);
if (shotDir) fs.mkdirSync(shotDir, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const shot = (page, name) => shotDir && page.screenshot({ path: path.join(shotDir, name), timeout: 90000 }).catch(() => {});

const browser = await chromium.launch({ headless: !argv.includes('--headed'), args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
const page = await (await browser.newContext({ viewport: { width: 1920, height: 1080 } })).newPage();
let roomCreated = null;
const hostFrames = [];
page.on('websocket', (ws) => {
  ws.on('framereceived', (f) => { if (typeof f.payload === 'string') { hostFrames.push(f.payload.slice(0, 160)); if (f.payload.includes('"t":"room.created"')) { try { roomCreated = JSON.parse(f.payload); } catch { /* ignore */ } } } });
});
const hostErrors = [];
page.on('pageerror', (e) => hostErrors.push(e.message));
await page.goto(`${origin}/play/host/?server=${encodeURIComponent(origin.replace(/^http/, 'ws') + '/ws')}`, { waitUntil: 'load' });
for (let i = 0; i < 40; i += 1) {
  await sleep(5000);
  const hidden = await page.evaluate(() => { const el = document.querySelector('#mf-loading'); if (!el) return true; const c = getComputedStyle(el); return c.display === 'none' || c.visibility === 'hidden' || Number(c.opacity) < 0.05; }).catch(() => false);
  if (hidden && i > 1) break;
}
await shot(page, 'host-loaded.png');
await page.mouse.click(250, 913).catch(() => {});
for (let i = 0; i < 40 && !roomCreated; i += 1) await sleep(3000);
if (!roomCreated) { await page.keyboard.press('Enter'); for (let i = 0; i < 20 && !roomCreated; i += 1) await sleep(3000); }
await shot(page, 'host-new-mission.png');
if (!roomCreated) { console.error(`no room.created within the wait; host frames: ${JSON.stringify(hostFrames.slice(0, 5))} errors: ${JSON.stringify(hostErrors.slice(0, 3))}`); await browser.close(); process.exit(1); }
console.log(`ROOM=${roomCreated.d.room}`);
const stop = async () => { await browser.close().catch(() => {}); process.exit(0); };
process.on('SIGINT', stop); process.on('SIGTERM', stop);
// --control-file FILE: the person at the Unity machine, by file. Every line appended to FILE is run once:
//   click X Y   (1920 x 1080 canvas coordinates)   |   key Enter   |   shot NAME
const controlFile = value('--control-file', null);
let done = 0;
for (;;) {
  if (controlFile && fs.existsSync(controlFile)) {
    const lines = fs.readFileSync(controlFile, 'utf8').split(/\r?\n/).filter(Boolean);
    for (; done < lines.length; done += 1) {
      const [cmd, a, b] = lines[done].trim().split(/\s+/);
      if (cmd === 'click') await page.mouse.click(Number(a), Number(b)).catch(() => {});
      else if (cmd === 'key') await page.keyboard.press(a).catch(() => {});
      else if (cmd === 'shot') await shot(page, `${a}.png`);
      console.log(`control: ${lines[done]}`);
    }
  }
  await sleep(1000);
  if (Date.now() % 20000 < 1000) await shot(page, 'host-latest.png');
}
