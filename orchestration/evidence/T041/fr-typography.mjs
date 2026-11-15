// T041 step 1: French typography. Idempotent. Usage: node fr-typography.mjs
// - U+00A0 before ":" ; U+202F before ";" "!" "?" ; U+202F inside « » ; English source titles (".source" keys) untouched.
import fs from 'node:fs';
const NB = ' ', NN = ' ';
const fix = (s) => {
  // keep placeholders safe by operating around them
  return s
    .replace(/(\S|^)[   ]*:(?=[  ]|$)/g, (m, p) => (p === '' ? m : p + NB + ':'))
    .replace(/(\S)[   ]*([;!?])(?![A-Za-z0-9\/=&])/g, (m, p, c) => p + NN + c)
    .replace(/«[   ]*/g, '«' + NN)
    .replace(/[   ]*»/g, NN + '»');
};
let changed = 0;
for (const d of ['data/strings', 'client/src/i18n/strings'])
  for (const f of fs.readdirSync(d)) {
    if (!f.startsWith('fr.')) continue;
    const p = `${d}/${f}`;
    const o = JSON.parse(fs.readFileSync(p, 'utf8'));
    for (const k of Object.keys(o)) {
      if (typeof o[k] !== 'string' || k.endsWith('.source')) continue;
      const n = fix(o[k]);
      if (n !== o[k]) { o[k] = n; changed++; }
    }
    fs.writeFileSync(p, JSON.stringify(o, null, 2) + '\n');
  }
console.log('changed values', changed);
