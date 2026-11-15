// T048 step 5: kill and restart the hosted process mid-lobby and watch host + phones (no reloads).
//   node hosted-restart.mjs --origin http://localhost:10000 --restart-cmd "<shell command that kills+starts>" [--no-unity]
// Real Unity host (headless) + 2 phones open only the join link. Timeline of ws open/close/frames per page
// and screenshots at +5/+30/+90 s after the server is back are written to the run folder.
import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { chromium } from '@playwright/test';
import { evidenceDir, serverDir } from './lib/paths.mjs';

const argv = process.argv.slice(2);
const value = (n, f) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : f; };
const origin = value('--origin', 'http://localhost:10000').replace(/\/$/, '');
const port = new URL(origin).port || '80';
const useUnity = !argv.includes('--no-unity');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const runDir = path.join(evidenceDir, 'runs', `${new Date().toISOString().replace(/[:.]/g, '-')}-hosted-restart`);
fs.mkdirSync(runDir, { recursive: true });
const t0 = Date.now(); const rel = () => ((Date.now() - t0) / 1000).toFixed(1);
const timeline = [];
const log = (who, what) => { timeline.push({ tS: Number(rel()), who, what }); console.log(`[${rel()}s] ${who}: ${what}`); };
const shot = (page, name) => page.screenshot({ path: path.join(runDir, name), timeout: 90000 }).catch((e) => log('harness', `${name} failed ${String(e.message).slice(0, 60)}`));

function watch(page, who) {
  page.on('websocket', (ws) => {
    log(who, `ws open ${ws.url()}`);
    ws.on('close', () => log(who, 'ws closed'));
    ws.on('socketerror', (e) => log(who, `ws error ${e}`));
    ws.on('framesent', (f) => { if (typeof f.payload === 'string') { const t = /"t":"([^"]+)"/.exec(f.payload)?.[1]; if (t && t !== 'clock.ping') log(who, `sent ${t}`); } });
    ws.on('framereceived', (f) => { if (typeof f.payload === 'string') { const t = /"t":"([^"]+)"/.exec(f.payload)?.[1]; if (t && !['clock.pong', 'hud.tick'].includes(t)) log(who, `recv ${t}${t === 'error' || t === 'bye' ? ' ' + f.payload.slice(0, 160) : ''}`); } });
  });
}

function killServer() {
  const r = spawnSync('powershell', ['-NoProfile', '-Command', `$c = Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1; if ($c) { Stop-Process -Id $c.OwningProcess -Force; "killed pid $($c.OwningProcess)" } else { "no listener" }`], { encoding: 'utf8' });
  return r.stdout.trim();
}
function startServer() {
  const child = spawn(process.execPath, ['dist/server/src/hosted.js'], { cwd: serverDir, env: { ...process.env, PORT: port, NODE_ENV: 'production', RENDER_EXTERNAL_URL: origin }, stdio: ['ignore', fs.openSync(path.join(runDir, 'server-restarted.log'), 'a'), 'inherit'], detached: true });
  child.unref();
  return child.pid;
}

const browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
let host = null; let room = null; let joinUrl = null; let lastCreated = null;
if (useUnity) {
  host = await (await browser.newContext({ viewport: { width: 1920, height: 1080 } })).newPage();
  watch(host, 'host');
  host.on('websocket', (ws) => ws.on('framereceived', (f) => { if (typeof f.payload === 'string' && f.payload.includes('"t":"room.created"')) { const d = JSON.parse(f.payload).d; lastCreated = d; room ??= d.room; joinUrl ??= d.joinUrl; } }));
  await host.goto(`${origin}/play/host/?server=${encodeURIComponent(origin.replace(/^http/, 'ws') + '/ws')}`, { waitUntil: 'domcontentloaded' });
  await sleep(25000);
  await host.mouse.click(250, 913);
  for (let i = 0; i < 40 && !room; i += 1) await sleep(3000);
  log('harness', `room ${room} joinUrl ${joinUrl}`);
}
if (!room) { log('harness', 'no room created'); process.exit(2); }
const phones = [];
for (let i = 0; i < 2; i += 1) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const p = await ctx.newPage(); watch(p, `phone${i + 1}`);
  await p.goto(joinUrl, { waitUntil: 'domcontentloaded' });
  await p.getByTestId('join-nick').fill(`Restart${i + 1}`);
  await p.getByTestId('join-submit').click();
  await p.getByTestId('screen-lobby').waitFor({ state: 'visible', timeout: 25000 });
  phones.push(p);
}
await sleep(10000);
await shot(phones[0], '01-phone1-before.png'); await shot(host, '02-host-before.png');
log('harness', 'KILL: ' + killServer());
const killedAt = Date.now();
await sleep(Number(value('--down-seconds', '10')) * 1000);
const pid = startServer();
const upAt = Date.now();
log('harness', `RESTARTED pid ${pid} (down for ${((upAt - killedAt) / 1000).toFixed(1)} s)`);
for (const wait of [5, 30, 90]) {
  await sleep(wait === 5 ? 5000 : wait === 30 ? 25000 : 60000);
  const texts = [];
  for (const [i, p] of phones.entries()) texts.push((await p.locator('body').innerText().catch(() => '')).replace(/\s+/g, ' ').slice(0, 200));
  log('harness', `+${wait}s phone texts: ${JSON.stringify(texts)}`);
  await shot(phones[0], `04-phone1-after-${wait}s.png`); await shot(phones[1], `04-phone2-after-${wait}s.png`); await shot(host, `05-host-after-${wait}s.png`);
}
// Recovery path for a judge: press New mission on the same host page, then join a phone to the new room.
let room2 = null;
await host.mouse.click(250, 913);
for (let i = 0; i < 60 && !room2; i += 1) { await sleep(3000); if (lastCreated && lastCreated.room !== room) room2 = lastCreated; }
log('harness', `New mission after restart: ${room2 ? 'room ' + room2.room : 'NO room.created within 180 s'}`);
await shot(host, '06-host-new-mission-after-restart.png');
if (room2) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const p = await ctx.newPage(); watch(p, 'phone3-new');
  await p.goto(room2.joinUrl, { waitUntil: 'domcontentloaded' });
  await p.getByTestId('join-nick').fill('Rejoin');
  await p.getByTestId('join-submit').click();
  const ok = await p.getByTestId('screen-lobby').waitFor({ state: 'visible', timeout: 25000 }).then(() => true, () => false);
  log('harness', `phone joined the new room: ${ok}`);
  await shot(p, '07-new-phone-lobby.png');
}
fs.writeFileSync(path.join(runDir, 'timeline.json'), JSON.stringify({ origin, room, killedToUpSeconds: (upAt - killedAt) / 1000, timeline }, null, 2));
await browser.close();
console.log(runDir);
