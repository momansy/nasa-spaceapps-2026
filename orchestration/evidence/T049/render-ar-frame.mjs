// Renders Arabic subtitle cues over real video frames with Chromium, which shapes Arabic and orders
// right-to-left text correctly. (The ffmpeg-static build used for the burn-in previews has a libass
// without complex text shaping: lam-alef words show a box.)
//   node render-ar-frame.mjs <cut: 2min|30s> <seconds> <out.png>   [needs ffmpeg path in $FFMPEG]
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../../..');
const [cut, secs, out] = process.argv.slice(2);
const ffmpeg = process.env.FFMPEG ?? 'ffmpeg';
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ar-frame-'));
const frame = path.join(tmp, 'frame.png');
execFileSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', '-ss', secs, '-i', path.join(repo, `submission/video/missionforge-demo-${cut}.mp4`), '-frames:v', '1', '-vf', 'scale=1280:720', frame]);

// find the cue shown at that time
const t = Number(secs);
const toSec = (s) => { const [h, m, r] = s.split(':'); const [x, ms] = r.split(','); return +h * 3600 + +m * 60 + +x + +ms / 1000; };
const cues = fs.readFileSync(path.join(repo, `submission/video/subtitles/missionforge-demo-${cut}.ar.srt`), 'utf8').trim().split(/\n\n/).map((b) => b.split('\n'));
const cue = cues.find((c) => { const [a, z] = c[1].split(' --> ').map(toSec); return t >= a && t <= z; });
if (!cue) throw new Error(`no Arabic cue at ${secs} s`);
const text = cue.slice(2).join('<br>');
const html = `<body style="margin:0;width:1280px;height:720px;background:url('${pathToFileURL(frame).href}');position:relative;font-family:'Geeza Pro','Arial',sans-serif">
<div dir="rtl" style="position:absolute;left:0;right:0;bottom:36px;text-align:center;font-size:34px;line-height:1.35;color:#fff;text-shadow:0 0 4px #000,0 0 4px #000,0 0 6px #000,0 0 6px #000">${text}</div></body>`;
fs.writeFileSync(path.join(tmp, 'f.html'), html);
const { chromium } = createRequire(path.join(repo, 'client/package.json'))('@playwright/test');
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
await p.goto(pathToFileURL(path.join(tmp, 'f.html')).href);
await p.screenshot({ path: out });
await b.close();
console.log('wrote', out, '| cue', cue[0], cue[1]);
