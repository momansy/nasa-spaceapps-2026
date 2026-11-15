// Static file handler for the hosted deployment (HOSTING.md): serves the repository's docs/ folder
// (entry page, phone client, Unity WebGL host) from the same origin as the room server, so the phone
// client's same-origin `/ws` default and the entry page's `?server=` link need no baked-in URL.
import { createReadStream, existsSync, openSync, readSync, closeSync, statSync, type Stats } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { extname, join, normalize, sep } from 'node:path';

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
  '.wasm': 'application/wasm',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
};

/**
 * Content type for a file name. Unity's compressed build files are `<name>.<kind>.unityweb`: the
 * type comes from the inner extension and the caller adds `Content-Encoding: gzip` (same rule as
 * tools/demo/net-utils.mjs and netlify.toml).
 */
export function mimeFor(file: string): string {
  const lower = file.toLowerCase();
  if (lower.endsWith('.unityweb')) {
    const inner = lower.slice(0, -'.unityweb'.length);
    if (inner.endsWith('.wasm')) return 'application/wasm';
    if (inner.endsWith('.js')) return 'application/javascript';
    return 'application/octet-stream';
  }
  return TYPES[extname(lower)] ?? 'application/octet-stream';
}

/** Resolve a URL path inside `root`; null for anything that escapes it or is malformed. */
export function safeResolve(root: string, urlPath: string): string | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(urlPath);
  } catch {
    return null;
  }
  if (decoded.includes('\0')) return null;
  const base = normalize(root);
  const full = normalize(join(base, decoded));
  return full === base || full.startsWith(base.endsWith(sep) ? base : base + sep) ? full : null;
}

/** Vite's content-hashed bundles may be cached for a year; everything else revalidates. */
export function cacheControlFor(urlPath: string): string {
  return urlPath.startsWith('/play/client/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache';
}

const gzipCache = new Map<string, boolean>();
function looksGzipped(file: string): boolean {
  let known = gzipCache.get(file);
  if (known === undefined) {
    const fd = openSync(file, 'r');
    const b = Buffer.alloc(2);
    readSync(fd, b, 0, 2, 0);
    closeSync(fd);
    known = b[0] === 0x1f && b[1] === 0x8b;
    gzipCache.set(file, known);
  }
  return known;
}

const BASE_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
};

function plain(res: ServerResponse, status: number, body: string, extra: Record<string, string> = {}): void {
  res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-cache', ...BASE_HEADERS, ...extra });
  res.end(body);
}

export interface StaticSiteOptions {
  /** Absolute path of the folder to serve (the repository's docs/). */
  root: string;
  /** Body of GET /healthz (JSON-serialised). */
  health: () => Record<string, unknown>;
}

/** Request handler: GET/HEAD for files under `root`, `/` redirects to `/play/`, `/healthz` for the platform's health check. */
export function createStaticHandler(opts: StaticSiteOptions): (req: IncomingMessage, res: ServerResponse) => void {
  return (req, res) => {
    const url = new URL(req.url ?? '/', 'http://x');
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      plain(res, 405, 'Method not allowed', { Allow: 'GET, HEAD' });
      return;
    }
    if (url.pathname === '/healthz') {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...BASE_HEADERS });
      res.end(req.method === 'HEAD' ? undefined : JSON.stringify({ ok: true, ...opts.health() }));
      return;
    }
    if (url.pathname === '/') {
      res.writeHead(302, { Location: '/play/' + url.search, 'Cache-Control': 'no-cache', ...BASE_HEADERS });
      res.end();
      return;
    }
    let file = safeResolve(opts.root, url.pathname);
    if (!file || !existsSync(file)) {
      plain(res, 404, 'Not found');
      return;
    }
    let st: Stats = statSync(file);
    if (st.isDirectory()) {
      if (!url.pathname.endsWith('/')) {
        // Relative links (client/, host/Build/...) need the trailing slash.
        res.writeHead(301, { Location: url.pathname + '/' + url.search, 'Cache-Control': 'no-cache', ...BASE_HEADERS });
        res.end();
        return;
      }
      file = join(file, 'index.html');
      if (!existsSync(file)) {
        plain(res, 404, 'Not found');
        return;
      }
      st = statSync(file);
    }
    const lastModified = st.mtime.toUTCString();
    const headers: Record<string, string | number> = {
      'Content-Type': mimeFor(file),
      'Cache-Control': cacheControlFor(url.pathname),
      'Last-Modified': lastModified,
      ...BASE_HEADERS,
    };
    if (file.toLowerCase().endsWith('.unityweb') && looksGzipped(file)) headers['Content-Encoding'] = 'gzip';
    const since = req.headers['if-modified-since'];
    if (since && Date.parse(since) >= Math.floor(st.mtimeMs / 1000) * 1000) {
      res.writeHead(304, headers);
      res.end();
      return;
    }
    headers['Content-Length'] = st.size;
    res.writeHead(200, headers);
    if (req.method === 'HEAD') {
      res.end();
      return;
    }
    const stream = createReadStream(file);
    stream.on('error', () => res.destroy());
    stream.pipe(res);
  };
}
