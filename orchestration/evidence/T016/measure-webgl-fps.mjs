// T016: WebGL flight frame rate in desktop Chrome at 1920x1080 (DPR 1). Usage: node flight-fps.mjs <url> <seconds> <outdir>
import { chromium } from 'playwright-core';
import fs from 'node:fs';
const [url, seconds = '200', outDir = '.'] = process.argv.slice(2);
fs.mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: false,
  args: ['--window-size=1920,1180', '--disable-background-timer-throttling', '--disable-renderer-backgrounding'],
});
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
const errors = [];
const logs = [];
page.on('console', (m) => { const t = m.text(); if (t.includes('[MissionForge]')) logs.push({ t: Date.now(), text: t.slice(0, 200) }); if (m.type() === 'error') errors.push(t.slice(0, 300)); });
page.on('pageerror', (e) => errors.push(String(e).slice(0, 300)));
const t0 = Date.now();
await page.goto(url, { waitUntil: 'load' });
await page.evaluate(() => { window.__f = []; const loop = (ts) => { window.__f.push(ts); requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
const shots = [];
for (let s = 10; s <= Number(seconds); s += 10) {
  await page.waitForTimeout(10000);
  const p = `${outDir}/webgl-${String(s).padStart(3, '0')}s.png`;
  await page.screenshot({ path: p });
  shots.push(p);
}
const f = await page.evaluate(() => window.__f);
await browser.close();
const windows = [];
const start = f[0];
for (let w = 0; w * 10000 < f[f.length - 1] - start; w++) {
  const dts = [];
  for (let i = 1; i < f.length; i++) if (f[i] - start >= w * 10000 && f[i] - start < (w + 1) * 10000) dts.push(f[i] - f[i - 1]);
  dts.sort((a, b) => a - b);
  windows.push({ window_s: [w * 10, w * 10 + 10], median_fps: dts.length ? +(1000 / dts[Math.floor(dts.length / 2)]).toFixed(1) : null, frames: dts.length });
}
const out = { url, viewport: '1920x1080 DPR1', browser: 'Chrome (playwright-core, headed)', load_to_first_frame_ms: null, windows, logs, errors: errors.slice(0, 20) };
fs.writeFileSync(`${outDir}/webgl-fps.json`, JSON.stringify(out, null, 2));
console.log(JSON.stringify(windows.map((w) => `${w.window_s[0]}-${w.window_s[1]}s:${w.median_fps}`)), 'errors', errors.length);
