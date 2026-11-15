// Structural checker for a translated language. Usage: node check-lang.mjs hi [fileFragment...]
// Reports: missing/extra keys, placeholder mismatches, non-Western digits, empty text, strings that
// should be translated but have no letters of the target script, fact words > 25 (hi only).
import fs from 'node:fs';
const lang = process.argv[2];
const only = process.argv.slice(3);
const dirs = ['data/strings', 'client/src/i18n/strings'];
const ph = (s) => (s.match(/\{[a-z][A-Za-z0-9_]*\}/g) ?? []).sort().join(',');
const script = lang === 'hi' ? /[ऀ-ॿ]/ : null;
let bad = 0;
for (const d of dirs) for (const f of fs.readdirSync(d)) {
  if (!f.startsWith('en.')) continue;
  const frag = f.slice(3);
  if (only.length && !only.some((o) => frag.startsWith(o))) continue;
  const en = JSON.parse(fs.readFileSync(`${d}/${f}`, 'utf8'));
  const tp = `${d}/${lang}.${frag}`;
  if (!fs.existsSync(tp)) { console.log('MISSING FILE', tp); bad++; continue; }
  const tr = JSON.parse(fs.readFileSync(tp, 'utf8'));
  const err = (m) => { console.log(`${tp}: ${m}`); bad++; };
  for (const k of Object.keys(en)) if (!(k in tr)) err(`missing ${k}`);
  for (const k of Object.keys(tr)) if (!(k in en)) err(`extra ${k}`);
  for (const [k, v] of Object.entries(tr)) {
    if (typeof v !== 'string') continue;
    if (!v.trim()) err(`empty ${k}`);
    if (k in en && ph(en[k]) !== ph(v)) err(`placeholders ${k}: ${ph(en[k])} vs ${ph(v)}`);
    if (/[٠-٩۰-۹०-९]/.test(v)) err(`non-Western digit ${k}`);
    if (k.startsWith('fact.') && k.endsWith('.source') && v !== en[k]) err(`source changed ${k}`);
    if (script && !k.endsWith('.twin') && !k.includes('.unit.') && !(k.startsWith('fact.') && k.endsWith('.source')) && k in en && /[A-Za-z]{4,}/.test(en[k].replace(/\{[^}]*\}/g, '')) && !script.test(v)) err(`untranslated? ${k}: ${v.slice(0, 60)}`);
    if (lang === 'hi' && /^fact\.F\d+\.text$/.test(k) && v.trim().split(/\s+/).length > 25) err(`fact over 25 words ${k}`);
  }
}
console.log(bad ? `${bad} problem(s)` : 'OK');
process.exit(bad ? 1 : 0);
