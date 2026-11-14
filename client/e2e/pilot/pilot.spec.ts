// Pilot seat on the phone (`?mock=1&seat=pilot`): throttle, STAGE hold, guarded ABORT and the
// rest of the 9.2 touch column reach the mock host as `pilot.input` / `pilot.action` frames, and
// the screen shows what `pilot.hud` says.
import { expect, test } from '@playwright/test';
import { collectErrors, force, hold, joinMock, LANDSCAPE, noErrors, PORTRAIT, received, seatState, shot } from './helpers';

test.describe('pilot seat', () => {
  test('throttle, STAGE hold and guarded ABORT reach the host and come back in pilot.hud', async ({ page }) => {
    const errors = collectErrors(page);
    await joinMock(page, { seat: 'pilot' });
    await expect(page.getByTestId('pilot-title')).toHaveText('Pilot');
    await expect(page.getByTestId('pilot-screen')).toHaveAttribute('data-craft', 'VEHICLE');

    // Throttle: drag to 80 %. The host's read-back follows with its own delay.
    const track = (await page.getByTestId('pilot-throttle').boundingBox())!;
    await page.mouse.move(track.x + track.width / 2, track.y + track.height * 0.5);
    await page.mouse.down();
    await page.mouse.move(track.x + track.width / 2, track.y + track.height * 0.2, { steps: 6 });
    await page.mouse.up();
    await expect(page.getByTestId('pilot-throttle-cmd')).toHaveText(/^80\s%$/);
    await expect.poll(async () => ((await seatState(page)).throttleCmd as number), { timeout: 5000 }).toBeCloseTo(0.8, 1);
    await expect(page.getByTestId('pilot-throttle-host')).toHaveText(/^(7[89]|80)\s%$/, { timeout: 8000 });
    const inputs = await received(page, 'pilot.input');
    expect(inputs.some((r) => Math.abs((r.d.throttle as number) - 0.8) < 0.02)).toBe(true);

    // The HUD strip: three numbers with units.
    await expect(page.getByTestId('pilot-hud-alt')).toContainText('km');
    await expect(page.getByTestId('pilot-hud-speed')).toContainText('m/s');
    await expect(page.getByTestId('pilot-hud-q')).toContainText('kPa');
    await expect(page.getByTestId('pilot-met')).toContainText('T+');

    // STAGE: disabled with a reason until the host says canStage, then a 0.3 s hold sends it once.
    await force(page, { canStage: false });
    await expect(page.getByTestId('pilot-stage')).toHaveAttribute('aria-disabled', 'true');
    await expect(page.getByText('Not ready: staging would do nothing now.')).toBeVisible();
    await hold(page, 'pilot-stage', 500);
    expect(await received(page, 'pilot.action')).toHaveLength(0);
    await force(page, { canStage: true });
    await expect(page.getByTestId('pilot-stage')).toHaveAttribute('data-state', 'ready', { timeout: 3000 });
    await hold(page, 'pilot-stage', 100); // a tap is not a stage
    expect(await received(page, 'pilot.action')).toHaveLength(0);
    // Sliding off cancels.
    const sb = (await page.getByTestId('pilot-stage').boundingBox())!;
    await page.mouse.move(sb.x + sb.width / 2, sb.y + sb.height / 2);
    await page.mouse.down();
    await page.mouse.move(sb.x + sb.width / 2, sb.y - 120, { steps: 4 });
    await page.waitForTimeout(450);
    await page.mouse.up();
    expect(await received(page, 'pilot.action')).toHaveLength(0);
    await hold(page, 'pilot-stage', 450);
    await expect.poll(async () => (await received(page, 'pilot.action')).length).toBe(1);
    const stage = (await received(page, 'pilot.action'))[0]!;
    expect(stage.d).toMatchObject({ craft: 'VEHICLE', action: 'STAGE' });
    expect(stage.d.n as number).toBeGreaterThan(1_000_000);
    // The host reflects it: staging is used up, the button is disabled again.
    await force(page, { canStage: undefined });
    await expect(page.getByTestId('pilot-stage')).toHaveAttribute('aria-disabled', 'true', { timeout: 3000 });

    // ABORT: a cover must be flipped, then a 1.5 s hold.
    await expect(page.getByTestId('pilot-abort')).toHaveCount(0);
    await shot(page, '01-pilot-portrait-engineer');
    await page.getByTestId('pilot-abort-cover').click();
    await expect(page.getByTestId('pilot-abort')).toBeVisible();
    await hold(page, 'pilot-abort', 900); // too short
    expect((await received(page, 'pilot.action')).filter((r) => r.d.action === 'ABORT')).toHaveLength(0);
    // Hold in progress screenshot.
    const ab = (await page.getByTestId('pilot-abort').boundingBox())!;
    await page.mouse.move(ab.x + ab.width / 2, ab.y + ab.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(800);
    await shot(page, '03-abort-hold-in-progress');
    await page.waitForTimeout(1000);
    await page.mouse.up();
    await expect.poll(async () => (await received(page, 'pilot.action')).filter((r) => r.d.action === 'ABORT').length).toBe(1);
    await expect.poll(async () => (await seatState(page)).abortRequested).toBe(true);
    // The cover closes again after the abort.
    await expect(page.getByTestId('pilot-abort')).toHaveCount(0);
    await expect(page.getByTestId('pilot-abort-cover')).toHaveAttribute('aria-expanded', 'false');

    // Cutoff.
    await page.getByTestId('pilot-cutoff').click();
    await expect.poll(async () => (await received(page, 'pilot.action')).some((r) => r.d.action === 'CUTOFF')).toBe(true);
    await expect.poll(async () => ((await seatState(page)).throttleCmd as number)).toBe(0);

    await noErrors(page, errors);
  });

  test('screenshots in portrait and landscape, abort cover open', async ({ page }) => {
    await joinMock(page, { seat: 'pilot' });
    await page.getByTestId('pilot-abort-cover').click();
    await expect(page.getByTestId('pilot-abort')).toBeVisible();
    await page.waitForTimeout(300);
    await shot(page, '02-abort-cover-open-portrait');
    await page.getByTestId('pilot-abort-close').click();
    await page.setViewportSize(LANDSCAPE);
    await page.waitForTimeout(400);
    await shot(page, '01-pilot-landscape-engineer');
    await page.setViewportSize(PORTRAIT);
  });
});
