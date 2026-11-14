// Orbit minigames (T021) in the single-minigame lab. Starts its own Vite dev server on port
// 5183, saves screenshots to e2e/screenshots/minigames/<id>-{demo,play,onebutton}.png (copied
// to orchestration/evidence/T021/), plays a whole run with the scripted good player, and
// measures the frame rate at a ×4 CPU throttle. Fails on console errors and missing strings.
//
//   npx playwright test e2e/minigames/orbit            (with the main config: also builds)
//   npx playwright test -c e2e/minigames/orbit/playwright.lab.config.ts   (lab only, faster)
import { expect, test, type ConsoleMessage, type Page } from '@playwright/test';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer, type ViteDevServer } from 'vite';

const HERE = dirname(fileURLToPath(import.meta.url));
const CLIENT = join(HERE, '..', '..', '..');
const SHOTS = join(CLIENT, 'e2e', 'screenshots', 'minigames');
const EVIDENCE = join(CLIENT, '..', 'orchestration', 'evidence', 'T021');
const PORT = 5183;
const ORIGIN = `http://127.0.0.1:${PORT}`;

mkdirSync(SHOTS, { recursive: true });
mkdirSync(EVIDENCE, { recursive: true });

/** Orbit minigames in brief order; only the ones whose folder exists are tested. */
const ALL = ['MG-13', 'MG-15', 'MG-21', 'MG-14', 'MG-18', 'MG-20', 'MG-16', 'MG-17', 'MG-19'];
const PRESENT = ALL.filter((id) => existsSync(join(CLIENT, 'src', 'minigames', id, 'index.ts')));

/** Extra query per minigame for the play screenshot (a representative moment). */
const PLAY_AT_MS: Record<string, number> = {
  'MG-13': 6500,
  'MG-15': 9000,
  'MG-21': 7000,
  'MG-14': 1800,
  'MG-18': 12500,
  'MG-20': 3600,
  'MG-16': 5000,
  'MG-17': 4500,
  'MG-19': 900,
};
const EXTRA: Record<string, string> = {
  'MG-15': '&p=' + encodeURIComponent(JSON.stringify({ slot: 1, slots: 4 })),
};

/** Additional moments worth a screenshot: `<id>-<name>.png` after `at` ms of play. */
const MORE_SHOTS: Record<string, Array<{ name: string; at: number; query?: string }>> = {
  'MG-15': [{ name: 'phase1', at: 2900 }],
  'MG-17': [{ name: 'stack', at: 4600, query: '&auto=0' }],
  'MG-19': [{ name: 'complete', at: 12000 }],
  'MG-14': [
    { name: 'outcome', at: 4200 },
    { name: 'relaxed', at: 1500, query: '&mode=RELAXED' },
  ],
};

/** Play time per minigame from data/minigames.json, ms. */
const DURATION_MS: Record<string, number> = Object.fromEntries(
  (JSON.parse(readFileSync(join(CLIENT, '..', 'data', 'minigames.json'), 'utf-8')) as { minigames: Array<{ id: string; duration_s: number }> }).minigames.map((m) => [m.id, m.duration_s * 1000]),
);

let server: ViteDevServer;

test.beforeAll(async () => {
  server = await createServer({
    root: CLIENT,
    configFile: join(CLIENT, 'vite.config.ts'),
    logLevel: 'warn',
    // No hot reload: other work in client/ must not reload the lab in the middle of a run.
    server: { host: '127.0.0.1', port: PORT, strictPort: true, hmr: false },
  });
  await server.listen();
});

test.afterAll(async () => {
  await server?.close();
});

/** Collects console errors, page errors and `[i18n] missing string` warnings. */
function watchConsole(page: Page): string[] {
  const problems: string[] = [];
  page.on('console', (m: ConsoleMessage) => {
    const text = m.text();
    if (m.type() === 'error') problems.push(`error: ${text}`);
    if (text.includes('[i18n] missing string')) problems.push(text);
  });
  page.on('pageerror', (e) => problems.push(`pageerror: ${String(e)}`));
  return problems;
}

async function waitReady(page: Page) {
  // Polls from Node so it also works while the page clock is frozen.
  // Up to 60 s: the first load can wait for Vite's dependency optimisation.
  for (let i = 0; i < 1200; i++) {
    const s = await page.evaluate(() => {
      const lab = (window as unknown as { __lab?: { ready: boolean; error: string | null } }).__lab;
      return lab ? { ready: lab.ready, error: lab.error } : null;
    });
    if (s?.error) throw new Error(s.error);
    if (s?.ready) return;
    await page.waitForTimeout(50);
  }
  throw new Error('lab not ready');
}

const T0 = new Date('2026-11-14T12:00:00Z').getTime();
/** Next frozen time per page: every `open` pauses further ahead than any run before it. */
const nextPause = new WeakMap<Page, number>();

/**
 * Opens the lab. With `clock`, page time is frozen from the start (install + pauseAt) so
 * every screenshot is taken after exactly the `runFor` the test asks for.
 */
async function open(page: Page, query: string, clock = true) {
  if (clock) {
    let at = nextPause.get(page);
    if (at === undefined) {
      await page.clock.install({ time: T0 });
      at = T0 + 1000;
    }
    await page.clock.pauseAt(at);
    nextPause.set(page, at + 600_000);
  }
  await page.goto(`${ORIGIN}/e2e/minigames/orbit/lab.html?${query}`);
  await waitReady(page);
}

async function shot(page: Page, name: string) {
  const path = join(SHOTS, `${name}.png`);
  await page.screenshot({ path, animations: 'disabled' });
  copyFileSync(path, join(EVIDENCE, `${name}.png`));
}

type LabResult = { success: boolean; perfect: boolean; score: number; value?: number | null } | null;

/** Advances page time in 2 s slices until the lab has a result (at most `maxMs`). */
async function runUntilResult(page: Page, maxMs: number) {
  for (let t = 0; t < maxMs; t += 2000) {
    await page.clock.runFor(2000);
    const done = await page.evaluate(() => (window as unknown as { __lab: { result: unknown } }).__lab.result !== null);
    if (done) return;
  }
}

async function labResult(page: Page): Promise<{ result: LabResult; atMs: number | null; haptics: Array<number | number[]> }> {
  return page.evaluate(() => {
    const lab = (window as unknown as { __lab: { result: LabResult; resultAtMs: number | null; haptics: Array<number | number[]> } }).__lab;
    return { result: lab.result, atMs: lab.resultAtMs, haptics: lab.haptics };
  });
}

test.describe.configure({ mode: 'serial' });

test('lab smoke with MG-08', async ({ page }) => {
  test.skip(!existsSync(join(CLIENT, 'src', 'minigames', 'MG-08', 'index.ts')), 'MG-08 not present');
  const problems = watchConsole(page);
  await open(page, 'mg=MG-08&seed=8');
  await page.clock.runFor(5000);
  const path = join(EVIDENCE, 'lab-smoke.png');
  await page.screenshot({ path, animations: 'disabled' });
  expect(problems).toEqual([]);
});

for (const id of PRESENT) {
  test.describe(id, () => {
    test(`${id} demo, play and one-button screenshots`, async ({ page }) => {
      const problems = watchConsole(page);
      const extra = EXTRA[id] ?? '';

      await open(page, `mg=${id}&demo=1&seed=11`);
      await page.clock.runFor(1700);
      await shot(page, `${id}-demo`);

      await open(page, `mg=${id}&seed=11&auto=1${extra}`);
      await page.clock.runFor(PLAY_AT_MS[id] ?? 6000);
      await shot(page, `${id}-play`);

      await open(page, `mg=${id}&seed=11&mode=ONE_BUTTON&auto=1${extra}`);
      await page.clock.runFor(PLAY_AT_MS[id] ?? 6000);
      await shot(page, `${id}-onebutton`);

      for (const more of MORE_SHOTS[id] ?? []) {
        await open(page, `mg=${id}&seed=11&auto=1${extra}${more.query ?? ''}`);
        await page.clock.runFor(more.at);
        await shot(page, `${id}-${more.name}`);
      }

      expect(problems).toEqual([]);
    });

    test(`${id} full run: the scripted player succeeds, idle fails, never past durationMs`, async ({ page }) => {
      const problems = watchConsole(page);
      const extra = EXTRA[id] ?? '';
      for (const mode of ['STANDARD', 'RELAXED', 'ONE_BUTTON']) {
        await open(page, `mg=${id}&seed=21&mode=${mode}&auto=1${extra}`);
        await runUntilResult(page, 46_000);
        const { result, atMs, haptics } = await labResult(page);
        expect(result, `${id} ${mode} result`).not.toBeNull();
        expect(result!.success, `${id} ${mode} success`).toBe(true);
        // Never after durationMs (one 60 Hz frame of slack for the frame that reports it).
        expect(atMs!).toBeLessThanOrEqual(DURATION_MS[id]! + 17);
        for (const h of haptics) {
          const total = typeof h === 'number' ? h : h.reduce((a, b) => a + b, 0);
          expect(total).toBeLessThanOrEqual(300);
        }
      }
      for (const mode of ['STANDARD', 'RELAXED', 'ONE_BUTTON']) {
        await open(page, `mg=${id}&seed=21&mode=${mode}${extra}`);
        await runUntilResult(page, 46_000);
        const idle = await labResult(page);
        expect(idle.result, `${id} ${mode} idle result`).not.toBeNull();
        expect(idle.result!.success, `${id} ${mode} idle`).toBe(false);
        expect(idle.atMs!).toBeLessThanOrEqual(DURATION_MS[id]! + 17);
      }
      expect(problems).toEqual([]);
    });

    test(`${id} right-to-left at 200 % text with reduced motion`, async ({ page }) => {
      const problems = watchConsole(page);
      await open(page, `mg=${id}&seed=11&auto=1&dir=rtl&scale=2&rm=1${EXTRA[id] ?? ''}`);
      await page.clock.runFor(PLAY_AT_MS[id] ?? 6000);
      await shot(page, `${id}-rtl-200`);
      expect(problems).toEqual([]);
    });
  });
}

test('frame rate at a ×4 CPU throttle', async ({ page }) => {
  test.setTimeout(PRESENT.length * 30_000 + 30_000);
  const lines: string[] = ['# T021 frame rate at Chromium CPU throttle ×4', '', 'Real clock, 5 s of play with the scripted player, median of frame intervals.', '', '| Minigame | Median fps | Frames in 5 s |', '|---|---|---|'];
  const cdp = await page.context().newCDPSession(page);
  const failures: string[] = [];
  for (const id of PRESENT) {
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    await open(page, `mg=${id}&seed=31&auto=1${EXTRA[id] ?? ''}`, false);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    await page.waitForTimeout(500);
    const startT = await page.evaluate(() => performance.now());
    await page.waitForTimeout(5000);
    const stats = await page.evaluate((t0) => {
      const times = (window as unknown as { __lab: { frameTimes: number[] } }).__lab.frameTimes.filter((x) => x >= t0);
      const d: number[] = [];
      for (let i = 1; i < times.length; i++) d.push(times[i]! - times[i - 1]!);
      d.sort((a, b) => a - b);
      const med = d.length ? d[Math.floor(d.length / 2)]! : Infinity;
      return { fps: 1000 / med, frames: times.length };
    }, startT);
    lines.push(`| ${id} | ${stats.fps.toFixed(1)} | ${stats.frames} |`);
    if (stats.fps < 30) failures.push(`${id}: ${stats.fps.toFixed(1)} fps`);
  }
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  lines.push('', `Measured ${new Date().toISOString()} with Playwright Chromium, viewport 390 × 844 at DPR 2.`);
  writeFileSync(join(EVIDENCE, 'fps.md'), lines.join('\n') + '\n');
  expect(failures).toEqual([]);
});
