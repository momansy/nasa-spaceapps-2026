// Builds the MissionForge demo videos from real captures: renders caption/frame overlays with
// Chromium, renders each scene with ffmpeg, then joins scenes with crossfades and a generated
// ambient pad.   node build.mjs 2min|30s [--only=N]
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { chromium, FFMPEG } from './cast.mjs';
import { CUTS } from './scenes.mjs';

const W = `${(process.env.TEMP ?? '/tmp').split(String.fromCharCode(92)).join('/')}/demo-video`;
const cut = process.argv[2] ?? '2min';
const only = (process.argv.find((a) => a.startsWith('--only=')) ?? '').slice(7);
const { scenes, out } = CUTS[cut];
const dir = `${W}/build-${cut}`;
fs.mkdirSync(dir, { recursive: true });
const FPS = 30;
const XF = 0.5;

const ff = (args) => execFileSync(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-y', ...args], { stdio: 'inherit' });

// ── overlays ──
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
await page.goto('file:///' + `${W}/overlay.html`);
for (const [i, s] of scenes.entries()) {
  if (only && String(i) !== only) continue;
  await page.evaluate(([html]) => window.render({ html }, false), [s.html]);
  await page.screenshot({ path: `${dir}/ov${i}.png`, omitBackground: true });
  if (s.phones) {
    await page.evaluate(([html]) => window.render({ html }, true), [s.html]);
    await page.screenshot({ path: `${dir}/mask${i}.png`, omitBackground: true });
  }
}
await browser.close();

// ── scenes ──
for (const [i, s] of scenes.entries()) {
  if (only && String(i) !== only) continue;
  const D = s.d;
  const N = Math.round(D * FPS);
  const args = [];
  const fc = [];
  let n = 0;
  let base;
  if (s.still) {
    const { img, z0 = 1, z1 = 1.06, fx = 0.5, fy = 0.5 } = s.still;
    args.push('-loop', '1', '-framerate', String(FPS), '-t', String(D), '-i', img);
    fc.push(`[${n}]scale=3840:2160:flags=lanczos,setsar=1,zoompan=z='${z0}+(${z1 - z0})*on/${N}':x='(iw-iw/zoom)*${fx}':y='(ih-ih/zoom)*${fy}':d=1:s=1920x1080:fps=${FPS}[b]`);
    n++;
    base = '[b]';
  } else if (s.video) {
    args.push('-ss', String(s.video.ss), '-t', String(D), '-i', s.video.file);
    fc.push(`[${n}]scale=1920:1080:force_original_aspect_ratio=increase:flags=lanczos,crop=1920:1080,setsar=1,fps=${FPS},tpad=stop_mode=clone:stop_duration=${D}[b]`);
    n++;
    base = '[b]';
  }
  // overlay (opaque background for phone scenes, transparent captions otherwise)
  args.push('-loop', '1', '-framerate', String(FPS), '-t', String(D), '-i', `${dir}/ov${i}.png`);
  const ov = n++;
  if (base) {
    fc.push(`${base}[${ov}]overlay=0:0:format=auto[c0]`);
  } else {
    fc.push(`[${ov}]format=rgba[c0]`);
  }
  let cur = '[c0]';
  if (s.phones) {
    for (const [pi, ph] of s.phones.entries()) {
      const labels = [];
      for (const [ci, [file, a, b]] of ph.clips.entries()) {
        args.push('-ss', String(a), '-t', String(b - a), '-i', file);
        fc.push(`[${n}]fps=${FPS},scale=${ph.w}:${ph.h}:flags=lanczos,setsar=1,setpts=PTS-STARTPTS[p${pi}c${ci}]`);
        labels.push(`[p${pi}c${ci}]`);
        n++;
      }
      fc.push(`${labels.join('')}concat=n=${labels.length}:v=1:a=0,tpad=stop_mode=clone:stop_duration=${D}[p${pi}]`);
      fc.push(`${cur}[p${pi}]overlay=${ph.x}:${ph.y}[q${pi}]`);
      cur = `[q${pi}]`;
    }
    args.push('-loop', '1', '-framerate', String(FPS), '-t', String(D), '-i', `${dir}/mask${i}.png`);
    fc.push(`${cur}[${n}]overlay=0:0:format=auto[m]`);
    n++;
    cur = '[m]';
  }
  fc.push(`${cur}format=yuv420p,trim=end_frame=${N},setpts=PTS-STARTPTS[v]`);
  ff([...args, '-filter_complex', fc.join(';'), '-map', '[v]', '-r', String(FPS), '-c:v', 'libx264', '-preset', 'fast', '-crf', '12', `${dir}/seg${i}.mp4`]);
  console.log('scene', i, s.name, D + 's');
}
if (only) process.exit(0);

// ── join with crossfades + ambient pad ──
const segs = scenes.map((_, i) => `${dir}/seg${i}.mp4`);
const inputs = segs.flatMap((f) => ['-i', f]);
const fc = [];
let acc = scenes[0].d;
let prev = '[0:v]';
for (let i = 1; i < scenes.length; i++) {
  const off = (acc - XF).toFixed(3);
  const lab = i === scenes.length - 1 ? '[vx]' : `[x${i}]`;
  fc.push(`${prev}[${i}:v]xfade=transition=fade:duration=${XF}:offset=${off}${lab}`);
  prev = lab;
  acc = acc - XF + scenes[i].d;
}
const total = acc;
fc.push(`[vx]fade=t=in:st=0:d=0.6,fade=t=out:st=${(total - 1.0).toFixed(3)}:d=1.0,format=yuv420p[v]`);
// Ambient pad generated here (no third-party audio): soft low chord with slow swells plus filtered noise.
const pad = "0.050*sin(2*PI*110*t)*(0.65+0.35*sin(2*PI*0.07*t))+0.036*sin(2*PI*164.81*t)*(0.6+0.4*sin(2*PI*0.05*t+1.3))+0.026*sin(2*PI*220*t)*(0.6+0.4*sin(2*PI*0.09*t+2.1))+0.016*sin(2*PI*329.63*t)*(0.5+0.5*sin(2*PI*0.04*t+0.4))+0.010*sin(2*PI*55*t)";
const ai = scenes.length;
const aargs = ['-f', 'lavfi', '-t', total.toFixed(3), '-i', `aevalsrc='${pad}|${pad.replace(/\*t\)/g, '*t+0.6)')}':s=48000:c=stereo`,
  '-f', 'lavfi', '-t', total.toFixed(3), '-i', `anoisesrc=color=brown:amplitude=0.05:s=48000`];
fc.push(`[${ai}:a]aformat=channel_layouts=stereo[pa];[${ai + 1}:a]lowpass=f=400,aformat=channel_layouts=stereo[no];[pa][no]amix=inputs=2:weights='1 0.5':normalize=0,lowpass=f=1800,volume=1.0,afade=t=in:st=0:d=2.5,afade=t=out:st=${(total - 2.5).toFixed(3)}:d=2.5[a]`);
ff([...inputs, ...aargs, '-filter_complex', fc.join(';'), '-map', '[v]', '-map', '[a]', '-r', String(FPS),
  '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-profile:v', 'high', '-level', '4.2', '-pix_fmt', 'yuv420p',
  '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart', '-t', total.toFixed(3), out]);
console.log('wrote', out, total.toFixed(2) + 's');
// timeline for the README
let t = 0;
const tl = scenes.map((s, i) => { const r = { i, name: s.name, start: +t.toFixed(2), end: +(t + s.d).toFixed(2) }; t += s.d - XF; return r; });
fs.writeFileSync(`${dir}/timeline.json`, JSON.stringify(tl, null, 1));
