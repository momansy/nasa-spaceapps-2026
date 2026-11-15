// Validates the four .srt files: numbering, time format, no overlaps, cue length, line limits,
// within the video length. Exit code 1 on any problem.
//   node submission/video/subtitles/validate-srt.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const LENGTH = { '2min': 120, '30s': 30 }; // seconds, checked with ffmpeg
const MAX_LINE = 44;
const toSec = (h, m, s, ms) => +h * 3600 + +m * 60 + +s + +ms / 1000;
let bad = 0;
const fail = (f, msg) => { bad++; console.log(`FAIL ${f}: ${msg}`); };

const counts = {};
for (const cut of Object.keys(LENGTH)) {
  for (const lang of ['en', 'ar']) {
    const f = `missionforge-demo-${cut}.${lang}.srt`;
    const text = fs.readFileSync(path.join(here, f), 'utf8');
    if (text.includes('\r')) fail(f, 'contains CR characters');
    const blocks = text.trimEnd().split(/\n\n/);
    let prevEnd = -1;
    blocks.forEach((b, i) => {
      const lines = b.split('\n');
      if (lines[0] !== String(i + 1)) fail(f, `cue ${i + 1}: number is "${lines[0]}"`);
      const m = /^(\d\d):(\d\d):(\d\d),(\d{3}) --> (\d\d):(\d\d):(\d\d),(\d{3})$/.exec(lines[1] ?? '');
      if (!m) { fail(f, `cue ${i + 1}: bad time line "${lines[1]}"`); return; }
      const a = toSec(...m.slice(1, 5));
      const z = toSec(...m.slice(5, 9));
      const len = z - a;
      if (len < 1 - 1e-6 || len > 7 + 1e-6) fail(f, `cue ${i + 1}: ${len.toFixed(2)} s long (want 1-7 s)`);
      if (a < prevEnd) fail(f, `cue ${i + 1}: starts ${a} before previous end ${prevEnd}`);
      if (z > LENGTH[cut]) fail(f, `cue ${i + 1}: ends after the video`);
      prevEnd = z;
      const body = lines.slice(2);
      if (body.length < 1 || body.length > 2) fail(f, `cue ${i + 1}: ${body.length} text lines`);
      for (const l of body) if (!l.trim() || [...l.replace(/\u200e/g, '')].length > MAX_LINE) fail(f, `cue ${i + 1}: line "${l}" is ${[...l.replace(/\u200e/g, '')].length} chars`);
    });
    counts[f] = blocks.length;
  }
}
for (const cut of Object.keys(LENGTH)) {
  if (counts[`missionforge-demo-${cut}.en.srt`] !== counts[`missionforge-demo-${cut}.ar.srt`]) {
    fail(cut, 'en and ar have a different number of cues');
  }
  const [en, ar] = ['en', 'ar'].map((l) => fs.readFileSync(path.join(here, `missionforge-demo-${cut}.${l}.srt`), 'utf8').split(/\n\n/).map((b) => b.split('\n')[1]));
  if (en.join('|') !== ar.join('|')) fail(cut, 'en and ar cue timings differ');
}
console.log(bad ? `${bad} problem(s)` : `OK: ${Object.entries(counts).map(([f, n]) => `${f} (${n} cues)`).join(', ')}`);
process.exit(bad ? 1 : 0);
