import fs from 'node:fs';
import path from 'node:path';
import WebSocket from 'ws';
import { e2eDir, schemaDir } from '../lib/paths.mjs';

const minigameData = new Map(JSON.parse(fs.readFileSync(path.join(e2eDir, '..', '..', 'data', 'minigames.json'), 'utf8')).minigames.map((m) => [m.id, m]));
const MG_TYPE = { parallel_solo: 'PARALLEL_SOLO', cooperative_split: 'COOP_SPLIT', cooperative: 'COOP_SPLIT', team_sync: 'TEAM_SYNC', relay: 'RELAY' };
const fixture = JSON.parse(fs.readFileSync(path.join(e2eDir, 'fixtures', 'c1', 'script.json'), 'utf8'));
const ROLES = ['FLIGHT', 'BOOSTER', 'STRUCT', 'GUIDO', 'FIDO', 'EECOM', 'INCO', 'PAYLOAD', 'RETRO', 'PM'];
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function schemaExample(type) {
  const schema = JSON.parse(fs.readFileSync(path.join(schemaDir, `${type}.schema.json`), 'utf8'));
  if (!schema.examples?.[0]) throw new Error(`No schema example for ${type}`);
  return structuredClone(schema.examples[0]);
}

function option(id, i = 0) {
  return {
    id,
    partId: id.startsWith('C') || ['TEST', 'SKIP', 'PASS', 'REWORK'].includes(id) ? null : id,
    label: id.startsWith('C') || ['TEST', 'SKIP', 'PASS', 'REWORK'].includes(id) ? { key: `e2e.${id}` } : null,
    costM: 3 + i,
    afford: 'OK',
    overBudgetByM: 0,
    overScheduleByDays: 0,
    willNotFly: false,
    fixExists: false,
    warnings: [],
    deltas: [
      { metric: 'TOTAL_DV_MS', value: 9700 + i * 25, delta: i * 25, rating: i === 0 ? 'NEUTRAL' : 'GOOD' },
      { metric: 'COST_M', value: 76 + i, delta: 3 + i, rating: 'NEUTRAL' },
    ],
  };
}

export class ScriptedHost {
  constructor(url, { seed = 2801, audienceVoteWeight = 0 } = {}) {
    this.url = url;
    this.seed = seed >>> 0;
    this.audienceVoteWeight = audienceVoteWeight;
    this.ws = null;
    this.seq = 0;
    this.queue = [];
    this.waiters = [];
    this.room = null;
    this.token = null;
    this.playerIds = [];
    this.outcomeSeq = 0;
    this.heartbeat = null;
    this.segments = [];
    this.mgResults = new Map();
    this.mgLog = [];
    this.relayCounts = {};
  }

  async connect({ resume = false } = {}) {
    this.ws = await new Promise((resolve, reject) => {
      const ws = new WebSocket(this.url);
      ws.once('open', () => resolve(ws));
      ws.once('error', reject);
    });
    this.seq = 0;
    this.ws.on('message', (raw) => this.#receive(JSON.parse(raw.toString())));
    this.send('hello', { protocolVersion: 1, client: 'HOST', appVersion: 't028-e2e' });
    await this.waitFor('hello.ok');
    if (resume) {
      this.send('room.resume', { room: this.room, token: this.token, lastOutcomeSeq: this.outcomeSeq });
      await this.waitFor('room.resumed');
      await this.waitFor('snapshot.end');
    } else {
      this.send('room.create', { settings: { audienceVoteWeight: this.audienceVoteWeight, a11y: { slowTimers: false, relaxedMinigames: true, reducedMotion: true, highContrast: false, subtitles: true, explainTooltips: false } } });
      const created = await this.waitFor('room.created');
      this.room = created.room;
      this.token = created.hostToken;
      await this.waitFor('snapshot.end');
    }
    clearInterval(this.heartbeat);
    this.heartbeat = setInterval(() => this.ws?.readyState === WebSocket.OPEN && this.send('clock.ping', { clientTimeMs: Date.now() }), 4000);
    return this.room;
  }

  #receive(msg) {
    if (msg.d?.outcomeSeq) this.outcomeSeq = Math.max(this.outcomeSeq, msg.d.outcomeSeq);
    if (msg.t === 'relay') this.relayCounts[msg.d?.t] = (this.relayCounts[msg.d?.t] ?? 0) + 1;
    if (msg.t === 'relay' && msg.d?.t === 'mg.result') {
      const rows = this.mgResults.get(msg.d.d.runId) ?? new Map();
      rows.set(msg.d.from, msg.d.d); this.mgResults.set(msg.d.d.runId, rows);
    }
    if (msg.t === 'room.state') this.playerIds = msg.d.players.map((p) => p.id);
    const waiter = this.waiters.find((w) => w.type === msg.t && (!w.predicate || w.predicate(msg.d)));
    if (waiter) {
      this.waiters.splice(this.waiters.indexOf(waiter), 1);
      clearTimeout(waiter.timer);
      waiter.resolve(msg.d);
    } else this.queue.push(msg);
  }

  send(t, d) {
    this.seq += 1;
    this.ws.send(JSON.stringify({ t, seq: this.seq, d }));
  }

  waitFor(type, predicate = null, timeoutMs = 20000) {
    const index = this.queue.findIndex((m) => m.t === type && (!predicate || predicate(m.d)));
    if (index >= 0) return Promise.resolve(this.queue.splice(index, 1)[0].d);
    return new Promise((resolve, reject) => {
      const waiter = { type, predicate, resolve, timer: null };
      waiter.timer = setTimeout(() => {
        this.waiters.splice(this.waiters.indexOf(waiter), 1);
        reject(new Error(`timeout waiting for host ${type}`));
      }, timeoutMs);
      this.waiters.push(waiter);
    });
  }

  phase(phase, { sub = 'NONE', review = null, flightPhase = null, segment = null, contractId = null, step = null } = {}) {
    this.send('phase.set', { missionSeq: 1, mode: this.playerIds.length === 1 ? 'SOLO' : 'QUICK', phase, sub, review, flightPhase, segment, boosterTrack: false, contractId, step });
    this.segments.push(`${phase}${sub !== 'NONE' ? `:${sub}` : ''}${flightPhase ? `:${flightPhase}` : ''}`);
  }

  async smoke(onMilestone = null) {
    this.phase('LOBBY');
    await onMilestone?.('lobby', {});
    await sleep(600);
    this.phase('BRIEFING');
    await onMilestone?.('briefing', {});
    await sleep(1200);
  }

  async vote({ roundId, kind, subject, ids, owner = 'FLIGHT', scenario = null }, hook = null) {
    this.send('vote.open', {
      roundId,
      kind,
      subjectId: subject,
      title: { key: `e2e.vote.${subject}` },
      why: { key: 'e2e.fixture_not_core' },
      ownerRoles: [owner],
      options: ids.map(option),
      defaultOptionId: ids[0],
      hint: null,
      predict: null,
      trivia: { id: 'F01', prompt: { key: 'e2e.trivia' }, choices: [{ key: 'e2e.yes' }, { key: 'e2e.no' }], correctIndex: 0 },
      coinSeed: (this.seed + this.segments.length) >>> 0,
      timers: { revealMs: 80, inspectMs: 180, voteMs: 3000 },
    });
    await this.waitFor('vote.stage', (d) => d.roundId === roundId && d.stage === 'VOTE');
    await hook?.({ roundId, kind, ids, scenario });
    const result = await this.waitFor('vote.result', (d) => d.roundId === roundId, 12000);
    this.send('vote.commit', { roundId, winnerId: result.winnerId, deltas: option(result.winnerId).deltas, codexIds: result.winnerId.startsWith('C') ? [] : [result.winnerId] });
    await this.waitFor('vote.stage', (d) => d.roundId === roundId && d.stage === 'CLOSED');
    this.segments.push(`vote:${roundId}:${result.winnerId}:${scenario ?? 'normal'}`);
    return result;
  }

  async poll(round, hook = null) {
    const pollId = `m1.frr.${round}`;
    this.send('poll.open', { pollId, context: 'FRR', round, order: ROLES, perCallMs: 3000 });
    await hook?.({ pollId, round });
    const result = await this.waitFor('poll.result', (d) => d.pollId === pollId, 40000);
    this.segments.push(`poll:${round}:${result.allGo ? 'all_go' : 'no_go'}`);
    return result;
  }

  /**
   * Start one real minigame on the phones, collect the real `mg.result` relays, and send an honest
   * `mg.summary` built from them (fraction, tier and points are the T011 rules' job in the real host;
   * here tier uses fraction thresholds and points are fixtures, "fixture (not Core)").
   */
  async minigame(id, flightPhase, hook = null, { playMs = null, after = null } = {}) {
    const def = minigameData.get(id);
    if (!def) throw new Error(`unknown minigame ${id}`);
    const type = MG_TYPE[def.type] ?? 'PARALLEL_SOLO';
    const runId = `m1.${id.replace('-', '').toLowerCase()}.${this.segments.length}`;
    const players = [...this.playerIds];
    const durationMs = playMs ?? (type === 'RELAY' ? Math.max(5000, 5000 * players.length) : Math.max(5000, def.duration_s * 1000));
    const startAtMs = Date.now() + 3300;
    const assignments = type === 'PARALLEL_SOLO' ? [] : players.map((playerId, index) => ({ playerId, index, params: {} }));
    this.send('mg.start', {
      runId, minigameId: id, type, seed: (this.seed + this.segments.length) >>> 0,
      startAtMs, durationMs, assistLevel: 'CADET', flightPhase, audience: false,
      params: type === 'RELAY' ? { turnMs: Math.floor(durationMs / Math.max(1, players.length)) } : {}, assignments,
    });
    const records = (await hook?.({ runId, id, durationMs })) ?? [];
    const deadline = startAtMs + durationMs + 2000;
    while (Date.now() < deadline && (this.mgResults.get(runId)?.size ?? 0) < players.length) await sleep(100);
    const results = [...(this.mgResults.get(runId)?.entries() ?? [])];
    const succeededIds = results.filter(([, r]) => r.success).map(([pid]) => pid);
    const perfectIds = results.filter(([, r]) => r.perfect).map(([pid]) => pid);
    const fraction = players.length ? succeededIds.length / players.length : 0;
    const tier = perfectIds.length === players.length && players.length ? 'PLATINUM' : fraction >= 1 ? 'GOLD' : fraction >= 0.5 ? 'SILVER' : fraction > 0 ? 'BRONZE' : 'NONE';
    this.send('mg.summary', {
      runId, minigameId: id, active: players.length, succeeded: succeededIds.length, fraction, tier,
      succeededIds, perfectIds, sparkle: false, boosts: [], syncDelta: succeededIds.length ? 5 : 0, points: succeededIds.length * 100, factId: null,
    });
    this.mgLog.push({ id, runId, type, durationMs, expectedResults: players.length, resultsReceived: results.length, succeeded: succeededIds.length, perfect: perfectIds.length, tier, results: results.map(([pid, r]) => ({ playerId: pid, success: r.success, perfect: r.perfect, score: r.score, value: r.value ?? null, elapsedMs: r.elapsedMs, mode: r.mode })), records });
    await after?.({ runId, id, records });
    await sleep(350);
    this.segments.push(`minigame:${id}:${results.length}/${players.length}results`);
  }

  /** The minigame-only segment: every implemented minigame (or the ids given) through the real phones. */
  async minigames(ids, { onMilestone = null } = {}) {
    this.phase('LOBBY');
    await sleep(500);
    this.send('roles.lock', {});
    await sleep(500);
    this.phase('FLIGHT', { sub: 'FLYING', flightPhase: 'F8', segment: 'ORBIT', contractId: 'C1' });
    for (const id of ids) {
      await this.minigame(id, minigameData.get(id).stage === 'flight' ? 'F8' : null, (d) => onMilestone?.('minigame', d), { after: (d) => onMilestone?.('minigame_summary', d) });
    }
  }

  async full({ onMilestone = null } = {}) {
    const hit = async (name, data = {}) => onMilestone?.(name, data);
    this.phase('LOBBY');
    await hit('lobby');
    await sleep(400);
    this.send('roles.lock', {});
    await this.waitFor('roles.state', (d) => d.locked === true);
    this.phase('BRIEFING');
    await hit('briefing');
    await sleep(500);
    this.phase('CONTRACT_VOTE');
    await this.vote({ roundId: 'm1.contract', kind: 'CONTRACT', subject: 'contract', ids: fixture.contract.options }, (d) => hit('vote', d));
    this.phase('BUILD', { sub: 'VOTE_ROUND', contractId: 'C1', step: { index: 1, total: 7 } });
    await hit('build_started');
    for (let i = 0; i < fixture.part_rounds.length; i += 1) {
      const r = fixture.part_rounds[i];
      this.phase('BUILD', { sub: 'VOTE_ROUND', contractId: 'C1', step: { index: i + 1, total: 7 } });
      await this.vote({ roundId: `m1.part.${i + 1}`, kind: 'PART', subject: r.subject, ids: r.options, owner: r.owner, scenario: r.scenario }, (d) => hit('vote', d));
      const build = schemaExample('build.state');
      build.contractId = 'C1'; build.parts = fixture.part_rounds.slice(0, i + 1).map((x) => ({ category: x.subject, partId: x.options[0], count: 1 }));
      this.send('build.state', build);
    }
    this.phase('BUILD', { sub: 'TEST', contractId: 'C1', step: { index: 6, total: 7 } });
    await this.vote({ roundId: 'm1.test', kind: 'TEST', subject: 'static_fire', ids: ['TEST', 'SKIP'], owner: 'BOOSTER' }, (d) => hit('vote', d));
    this.phase('BUILD', { sub: 'REVIEW', review: 'PDR', contractId: 'C1', step: { index: 7, total: 7 } });
    await this.vote({ roundId: 'm1.pdr', kind: 'REVIEW', subject: 'PDR', ids: ['PASS', 'REWORK'], owner: 'FLIGHT' }, (d) => hit('vote', d));
    this.phase('FRR', { review: 'FRR', contractId: 'C1' });
    await this.poll(1, (d) => hit('poll', d));
    await this.poll(2, (d) => hit('poll', d));
    this.phase('COUNTDOWN', { flightPhase: 'F0', contractId: 'C1' });
    await this.minigame('MG-07', 'F0', (d) => hit('minigame', d), { after: (d) => hit('minigame_summary', d) });
    this.send('pilot.assign', { segment: 'ASCENT', pilotId: null, pilotInput: 'HOST_DEVICE', copilotId: null, boosterPilotId: null, boosterInput: null });
    for (const role of ROLES) {
      const config = schemaExample('console.config'); config.role = role;
      this.send('console.config', config);
    }
    this.send('boost.applied', schemaExample('boost.applied'));
    const flight = [['F2', 'ASCENT', 'MG-08'], ['F3', 'ASCENT', 'MG-09'], ['F4', 'ASCENT', 'MG-10a'], ['F6', 'ORBIT', 'MG-13'], ['F8', 'ORBIT', 'MG-15'], ['F9', 'ORBIT', 'MG-21']];
    for (const [fp, segment, mg] of flight) {
      this.phase('FLIGHT', { sub: 'FLYING', flightPhase: fp, segment, contractId: 'C1' });
      const hud = schemaExample('flight.hud');
      const telemetry = schemaExample('console.telemetry'); telemetry.role = 'STRUCT';
      for (let i = 0; i < 10; i += 1) {
        telemetry.metS += 0.1; this.send('console.telemetry', telemetry);
        if (i % 2 === 0) { hud.metS += 0.2; this.send('flight.hud', hud); }
        await sleep(100);
      }
      if (fp === 'F2') {
        this.send('console.alert', { alertId: 'm1.maxq', role: 'STRUCT', calloutId: 'throttle_down_max_q', arg: null, severity: 'CAUTION', endsAtMs: Date.now() + 3000 });
        await hit('alert');
      }
      if (fp === 'F6') {
        this.send('blackout.set', { active: true, cause: 'OUT_OF_COVERAGE', expectedEndAtMs: Date.now() + 700 });
        await hit('blackout'); await sleep(700);
        this.send('blackout.set', { active: false, cause: null, expectedEndAtMs: null });
      }
      await this.minigame(mg, fp, (d) => hit('minigame', d), { after: (d) => hit('minigame_summary', d) });
    }
    this.send('sync.meter', { value: 50, delta: 25, reason: 'GOLD', momentReady: false });
    this.phase('DEBRIEF', { sub: 'SUMMARY', contractId: 'C1' });
    const score = schemaExample('debrief.score'); score.missionSeq = 1; score.contractId = 'C1';
    this.send('debrief.score', score);
    this.send('debrief.awards', { players: this.playerIds.map((playerId) => ({ playerId, awardIds: ['team_player'], kp: 10, goodCalls: 0, minigameSuccesses: 1, predictionsCorrect: 0 })) });
    this.send('debrief.facts', schemaExample('debrief.facts'));
    await hit('debrief');
    await sleep(1000);
  }

  async disconnectAndResume(ms = 20000) {
    clearInterval(this.heartbeat);
    this.ws.close();
    await sleep(ms);
    await this.connect({ resume: true });
    this.send('game.resume', {});
    await this.waitFor('game.resumed');
  }

  close() {
    clearInterval(this.heartbeat);
    this.ws?.close();
  }
}
