// T043 step 2: WCAG 2.2 contrast of the phone theme tokens, default and high-contrast modes.
// Reads client/src/theme/tokens.css (so it always matches the shipped values), resolves the
// high-contrast overrides, and checks the text / essential-UI pairs the screens actually use.
//   node orchestration/evidence/T043/contrast.mjs            -> prints a Markdown table
//   node orchestration/evidence/T043/contrast.mjs --out f.md -> also writes it
// Thresholds: 4.5:1 body text, 3:1 large text (>= 24 px, or >= 18.66 px bold) and UI components.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(join(here, '../../../client/src/theme/tokens.css'), 'utf8');

function block(selector) {
  const i = css.indexOf(selector + ' {');
  if (i < 0) throw new Error('missing ' + selector);
  return css.slice(i, css.indexOf('\n}', i));
}
function vars(text) {
  const out = {};
  for (const m of text.matchAll(/--([\w-]+):\s*([^;]+);/g)) out[m[1]] = m[2].trim();
  return out;
}
const base = vars(block(':root'));
const high = { ...base, ...vars(block(":root[data-contrast='high']")) };

function parse(c) {
  c = c.trim();
  let m = c.match(/^#([0-9a-f]{6})$/i);
  if (m) return { r: parseInt(m[1].slice(0, 2), 16), g: parseInt(m[1].slice(2, 4), 16), b: parseInt(m[1].slice(4), 16), a: 1 };
  m = c.match(/^rgba?\(([^)]+)\)$/);
  if (m) {
    const p = m[1].split(',').map((x) => parseFloat(x));
    return { r: p[0], g: p[1], b: p[2], a: p[3] ?? 1 };
  }
  if (c === 'transparent') return { r: 0, g: 0, b: 0, a: 0 };
  throw new Error('colour ' + c);
}
const over = (fg, bg) => ({ r: fg.r * fg.a + bg.r * (1 - fg.a), g: fg.g * fg.a + bg.g * (1 - fg.a), b: fg.b * fg.a + bg.b * (1 - fg.a), a: 1 });
const lin = (v) => {
  v /= 255;
  return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};
const lum = (c) => 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b);
const ratio = (a, b) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

// Surfaces text sits on. Glass is a translucent navy over the backdrop: worst case a bright
// cloud (#ffffff) behind it, plus the normal case (bg-0).
function surfaces(v) {
  const g = (name) => parse(v[name]);
  const bg0 = g('bg-0');
  const white = { r: 255, g: 255, b: 255, a: 1 };
  const glassFlat = parse(v['glass-flat']);
  return {
    'bg-0': bg0,
    'bg-1': g('bg-1'),
    'bg-2': g('bg-2'),
    'bg-3': g('bg-3'),
    'glass-flat on bg-0': over(glassFlat, bg0),
    'glass-flat on bright cloud': over(glassFlat, white),
    'glass-deep on bright cloud': over(parse(v['glass-deep']), white),
  };
}

// [label, foreground var or literal, surface name list, threshold, kind]
const TEXT = 4.5;
const UI = 3;
const pairs = [
  ['body text', 'text', ['bg-0', 'bg-2', 'bg-3', 'glass-flat on bg-0', 'glass-flat on bright cloud'], TEXT],
  ['secondary text', 'text-dim', ['bg-0', 'bg-2', 'bg-3', 'glass-flat on bg-0', 'glass-flat on bright cloud'], TEXT],
  ['faint text', 'text-faint', ['bg-0', 'bg-2', 'bg-3', 'glass-flat on bg-0', 'glass-flat on bright cloud'], TEXT],
  ['accent text / focus ring', 'accent', ['bg-0', 'bg-2', 'bg-3', 'glass-flat on bright cloud'], TEXT],
  ['accent-strong text / focus ring', 'accent-strong', ['bg-0', 'bg-2', 'bg-3'], TEXT],
  ['good text', 'good', ['bg-0', 'bg-2', 'bg-3'], TEXT],
  ['warn text', 'warn', ['bg-0', 'bg-2', 'bg-3'], TEXT],
  ['bad text', 'bad', ['bg-0', 'bg-2', 'bg-3'], TEXT],
  ['neutral text', 'neutral', ['bg-0', 'bg-2', 'bg-3'], TEXT],
  ['tier bronze', 'tier-bronze', ['bg-0', 'bg-2'], TEXT],
  ['tier none', 'tier-none', ['bg-0', 'bg-2'], TEXT],
  ['celebrate / tier gold', 'celebrate', ['bg-0', 'bg-2'], TEXT],
  // Filled buttons and chips: ink on its own fill.
  ['accent-ink on accent (primary button)', 'accent-ink', ['@accent'], TEXT],
  ['good-ink on good (chip)', 'good-ink', ['@good'], TEXT],
  ['warn-ink on warn (chip)', 'warn-ink', ['@warn'], TEXT],
  ['bad-ink on bad (chip)', 'bad-ink', ['@bad'], TEXT],
  // Essential UI components (3:1): control outlines, focus ring, status shapes.
  ['control outline (line-strong)', 'line-strong', ['bg-0', 'bg-2', 'bg-3'], UI],
  ['hairline (line) on bg-2 [decorative, not essential]', 'line', ['bg-2'], 0],
  ['focus ring (accent-strong)', 'accent-strong', ['bg-0', 'bg-2', 'bg-3'], UI],
  ['status icon good', 'good', ['bg-2'], UI],
  ['status icon warn', 'warn', ['bg-2'], UI],
  ['status icon bad', 'bad', ['bg-2'], UI],
];

const rows = [];
let failures = 0;
for (const [mode, v] of [['default', base], ['high-contrast', high]]) {
  const surf = surfaces(v);
  for (const [label, fgName, surfNames, need] of pairs) {
    for (const sn of surfNames) {
      const fg = parse(v[fgName]);
      const bg = sn.startsWith('@') ? parse(v[sn.slice(1)]) : surf[sn];
      const fgOver = over(fg, bg);
      const r = ratio(fgOver, bg);
      const pass = need === 0 ? null : r >= need;
      if (pass === false) failures++;
      rows.push({ mode, label, fg: `${fgName} ${v[fgName]}`, bg: sn.startsWith('@') ? `fill ${sn.slice(1)}` : sn, ratio: r, need, pass });
    }
  }
}

const fmt = (r) => r.ratio.toFixed(2) + ':1';
let md = '# Contrast table (WCAG 2.2 AA), generated by contrast.mjs from client/src/theme/tokens.css\n\n';
md += `Pairs checked: ${rows.length}. Failures: ${failures}.\n\n| Mode | Pair | Foreground | Surface | Ratio | Needs | Result |\n|---|---|---|---|---|---|---|\n`;
for (const r of rows) md += `| ${r.mode} | ${r.label} | ${r.fg} | ${r.bg} | ${fmt(r)} | ${r.need ? r.need + ':1' : 'n/a'} | ${r.pass === null ? 'info' : r.pass ? 'pass' : '**FAIL**'} |\n`;
console.log(md);
const out = process.argv.indexOf('--out');
if (out > 0) writeFileSync(process.argv[out + 1], md);
process.exitCode = failures ? 1 : 0;
