#!/usr/bin/env node
// T027 scripted phones: join N players to a room on the real room server (server/, `npm run dev`) and play the
// pre-flight screens against it: vote in every vote round and answer GO/NO-GO polls when called.
// Protocol only (protocol/messages.md sections 2, 7, 8): hello → room.join → vote.cast on VOTE / RUNOFF stages →
// poll.answer when poll.call names this phone. Unity ignores this folder (name ends in ~). Node 22+ (built-in WebSocket).
//
// Usage:
//   node phones.mjs --room ABCD [--players 4] [--url ws://localhost:8787] [--nogo-rounds 1] [--nogo-player 4]
//                   [--log phones.log] [--minutes 10]
// --room may also be a file path containing the room code (the T027 evidence runner writes room_code.txt).
//
// Ballots are deterministic: phone i votes for option (i % 2 === 0 ? 0 : 1) among the winnable options, so tallies
// differ and a FLIGHT tiebreak or runoff can occur. In the first --nogo-rounds FRR rounds, phone --nogo-player answers
// NO_GO; everyone else answers GO.

import fs from 'node:fs';

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => {
  if (a.startsWith('--')) acc.push([a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : 'true']);
  return acc;
}, []));

const url = args.url ?? 'ws://localhost:8787';
const players = Number(args.players ?? 4);
const noGoRounds = Number(args['nogo-rounds'] ?? 1);
const noGoPlayer = Number(args['nogo-player'] ?? players);
const minutes = Number(args.minutes ?? 10);
const logFile = args.log ?? null;
let room = args.room;
if (!room) { console.error('phones.mjs: --room CODE (or a file containing it) is required'); process.exit(2); }
if (fs.existsSync(room)) room = fs.readFileSync(room, 'utf8').trim();

const lines = [];
function log(text) {
  const line = `${new Date().toISOString().slice(11, 23)} ${text}`;
  lines.push(line);
  console.log(line);
  if (logFile) fs.appendFileSync(logFile, line + '\n');
}

class Phone {
  constructor(index) {
    this.index = index;
    this.seq = 0;
    this.id = null;
    this.rounds = new Map();      // roundId -> vote.opened payload
    this.noGoAnswered = new Set(); // poll rounds this phone answered NO_GO
    this.counts = { votes: 0, answers: 0, errors: 0 };
  }

  send(t, d) {
    this.seq += 1;
    this.ws.send(JSON.stringify({ t, seq: this.seq, d }));
  }

  connect() {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(url);
      this.ws.onerror = (e) => reject(new Error(`phone ${this.index}: socket error ${e.message ?? ''}`));
      this.ws.onopen = () => this.send('hello', { protocolVersion: 1, client: 'PHONE', appVersion: 't027-phones', lang: 'en' });
      this.ws.onmessage = (ev) => {
        const m = JSON.parse(typeof ev.data === 'string' ? ev.data : ev.data.toString());
        if (m.t === 'hello.ok') {
          this.send('room.join', { room, as: 'PLAYER', nickname: `Phone${this.index}`, avatar: { suitId: 'suit_default', patchId: 'patch_default' } });
        } else if (m.t === 'room.joined') {
          this.id = m.d.id;
          this.heartbeat = setInterval(() => this.ws.readyState === 1 && this.send('clock.ping', { clientTimeMs: Date.now() }), 4000);
          log(`phone ${this.index} joined room ${room} as ${this.id}`);
          resolve();
        } else this.receive(m);
      };
    });
  }

  receive(m) {
    const d = m.d ?? {};
    switch (m.t) {
      case 'vote.opened':
        this.rounds.set(d.roundId, d);
        if (this.index === 1) log(`vote.opened ${d.kind} ${d.roundId} options=${(d.options ?? []).map((o) => o.id).join(',')}`);
        break;
      case 'vote.stage': {
        const open = this.rounds.get(d.roundId);
        if (this.index === 1) log(`vote.stage ${d.roundId} ${d.stage}`);
        if (!open || !(d.stage === 'VOTE' || d.stage === 'RUNOFF')) break;
        const allowed = d.candidateIds ?? open.options.map((o) => o.id);
        const winnable = open.options.filter((o) => allowed.includes(o.id) && o.afford !== 'NEVER' && !(o.willNotFly && !o.fixExists));
        const list = winnable.length ? winnable : open.options;
        const pick = list[(this.index % 2 === 0 ? 1 : 0) % list.length];
        setTimeout(() => { this.send('vote.cast', { roundId: d.roundId, optionId: pick.id }); this.counts.votes += 1; }, 400 + this.index * 350);
        break;
      }
      case 'vote.result':
        if (this.index === 1) log(`vote.result ${d.roundId} winner=${d.winnerId} method=${d.method}`);
        break;
      case 'vote.cancelled':
        if (this.index === 1) log(`vote.cancelled ${d.roundId} ${d.reason ?? ''}`);
        break;
      case 'poll.call':
        if (this.index === 1) log(`poll.call ${d.pollId} round ${d.round} ${d.index}/${d.total} -> ${d.playerId} [${(d.roles ?? []).join(',')}]`);
        if (d.playerId === this.id) {
          const noGo = this.index === noGoPlayer && (d.round ?? 1) <= noGoRounds;
          setTimeout(() => { this.send('poll.answer', { pollId: d.pollId, answer: noGo ? 'NO_GO' : 'GO' }); this.counts.answers += 1; }, 700);
        }
        break;
      case 'poll.result':
        if (this.index === 1) log(`poll.result ${d.pollId} round ${d.round} allGo=${d.allGo} noGo=${d.noGoCount}`);
        break;
      case 'phase.set':
        if (this.index === 1) log(`phase.set ${d.phase} sub=${d.sub} review=${d.review ?? ''}`);
        break;
      case 'error':
        this.counts.errors += 1;
        log(`phone ${this.index} error ${d.code} for ${d.reT}`);
        break;
      default:
        break;
    }
  }

  close() {
    clearInterval(this.heartbeat);
    try { this.ws.close(); } catch { /* closing anyway */ }
  }
}

const phones = [];
for (let i = 1; i <= players; i += 1) {
  const p = new Phone(i);
  await p.connect();
  phones.push(p);
}
log(`${players} phones in room ${room}; running ${minutes} min (Ctrl+C to stop)`);
const stop = () => {
  log(`summary: ${phones.map((p) => `phone ${p.index} votes ${p.counts.votes} answers ${p.counts.answers} errors ${p.counts.errors}`).join('; ')}`);
  phones.forEach((p) => p.close());
  process.exit(0);
};
process.on('SIGINT', stop);
setTimeout(stop, minutes * 60_000);
