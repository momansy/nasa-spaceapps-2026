// T053 review: one frame every 2 s of a finished trailer, labelled with its time, tiled into a contact sheet,
// plus every frame as a full-size PNG for close inspection.
//   node contact-sheet.mjs <video.mp4> <out.png> [fullFramesDir]
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const TEMP = (process.env.TEMP ?? '/tmp').split(path.sep).join('/');
const FFMPEG = process.env.FFMPEG ?? `${process.env.T053_TOOLS ?? `${TEMP}/t053/tools`}/ffmpeg.exe`;
const [video, out, full] = process.argv.slice(2);
const portrait = /9x16/.test(video);
const [tw, th, cols] = portrait ? [270, 480, 7] : [480, 270, 6];
const font = 'C\\:/Windows/Fonts/arial.ttf';
const sel = "select='isnan(prev_selected_t)+gte(t-prev_selected_t\\,1.999)'";
const label = `drawtext=fontfile='${font}':text='%{pts\\:hms}':x=6:y=6:fontsize=${portrait ? 22 : 20}:fontcolor=yellow:box=1:boxcolor=black@0.6`;
let durS = 0;
try { execFileSync(FFMPEG, ['-hide_banner', '-i', video], { stdio: 'pipe' }); } catch (e) {
  const m = String(e.stderr).match(/Duration: (\d+):(\d+):([\d.]+)/); durS = +m[1] * 3600 + +m[2] * 60 + +m[3];
}
const n = Math.ceil(durS / 2);
const rows = Math.ceil(n / cols);
execFileSync(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-y', '-i', video, '-vf',
  `${sel},scale=${tw}:${th},${label},tile=${cols}x${rows}:padding=4:color=0x202020`, '-frames:v', '1', '-update', '1', out], { stdio: 'inherit' });
if (full) {
  fs.mkdirSync(full, { recursive: true });
  execFileSync(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-y', '-i', video, '-vf', sel, '-fps_mode', 'vfr', `${full}/f%03d.png`], { stdio: 'inherit' });
}
console.log('wrote', out, n, 'frames');
