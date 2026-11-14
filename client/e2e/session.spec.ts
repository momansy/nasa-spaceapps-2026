// Full scripted mock session at 390 × 844, saving a screenshot of every screen to
// e2e/screenshots/. Run with `npm run e2e` (builds, serves the build, runs Chromium).
import { expect, test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SHOTS = join(dirname(fileURLToPath(import.meta.url)), 'screenshots');
mkdirSync(SHOTS, { recursive: true });

async function shot(page: Page, name: string) {
  await page.screenshot({ path: join(SHOTS, `${name}.png`) });
}

async function stage(page: Page, s: string, timeout = 60_000) {
  await expect(page.locator(`[data-testid="screen-vote"][data-stage="${s}"]`)).toBeVisible({ timeout });
}

async function goToCard(page: Page, index: number) {
  await page.locator('.dot').nth(index).click();
  await page.waitForTimeout(450);
}

test('full mock session on a phone', async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text());
  });
  page.on('pageerror', (e) => consoleErrors.push(String(e)));

  await page.goto('/?mock=1&speed=2&room=KQXM');

  // 1. Join (room code from ?room=).
  await expect(page.getByTestId('screen-join')).toBeVisible();
  await shot(page, '01-join');
  await page.getByTestId('join-nick').fill('Ada');
  await page.getByTestId('join-submit').click();

  // 2. Lobby.
  await expect(page.getByTestId('screen-lobby')).toBeVisible();
  await expect(page.locator('.crew > li')).toHaveCount(5, { timeout: 15_000 });
  await shot(page, '02-lobby');

  // 3. Role card.
  await expect(page.getByTestId('screen-role')).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(500);
  await shot(page, '03-role-card');
  await page.getByTestId('role-ready').click();

  // 4. Briefing / our rocket.
  await expect(page.getByTestId('screen-build')).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(400);
  await shot(page, '04-briefing');

  // 5. Part vote 1: reveal → predict → inspect → vote (with a change) → result.
  await stage(page, 'REVEAL');
  await page.waitForTimeout(900);
  await shot(page, '05-vote-reveal');
  await stage(page, 'PREDICT');
  await page.waitForTimeout(300);
  await shot(page, '06-predict');
  await page.getByTestId('predict-2').click();
  await page.waitForTimeout(250);
  await shot(page, '07-predict-locked');
  await expect(page.getByTestId('predict-result')).toBeVisible({ timeout: 20_000 });
  await page.waitForTimeout(500);
  await shot(page, '08-predict-result');

  await stage(page, 'INSPECT');
  await page.waitForTimeout(700);
  await shot(page, '09-part-card');
  await page.locator('[data-testid="card-eng_kerolox_workhorse"] .stat__btn').nth(1).click();
  await page.waitForTimeout(250);
  await shot(page, '10-stat-explain');
  await goToCard(page, 2);
  await shot(page, '11-part-card-warnings');
  await page.locator('[data-testid="card-eng_hydrolox_high_efficiency"] [data-testid="viewer-expand"]').click();
  await expect(page.getByTestId('viewer-sheet')).toBeVisible();
  await page.waitForTimeout(600);
  await shot(page, '12-part-viewer');
  await page.keyboard.press('Escape');

  await stage(page, 'VOTE');
  await goToCard(page, 3);
  await page.getByTestId('cast').click();
  await page.waitForTimeout(600);
  await shot(page, '13-vote-cast');
  await goToCard(page, 0);
  await page.getByTestId('cast').click();
  await page.waitForTimeout(1600);
  await shot(page, '14-vote-changed-tally');

  await expect(page.getByTestId('stage-result')).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(900);
  await shot(page, '15-vote-result');

  // 6. Our rocket between decisions.
  await expect(page.getByTestId('screen-build')).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(500);
  await shot(page, '16-build');

  // 7. Quick vote: engine test.
  await expect(page.getByTestId('stage-quick')).toBeVisible({ timeout: 20_000 });
  await page.getByTestId('quick-TEST').click();
  await page.waitForTimeout(500);
  await shot(page, '17-quick-vote');

  // 8. Part vote 2: a bot vetoes, then I veto with confirmation, ping, vote.
  await stage(page, 'INSPECT');
  await expect(page.getByTestId('veto-flash')).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(250);
  await shot(page, '18-veto-flash');
  await stage(page, 'VOTE');
  await goToCard(page, 0);
  await page.getByTestId('veto').click();
  await page.waitForTimeout(250);
  await shot(page, '19-veto-confirm');
  await page.getByTestId('veto-confirm').click();
  await page.waitForTimeout(900);
  await shot(page, '20-vetoed-card');
  await goToCard(page, 2);
  await page.getByTestId('open-pings').click();
  await expect(page.getByTestId('ping-sheet')).toBeVisible();
  await page.waitForTimeout(300);
  await shot(page, '21-pings');
  await page.getByTestId('ping-LIKE_THIS').click();
  await expect(page.getByTestId('ping-sheet')).toBeHidden();
  await page.getByTestId('cast').click();
  await page.waitForTimeout(400);
  await shot(page, '22-vote-2-cast');
  await expect(page.getByTestId('stage-result')).toBeVisible({ timeout: 30_000 });

  // 9. Part vote 3: tie → trivia sudden-death → my pick.
  await stage(page, 'INSPECT', 30_000);
  await page.getByTestId('tag-RECOMMENDED').first().click();
  await page.waitForTimeout(400);
  await shot(page, '23-role-tag');
  await stage(page, 'VOTE');
  await goToCard(page, 0);
  await page.getByTestId('cast').click();
  await expect(page.getByTestId('stage-trivia')).toBeVisible({ timeout: 30_000 });
  await page.getByTestId('trivia-1').click();
  await page.waitForTimeout(150);
  await shot(page, '24-trivia');
  await expect(page.getByTestId('stage-pick')).toBeVisible({ timeout: 10_000 });
  await page.waitForTimeout(300);
  await shot(page, '25-pick');
  await page.getByTestId('pick-fairing_small').click();
  await expect(page.getByTestId('stage-result')).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(900);
  await shot(page, '26-result-trivia');

  // 10. GO / NO-GO poll.
  await expect(page.getByTestId('screen-poll')).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(300);
  await shot(page, '27-poll-waiting');
  await expect(page.getByTestId('poll-my-call')).toBeVisible({ timeout: 20_000 });
  await shot(page, '28-poll-my-call');
  await page.getByTestId('poll-go').click();
  await expect(page.getByTestId('poll-result')).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(500);
  await shot(page, '29-poll-result');

  // 11. Flight console: countdown, Max Q alert, callout.
  await expect(page.getByTestId('console-screen')).toBeVisible({ timeout: 20_000 });
  await page.waitForTimeout(1500);
  await shot(page, '30-console-countdown');
  await expect(page.getByTestId('console-alert').first()).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(300);
  await shot(page, '31-console-alert');
  await page.getByTestId('alert-callout').first().click();
  await page.waitForTimeout(500);
  await shot(page, '32-good-call');

  // 12. Minigame MG-08.
  await expect(page.getByTestId('mg-intro')).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(800);
  await shot(page, '33-minigame-intro');
  await expect(page.getByTestId('mg-play')).toBeVisible({ timeout: 15_000 });
  const box = await page.getByTestId('mg-play').boundingBox();
  if (box) {
    // Hold the throttle lever around the middle for a while, then move it.
    await page.mouse.move(box.x + box.width * 0.85, box.y + box.height * 0.5);
    await page.mouse.down();
    await page.waitForTimeout(2500);
    await shot(page, '34-minigame-play');
    await page.mouse.move(box.x + box.width * 0.85, box.y + box.height * 0.42, { steps: 6 });
    await page.waitForTimeout(3000);
    await page.mouse.up();
  }
  await expect(page.getByTestId('mg-result')).toBeVisible({ timeout: 60_000 });
  await page.waitForTimeout(1200);
  await shot(page, '35-minigame-result');
  await page.getByTestId('mg-continue').click();

  // 13. Blackout.
  await expect(page.getByTestId('console-blackout')).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(400);
  await shot(page, '36-blackout');

  // 14. Debrief: personal results and awards.
  await expect(page.getByTestId('screen-debrief')).toBeVisible({ timeout: 40_000 });
  await expect(page.getByTestId('debrief-awards')).toBeVisible({ timeout: 20_000 });
  await page.waitForTimeout(1800);
  await shot(page, '37-debrief');
  await page.getByTestId('debrief-awards').scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);
  await shot(page, '38-debrief-awards');

  // 15. Personal Codex.
  await page.getByTestId('open-codex').click();
  await expect(page.getByTestId('codex-sheet')).toBeVisible();
  await page.waitForTimeout(400);
  await shot(page, '39-codex');
  await page.getByTestId('codex-item').first().click();
  await page.waitForTimeout(400);
  await shot(page, '40-codex-entry');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');

  // 16. Settings, then high contrast and 200 % text.
  await page.getByTestId('open-settings').click();
  await expect(page.getByTestId('settings-sheet')).toBeVisible();
  await page.waitForTimeout(300);
  await shot(page, '41-settings');
  await page.getByTestId('pref-highContrast').click();
  const larger = page.getByTestId('text-larger');
  for (let i = 0; i < 8 && (await larger.isEnabled()); i++) await larger.click();
  await expect(page.getByTestId('text-scale-value')).toContainText('200');
  await page.waitForTimeout(300);
  await shot(page, '42-settings-contrast-200');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  await shot(page, '43-debrief-contrast-200');

  const missing = await page.evaluate(() => (window as unknown as { __mf: { missing: () => string[] } }).__mf.missing());
  console.log('missing strings:', JSON.stringify(missing));
  console.log('console errors:', JSON.stringify(consoleErrors));
  expect(missing).toEqual([]);
  expect(consoleErrors.filter((e) => !/models\/.+\.glb/.test(e))).toEqual([]);
});

test('join screen right-to-left at 200 % text', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('mf.prefs', JSON.stringify({ textScalePct: 200 }));
  });
  await page.goto('/?mock=1&dir=rtl&room=KQXM');
  await expect(page.getByTestId('screen-join')).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await page.waitForTimeout(400);
  await shot(page, '44-join-rtl-200');
  // No horizontal overflow at 200 %.
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});
