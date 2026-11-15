// Writes the four subtitle files (2min/30s x en/ar) next to this script.
//   node submission/video/subtitles/build-srt.mjs
// Scene durations come from ../scripts/scenes.mjs (the file the videos were built from), so the
// cue timings follow the same timeline that build.mjs used: scene i starts at sum(d[0..i-1]) - 0.5*i
// because neighbouring scenes overlap by a 0.5 s crossfade (XF in build.mjs).
// Cue text = the on-screen headline and body text of each scene (see README, "Subtitles").
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CUTS } from '../scripts/scenes.mjs';
import { CUES } from './cues.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const XF = 0.5; // crossfade between scenes, seconds (build.mjs)
const GAP = 0.04; // s between consecutive cues, so cues never overlap
const MIN_CUE = 1.0; // s (minimum shown length)
const MAX_CUE = 7.0; // s
const FADE_IN = 0.6; // s, whole-video fade from black
const FADE_OUT = 1.0; // s, whole-video fade to black
export const MAX_LINE = 44; // characters ("about 42")

/**
 * Arabic cues: put a left-to-right mark around each number-with-unit ("550 km", "97.6°", "+$2.0 M") so that
 * every renderer keeps it as one left-to-right unit. Without it the digits and the unit split into separate
 * runs inside right-to-left text and "550 km" shows as "km 550".
 */
export function fixBidi(text) {
  if (!/[\u0600-\u06ff]/.test(text)) return text;
  const LRM = '\u200e';
  return text.replace(/\u200e/g, '').replace(/(?<![A-Za-z0-9])([+\u2212-]?\$?\d[\d.,]*(?:\u00b0|%)?(?: ?(?:kg|km|M|GB|m\/s|s)\b)?)/g, `${LRM}$1${LRM}`);
}

/** Greedy balanced wrap into at most two lines. Explicit "\n" in the cue text is kept. */
export function wrap(text) {
  if (text.includes('\n')) return text.split('\n');
  if (text.length <= MAX_LINE) return [text];
  const words = text.split(' ');
  let best = null;
  for (let i = 1; i < words.length; i++) {
    const a = words.slice(0, i).join(' ');
    const b = words.slice(i).join(' ');
    const cost = Math.max(a.length, b.length);
    if (!best || cost < best.cost) best = { cost, lines: [a, b] };
  }
  return best.lines;
}

const ts = (sec) => {
  const ms = Math.round(sec * 1000);
  const p = (n, w = 2) => String(n).padStart(w, '0');
  return `${p(Math.floor(ms / 3600000))}:${p(Math.floor(ms / 60000) % 60)}:${p(Math.floor(ms / 1000) % 60)},${p(ms % 1000, 3)}`;
};

/** Scene start times and the total length of a cut. */
export function timeline(scenes) {
  let t = 0;
  const starts = scenes.map((s) => { const r = t; t += s.d - XF; return r; });
  return { starts, total: t + XF };
}

/** Cue times: scene windows run from one crossfade midpoint to the next. */
export function schedule(cut, perScene, other = perScene) {
  const { scenes } = CUTS[cut];
  if (perScene.length !== scenes.length) throw new Error(`${cut}: ${perScene.length} cue groups for ${scenes.length} scenes`);
  const { starts, total } = timeline(scenes);
  const out = [];
  scenes.forEach((s, i) => {
    const a = i === 0 ? FADE_IN / 2 : starts[i] + XF / 2;
    const b = i === scenes.length - 1 ? total - FADE_OUT / 2 : starts[i] + s.d - XF / 2;
    const cues = perScene[i];
    if (!cues.length) return;
    const span = b - a - GAP;
    // weight = longer of the English and Arabic text, so neither language gets a cue that is too short to read
    const weights = cues.map((c, j) => Math.max(c.replace(/\n/g, ' ').length, (other[i][j] ?? '').replace(/\n/g, ' ').length, 12));
    const sum = weights.reduce((x, y) => x + y, 0);
    let len = weights.map((w) => (span * w) / sum);
    // lift very short cues to MIN_CUE and take the time from the long ones
    for (let k = 0; k < 4; k++) {
      const short = len.map((l) => l < MIN_CUE + GAP);
      const need = len.reduce((acc, l, j) => acc + (short[j] ? MIN_CUE + GAP - l : 0), 0);
      const room = len.reduce((acc, l, j) => acc + (short[j] ? 0 : l), 0);
      len = len.map((l, j) => (short[j] ? MIN_CUE + GAP : l - (need * l) / room));
    }
    let t = a;
    cues.forEach((text, j) => {
      const end = j === cues.length - 1 ? b - GAP : t + len[j] - GAP;
      out.push({ start: t, end, text, scene: i });
      t += len[j];
    });
  });
  return out.map((c, n) => ({ ...c, n: n + 1 }));
}

export function toSrt(cues) {
  return cues.map((c) => `${c.n}\n${ts(c.start)} --> ${ts(c.end)}\n${wrap(c.text).join('\n')}\n`).join('\n');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  for (const cut of Object.keys(CUTS)) {
    for (const lang of ['en', 'ar']) {
      // Arabic uses the English cue times (same number of cues per scene), so the two tracks stay in step.
      const timing = schedule(cut, CUES[cut].en, CUES[cut].ar);
      const texts = CUES[cut][lang].flat().map((t) => (lang === 'ar' ? fixBidi(t) : t));
      if (texts.length !== timing.length) throw new Error(`${cut}.${lang}: ${texts.length} cues, English has ${timing.length}`);
      const cues = timing.map((c, i) => ({ ...c, text: texts[i] }));
      for (const c of cues) {
        if (c.end - c.start < MIN_CUE - 0.001 || c.end - c.start > MAX_CUE) throw new Error(`${cut}.${lang} cue ${c.n} is ${(c.end - c.start).toFixed(2)} s long`);
      }
      const file = path.join(here, `missionforge-demo-${cut}.${lang}.srt`);
      fs.writeFileSync(file, toSrt(cues), 'utf8');
      console.log('wrote', path.relative(process.cwd(), file), cues.length, 'cues');
    }
  }
}
