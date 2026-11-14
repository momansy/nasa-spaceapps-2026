// Accessibility and performance of the new screens: text at 200 %, right-to-left, high contrast,
// reduced motion, touch targets measured, and frame rate with the CPU throttled ×4.
import { expect, test, type Page } from '@playwright/test';
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { force, joinMock, LANDSCAPE, PORTRAIT, shot, shotBoth } from './helpers';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'orchestration', 'evidence', 'T030');
mkdirSync(OUT, { recursive: true });

const prefs = (p: Record<string, unknown>) => (page: Page) => page.addInitScript((v) => localStorage.setItem('mf.prefs', JSON.stringify(v)), p);

/** No horizontal overflow, and nothing wider than the viewport. */
async function noOverflow(page: Page) {
  const over = await page.evaluate(() => {
    const doc = document.documentElement.scrollWidth - window.innerWidth;
    const wide = [...document.querySelectorAll('.app *')].filter((el) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && (r.right > window.innerWidth + 1 || r.left < -1) && !el.closest('.pilot__mid, .scrim, .toasts');
    });
    return { doc, wide: wide.slice(0, 5).map((e) => `${e.tagName}.${(e as HTMLElement).className}`) };
  });
  expect(over.doc).toBeLessThanOrEqual(0);
  expect(over.wide).toEqual([]);
}

/** Smallest side of every visible interactive element inside `root`, by test id (or class). */
async function targets(page: Page, root: string) {
  return page.evaluate((sel) => {
    const rootEl = document.querySelector(sel)!;
    const out: Array<{ id: string; w: number; h: number }> = [];
    for (const el of rootEl.querySelectorAll<HTMLElement>('button, [role="slider"], [role="switch"], [role="button"], input, a[href]')) {
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden') continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      out.push({ id: el.getAttribute('data-testid') ?? `${el.tagName}.${el.className}`, w: Math.round(r.width * 10) / 10, h: Math.round(r.height * 10) / 10 });
    }
    return out;
  }, root);
}

test.describe('accessibility of the new screens', () => {
  test('touch targets on the pilot, co-pilot, spectator and profile screens', async ({ page }) => {
    const lines: string[] = [];
    const check = async (name: string, root: string, big: string[] = []) => {
      for (const o of [PORTRAIT, LANDSCAPE]) {
        await page.setViewportSize(o);
        await page.waitForTimeout(300);
        for (const t of await targets(page, root)) {
          const min = Math.min(t.w, t.h);
          const need = big.includes(t.id) ? 64 : 48;
          lines.push(`${name} ${o.width}x${o.height} ${t.id} ${t.w}x${t.h} (need ${need})${min + 0.5 >= need ? '' : ' FAIL'}`);
          expect(min + 0.5, `${name} ${o.width}x${o.height}: ${t.id} is ${t.w}x${t.h}`).toBeGreaterThanOrEqual(need);
        }
      }
      await page.setViewportSize(PORTRAIT);
    };
    await joinMock(page, { seat: 'pilot' });
    await page.getByTestId('pilot-abort-cover').click();
    await check('pilot', '[data-testid="pilot-screen"]', ['pilot-stage', 'pilot-abort', 'pilot-abort-cover']);
    await page.getByTestId('pilot-abort-close').click();
    await page.reload();
    await joinMock(page, { seat: 'copilot' });
    await check('copilot', '[data-testid="copilot-screen"]', ['copilot-stage']);
    await page.reload();
    await joinMock(page, { watch: true, speed: 2, brief: 120 });
    await check('watch', '[data-testid="watch-screen"]');
    await page.reload();
    await joinMock(page, { lobby: 120, speed: 2 });
    await expect(page.locator('.crew > li')).toHaveCount(5, { timeout: 20_000 });
    await page.getByTestId('profile-open').click();
    await check('profile', '[data-testid="profile-sheet"]');
    writeFileSync(join(OUT, 'touch-targets.txt'), `${lines.join('\n')}\n`);
  });

  for (const [name, mode] of [['text 200 percent, right-to-left', { prefs: { textScalePct: 200 }, query: 'dir=rtl' }], ['high contrast', { prefs: { highContrast: true }, query: '' }]] as const) {
    test(`pilot, co-pilot and spectator: ${name}`, async ({ page }) => {
      const slug = mode.prefs.textScalePct ? '200-rtl' : 'high-contrast';
      for (const [kind, join, shotName] of [
        ['pilot', { seat: 'pilot' as const }, `10-pilot-${slug}`],
        ['copilot', { seat: 'copilot' as const }, `10-copilot-${slug}`],
        ['watch', { watch: true, speed: 2, brief: 120 }, `10-watch-${slug}`],
      ] as const) {
        await prefs(mode.prefs)(page);
        await joinMock(page, { ...join, query: mode.query });
        if (mode.query) await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
        if (mode.prefs.highContrast) await expect(page.locator('html')).toHaveAttribute('data-contrast', 'high');
        if (kind === 'pilot') {
          await force(page, { canStage: false });
          // The throttle stays on the chosen side (left by default) even in right-to-left layout.
          const thr = (await page.getByTestId('pilot-throttle').boundingBox())!;
          const stick = (await page.getByTestId('pilot-stick').boundingBox())!;
          expect(thr.x).toBeLessThan(stick.x);
        }
        await page.waitForTimeout(500);
        await shotBoth(page, shotName);
        if (mode.prefs.textScalePct) {
          for (const o of [PORTRAIT, LANDSCAPE]) {
            await page.setViewportSize(o);
            await page.waitForTimeout(300);
            await noOverflow(page);
          }
          await page.setViewportSize(PORTRAIT);
        }
        await page.reload();
      }
    });
  }

  test('throttle side setting is kept and mirrors correctly in right-to-left', async ({ page }) => {
    await prefs({ textScalePct: 100 })(page);
    await joinMock(page, { seat: 'pilot', query: 'dir=rtl' });
    const left = async () => (await page.getByTestId('pilot-throttle').boundingBox())!.x < (await page.getByTestId('pilot-stick').boundingBox())!.x;
    expect(await left()).toBe(true);
    await page.getByTestId('pilot-side').click();
    expect(await left()).toBe(false);
    expect(await page.evaluate(() => localStorage.getItem('mf.pilot.throttleSide'))).toBe('right');
    await page.reload();
    await joinMock(page, { seat: 'pilot', query: 'dir=rtl' });
    expect(await left()).toBe(false);
  });

  test('reduced motion: no animation on the new screens', async ({ page }) => {
    await prefs({ reducedMotion: true })(page);
    await joinMock(page, { seat: 'pilot' });
    const animated = async () =>
      page.evaluate(() =>
        [...document.querySelectorAll('.pilot *, .pilot')].filter((el) => {
          const cs = getComputedStyle(el);
          return cs.animationName !== 'none' && cs.animationDuration !== '0s';
        }).map((e) => (e as HTMLElement).className),
      );
    // The screen-in animation of the shell is shared; the new controls add none of their own.
    expect((await animated()).filter((c) => !/\bscreen\b/.test(c))).toEqual([]);
    await page.getByTestId('pilot-abort-cover').click();
    expect((await animated()).filter((c) => !/\bscreen\b/.test(c))).toEqual([]);
  });
});

test.describe('performance with the CPU throttled ×4', () => {
  test('continuous throttle and pitch input keeps 30 fps or better', async ({ page }) => {
    test.setTimeout(3 * 60_000);
    await joinMock(page, { seat: 'pilot' });
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    await page.evaluate(() => {
      const w = window as unknown as { __frames: number[] };
      w.__frames = [];
      let last = performance.now();
      const loop = (t: number) => {
        w.__frames.push(t - last);
        last = t;
        requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
    });
    const thr = (await page.getByTestId('pilot-throttle').boundingBox())!;
    const stick = (await page.getByTestId('pilot-stick').boundingBox())!;
    const t0 = Date.now();
    // Two fingers at once are not possible with the mouse: alternate the throttle and the stick quickly.
    let n = 0;
    while (Date.now() - t0 < 5000) {
      const p = (Date.now() - t0) / 1000;
      await page.mouse.move(thr.x + thr.width / 2, thr.y + thr.height / 2);
      await page.mouse.down();
      await page.mouse.move(thr.x + thr.width / 2, thr.y + thr.height * (0.5 + 0.4 * Math.sin(p * 5)), { steps: 3 });
      await page.mouse.up();
      await page.mouse.move(stick.x + stick.width / 2, stick.y + stick.height / 2);
      await page.mouse.down();
      await page.mouse.move(stick.x + stick.width / 2, stick.y + stick.height * (0.5 + 0.4 * Math.cos(p * 7)), { steps: 3 });
      await page.mouse.up();
      n++;
    }
    const frames = await page.evaluate(() => (window as unknown as { __frames: number[] }).__frames.slice(2));
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    const total = frames.reduce((a, b) => a + b, 0);
    const fps = (frames.length / total) * 1000;
    const sorted = [...frames].sort((a, b) => a - b);
    const p95 = sorted[Math.floor(sorted.length * 0.95)]!;
    const worst = sorted[sorted.length - 1]!;
    const note = `CPU throttling x4, Chromium headless, 390x844, ${n} drag cycles over ${Math.round(total / 100) / 10} s on the pilot screen (throttle and pitch)\nframes: ${frames.length}, mean fps: ${fps.toFixed(1)}, p95 frame time: ${p95.toFixed(1)} ms, worst frame: ${worst.toFixed(1)} ms\n`;
    appendFileSync(join(OUT, 'fps-note.txt'), `${note}\n`);
    console.log(note);
    expect(fps).toBeGreaterThanOrEqual(30);
    await shot(page, '11-pilot-fps-run');
  });
});
