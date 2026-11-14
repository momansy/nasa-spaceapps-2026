// Validates the Build Bay payload dump (PayloadDumpTests) against protocol/schema/<type>.schema.json.
// Usage (from a folder where ajv and ajv-formats are installed):
//   node validate-payloads.mjs <repo>/protocol/schema <temp>/mf-t015-payloads/payloads.jsonl
import fs from 'node:fs';
import path from 'node:path';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

const [schemaDir, file] = process.argv.slice(2);
const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);
const cache = new Map();
const validator = (type) => {
  if (!cache.has(type)) {
    const p = path.join(schemaDir, type + '.schema.json');
    cache.set(type, fs.existsSync(p) ? ajv.compile(JSON.parse(fs.readFileSync(p, 'utf8'))) : null);
  }
  return cache.get(type);
};
const counts = {};
let bad = 0;
for (const line of fs.readFileSync(file, 'utf8').split('\n').filter(Boolean)) {
  const { t, d } = JSON.parse(line);
  const v = validator(t);
  counts[t] = (counts[t] || 0) + 1;
  if (!v) { console.log('NO SCHEMA', t); bad++; continue; }
  if (!v(d)) {
    bad++;
    if (bad <= 12) console.log('INVALID', t, JSON.stringify(v.errors.slice(0, 3)));
  }
}
console.log(JSON.stringify({ counts, invalid: bad }));
process.exit(bad ? 1 : 0);
