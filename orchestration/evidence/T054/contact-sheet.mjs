// node sheet.mjs <clipsDir> <out.jpg> — middle frame of each clip, labelled, 3 per row.
import { readdirSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import ff from 'ffmpeg-static';
const [dir, out] = process.argv.slice(2);
const clips = readdirSync(dir).filter((f) => f.endsWith('.mp4')).sort();
mkdirSync('sheet', { recursive: true });
const run = (args) => { const r = spawnSync(ff, ['-hide_banner', '-loglevel', 'error', '-y', ...args]); if (r.status) throw new Error(String(r.stderr)); };
const probe = (f) => { const r = spawnSync(ff, ['-hide_banner', '-i', f], { encoding: 'utf8' }); const m = r.stderr.match(/Duration: (\d+):(\d+):([\d.]+)/); return +m[1] * 3600 + +m[2] * 60 + +m[3]; };
clips.forEach((c, i) => {
  const d = probe(`${dir}/${c}`);
  const label = `${c.replace('.mp4', '')}  (${d.toFixed(1)} s)`.replace(/:/g, '\\:');
  run(['-ss', String(d / 2), '-i', `${dir}/${c}`, '-frames:v', '1', '-vf', `scale=640:360,drawbox=y=330:w=640:h=30:color=black@0.7:t=fill,drawtext=fontfile='C\\:/Windows/Fonts/arial.ttf':text='${label}':x=8:y=337:fontsize=18:fontcolor=white`, `sheet/${String(i).padStart(2, '0')}.jpg`]);
});
const cols = 3, rows = Math.ceil(clips.length / cols);
run(['-i', 'sheet/%02d.jpg', '-vf', `tile=${cols}x${rows}:padding=4:color=0x071522`, '-frames:v', '1', '-q:v', '3', out]);
console.log('sheet', clips.length, out);
