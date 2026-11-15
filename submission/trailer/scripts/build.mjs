// T053: builds the MissionForge trailer from the edit decision lists in timeline.mjs.
//   node build.mjs 16x9|9x16 [--only=i,j] [--skip-overlays] [--join-only]
// 1. music.mjs synthesizes the soundtrack (120 BPM) into the work dir.
// 2. Chromium renders overlay.html (kinetic type, phone bezels, labels, end card) frame by frame, transparent.
// 3. ffmpeg renders each shot: camera move on the still/video (eased zoom), phone clips composited into
//    device frames, overlay on top, optional "punch" zoom on the beat. 4. Shots are joined with hard cuts or
//    short xfade transitions (whip = smoothleft, zoom = zoomin, flash = fadewhite), colour-graded
//    (teal shadows / warm highlights, soft glow, vignette, light grain) and muxed with the music.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { CUTS, ROOT, URL, FINE } from './timeline.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TEMP = (process.env.TEMP ?? '/tmp').split(path.sep).join('/');
const TOOLS = process.env.T053_TOOLS ?? `${TEMP}/t053/tools`; // ffmpeg.exe (from ffmpeg-static) + node_modules/qrcode
const FFMPEG = process.env.FFMPEG ?? `${TOOLS}/ffmpeg.exe`;
const { chromium } = createRequire(`${ROOT}/client/package.json`)('@playwright/test');
const QR = createRequire(`${TOOLS}/package.json`)('qrcode');

const cutName = process.argv[2] ?? '16x9';
const only = new Set(((process.argv.find((a) => a.startsWith('--only=')) ?? '').slice(7)).split(',').filter(Boolean).map(Number));
const skipOv = process.argv.includes('--skip-overlays');
const joinOnly = process.argv.includes('--join-only');
const cut = CUTS[cutName];
const { W, H, shots } = cut;
const FPS = 30, BEATF = 15; // 120 BPM
const WORK = `${TEMP}/t053/build-${cutName}`;
fs.mkdirSync(WORK, { recursive: true });
const ff = (args) => execFileSync(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-y', ...args], { stdio: 'inherit' });
const TR = { whip: ['smoothleft', 6], zoom: ['zoomin', 7], flash: ['fadewhite', 6], fade: ['fade', 10] };
const trF = (s) => (s?.tr ? TR[s.tr][1] : 0);

// ── geometry: phone screen rectangles (390x844 CSS px client, recorded at 780x1688) ──
const PH = 844 / 390;
function phoneRects(layout, n) {
  const box = (cx, y, h) => { const w = Math.round(h / PH / 2) * 2; return { x: Math.round(cx - w / 2), y, w, h }; };
  if (W > H) {
    const L = {
      C: [box(960, 70, 940)], R: [box(1360, 70, 940)], L: [box(560, 70, 940)],
      mC: [box(960, 50, 880)], mL: [box(620, 50, 880)], mR: [box(1300, 50, 880)],
      '2top': [box(960 - 250, 255, 780), box(960 + 250, 255, 780)],
      '3top': [box(960 - 440, 265, 770), box(960, 265, 770), box(960 + 440, 265, 770)],
    }[layout];
    return L.slice(0, n);
  }
  const L = { p1: [box(540, 330, 1400)], p2: [box(272, 560, 1030), box(808, 560, 1030)] }[layout];
  return L.slice(0, n);
}

// ── timeline ──
let t = 0;
const plan = shots.map((s, i) => {
  const N = s.b * BEATF;
  const next = shots[i + 1];
  const tail = trF(next);
  const p = { i, ...s, N, L: N + tail, start: t, D: N / FPS };
  if (s.src.phones) p.rects = phoneRects(s.src.layout, s.src.phones.length).map((rc, k) => ({ ...rc, tag: s.src.phones[k].tag }));
  t += N;
  return p;
});
const totalF = t;
console.log(cutName, 'shots', plan.length, 'duration', (totalF / FPS).toFixed(2), 's');

// ── overlays ──
const qr = await QR.toDataURL(URL, { margin: 1, width: 660, errorCorrectionLevel: 'M', color: { dark: '#071522', light: '#ffffff' } });
const isAnimated = (s) => !!(s.ov && (s.ov.words?.length || s.ov.title || s.ov.end));
if (!skipOv && !joinOnly) {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  await page.goto('file:///' + `${HERE.split(path.sep).join('/')}/overlay.html`);
  // Direct CDP capture with a transparent default background is several times faster than page.screenshot().
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setDefaultBackgroundColorOverride', { color: { r: 0, g: 0, b: 0, a: 0 } });
  const grab = async (file) => {
    const { data } = await cdp.send('Page.captureScreenshot', { format: 'png', optimizeForSpeed: true });
    fs.writeFileSync(file, Buffer.from(data, 'base64'));
  };
  for (const p of plan) {
    if (only.size && !only.has(p.i)) continue;
    const dir = `${WORK}/ov${p.i}`;
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(dir, { recursive: true });
    // words end where the transition into the next shot begins (no text from two shots during a whip)
    const shot = { D: p.N / FPS, ov: p.ov?.end ? { ...p.ov, end: { url: URL, qr, fine: FINE } } : p.ov };
    const frames = isAnimated(p) ? p.L : 1;
    for (let f = 0; f < frames; f++) {
      await page.evaluate(([s, tt, g]) => window.draw(s, tt, g), [shot, f / FPS, { W, H, phones: p.rects ?? [] }]);
      await grab(`${dir}/${String(f).padStart(5, '0')}.png`);
    }
    console.log('overlay', p.i, frames, 'frames');
  }
  await browser.close();
}

// ── shots ──
// crop a source of size (sw, sh) to the output aspect around (cx, cy), then animate a zoom with scale+crop.
function camera(inLabel, outLabel, src, sw, sh, T) {
  const { cx = 0.5, cy = 0.5, z = [1, 1], fx = 0.5, fy = 0.5, blur } = src;
  const oa = W / H;
  let cw = sw, ch = sh;
  if (sw / sh > oa) cw = Math.round(sh * oa / 2) * 2; else ch = Math.round(sw / oa / 2) * 2;
  const x = Math.round(Math.min(Math.max(cx * sw - cw / 2, 0), sw - cw));
  const y = Math.round(Math.min(Math.max(cy * sh - ch / 2, 0), sh - ch));
  if (blur) return `${inLabel}crop=${cw}:${ch}:${x}:${y},scale=${W / 4}:${H / 4},gblur=sigma=6,scale=${W}:${H},eq=brightness=-0.16:saturation=0.85,setsar=1${outLabel}`;
  // zoompan on a 2x upscale (sub-pixel steps of the source keep slow moves smooth)
  const N = Math.round(T * FPS);
  const zz = `(${z[0]}+(${z[1] - z[0]})*(1-pow(1-min(on/${N},1),3)))`;
  return `${inLabel}crop=${cw}:${ch}:${x}:${y},scale=${2 * W}:${2 * H}:flags=bicubic,setsar=1,`
    + `zoompan=z='${zz}':x='(iw-iw/zoom)*${fx}':y='(ih-ih/zoom)*${fy}':d=1:s=${W}x${H}:fps=${FPS},setsar=1${outLabel}`;
}
const probeCache = {};
function dims(file) {
  if (probeCache[file]) return probeCache[file];
  let out = '';
  try { execFileSync(FFMPEG, ['-hide_banner', '-i', file], { stdio: 'pipe' }); } catch (e) { out = String(e.stderr); }
  const m = out.match(/, (\d{2,5})x(\d{2,5})[, ]/);
  return (probeCache[file] = [Number(m[1]), Number(m[2])]);
}

if (!joinOnly) for (const p of plan) {
  if (only.size && !only.has(p.i)) continue;
  const T = p.L / FPS;
  const args = [];
  const fc = [];
  let n = 0;
  const base = p.src.phones ? p.src.bg : p.src;
  let srcLab, sw, sh;
  if (base.still) {
    args.push('-loop', '1', '-framerate', String(FPS), '-t', T.toFixed(3), '-i', base.still);
    [sw, sh] = dims(base.still);
    srcLab = `[${n}]`;
  } else {
    // speed: constant, or a ramp [s1, s2, a]: speed s1 for the first a seconds of source, then s2
    const sp = base.speed ?? 1;
    const ramp = base.ramp;
    const need = ramp ? ramp[2] + (T - ramp[2] / ramp[0]) * ramp[1] : T * sp;
    args.push('-ss', String(base.ss), '-t', (need + 0.5).toFixed(3), '-i', base.video);
    [sw, sh] = dims(base.video);
    const pts = ramp
      ? `'if(lt((PTS-STARTPTS)*TB,${ramp[2]}),(PTS-STARTPTS)/${ramp[0]},${ramp[2]}/TB/${ramp[0]}+((PTS-STARTPTS)-${ramp[2]}/TB)/${ramp[1]})'`
      : `(PTS-STARTPTS)/${sp}`;
    fc.push(`[${n}]setpts=${pts},fps=${FPS},tpad=stop_mode=clone:stop_duration=${T}[v0]`);
    srcLab = '[v0]';
  }
  if (base.fit && H > W) {
    // vertical cut: the whole 16:9 frame across the width over a blurred fill of itself
    const Nf = Math.round(T * FPS);
    const z = base.z ?? [1, 1];
    const zz = `(${z[0]}+(${z[1] - z[0]})*(1-pow(1-min(on/${Nf},1),3)))`;
    const Hf = Math.round((W * sh) / sw / 2) * 2;
    fc.push(`${srcLab}split[fa][fb]`);
    fc.push(camera('[fa]', '[fbg]', { ...base, blur: true }, sw, sh, T));
    fc.push(`[fb]scale=${2 * W}:${2 * Hf}:flags=bicubic,setsar=1,zoompan=z='${zz}':x='(iw-iw/zoom)*${base.fx ?? 0.5}':y='(ih-ih/zoom)*${base.fy ?? 0.5}':d=1:s=${W}x${Hf}:fps=${FPS}[ffg]`);
    fc.push(`[fbg][ffg]overlay=0:${(H - Hf) / 2}[b0]`);
  } else {
    // upscaled 720p AI clips (T056) get extra film grain so they sit next to the 1080p captures
    const grain = /trailer-ai/.test(base.video ?? '') ? ',noise=c0s=9:c0f=t+u' : '';
    fc.push(camera(srcLab, grain ? '[b00]' : '[b0]', base, sw, sh, T));
    if (grain) fc.push(`[b00]format=yuv420p${grain}[b0]`);
  }
  n++;
  let cur = '[b0]';
  // beat "punch": a quick zoom that settles, on the picture only (labels, type and device frames stay put)
  if (p.punch) {
    fc.push(`${cur}zoompan=z='1+${p.punch}*exp(-on/${FPS}*9)':x='(iw-iw/zoom)/2':y='(ih-ih/zoom)/2':d=1:s=${W}x${H}:fps=${FPS}[pu]`);
    cur = '[pu]';
  }
  for (const [k, ph] of (p.src.phones ?? []).entries()) {
    const rc = p.rects[k];
    args.push('-ss', String(ph.ss), '-t', (T * ph.speed + 0.5).toFixed(3), '-i', ph.file);
    fc.push(`[${n}]setpts=(PTS-STARTPTS)/${ph.speed},fps=${FPS},scale=${rc.w}:${rc.h}:flags=lanczos,setsar=1,tpad=stop_mode=clone:stop_duration=${T}[p${k}]`);
    fc.push(`${cur}[p${k}]overlay=${rc.x}:${rc.y}:shortest=0[c${k}]`);
    cur = `[c${k}]`;
    n++;
  }
  const dir = `${WORK}/ov${p.i}`;
  if (isAnimated(p)) args.push('-framerate', String(FPS), '-i', `${dir}/%05d.png`);
  else args.push('-loop', '1', '-framerate', String(FPS), '-t', T.toFixed(3), '-i', `${dir}/00000.png`);
  fc.push(`${cur}[${n}]overlay=0:0:format=auto:eof_action=repeat[o]`);
  n++;
  cur = '[o]';
  fc.push(`${cur}setsar=1,format=yuv420p,trim=end_frame=${p.L},setpts=PTS-STARTPTS[v]`);
  ff([...args, '-filter_complex', fc.join(';'), '-map', '[v]', '-r', String(FPS), '-frames:v', String(p.L), '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '13', `${WORK}/seg${p.i}.mp4`]);
  console.log('shot', p.i, `${(p.start / FPS).toFixed(1)}s`, p.b, 'beats', p.src.phones ? 'phones' : p.src.still ? path.basename(p.src.still) : path.basename(p.src.video ?? ''));
}
if (only.size) process.exit(0);

// ── music ──
const wav = `${WORK}/music.wav`;
execFileSync(process.execPath, [`${HERE}/music.mjs`, cut.music, wav], { stdio: 'inherit' });

// ── join, grade, mux ──
const total = totalF / FPS;
const args = plan.flatMap((p) => ['-i', `${WORK}/seg${p.i}.mp4`]);
args.push('-i', wav);
const fc = plan.map((p) => `[${p.i}:v]setsar=1,fps=${FPS},settb=1/${FPS},format=yuv420p[s${p.i}]`);
let prev = '[s0]';
let acc = plan[0].N;
for (let k = 1; k < plan.length; k++) {
  const p = plan[k];
  const lab = `[j${k}]`;
  if (p.tr) {
    const [kind, d] = TR[p.tr];
    fc.push(`${prev}[s${k}]xfade=transition=${kind}:duration=${(d / FPS).toFixed(4)}:offset=${(acc / FPS).toFixed(4)},settb=1/${FPS}${lab}`);
  } else {
    fc.push(`${prev}[s${k}]concat=n=2:v=1:a=0,settb=1/${FPS}${lab}`);
  }
  prev = lab;
  acc += p.N;
}
fc.push(`${prev}trim=end_frame=${totalF},setpts=PTS-STARTPTS,`
  + `eq=contrast=1.05:saturation=1.08:gamma=0.98,colorbalance=rs=-0.03:gs=0.0:bs=0.04:rh=0.03:gh=0.01:bh=-0.03,split[g0][g1]`);
fc.push(`[g1]scale=${W / 4}:${H / 4},gblur=sigma=8,scale=${W}:${H}[gl]`);
fc.push(`[g0][gl]blend=all_mode=screen:all_opacity=0.16,vignette=angle=PI/5,noise=c0s=5:c0f=t,`
  + `fade=t=out:st=${(total - 0.6).toFixed(3)}:d=0.6,format=yuv420p[v]`);
fc.push(`[${plan.length}:a]atrim=0:${total.toFixed(3)},volume=-3.5dB,afade=t=out:st=${(total - 2.5).toFixed(3)}:d=2.5,aformat=sample_rates=48000:channel_layouts=stereo[a]`);
const vb = W > H ? ['-b:v', '3600k', '-maxrate', '5500k', '-bufsize', '9000k'] : ['-b:v', '4200k', '-maxrate', '6000k', '-bufsize', '9000k'];
ff([...args, '-filter_complex', fc.join(';'), '-map', '[v]', '-map', '[a]', '-r', String(FPS),
  '-c:v', 'libx264', '-preset', 'slow', ...vb, '-profile:v', 'high', '-level', '4.2', '-pix_fmt', 'yuv420p',
  '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', '-t', total.toFixed(3), cut.out]);
const mb = fs.statSync(cut.out).size / 1e6;
console.log('wrote', cut.out, total.toFixed(2), 's', mb.toFixed(1), 'MB', mb > cut.maxMB ? 'OVER SIZE LIMIT' : '');
fs.writeFileSync(`${WORK}/timeline.json`, JSON.stringify(plan.map((p) => ({ i: p.i, start: +(p.start / FPS).toFixed(2), d: p.D, tr: p.tr ?? 'cut',
  src: p.src.phones ? p.src.phones.map((ph) => `${path.basename(ph.file)}@${ph.ss}`).join(' + ') : path.basename(p.src.still ?? p.src.video) })), null, 1));
