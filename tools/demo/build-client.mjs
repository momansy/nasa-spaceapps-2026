// Builds the phone client and copies client/dist/ to docs/play/client/ (T029 step 2).
//   node tools/demo/build-client.mjs                          same-origin /ws (what the local demo serves)
//   MF_ROOM_SERVER_URL=wss://rooms.example.org/ws node tools/demo/build-client.mjs   hosted variant
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PATHS, capture, ensureDeps, run, walk } from './lib.mjs';

const MB = 1024 * 1024;
const MAX_FILE_BYTES = 50 * MB;

export function buildClient({ install = true } = {}) {
  const roomServerUrl = process.env.MF_ROOM_SERVER_URL || '';
  if (install) ensureDeps(PATHS.client);
  // An inherited VITE_ROOM_SERVER_URL must not leak into the same-origin build.
  const env = { VITE_ROOM_SERVER_URL: roomServerUrl };
  run('npm run build', PATHS.client, env);

  const dist = join(PATHS.client, 'dist');
  if (!existsSync(join(dist, 'index.html'))) throw new Error('client/dist/index.html missing after build');
  rmSync(PATHS.playClient, { recursive: true, force: true });
  mkdirSync(PATHS.playClient, { recursive: true });
  cpSync(dist, PATHS.playClient, { recursive: true });

  const files = walk(PATHS.playClient);
  const biggest = files.reduce((a, b) => (b.size > a.size ? b : a));
  if (biggest.size >= MAX_FILE_BYTES) throw new Error(`File over 50 MB: ${biggest.path}`);
  const total = files.reduce((n, f) => n + f.size, 0);

  const info = {
    commit: capture('git rev-parse HEAD') || 'unknown',
    dirty: capture('git status --porcelain -- client protocol data') !== '',
    builtAt: new Date().toISOString(),
    node: process.version,
    roomServerUrlSet: Boolean(roomServerUrl),
    roomServerUrl: roomServerUrl || null,
    transport: roomServerUrl ? 'fixed room-server URL' : 'same-origin /ws',
    files: files.length,
    totalBytes: total,
  };
  writeFileSync(join(PATHS.playClient, 'BUILD_INFO.json'), JSON.stringify(info, null, 2) + '\n');
  console.log(
    `docs/play/client/: ${files.length} files, ${(total / MB).toFixed(2)} MB total, ` +
      `largest ${(biggest.size / MB).toFixed(2)} MB (${biggest.path.slice(PATHS.playClient.length + 1)}), ` +
      `transport: ${info.transport}`,
  );
  return info;
}

import { fileURLToPath } from 'node:url';
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    buildClient();
  } catch (e) {
    console.error(String(e.message || e));
    process.exit(1);
  }
}
