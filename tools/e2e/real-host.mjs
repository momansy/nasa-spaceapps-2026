// T061: scripted phones against a room created by a REAL host (the Unity build), not the stub host.
//
//   node run.mjs --real-host --room CODE --server ws://localhost:10000/ws --phones 3
//
// The harness never sends a host message and never drives a phase. It joins N real 390 x 844 Chromium phone
// pages to the room, answers every vote, poll and minigame the host opens (through the real phone UI), logs
// every phase the phones see with timestamps, and reports where the session stops if it does.
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from '@playwright/test';
import { FrameRecorder } from './lib/frame-recorder.mjs';
import { PhoneDriver } from './lib/phone-driver.mjs';
import { ProtocolValidator } from './lib/schema-validator.mjs';
import { repoDir, schemaDir } from './lib/paths.mjs';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Frame types that prove the session is moving (flight.hud / telemetry / clock noise do not count as progress). */
const PROGRESS_TYPES = new Set([
  'phase.set', 'roles.state', 'roles.set', 'vote.open', 'vote.stage', 'vote.result', 'vote.commit', 'poll.open', 'poll.call', 'poll.result',
  'mg.start', 'mg.state', 'mg.summary', 'build.state', 'build.event', 'debrief.score', 'debrief.awards', 'debrief.facts',
  'pilot.assign', 'game.paused', 'game.resumed', 'console.alert', 'blackout.set', 'room.state',
]);

export function parseArgs(argv) {
  const value = (name, fallback) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : fallback; };
  const room = (value('--room', '') ?? '').trim().toUpperCase();
  const server = value('--server', '');
  const phones = Number(value('--phones', '3'));
  const errors = [];
  if (!room) errors.push('--room CODE is required (the room code the real host shows)');
  if (!server) errors.push('--server URL is required (for example ws://localhost:10000/ws or http://localhost:10000)');
  if (![1, 3, 6].includes(phones)) errors.push('--phones must be 1, 3 or 6');
  return {
    errors, room, server, phones,
    phoneBase: value('--phone-base', null),
    timeoutMin: Number(value('--timeout-minutes', '60')),
    stallSec: Number(value('--stall-seconds', '180')),
    lobbyWaitMin: Number(value('--lobby-wait-minutes', '30')),
    lingerSec: Number(value('--debrief-linger-seconds', '20')),
    headed: argv.includes('--headed'),
    seed: Number(value('--seed', '2801')) >>> 0,
    outDir: value('--out', null),
  };
}

/** `--server` may be ws://host:port/ws, wss://…, http(s)://host:port or just host:port. Returns the ws URL and the HTTP origin. */
export function normalizeServer(server) {
  let text = server.trim();
  if (!/^[a-z]+:\/\//i.test(text)) text = `http://${text}`;
  const url = new URL(text);
  const secure = url.protocol === 'https:' || url.protocol === 'wss:';
  const wsPath = url.pathname === '/' || url.pathname === '' ? '/ws' : url.pathname.replace(/\/$/, '');
  return {
    wsUrl: `${secure ? 'wss' : 'ws'}://${url.host}${wsPath}`,
    origin: `${secure ? 'https' : 'http'}://${url.host}`,
    host: url.hostname,
  };
}

/**
 * Where the phone pages come from. `npm --prefix server run start:hosted` serves the committed phone build at
 * <origin>/play/client/; any other layout needs --phone-base. `?server=` is added only when the phones would
 * not reach the room server at <phone origin>/ws on their own (the phone client accepts it for local hosts only).
 */
export function phoneTarget({ server, phoneBase }) {
  const s = normalizeServer(server);
  const base = (phoneBase ?? `${s.origin}/play/client`).replace(/\/+$/, '');
  const baseUrl = new URL(base);
  const sameWs = `${baseUrl.protocol === 'https:' ? 'wss' : 'ws'}://${baseUrl.host}/ws` === s.wsUrl;
  return { webUrl: base, extraQuery: sameWs ? '' : `&server=${encodeURIComponent(s.wsUrl)}`, wsUrl: s.wsUrl };
}

export function phaseSignature(d) {
  if (!d) return 'unknown';
  return [d.phase, d.sub && d.sub !== 'NONE' ? d.sub : null, d.review, d.flightPhase, d.segment].filter(Boolean).join(':');
}

/** How long a session may sit still before it counts as stopped. The lobby waits for a human, so it gets a long allowance. */
export function stallLimitSec(phase, { stallSec, lobbyWaitMin }) {
  return phase === 'LOBBY' || phase == null ? lobbyWaitMin * 60 : stallSec;
}

export class RealHostRun {
  constructor(opts) {
    this.opts = opts;
    this.target = phoneTarget(opts);
    this.t0 = Date.now();
    this.timeline = [];
    this.phasesSeen = new Map();
    this.phones = [];
    this.queues = new Map();
    this.votes = new Map();
    this.pollsDone = new Set();
    this.mgRecords = new Map();
    this.screens = new Map();
    this.currentPhase = null;
    this.currentPhaseAt = Date.now();
    this.lastProgressAt = Date.now();
    this.lastProgress = 'none yet';
    this.reachedDebriefAt = null;
    this.ended = null;
    this.failures = [];
    this.counts = {};
    this.answered = { votes: 0, polls: 0, minigames: 0, trivia: 0, predictions: 0, picks: 0 };
  }

  log(kind, detail, phone = null) {
    const row = { at: new Date().toISOString(), tSec: Number(((Date.now() - this.t0) / 1000).toFixed(1)), kind, phone, detail };
    this.timeline.push(row);
    console.log(`[${String(row.tSec).padStart(7)}s] ${phone ? `phone ${phone} ` : ''}${kind}: ${detail}`);
    return row;
  }

  /** Run `fn` for one phone after that phone's earlier jobs, so a phone answers one thing at a time. */
  enqueue(phone, label, fn) {
    const previous = this.queues.get(phone) ?? Promise.resolve();
    const next = previous.then(fn).catch((error) => {
      const message = `phone ${phone.index + 1}: ${label}: ${String(error.message ?? error).split(/\r?\n/)[0]}`;
      this.failures.push(message);
      this.log('phone-error', message, phone.index + 1);
    });
    this.queues.set(phone, next);
    return next;
  }

  onFrame(phone, direction, payload) {
    const n = phone.index + 1;
    if (direction === 'socket_closed') {
      this.log('socket', 'WebSocket closed', n);
      return;
    }
    const text = Buffer.isBuffer(payload) ? payload.toString('utf8') : String(payload);
    this.recorder.record({ connId: `phone${n}`, role: 'player', direction, raw: text });
    if (direction !== 'server_to_client') return;
    let msg;
    try { msg = JSON.parse(text); } catch { return; }
    this.counts[msg.t] = (this.counts[msg.t] ?? 0) + 1;
    if (PROGRESS_TYPES.has(msg.t)) { this.lastProgressAt = Date.now(); this.lastProgress = msg.t; }
    switch (msg.t) {
      case 'phase.set': return this.onPhase(phone, msg.d);
      case 'vote.open': this.votes.set(msg.d.roundId, { ids: msg.d.options.map((o) => o.id), kind: msg.d.kind, subject: msg.d.subjectId }); return this.log('vote.open', `${msg.d.kind} ${msg.d.roundId} options ${msg.d.options.map((o) => o.id).join('/')}`, n);
      case 'vote.stage': return this.onVoteStage(phone, msg.d);
      case 'vote.result': return this.log('vote.result', `${msg.d.roundId} winner ${msg.d.winnerId}`, n);
      case 'room.joined': phone.playerId = msg.d.id; return undefined;
      case 'poll.call': return this.onPollCall(phone, msg.d);
      case 'poll.result': this.pollsDone.add(msg.d.pollId); return this.log('poll.result', `${msg.d.pollId} ${msg.d.allGo ? 'ALL GO' : 'NO-GO present'}`, n);
      case 'mg.start': return this.onMinigameStart(phone, msg.d);
      case 'mg.summary': return this.onMinigameSummary(phone, msg.d);
      case 'console.alert': this.log('console.alert', `${msg.d.alertId} ${msg.d.severity}`, n); return this.enqueue(phone, 'alert', () => phone.handleAlert());
      case 'game.paused': return this.log('game.paused', JSON.stringify(msg.d), n);
      case 'game.resumed': return this.log('game.resumed', '', n);
      case 'bye': return this.log('bye', JSON.stringify(msg.d), n);
      case 'error': return this.log('server-error', `${msg.d.code}: ${msg.d.message ?? ''}`, n);
      case 'debrief.score': return this.log('debrief.score', 'received', n);
      default:
    }
  }

  onPhase(phone, d) {
    const sig = phaseSignature(d);
    const key = `${d.missionSeq}|${sig}|${d.step?.index ?? ''}`;
    const known = this.phasesSeen.get(key);
    if (known) { known.phones.add(phone.index + 1); return; }
    this.phasesSeen.set(key, { signature: sig, missionSeq: d.missionSeq, step: d.step ?? null, firstSeenAt: new Date().toISOString(), tSec: Number(((Date.now() - this.t0) / 1000).toFixed(1)), phones: new Set([phone.index + 1]) });
    this.currentPhase = d.phase;
    this.currentPhaseSig = sig;
    this.currentPhaseAt = Date.now();
    this.log('phase', `${sig}${d.step ? ` (step ${d.step.index}/${d.step.total})` : ''} mission ${d.missionSeq} mode ${d.mode}`, phone.index + 1);
    if (d.phase === 'DEBRIEF' && !this.reachedDebriefAt) this.reachedDebriefAt = Date.now();
  }

  onVoteStage(phone, d) {
    const n = phone.index + 1;
    this.log('vote.stage', `${d.roundId} ${d.stage}`, n);
    const vote = this.votes.get(d.roundId) ?? { ids: d.options?.map((o) => o.id) ?? [], kind: 'PART' };
    if (d.stage === 'VOTE' || d.stage === 'RUNOFF') {
      const ids = d.options?.length ? d.options.map((o) => o.id) : vote.ids;
      return this.enqueue(phone, `vote ${d.roundId}`, async () => { await phone.handleVote({ ids, scenario: null, kind: vote.kind }); this.answered.votes += 1; });
    }
    if (d.stage === 'PREDICT') return this.enqueue(phone, `predict ${d.roundId}`, async () => { if (await this.clickFirst(phone, '[data-testid^="predict-"]')) this.answered.predictions += 1; });
    if (d.stage === 'TIEBREAK_TRIVIA') return this.enqueue(phone, `trivia ${d.roundId}`, async () => { if (await this.clickFirst(phone, '[data-testid^="trivia-"]')) this.answered.trivia += 1; });
    if (d.stage === 'TIEBREAK_PICK') return this.enqueue(phone, `pick ${d.roundId}`, async () => { if (await this.clickFirst(phone, '[data-testid^="pick-"]')) this.answered.picks += 1; });
    return undefined;
  }

  async clickFirst(phone, selector) {
    const button = phone.page.locator(selector).first();
    await button.waitFor({ state: 'visible', timeout: 4000 }).catch(() => {});
    if (!(await button.isVisible().catch(() => false))) return false;
    await button.evaluate((el) => el.click()).catch(() => {});
    return true;
  }

  /**
   * Phones never receive `poll.open` (host → server only); the server sends each console's turn as a `poll.call` to everyone,
   * naming the called player. Only that phone shows GO / NO-GO. Always GO: the run is about reaching the debrief.
   */
  onPollCall(phone, d) {
    const n = phone.index + 1;
    const mine = !phone.playerId || d.playerId === phone.playerId;
    if (n === 1) this.log('poll.call', `${d.pollId} ${d.index}/${d.total}: player ${d.playerId} (${d.roles.join(',')})`, n);
    if (!mine) return undefined;
    return this.enqueue(phone, `poll ${d.pollId} call ${d.index}`, async () => {
      const limit = Math.max(Date.now() + 4000, (d.endsAtMs ?? 0) - 200);
      const go = phone.page.getByTestId('poll-go');
      while (Date.now() < limit) {
        const roleReady = phone.page.getByTestId('role-ready');
        if (await roleReady.isVisible().catch(() => false)) await roleReady.evaluate((el) => el.click()).catch(() => {});
        if (await phone.page.getByTestId('poll-my-call').isVisible().catch(() => false) && await go.isEnabled().catch(() => false)) {
          await go.evaluate((el) => el.click()).catch(() => {});
          this.answered.polls += 1;
          phone.actions.push(`poll ${d.pollId} call ${d.index}: GO`);
          return;
        }
        await sleep(80);
      }
      this.log('poll-note', `${d.pollId} call ${d.index}: GO/NO-GO never appeared for the called phone`, n);
    });
  }

  onMinigameStart(phone, d) {
    const n = phone.index + 1;
    this.log('mg.start', `${d.minigameId} ${d.type} ${d.durationMs} ms at flight phase ${d.flightPhase ?? '-'}`, n);
    return this.enqueue(phone, `minigame ${d.minigameId}`, async () => {
      const rec = await phone.handleMinigame({ id: d.minigameId, durationMs: d.durationMs, label: `${d.minigameId}-${d.runId.split('.').pop()}` });
      if (rec) { this.mgRecords.set(`${d.runId}|${n}`, rec); this.answered.minigames += 1; }
    });
  }

  onMinigameSummary(phone, d) {
    const n = phone.index + 1;
    this.log('mg.summary', `${d.minigameId} tier ${d.tier} ${d.succeeded}/${d.active}`, n);
    return this.enqueue(phone, `minigame summary ${d.minigameId}`, async () => {
      const rec = this.mgRecords.get(`${d.runId}|${n}`);
      if (rec) await phone.finishMinigame(rec, `${d.minigameId}-${d.runId.split('.').pop()}`);
    });
  }

  /** Every 2 s: which screen does each phone show? Logs changes, presses harmless acknowledgements, screenshots phone 1. */
  async watchScreens() {
    const probes = ['reconnecting', 'screen-join', 'screen-lobby', 'screen-role', 'screen-vote', 'screen-poll', 'screen-build', 'console-screen', 'pilot-screen', 'copilot-screen', 'mg-intro', 'mg-play', 'mg-result', 'screen-debrief', 'watch-screen'];
    while (!this.ended) {
      for (const phone of this.phones) {
        const n = phone.index + 1;
        if (phone.page.isClosed()) continue;
        const roleReady = phone.page.getByTestId('role-ready');
        if (await roleReady.isVisible().catch(() => false)) await roleReady.evaluate((el) => el.click()).catch(() => {});
        const visible = await phone.page.evaluate((ids) => ids.filter((id) => { const el = document.querySelector(`[data-testid="${id}"]`); return el && el.getClientRects().length > 0; }), probes).catch(() => null);
        if (!visible) continue;
        const now = visible.join(',') || 'none';
        if (this.screens.get(n) !== now) {
          this.screens.set(n, now);
          this.log('screen', now, n);
          if (n === 1) await phone.shot(`real-${String(Math.round((Date.now() - this.t0) / 1000)).padStart(5, '0')}s-${(visible[0] ?? 'none')}`).catch(() => {});
        }
      }
      await sleep(2000);
    }
  }

  async run() {
    const { opts } = this;
    const runId = `${new Date().toISOString().replace(/[:.]/g, '-')}-real-host-${opts.room}-p${opts.phones}`;
    const outRoot = opts.outDir ?? path.join(repoDir, 'orchestration', 'evidence', process.env.E2E_EVIDENCE_TASK ?? 'T061', 'real-host-runs');
    this.runDir = path.join(outRoot, runId);
    fs.mkdirSync(this.runDir, { recursive: true });
    this.recorder = new FrameRecorder(path.join(this.runDir, 'frames.ndjson'), new ProtocolValidator(schemaDir));
    this.log('start', `room ${opts.room}, ${opts.phones} phones, server ${this.target.wsUrl}, phone page ${this.target.webUrl}/?room=${opts.room}${this.target.extraQuery ? ' (+server override)' : ''}`);

    const page = await fetch(`${this.target.webUrl}/`).then((r) => r.status, () => 0);
    if (page !== 200) throw new Error(`phone page ${this.target.webUrl}/ answered HTTP ${page || 'no response'}; is the server running (npm --prefix server run start:hosted) or is --phone-base wrong?`);

    const browser = await chromium.launch({ headless: !opts.headed });
    try {
      for (let i = 0; i < opts.phones; i += 1) {
        const phone = new PhoneDriver(browser, { webUrl: this.target.webUrl, room: opts.room, index: i, runDir: this.runDir, extraQuery: this.target.extraQuery, onFrame: (p, dir, payload) => this.onFrame(p, dir, payload) });
        try {
          await phone.open();
        } catch (error) {
          const body = await phone.page?.evaluate(() => document.body.innerText.slice(0, 300)).catch(() => '');
          throw new Error(`phone ${i + 1} could not join room ${opts.room}: ${String(error.message).split(/\r?\n/)[0]}. Page said: ${JSON.stringify(body)}. Is the room code right and the room still in its lobby?`);
        }
        this.phones.push(phone);
        this.log('joined', 'phone is in the lobby', i + 1);
      }
      this.watcher = this.watchScreens();
      await this.waitForEnd();
    } finally {
      this.ended ??= { verdict: 'aborted', reason: 'harness error' };
      await this.watcher?.catch(() => {});
      await Promise.allSettled(this.phones.map((p) => p.shot('real-final').catch(() => {})));
      await Promise.allSettled(this.phones.map((p) => p.close()));
      await browser.close().catch(() => {});
      await this.recorder.close();
    }
    return this.finish(runId);
  }

  async waitForEnd() {
    const { opts } = this;
    const deadline = this.t0 + opts.timeoutMin * 60000;
    while (!this.ended) {
      await sleep(1000);
      const now = Date.now();
      // Every phone is on the "Connection lost / room ended" banner and none shows a game screen: the room is gone (D-110).
      const lost = this.phones.every((p) => /reconnecting|room-ended/.test(this.screens.get(p.index + 1) ?? '') && !/screen-|mg-|console-|pilot-/.test(this.screens.get(p.index + 1) ?? ''));
      if (!lost) this.allLostSince = null; else this.allLostSince ??= now;
      const roomGone = this.allLostSince && now - this.allLostSince > 30000;
      if (this.reachedDebriefAt && now - this.reachedDebriefAt > opts.lingerSec * 1000) this.ended = { verdict: 'completed', reason: `debrief reached and shown for ${opts.lingerSec} s` };
      else if (now > deadline) this.ended = { verdict: 'timeout', reason: `no end after ${opts.timeoutMin} min` };
      else if (roomGone) this.ended = { verdict: 'room_ended', reason: `every phone has shown the lost-connection / room-ended banner for over 30 s (last phase ${this.currentPhaseSig ?? 'none'})` };
      else if (!this.reachedDebriefAt && (now - this.lastProgressAt) / 1000 > stallLimitSec(this.currentPhase, opts)) {
        this.ended = { verdict: 'stalled', reason: `no session progress for ${Math.round((now - this.lastProgressAt) / 1000)} s; last progress frame ${this.lastProgress}` };
      }
    }
    this.log('end', `${this.ended.verdict}: ${this.ended.reason}`);
  }

  finish(runId) {
    const phases = [...this.phasesSeen.values()].map((p) => ({ ...p, phones: [...p.phones].sort() }));
    const summary = {
      runId, room: this.opts.room, phones: this.opts.phones, server: this.target.wsUrl, phonePage: this.target.webUrl,
      verdict: this.ended.verdict, reason: this.ended.reason,
      stoppedAt: this.ended.verdict === 'completed' ? null : { phase: this.currentPhaseSig ?? 'no phase.set received', sinceSec: Number(((Date.now() - this.currentPhaseAt) / 1000).toFixed(1)), phoneScreens: Object.fromEntries(this.screens) },
      durationSec: Number(((Date.now() - this.t0) / 1000).toFixed(1)),
      phasesSeen: phases, answered: this.answered, frameTypeCounts: this.counts,
      protocolFrames: this.recorder.counts, failures: this.failures,
      note: 'The harness only answers; it never sends a host message or drives a phase. Phone input is generic and not tuned to win.',
    };
    fs.writeFileSync(path.join(this.runDir, 'run-summary.json'), JSON.stringify(summary, null, 2));
    fs.writeFileSync(path.join(this.runDir, 'timeline.log'), this.timeline.map((r) => `${r.at} +${r.tSec}s ${r.phone ? `phone${r.phone} ` : ''}${r.kind}: ${r.detail}`).join('\n') + '\n');
    return { summary, runDir: this.runDir };
  }
}

export async function main(argv) {
  const opts = parseArgs(argv);
  if (opts.errors.length) {
    console.error(opts.errors.join('\n'));
    console.error('Usage: node run.mjs --real-host --room CODE --server ws://localhost:10000/ws --phones 3 [--phone-base URL] [--stall-seconds 180] [--lobby-wait-minutes 30] [--timeout-minutes 60] [--headed]');
    process.exitCode = 2;
    return;
  }
  let result;
  try {
    result = await new RealHostRun(opts).run();
  } catch (error) {
    console.error(`real-host run failed: ${error.message}`);
    process.exitCode = 2;
    return;
  }
  const { summary, runDir } = result;
  console.log(JSON.stringify({ ok: summary.verdict === 'completed', verdict: summary.verdict, reason: summary.reason, stoppedAt: summary.stoppedAt, phases: summary.phasesSeen.map((p) => `${p.tSec}s ${p.signature}`), answered: summary.answered, evidence: runDir }, null, 2));
  process.exitCode = summary.verdict === 'completed' ? 0 : 1;
}
