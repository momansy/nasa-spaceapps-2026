// T053: records extra minigames for the trailer montage, in the minigame labs of the real phone
// client, each played by the minigame's own scripted good player (auto=1). Reuses the CDP screencast
// recorder of the demo video (submission/video/scripts/cast.mjs).
//   client$ npx vite --port 5199      then      node record-minigames.mjs MG-14 MG-16 MG-20 MG-06 MG-03
import { chromium, newPhone, startCast, sleep } from '../../video/scripts/cast.mjs';

const REC = `${(process.env.TEMP ?? '/tmp').split(String.fromCharCode(92)).join('/')}/demo-video/rec`;
const labFor = (mg) => (/^MG-0[1-6]$/.test(mg) ? 'build' : 'orbit');
const browser = await chromium.launch();
for (const mg of process.argv.slice(2)) {
  const ctx = await newPhone(browser);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log(mg, 'pageerror', String(e)));
  await page.goto(`http://127.0.0.1:5199/e2e/minigames/${labFor(mg)}/lab.html?mg=${mg}&auto=1&seed=7`);
  await page.waitForFunction(() => window.__lab?.ready === true, null, { timeout: 60_000 });
  const cast = await startCast(page, `${REC}/${mg}-frames`);
  cast.mark('start');
  const t0 = Date.now();
  while (Date.now() - t0 < 40_000) {
    const res = await page.evaluate(() => window.__lab.result);
    if (res) { cast.mark('result'); console.log(mg, JSON.stringify(res).slice(0, 200)); await sleep(2000); break; }
    await sleep(250);
  }
  await cast.stop(`${REC}/${mg}.mp4`);
  await ctx.close();
}
await browser.close();
