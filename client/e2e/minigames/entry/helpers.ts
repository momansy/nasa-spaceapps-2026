import type { Page } from '@playwright/test';
import { mkdirSync, copyFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer, type ViteDevServer } from 'vite';

const here = dirname(fileURLToPath(import.meta.url));
export const CLIENT_ROOT = join(here, '..', '..', '..');
export const SHOTS = join(here, '..', '..', 'screenshots', 'minigames');
export const EVIDENCE = join(CLIENT_ROOT, '..', 'orchestration', 'evidence', 'T022');
export const PORT = 5184;
export const BASE = `http://127.0.0.1:${PORT}`;
mkdirSync(SHOTS, { recursive: true });
mkdirSync(EVIDENCE, { recursive: true });

export async function startVite(): Promise<ViteDevServer> {
  const server = await createServer({
    root: CLIENT_ROOT,
    configFile: join(CLIENT_ROOT, 'vite.config.ts'),
    server: { host: '127.0.0.1', port: PORT, strictPort: true },
    logLevel: 'error',
  });
  await server.listen();
  return server;
}

export interface LabOpts {
  mg: string;
  mode?: string;
  assist?: string;
  seed?: number;
  dur?: number;
  p?: Record<string, unknown>;
  demo?: boolean;
  rm?: boolean;
  rtl?: boolean;
  scale?: number;
  coop?: boolean;
}

export function labUrl(o: LabOpts): string {
  const q = new URLSearchParams();
  q.set('mg', o.mg);
  if (o.mode) q.set('mode', o.mode);
  if (o.assist) q.set('assist', o.assist);
  if (o.seed !== undefined) q.set('seed', String(o.seed));
  if (o.dur) q.set('dur', String(o.dur));
  if (o.p) q.set('p', JSON.stringify(o.p));
  if (o.demo) q.set('demo', '1');
  if (o.rm) q.set('rm', '1');
  if (o.rtl) q.set('dir', 'rtl');
  if (o.scale) q.set('scale', String(o.scale));
  if (o.coop) q.set('coop', '1');
  return `${BASE}/e2e/minigames/entry/lab.html?${q.toString()}`;
}

/** Collects console errors and `[i18n] missing string` warnings; call `assertClean()` at the end. */
export function watchConsole(page: Page) {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
    else if (m.type() === 'warning' && m.text().includes('[i18n] missing string')) errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(String(e)));
  return {
    errors,
    assertClean() {
      if (errors.length) throw new Error(`console problems:\n${errors.join('\n')}`);
    },
  };
}

/** Opens the lab with the fake clock installed so a run can be stepped deterministically. */
export async function openLab(page: Page, o: LabOpts, opts: { clock?: boolean } = {}) {
  if (opts.clock !== false) await page.clock.install({ time: 0 });
  await page.goto(labUrl(o));
  await page.waitForFunction(() => document.documentElement.dataset.labReady === '1');
}

export async function labResult(page: Page) {
  return page.evaluate(() => window.__lab.result);
}

export async function shot(page: Page, name: string, evidence = true) {
  const file = join(SHOTS, `${name}.png`);
  await page.locator('#frame').screenshot({ path: file });
  if (evidence) copyFileSync(file, join(EVIDENCE, `${name}.png`));
}

/** Median frames per second over `ms` of real time (the real clock, not the fake one). */
export async function medianFps(page: Page, ms = 5000): Promise<number> {
  const samples: number[] = [];
  let last = await page.evaluate(() => window.__lab.frames);
  for (let i = 0; i < ms / 500; i++) {
    await page.waitForTimeout(500);
    const now = await page.evaluate(() => window.__lab.frames);
    samples.push((now - last) * 2);
    last = now;
  }
  samples.sort((a, b) => a - b);
  return samples[Math.floor(samples.length / 2)]!;
}

export async function throttle(page: Page, rate = 4) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate });
  return cdp;
}
