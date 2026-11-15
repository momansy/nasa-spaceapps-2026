// T039: the scripted mock session in Spanish, French and Portuguese (set LANGS=es to pick one).
// Saves screenshots of the join screen, role card, part card, flight console and debrief to
// orchestration/evidence/T039/<lang>/, and fails on a missing string, a console error or any
// horizontal overflow. Run with `npx playwright test session-lang`.
import { expect, test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SHOTS = join(dirname(fileURLToPath(import.meta.url)), '../../orchestration/evidence/T039');
const LANGS = (process.env.LANGS ?? 'es,fr,pt').split(',');

async function shot(page: Page, lang: string, name: string) {
  const dir = join(SHOTS, lang);
  mkdirSync(dir, { recursive: true });
  await page.screenshot({ path: join(dir, `${name}.png`) });
}

async function noOverflow(page: Page, where: string) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow, `horizontal overflow on ${where}`).toBeLessThanOrEqual(0);
}

for (const lang of LANGS) test(`mock session in ${lang}`, async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text());
  });
  page.on('pageerror', (e) => consoleErrors.push(String(e)));
  await page.addInitScript(() => {
    localStorage.setItem('mf.prefs', JSON.stringify({ lang }));
  });

  await page.goto('/?mock=1&speed=2&room=KQXM');
  await expect(page.getByTestId('screen-join')).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
  await expect(page.locator('html')).toHaveAttribute('lang', lang);
  await page.waitForTimeout(500);
  await shot(page, lang, '01-join');
  await noOverflow(page, 'join');
  await page.getByTestId('join-nick').fill('Ada');
  await page.getByTestId('join-submit').click();

  await expect(page.getByTestId('screen-lobby')).toBeVisible();
  await expect(page.locator('.crew > li')).toHaveCount(5, { timeout: 15_000 });
  await shot(page, lang, '02-lobby');

  await expect(page.getByTestId('screen-role')).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(500);
  await shot(page, lang, '03-role-card');
  await noOverflow(page, 'role card');
  await page.getByTestId('role-ready').click();

  await expect(page.getByTestId('screen-build')).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(400);
  await shot(page, lang, '04-briefing');

  const stage = (s: string, timeout = 60_000) =>
    expect(page.locator(`[data-testid="screen-vote"][data-stage="${s}"]`)).toBeVisible({ timeout });
  await stage('INSPECT');
  await page.waitForTimeout(700);
  await shot(page, lang, '05-part-card');
  await noOverflow(page, 'part card');
  await page.locator('[data-testid="card-eng_kerolox_workhorse"] .stat__btn').nth(1).click();
  await page.waitForTimeout(250);
  await shot(page, lang, '06-stat-explain');
  await page.locator('.dot').nth(2).click();
  await page.waitForTimeout(450);
  await shot(page, lang, '07-part-card-warnings');

  await stage('VOTE');
  await page.locator('.dot').nth(3).click();
  await page.waitForTimeout(450);
  await page.getByTestId('cast').click();
  await expect(page.getByTestId('stage-result')).toBeVisible({ timeout: 40_000 });
  await page.waitForTimeout(900);
  await shot(page, lang, '08-vote-result');

  await expect(page.getByTestId('console-screen')).toBeVisible({ timeout: 240_000 });
  await page.waitForTimeout(1500);
  await shot(page, lang, '09-console-countdown');
  await expect(page.getByTestId('console-alert').first()).toBeVisible({ timeout: 60_000 });
  await page.waitForTimeout(300);
  await shot(page, lang, '10-console-alert');
  await noOverflow(page, 'console');

  await expect(page.getByTestId('screen-debrief')).toBeVisible({ timeout: 240_000 });
  await expect(page.getByTestId('debrief-awards')).toBeVisible({ timeout: 20_000 });
  await page.waitForTimeout(1800);
  await shot(page, lang, '11-debrief');
  await page.getByTestId('debrief-awards').scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);
  await shot(page, lang, '12-debrief-awards');
  await noOverflow(page, 'debrief');

  await page.getByTestId('open-settings').click();
  await expect(page.getByTestId('settings-sheet')).toBeVisible();
  await page.waitForTimeout(300);
  await shot(page, lang, '13-settings');

  const missing = await page.evaluate(() => (window as unknown as { __mf: { missing: () => string[] } }).__mf.missing());
  console.log('missing strings:', JSON.stringify(missing));
  console.log('console errors:', JSON.stringify(consoleErrors));
  expect(missing).toEqual([]);
  expect(consoleErrors.filter((e) => !/models\/.+\.glb/.test(e))).toEqual([]);
});
