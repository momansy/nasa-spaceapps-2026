// Profile edit in the lobby (`?mock=1&lobby=60` keeps the lobby open): nickname and avatar are
// sent as `player.profile`, the server's errors are shown, the device profile follows.
import { expect, test } from '@playwright/test';
import { collectErrors, joinMock, noErrors, received, shotBoth } from './helpers';

test('profile sheet: change call sign and astronaut, see the server errors', async ({ page }) => {
  const errors = collectErrors(page);
  await joinMock(page, { lobby: 120, speed: 2 });
  await expect(page.getByTestId('screen-lobby')).toBeVisible();
  await expect(page.locator('.crew > li')).toHaveCount(5, { timeout: 20_000 });
  await page.getByTestId('profile-open').click();
  await expect(page.getByTestId('profile-sheet')).toBeVisible();
  await expect(page.getByTestId('profile-nick')).toHaveValue('Ada');
  await expect(page.getByTestId('profile-save')).toBeDisabled(); // nothing changed yet

  // NICK_TAKEN with the server's suggestion.
  await page.getByTestId('profile-nick').fill('Vega');
  await page.getByTestId('profile-save').click();
  await expect(page.getByTestId('profile-error')).toHaveAttribute('data-code', 'NICK_TAKEN');
  await expect(page.getByTestId('profile-error')).toContainText('Someone already uses that call sign.');
  await expect(page.getByTestId('profile-use-suggestion')).toContainText('Use Vega-2');
  await page.waitForTimeout(300);
  await shotBoth(page, '09-profile-sheet-error');

  // NICK_REJECTED.
  await page.getByTestId('profile-nick').fill('Badword');
  await page.getByTestId('profile-save').click();
  await expect(page.getByTestId('profile-error')).toHaveAttribute('data-code', 'NICK_REJECTED');
  await expect(page.getByTestId('profile-error')).toContainText('not allowed');
  // A name the phone itself finds invalid is not even sent.
  const before = (await received(page, 'player.profile')).length;
  await page.getByTestId('profile-nick').fill('Nova_');
  await page.getByTestId('profile-save').click();
  await expect(page.getByTestId('profile-error')).toHaveAttribute('data-code', 'INVALID');
  expect((await received(page, 'player.profile')).length).toBe(before);

  // WRONG_PHASE (the host moved on while the sheet was open).
  await page.evaluate(() => ((window as unknown as { __mf: { room: { profileFault: string | null } } }).__mf.room.profileFault = 'WRONG_PHASE'));
  await page.getByTestId('profile-nick').fill('Nova Prime');
  await page.getByTestId('profile-save').click();
  await expect(page.getByTestId('profile-error')).toHaveAttribute('data-code', 'WRONG_PHASE');
  await expect(page.getByTestId('profile-error')).toContainText('only change in the lobby');
  await page.evaluate(() => ((window as unknown as { __mf: { room: { profileFault: string | null } } }).__mf.room.profileFault = null));

  // Success: the suggestion path, a new suit and patch; the crew list and the saved profile follow.
  await page.getByTestId('profile-nick').fill('Vega');
  await page.getByTestId('profile-save').click();
  await page.getByTestId('profile-use-suggestion').click();
  await page.getByTestId('profile-suit_teal').click();
  await page.getByTestId('profile-patch_comet').click();
  await page.getByTestId('profile-save').click();
  await expect(page.getByTestId('profile-save')).toContainText('Saved');
  await expect(page.getByTestId('profile-sheet')).toHaveCount(0, { timeout: 5000 });
  await expect(page.locator('.crew__row--me .crew__nick')).toHaveText('Vega-2');
  const frames = (await received(page, 'player.profile')).map((r) => r.d);
  expect(frames.at(-1)).toEqual({ nickname: 'Vega-2', avatar: { suitId: 'suit_teal', patchId: 'patch_comet' } });
  const savedProfile = await page.evaluate(() => JSON.parse(localStorage.getItem('mf.profile') ?? 'null'));
  expect(savedProfile).toEqual({ nickname: 'Vega-2', avatar: { suitId: 'suit_teal', patchId: 'patch_comet' } });
  await shotBoth(page, '09-profile-lobby-updated');
  await noErrors(page, errors);
});
