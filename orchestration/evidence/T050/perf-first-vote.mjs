// T050 follow-up: the first part vote with and without the idle-time viewer prewarm.
// Serves a built client, runs the mock session (`?mock=1&speed=1`) on a 390 × 844 DPR 2 touch
// page with the CPU throttled ×4 from page load, waits `--role-ms` on the role card (where the
// prewarm is scheduled) before pressing Ready, and records:
//   - voteToFirstFrameMs: from the vote screen appearing to the first card showing a 3D frame
//     (a visible `canvas.viewer__gl` in the carousel), and cardsShownToFirstFrameMs from the
//     part cards appearing (INSPECT; the vote opens with REVEAL/PREDICT first);
//   - long tasks (> 50 ms) during the first part vote (vote screen shown → its RESULT stage, max 40 s)
//     and before it (where the prewarm moves the work).
// Usage (from client/): node ../orchestration/evidence/T050/perf-first-vote.mjs --dir <dist> --label <name>
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(join(resolve(here, '../../../client'), 'package.json'));
const { chromium } = require('playwright-core');
const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1]]] : acc), []),
);
const distDir = resolve(process.cwd(), args.dir ?? 'dist');
const label = args.label ?? 'run';
const roleMs = Number(args['role-ms'] ?? 3000);
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.glb': 'model/gltf-binary', '.svg': 'image/svg+xml' };
const server = createServer((req, res) => {
  let f = join(distDir, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (!f.startsWith(distDir)) return void res.writeHead(403).end();
  if (!existsSync(f) || statSync(f).isDirectory()) f = join(distDir, 'index.html');
  res.writeHead(200, { 'content-type': TYPES[extname(f)] ?? 'application/octet-stream' });
  res.end(readFileSync(f));
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));

const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, reducedMotion: 'no-preference' });
await context.addInitScript(() => {
  const w = window;
  w.__fv = { longtasks: [], vote: null, frame: null, result: null };
  new PerformanceObserver((list) => {
    for (const e of list.getEntries()) w.__fv.longtasks.push({ start: Math.round(e.startTime), ms: Math.round(e.duration) });
  }).observe({ type: 'longtask', buffered: true });
  const poll = () => {
    const now = performance.now();
    const vote = document.querySelector('[data-testid="screen-vote"]');
    if (vote && w.__fv.vote == null) w.__fv.vote = Math.round(now);
    if (w.__fv.cards == null && document.querySelector('.carousel__slot .viewer')) w.__fv.cards = Math.round(now);
    if (w.__fv.vote != null && w.__fv.frame == null) {
      const gl = [...document.querySelectorAll('.carousel__slot canvas.viewer__gl')].some((c) => getComputedStyle(c).visibility === 'visible');
      if (gl) w.__fv.frame = Math.round(now);
    }
    if (w.__fv.vote != null && w.__fv.result == null && document.querySelector('[data-testid="stage-result"]')) w.__fv.result = Math.round(now);
    requestAnimationFrame(poll);
  };
  requestAnimationFrame(poll);
});
const page = await context.newPage();
const cdp = await context.newCDPSession(page);
await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
await page.goto(`http://127.0.0.1:${server.address().port}/?mock=1&speed=1&room=KQXM`);
await page.getByTestId('join-nick').fill('Ada');
await page.getByTestId('join-submit').click();
await page.getByTestId('screen-role').waitFor({ timeout: 60_000 });
const roleAt = await page.evaluate(() => Math.round(performance.now()));
await page.waitForTimeout(roleMs);
await page.getByTestId('role-ready').click({ timeout: 30_000 });
await page.waitForFunction(() => window.__fv.vote != null, null, { timeout: 120_000 });
await page.waitForFunction(() => window.__fv.result != null || performance.now() - window.__fv.vote > 40_000, null, { timeout: 120_000, polling: 500 });
const fv = await page.evaluate(() => window.__fv);
await browser.close();
server.close();

const end = fv.result ?? fv.vote + 40_000;
const during = fv.longtasks.filter((t) => t.start >= fv.vote && t.start < end).map((t) => t.ms);
const before = fv.longtasks.filter((t) => t.start >= roleAt && t.start < fv.vote).map((t) => t.ms);
const stats = (a) => ({ count: a.length, totalMs: a.reduce((x, y) => x + y, 0), maxMs: Math.max(0, ...a), over200: a.filter((v) => v > 200).length });
const summary = {
  label,
  dist: distDir,
  cpuThrottle: 4,
  roleScreenMs: roleMs,
  msFromRoleCardToVote: fv.vote - roleAt,
  voteToFirstFrameMs: fv.frame == null ? null : fv.frame - fv.vote,
  cardsShownToFirstFrameMs: fv.frame == null || fv.cards == null ? null : fv.frame - fv.cards,
  firstVoteWindowMs: end - fv.vote,
  longTasksDuringFirstVote: stats(during),
  longTasksRoleCardToVote: stats(before),
};
mkdirSync(join(here, 'runs-first-vote'), { recursive: true });
let n = 1;
while (existsSync(join(here, 'runs-first-vote', `${label}-${n}.json`))) n++;
writeFileSync(join(here, 'runs-first-vote', `${label}-${n}.json`), JSON.stringify({ ...summary, raw: fv, roleAt }, null, 2));
console.log(JSON.stringify(summary));
