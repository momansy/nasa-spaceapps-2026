// Prints the measurement tables of RESULTS.md for the given run directories (T036).
//   node summarize.mjs <runDir> [<runDir> ...]
import fs from 'node:fs';
import path from 'node:path';

const f = (n) => (n == null ? 'n/a' : Number(n).toFixed(1));
const lat = (o) => (o && o.n ? `${f(o.p50)} / ${f(o.p95)} / ${f(o.max)}` : 'n/a');
const rows = [];
for (const dir of process.argv.slice(2)) {
  const m = JSON.parse(fs.readFileSync(path.join(dir, 'metrics.json'), 'utf8'));
  const s = JSON.parse(fs.readFileSync(path.join(dir, 'run-summary.json'), 'utf8'));
  const rate = (suffix) => Math.max(0, ...Object.entries(m.messageRateHzMax).filter(([k]) => k.endsWith(suffix)).map(([, v]) => v));
  const maxKiB = Math.max(...Object.values(m.bytesPerSecond)) / 1024;
  const fps = [];
  for (const file of fs.readdirSync(dir).filter((x) => /^phone-\d+-diagnostics\.json$/.test(x))) {
    const d = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
    for (const x of d.fps ?? []) fps.push({ ...x, file });
  }
  const avg = fps.length ? fps.reduce((a, b) => a + b.avgFps, 0) / fps.length : null;
  const low = fps.length ? Math.min(...fps.map((x) => x.onePercentLowFps)) : null;
  const consoleErrors = fs.readdirSync(dir).filter((x) => /diagnostics\.json$/.test(x)).reduce((a, x) => { const d = JSON.parse(fs.readFileSync(path.join(dir, x), 'utf8')); return a + d.consoleErrors.length + d.pageErrors.length; }, 0);
  rows.push({ run: path.basename(dir), players: s.playerCount, spectators: s.spectatorCount, ack: lat(m.latencyMs.voteCastToAck), tally: lat(m.latencyMs.voteCastToTally), poll: f(m.latencyMs.pollAnswerToAnswered?.p95), mg: f(m.latencyMs.mgResultRelayed?.p95), hud: rate(':flight.hud'), tel: rate(':console.telemetry'), tallyHz: rate(':vote.tally'), kib: maxKiB.toFixed(2), fps: `${f(avg)} / ${f(low)}`, frames: m.frames.total, invalid: m.frames.invalid, unknown: m.frames.unknownTypes, protoErr: Object.keys(m.errors.protocolErrorFrames).length, seq: m.errors.seqGaps.length, consoleErrors, failures: s.failures.length });
}
console.log('| Players | Spectators | Vote ack p50/p95/max ms | Next tally p50/p95/max ms | Poll p95 ms | MG relay p95 ms | HUD max Hz | Telemetry max Hz | Tally max Hz | Max KiB/s | Phone FPS avg / worst 1% low |');
console.log('|---:|---:|---|---|---:|---:|---:|---:|---:|---:|---|');
for (const r of rows) console.log(`| ${r.players} | ${r.spectators} | ${r.ack} | ${r.tally} | ${r.poll} | ${r.mg} | ${r.hud} | ${r.tel} | ${r.tallyHz} | ${r.kib} | ${r.fps} |`);
console.log('\n| Players | Total frames | Invalid | Unknown types | Protocol error frames | Seq gaps | Console+page errors | Harness failures |');
console.log('|---:|---:|---:|---:|---:|---:|---:|---:|');
for (const r of rows) console.log(`| ${r.players} | ${r.frames} | ${r.invalid} | ${r.unknown} | ${r.protoErr} | ${r.seq} | ${r.consoleErrors} | ${r.failures} |`);
