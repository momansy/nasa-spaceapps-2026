// T036 step 5: the pilot / co-pilot / booster seats, the spectator with audience reactions and the
// `?server=` override, each against the real phone client.
//   node seats.mjs            (set E2E_EVIDENCE_TASK=T036 to write under orchestration/evidence/T036)
// Part A uses the in-page mock (`?mock=1&seat=`); part B uses the real room server with the scripted
// host assigning PHONE seats; part C points the phone at a LAN address with `?server=`.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { chromium } from '@playwright/test';
import { FrameRecorder } from './lib/frame-recorder.mjs';
import { PhoneDriver } from './lib/phone-driver.mjs';
import { ProtocolValidator } from './lib/schema-validator.mjs';
import { launchStack } from './lib/stack.mjs';
import { evidenceDir, schemaDir } from './lib/paths.mjs';
import { ScriptedHost, schemaExample } from './host/scripted-host.mjs';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const runDir = path.join(evidenceDir, 'runs', `${stamp}-seats`);
fs.mkdirSync(runDir, { recursive: true });
const result = { runId: path.basename(runDir), mock: {}, real: {}, serverOverride: {}, failures: [] };
const check = (name, ok, detail = '') => { (result.failures ??= []); if (!ok) result.failures.push(`${name}${detail ? `: ${detail}` : ''}`); return ok; };

function lanIp() {
  for (const list of Object.values(os.networkInterfaces())) for (const a of list ?? []) if (a.family === 'IPv4' && !a.internal && !a.address.startsWith('169.254.')) return a.address;
  return null;
}

async function touchDrag(page, cdp, box, from, to) {
  const x = box.x + box.width * from[0]; const y = box.y + box.height * from[1];
  const x2 = box.x + box.width * to[0]; const y2 = box.y + box.height * to[1];
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  for (let k = 1; k <= 8; k += 1) { await sleep(30); await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + (x2 - x) * k / 8, y: y + (y2 - y) * k / 8 }] }); }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

/** The pilot layout settles after its first banner; measure the control only once it stops moving. */
async function stableBox(locator) {
  let last = null;
  for (let i = 0; i < 20; i += 1) {
    const box = await locator.boundingBox().catch(() => null);
    if (box && last && Math.abs(box.y - last.y) < 1 && Math.abs(box.height - last.height) < 1) return box;
    last = box; await sleep(500);
  }
  return last;
}

async function newPhone(browser, webUrl, query) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const page = await context.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${webUrl}/${query}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  return { context, page, errors };
}

async function mockSeat(browser, webUrl, seat) {
  const out = { seat, errors: [] };
  const { context, page, errors } = await newPhone(browser, webUrl, `?mock=1&seat=${seat}&speed=4&room=KQXM`);
  try {
    await page.getByTestId('screen-join').waitFor({ state: 'visible', timeout: 15000 });
    await page.getByTestId('join-nick').fill('SeatTest');
    await page.getByTestId('join-submit').click();
    await page.getByTestId('screen-role').waitFor({ state: 'visible', timeout: 40000 });
    await page.getByTestId('role-ready').click();
    const screenId = seat === 'copilot' ? 'copilot-screen' : 'pilot-screen';
    out.screenShown = await page.getByTestId(screenId).waitFor({ state: 'visible', timeout: 90000 }).then(() => true).catch(() => false);
    check(`mock ${seat}: ${screenId} shown`, out.screenShown);
    if (out.screenShown) {
      await sleep(2500);
      await page.screenshot({ path: path.join(runDir, `mock-${seat}.png`), fullPage: true });
      const cdp = await context.newCDPSession(page);
      if (seat !== 'copilot') {
        const thr = await stableBox(page.getByTestId('pilot-throttle'));
        out.throttleBefore = await page.getByTestId('pilot-throttle-cmd').textContent().catch(() => null);
        // Retry the touch drag: record on which attempt (and how many seconds after the screen appeared) the
        // command first changed, because in the mock the first drag right after the seat appears is ignored.
        out.touchAttempts = [];
        const t0 = Date.now();
        for (let attempt = 1; attempt <= 5; attempt += 1) {
          const box = await stableBox(page.getByTestId('pilot-throttle'));
          if (box) await touchDrag(page, cdp, box, [0.5, 0.9], [0.5, 0.2]);
          await sleep(900);
          const cmd = await page.getByTestId('pilot-throttle-cmd').textContent().catch(() => null);
          out.touchAttempts.push({ attempt, afterS: Number(((Date.now() - t0) / 1000).toFixed(1)), cmd });
          if (cmd !== out.throttleBefore) break;
          await sleep(2000);
        }
        out.throttleAfterDrag = out.touchAttempts.at(-1).cmd;
        out.throttleReadback = await page.getByTestId('pilot-throttle-host').textContent().catch(() => null);
        out.hudAlt = await page.getByTestId('pilot-hud-alt').textContent().catch(() => null);
        check(`mock ${seat}: throttle command changed by touch drag`, out.throttleBefore !== out.throttleAfterDrag, JSON.stringify(out.touchAttempts));
        const stage = page.getByTestId('pilot-stage');
        out.stageButton = await stage.isVisible().catch(() => false);
        await page.screenshot({ path: path.join(runDir, `mock-${seat}-after-input.png`), fullPage: true });
      } else {
        out.readback = await page.getByTestId('copilot-readback').textContent().catch(() => null);
        const stage = page.getByTestId('copilot-stage');
        out.stageEnabled = await stage.isEnabled().catch(() => false);
        if (out.stageEnabled) await stage.evaluate((el) => el.click());
        await sleep(600);
        await page.screenshot({ path: path.join(runDir, `mock-${seat}-after-input.png`), fullPage: true });
      }
    }
  } catch (error) { check(`mock ${seat}`, false, error.message); }
  out.errors = errors;
  check(`mock ${seat}: no console/page errors`, errors.length === 0, errors.slice(0, 2).join(' | '));
  await context.close();
  return out;
}

async function mockSpectator(browser, webUrl) {
  const out = { errors: [] };
  const { context, page, errors } = await newPhone(browser, webUrl, '?mock=1&watch=1&speed=2&brief=120&room=KQXM');
  try {
    await page.getByTestId('screen-join').waitFor({ state: 'visible', timeout: 15000 });
    await page.getByTestId('join-submit').click();
    out.watchShown = await page.getByTestId('watch-screen').waitFor({ state: 'visible', timeout: 30000 }).then(() => true).catch(() => false);
    check('mock spectator: watch-screen shown', out.watchShown);
    await sleep(6000);
    const pad = page.getByTestId('watch-pad');
    out.padVisible = await pad.isVisible().catch(() => false);
    const reacts = await page.locator('[data-testid^="watch-react-"]').count();
    out.reactButtons = reacts;
    for (let i = 0; i < Math.min(reacts, 3); i += 1) await page.locator('[data-testid^="watch-react-"]').nth(i).evaluate((el) => el.click()).catch(() => {});
    await sleep(1500);
    out.audienceSizeChip = await page.getByTestId('watch-audience-size').textContent().catch(() => null);
    out.bursts = await page.getByTestId('audience-burst').count().catch(() => 0);
    await page.screenshot({ path: path.join(runDir, 'mock-spectator.png'), fullPage: true });
  } catch (error) { check('mock spectator', false, error.message); }
  out.errors = errors;
  check('mock spectator: no console/page errors', errors.length === 0, errors.slice(0, 2).join(' | '));
  await context.close();
  return out;
}

async function realSeats(browser, stack, recorder) {
  const out = {};
  const host = new ScriptedHost(stack.wsUrl, { seed: 2801 });
  await host.connect();
  const p1 = new PhoneDriver(browser, { webUrl: stack.webUrl, room: host.room, index: 0, runDir });
  const p2 = new PhoneDriver(browser, { webUrl: stack.webUrl, room: host.room, index: 1, runDir, tag: 'copilot' });
  const spec = new PhoneDriver(browser, { webUrl: stack.webUrl, room: host.room, index: 50, spectator: true, runDir, tag: 'spectator' });
  try {
    await p1.open(); await p2.open(); await spec.open();
    host.phase('LOBBY'); await sleep(600);
    host.send('roles.lock', {}); await sleep(1500);
    for (const p of [p1, p2]) await p.page.getByTestId('role-ready').evaluate((el) => el.click()).catch(() => {});
    await sleep(600);
    host.phase('COUNTDOWN', { flightPhase: 'F0', contractId: 'C1' }); await sleep(500);
    host.send('pilot.assign', { segment: 'ASCENT', pilotId: host.playerIds[0], pilotInput: 'PHONE', copilotId: host.playerIds[1], boosterPilotId: null, boosterInput: null });
    host.phase('FLIGHT', { sub: 'FLYING', flightPhase: 'F3', segment: 'ASCENT', contractId: 'C1' });
    const hud = schemaExample('pilot.hud'); hud.to = [host.playerIds[0], host.playerIds[1]]; hud.canStage = true;
    const flight = schemaExample('flight.hud');
    for (let i = 0; i < 12; i += 1) { hud.throttlePct = 60 + i; host.send('pilot.hud', hud); flight.metS += 0.2; host.send('flight.hud', flight); await sleep(200); }
    out.pilotScreen = await p1.page.getByTestId('pilot-screen').waitFor({ state: 'visible', timeout: 10000 }).then(() => true).catch(() => false);
    out.copilotScreen = await p2.page.getByTestId('copilot-screen').waitFor({ state: 'visible', timeout: 10000 }).then(() => true).catch(() => false);
    check('real session: pilot phone shows pilot-screen', out.pilotScreen);
    check('real session: co-pilot phone shows copilot-screen', out.copilotScreen);
    await p1.shot('real-pilot'); await p2.shot('real-copilot');
    if (out.pilotScreen) {
      const cdp = await p1.context.newCDPSession(p1.page);
      const thr = await stableBox(p1.page.getByTestId('pilot-throttle'));
      const before = host.relayCounts['pilot.input'] ?? 0;
      if (thr) await touchDrag(p1.page, cdp, thr, [0.5, 0.9], [0.5, 0.2]);
      for (let i = 0; i < 6; i += 1) { host.send('pilot.hud', hud); await sleep(150); }
      out.pilotInputRelays = (host.relayCounts['pilot.input'] ?? 0) - before;
      out.throttleCmd = await p1.page.getByTestId('pilot-throttle-cmd').textContent().catch(() => null);
      out.throttleReadback = await p1.page.getByTestId('pilot-throttle-host').textContent().catch(() => null);
      out.hudAlt = await p1.page.getByTestId('pilot-hud-alt').textContent().catch(() => null);
      check('real session: pilot.input reached the host', out.pilotInputRelays > 0, `relays=${out.pilotInputRelays}`);
      check('real session: host read-back shown on phone', out.throttleReadback && out.throttleReadback !== '—', String(out.throttleReadback));
    }
    if (out.copilotScreen) {
      const stage = p2.page.getByTestId('copilot-stage');
      out.stageEnabled = await stage.isEnabled().catch(() => false);
      const before = host.relayCounts['copilot.action'] ?? 0;
      if (out.stageEnabled) {
        const b = await stage.boundingBox();
        await p2.page.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await p2.page.mouse.down(); await sleep(700); await p2.page.mouse.up();
      }
      await sleep(600);
      out.copilotActionRelays = (host.relayCounts['copilot.action'] ?? 0) - before;
      check('real session: co-pilot STAGE reached the host', !out.stageEnabled || out.copilotActionRelays > 0, `enabled=${out.stageEnabled} relays=${out.copilotActionRelays}`);
    }
    // Spectator reactions.
    out.spectatorScreen = await spec.page.getByTestId('watch-screen').isVisible().catch(() => false);
    const buttons = spec.page.locator('[data-testid^="watch-react-"]');
    out.reactButtons = await buttons.count().catch(() => 0);
    for (let i = 0; i < Math.min(3, out.reactButtons); i += 1) { await buttons.nth(i).evaluate((el) => el.click()).catch(() => {}); await sleep(300); }
    await sleep(1500);
    await spec.shot('real-spectator');
    check('real session: spectator watch-screen shown', out.spectatorScreen);
    out.errors = { pilot: p1.consoleErrors.concat(p1.pageErrors), copilot: p2.consoleErrors.concat(p2.pageErrors), spectator: spec.consoleErrors.concat(spec.pageErrors) };
    for (const [who, errs] of Object.entries(out.errors)) check(`real session: ${who} no console/page errors`, errs.length === 0, errs.slice(0, 2).join(' | '));
  } catch (error) { check('real session', false, error.stack ?? error.message); }
  const frames = recorder.rows;
  out.frames = { 'react.send': frames.filter((r) => r.t === 'react.send').length, 'react.audience': frames.filter((r) => r.t === 'react.audience').length, 'react.event': frames.filter((r) => r.t === 'react.event').length, 'pilot.input': frames.filter((r) => r.t === 'pilot.input').length, 'pilot.hud': frames.filter((r) => r.t === 'pilot.hud').length };
  check('real session: react.send reached the server', out.frames['react.send'] > 0, JSON.stringify(out.frames));
  host.close();
  await Promise.allSettled([p1.close(), p2.close(), spec.close()]);
  return out;
}

async function overrideTest(browser, stack) {
  const out = { lanIp: lanIp() };
  const host = new ScriptedHost(stack.wsUrl, { seed: 2801 });
  await host.connect();
  host.phase('LOBBY');
  const tryPhone = async (label, query, expectJoin) => {
    const { context, page, errors } = await newPhone(browser, stack.webUrl, `?room=${host.room}${query}`);
    const before = host.playerIds.length;
    let joined = false;
    try {
      await page.getByTestId('join-nick').fill(`Ovr${label}`, { timeout: 15000 });
      await page.getByTestId('join-submit').click();
      joined = await page.getByTestId('screen-lobby').waitFor({ state: 'visible', timeout: 15000 }).then(() => true).catch(() => false);
      await sleep(600);
    } catch { /* recorded below */ }
    const hostSaw = host.playerIds.length > before;
    out[label] = { query, expectJoin, phoneShowsLobby: joined, hostSawNewPlayer: hostSaw };
    if (joined) await page.screenshot({ path: path.join(runDir, `server-override-${label}.png`) });
    check(`?server= ${label}: ${expectJoin ? 'joined' : 'not joined'}`, joined === expectJoin && (!expectJoin || hostSaw), JSON.stringify(out[label]));
    await context.close();
    return errors;
  };
  if (out.lanIp) {
    await tryPhone('lan', `&server=${encodeURIComponent(`ws://${out.lanIp}:${stack.roomPort}`)}`, true);
  } else out.lan = { skipped: 'no non-loopback IPv4 address on this machine' };
  // Same-host override (the page's own host): accepted.
  await tryPhone('loopback', `&server=${encodeURIComponent(`ws://127.0.0.1:${stack.roomPort}`)}`, true);
  // An internet host is ignored, so the phone falls back to same-origin /ws and still joins.
  await tryPhone('internet-ignored', `&server=${encodeURIComponent('ws://example.com:9')}`, true);
  // A malformed value is ignored the same way.
  await tryPhone('garbage-ignored', '&server=not-a-url', true);
  host.close();
  return out;
}

const validator = new ProtocolValidator(schemaDir);
const recorder = new FrameRecorder(path.join(runDir, 'frames.ndjson'), validator);
const stack = await launchStack({ recorder, runDir });
const browser = await chromium.launch({ headless: true });
try {
  for (const seat of ['pilot', 'copilot', 'booster']) result.mock[seat] = await mockSeat(browser, stack.webUrl, seat);
  result.mock.spectator = await mockSpectator(browser, stack.webUrl);
  result.real = await realSeats(browser, stack, recorder);
  result.serverOverride = await overrideTest(browser, stack);
} catch (error) {
  result.failures.push(error.stack ?? error.message);
} finally {
  await browser.close(); await stack.close(); await recorder.close();
}
fs.writeFileSync(path.join(runDir, 'seats-result.json'), JSON.stringify(result, null, 2));
console.log(JSON.stringify({ ok: result.failures.length === 0, runDir, failures: result.failures }, null, 2));
process.exitCode = result.failures.length ? 1 : 0;
