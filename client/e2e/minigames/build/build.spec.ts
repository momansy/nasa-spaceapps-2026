// Build minigames (T019) in the single-minigame lab. Starts its own Vite dev server on port
// 5181, saves screenshots to e2e/screenshots/minigames/<id>-{demo,play,onebutton}.png (copied
// to orchestration/evidence/T019/), plays whole runs with the scripted good player and idle,
// and measures the frame rate at a ×4 CPU throttle. Fails on console errors and missing strings.
//
//   npx playwright test e2e/minigames/build            (with the main config: also builds)
//   npx playwright test -c e2e/minigames/build/playwright.lab.config.ts   (lab only, faster)
import { expect, test, type ConsoleMessage, type Page } from '@playwright/test';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer, type ViteDevServer } from 'vite';

const HERE = dirname(fileURLToPath(import.meta.url));
const CLIENT = join(HERE, '..', '..', '..');
const SHOTS = join(CLIENT, 'e2e', 'screenshots', 'minigames');
const EVIDENCE = join(CLIENT, '..', 'orchestration', 'evidence', 'T019');
const PORT = 5181;
const ORIGIN = `http://127.0.0.1:${PORT}`;

mkdirSync(SHOTS, { recursive: true });
mkdirSync(EVIDENCE, { recursive: true });

/** Build minigames in brief order; only the ones whose folder exists are tested. */
const ALL = ['MG-02', 'MG-01', 'MG-29', 'MG-06', 'MG-03', 'MG-04', 'MG-05', 'MG-30'];
const ONLY = process.env.T019_ONLY ? process.env.T019_ONLY.split(',') : null;
const PRESENT = ALL.filter((id) => existsSync(join(CLIENT, 'src', 'minigames', id, 'index.ts')) && (!ONLY || ONLY.includes(id)));

/** Play time before the play / one-button screenshots, ms (a representative moment). */
const PLAY_AT_MS: Record<string, number> = {
  'MG-02': 7000,
  'MG-01': 6200,
  'MG-29': 6400,
  'MG-06': 15_000,
  'MG-03': 6500,
  'MG-04': 5200,
  'MG-05': 9000,
  'MG-30': 12500,
};
const ONE_AT_MS: Record<string, number> = { 'MG-29': 3500, 'MG-30': 5000 };
/** Extra query per minigame (team slot etc.). */
const EXTRA: Record<string, string> = {
  'MG-06': '&p=' + encodeURIComponent(JSON.stringify({ slot: 1, slots: 3 })),
  'MG-30': '&p=' + encodeURIComponent(JSON.stringify({ slot: 1, slots: 4 })),
};
/** Additional moments worth a screenshot: `<id>-<name>.png` after `at` ms of play. */
const MORE_SHOTS: Record<string, Array<{ name: string; at: number; query?: string }>> = {
  'MG-02': [{ name: 'result', at: 23_000 }],
  'MG-29': [
    { name: 'reveal', at: 8800 },
    { name: 'q-orbit', at: 7800, query: '&p=' + encodeURIComponent(JSON.stringify({ question: 3 })) },
  ],
  'MG-04': [{ name: 'summary', at: 12_000 }],
  'MG-30': [
    { name: 'pick', at: 4000 },
    { name: 'reveal', at: 21_800 },
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
  // Polls from Node so it also works while the page clock is frozen. Up to 60 s: the first
  // load can wait for Vite's dependency optimisation.
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
const nextPause = new WeakMap<Page, number>();

/** Opens the lab. With `clock`, page time is frozen from the start so screenshots are exact. */
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
  await page.goto(`${ORIGIN}/e2e/minigames/build/lab.html?${query}`);
  await waitReady(page);
}

async function shot(page: Page, name: string) {
  const path = join(SHOTS, `${name}.png`);
  await page.screenshot({ path, animations: 'disabled' });
  copyFileSync(path, join(EVIDENCE, `${name}.png`));
}

type LabResult = { success: boolean; perfect: boolean; score: number; value?: number | null } | null;

/** Advances page time in 1 s slices until the lab has a result (at most `maxMs`). */
async function runUntilResult(page: Page, maxMs: number) {
  for (let t = 0; t < maxMs; t += 1000) {
    await page.clock.runFor(1000);
    const done = await page.evaluate(() => (window as unknown as { __lab: { result: unknown } }).__lab.result !== null);
    if (done) return;
  }
}

async function labResult(page: Page): Promise<{ result: LabResult; atMs: number | null; results: number; haptics: Array<number | number[]> }> {
  return page.evaluate(() => {
    const lab = (window as unknown as { __lab: { result: LabResult; resultAtMs: number | null; results: number; haptics: Array<number | number[]> } }).__lab;
    return { result: lab.result, atMs: lab.resultAtMs, results: lab.results, haptics: lab.haptics };
  });
}

test.describe.configure({ mode: 'serial' });

test('lab smoke with MG-08', async ({ page }) => {
  test.skip(!existsSync(join(CLIENT, 'src', 'minigames', 'MG-08', 'index.ts')) || !!ONLY, 'MG-08 not present or filtered');
  const problems = watchConsole(page);
  await open(page, 'mg=MG-08&seed=8');
  await page.clock.runFor(5000);
  await page.screenshot({ path: join(EVIDENCE, 'lab-smoke.png'), animations: 'disabled' });
  expect(problems).toEqual([]);
});

for (const id of PRESENT) {
  test.describe(id, () => {
    test(`${id} demo, play and one-button screenshots`, async ({ page }) => {
      const problems = watchConsole(page);
      const extra = EXTRA[id] ?? '';

      await open(page, `mg=${id}&demo=1&seed=11`);
      await page.clock.runFor(2000);
      await shot(page, `${id}-demo`);

      await open(page, `mg=${id}&seed=11&auto=1${extra}`);
      await page.clock.runFor(PLAY_AT_MS[id] ?? 6000);
      await shot(page, `${id}-play`);

      await open(page, `mg=${id}&seed=11&mode=ONE_BUTTON&auto=1${extra}`);
      await page.clock.runFor(ONE_AT_MS[id] ?? PLAY_AT_MS[id] ?? 6000);
      await shot(page, `${id}-onebutton`);

      for (const more of MORE_SHOTS[id] ?? []) {
        await open(page, `mg=${id}&seed=11&auto=1${extra}${more.query ?? ''}`);
        await page.clock.runFor(more.at);
        await shot(page, `${id}-${more.name}`);
      }
      expect(problems).toEqual([]);
    });

    test(`${id} full runs: scripted player succeeds, idle fails, one result, never past durationMs`, async ({ page }) => {
      const problems = watchConsole(page);
      const extra = EXTRA[id] ?? '';
      const dur = DURATION_MS[id]!;
      for (const mode of ['STANDARD', 'RELAXED', 'ONE_BUTTON']) {
        await open(page, `mg=${id}&seed=21&mode=${mode}&auto=1${extra}`);
        await runUntilResult(page, dur + 4000);
        const { result, atMs, haptics } = await labResult(page);
        expect(result, `${id} ${mode} result`).not.toBeNull();
        expect(result!.success, `${id} ${mode} success`).toBe(true);
        expect(atMs!).toBeLessThanOrEqual(dur + 17);
        for (const h of haptics) {
          const total = typeof h === 'number' ? h : h.reduce((a, b) => a + b, 0);
          expect(total).toBeLessThanOrEqual(300);
        }
        // Exactly one result, even when time runs on.
        await page.clock.runFor(3000);
        expect((await labResult(page)).results).toBe(1);
      }
      if (id !== 'MG-30') {
        for (const mode of ['STANDARD', 'RELAXED', 'ONE_BUTTON']) {
          await open(page, `mg=${id}&seed=21&mode=${mode}${extra}`);
          await runUntilResult(page, dur + 4000);
          const idle = await labResult(page);
          expect(idle.result, `${id} ${mode} idle result`).not.toBeNull();
          expect(idle.result!.success, `${id} ${mode} idle`).toBe(false);
          expect(idle.atMs!).toBeLessThanOrEqual(dur + 17);
        }
      }
      expect(problems).toEqual([]);
    });
  });
}

test('right-to-left at 200 % text with reduced motion', async ({ page }) => {
  const problems = watchConsole(page);
  for (const id of PRESENT) {
    await open(page, `mg=${id}&seed=11&auto=1&dir=rtl&scale=2&rm=1${EXTRA[id] ?? ''}`);
    await page.clock.runFor(PLAY_AT_MS[id] ?? 6000);
    await shot(page, `${id}-rtl-200`);
  }
  expect(problems).toEqual([]);
});

test('frame rate at a ×4 CPU throttle', async ({ page }) => {
  test.setTimeout(PRESENT.length * 30_000 + 30_000);
  const rows: string[] = [];
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
    rows.push(`| ${id} | ${stats.fps.toFixed(1)} | ${stats.frames} |`);
    if (stats.fps < 30) failures.push(`${id}: ${stats.fps.toFixed(1)} fps`);
  }
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  // Keeps rows of minigames measured in earlier runs (the file is per minigame).
  const path = join(EVIDENCE, 'fps.md');
  const old = existsSync(path) ? readFileSync(path, 'utf-8').split('\n').filter((l) => /^\| MG-/.test(l)) : [];
  const byId = new Map<string, string>(old.map((l) => [l.split('|')[1]!.trim(), l]));
  for (const r of rows) byId.set(r.split('|')[1]!.trim(), r);
  const ordered = ALL.filter((id) => byId.has(id)).map((id) => byId.get(id)!);
  const lines = ['# T019 frame rate at Chromium CPU throttle ×4', '', 'Real clock, 5 s of play with the scripted player, median of frame intervals (Playwright Chromium, 390 × 844 at DPR 2).', '', '| Minigame | Median fps | Frames in 5 s |', '|---|---|---|', ...ordered, '', `Last measured ${new Date().toISOString()}.`];
  writeFileSync(path, lines.join('\n') + '\n');
  expect(failures).toEqual([]);
});
