import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { chromium } from '@playwright/test';
import { FrameRecorder } from './lib/frame-recorder.mjs';
import { calculateMetrics } from './lib/metrics.mjs';
import { PhoneDriver } from './lib/phone-driver.mjs';
import { ProtocolValidator } from './lib/schema-validator.mjs';
import { launchStack } from './lib/stack.mjs';
import { evidenceDir, repoDir, schemaDir } from './lib/paths.mjs';
import { ScriptedHost } from './host/scripted-host.mjs';

const argv = process.argv.slice(2);
const value = (name, fallback) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : fallback; };
const playerCounts = value('--players', '1,3,6,10').split(',').map(Number).filter((n) => Number.isInteger(n) && n >= 1 && n <= 10);
const hostMode = value('--host', 'stub');
const spectatorsArg = Number(value('--spectators', '0'));
const seed = Number(value('--seed', '2801')) >>> 0;
const segment = value('--segment', 'full');
const mgIds = value('--minigames', 'MG-01,MG-02,MG-03,MG-04,MG-05,MG-06,MG-07,MG-08b,MG-08,MG-09,MG-10a,MG-10,MG-11,MG-12,MG-13,MG-14,MG-15,MG-16,MG-17,MG-18,MG-19,MG-20,MG-21,MG-29,MG-30').split(',');
const unityHeaded = argv.includes('--headed');
const runStamp = new Date().toISOString().replace(/[:.]/g, '-');
fs.mkdirSync(path.join(evidenceDir, 'runs'), { recursive: true });

function command(command, args, cwd = repoDir) {
  return spawnSync(command, args, { cwd, encoding: 'utf8', shell: process.platform === 'win32' });
}

async function runStub(playerCount) {
  const runId = `${runStamp}-stub-p${playerCount}-s${seed}`;
  const runDir = path.join(evidenceDir, 'runs', runId);
  fs.mkdirSync(runDir, { recursive: true });
  const frameFile = path.join(runDir, 'frames.ndjson');
  const validator = new ProtocolValidator(schemaDir);
  const recorder = new FrameRecorder(frameFile, validator);
  const stack = await launchStack({ recorder, runDir });
  const browser = await chromium.launch({ headless: true });
  const host = new ScriptedHost(stack.wsUrl, { seed, audienceVoteWeight: playerCount === 10 ? 1 : 0 });
  const phones = [];
  const spectators = [];
  let lateJoiner = null;
  const failures = [];
  const milestones = [];
  let dropped = false;
  try {
    await host.connect();
    for (let i = 0; i < playerCount; i += 1) {
      const phone = new PhoneDriver(browser, { webUrl: stack.webUrl, room: host.room, index: i, runDir, cpuThrottle: playerCount === 10 && i === 9 && !process.env.E2E_NO_THROTTLE ? 4 : 1 });
      await phone.open();
      phones.push(phone);
    }
    const spectatorCount = spectatorsArg || (playerCount >= 6 ? 2 : 0);
    for (let i = 0; i < spectatorCount; i += 1) {
      const spectator = new PhoneDriver(browser, { webUrl: stack.webUrl, room: host.room, index: 50 + i, spectator: true, runDir });
      await spectator.open(); spectators.push(spectator);
    }
    const onMilestone = async (name, data) => {
      if (name !== 'minigame_summary') milestones.push({ name, at: new Date().toISOString(), ...data });
      try {
        if (name === 'lobby') { await phones[0].shot('lobby'); if (phones[1]) await phones[1].reloadResume(); }
        if (name === 'briefing') await phones[0].shot('briefing');
        if (name === 'build_started') {
          await phones[0].shot('build');
          await host.disconnectAndResume(20000);
          lateJoiner = new PhoneDriver(browser, { webUrl: stack.webUrl, room: host.room, index: 90, pending: true, runDir });
          await lateJoiner.open();
          await lateJoiner.shot('late-joiner-pending');
        }
        if (name === 'vote') {
          const shouldDrop = !dropped && data.kind === 'PART';
          if (shouldDrop) dropped = true;
          if (data.kind === 'PART') await phones[0].shot(`part-vote-${data.roundId.split('.').at(-1)}`);
          await Promise.all(phones.map((p, i) => p.handleVote(data, { drop: shouldDrop && i === 0 })));
        }
        if (name === 'poll') { await Promise.all(phones.map((p) => p.handlePoll(data.round))); await phones[0].shot(`frr-${data.round}`); }
        if (name === 'minigame') {
          const records = (await Promise.all(phones.map((p) => p.handleMinigame(data)))).filter(Boolean);
          await Promise.all(phones.map((p) => p.sampleFps(data.id)));
          return records;
        }
        if (name === 'minigame_summary') await Promise.all(phones.map((p, i) => p.finishMinigame(data.records.find((r) => r.phone === i + 1), data.id)));
        if (name === 'alert') await Promise.all(phones.map((p) => p.handleAlert()));
        if (name === 'blackout') await phones[0].shot('blackout');
        if (name === 'debrief') await phones[0].shot('debrief');
      } catch (error) { failures.push(`${name}: ${error.stack ?? error.message}`); }
    };
    if (segment === 'smoke') await host.smoke(onMilestone);
    else if (segment === 'minigames') await host.minigames(mgIds, { onMilestone });
    else await host.full({ onMilestone });
    await Promise.all(phones.map((p) => p.sampleFps('mission-end')));
  } catch (error) {
    failures.push(error.stack ?? error.message);
  } finally {
    host.close();
    await Promise.allSettled([...phones, ...spectators, ...(lateJoiner ? [lateJoiner] : [])].map((p) => p.close()));
    await browser.close();
    await stack.close();
    await recorder.close();
  }
  const metrics = calculateMetrics(frameFile);
  const summary = { runId, playerCount, spectatorCount: spectators.length, seed, host: 'stub', segment, fixtureNumbers: 'fixture (not Core)', milestones, failures, segments: host.segments, minigames: host.mgLog, frameCounts: metrics.frames };
  fs.writeFileSync(path.join(runDir, 'metrics.json'), JSON.stringify(metrics, null, 2));
  fs.writeFileSync(path.join(runDir, 'run-summary.json'), JSON.stringify(summary, null, 2));
  return { summary, metrics, runDir };
}

async function runUnityProbe() {
  const runId = `${runStamp}-unity-probe-s${seed}`;
  const runDir = path.join(evidenceDir, 'runs', runId);
  fs.mkdirSync(runDir, { recursive: true });
  const recorder = new FrameRecorder(path.join(runDir, 'frames.ndjson'), new ProtocolValidator(schemaDir));
  const stack = await launchStack({ recorder, runDir });
  const consoleErrors = [];
  let result = { runId, host: 'unity', status: 'not_started', browserMode: unityHeaded ? 'headed' : 'headless', flags: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] };
  const browser = await chromium.launch({ headless: !unityHeaded, args: result.flags });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('pageerror', (e) => consoleErrors.push(e.message));
  try {
    const url = `${stack.webUrl}/host/?server=${encodeURIComponent(stack.wsUrl)}&perf=1`;
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.screenshot({ path: path.join(runDir, 'unity-loading.png') });
    await page.waitForTimeout(12000);
    await page.locator('#unity-canvas').click({ position: { x: 960, y: 540 } }).catch(() => {});
    await page.keyboard.press('Enter');
    await page.waitForTimeout(5000);
    await page.screenshot({ path: path.join(runDir, 'unity-host.png') });
    const perf = await page.evaluate(() => window.mfPerf ?? null);
    const roomCreated = [...recorder.rows].reverse().find((r) => r.t === 'room.created');
    result = { ...result, status: roomCreated ? 'room_created' : 'no_room_created', room: roomCreated?.d?.room ?? null, perf, consoleErrors, loadingStatus: await page.locator('#mf-status').textContent().catch(() => null) };
    if (roomCreated?.d?.room) {
      const phone = new PhoneDriver(browser, { webUrl: stack.webUrl, room: roomCreated.d.room, index: 0, runDir });
      await phone.open();
      await phone.shot('unity-lobby');
      await page.waitForTimeout(1500);
      await page.screenshot({ path: path.join(runDir, 'unity-lobby-with-phone.png') });
      await phone.close();
    }
  } catch (error) {
    result = { ...result, status: 'failed', error: error.stack ?? error.message, consoleErrors };
  } finally {
    await browser.close(); await stack.close(); await recorder.close();
  }
  fs.writeFileSync(path.join(runDir, 'unity-result.json'), JSON.stringify(result, null, 2));
  return result;
}

const environment = {
  capturedAt: new Date().toISOString(), node: process.version, npm: command('npm', ['--version']).stdout.trim(),
  playwright: command('npx', ['playwright', '--version'], path.join(repoDir, 'tools', 'e2e')).stdout.trim(),
  os: `${os.type()} ${os.release()} ${os.arch()}`, hostname: os.hostname(), cpus: os.cpus().map((c) => c.model).filter((x, i, a) => a.indexOf(x) === i), memoryBytes: os.totalmem(),
  commit: command('git', ['rev-parse', 'HEAD']).stdout.trim(), platformTested: process.platform,
};
fs.writeFileSync(path.join(evidenceDir, 'ENVIRONMENT.json'), JSON.stringify(environment, null, 2));

const results = [];
if (hostMode === 'unity' || hostMode === 'both') results.push({ unity: await runUnityProbe() });
if (hostMode !== 'unity') for (const count of playerCounts) results.push(await runStub(count));
fs.writeFileSync(path.join(evidenceDir, 'latest-results.json'), JSON.stringify(results.map((r) => r.unity ? r : { summary: r.summary, metrics: r.metrics }), null, 2));
const failed = results.some((r) => r.summary?.failures?.length);
console.log(JSON.stringify({ ok: !failed, evidenceDir, runs: results.map((r) => r.unity?.runId ?? r.summary.runId) }, null, 2));
process.exitCode = failed ? 1 : 0;
