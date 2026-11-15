// T052 exploration: hosted host + 3 phones, log which message types and phone screens appear.
import { createRequire } from 'node:module';
import path from 'node:path';
const require = createRequire(path.resolve('tools/e2e/x.js'));
const { chromium } = require('@playwright/test');
const BASE = process.env.BASE ?? 'https://missionforge-spaceapps.onrender.com';
const OUT = path.resolve('orchestration/evidence/T052/rehearsal');
const t0 = Date.now(); const T = () => ((Date.now() - t0) / 1000).toFixed(1);
const b = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader','--enable-unsafe-swiftshader','--enable-webgl','--ignore-gpu-blocklist'] });
const hctx = await b.newContext({ viewport: { width: 1920, height: 1080 } });
const hp = await hctx.newPage();
let code = null; const seen = new Map();
hp.on('websocket', ws => ws.on('framereceived', f => { const s = String(f.payload); const m = s.match(/"t":"([^"]+)"/); const t = m?.[1]; if (t && t !== 'clock.pong' && !seen.has(t)) { seen.set(t, T()); console.log(T(), 'host<-', t, s.slice(0,160)); } const r = s.match(/"room"\s*:\s*"([A-Z0-9]{4})"/); if (r && !code) code = r[1]; }));
hp.on('websocket', ws => ws.on('framesent', f => { const s = String(f.payload); const m = s.match(/"t":"([^"]+)"/); const t = m?.[1]; if (t && !['clock.ping','hb'].includes(t) && !seen.has('>'+t)) { seen.set('>'+t, T()); console.log(T(), 'host->', t, s.slice(0,160)); } }));
await hp.goto(`${BASE}/play/host/?server=wss://${new URL(BASE).host}/ws`, { waitUntil: 'load', timeout: 180000 });
console.log(T(), 'load event');
await hp.waitForTimeout(30000);
for (let i = 0; i < 6 && !code; i++) { await hp.mouse.click(236, 912); console.log(T(), 'click new mission'); for (let k = 0; k < 10 && !code; k++) await hp.waitForTimeout(1000); }
console.log(T(), 'room', code);
if (!code) { await b.close(); process.exit(1); }
const phones = [];
for (const n of ['Ada','Grace','Katherine']) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const p = await ctx.newPage(); phones.push(p);
  await p.goto(`${BASE}/play/client/?room=${code}`, { waitUntil: 'networkidle' });
  await p.getByTestId('join-nick').fill(n);
  await p.getByTestId('join-submit').click();
  console.log(T(), n, 'submitted');
}
await hp.waitForTimeout(8000);
await hp.screenshot({ path: `${OUT}/x-host-lobby-3.png`, timeout: 120000 }).catch(()=>console.log('shot fail'));
await hp.mouse.click(1320, 900); console.log(T(), 'click Open lobby');
await hp.waitForTimeout(8000);
await hp.mouse.click(1063, 950); console.log(T(), 'click Start briefing');
for (let i = 0; i < 14; i++) {
  await hp.waitForTimeout(12000);
  const tid = await phones[0].evaluate(() => [...document.querySelectorAll('[data-testid^="screen-"]')].map(e => e.dataset.testid + ':' + (e.dataset.stage||'')).join(','));
  console.log(T(), 'phone0 screens:', tid);
  if (i % 2 === 1) { await hp.screenshot({ path: `${OUT}/x-host-${i}.png`, timeout: 120000 }).catch(()=>console.log('shot fail')); await phones[0].screenshot({ path: `${OUT}/x-phone-${i}.png`, timeout: 120000 }).catch(()=>{}); }
}
await b.close();
