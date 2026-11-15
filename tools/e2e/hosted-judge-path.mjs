// T048 step 3: the judge's browser path against a running hosted process (npm --prefix server run start:hosted).
//   node hosted-judge-path.mjs [--origin http://localhost:10000] [--headed] [--phones 3]
// Entry page -> click "Host a mission" -> real Unity WebGL host -> New mission -> room.created (join URL)
// -> N phone contexts open ONLY that join link (no ?server=) -> lobby. Screenshots every step.
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from '@playwright/test';
import { evidenceDir } from './lib/paths.mjs';

const argv = process.argv.slice(2);
const value = (name, fallback) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : fallback; };
const origin = value('--origin', 'http://localhost:10000').replace(/\/$/, '');
const headed = argv.includes('--headed');
const phoneCount = Number(value('--phones', '3'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const runDir = path.join(evidenceDir, 'runs', `${new Date().toISOString().replace(/[:.]/g, '-')}-hosted-judge-path${headed ? '-headed' : ''}`);
fs.mkdirSync(runDir, { recursive: true });
const out = { origin, headed, steps: [], notes: [] };
const step = (name, ok, detail = {}) => { out.steps.push({ name, ok, at: new Date().toISOString(), ...detail }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`, JSON.stringify(detail).slice(0, 300)); };
const shot = (page, name, timeout = 90000) => page.screenshot({ path: path.join(runDir, name), timeout }).catch((e) => out.notes.push(`${name} failed: ${String(e.message).slice(0, 80)}`));

const browser = await chromium.launch({ headless: !headed, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
const page = await ctx.newPage();
const errors = []; const failed = []; const frames = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(e.message));
page.on('response', (r) => { if (r.status() >= 400) failed.push(`${r.status()} ${r.url()}`); });
let roomCreated = null; let wsUrl = null;
page.on('websocket', (ws) => { wsUrl = ws.url(); ws.on('framereceived', (f) => { if (typeof f.payload !== 'string') return; if (frames.length < 40) frames.push(f.payload.slice(0, 200)); if (f.payload.includes('"t":"room.created"')) { try { roomCreated = JSON.parse(f.payload); } catch { /* ignore */ } } }); });

// 1. Entry page and the Host link.
const t0 = Date.now();
await page.goto(`${origin}/play/`, { waitUntil: 'load' });
await shot(page, '01-entry.png');
const hostHref = await page.locator('#host-link').getAttribute('href');
step('entry page: Host a mission link carries the same-origin ws URL', hostHref === `host/?server=${encodeURIComponent(origin.replace(/^http/, 'ws') + '/ws')}`, { href: hostHref });
await page.locator('#host-link').click();
await page.waitForURL(/\/play\/host\//, { timeout: 15000 });
step('Host a mission navigates to /play/host/', true, { url: page.url() });

// 2. Unity host loads.
const loadStart = Date.now();
let loaded = false;
for (let i = 0; i < 36 && !loaded; i += 1) {
  await sleep(5000);
  const vis = await page.evaluate(() => { const el = document.querySelector('#mf-loading'); if (!el) return false; const c = getComputedStyle(el); return c.display !== 'none' && c.visibility !== 'hidden' && Number(c.opacity) > 0.05; }).catch(() => true);
  if (!vis && i > 1) loaded = true;
  if (i === 3) await shot(page, '02-host-loading-20s.png');
}
out.loadSeconds = Math.round((Date.now() - loadStart) / 1000);
await shot(page, '03-host-loaded.png');
const status = await page.locator('#mf-status').textContent().catch(() => null);
step('Unity WebGL host finished loading (loading overlay hidden)', loaded, { seconds: out.loadSeconds, status, wsUrl });

// 3. New mission.
await page.mouse.click(250, 913).catch(() => {});
for (let i = 0; i < 40 && !roomCreated; i += 1) await sleep(3000);
if (!roomCreated) { await page.keyboard.press('Enter'); for (let i = 0; i < 20 && !roomCreated; i += 1) await sleep(3000); }
await sleep(20000);
await shot(page, '04-host-new-mission.png');
const room = roomCreated?.d?.room ?? null;
const joinUrl = roomCreated?.d?.joinUrl ?? roomCreated?.d?.clientUrl ?? JSON.stringify(roomCreated?.d ?? {}).match(/https?:[^"]+/)?.[0] ?? null;
out.roomCreatedPayload = roomCreated?.d ? { ...roomCreated.d, hostToken: roomCreated.d.hostToken ? '<redacted>' : undefined } : null;
step('New mission: host received room.created (4-letter code)', /^[A-Z0-9]{4}$/.test(room ?? ''), { room });
step(`join link points at ${origin}/play/client/?room=CODE`, joinUrl === `${origin}/play/client/?room=${room}`, { joinUrl });

// 4. Phones join with only the link.
const phones = [];
if (room) {
  for (let i = 0; i < phoneCount; i += 1) {
    const pc = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    const pp = await pc.newPage();
    const perr = []; pp.on('console', (m) => { if (m.type() === 'error') perr.push(m.text()); });
    await pp.goto(joinUrl ?? `${origin}/play/client/?room=${room}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await pp.getByTestId('screen-join').waitFor({ state: 'visible', timeout: 20000 });
    if (i === 0) await shot(pp, '05-phone1-join.png');
    await pp.getByTestId('join-nick').fill(`Judge${i + 1}`);
    await pp.getByTestId('join-submit').click();
    const ok = await pp.getByTestId('screen-lobby').waitFor({ state: 'visible', timeout: 25000 }).then(() => true, () => false);
    await sleep(800);
    await shot(pp, `06-phone${i + 1}-lobby.png`);
    step(`phone ${i + 1} joined from the link only and shows the lobby`, ok, { errors: perr.slice(0, 3) });
    phones.push({ pc, pp });
  }
  await sleep(headed ? 15000 : 60000);
  await shot(page, '07-host-with-phones.png');
}
out.host = { errors: errors.slice(0, 10), failedRequests: failed.slice(0, 10), frames: frames.slice(0, 8), totalSeconds: Math.round((Date.now() - t0) / 1000) };
for (const { pc } of phones) await pc.close();
await browser.close();
fs.writeFileSync(path.join(runDir, 'hosted-judge-path-result.json'), JSON.stringify(out, null, 2));
console.log(JSON.stringify({ runDir, failed: out.steps.filter((s) => !s.ok).map((s) => s.name) }, null, 2));
process.exitCode = out.steps.some((s) => !s.ok) ? 1 : 0;
