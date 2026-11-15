// T054 trailer captures: records the real Unity WebGL host, rendered on the local GPU, at 1920x1080 60 fps.
//
// How it works (Windows only):
//   1. System Google Chrome (Playwright `channel: 'chrome'`) is launched headed with ANGLE/D3D11 and the GPU
//      blocklist ignored, then the window is made fullscreen on a 1920x1080 display. WEBGL_debug_renderer_info
//      is logged so you can confirm the NVIDIA/AMD GPU is used, not SwiftShader.
//   2. ffmpeg's `ddagrab` (Desktop Duplication API) records the whole display at 60 fps for the entire session
//      into one near-lossless master file (x264 ultrafast, crf 12). CDP Page.startScreencast was measured at
//      ~40 fps with bursty 8-83 ms gaps and Playwright recordVideo is 25 fps, so neither was used.
//   3. The host is driven like a real session: New mission -> Open lobby -> five headless phone clients join
//      with call signs -> Start briefing -> PageDown (the host's own "next phase" shortcut) past the briefing
//      and contract screens, which still show placeholder dashes -> Build Bay votes played by the phones ->
//      FRR -> countdown -> flight -> debrief. Phones autopilot every screen (ready, vote, GO, call-outs).
//   4. Clips are cut afterwards from the master with `cut` below (H.264 crf 18 preset slow yuv420p 60 fps,
//      no audio). Timestamps in marks.log are wall-clock; find exact in/out points by looking at frames,
//      because the ddagrab clock drifts by up to ~1 % against Date.now() over a long session.
//
// Usage (from a scratch folder with `npm i playwright ffmpeg-static`, never inside the repo):
//   server/: npm ci && npm run build && PORT=10000 RENDER_EXTERNAL_URL=http://localhost:10000 npm run start:hosted
//   node capture.mjs            # records rec/session.mkv + marks.log, drives the whole session
//   node capture.mjs cut rec/session.mkv 11.0 5 02-room-open-qr-code
// Keep other windows, notifications and the mouse off the display while it records (ddagrab grabs the screen).
import { chromium } from 'playwright';
import { spawn, spawnSync } from 'node:child_process';
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import ffmpegPath from 'ffmpeg-static';

const BASE = process.env.MF_BASE ?? 'http://localhost:10000';
const WS = BASE.replace(/^http/, 'ws') + '/ws';
const CREW = ['Ada', 'Yuri', 'Sally', 'Neil', 'Mae'];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const mark = (name) => { appendFileSync('marks.log', `${Date.now() / 1000} ${name}\n`); console.log('mark', name); };

function cut(src, start, dur, name) {
  mkdirSync('out', { recursive: true });
  const r = spawnSync(ffmpegPath, ['-hide_banner', '-loglevel', 'error', '-y', '-ss', String(start), '-i', src, '-t', String(dur), '-an',
    '-vf', 'format=yuv420p', '-r', '60', '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-profile:v', 'high', '-movflags', '+faststart', `out/${name}.mp4`], { stdio: 'inherit' });
  process.exit(r.status ?? 1);
}
if (process.argv[2] === 'cut') cut(...process.argv.slice(3, 7));

async function phoneCrew(browser, code) {
  const tid = (p, id) => p.getByTestId(id);
  const vis = (l) => l.isVisible().catch(() => false);
  const tap = (l) => l.first().evaluate((el) => el.click()).catch(() => {});
  const phones = [];
  for (const [i, nick] of CREW.entries()) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    const page = await ctx.newPage();
    await page.goto(`${BASE}/play/client/?room=${code}`, { waitUntil: 'domcontentloaded' });
    await tid(page, 'join-nick').fill(nick);
    await tid(page, 'join-submit').click();
    await tid(page, 'screen-lobby').waitFor({ timeout: 20000 });
    mark(`joined-${nick}`);
    phones.push({ page, i });
    await sleep(1400); // one avatar pops in at a time
  }
  // Autopilot: whatever the phone shows, answer it the way a player would, staggered so tallies climb.
  for (const { page, i } of phones) (async () => {
    for (;;) {
      await sleep(700 + i * 450 + Math.random() * 900);
      try {
        if (await vis(tid(page, 'role-ready'))) { await tap(tid(page, 'role-ready')); continue; }
        if (await vis(tid(page, 'poll-my-call'))) { await tap(tid(page, 'poll-go')); continue; }
        if (await vis(tid(page, 'alert-callout').first())) { await tap(tid(page, 'alert-callout')); continue; }
        if (await vis(tid(page, 'mg-continue'))) { await tap(tid(page, 'mg-continue')); continue; }
        for (const prefix of ['quick-', 'trivia-', 'pick-', 'predict-']) {
          const l = page.locator(`[data-testid^="${prefix}"]`);
          if (await l.count() && await vis(l.first())) { await tap(l.nth(i % await l.count())); break; }
        }
        const cast = tid(page, 'cast');
        if (await vis(cast)) {
          const dots = page.locator('.dot');
          const nd = await dots.count();
          if (nd) { await dots.nth((i === 0 ? 0 : i % 3) % nd).click().catch(() => {}); await sleep(400); }
          if (await cast.isEnabled().catch(() => false)) await tap(cast);
          continue;
        }
        const mg = page.locator('[data-testid="mg-play"] canvas');
        if (await vis(mg)) { await mg.focus().catch(() => {}); await page.keyboard.press(Math.random() < 0.5 ? 'ArrowUp' : 'ArrowDown').catch(() => {}); await page.mouse.click(195, 500).catch(() => {}); }
      } catch { /* keep playing */ }
    }
  })();
}

const browser = await chromium.launch({
  headless: false, channel: 'chrome', ignoreDefaultArgs: ['--enable-automation'],
  args: ['--use-angle=d3d11', '--enable-gpu-rasterization', '--ignore-gpu-blocklist', '--force-device-scale-factor=1', '--force_high_performance_gpu',
    '--window-position=0,0', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'],
});
const ctx = await browser.newContext({ viewport: null, deviceScaleFactor: 1 });
const host = await ctx.newPage();
const click = async (x, y) => { await host.mouse.move(x, y); await sleep(80); await host.mouse.down(); await sleep(60); await host.mouse.up(); };
const cdp = await ctx.newCDPSession(host);
const { windowId } = await cdp.send('Browser.getWindowForTarget');
await cdp.send('Browser.setWindowBounds', { windowId, bounds: { windowState: 'fullscreen' } });

let roomCode = null;
host.on('websocket', (ws) => ws.on('framereceived', (f) => { const m = String(f.payload).match(/"(?:roomCode|code|room)"\s*:\s*"([A-Z]{4})"/); if (m) roomCode = m[1]; }));
await host.goto(`${BASE}/play/host/?server=${encodeURIComponent(WS)}`);
console.log('renderer', await host.evaluate(() => { const gl = document.createElement('canvas').getContext('webgl2'); const e = gl.getExtension('WEBGL_debug_renderer_info'); return gl.getParameter(e.UNMASKED_RENDERER_WEBGL); }));
await host.waitForFunction(() => !!window.mfUnity, null, { timeout: 120000 });

mkdirSync('rec', { recursive: true });
writeFileSync('rec/start.txt', String(Date.now() / 1000));
const rec = spawn(ffmpegPath, ['-hide_banner', '-loglevel', 'warning', '-y', '-f', 'lavfi', '-i', 'ddagrab=output_idx=0:framerate=60:draw_mouse=0',
  '-vf', 'hwdownload,format=bgra', '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '12', '-g', '60', 'rec/session.mkv'], { stdio: ['pipe', 'inherit', 'inherit'] });

mark('title'); await sleep(10000);                       // title: rocket over Earth
mark('new-mission'); await click(236, 912); await sleep(9000);   // room open with QR + code
const browserPhones = await chromium.launch({ channel: 'chrome', headless: true });
mark('open-lobby'); await click(1320, 865); await sleep(6000);
await phoneCrew(browserPhones, roomCode); await sleep(5000);
mark('start-briefing'); await click(1063, 951); await sleep(8000);
mark('to-contract'); await host.keyboard.press('PageDown'); await sleep(3000);  // briefing panels still show placeholders
mark('to-build'); await host.keyboard.press('PageDown');                         // contract vote is a placeholder screen
// Build Bay: 22 votes played by the phones (~30-45 s each). Half way, show the exploded view.
await sleep(9 * 60_000); mark('exploded-on'); await host.keyboard.press('x'); await sleep(8000); await host.keyboard.press('x'); mark('exploded-off');
await host.waitForFunction(() => false, null, { timeout: 8 * 60_000 }).catch(() => {});  // rest of Build, FRR, countdown
mark('flight-or-later');
await sleep(6 * 60_000);                                   // flight and debrief run on their own with the phones answering
mark('end');
rec.stdin.write('q');
await sleep(3000);
await browserPhones.close();
await browser.close();
