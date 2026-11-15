import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { cacheControlFor, createStaticHandler, mimeFor, safeResolve } from './staticSite.js';

describe('static site helpers', () => {
  it('types Unity .unityweb files by their inner extension', () => {
    expect(mimeFor('host.wasm.unityweb')).toBe('application/wasm');
    expect(mimeFor('host.framework.js.unityweb')).toBe('application/javascript');
    expect(mimeFor('host.data.unityweb')).toBe('application/octet-stream');
    expect(mimeFor('index.html')).toBe('text/html; charset=utf-8');
  });

  it('refuses paths that escape the root', () => {
    const root = join(tmpdir(), 'mf-root');
    expect(safeResolve(root, '/play/index.html')).toBe(join(root, 'play', 'index.html'));
    expect(safeResolve(root, '/../outside')).toBeNull();
    expect(safeResolve(root, '/%2e%2e/outside')).toBeNull();
    expect(safeResolve(root, '/%E0%A4%A')).toBeNull();
    expect(safeResolve(root, '/a%00b')).toBeNull();
  });

  it('caches only hashed client bundles for long', () => {
    expect(cacheControlFor('/play/client/assets/index-abc.js')).toContain('immutable');
    expect(cacheControlFor('/play/host/Build/host.data.unityweb')).toBe('no-cache');
  });
});

describe('static site handler', () => {
  let dir: string;
  let server: Server;
  let base: string;

  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), 'mf-static-'));
    mkdirSync(join(dir, 'play', 'host', 'Build'), { recursive: true });
    writeFileSync(join(dir, 'play', 'index.html'), '<h1>play</h1>');
    writeFileSync(join(dir, 'play', 'host', 'Build', 'host.wasm.unityweb'), gzipSync(Buffer.from('wasm')));
    server = createServer(createStaticHandler({ root: dir, health: () => ({ commit: 'abc' }) }));
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await new Promise<void>((r) => server.close(() => r()));
    rmSync(dir, { recursive: true, force: true });
  });

  it('answers the health check', async () => {
    const res = await fetch(`${base}/healthz`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, commit: 'abc' });
  });

  it('redirects / to /play/ and a directory to its trailing slash', async () => {
    const root = await fetch(`${base}/?room=ABCD`, { redirect: 'manual' });
    expect(root.status).toBe(302);
    expect(root.headers.get('location')).toBe('/play/?room=ABCD');
    const play = await fetch(`${base}/play`, { redirect: 'manual' });
    expect(play.status).toBe(301);
    expect(play.headers.get('location')).toBe('/play/');
    const page = await fetch(`${base}/play/`);
    expect(await page.text()).toBe('<h1>play</h1>');
  });

  it('sends gzip Unity files with Content-Encoding: gzip', async () => {
    const res = await fetch(`${base}/play/host/Build/host.wasm.unityweb`, { method: 'HEAD' });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-encoding')).toBe('gzip');
    expect(res.headers.get('content-type')).toBe('application/wasm');
  });

  it('returns 404 for missing files and 405 for other methods', async () => {
    expect((await fetch(`${base}/play/nope.html`)).status).toBe(404);
    expect((await fetch(`${base}/play/`, { method: 'POST' })).status).toBe(405);
  });
});
