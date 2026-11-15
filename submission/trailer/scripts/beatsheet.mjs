// Prints the beat sheet of a cut as a Markdown table (used for README.md) and the share of real gameplay shots.
//   node beatsheet.mjs 16x9|9x16
import path from 'node:path';
import { CUTS, ROOT } from './timeline.mjs';

const cut = CUTS[process.argv[2] ?? '16x9'];
const rel = (f) => (f.startsWith(ROOT) ? f.slice(ROOT.length + 1) : `%TEMP%/demo-video/rec/${path.basename(f)}`)
  .replace('orchestration/evidence/', 'evidence/').replace('assets/media/trailer-captures/', 'T054 capture ');
let t = 0;
const rows = [];
const kinds = { host: 0, phone: 0, ai: 0, card: 0 };
for (const [i, s] of cut.shots.entries()) {
  const d = s.b * 0.5;
  const src = s.src;
  let kind, what;
  if (src.phones) {
    kind = 'Phone';
    what = src.phones.map((p) => `${rel(p.file)} @ ${p.ss}s${p.speed !== 1 ? ` x${p.speed}` : ''}${p.tag ? ` (${p.tag})` : ''}`).join('; ');
  } else {
    const f = src.still ?? src.video;
    kind = s.ov?.end ? 'End card' : /assets\/media\/(key-art|style|cinematics|trailer-ai)/.test(f) ? 'AI' : 'Host';
    what = `${rel(f)}${src.video ? ` @ ${src.ss}s${src.speed ? ` x${src.speed}` : ''}${src.ramp ? ` ramp x${src.ramp[0]}→x${src.ramp[1]}` : ''}` : ''}`;
  }
  if (kind === 'Phone') kinds.phone++; else if (kind === 'Host') kinds.host++; else if (kind === 'AI') kinds.ai++; else kinds.card++;
  const text = [...(s.ov?.words ?? []).map((w) => w.w.toUpperCase()), s.ov?.title ? 'MissionForge title' : '', s.ov?.end ? 'URL, QR, credits line' : '']
    .filter(Boolean).join(' / ');
  const labels = [s.ov?.host ?? '', s.ov?.ai ? 'AI-generated' : '', s.ov?.demo ? 'Scripted demo session' : ''].filter(Boolean).join(', ');
  rows.push(`| ${i + 1} | ${t.toFixed(1)}-${(t + d).toFixed(1)} | ${s.tr ?? 'cut'} | ${kind} | ${what} | ${text} | ${labels} |`);
  t += d;
}
console.log('| # | Time (s) | In | Kind | Source | Text on screen | Corner label |\n|---|---|---|---|---|---|---|');
console.log(rows.join('\n'));
const n = cut.shots.length;
console.log(`\n${n} shots: ${kinds.host} host + ${kinds.phone} phone = ${kinds.host + kinds.phone} real gameplay (${Math.round((100 * (kinds.host + kinds.phone)) / n)} %), ${kinds.ai} AI mood shots, ${kinds.card} end card.`);
