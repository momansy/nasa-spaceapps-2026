// T052 rehearsal: the live hosted game, a real Unity host (headless, software WebGL) and 3 phone-sized browser contexts.
// Usage: node rehearse.mjs [stepsFile]   Writes timings to rehearsal/timings-<n>.json and screenshots to rehearsal/.
import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';
const require = createRequire(path.resolve('tools/e2e/x.js'));
const { chromium } = require('@playwright/test');
const BASE = process.env.BASE ?? 'https://missionforge-spaceapps.onrender.com';
const OUT = path.resolve('orchestration/evidence/T052/rehearsal');
const TAG = process.env.TAG ?? 'r1';
const RUN_S = Number(process.env.RUN_S ?? 420);
const t0 = Date.now(); const T = () => Number(((Date.now() - t0) / 1000).toFixed(1));
const log = []; const mark = (name, extra = {}) => { const e = { t: T(), name, ...extra }; log.push(e); console.log(e.t, name, JSON.stringify(extra)); };
const b = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader','--enable-unsafe-swiftshader','--enable-webgl','--ignore-gpu-blocklist'] });
const hctx = await b.newContext({ viewport: { width: 1920, height: 1080 } });
const hp = await hctx.newPage();
let code = null; const seenPhase = [];
hp.on('websocket', ws => { ws.on('framereceived', f => { const s = String(f.payload); const r = s.match(/"room"\s*:\s*"([A-Z0-9]{4})"/); if (r && !code) code = r[1]; });
  ws.on('framesent', f => { const s = String(f.payload); if (s.includes('"t":"phase.set"')) { const m = s.match(/"phase":"([A-Z_]+)","sub":"([A-Z_]+)"/); mark('host phase.set', { phase: m?.[1], sub: m?.[2] }); } }); });
const shot = async (page, name, to = 90000) => page.screenshot({ path: `${OUT}/${TAG}-${name}.png`, timeout: to }).catch(() => mark('shot failed', { name }));
mark('start');
await hp.goto(`${BASE}/play/host/?server=wss://${new URL(BASE).host}/ws`, { waitUntil: 'load', timeout: 180000 });
mark('host page load event');
await hp.waitForTimeout(28000);
for (let i = 0; i < 6 && !code; i++) { await hp.mouse.click(236, 912); for (let k = 0; k < 10 && !code; k++) await hp.waitForTimeout(1000); }
mark('room created', { code });
if (!code) { await b.close(); fs.writeFileSync(`${OUT}/timings-${TAG}.json`, JSON.stringify(log, null, 1)); process.exit(1); }
await shot(hp, 'host-01-lobby-qr');
const phones = [];
const names = ['Ada', 'Grace', 'Katherine'];
for (const [i, n] of names.entries()) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const p = await ctx.newPage(); phones.push(p);
  p.on('pageerror', e => mark('phone pageerror', { n, e: String(e).slice(0, 120) }));
  await p.goto(`${BASE}/play/client/?room=${code}`, { waitUntil: 'networkidle' });
  await p.getByTestId('join-nick').fill(n);
  await p.getByTestId('join-submit').click();
  await p.getByTestId('screen-lobby').waitFor({ timeout: 30000 });
  mark('phone in lobby', { n });
}
await shot(phones[0], 'phone-02-lobby');
await hp.mouse.click(1320, 900); mark('click Open lobby');
await hp.waitForTimeout(6000);
await shot(hp, 'host-03-lobby-crew');
await hp.mouse.click(1063, 950); mark('click Start briefing');
// phone autopilot
const state = { last: {}, clicks: 0 };
const screens = (p) => p.evaluate(() => { const q = (s) => document.querySelector(`[data-testid="${s}"]`); const ids = [...document.querySelectorAll('[data-testid]')].map(e => e.dataset.testid); const v = q('screen-vote'); return { ids, stage: v?.dataset.stage ?? null }; }).catch(() => ({ ids: [], stage: null }));
const act = async (p, n, i) => {
  const s = await screens(p); const key = (s.ids.find(x => x.startsWith('screen-') || x.startsWith('console') || x.startsWith('mg-')) ?? '') + ':' + (s.stage ?? '');
  if (state.last[n] !== key) { state.last[n] = key; if (i === 0) { mark('phone0 screen', { key }); await shot(p, `phone-${String(log.length).padStart(3, '0')}-${key.replace(/[^a-z0-9-]/gi, '_')}`, 30000); } }
  const has = (id) => s.ids.includes(id);
  if (has('role-ready')) await p.getByTestId('role-ready').click({ timeout: 2000 }).catch(() => {});
  else if (s.stage === 'VOTE' && has('cast')) { const card = p.locator('[data-testid^="card-"]').nth(i % 2); await card.click({ timeout: 2000 }).catch(() => {}); await p.getByTestId('cast').click({ timeout: 2000 }).catch(() => {}); }
  else if (has('poll-go')) await p.getByTestId('poll-go').click({ timeout: 2000 }).catch(() => {});
  else if (has('mg-continue')) await p.getByTestId('mg-continue').click({ timeout: 2000 }).catch(() => {});
};
let lastHostShot = 0, hostShots = 0, lastClick = 0;
const phases = log.filter(e => e.name === 'host phase.set').map(e => e.phase);
const phaseNow = () => log.filter(e => e.name === 'host phase.set').at(-1)?.phase;
while (T() < RUN_S) {
  await Promise.all(phones.map((p, i) => act(p, names[i], i)));
  const ph = phaseNow();
  if (T() - lastClick > 40) {
    lastClick = T();
    if (ph === 'BRIEFING') { await hp.mouse.click(1737, 998); mark('click Continue (host)'); }
    else if (ph === 'CONTRACT_VOTE') { await hp.mouse.click(1644, 842); mark('click START VOTE (host)'); }
    else if (ph === 'LOBBY') { await hp.mouse.click(1063, 950); mark('click Start briefing again'); }
  }
  if (T() - lastHostShot > 75) { lastHostShot = T(); await shot(hp, `host-${String(++hostShots).padStart(2, '0')}-t${Math.round(T())}`); }
  await hp.waitForTimeout(1500);
}
mark('end');
fs.writeFileSync(`${OUT}/timings-${TAG}.json`, JSON.stringify(log, null, 1));
await b.close();
