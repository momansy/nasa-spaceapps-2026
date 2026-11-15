// T047 step 3: one rendered phone page at CPU x4 plus nine protocol-only players.
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from '@playwright/test';
import { FrameRecorder } from './lib/frame-recorder.mjs';
import { MachineCpuMonitor } from './lib/machine-cpu.mjs';
import { calculateMetrics } from './lib/metrics.mjs';
import { PhoneDriver } from './lib/phone-driver.mjs';
import { RawPhone } from './lib/raw-phone.mjs';
import { ProtocolValidator } from './lib/schema-validator.mjs';
import { launchStack } from './lib/stack.mjs';
import { evidenceDir, schemaDir } from './lib/paths.mjs';
import { ScriptedHost } from './host/scripted-host.mjs';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const seed = 2801;
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const runId = `${stamp}-single-page-profile-p10-s${seed}`;
const runDir = path.join(evidenceDir, 'runs', runId);
fs.mkdirSync(runDir, { recursive: true });
const frameFile = path.join(runDir, 'frames.ndjson');
const recorder = new FrameRecorder(frameFile, new ProtocolValidator(schemaDir));
const stack = await launchStack({ recorder, runDir });
const browser = await chromium.launch({ headless: true });
const host = new ScriptedHost(stack.wsUrl, { seed });
const phone = new PhoneDriver(browser, { webUrl: stack.webUrl, room: null, index: 0, runDir, cpuThrottle: 4, measurePerformance: true });
const peers = [];
const cpu = new MachineCpuMonitor();
const milestones = [];
const failures = [];
let gpu = null;

try {
  await host.connect();
  phone.room = host.room;
  phone.url = `${stack.webUrl}/?room=${host.room}`;
  await phone.open();
  for (let index = 2; index <= 10; index += 1) peers.push(new RawPhone(stack.wsUrl, { room: host.room, index }));
  await Promise.all(peers.map((peer) => peer.connect()));
  const deadline = Date.now() + 10000;
  while (host.playerIds.length !== 10 && Date.now() < deadline) await sleep(50);
  if (host.playerIds.length !== 10) throw new Error(`expected 10 players, host saw ${host.playerIds.length}`);

  const browserCdp = await browser.newBrowserCDPSession();
  const systemInfo = await browserCdp.send('SystemInfo.getInfo');
  await browserCdp.detach();
  const webgl = await phone.page.evaluate(() => {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    const ext = gl?.getExtension('WEBGL_debug_renderer_info');
    return { vendor: ext ? gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) : null, renderer: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : null };
  });
  gpu = { system: systemInfo.gpu, webgl };
  cpu.start();
  await host.partVoteProfile(async (name, data = {}) => {
    milestones.push({ name, at: new Date().toISOString(), ...data });
    if (name === 'build_started') await phone.startCpuProfile('five-part-vote-screens-single-rendered-page');
    if (name === 'vote') {
      await phone.handleVote(data);
      await phone.collectPerformance(`after-vote:${data.roundId}`);
    }
    if (name === 'profile_finished') await phone.stopCpuProfile();
  });
} catch (error) {
  failures.push(error.stack ?? error.message);
} finally {
  cpu.stop();
  host.close();
  for (const peer of peers) peer.close();
  await phone.close().catch(() => {});
  await browser.close();
  await stack.close();
  await recorder.close();
}

const machineCpu = { unit: 'percent of total logical CPU capacity', intervalMs: cpu.intervalMs, startedAt: cpu.startedAt, endedAt: cpu.endedAt, overall: cpu.summary(), samples: cpu.samples };
const metrics = calculateMetrics(frameFile);
const summary = {
  runId, playerCount: host.playerIds.length, renderedPages: 1, protocolOnlyPlayers: peers.length, spectatorCount: 0,
  seed, host: 'stub', segment: 'vote-profile', phoneProcessMode: 'single-rendered-page+9-protocol-peers',
  profileVotePhone: 1, profileCpuRate: 4, milestones, machineCpu: machineCpu.overall, frameCounts: metrics.frames, gpu, failures,
};
fs.writeFileSync(path.join(runDir, 'machine-cpu.json'), JSON.stringify(machineCpu, null, 2));
fs.writeFileSync(path.join(runDir, 'metrics.json'), JSON.stringify(metrics, null, 2));
fs.writeFileSync(path.join(runDir, 'run-summary.json'), JSON.stringify(summary, null, 2));
console.log(JSON.stringify({ ok: failures.length === 0, runDir, players: summary.playerCount, renderedPages: 1, gpu: gpu?.webgl, failures }, null, 2));
process.exitCode = failures.length ? 1 : 0;
