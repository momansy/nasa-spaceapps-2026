import fs from 'node:fs';

const percentile = (values, p) => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return Number(sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))].toFixed(3));
};
const stats = (values) => ({ n: values.length, p50: percentile(values, 50), p95: percentile(values, 95), max: values.length ? Number(Math.max(...values).toFixed(3)) : null });

export function calculateMetrics(frameFile) {
  const frames = fs.readFileSync(frameFile, 'utf8').trim().split(/\r?\n/).filter(Boolean).map(JSON.parse);
  const byConn = new Map();
  for (const frame of frames) {
    if (!byConn.has(frame.connId)) byConn.set(frame.connId, []);
    byConn.get(frame.connId).push(frame);
  }
  const voteAck = [], voteTally = [], poll = [], seqGaps = [];
  const rates = {};
  const bytesPerSecond = {};
  for (const [connId, rows] of byConn) {
    const ordered = [...rows].sort((a, b) => a.tsMonoMs - b.tsMonoMs);
    const pendingVotes = [];
    const pendingPoll = [];
    for (const f of ordered) {
      if (f.direction === 'client_to_server' && f.t === 'vote.cast') pendingVotes.push(f);
      if (f.direction === 'server_to_client' && f.t === 'vote.ack') {
        const sent = [...pendingVotes].reverse().find((x) => x.d.roundId === f.d.roundId);
        if (sent) voteAck.push(f.tsMonoMs - sent.tsMonoMs);
      }
      if (f.direction === 'server_to_client' && f.t === 'vote.tally') {
        for (const sent of pendingVotes.filter((x) => !x.tallied && x.d.roundId === f.d.roundId)) { voteTally.push(f.tsMonoMs - sent.tsMonoMs); sent.tallied = true; }
      }
      if (f.direction === 'client_to_server' && f.t === 'poll.answer') pendingPoll.push(f);
      if (f.direction === 'server_to_client' && f.t === 'poll.answered') {
        const sent = [...pendingPoll].reverse().find((x) => x.d.pollId === f.d.pollId);
        if (sent) poll.push(f.tsMonoMs - sent.tsMonoMs);
      }
    }
    const durationS = Math.max(1, (ordered.at(-1).tsMonoMs - ordered[0].tsMonoMs) / 1000);
    bytesPerSecond[connId] = Number((ordered.filter((f) => f.direction === 'server_to_client').reduce((n, f) => n + f.bytes, 0) / durationS).toFixed(2));
    for (const type of ['flight.hud', 'console.telemetry', 'vote.tally', 'pilot.hud']) {
      const incoming = ordered.filter((f) => f.direction === 'server_to_client' && f.t === type);
      const windows = incoming.map((f) => incoming.filter((x) => x.tsMonoMs >= f.tsMonoMs && x.tsMonoMs < f.tsMonoMs + 1000).length);
      rates[`${connId}:${type}`] = windows.length ? Math.max(...windows) : 0;
    }
    for (const direction of ['client_to_server', 'server_to_client']) {
      const seqs = ordered.filter((f) => f.direction === direction && Number.isInteger(f.seq)).map((f) => f.seq);
      for (let i = 1; i < seqs.length; i += 1) if (seqs[i] !== seqs[i - 1] + 1) seqGaps.push({ connId, direction, before: seqs[i - 1], after: seqs[i] });
    }
  }
  const mgRelay = [];
  const sentMg = frames.filter((f) => f.direction === 'client_to_server' && f.t === 'mg.result');
  const hostMg = frames.filter((f) => f.role === 'host' && f.direction === 'server_to_client' && f.t === 'relay' && f.d?.t === 'mg.result');
  for (const sent of sentMg) {
    const relayed = hostMg.find((f) => f.tsMonoMs >= sent.tsMonoMs && f.d?.d?.runId === sent.d?.runId);
    if (relayed) mgRelay.push(relayed.tsMonoMs - sent.tsMonoMs);
  }
  return {
    frames: { total: frames.length, valid: frames.filter((f) => f.envelopeValid && f.payloadValid).length, invalid: frames.filter((f) => !(f.envelopeValid && f.payloadValid)).length, unknownTypes: frames.filter((f) => f.unknownType).length },
    latencyMs: { voteCastToAck: stats(voteAck), voteCastToTally: stats(voteTally), pollAnswerToAnswered: stats(poll), mgResultRelayed: stats(mgRelay) },
    messageRateHzMax: rates,
    bytesPerSecond,
    errors: {
      protocolErrorFrames: frames.filter((f) => f.t === 'error').reduce((groups, f) => { const code = f.d?.code ?? 'UNKNOWN'; (groups[code] ??= []).push({ connId: f.connId, seq: f.seq, d: f.d }); return groups; }, {}),
      schemaViolations: frames.filter((f) => !(f.envelopeValid && f.payloadValid)).map((f) => ({ connId: f.connId, t: f.t, seq: f.seq, errors: f.errors })),
      unknownTypes: frames.filter((f) => f.unknownType).map((f) => ({ connId: f.connId, t: f.t, seq: f.seq })),
      seqGaps,
    },
  };
}
