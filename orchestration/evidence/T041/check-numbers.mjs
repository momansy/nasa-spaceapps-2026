// Compares the numbers in each translated string with the English one (a translation must not change a figure).
import fs from 'node:fs';
const lang = process.argv[2];
const nums = (s) => (s.replace(/\{[^}]*\}/g, '').match(/\d+(?:[.,]\d+)*/g) ?? []).map((x) => x.replace(/,(?=\d{3}\b)/g, '').replace(',', '.')).sort().join(' ');
let bad = 0;
for (const d of ['data/strings', 'client/src/i18n/strings']) for (const f of fs.readdirSync(d)) {
  if (!f.startsWith('en.')) continue;
  const en = JSON.parse(fs.readFileSync(`${d}/${f}`, 'utf8'));
  const tr = JSON.parse(fs.readFileSync(`${d}/${lang}.${f.slice(3)}`, 'utf8'));
  for (const k of Object.keys(en)) if (typeof en[k] === 'string' && nums(en[k]) !== nums(tr[k] ?? '')) { bad++; console.log(`${lang}.${f.slice(3)} ${k}\n  en: ${en[k].slice(0, 110)}\n  ${lang}: ${(tr[k] ?? '').slice(0, 110)}`); }
}
console.log(bad, 'differences');
