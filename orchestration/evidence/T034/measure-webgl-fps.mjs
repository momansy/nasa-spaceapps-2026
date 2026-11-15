// Measures the WebGL Build Bay frame rate in desktop Chrome at 1920x1080 (DPR 1).
// Usage: node measure-webgl-fps.mjs <url> <seconds> <out.json> [uncapped]
// T034 rework: "uncapped" launches Chrome with vsync and the frame-rate limit off, so the result shows the headroom
// above the 60 Hz display cap (frame times are then GPU/CPU bound).
// T031: same method as T015. Append &mfNoPost&mfNoGlass to the URL for the post and glass off run.
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const [url, seconds = '90', out = 'fps.json', mode = 'capped'] = process.argv.slice(2);
const uncapped = mode === 'uncapped' ? ['--disable-gpu-vsync', '--disable-frame-rate-limit'] : [];
const browser = await chromium.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: false,
  args: ['--window-size=1920,1180', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', ...uncapped],
});
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
const events = [];
const errors = [];
const postWarnings = [];
page.on('console', (m) => {
  const t = m.text();
  if (t.includes('Assembly start') || t.includes('Assembly end')) events.push({ t: Date.now(), kind: t.includes('start') ? 'start' : 'end' });
  if (m.type() === 'error') errors.push(t.slice(0, 300));
  // T034 rework 2: record the URP post-processing strip warning if it ever comes back.
  if (/stripped|PostProcessing render passes/i.test(t)) postWarnings.push(t.slice(0, 300));
});
page.on('pageerror', (e) => errors.push(String(e).slice(0, 300)));
await page.goto(url, { waitUntil: 'load' });
await page.evaluate(() => {
  window.__frames = [];
  const loop = (ts) => { window.__frames.push({ ts, wall: Date.now() }); requestAnimationFrame(loop); };
  requestAnimationFrame(loop);
});
await page.waitForTimeout(Number(seconds) * 1000);
const frames = await page.evaluate(() => window.__frames);
await page.screenshot({ path: out.replace('.json', '.png') });
await browser.close();

const dts = [];
for (let i = 1; i < frames.length; i++) dts.push({ dt: frames[i].ts - frames[i - 1].ts, wall: frames[i].wall });
const median = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : null; };
const windows = [];
let open = null;
for (const e of events) { if (e.kind === 'start') open = e.t; else if (open) { windows.push([open, e.t]); open = null; } }
const inAssembly = dts.filter((d) => windows.some(([a, b]) => d.wall >= a && d.wall <= b)).map((d) => d.dt);
const settled = dts.filter((d) => d.wall > frames[0].wall + 15000).map((d) => d.dt);
const result = {
  url, seconds: Number(seconds), mode, frames: frames.length,
  medianFpsAll: settled.length ? +(1000 / median(settled)).toFixed(1) : null,
  assemblyWindows: windows.length,
  assemblyFrames: inAssembly.length,
  medianFpsDuringAssembly: inAssembly.length ? +(1000 / median(inAssembly)).toFixed(1) : null,
  worstFrameMsDuringAssembly: inAssembly.length ? +Math.max(...inAssembly).toFixed(1) : null,
  p95FrameMsDuringAssembly: inAssembly.length ? +[...inAssembly].sort((a, b) => a - b)[Math.floor(inAssembly.length * 0.95)].toFixed(1) : null,
  consoleErrors: errors,
  postProcessingStripWarnings: postWarnings,
};
fs.writeFileSync(out, JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
