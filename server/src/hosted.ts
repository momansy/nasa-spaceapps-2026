// Hosted entry point (HOSTING.md, `npm run start:hosted`): one HTTP server on PORT that serves the
// repository's docs/ folder (entry page, phone client, Unity WebGL host) and accepts the room
// server's WebSocket upgrades on the same port, so the whole game lives on one https:// origin.
import { existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createStaticHandler } from './hosting/staticSite.js';
import { startServer } from './wire/server.js';

/** The nearest ancestor `docs/` folder that holds `play/index.html` (works from src/ and dist/). */
function findDocsDir(): string {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (;;) {
    const candidate = join(dir, 'docs');
    if (existsSync(join(candidate, 'play', 'index.html'))) return candidate;
    const parent = dirname(dir);
    if (parent === dir) throw new Error('docs/play/index.html not found above the server; set DOCS_DIR');
    dir = parent;
  }
}

const port = Number(process.env.PORT ?? 8080);
const docsDir = process.env.DOCS_DIR ? resolve(process.env.DOCS_DIR) : findDocsDir();
// Render sets RENDER_EXTERNAL_URL (https://<service>.onrender.com); the lobby QR code points there.
const publicUrl = (process.env.PUBLIC_URL ?? process.env.RENDER_EXTERNAL_URL ?? `http://localhost:${port}`).replace(/\/+$/, '');
const clientBaseUrl = process.env.CLIENT_BASE_URL ?? `${publicUrl}/play/client/`;
const commit = process.env.RENDER_GIT_COMMIT ?? null;
const startedAt = new Date().toISOString();

const http = createServer(createStaticHandler({ root: docsDir, health: () => ({ commit, startedAt }) }));
const wss = startServer({ port, clientBaseUrl, httpServer: http });

http.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`MissionForge hosted: ${publicUrl}/play/ (static ${docsDir}, WebSocket on the same port ${port}, clientBaseUrl=${clientBaseUrl})`);
});

function shutdown(): void {
  wss.close();
  http.close(() => process.exit(0));
  http.closeAllConnections();
  setTimeout(() => process.exit(0), 5000).unref();
}
// A demo server must not drop every room because one timer callback or disconnect handler threw
// (Render restarts a crashed process, which loses all in-memory rooms). Log the stack for Render's
// logs and keep serving; per-message errors are already answered with an error frame in wire/server.ts.
process.on('uncaughtException', (err) => {
  // eslint-disable-next-line no-console
  console.error('[hosted] uncaught exception, kept running:', err);
});
process.on('unhandledRejection', (reason) => {
  // eslint-disable-next-line no-console
  console.error('[hosted] unhandled rejection, kept running:', reason);
});
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
