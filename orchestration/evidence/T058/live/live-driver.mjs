// T058 live check driver. Opens the hosted host (1920x1080) + N phones (390x844), then executes commands
// appended to a control file, one per line, so a human/agent can steer the Unity canvas host step by step.
//   node orchestration/evidence/T058/live/live-driver.mjs --ctl <file> [--origin URL] [--phones 2]
// Commands: shot NAME | click X Y | key KEY | wait MS | pshot I NAME | ptext I | pclick I SELECTOR | pfill I SELECTOR TEXT
//           auto on|off | state | quit
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const require = createRequire(path.resolve('tools/e2e/x.js'));
const { chromium } = require('@playwright/test');
const argv = process.argv.slice(2);
const value = (n, f) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : f; };
const origin = value('--origin', 'https://missionforge-spaceapps.onrender.com').replace(/\/$/, '');
const ctl = value('--ctl');
const outDir = path.resolve('orchestration/evidence/T058/live');
const logFile = value('--log', path.join(path.dirname(ctl), 'driver.log'));
const framesFile = value('--frames', path.join(path.dirname(ctl), 'frames.jsonl'));
const phoneCount = Number(value('--phones', '2'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => { const s = `[${new Date().toISOString()}] ${a.join(' ')}`; console.log(s); fs.appendFileSync(logFile, s + '\n'); };
const redact = (s) => s.replace(/"(hostToken|token|sessionToken|resumeToken)":"[^"]+"/g, '"$1":"<redacted>"');

const browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
const pbrowser = await chromium.launch({ headless: true });
const hctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
const host = await hctx.newPage();
const hostErrors = []; const failed = [];
host.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') hostErrors.push(`${m.type()}: ${m.text().slice(0, 300)}`); });
host.on('pageerror', (e) => hostErrors.push(`pageerror: ${e.message}`));
host.on('response', (r) => { if (r.status() >= 400) failed.push(`${r.status()} ${r.url()}`); });
host.on('requestfailed', (r) => failed.push(`FAILED ${r.url()} ${r.failure()?.errorText}`));
let room = null; let joinUrl = null; let phase = null;
host.on('websocket', (ws) => {
  log('host ws', ws.url());
  const rec = (dir) => (f) => {
    if (typeof f.payload !== 'string') return;
    fs.appendFileSync(framesFile, JSON.stringify({ at: new Date().toISOString(), dir, p: redact(f.payload).slice(0, 4000) }) + '\n');
    if (f.payload.includes('"t":"room.created"')) { try { const d = JSON.parse(f.payload).d; room = d.room; joinUrl = d.joinUrl ?? d.clientUrl ?? null; log('room.created', room, joinUrl); } catch { /* */ } }
    const m = /"t":"phase\.set".*?"phase":"([A-Z_]+)"/.exec(f.payload); if (m && m[1] !== phase) { phase = m[1]; log('PHASE', phase); }
  };
  ws.on('framereceived', rec('in')); ws.on('framesent', rec('out'));
});
await host.goto(`${origin}/play/`, { waitUntil: 'load', timeout: 120000 });
await host.screenshot({ path: path.join(outDir, '01-entry-desktop.png'), fullPage: true });
log('entry title', await host.title(), 'host-link', await host.locator('#host-link').getAttribute('href').catch(() => null));
log('entry links', JSON.stringify(await host.locator('a').evaluateAll((as) => as.map((a) => [a.textContent.trim().replace(/\s+/g, ' ').slice(0, 50), a.getAttribute('href')]))));
log('entry text', (await host.locator('body').innerText()).replace(/\s+/g, ' ').slice(0, 1500));
await host.locator('#host-link').click();
await host.waitForURL(/\/play\/host\//, { timeout: 30000 });
log('host url', host.url());

const phones = [];
const auto = { on: false };
async function openPhone(i) {
  const pc = await pbrowser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const pp = await pc.newPage();
  const errs = [];
  pp.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 300)); });
  pp.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  pp.on('response', (r) => { if (r.status() >= 400) errs.push(`${r.status()} ${r.url()}`); });
  await pp.goto(joinUrl ?? `${origin}/play/client/?room=${room}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  phones[i] = { pc, pp, errs };
  log(`phone ${i} url`, pp.url());
}

async function phoneAuto(p, i) {
  const page = p.pp;
  const click = async (sel) => { const l = page.locator(sel).first(); if (await l.isVisible().catch(() => false) && await l.isEnabled().catch(() => false)) { await l.evaluate((el) => el.click()).catch(() => {}); log(`auto phone ${i} clicked ${sel}`); return true; } return false; };
  await click('[data-testid="role-ready"]');
  if (await page.getByTestId('screen-vote').isVisible().catch(() => false)) {
    if (!(await click('[data-testid^="quick-"]'))) { await click('[data-testid^="card-"]'); await click('[data-testid="cast"]'); }
  }
  if (await page.getByTestId('poll-my-call').isVisible().catch(() => false)) await click('[data-testid="poll-go"]');
  await click('[data-testid="mg-continue"]');
  if (await page.getByTestId('mg-play').isVisible().catch(() => false)) {
    const box = await page.locator('.mg-stage').boundingBox().catch(() => null);
    if (box) for (let k = 0; k < 6; k += 1) { const x = box.x + box.width * Math.random(); const y = box.y + box.height * Math.random(); await page.touchscreen.tap(x, y).catch(() => {}); await sleep(80); }
    const b = page.locator('.mg-stage button:not([disabled])'); const c = await b.count().catch(() => 0); if (c) await b.nth(Math.floor(Math.random() * c)).evaluate((el) => el.click()).catch(() => {});
  }
}

let busy = false; let lastLine = 0; let quit = false;
setInterval(async () => { if (!auto.on || busy) return; for (let i = 0; i < phones.length; i += 1) if (phones[i]) await phoneAuto(phones[i], i).catch(() => {}); }, 1500);

async function run(line) {
  const [cmd, ...a] = line.trim().split(/\s+/);
  const rest = line.trim().split(/\s+/).slice(3).join(' ');
  switch (cmd) {
    case 'shot': await host.screenshot({ path: path.join(outDir, a[0]), timeout: 200000 }); log('host shot', a[0]); break;
    case 'click': await host.mouse.click(Number(a[0]), Number(a[1])); log('host click', a[0], a[1]); break;
    case 'key': await host.keyboard.press(a[0]); log('host key', a[0]); break;
    case 'wait': await sleep(Number(a[0])); break;
    case 'join': for (let i = 0; i < phoneCount; i += 1) await openPhone(i); break;
    case 'pshot': await phones[a[0]].pp.screenshot({ path: path.join(outDir, a[1]), fullPage: a[2] !== 'vp', timeout: 30000 }); log('phone shot', a[0], a[1]); break;
    case 'ptext': { const p = phones[a[0]].pp; const ids = await p.locator('[data-testid]').evaluateAll((els) => els.filter((e) => e.offsetParent || e.getClientRects().length).map((e) => e.getAttribute('data-testid'))); log(`phone ${a[0]} testids`, JSON.stringify(ids).slice(0, 2500)); log(`phone ${a[0]} text`, (await p.locator('body').innerText()).replace(/\s+/g, ' ').slice(0, 3000)); break; }
    case 'pclick': { const l = phones[a[0]].pp.locator(a.slice(1).join(' ')).first(); await l.evaluate((el) => el.click()); log('phone click', a[0], a.slice(1).join(' ')); break; }
    case 'pfill': await phones[a[0]].pp.locator(a[1]).first().fill(rest); log('phone fill', a[0], a[1], rest); break;
    case 'peval': { const r = await phones[a[0]].pp.evaluate(a.slice(1).join(' ')); log(`phone ${a[0]} eval`, JSON.stringify(r).slice(0, 3000)); break; }
    case 'heval': { const r = await host.evaluate(a.join(' ')); log('host eval', JSON.stringify(r).slice(0, 3000)); break; }
    case 'auto': auto.on = a[0] === 'on'; log('auto', auto.on); break;
    case 'state': log('state', JSON.stringify({ room, joinUrl, phase, hostUrl: host.url(), hostErrors: hostErrors.slice(-30), failed: failed.slice(-20), phoneErrs: phones.map((p) => p?.errs.slice(-15)) })); break;
    case 'js': { const mod = await import(pathToFileURL(path.resolve(a[0])).href + '?' + Date.now()); const r = await mod.default({ host, phones, outDir, log, sleep, state: () => ({ room, phase }) }); log('js', a[0], JSON.stringify(r ?? null).slice(0, 4000)); break; }
    case 'quit': quit = true; break;
    default: log('unknown', line);
  }
}
fs.writeFileSync(ctl, '', { flag: 'a' });
log('READY');
while (!quit) {
  const lines = fs.readFileSync(ctl, 'utf8').split(/\r?\n/);
  while (lastLine < lines.length - 1 && !quit) {
    const line = lines[lastLine]; lastLine += 1;
    if (!line.trim()) continue;
    busy = true;
    try { await run(line); } catch (e) { log('ERR', line, String(e.message).split('\n')[0]); }
    busy = false;
    log('DONE', line);
  }
  await sleep(500);
}
log('final state', JSON.stringify({ room, phase, hostErrors, failed, phoneErrs: phones.map((p) => p?.errs) }));
await browser.close(); await pbrowser.close();
