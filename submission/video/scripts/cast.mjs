// CDP screencast recorder: saves every frame Chrome paints (JPEG) with its timestamp, then
// turns them into a constant-frame-rate H.264 file. Markers are wall-clock seconds.
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const require = createRequire('C:/Projects/NASA GAME/client/package.json');
export const { chromium } = require('@playwright/test');
export const FFMPEG = `${(process.env.TEMP ?? '/tmp').split(String.fromCharCode(92)).join('/')}/demo-video/node_modules/ffmpeg-static/ffmpeg.exe`;

export async function newPhone(browser, extra = {}) {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36',
    ...extra,
  });
  return ctx;
}

export async function startCast(page, dir) {
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const cdp = await page.context().newCDPSession(page);
  const frames = [];
  const markers = [];
  let n = 0;
  cdp.on('Page.screencastFrame', ({ data, metadata, sessionId }) => {
    const f = path.join(dir, `f${String(n++).padStart(6, '0')}.jpg`);
    fs.writeFileSync(f, Buffer.from(data, 'base64'));
    frames.push({ f, t: metadata.timestamp });
    cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => {});
  });
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: 780, maxHeight: 1688, everyNthFrame: 1 });
  const mark = (name) => {
    markers.push({ name, t: Date.now() / 1000 });
    console.log('mark', name);
  };
  const stop = async (outMp4) => {
    const endT = Date.now() / 1000;
    await cdp.send('Page.stopScreencast').catch(() => {});
    await new Promise((r) => setTimeout(r, 300));
    const t0 = frames[0].t;
    let list = 'ffconcat version 1.0\n';
    frames.forEach((fr, i) => {
      const next = i + 1 < frames.length ? frames[i + 1].t : endT;
      list += `file '${fr.f.replace(/\\/g, '/')}'\nduration ${Math.max(0.001, next - fr.t).toFixed(4)}\n`;
    });
    list += `file '${frames[frames.length - 1].f.replace(/\\/g, '/')}'\n`;
    fs.writeFileSync(path.join(dir, 'list.txt'), list);
    const rel = markers.map((m) => ({ name: m.name, s: +(m.t - t0).toFixed(2) }));
    fs.writeFileSync(outMp4.replace(/\.mp4$/, '.markers.json'), JSON.stringify(rel, null, 1));
    execFileSync(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', path.join(dir, 'list.txt'),
      '-vf', 'fps=30,scale=780:1688:flags=lanczos,format=yuv420p', '-c:v', 'libx264', '-preset', 'medium', '-crf', '14', outMp4]);
    console.log('wrote', outMp4, frames.length, 'frames', (endT - t0).toFixed(1), 's');
    return rel;
  };
  return { mark, stop, frames };
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
