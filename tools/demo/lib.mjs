// Shared helpers for the MissionForge demo tools (T029). Node 20+, no dependencies.
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const PATHS = {
  repo: REPO,
  server: join(REPO, 'server'),
  client: join(REPO, 'client'),
  docs: join(REPO, 'docs'),
  playClient: join(REPO, 'docs', 'play', 'client'),
  serverEntry: join(REPO, 'server', 'dist', 'server', 'src', 'index.js'),
  schemaDir: join(REPO, 'protocol', 'schema'),
};

/** Run a shell command (works with npm.cmd on Windows and npm on macOS/Linux). Throws on failure. */
export function run(command, cwd, env = {}) {
  console.log(`> ${command}   (in ${cwd})`);
  const r = spawnSync(command, { cwd, shell: true, stdio: 'inherit', env: { ...process.env, ...env } });
  if (r.status !== 0) throw new Error(`Command failed (${r.status}): ${command}`);
}

/** stdout of a command, or '' when it fails (for example git outside a repository). */
export function capture(command, cwd = REPO) {
  const r = spawnSync(command, { cwd, shell: true, encoding: 'utf8' });
  return r.status === 0 ? r.stdout.trim() : '';
}

export function ensureDeps(dir) {
  if (!existsSync(join(dir, 'node_modules'))) run('npm ci', dir);
}

/** All files under dir with their sizes in bytes. */
export function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const s = statSync(p);
    if (s.isDirectory()) out.push(...walk(p));
    else out.push({ path: p, size: s.size });
  }
  return out;
}

export function flag(args, name, fallback) {
  const i = args.indexOf(name);
  if (i === -1) return fallback;
  const next = args[i + 1];
  return next === undefined || next.startsWith('--') ? true : next;
}
