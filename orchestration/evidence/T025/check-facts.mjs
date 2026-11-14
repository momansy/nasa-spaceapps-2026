#!/usr/bin/env node
// T025 fact checks. Run from the repository root:  node orchestration/evidence/T025/check-facts.mjs
// Fails (exit 1) if any on-screen fact text (fact.<id>.text) has more than 25 whitespace-separated
// words, any fact with status "verified" lacks source_url, or any source_url is not https.
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const facts = JSON.parse(readFileSync(join(root, 'data', 'facts.json'), 'utf8')).facts;

// Merge every English fragment (data/strings/en*.json), as the validator and loaders do.
const stringsDir = join(root, 'data', 'strings');
const strings = {};
for (const f of readdirSync(stringsDir).filter((n) => /^en(\..+)?\.json$/.test(n))) {
  Object.assign(strings, JSON.parse(readFileSync(join(stringsDir, f), 'utf8')));
}

const MAX_WORDS = 25;
const errors = [];
const counts = { verified: 0, unverified: 0, rejected: 0 };

for (const fact of facts) {
  counts[fact.status] = (counts[fact.status] ?? 0) + 1;
  const text = strings[fact.text_key];
  if (typeof text !== 'string') {
    errors.push(`${fact.id}: missing string ${fact.text_key}`);
  } else {
    const words = text.trim().split(/\s+/).length;
    if (words > MAX_WORDS) errors.push(`${fact.id}: on-screen text has ${words} words (max ${MAX_WORDS})`);
  }
  if (fact.status === 'verified' && !fact.source_url) errors.push(`${fact.id}: verified but no source_url`);
  if (fact.source_url !== undefined) {
    let url;
    try {
      url = new URL(fact.source_url);
    } catch {
      errors.push(`${fact.id}: source_url is not a valid URL`);
      continue;
    }
    if (url.protocol !== 'https:') errors.push(`${fact.id}: source_url is not https (${fact.source_url})`);
  }
}

console.log(`Facts checked: ${facts.length} (verified ${counts.verified}, unverified ${counts.unverified}, rejected ${counts.rejected})`);
if (errors.length) {
  for (const e of errors) console.log('ERROR ' + e);
  console.log(`RESULT: FAIL (${errors.length} errors)`);
  process.exit(1);
}
console.log('RESULT: PASS (0 errors)');
