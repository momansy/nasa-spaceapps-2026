// Load script (T004 acceptance): one fake host, 10 fake players, 50 fake spectators run a full
// scripted session over real WebSockets against a real server instance, and the script prints
// vote round-trip times. Run with `npm run simulate` (starts its own server on an ephemeral port).
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import WebSocket from 'ws';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.SIMULATE_PORT ?? 8821);
const PLAYER_COUNT = 10;
const SPECTATOR_COUNT = 50;

function connectClient(url, client) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    const queue = [];
    const waiters = [];
    ws.on('message', (raw) => {
      const msg = JSON.parse(raw.toString());
      if (msg.t === 'error') console.error(`[${client}] server error:`, msg.d);
      const waiter = waiters.find((w) => w.type === msg.t);
      if (waiter) {
        waiters.splice(waiters.indexOf(waiter), 1);
        clearTimeout(waiter.timer);
        waiter.resolve(msg.d);
      } else {
        queue.push(msg);
      }
    });
    ws.on('error', reject);
    ws.state = { queue, waiters, seq: 0 };
    ws.on('open', () => resolve(ws));
    void client;
  });
}

function send(ws, t, d) {
  ws.state.seq += 1;
  ws.send(JSON.stringify({ t, seq: ws.state.seq, d }));
}

function waitFor(ws, type, timeoutMs = 8000) {
  const { queue } = ws.state;
  const idx = queue.findIndex((m) => m.t === type);
  if (idx !== -1) {
    const [msg] = queue.splice(idx, 1);
    return Promise.resolve(msg.d);
  }
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout waiting for ${type}`)), timeoutMs);
    ws.state.waiters.push({ type, resolve, timer });
  });
}

function waitForVoteStage(ws, stage, timeoutMs = 8000) {
  const { queue } = ws.state;
  const idx = queue.findIndex((m) => m.t === 'vote.stage' && m.d.stage === stage);
  if (idx !== -1) {
    const [msg] = queue.splice(idx, 1);
    return Promise.resolve(msg.d);
  }
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout waiting for vote.stage ${stage}`)), timeoutMs);
    const onMsg = (raw) => {
      const msg = JSON.parse(raw.toString());
      if (msg.t === 'vote.stage' && msg.d.stage === stage) {
        clearTimeout(timer);
        ws.off('message', onMsg);
        resolve(msg.d);
      }
    };
    ws.on('message', onMsg);
  });
}

function drain(ws, type) {
  const { queue } = ws.state;
  for (let i = queue.length - 1; i >= 0; i--) if (queue[i].t === type) queue.splice(i, 1);
}

async function startServer() {
  const child = spawn(process.execPath, ['--import', 'tsx', path.join(__dirname, '..', 'src', 'index.ts')], {
    cwd: path.join(__dirname, '..'),
    env: { ...process.env, PORT: String(PORT) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('server did not start in time')), 10000);
    child.stdout.on('data', (chunk) => {
      if (chunk.toString().includes('listening')) {
        clearTimeout(timer);
        resolve();
      }
    });
    child.stderr.on('data', (chunk) => process.stderr.write(chunk));
    child.on('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`server exited early with code ${code}`));
    });
  });
  return child;
}

function percentile(values, p) {
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx] ?? 0;
}

async function main() {
  console.log(`Starting room server on ws://localhost:${PORT} ...`);
  const server = await startServer();
  const url = `ws://localhost:${PORT}`;

  try {
    const t0 = Date.now();
    const host = await connectClient(url, 'host');
    send(host, 'hello', { protocolVersion: 1, client: 'HOST', appVersion: 'simulate-0.1' });
    await waitFor(host, 'hello.ok');
    send(host, 'room.create', {});
    const created = await waitFor(host, 'room.created');
    await waitFor(host, 'snapshot.end');
    console.log(`Room ${created.room} created (${Date.now() - t0} ms).`);

    const players = [];
    for (let i = 0; i < PLAYER_COUNT; i++) {
      const ws = await connectClient(url, `player${i}`);
      send(ws, 'hello', { protocolVersion: 1, client: 'PHONE', appVersion: 'simulate-0.1' });
      await waitFor(ws, 'hello.ok');
      send(ws, 'room.join', {
        room: created.room,
        as: 'PLAYER',
        nickname: `Player ${i + 1}`,
        avatar: { suitId: 'suit_orange', patchId: 'patch_comet' },
      });
      const joined = await waitFor(ws, 'room.joined');
      await waitFor(ws, 'snapshot.end');
      players.push({ ws, id: joined.id });
    }
    console.log(`${players.length} players joined.`);

    const spectators = [];
    for (let i = 0; i < SPECTATOR_COUNT; i++) {
      const ws = await connectClient(url, `spectator${i}`);
      send(ws, 'hello', { protocolVersion: 1, client: 'PHONE', appVersion: 'simulate-0.1' });
      await waitFor(ws, 'hello.ok');
      send(ws, 'room.join', { room: created.room, as: 'SPECTATOR' });
      await waitFor(ws, 'room.joined');
      await waitFor(ws, 'snapshot.end');
      spectators.push(ws);
    }
    console.log(`${spectators.length} spectators joined.`);

    send(host, 'roles.lock', {});
    await waitFor(host, 'roles.state');
    console.log('Roles locked (1 role per player at 10 players).');

    // Run several PART vote rounds (ties, vetoes, plurality) and measure vote.cast -> vote.ack
    // round-trip time for every player and every round.
    const roundTrips = [];
    const spectatorTrips = [];
    const ROUNDS = 5;
    for (let r = 0; r < ROUNDS; r++) {
      const roundId = `r${r}`;
      send(host, 'vote.open', {
        roundId,
        kind: 'PART',
        subjectId: 'first_stage_engine',
        title: { key: 'vote.title.engine' },
        why: null,
        ownerRoles: ['BOOSTER'],
        options: [
          { id: 'eng_a', partId: 'eng_a', label: null, costM: 2, afford: 'OK', overBudgetByM: 0, overScheduleByDays: 0, willNotFly: false, fixExists: false, warnings: [], deltas: [] },
          { id: 'eng_b', partId: 'eng_b', label: null, costM: 3, afford: 'OK', overBudgetByM: 0, overScheduleByDays: 0, willNotFly: false, fixExists: false, warnings: [], deltas: [] },
          { id: 'eng_c', partId: 'eng_c', label: null, costM: 4, afford: 'OK', overBudgetByM: 0, overScheduleByDays: 0, willNotFly: false, fixExists: false, warnings: [], deltas: [] },
        ],
        defaultOptionId: null,
        hint: null,
        predict: null,
        trivia: { id: 'F01', prompt: { key: 'q' }, choices: [{ key: 'c0' }, { key: 'c1' }], correctIndex: 0 },
        coinSeed: r,
        timers: { revealMs: 50, inspectMs: 50, voteMs: 3000 },
      });
      await Promise.all(players.map((p) => waitFor(p.ws, 'vote.opened')));
      await Promise.all(players.map((p) => waitForVoteStage(p.ws, 'REVEAL')));
      await Promise.all(players.map((p) => waitForVoteStage(p.ws, 'INSPECT')));
      await Promise.all(players.map((p) => waitForVoteStage(p.ws, 'VOTE')));

      const options = ['eng_a', 'eng_b', 'eng_c'];
      // The 50 spectators vote first (audience ballots, advisory) and each waits for its own ack.
      await Promise.all(
        spectators.map((ws, i) => {
          const t = Date.now();
          send(ws, 'vote.cast', { roundId, optionId: options[i % options.length] });
          return waitFor(ws, 'vote.ack').then(() => spectatorTrips.push(Date.now() - t));
        }),
      );
      await Promise.all(
        players.map((p, i) => {
          const t = Date.now();
          const optionId = options[i % options.length];
          send(p.ws, 'vote.cast', { roundId, optionId });
          return waitFor(p.ws, 'vote.ack').then(() => roundTrips.push(Date.now() - t));
        }),
      );
      await waitFor(host, 'vote.result');
      await waitForVoteStage(host, 'CLOSED'); // the round must fully close before the next vote.open
      for (const p of players) {
        drain(p.ws, 'vote.stage');
        drain(p.ws, 'vote.result');
      }
      drain(host, 'vote.stage');
      console.log(`Round ${r + 1}/${ROUNDS}: cast ${players.length} ballots.`);
    }

    console.log('\nVote cast -> ack round-trip times (ms):');
    console.log(`  n = ${roundTrips.length}`);
    console.log(`  min    = ${Math.min(...roundTrips)}`);
    console.log(`  p50    = ${percentile(roundTrips, 50)}`);
    console.log(`  p95    = ${percentile(roundTrips, 95)}`);
    console.log(`  max    = ${Math.max(...roundTrips)}`);
    const over200 = roundTrips.filter((x) => x > 200).length;
    console.log(`  over 200ms target (§17.8): ${over200}/${roundTrips.length}`);
    console.log('\nSpectator (audience) vote.cast -> vote.ack round-trip times (ms):');
    console.log(`  n = ${spectatorTrips.length}  p50 = ${percentile(spectatorTrips, 50)}  p95 = ${percentile(spectatorTrips, 95)}  max = ${Math.max(...spectatorTrips)}`);

    // A GO/NO-GO poll calling every connected role.
    send(host, 'poll.open', { pollId: 'poll1', context: 'FRR', round: 1, order: ['FLIGHT', 'BOOSTER', 'STRUCT', 'GUIDO', 'FIDO', 'EECOM', 'INCO', 'PAYLOAD', 'RETRO', 'PM'], perCallMs: 3000 });
    for (let i = 0; i < PLAYER_COUNT; i++) {
      const call = await waitFor(host, 'poll.call');
      const player = players.find((p) => p.id === call.playerId);
      send(player.ws, 'poll.answer', { pollId: 'poll1', answer: 'GO' });
      drain(host, 'poll.answered');
    }
    const pollResult = await waitFor(host, 'poll.result');
    console.log(`\nGO/NO-GO poll: allGo=${pollResult.allGo}, answers=${pollResult.answers.length}`);

    // Pings and reactions from every player and spectator, broadcast-fan-out sanity check.
    const fanoutStart = Date.now();
    send(players[0].ws, 'ping.send', { pingId: 'AGREED', optionId: null });
    await waitFor(host, 'ping.event');
    await Promise.all(players.slice(1).map((p) => waitFor(p.ws, 'ping.event')));
    console.log(`Ping fan-out to ${players.length - 1} other players + host: ${Date.now() - fanoutStart} ms`);

    console.log('\nLoad script completed successfully.');
    for (const p of players) p.ws.close();
    for (const s of spectators) s.close();
    host.close();
  } finally {
    server.kill();
  }
}

main().catch((e) => {
  console.error('Load script failed:', e);
  process.exitCode = 1;
});
