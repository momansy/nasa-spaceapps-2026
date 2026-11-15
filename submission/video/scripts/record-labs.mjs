// Records minigames in the orbit lab with each minigame's own scripted good player (auto=1),
// the pilot seat of the mock session, and the Arabic mock session up to the first part card.
import { chromium, newPhone, startCast, sleep } from './cast.mjs';

const OUT = `${(process.env.TEMP ?? '/tmp').split(String.fromCharCode(92)).join('/')}/demo-video/rec`;
const which = process.argv.slice(2);
const browser = await chromium.launch();

async function lab(mg, ms) {
  const ctx = await newPhone(browser);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log(mg, 'pageerror', String(e)));
  await page.goto(`http://127.0.0.1:5199/e2e/minigames/orbit/lab.html?mg=${mg}&auto=1&seed=7`);
  await page.waitForFunction(() => window.__lab?.ready === true, null, { timeout: 60_000 });
  const cast = await startCast(page, `${OUT}/${mg}-frames`);
  cast.mark('start');
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const res = await page.evaluate(() => window.__lab.result);
    if (res) { cast.mark('result'); console.log(mg, JSON.stringify(res)); await sleep(2500); break; }
    await sleep(250);
  }
  await cast.stop(`${OUT}/${mg}.mp4`);
  await ctx.close();
}

async function pilot() {
  const ctx = await newPhone(browser);
  const page = await ctx.newPage();
  await page.goto('http://127.0.0.1:4173/?mock=1&seat=pilot&room=KQXM');
  await page.getByTestId('screen-join').waitFor();
  const cast = await startCast(page, `${OUT}/pilot-frames`);
  await page.getByTestId('join-nick').fill('Ada');
  await page.getByTestId('join-submit').click();
  cast.mark('joined');
  await sleep(40_000);
  await cast.stop(`${OUT}/pilot.mp4`);
  await ctx.close();
}

async function arabic() {
  const ctx = await newPhone(browser);
  await ctx.addInitScript(() => localStorage.setItem('mf.prefs', JSON.stringify({ lang: 'ar' })));
  const page = await ctx.newPage();
  await page.goto('http://127.0.0.1:4173/?mock=1&speed=1&room=KQXM');
  await page.getByTestId('screen-join').waitFor();
  await sleep(500);
  const cast = await startCast(page, `${OUT}/ar-frames`);
  cast.mark('join');
  await sleep(2500);
  await page.getByTestId('join-nick').fill('Ada');
  await page.getByTestId('join-submit').click();
  await page.getByTestId('screen-role').waitFor({ timeout: 30_000 });
  cast.mark('role');
  await sleep(4000);
  await page.getByTestId('role-ready').click();
  await page.locator('[data-testid="screen-vote"][data-stage="INSPECT"]').waitFor({ timeout: 90_000 });
  cast.mark('inspect');
  await sleep(5000);
  await cast.stop(`${OUT}/ar.mp4`);
  await ctx.close();
}

for (const w of which) {
  if (w === 'pilot') await pilot();
  else if (w === 'ar') await arabic();
  else await lab(w, 45_000);
}
await browser.close();
