// T043: summarises axe-before/ and axe-after/ (written by client/e2e/a11y/axe-session.spec.ts)
// into axe-summary.md: violating nodes by impact for each configuration, the distinct rules, and
// the interactive elements under 44 x 44 CSS px.   node orchestration/evidence/T043/summarize.mjs
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const ids = ['en-default', 'en-contrast', 'en-text200', 'ar-default', 'ar-contrast', 'ar-text200'];
const load = (phase, id) => {
  const f = join(here, `axe-${phase}`, `${id}.json`);
  return existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : null;
};
const impacts = ['critical', 'serious', 'moderate', 'minor'];

let md = '# axe-core report, before and after (violating nodes by impact)\n\n';
md += 'Nodes are counted per screen, so the same element on two screens counts twice. "n/a" = that run could not complete (see README).\n\n';
md += '| Configuration | Phase | Screens | critical | serious | moderate | minor | targets < 44 px |\n|---|---|---|---|---|---|---|---|\n';
const rules = { before: new Map(), after: new Map() };
for (const id of ids) {
  for (const phase of ['before', 'after']) {
    const d = load(phase, id);
    if (!d) {
      md += `| ${id} | ${phase} | n/a | n/a | n/a | n/a | n/a | n/a |\n`;
      continue;
    }
    const small = d.smallTargets ? d.smallTargets.filter((s) => s.screen !== 'minigame-play').length : 'not measured';
    md += `| ${id} | ${phase} | ${d.screens.length} | ${impacts.map((i) => d.nodesByImpact[i] ?? 0).join(' | ')} | ${small} |\n`;
    for (const f of d.findings) {
      const key = `${f.rule} (${f.impact})`;
      const m = rules[phase];
      if (!m.has(key)) m.set(key, new Set());
      m.get(key).add(f.screen);
    }
  }
}
for (const phase of ['before', 'after']) {
  md += `\n## Distinct rules violated, ${phase}\n\n`;
  const m = rules[phase];
  if (m.size === 0) md += '_none_\n';
  for (const [k, v] of [...m.entries()].sort()) md += `- ${k}: ${[...v].slice(0, 8).join(', ')}${v.size > 8 ? ', …' : ''}\n`;
}
const after = ids.map((i) => load('after', i)).filter(Boolean);
const smalls = new Map();
for (const d of after) for (const s of d.smallTargets ?? []) smalls.set(`${s.target} ${s.w}x${s.h}`, s.screen);
md += '\n## Targets under 44 x 44 CSS px, after\n\n';
md += smalls.size ? [...smalls].map(([k, v]) => `- ${k} (first seen on ${v})`).join('\n') + '\n' : '_none outside the minigame play surface_\n';
writeFileSync(join(here, 'axe-summary.md'), md);
console.log(md);
