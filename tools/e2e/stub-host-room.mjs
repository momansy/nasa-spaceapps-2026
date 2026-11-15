// T061 self-test of --real-host mode: the stub host (T028) creates a room on a running server and plays the C1 script,
// while `run.mjs --real-host` joins phones and only answers. Proves the answering logic end to end without Unity.
//   node stub-host-room.mjs --server ws://localhost:10000/ws --phones 3        (prints ROOM=XXXX, waits for the phones, then plays)
//   node run.mjs --real-host --room XXXX --server ws://localhost:10000/ws --phones 3
import { ScriptedHost } from './host/scripted-host.mjs';

const argv = process.argv.slice(2);
const value = (n, f) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : f; };
const server = value('--server', 'ws://localhost:10000/ws');
const phones = Number(value('--phones', '3'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const host = new ScriptedHost(server, { seed: Number(value('--seed', '2801')) });
await host.connect();
host.phase('LOBBY');
console.log(`ROOM=${host.room}`);
for (let i = 0; i < 600 && host.playerIds.length < phones; i += 1) await sleep(500);
console.log(`${host.playerIds.length} phones in the room; playing the C1 script`);
await sleep(2000);
try {
  await host.full({});
  console.log('stub host: session finished');
  await sleep(Number(value('--linger-seconds', '25')) * 1000);
} catch (error) {
  console.error(`stub host: ${error.message}`);
  process.exitCode = 1;
}
host.close();
