// Minigame lab checks for the launch and ascent minigames (task T020): every minigame is
// mounted alone in the lab page (`lab.html`) on a Vite dev server started here, played with
// scripted input on a fake clock, screenshotted, and measured for frame rate at CPU ×4.
//
// Screenshots: e2e/screenshots/minigames/<id>-demo.png, -play.png, -onebutton.png, copied to
// orchestration/evidence/T020/. Frame rates: orchestration/evidence/T020/fps.md.
import { expect, test, type Page } from '@playwright/test';
import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer, type ViteDevServer } from 'vite';
import { SCRIPTS, type LabScript } from './scripts';

const HERE = dirname(fileURLToPath(import.meta.url));
const CLIENT = resolve(HERE, '../../..');
const SHOTS = join(CLIENT, 'e2e/screenshots/minigames');
const EVIDENCE = resolve(CLIENT, '../orchestration/evidence/T020');
const PORT = 5182;
const ORIGIN = `http://127.0.0.1:${PORT}`;
/** The fake clock is paused this far after its start, once the page has loaded. */
const CLOCK_OFFSET_MS = 200_000;

mkdirSync(SHOTS, { recursive: true });
mkdirSync(EVIDENCE, { recursive: true });

let server: ViteDevServer | null = null;
const fpsLines: Array<{ id: string; mode: string; fps: number; frames: number }> = [];

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  server = await createServer({
    root: CLIENT,
    configFile: join(CLIENT, 'vite.config.ts'),
    logLevel: 'warn',
    server: { host: '127.0.0.1', port: PORT, strictPort: true },
  });
  await server.listen();
});

test.afterAll(async () => {
  await server?.close();
  server = null;
  if (fpsLines.length) {
    const rows = fpsLines.map((l) => `| ${l.id} | ${l.mode} | ${l.fps.toFixed(1)} | ${l.frames} | ${l.fps >= 30 ? 'pass' : 'FAIL'} |`);
    writeFileSync(
      join(EVIDENCE, 'fps.md'),
      [
        '# T020 frame rates',
        '',
        'Median frame rate over 5 s of play in the minigame lab (390 × 844, DPR 2, Chromium),',
        'real clock, CPU throttled ×4 with CDP `Emulation.setCPUThrottlingRate`. Written by',
        '`client/e2e/minigames/ascent/ascent.spec.ts`.',
        '',
        '| Minigame | Mode | Median fps | Frames | ≥ 30 |',
        '|---|---|---|---|---|',
        ...rows,
        '',
      ].join('\n'),
    );
  }
});

/** Collects console errors, page errors and missing-string warnings; the test fails on any. */
function watch(page: Page): string[] {
  const problems: string[] = [];
  page.on('console', (m) => {
    const text = m.text();
    if (m.type() === 'error') problems.push(`console error: ${text}`);
    if (text.includes('[i18n] missing string')) problems.push(text);
  });
  page.on('pageerror', (e) => problems.push(`page error: ${String(e)}`));
  return problems;
}

function labUrl(query: Record<string, string | number | undefined>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) if (v !== undefined) q.set(k, String(v));
  return `${ORIGIN}/e2e/minigames/ascent/lab.html?${q.toString()}`;
}

async function openLab(page: Page, query: Record<string, string | number | undefined>, fakeClock: boolean) {
  const t0 = 1_790_000_000_000;
  if (fakeClock) await page.clock.install({ time: t0 });
  await page.goto(labUrl(query));
  if (fakeClock) {
    // Stop the clock: from here on time moves only with runFor(), so shots are deterministic.
    await page.clock.pauseAt(t0 + CLOCK_OFFSET_MS);
    await page.clock.runFor(100);
  }
  await page.waitForFunction(() => window.__lab?.ready === true || !!window.__lab?.error, null, { timeout: 30_000 });
  const err = await page.evaluate(() => window.__lab.error);
  expect(err, 'lab error').toBeNull();
}

async function shot(page: Page, name: string) {
  const file = join(SHOTS, `${name}.png`);
  await page.screenshot({ path: file });
  copyFileSync(file, join(EVIDENCE, `${name}.png`));
}

/** Plays a scripted run on the fake clock: steps of `stepMs`, actions at their play times. */
async function playScript(page: Page, script: LabScript['play'], untilMs: number, stepMs = 50) {
  await page.evaluate(() => window.__lab.go());
  const actions = [...(script?.actions ?? [])].sort((a, b) => a.at - b.at);
  let now = 0;
  let i = 0;
  while (now < untilMs) {
    while (i < actions.length && actions[i]!.at <= now) {
      await actions[i]!.run(page);
      i++;
    }
    const next = Math.min(untilMs, i < actions.length ? Math.max(now + 1, Math.min(now + stepMs, actions[i]!.at)) : now + stepMs);
    await page.clock.runFor(next - now);
    now = next;
  }
}

test('lab smoke: MG-08 reference minigame mounts, plays and reports', async ({ page }) => {
  const problems = watch(page);
  await openLab(page, { mg: 'MG-08', hold: 1, seed: 8 }, true);
  await page.evaluate(() => window.__lab.go());
  await page.clock.runFor(6000);
  const file = join(EVIDENCE, 'lab-smoke.png');
  await page.screenshot({ path: file });
  await page.clock.runFor(15_000);
  const r = await page.evaluate(() => window.__lab.result);
  expect(r).not.toBeNull();
  expect(problems).toEqual([]);
});

for (const s of SCRIPTS) {
  test.describe(s.id, () => {
    test(`${s.id} demo`, async ({ page }) => {
      const problems = watch(page);
      await openLab(page, { mg: s.id, demo: 1, seed: s.seed, p: s.p ? JSON.stringify(s.p) : undefined }, true);
      await page.clock.runFor(s.demoShotMs ?? 2200);
      await shot(page, `${s.id}-demo`);
      expect(problems).toEqual([]);
    });

    test(`${s.id} play (standard, scripted good player)`, async ({ page }) => {
      const problems = watch(page);
      const query = { mg: s.id, hold: 1, seed: s.seed, p: s.p ? JSON.stringify(s.p) : undefined };
      await openLab(page, query, true);
      await playScript(page, s.play, s.playShotMs);
      await shot(page, `${s.id}-play`);
      if (s.playToEnd !== false) {
        await playScript(page, { actions: (s.play?.actions ?? []).filter((a) => a.at >= s.playShotMs).map((a) => ({ ...a, at: a.at - s.playShotMs })) }, s.durationMs - s.playShotMs + 1500);
        const r = await page.evaluate(() => ({ result: window.__lab.result, results: window.__lab.results }));
        expect(problems).toEqual([]);
        expect(r.results).toBe(1);
        if (s.expectSuccess) expect(r.result?.success, JSON.stringify(r.result)).toBe(true);
      }
      expect(problems).toEqual([]);
    });

    test(`${s.id} one-button`, async ({ page }) => {
      const problems = watch(page);
      await openLab(page, { mg: s.id, hold: 1, mode: 'ONE_BUTTON', seed: s.seed, p: s.p ? JSON.stringify(s.p) : undefined }, true);
      await playScript(page, s.oneButton, s.oneButtonShotMs ?? s.playShotMs);
      await shot(page, `${s.id}-onebutton`);
      expect(problems).toEqual([]);
    });

    test(`${s.id} frame rate at CPU ×4`, async ({ page }) => {
      const problems = watch(page);
      await openLab(page, { mg: s.id, seed: s.seed, p: s.p ? JSON.stringify(s.p) : undefined }, false);
      const cdp = await page.context().newCDPSession(page);
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
      const t0 = await page.evaluate(() => performance.now());
      // Light input while measuring, so input handling is part of the cost.
      const box = await page.locator('.mg-stage').boundingBox();
      if (box) {
        for (let k = 0; k < 10; k++) {
          await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * (0.35 + 0.03 * k));
          await page.mouse.down();
          await page.waitForTimeout(250);
          await page.mouse.move(box.x + box.width * 0.55, box.y + box.height * (0.45 + 0.02 * k));
          await page.mouse.up();
          await page.waitForTimeout(250);
        }
      } else await page.waitForTimeout(5000);
      const stats = await page.evaluate((from) => {
        const f = window.__lab.frames.filter((x) => x >= from + 300);
        const d: number[] = [];
        for (let i = 1; i < f.length; i++) d.push(f[i]! - f[i - 1]!);
        d.sort((a, b) => a - b);
        const med = d.length ? d[Math.floor(d.length / 2)]! : 1000;
        return { fps: 1000 / med, frames: f.length };
      }, t0);
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
      fpsLines.push({ id: s.id, mode: 'STANDARD', fps: stats.fps, frames: stats.frames });
      expect(stats.fps).toBeGreaterThanOrEqual(30);
      expect(problems).toEqual([]);
    });
  });
}

test('RTL, 200 % text and reduced motion', async ({ page }) => {
  test.skip(SCRIPTS.length === 0, 'no minigame delivered yet');
  const problems = watch(page);
  const s = SCRIPTS[0]!;
  await openLab(page, { mg: s.id, hold: 1, seed: s.seed, dir: 'rtl', scale: 2, rm: 1, p: s.p ? JSON.stringify(s.p) : undefined }, true);
  await playScript(page, s.play, s.playShotMs);
  await shot(page, `${s.id}-rtl-200-rm`);
  expect(problems).toEqual([]);
});
