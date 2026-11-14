// Shared helpers of the T030 specs: join the mock session in a seat, read what the mock host
// received from the phone, save screenshots under e2e/screenshots/pilot/.
import { expect, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const SHOTS = join(dirname(fileURLToPath(import.meta.url)), '..', 'screenshots', 'pilot');
mkdirSync(SHOTS, { recursive: true });

export const PORTRAIT = { width: 390, height: 844 };
export const LANDSCAPE = { width: 844, height: 390 };

export async function shot(page: Page, name: string) {
  await page.screenshot({ path: join(SHOTS, `${name}.png`) });
}

export interface Received {
  t: string;
  d: Record<string, unknown>;
  atMs: number;
}

type Mf = { room: { received: Received[]; seat: { state: Record<string, unknown> & { force: Record<string, unknown> }; log: unknown[] } | null } };

/** Everything the mock host received from the phone so far. */
export async function received(page: Page, type?: string): Promise<Received[]> {
  const all = await page.evaluate(() => (window as unknown as { __mf: Mf }).__mf.room.received.map((r) => ({ t: r.t, d: r.d as Record<string, unknown>, atMs: r.atMs })));
  return type ? all.filter((r) => r.t === type) : all;
}

export async function seatState(page: Page): Promise<Record<string, unknown>> {
  return page.evaluate(() => ({ ...(window as unknown as { __mf: Mf }).__mf.room.seat!.state }));
}

/** Calls a method of the mock room from the test (pause, reassign, assist level…). */
export async function room<T = unknown>(page: Page, call: string, ...args: unknown[]): Promise<T> {
  return page.evaluate(([name, a]) => ((window as unknown as { __mf: { room: Record<string, (...x: unknown[]) => unknown> } }).__mf.room[name as string] as (...x: unknown[]) => unknown)(...(a as unknown[])) as T, [call, args] as const);
}

/** Forces what the host says in `pilot.hud` (canStage, deployTarget, cue, prompt). */
export async function force(page: Page, patch: Record<string, unknown>) {
  await page.evaluate((p) => Object.assign((window as unknown as { __mf: Mf }).__mf.room.seat!.state.force, p), patch);
}

export interface Join {
  seat?: 'pilot' | 'copilot' | 'booster';
  watch?: boolean;
  speed?: number;
  lobby?: number;
  /** Keep the briefing open this many (game) seconds. */
  brief?: number;
  query?: string;
  /** Wait for this test id after joining (default: the seat's screen). */
  screen?: string;
}

/** Opens the mock session, joins as "Ada", acknowledges the role card and waits for the screen. */
export async function joinMock(page: Page, o: Join) {
  const q = new URLSearchParams({ mock: '1', speed: String(o.speed ?? 4), room: 'KQXM' });
  if (o.seat) q.set('seat', o.seat);
  if (o.watch) q.set('watch', '1');
  if (o.lobby) q.set('lobby', String(o.lobby));
  if (o.brief) q.set('brief', String(o.brief));
  await page.goto(`/?${q.toString()}${o.query ? `&${o.query}` : ''}`);
  await expect(page.getByTestId('screen-join')).toBeVisible();
  if (!o.watch) await page.getByTestId('join-nick').fill('Ada');
  await page.getByTestId('join-submit').click();
  if (o.lobby) return;
  if (!o.watch) {
    await expect(page.getByTestId('screen-role')).toBeVisible({ timeout: 30_000 });
    await page.getByTestId('role-ready').click();
  }
  const screen = o.screen ?? (o.seat === 'copilot' ? 'copilot-screen' : o.seat ? 'pilot-screen' : 'watch-screen');
  await expect(page.getByTestId(screen)).toBeVisible({ timeout: 60_000 });
  // Notices from the host (CAPCOM) fade out by themselves; screenshots wait for them.
  await page.locator('.toast').waitFor({ state: 'detached', timeout: 12_000 }).catch(() => undefined);
}

/** Pointer-driven hold with the mouse: down, wait, up. */
export async function hold(page: Page, testId: string, ms: number) {
  await page.getByTestId(testId).scrollIntoViewIfNeeded();
  const box = (await page.getByTestId(testId).boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(ms);
  await page.mouse.up();
}

export async function noErrors(page: Page, errors: string[]) {
  const missing = await page.evaluate(() => (window as unknown as { __mf: { missing: () => string[] } }).__mf.missing());
  expect(missing).toEqual([]);
  expect(errors.filter((e) => !/models\/.+\.glb/.test(e))).toEqual([]);
}

export function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(String(e)));
  return errors;
}

/** Screenshot in portrait (390 × 844) and landscape (844 × 390); leaves the page in portrait. */
export async function shotBoth(page: Page, name: string) {
  await page.setViewportSize(PORTRAIT);
  await page.waitForTimeout(350);
  await shot(page, `${name}-portrait`);
  await page.setViewportSize(LANDSCAPE);
  await page.waitForTimeout(450);
  await shot(page, `${name}-landscape`);
  await page.setViewportSize(PORTRAIT);
  await page.waitForTimeout(250);
}

/** A two-finger gesture on an element, as synthetic pointer events (pointer ids 11 and 12). */
export async function twoFingers(page: Page, testId: string, o: { twistDeg?: number; slidePx?: number; release?: boolean }) {
  await page.getByTestId(testId).scrollIntoViewIfNeeded();
  await page.evaluate(
    async ([id, twist, slide, release]) => {
      const el = document.querySelector(`[data-testid="${id}"]`) as HTMLElement;
      const r = el.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const fire = (type: string, pointerId: number, x: number, y: number) =>
        el.dispatchEvent(new PointerEvent(type, { pointerId, pointerType: 'touch', clientX: x, clientY: y, bubbles: true, cancelable: true, isPrimary: pointerId === 11 }));
      const half = 30;
      fire('pointerdown', 11, cx - half, cy);
      fire('pointerdown', 12, cx + half, cy);
      const steps = 6;
      for (let i = 1; i <= steps; i++) {
        const a = (((twist as number) * i) / steps) * (Math.PI / 180);
        const dx = ((slide as number) * i) / steps;
        fire('pointermove', 11, cx + dx - Math.cos(a) * half, cy - Math.sin(a) * half);
        fire('pointermove', 12, cx + dx + Math.cos(a) * half, cy + Math.sin(a) * half);
        await new Promise((res) => setTimeout(res, 40));
      }
      await new Promise((res) => setTimeout(res, 250));
      if (release) {
        fire('pointerup', 11, cx, cy);
        fire('pointerup', 12, cx, cy);
      }
    },
    [testId, o.twistDeg ?? 0, o.slidePx ?? 0, o.release ?? true] as const,
  );
}
