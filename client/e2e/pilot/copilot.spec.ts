// Co-pilot seat (`?mock=1&seat=copilot`): STAGE hold and each DEPLOY target send `copilot.action`.
import { expect, test } from '@playwright/test';
import { collectErrors, force, hold, joinMock, noErrors, received, room, shotBoth } from './helpers';

const sent = async (page: import('@playwright/test').Page) => (await received(page, 'copilot.action')).map((r) => r.d);

test('co-pilot: STAGE hold and every DEPLOY target', async ({ page }) => {
  const errors = collectErrors(page);
  await joinMock(page, { seat: 'copilot' });
  await expect(page.getByTestId('copilot-title')).toHaveText('Co-pilot');
  // The phone is not a pilot seat: no pilot controls, nothing sent as pilot.input.
  await expect(page.getByTestId('pilot-throttle')).toHaveCount(0);
  await page.waitForTimeout(800);
  expect(await received(page, 'pilot.input')).toEqual([]);

  // Read-back of the pilot's flying from pilot.hud, and the HUD strip with units.
  await expect(page.getByTestId('copilot-throttle')).toContainText('%');
  await expect(page.getByTestId('copilot-mode')).toHaveText('Off');
  await expect(page.getByTestId('pilot-hud-alt')).toContainText('km');
  await expect(page.getByTestId('pilot-hud-speed')).toContainText('m/s');
  await expect(page.getByTestId('pilot-hud-q')).toContainText('kPa');

  // STAGE: disabled with a reason until canStage; a tap does nothing, a 0.3 s hold sends once.
  await force(page, { canStage: false });
  await expect(page.getByTestId('copilot-stage')).toHaveAttribute('aria-disabled', 'true');
  await expect(page.getByText('Not ready: staging would do nothing now.')).toBeVisible();
  await force(page, { canStage: true });
  await expect(page.getByTestId('copilot-stage')).toHaveAttribute('data-state', 'ready', { timeout: 3000 });
  await hold(page, 'copilot-stage', 100);
  expect(await sent(page)).toEqual([]);
  await shotBoth(page, '05-copilot');
  await hold(page, 'copilot-stage', 450);
  await expect.poll(async () => (await sent(page)).length).toBe(1);
  expect((await sent(page))[0]).toMatchObject({ action: 'STAGE' });
  expect((await sent(page))[0]).not.toHaveProperty('deploy');

  // Every deploy target.
  await force(page, { deployTarget: 'FAIRING' });
  await expect(page.getByTestId('copilot-deploy-CONTEXT')).toContainText('Host offers: fairing');
  for (const target of ['CONTEXT', 'FAIRING', 'CHUTES', 'LEGS', 'ARRAYS'] as const) {
    await page.getByTestId(`copilot-deploy-${target}`).scrollIntoViewIfNeeded();
    await page.getByTestId(`copilot-deploy-${target}`).click();
    await expect.poll(async () => (await sent(page)).at(-1)).toMatchObject({ action: 'DEPLOY', deploy: target });
  }
  const frames = await sent(page);
  expect(frames.map((f) => f.n)).toEqual([0, 1, 2, 3, 4, 5].map((i) => (frames[0]!.n as number) + i));
  const log = (await page.evaluate(() => (window as unknown as { __mf: { room: { seat: { log: Array<{ action: string; deploy?: string }> } } } }).__mf.room.seat.log)).map((l) => l.deploy ?? l.action);
  expect(log).toEqual(['COPILOT_STAGE', 'CONTEXT', 'FAIRING', 'CHUTES', 'LEGS', 'ARRAYS']);

  // Paused: the buttons still show but nothing is sent.
  await room(page, 'setPaused', true);
  await expect(page.getByTestId('copilot-deploy-LEGS')).toBeDisabled();
  await room(page, 'setPaused', false);
  await expect(page.getByTestId('copilot-deploy-LEGS')).toBeEnabled();
  await noErrors(page, errors);
});
