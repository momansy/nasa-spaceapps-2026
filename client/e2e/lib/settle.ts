// Shared helper for the session specs (T038): wait until every entrance animation and
// transition on the page has finished before a screenshot, so none is captured mid-fade.
import type { Page } from '@playwright/test';

/**
 * Waits for the finite animations and transitions that end within `maxRemainingMs` (default
 * 1.2 s) to finish, then two animation frames. Infinite loops (glows, spinners) and long timers
 * (a 20 s countdown bar) are not waited for. Gives up after `capMs` (1.5 s; the mock session runs in real time, so a long wait would miss later stages) so a stuck animation can
 * never hang a run.
 */
export async function settle(page: Page, maxRemainingMs = 1200, capMs = 1500): Promise<void> {
  await page.evaluate(
    async ({ maxRemainingMs, capMs }) => {
      const pending = () =>
        document.getAnimations().filter((a) => {
          const t = a.effect?.getComputedTiming();
          if (!t || a.playState !== 'running') return false;
          // Entrance effects only: CSS animations, and transitions of opacity or transform. Ring and bar
          // transitions that restart every second are not entrances and would never settle.
          const prop = (a as unknown as { transitionProperty?: string }).transitionProperty;
          if (prop !== undefined && prop !== 'opacity' && prop !== 'transform') return false;
          if (t.iterations === Infinity || !Number.isFinite(Number(t.endTime))) return false;
          return Number(t.endTime) - Number(a.currentTime ?? 0) <= maxRemainingMs;
        });
      const start = performance.now();
      while (pending().length > 0 && performance.now() - start < capMs) {
        await Promise.race([Promise.allSettled(pending().map((a) => a.finished)), new Promise((r) => setTimeout(r, 250))]);
      }
      await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
    },
    { maxRemainingMs, capMs },
  );
}
