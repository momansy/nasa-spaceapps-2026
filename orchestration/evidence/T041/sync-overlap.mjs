// T041 steps 1-3: 18 keys exist in both data/strings and client/src/i18n/strings; the data copy wins at
// runtime, so the shadowed client copy is set equal to it (one wording per key). Idempotent.
import fs from 'node:fs';
const langs = process.argv.slice(2);
for (const l of langs) {
  const data = {};
  for (const f of fs.readdirSync('data/strings')) if (f.startsWith(l + '.')) Object.assign(data, JSON.parse(fs.readFileSync('data/strings/' + f, 'utf8')));
  let n = 0;
  for (const f of fs.readdirSync('client/src/i18n/strings')) {
    if (!f.startsWith(l + '.')) continue;
    const p = 'client/src/i18n/strings/' + f;
    const o = JSON.parse(fs.readFileSync(p, 'utf8'));
    for (const k of Object.keys(o)) if (k in data && o[k] !== data[k]) { o[k] = data[k]; n++; }
    fs.writeFileSync(p, JSON.stringify(o, null, 2) + '\n');
  }
  console.log(l, 'synced', n);
}
