// Spectator view (`?mock=1&watch=1`): phase strip, what is happening now, the reaction pad
// (at most one per second), the audience reaction display and the "Audience says" bar.
import { expect, test } from '@playwright/test';
import { collectErrors, joinMock, noErrors, received, shotBoth } from './helpers';

test.describe('spectator view', () => {
  test('phase strip, reaction pad at 1 per second, audience bursts and counters', async ({ page }) => {
    const errors = collectErrors(page);
    await joinMock(page, { watch: true, speed: 2, brief: 120 });
    await expect(page.locator('[data-testid="watch-strip"] [data-state="now"]')).toHaveAttribute('data-phase', 'BRIEFING');
    await expect(page.getByTestId('watch-headline')).not.toBeEmpty();
    await expect(page.getByTestId('watch-audience-size')).toContainText('in the audience');
    await expect(page.locator('.spectatorbar')).toBeVisible(); // the shell's audience note stays

    // Reactions: one per second at most, five buttons.
    for (const id of ['ROCKET', 'THUMBS_UP', 'GRIMACE', 'FIRE', 'THINKING']) await expect(page.getByTestId(`watch-react-${id}`)).toBeVisible();
    // Three taps inside one second: only the first is sent.
    await page.evaluate(() => {
      const tap = (id: string) => (document.querySelector(`[data-testid="watch-react-${id}"]`) as HTMLElement).click();
      tap('ROCKET');
      tap('FIRE');
      tap('FIRE');
    });
    await expect(page.getByTestId('watch-pad')).toContainText('One reaction per second.');
    await page.waitForTimeout(1150);
    await page.getByTestId('watch-react-FIRE').click();
    await page.waitForTimeout(300);
    const sent = await received(page, 'react.send');
    expect(sent.map((r) => r.d.emoji)).toEqual(['ROCKET', 'FIRE']);
    expect(sent[1]!.atMs - sent[0]!.atMs).toBeGreaterThanOrEqual(1000);
    await expect(page.locator('.toast--bad')).toHaveCount(0); // the mock would answer RATE_LIMITED

    // Audience: bursts rise, counters count up.
    await expect(page.getByTestId('audience-burst').first()).toBeVisible({ timeout: 15_000 });
    await page.waitForTimeout(400);
    await shotBoth(page, '07-watch-burst');
    const counts = await Promise.all(['ROCKET', 'THUMBS_UP', 'GRIMACE', 'FIRE', 'THINKING'].map(async (id) => Number(await page.getByTestId(`audience-count-${id}`).getAttribute('data-value'))));
    expect(counts.reduce((a, b) => a + b, 0)).toBeGreaterThan(0);
    // Never more than the cap on screen.
    expect(await page.getByTestId('audience-burst').count()).toBeLessThanOrEqual(18);
    await noErrors(page, errors);
  });

  test('reduced motion: counters only, no bursts', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('mf.prefs', JSON.stringify({ reducedMotion: true })));
    await joinMock(page, { watch: true, speed: 2, brief: 120 });
    await expect(page.getByTestId('watch-screen')).toHaveAttribute('data-motion', 'reduced');
    await expect.poll(async () => page.getByTestId('audience-count-ROCKET').getAttribute('data-value'), { timeout: 15_000 }).not.toBe(null);
    await expect.poll(async () => {
      const v = await Promise.all(['ROCKET', 'THUMBS_UP', 'GRIMACE', 'FIRE', 'THINKING'].map(async (id) => Number(await page.getByTestId(`audience-count-${id}`).getAttribute('data-value'))));
      return v.reduce((a, b) => a + b, 0);
    }).toBeGreaterThan(0);
    await expect(page.getByTestId('audience-burst-layer')).toHaveCount(0);
    await expect(page.getByTestId('audience-burst')).toHaveCount(0);
  });

  test('pending spectator note for a late joiner', async ({ page }) => {
    await joinMock(page, { watch: true, speed: 2, brief: 120 });
    await expect(page.getByTestId('watch-pending')).toHaveCount(0);
    await page.evaluate(() => {
      const mf = (window as unknown as { __mf: { room: { pendingSpectator: boolean }; drop: () => void } }).__mf;
      mf.room.pendingSpectator = true;
      mf.drop();
    });
    await expect(page.getByTestId('watch-pending')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('watch-pending')).toContainText('You join the crew at the next vote round.');
  });

  test('"Audience says" bar during a vote, and the flight numbers after', async ({ page }) => {
    test.setTimeout(8 * 60_000);
    const errors = collectErrors(page);
    await joinMock(page, { watch: true, speed: 6 });
    // A vote round: the screen is the vote screen, with the audience bar once the vote stage opens.
    await expect(page.locator('[data-testid="screen-vote"][data-stage="VOTE"]')).toBeVisible({ timeout: 120_000 });
    await expect(page.getByTestId('audience-says')).toBeVisible();
    await expect(page.getByTestId('audience-says-total')).toContainText('votes');
    expect(await page.locator('[data-testid^="audience-seg-"]').count()).toBeGreaterThan(1);
    await page.waitForTimeout(500);
    await shotBoth(page, '08-audience-says');

    // After the votes the spectator is back on the watch screen; in flight it shows the numbers with units.
    await expect(page.locator('[data-testid="watch-screen"][data-phase="FLIGHT"]')).toBeVisible({ timeout: 240_000 });
    await expect(page.getByTestId('pilot-hud-alt')).toContainText('km');
    await expect(page.getByTestId('pilot-hud-speed')).toContainText('m/s');
    await expect(page.getByTestId('pilot-hud-q')).toContainText('kPa');
    await shotBoth(page, '07-watch-flight');
    await noErrors(page, errors);
  });
});
