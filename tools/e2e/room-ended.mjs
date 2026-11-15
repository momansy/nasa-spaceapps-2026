// T061 / D-110 regression: after the room is gone a phone must say "This room has ended." and offer Rejoin,
// not sit on "Connection lost. Reconnecting…" forever.
//   node room-ended.mjs [--docs-dir DIR] [--port 10010]
// Starts its own hosted server (server/dist/hosted.js; --docs-dir picks which docs/ folder, so a fresh phone build
// can be tested before it is committed), makes a room with the stub host, joins one real phone page, kills and
// restarts the server, and checks the phone. Writes screenshots + room-ended-result.json under the T061 evidence folder.
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { chromium } from '@playwright/test';
import { ScriptedHost } from './host/scripted-host.mjs';
import { PhoneDriver } from './lib/phone-driver.mjs';
import { repoDir, serverDir } from './lib/paths.mjs';

const argv = process.argv.slice(2);
const value = (n, f) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : f; };
const port = Number(value('--port', '10010'));
const docsDir = value('--docs-dir', null);
const origin = `http://127.0.0.1:${port}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const runDir = path.join(repoDir, 'orchestration', 'evidence', 'T061', 'room-ended', new Date().toISOString().replace(/[:.]/g, '-'));
fs.mkdirSync(runDir, { recursive: true });

function startServer() {
  const env = { ...process.env, PORT: String(port), NODE_ENV: 'production', RENDER_EXTERNAL_URL: origin };
  if (docsDir) env.DOCS_DIR = path.resolve(docsDir);
  const child = spawn(process.execPath, ['dist/server/src/hosted.js'], { cwd: serverDir, env, stdio: 'ignore' });
  return child;
}
async function waitUp() { for (let i = 0; i < 50; i += 1) { if (await fetch(`${origin}/play/client/`).then((r) => r.ok, () => false)) return; await sleep(200); } throw new Error('server did not come up'); }

const result = { origin, docsDir, steps: [] };
const step = (name, ok, detail = {}) => { result.steps.push({ name, ok, ...detail }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`, JSON.stringify(detail)); };
let server = startServer();
let browser = null; let host = null;
try {
  await waitUp();
  host = new ScriptedHost(`ws://127.0.0.1:${port}/ws`);
  await host.connect();
  host.phase('LOBBY');
  browser = await chromium.launch({ headless: true });
  const phone = new PhoneDriver(browser, { webUrl: `${origin}/play/client`, room: host.room, index: 0, runDir });
  await phone.open();
  step('phone is in the lobby of a live room', true, { room: host.room });
  host.close();
  server.kill();
  await new Promise((r) => server.once('exit', r));
  await sleep(1500);
  const reconnectingSeen = await phone.page.getByTestId('reconnecting').waitFor({ state: 'visible', timeout: 15000 }).then(() => true, () => false);
  step('server gone: phone shows the reconnecting banner while it retries', reconnectingSeen);
  server = startServer();
  await waitUp();
  const ended = await phone.page.getByTestId('room-ended').waitFor({ state: 'visible', timeout: 60000 }).then(() => true, () => false);
  await sleep(500);
  await phone.page.screenshot({ path: path.join(runDir, 'phone-room-ended.png') });
  const text = (await phone.page.locator('body').innerText()).replace(/\s+/g, ' ').slice(0, 200);
  step('room is gone after restart: phone shows "This room has ended." with Rejoin', ended, { bodyText: text });
  step('the "Reconnecting…" banner is gone', !(await phone.page.getByTestId('reconnecting').isVisible().catch(() => false)));
  await phone.page.getByTestId('room-ended-rejoin').click({ timeout: 5000 }).catch(() => {});
  const join = await phone.page.getByTestId('screen-join').waitFor({ state: 'visible', timeout: 10000 }).then(() => true, () => false);
  await phone.page.screenshot({ path: path.join(runDir, 'phone-after-rejoin.png') });
  step('Rejoin returns to the join screen', join);
  await phone.close();
} catch (error) {
  step('harness', false, { error: error.stack ?? error.message });
} finally {
  host?.close();
  await browser?.close().catch(() => {});
  server.kill();
}
fs.writeFileSync(path.join(runDir, 'room-ended-result.json'), JSON.stringify(result, null, 2));
console.log(runDir);
process.exitCode = result.steps.every((s) => s.ok) ? 0 : 1;
