// Rebuilds the submission cover image and the YouTube thumbnail from cover.html.
//   node submission/media/build-cover.mjs
// Needs the Playwright test package from client/ (cd client && npm ci) and a Chromium
// (npx playwright install chromium). Inputs (all in the repository, nothing invented):
//   assets/media/key-art/missionforge-16x9.png            key art (AI-generated, see AI_DISCLOSURE.md)
//   orchestration/evidence/T031/after/buildbay-assembly-1920x1080.png   Unity host capture
//   orchestration/evidence/T038/after/09-part-card.png     phone client screenshot
// Outputs: cover-16x9.png (1920x1080) and thumbnail-1280x720.jpg (JPEG, under 2 MB).
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../..');
const require = createRequire(path.join(repo, 'client/package.json'));
const { chromium } = require('@playwright/test');

const html = pathToFileURL(path.join(here, 'cover.html')).href;
const browser = await chromium.launch();

const shoot = async (scale, opts) => {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: scale });
  await page.goto(html);
  await page.evaluate(() => Promise.all([...document.querySelectorAll('*')].map(() => 0)).then(() => document.fonts.ready));
  await page.waitForTimeout(500);
  await page.screenshot(opts);
  await page.close();
};

await shoot(1, { path: path.join(here, 'cover-16x9.png'), type: 'png' });
let q = 90;
const thumb = path.join(here, 'thumbnail-1280x720.jpg');
for (;;) {
  await shoot(2 / 3, { path: thumb, type: 'jpeg', quality: q });
  if (fs.statSync(thumb).size < 1.8 * 1024 * 1024 || q <= 60) break;
  q -= 10;
}
await browser.close();
console.log('wrote cover-16x9.png and thumbnail-1280x720.jpg (jpeg quality', q + ')');
