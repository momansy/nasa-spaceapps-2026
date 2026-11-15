// Crossfade-timing check for T049 (scene boundaries in the finished MP4s vs the timeline computed from scenes.mjs).
// Usage: node timeline-check.mjs <dir holding 2min.raw and 30s.raw>
// Raw files: ffmpeg -i missionforge-demo-<cut>.mp4 -an -vf "fps=30,scale=64:36,format=gray" -f rawvideo <dir>/<cut>.raw
import fs from 'node:fs';
import { CUTS } from '../../../submission/video/scripts/scenes.mjs';
import { timeline } from '../../../submission/video/subtitles/build-srt.mjs';
const W = 64, H = 36, FPS = 30;
for (const cut of ['2min', '30s']) {
  const buf = fs.readFileSync(`${process.argv[2] ?? '/tmp/t049-tools'}/${cut}.raw`);
  const n = buf.length / (W * H);
  const fr = (i) => buf.subarray(i * W * H, (i + 1) * W * H);
  const dist = (a, b) => { let s = 0; for (let k = 0; k < a.length; k++) s += Math.abs(a[k] - b[k]); return s / a.length; };
  const { scenes } = CUTS[cut];
  const { starts, total } = timeline(scenes);
  console.log(cut, 'frames', n, 'seconds', n / FPS, 'predicted total', total);
  const errs = [];
  for (let i = 1; i < scenes.length; i++) {
    const a = Math.round(starts[i] * FPS), z = a + Math.round(0.5 * FPS);
    const A = fr(a - 1), Z = fr(z + 1);
    if (dist(A, Z) < 3) { console.log(' boundary', i, 'scenes too similar, skipped'); continue; }
    let best = null;
    for (let f = a - 12; f <= z + 12; f++) {
      const da = dist(fr(f), A), dz = dist(fr(f), Z);
      const r = da / (da + dz);
      if (!best || Math.abs(r - 0.5) < best.e) best = { e: Math.abs(r - 0.5), f };
    }
    const mid = best.f / FPS, pred = starts[i] + 0.25;
    errs.push(mid - pred);
    console.log(' boundary', i, 'predicted mid', pred.toFixed(2), 'measured', mid.toFixed(2), 'err', (mid - pred).toFixed(2));
  }
  console.log(' max |err|', Math.max(...errs.map(Math.abs)).toFixed(2));
}
