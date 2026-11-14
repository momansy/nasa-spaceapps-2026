import { test, expect } from '@playwright/test';
import { createServer, type ViteDevServer } from 'vite';
import { resolve } from 'node:path';
import { mkdir, copyFile, appendFile } from 'node:fs/promises';

let server: ViteDevServer;
const evidence = resolve(process.cwd(), '../orchestration/evidence/T019');
test.beforeAll(async () => {
  await mkdir(evidence, { recursive: true });
  server = await createServer({ root: process.cwd(), configFile: resolve('vite.config.ts'), configLoader: process.env.T019_CONFIG_RUNNER ? 'runner' : 'bundle', server: { host: '127.0.0.1', port: 5181, strictPort: true } });
  await server.listen();
});
test.afterAll(async () => { await server?.close(); });
test.beforeEach(async ({ page }) => {
  page.on('console', msg => { if (msg.type() === 'error' || msg.text().includes('[i18n] missing string')) throw new Error(msg.text()); });
  page.on('pageerror', error => { throw error; });
});
const url = (id: string, extra = '') => `http://127.0.0.1:5181/e2e/minigames/build/lab.html?mg=${id}${extra}`;
test('lab smoke with reference MG-08', async ({ page }) => {
  await page.clock.install(); await page.goto(url('MG-08')); await page.waitForFunction(() => window.__lab?.ready);
  await page.clock.runFor(1200); await page.screenshot({ path: resolve(evidence, 'lab-smoke.png') });
  expect(await page.evaluate(() => window.__lab.frames)).toBeGreaterThan(0);
});

// Each completed step adds its id here, keeping earlier increments independently runnable.
const delivered: string[] = [];
for (const id of delivered) {
  test(`${id} screenshots and lifecycle`, async ({ page }) => {
    await page.clock.install();
    for (const variant of ['demo', 'play', 'onebutton']) {
      await page.goto(url(id, variant === 'demo' ? '&demo=1' : variant === 'onebutton' ? '&mode=ONE_BUTTON' : ''));
      await page.waitForFunction(() => window.__lab?.ready); await page.clock.runFor(1100);
      if (variant === 'play') { await page.locator('#play').press('Space'); await page.clock.runFor(500); }
      const shot = resolve(`e2e/screenshots/minigames/${id}-${variant}.png`);
      await mkdir(resolve('e2e/screenshots/minigames'), { recursive: true });
      await page.screenshot({ path: shot, fullPage: true }); await copyFile(shot, resolve(evidence, `${id}-${variant}.png`));
      if (variant === 'demo') expect(await page.evaluate(() => window.__lab.haptics.length)).toBe(0);
      else { await page.clock.runFor(35000); expect(await page.evaluate(() => window.__lab.results)).toBe(1); }
    }
    await page.goto(url(id)); await page.waitForFunction(() => window.__lab?.ready);
    await page.evaluate(() => window.__lab.instance!.destroy()); await page.clock.runFor(35000);
    expect(await page.evaluate(() => window.__lab.results)).toBe(0);
  });
  test(`${id} CPU x4 median fps`, async ({ page }) => {
    const cdp = await page.context().newCDPSession(page); await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    await page.goto(url(id)); await page.waitForFunction(() => window.__lab?.ready);
    const samples: number[] = [];
    let previous = await page.evaluate(() => ({ frames: window.__lab.frames, timeMs: performance.now() }));
    for (let i = 0; i < 5; i++) {
      await page.waitForTimeout(1000);
      const next = await page.evaluate(() => ({ frames: window.__lab.frames, timeMs: performance.now() }));
      samples.push((next.frames - previous.frames) * 1000 / (next.timeMs - previous.timeMs)); previous = next;
    }
    samples.sort((a,b) => a-b); await appendFile(resolve(evidence, 'fps.md'), `| ${id} | ${samples[2]} fps | Chromium, CPU x4, 5 s |\n`);
    expect(samples[2]).toBeGreaterThanOrEqual(30); await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  });
}
