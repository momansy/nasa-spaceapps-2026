// T022 lab tests: every delivered minigame is mounted in the lab, played with the mouse, and
// photographed. Vite dev serves the lab on port 5184 (see helpers.ts).
import { expect, test, type Page } from '@playwright/test';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ViteDevServer } from 'vite';
import { EVIDENCE, medianFps, openLab, shot, startVite, throttle, watchConsole, type LabOpts } from './helpers';

let server: ViteDevServer;
test.beforeAll(async () => {
  server = await startVite();
});
test.afterAll(async () => {
  await server.close();
});

const FPS_FILE = join(EVIDENCE, 'fps.md');
function logFps(id: string, fps: number) {
  // One row per minigame; a re-run of one minigame replaces its row.
  const rows = new Map<string, string>();
  if (existsSync(FPS_FILE))
    for (const line of readFileSync(FPS_FILE, 'utf8').split('\n')) {
      const m = /^\| (MG-\d+) \| (.+) \|$/.exec(line);
      if (m) rows.set(m[1]!, m[2]!);
    }
  rows.set(id, String(fps));
  const body = [...rows.entries()].sort().map(([k, v]) => `| ${k} | ${v} |`).join('\n');
  writeFileSync(FPS_FILE, `# Median fps at Chromium CPU throttle x4 (real clock, 5 s, Chromium headless)\n\n| Minigame | Median fps |\n|---|---|\n${body}\n`);
}

test.describe('lab smoke (MG-08, the reference)', () => {
  test('MG-08 mounts, plays and reports one result', async ({ page }) => {
    const con = watchConsole(page);
    await openLab(page, { mg: 'MG-08', dur: 4000 });
    await page.clock.runFor(1500);
    await shot(page, 'lab-smoke', false);
    await page.clock.runFor(3500);
    const result = await page.evaluate(() => ({ r: window.__lab.result, n: window.__lab.resultCount }));
    expect(result.n).toBe(1);
    expect(result.r).not.toBeNull();
    con.assertClean();
  });
});

// ───────────────────────── per-minigame lab runs ─────────────────────────

interface Entry {
  id: string;
  /** Play script: advances the fake clock by `ms` of play while using the mouse. Always uses `run`. */
  play: (page: Page, run: (ms: number) => Promise<void>, mode: string) => Promise<void>;
  /** Extra lab options. */
  opts?: Partial<LabOpts>;
  /** Seconds of play (data default) used to run to the end. */
  durS: number;
  /** Time into the play at which the "play" screenshot is taken, ms. */
  shotAtMs: number;
}

async function box(page: Page) {
  const b = await page.locator('#play canvas').boundingBox();
  if (!b) throw new Error('no canvas');
  return b;
}

const ENTRIES: Entry[] = [
  {
    id: 'MG-22',
    durS: 25,
    shotAtMs: 5000,
    async play(page, run, mode) {
      const b = await box(page);
      const cx = b.x + b.width / 2;
      const cy = b.y + b.height * 0.5;
      if (mode === 'ONE_BUTTON') {
        for (let i = 0; i < 12; i++) {
          await page.mouse.move(cx, cy);
          await page.mouse.down();
          await run(500);
          await page.mouse.up();
          await run(500);
        }
        return;
      }
      await page.mouse.move(cx, cy);
      await page.mouse.down();
      for (let i = 0; i < 14; i++) {
        await page.mouse.move(cx, cy + (i % 2 ? 22 : -22), { steps: 2 });
        await run(500);
      }
      await page.mouse.up();
    },
  },
];

for (const e of ENTRIES) {
  test.describe(e.id, () => {
    test(`${e.id}: demo loop`, async ({ page }) => {
      const con = watchConsole(page);
      await openLab(page, { mg: e.id, demo: true, ...e.opts });
      await page.clock.runFor(1900);
      await shot(page, `${e.id}-demo`);
      await page.clock.runFor(4000);
      con.assertClean();
    });

    for (const [mode, name] of [['STANDARD', 'play'], ['ONE_BUTTON', 'onebutton']] as const) {
      test(`${e.id}: ${mode} play, screenshot and one result`, async ({ page }) => {
        const con = watchConsole(page);
        await openLab(page, { mg: e.id, mode, seed: 7, ...e.opts });
        const run = async (ms: number) => {
          for (let t = 0; t < ms; t += 50) await page.clock.runFor(Math.min(50, ms - t));
        };
        let elapsed = 0;
        const clocked = async (ms: number) => {
          elapsed += ms;
          await run(ms);
          if (elapsed >= e.shotAtMs && elapsed - ms < e.shotAtMs) await shot(page, `${e.id}-${name}`);
        };
        await e.play(page, clocked, mode);
        await page.clock.runFor(e.durS * 1000 + 3000);
        const out = await page.evaluate(() => ({ r: window.__lab.result, n: window.__lab.resultCount }));
        expect(out.n).toBe(1);
        expect(out.r).not.toBeNull();
        expect(out.r!.score).toBeGreaterThanOrEqual(0);
        expect(out.r!.score).toBeLessThanOrEqual(1);
        if (out.r!.perfect) expect(out.r!.success).toBe(true);
        con.assertClean();
      });
    }

    test(`${e.id}: result is not delivered after destroy()`, async ({ page }) => {
      await openLab(page, { mg: e.id, seed: 3, ...e.opts });
      await page.clock.runFor(1000);
      await page.evaluate(() => window.__lab.destroy());
      await page.clock.runFor(e.durS * 1000 + 3000);
      const n = await page.evaluate(() => window.__lab.resultCount);
      expect(n).toBe(0);
    });

    test(`${e.id}: right-to-left, 200 % text, reduced motion`, async ({ page }) => {
      const con = watchConsole(page);
      await openLab(page, { mg: e.id, rtl: true, scale: 2, rm: true, seed: 5, ...e.opts });
      await page.clock.runFor(e.shotAtMs / 2);
      await shot(page, `${e.id}-rtl-x2-rm`);
      con.assertClean();
    });

    test(`${e.id}: at least 30 fps at CPU throttle x4`, async ({ page }) => {
      test.setTimeout(60_000);
      await openLab(page, { mg: e.id, seed: 11, mode: 'STANDARD', ...e.opts }, { clock: false });
      await throttle(page, 4);
      const b = await box(page);
      await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
      await page.mouse.down();
      const fps = await medianFps(page, 5000);
      await page.mouse.up();
      logFps(e.id, fps);
      expect(fps).toBeGreaterThanOrEqual(30);
    });
  });
}

