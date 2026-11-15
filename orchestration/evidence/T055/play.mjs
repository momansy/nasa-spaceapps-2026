// T055 local hosted playthrough: real Unity WebGL host (GPU via headed Chrome/Metal) + 3 phone clients.
// Captures a screenshot at every host phase change plus periodic shots, logs phase.set and vote rounds.
// Run from the repo root: node /tmp/t055scripts/play.mjs <outDir>
import { createRequire } from 'node:module';
import path from 'node:path';
import { appendFileSync, mkdirSync } from 'node:fs';
const require = createRequire(path.resolve('tools/e2e/x.js'));
const { chromium } = require('playwright');

const OUT = path.resolve(process.argv[2] ?? '/tmp/t055-shots');
mkdirSync(OUT, { recursive: true });
const BASE = process.env.MF_BASE ?? 'http://localhost:10000';
const WS = BASE.replace(/^http/, 'ws') + '/ws';
const CREW = ['Ada', 'Yuri', 'Sally'];
const MAX_MIN = Number(process.env.MF_MAX_MIN ?? 40);
const STALL_S = Number(process.env.MF_STALL_S ?? 150);
const t0 = Date.now();
const T = () => ((Date.now() - t0) / 1000).toFixed(0).padStart(4, '0');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (s) => { const l = `${T()} ${s}`; console.log(l); appendFileSync(path.join(OUT, 'play.log'), l + '\n'); };

let lastSub = null, phase = 'TITLE', phaseAt = Date.now(), voteN = 0, voteTitle = '', roomCode = null, reconnects = 0;
const browser = await chromium.launch({
  headless: false, channel: 'chrome', ignoreDefaultArgs: ['--enable-automation'],
  args: ['--use-angle=metal', '--ignore-gpu-blocklist', '--enable-gpu-rasterization', '--force-device-scale-factor=1',
    '--window-size=1920,1080', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'],
});
const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
const host = await ctx.newPage();
host.on('console', (m) => { const t = m.text(); if (/error|exception|reconnect/i.test(t)) log('console ' + m.type() + ' ' + t.slice(0, 200)); });
host.on('websocket', (ws) => {
  ws.on('close', () => { reconnects += 1; log('host websocket closed'); });
  const onFrame = (f) => {
    const s = String(f.payload);
    const rc = s.match(/"(?:roomCode|code|room)"\s*:\s*"([A-Z]{4})"/); if (rc && !roomCode) roomCode = rc[1];
    const t = s.match(/"t":"([^"]+)"/)?.[1];
    if (t === 'phase.set') { const p = s.match(/"phase":"([^"]+)"/)?.[1]; const sub = s.match(/"sub":"?([^",}]*)/)?.[1]; if (p) { if (p !== phase || sub !== lastSub) log(`phase.set ${p} sub=${sub}`); lastSub = sub; if (p !== phase) { phase = p; phaseAt = Date.now(); shotSoon(`phase-${p}`); } } }
    if (t === 'vote.opened') { voteN += 1; voteTitle = (s.match(/"kind":"([^"]+)"/)?.[1] ?? '') + '-' + (s.match(/"roundId":"([^"]+)"/)?.[1] ?? ''); log(`vote.opened #${voteN} ${voteTitle}`); }
  };
  ws.on('framereceived', onFrame);
  ws.on('framesent', onFrame);
});
let shotN = 0;
async function shot(name) {
  shotN += 1;
  const file = path.join(OUT, `${String(shotN).padStart(3, '0')}-${T()}-${name}.png`.replace(/[^\w.\-\/]/g, '_'));
  await host.screenshot({ path: file, timeout: 60000 }).then(() => log('shot ' + path.basename(file))).catch((e) => log('shot fail ' + e.message));
}
function shotSoon(name) { setTimeout(() => shot(name + '-a'), 3500); setTimeout(() => shot(name + '-b'), 12000); }

await host.goto(`${BASE}/play/host/?server=${encodeURIComponent(WS)}`);
log('renderer ' + await host.evaluate(() => { const gl = document.createElement('canvas').getContext('webgl2'); const e = gl.getExtension('WEBGL_debug_renderer_info'); return gl.getParameter(e.UNMASKED_RENDERER_WEBGL); }));
await host.waitForFunction(() => !!window.mfUnity, null, { timeout: 180000 });
await sleep(8000); await shot('title');
const click = async (x, y) => { await host.mouse.move(x, y); await sleep(80); await host.mouse.down(); await sleep(60); await host.mouse.up(); };
for (let i = 0; i < 5 && !roomCode; i++) { await click(236, 912); for (let k = 0; k < 10 && !roomCode; k++) await sleep(1000); }
log('room ' + roomCode); if (!roomCode) { await shot('no-room'); await browser.close(); process.exit(1); }
await shot('room-open');
await click(1320, 865); await sleep(5000);

const phoneBrowser = await chromium.launch({ channel: 'chrome', headless: true });
const tid = (p, id) => p.getByTestId(id);
const vis = (l) => l.isVisible().catch(() => false);
const tap = (l) => l.first().evaluate((el) => el.click()).catch(() => {});
const phones = [];
for (const [i, nick] of CREW.entries()) {
  const pctx = await phoneBrowser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const page = await pctx.newPage();
  await page.goto(`${BASE}/play/client/?room=${roomCode}`, { waitUntil: 'domcontentloaded' });
  await tid(page, 'join-nick').fill(nick);
  await tid(page, 'join-submit').click();
  await tid(page, 'screen-lobby').waitFor({ timeout: 30000 });
  log('joined ' + nick); phones.push({ page, i });
}
let stop = false;
for (const { page, i } of phones) (async () => {
  while (!stop) {
    await sleep(500 + i * 300 + Math.random() * 500);
    try {
      if (await vis(tid(page, 'role-ready'))) { await tap(tid(page, 'role-ready')); continue; }
      if (await vis(tid(page, 'poll-my-call'))) { await tap(tid(page, 'poll-go')); continue; }
      if (await vis(tid(page, 'alert-callout').first())) { await tap(tid(page, 'alert-callout')); continue; }
      if (await vis(tid(page, 'mg-continue'))) { await tap(tid(page, 'mg-continue')); continue; }
      for (const prefix of ['quick-', 'trivia-', 'pick-', 'predict-']) {
        const l = page.locator(`[data-testid^="${prefix}"]`);
        if (await l.count() && await vis(l.first())) { await tap(l.nth(i % await l.count())); break; }
      }
      const cast = tid(page, 'cast');
      if (await vis(cast)) {
        const dots = page.locator('.dot'); const nd = await dots.count();
        if (nd) { await dots.nth(0).click().catch(() => {}); await sleep(300); }
        if (await cast.isEnabled().catch(() => false)) await tap(cast);
        continue;
      }
      const mg = page.locator('[data-testid="mg-play"] canvas');
      if (await vis(mg)) { await mg.focus().catch(() => {}); await page.keyboard.press(Math.random() < 0.5 ? 'ArrowUp' : 'ArrowDown').catch(() => {}); await page.mouse.click(195, 500).catch(() => {}); }
    } catch { /* keep playing */ }
  }
})();
await sleep(4000); await shot('lobby-3-crew');
await click(1063, 951); log('start briefing'); phaseAt = Date.now();

let lastPeriodic = Date.now(), scaleShots = 0, lastVoteShot = 0;
const deadline = t0 + MAX_MIN * 60000;
while (Date.now() < deadline) {
  await sleep(2000);
  if (Date.now() - lastPeriodic > 20000) { lastPeriodic = Date.now(); await shot(`periodic-${phase}-v${voteN}`); }
  if (phase === 'BUILD' && voteN !== lastVoteShot && (voteN === 1 || voteN === 20 || voteN % 5 === 0)) {
    lastVoteShot = voteN; setTimeout(() => shot(`build-vote${voteN}`), 6000);
  }
  if (phase === 'BUILD' && voteN >= 3 && scaleShots === 0) {
    scaleShots = 1; await host.keyboard.press('r'); await sleep(2500); await shot('build-scale-view'); await sleep(1500); await host.keyboard.press('r');
  }
  if (process.env.MF_SKIP_BUILD && phase === 'BUILD' && voteN >= 3 && Date.now() - phaseAt > 15000) { log('skip build: PageDown'); await host.keyboard.press('PageDown'); phaseAt = Date.now(); }
  if (phase === 'DEBRIEF' && Date.now() - phaseAt > 40000) { await shot('debrief-final'); break; }
  if ((Date.now() - phaseAt) / 1000 > (phase === 'FLIGHT' ? Number(process.env.MF_FLIGHT_STALL_S ?? 900) : STALL_S) && phase !== 'BUILD') { log(`stall in ${phase}; PageDown`); await shot(`stall-${phase}`); await host.keyboard.press('PageDown'); phaseAt = Date.now(); }
}
log(`done phase=${phase} votes=${voteN} hostSocketCloses=${reconnects}`);
for (const { page, i } of phones) await page.screenshot({ path: path.join(OUT, `phone-${i}-final.png`) }).catch(() => {});
stop = true;
await phoneBrowser.close(); await browser.close();
process.exit(0);
