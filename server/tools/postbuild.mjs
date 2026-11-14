// `protocol/ts/messages.ts` lives outside server/ and has no package.json of its own, so tsc emits it
// as CommonJS into dist/protocol/ts/. The server package is ESM ("type": "module"), which would make
// Node read that output as ESM and fail. Mark the emitted protocol folder as CommonJS; Node's ESM
// loader then still supports the named imports the server uses.
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist', 'protocol');
mkdirSync(dir, { recursive: true });
writeFileSync(path.join(dir, 'package.json'), '{ "type": "commonjs" }\n');
