import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { calculateMetrics } from '../lib/metrics.mjs';

test('correlates vote acknowledgement and tally latency', () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'mf-e2e-')), 'frames.ndjson');
  const base = { at: '2026-01-01T00:00:00Z', connId: 'c1', role: 'player', bytes: 10, envelopeValid: true, payloadValid: true, unknownType: false, errors: [] };
  const rows = [
    { ...base, tsMonoMs: 10, direction: 'client_to_server', t: 'vote.cast', seq: 1, d: { roundId: 'r1', optionId: 'a' } },
    { ...base, tsMonoMs: 22, direction: 'server_to_client', t: 'vote.ack', seq: 1, d: { roundId: 'r1', optionId: 'a' } },
    { ...base, tsMonoMs: 40, direction: 'server_to_client', t: 'vote.tally', seq: 2, d: { roundId: 'r1' } },
  ];
  fs.writeFileSync(file, `${rows.map(JSON.stringify).join('\n')}\n`);
  const metrics = calculateMetrics(file);
  assert.equal(metrics.latencyMs.voteCastToAck.p95, 12);
  assert.equal(metrics.latencyMs.voteCastToTally.p95, 30);
  assert.equal(metrics.frames.invalid, 0);
});
