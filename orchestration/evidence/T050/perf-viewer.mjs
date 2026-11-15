// T050 viewer benchmark: drives the scripted mock session (`?mock=1`) of a built client on a
// phone-sized Chromium page (390 × 844, DPR 2, touch) and, with the CPU throttled ×4 over CDP,
// mounts and unmounts the vote screen's part viewers on a FIXED schedule (one action every
// 2.5 s: swipe the carousel to the next card; every 4th action also opens the full-screen
// viewer for 0.9 s and closes it), while the session itself remounts the cards on every
// INSPECT → VOTE → RESULT stage change. It records:
//   - every Long Tasks API entry (PerformanceObserver 'longtask', > 50 ms),
//   - WebGL contexts created (getContext('webgl'|'webgl2') on a fresh canvas),
//   - WEBGL_lose_context.loseContext() calls (what three's forceContextLoss() does),
//   - the long-task time that starts within 2.5 s after each action (the action's cost).
// The turntable runs (prefers-reduced-motion: no-preference). Screenshots of the first card and
// the full viewer are taken first in a separate reduced-motion page, unthrottled, so the
// model angle is the same in both builds.
//
// Usage (from client/, after `npx vite build`):
//   node ../orchestration/evidence/T050/perf-viewer.mjs --dir dist --label after [--actions 24] [--nogl 1]
// `--nogl 1` disables WebGL (every viewer is the 2D wireframe): the floor the rest of the vote
// screen costs. Output: orchestration/evidence/T050/runs/<label>-<n>.json, shots/<label>-*.png
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const clientDir = resolve(here, '../../../client');
const require = createRequire(join(clientDir, 'package.json'));
const { chromium } = require('playwright-core');

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1]]] : acc), []),
);
const distDir = resolve(process.cwd(), args.dir ?? 'dist');
const label = args.label ?? 'run';
const actions = Number(args.actions ?? 24);
const throttle = Number(args.throttle ?? 4);
const ACTION_MS = 2500;

const TYPES = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.glb': 'model/gltf-binary', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2',
  '.webmanifest': 'application/manifest+json', '.txt': 'text/plain', '.ico': 'image/x-icon',
};
const server = createServer((req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  let file = join(distDir, path);
  if (!file.startsWith(distDir)) return void res.writeHead(403).end();
  if (!existsSync(file) || statSync(file).isDirectory()) file = join(distDir, 'index.html');
  res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
  res.end(readFileSync(file));
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;

const browser = await chromium.launch({
  args: args.nogl ? ['--disable-webgl', '--disable-webgl2'] : ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});

function instrument() {
  const w = window;
  w.__perf = { longtasks: [], contexts: 0, contextsTotal: 0, losses: 0, stages: [], recording: false };
  const seen = new WeakSet();
  const orig = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (type, ...rest) {
    const ctx = orig.call(this, type, ...rest);
    if (ctx && (type === 'webgl' || type === 'webgl2') && !seen.has(this)) {
      seen.add(this);
      w.__perf.contextsTotal++;
      if (w.__perf.recording) w.__perf.contexts++;
      const getExt = ctx.getExtension.bind(ctx);
      ctx.getExtension = (name) => {
        const ext = getExt(name);
        if (ext && name === 'WEBGL_lose_context' && !ext.__wrapped) {
          const lose = ext.loseContext.bind(ext);
          ext.loseContext = () => {
            if (w.__perf.recording) w.__perf.losses++;
            return lose();
          };
          ext.__wrapped = true;
        }
        return ext;
      };
    }
    return ctx;
  };
  new PerformanceObserver((list) => {
    if (!w.__perf.recording) return;
    for (const e of list.getEntries()) w.__perf.longtasks.push({ start: Math.round(e.startTime), ms: Math.round(e.duration) });
  }).observe({ type: 'longtask', buffered: false });
}

async function openVote(reducedMotion) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    reducedMotion,
  });
  await context.addInitScript(instrument);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto(`${base}/?mock=1&speed=1&room=KQXM`);
  await page.getByTestId('join-nick').fill('Ada');
  await page.getByTestId('join-submit').click();
  await page.getByTestId('screen-role').waitFor({ timeout: 30_000 });
  await page.getByTestId('role-ready').click();
  await page.locator('[data-testid="screen-vote"][data-stage="INSPECT"]').waitFor({ timeout: 90_000 });
  return { context, page, errors };
}

const shotsDir = join(here, 'shots');
const runsDir = join(here, 'runs');
mkdirSync(shotsDir, { recursive: true });
mkdirSync(runsDir, { recursive: true });

// ───────────── screenshots (reduced motion: a still model) ─────────────
{
  const { context, page } = await openVote('reduce');
  await page.waitForTimeout(2500);
  await page.locator('.carousel__slot').first().locator('.viewer').screenshot({ path: join(shotsDir, `${label}-card.png`) });
  await page.locator('.carousel__slot').first().getByTestId('viewer-expand').click();
  await page.getByTestId('viewer-sheet').waitFor();
  await page.waitForTimeout(2500);
  await page.getByTestId('viewer-sheet').locator('.viewer').screenshot({ path: join(shotsDir, `${label}-full.png`) });
  await context.close();
}

// ───────────── measurement (turntable on, CPU ×4) ─────────────
const { context, page, errors } = await openVote('no-preference');
const glInfo = await page.evaluate(() => {
  const gl = document.createElement('canvas').getContext('webgl');
  const ext = gl?.getExtension('WEBGL_debug_renderer_info');
  return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl ? 'webgl (renderer hidden)' : 'none';
});
const cdp = await context.newCDPSession(page);
await cdp.send('Emulation.setCPUThrottlingRate', { rate: throttle });
await page.evaluate(() => {
  const w = window;
  w.__perf.recording = true;
  w.__perf.t0 = performance.now();
  const note = () => {
    const el = document.querySelector('[data-testid="screen-vote"]');
    const s = el ? el.getAttribute('data-stage') : document.querySelector('[data-testid^="screen-"]')?.getAttribute('data-testid');
    const last = w.__perf.stages[w.__perf.stages.length - 1];
    if (s && s !== last?.s) w.__perf.stages.push({ s, at: Math.round(performance.now()) });
  };
  new MutationObserver(note).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-stage', 'data-testid'] });
  note();
});

const marks = [];
let swipes = 0;
let expands = 0;
const t0 = Date.now();
for (let i = 1; i <= actions; i++) {
  const wait = t0 + i * ACTION_MS - Date.now();
  if (wait > 0) await page.waitForTimeout(wait);
  try {
    const dots = page.locator('.dot');
    const n = await dots.count();
    if (n === 0) {
      marks.push({ kind: 'none', at: await page.evaluate(() => Math.round(performance.now())) });
      continue;
    }
    const at = await page.evaluate(() => Math.round(performance.now()));
    await dots.nth(i % n).click({ timeout: 2000 });
    swipes++;
    let kind = 'swipe';
    if (i % 4 === 0) {
      const btn = page.locator('.carousel__slot').nth(i % n).getByTestId('viewer-expand');
      if (await btn.isVisible()) {
        await btn.click({ timeout: 2000 });
        await page.waitForTimeout(900);
        await page.keyboard.press('Escape');
        expands++;
        kind = 'swipe+expand';
      }
    }
    marks.push({ kind, at });
  } catch {
    marks.push({ kind: 'missed', at: await page.evaluate(() => Math.round(performance.now())) });
  }
}
await page.waitForTimeout(ACTION_MS);

const perf = await page.evaluate(() => {
  const w = window;
  w.__perf.recording = false;
  return { ...w.__perf, motion: document.documentElement.dataset.motion, elapsedMs: Math.round(performance.now() - w.__perf.t0) };
});
await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
await browser.close();
server.close();

const ms = perf.longtasks.map((t) => t.ms).sort((a, b) => b - a);
const sum = ms.reduce((a, b) => a + b, 0);
const perAction = marks
  .filter((m) => m.kind.startsWith('swipe'))
  .map((m) => perf.longtasks.filter((t) => t.start >= m.at && t.start < m.at + ACTION_MS).reduce((a, t) => a + t.ms, 0));
const stageCost = perf.stages.slice(1).map((st) => ({
  stage: st.s,
  maxTaskMs: Math.max(0, ...perf.longtasks.filter((t) => t.start >= st.at - 300 && t.start < st.at + 1500).map((t) => t.ms)),
}));
const summary = {
  label,
  dist: distDir,
  webgl: glInfo,
  motion: perf.motion,
  cpuThrottle: throttle,
  actions,
  elapsedMs: perf.elapsedMs,
  swipes,
  expands,
  stagesSeen: perf.stages.map((s) => s.s),
  webglContextsCreatedWhileMeasuring: perf.contexts,
  webglContextsCreatedPageLifetime: perf.contextsTotal,
  loseContextCalls: perf.losses,
  longTasks: ms.length,
  longTaskTotalMs: sum,
  longTaskMaxMs: ms[0] ?? 0,
  longTasksOver200ms: ms.filter((v) => v > 200).length,
  longTaskP50Ms: ms[Math.floor(ms.length / 2)] ?? 0,
  longTaskMsPerActionMean: perAction.length ? Math.round(perAction.reduce((a, b) => a + b, 0) / perAction.length) : 0,
  longestTaskAroundStageChanges: stageCost,
  top10: ms.slice(0, 10),
  pageErrors: errors.slice(0, 10),
};
let n = 1;
while (existsSync(join(runsDir, `${label}-${n}.json`))) n++;
writeFileSync(join(runsDir, `${label}-${n}.json`), JSON.stringify({ ...summary, marks, longTaskEntries: perf.longtasks }, null, 2));
console.log(JSON.stringify(summary, null, 2));
