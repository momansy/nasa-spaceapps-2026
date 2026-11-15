// T036 step 6: walk the judging-day path against a running `npm --prefix tools/demo run demo`:
// entry page -> links -> host page load -> phone join by typing the room code -> lobby.
// The Unity host cannot render headless on this worker (T028 D-004), so a scripted host stands in
// for the big screen on the same room server (ws://localhost:8787) to give the phone a room.
//   node judge-path.mjs [--base http://localhost:8080] [--phone-base http://<LAN-IP>:8080] [--server ws://localhost:8787]
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from '@playwright/test';
import { evidenceDir } from './lib/paths.mjs';
import { ScriptedHost } from './host/scripted-host.mjs';

const argv = process.argv.slice(2);
const value = (name, fallback) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : fallback; };
const base = value('--base', 'http://localhost:8080');
const phoneBase = value('--phone-base', base);
const server = value('--server', 'ws://localhost:8787');
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const runDir = path.join(evidenceDir, 'runs', `${new Date().toISOString().replace(/[:.]/g, '-')}-judge-path`);
fs.mkdirSync(runDir, { recursive: true });
const out = { base, phoneBase, server, steps: [], notes: [] };
const step = (name, ok, detail = {}) => { out.steps.push({ name, ok, ...detail }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`); };

// 1. Static pages and their links.
const pages = ['/play/', '/play/credits.html', '/play/judges.html', '/play/client/', '/play/client/?mock=1', '/play/client/?watch=1', '/play/host/'];
for (const p of pages) {
  const res = await fetch(base + p).catch((e) => ({ status: 0, error: e.message }));
  step(`GET ${p}`, res.status === 200, { status: res.status, contentType: res.headers?.get?.('content-type') ?? null });
}

const browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });

// 2. Entry page on a laptop and on a phone viewport.
{
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${base}/play/`, { waitUntil: 'load' });
  await page.screenshot({ path: path.join(runDir, 'entry-desktop.png'), fullPage: true });
  out.entryTitle = await page.title();
  out.entryLinks = await page.locator('a').evaluateAll((as) => as.map((a) => ({ text: a.textContent.trim().replace(/\s+/g, ' ').slice(0, 60), href: a.getAttribute('href') })));
  step('entry page renders (desktop)', true, { title: out.entryTitle, errors });
  const phone = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await phone.goto(`${base}/play/`, { waitUntil: 'load' });
  await phone.screenshot({ path: path.join(runDir, 'entry-phone.png'), fullPage: true });
  const overflow = await phone.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  step('entry page has no horizontal scroll on a 390 px phone', !overflow);
  await phone.close();
  await page.close();
}

// 3. Host page (Unity WebGL). Headless software rendering only: record how far it gets.
{
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(e.message));
  const failedRequests = [];
  page.on('response', (r) => { if (r.status() >= 400) failedRequests.push(`${r.status()} ${r.url()}`); });
  let realRoom = null;
  page.on('websocket', (ws) => ws.on('framereceived', (f) => {
    const m = typeof f.payload === 'string' ? /"t":"room\.created".*?"room":"([A-Z0-9]{4})"/.exec(f.payload) : null;
    if (m) realRoom = m[1];
  }));
  await page.goto(`${base}/play/host/?server=${encodeURIComponent(server)}&perf=1`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await sleep(20000);
  await page.screenshot({ path: path.join(runDir, 'host-20s.png'), timeout: 60000 }).catch((e) => out.notes.push('host-20s screenshot failed: ' + String(e.message).slice(0, 80)));
  const status20 = await page.locator('#mf-status').textContent().catch(() => null);
  await sleep(25000);
  await page.screenshot({ path: path.join(runDir, 'host-45s.png'), timeout: 60000 }).catch((e) => out.notes.push('host-45s screenshot failed: ' + String(e.message).slice(0, 80)));
  const status45 = await page.locator('#mf-status').textContent().catch(() => null);
  // The status text stays in the DOM after Unity hides the loading overlay, so record visibility too.
  const loaderVisible45 = await page.evaluate(() => { const el = document.querySelector('#mf-loading'); if (!el) return null; const c = getComputedStyle(el); return c.display !== 'none' && c.visibility !== 'hidden' && Number(c.opacity) > 0.05; }).catch(() => null);
  const perf = await page.evaluate(() => window.mfPerf ?? null).catch(() => null);
  // Real host: press New mission (canvas button at 1920 x 1080, 250,913) and look at the lobby 60 s later.
  await page.mouse.click(250, 913).catch(() => {});
  await sleep(60000);
  await page.screenshot({ path: path.join(runDir, 'host-after-new-mission.png'), timeout: 90000 }).catch((e) => out.notes.push('host-after-new-mission screenshot failed: ' + String(e.message).slice(0, 80)));
  // The real host's room: a phone joins it through the QR link (?room=CODE), then the host is shot again.
  if (realRoom) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    const phonePage = await ctx.newPage();
    await phonePage.goto(`${phoneBase}/play/client/?room=${realRoom}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await phonePage.getByTestId('screen-join').waitFor({ state: 'visible', timeout: 15000 });
    await phonePage.getByTestId('join-nick').fill('JudgePhone');
    await phonePage.getByTestId('join-submit').click();
    const joined = await phonePage.getByTestId('screen-lobby').waitFor({ state: 'visible', timeout: 20000 }).then(() => true, () => false);
    await phonePage.screenshot({ path: path.join(runDir, 'phone-joined-real-host.png'), fullPage: true }).catch(() => {});
    await sleep(60000);
    await page.screenshot({ path: path.join(runDir, 'host-with-phone.png'), timeout: 90000 }).catch((e) => out.notes.push('host-with-phone screenshot failed: ' + String(e.message).slice(0, 80)));
    out.realHost = { room: realRoom, phoneReachedLobby: joined };
    await ctx.close();
  } else out.notes.push('real host room code not captured from room.created frame');
  out.host = { status20, status45, loaderVisible45, perf, errors: errors.slice(0, 8), failedRequests: failedRequests.slice(0, 8) };
  step('host page loads (headless, software GL; informational)', true, out.host);
  await page.close();
}

// 4. Phone join by typing the code, against a scripted host on the same server.
{
  const host = new ScriptedHost(server.replace(/^ws:/, 'ws:'), { seed: 2801 });
  await host.connect();
  host.phase('LOBBY');
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const page = await context.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${phoneBase}/play/client/`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.getByTestId('screen-join').waitFor({ state: 'visible', timeout: 15000 });
  await page.screenshot({ path: path.join(runDir, 'phone-join-empty.png'), fullPage: true });
  await page.getByTestId('join-code').fill(host.room.toLowerCase());
  await page.getByTestId('join-nick').fill('Judge1');
  await page.screenshot({ path: path.join(runDir, 'phone-join-filled.png'), fullPage: true });
  await page.getByTestId('join-submit').click();
  const lobby = await page.getByTestId('screen-lobby').waitFor({ state: 'visible', timeout: 15000 }).then(() => true).catch(() => false);
  await sleep(800);
  await page.screenshot({ path: path.join(runDir, 'phone-lobby.png'), fullPage: true });
  step('phone joins by typed room code (lower case accepted) and shows the lobby', lobby && host.playerIds.length === 1, { room: host.room, players: host.playerIds, errors });
  // QR path: ?room=CODE pre-fills the code.
  const context2 = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page2 = await context2.newPage();
  await page2.goto(`${phoneBase}/play/client/?room=${host.room}`, { waitUntil: 'domcontentloaded' });
  await page2.getByTestId('screen-join').waitFor({ state: 'visible', timeout: 15000 });
  const lockedCode = (await page2.locator('.join__tiles--locked').getAttribute('aria-label').catch(() => '') ?? '').replace(/ /g, '');
  const hasInput = await page2.getByTestId('join-code').count();
  step('QR link ?room=CODE shows the room code on the join screen (no code to type)', lockedCode === host.room && hasInput === 0, { room: host.room, lockedCode, codeInputPresent: hasInput });
  await page2.getByTestId('join-nick').fill('Judge2');
  await page2.getByTestId('join-submit').click();
  const lobby2 = await page2.getByTestId('screen-lobby').waitFor({ state: 'visible', timeout: 15000 }).then(() => true).catch(() => false);
  step('QR link join reaches the lobby', lobby2 && host.playerIds.length === 2, { players: host.playerIds });
  // Wrong code typed by hand.
  const page3 = await (await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })).newPage();
  await page3.goto(`${phoneBase}/play/client/`, { waitUntil: 'domcontentloaded' });
  await page3.getByTestId('join-code').fill('ZZZZ');
  await page3.getByTestId('join-nick').fill('Judge3');
  await page3.getByTestId('join-submit').click();
  await sleep(2500);
  await page3.screenshot({ path: path.join(runDir, 'phone-join-wrong-code.png'), fullPage: true });
  out.wrongCodeText = (await page3.locator('body').innerText()).replace(/\s+/g, ' ').slice(0, 400);
  step('wrong room code shows an error, not the lobby', !(await page3.getByTestId('screen-lobby').isVisible().catch(() => false)), { text: out.wrongCodeText });
  host.close();
  await context.close(); await context2.close();
}

await browser.close();
fs.writeFileSync(path.join(runDir, 'judge-path-result.json'), JSON.stringify(out, null, 2));
console.log(JSON.stringify({ runDir, failed: out.steps.filter((s) => !s.ok).map((s) => s.name) }, null, 2));
process.exitCode = out.steps.some((s) => !s.ok) ? 1 : 0;
