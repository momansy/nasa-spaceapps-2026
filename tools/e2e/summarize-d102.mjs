// Aggregate T047's six D-102 comparison runs and correlate the x4 CPU profile with
// PerformanceObserver long tasks. Writes machine-readable evidence beside REPORT.md.
import fs from 'node:fs';
import path from 'node:path';
import { evidenceDir } from './lib/paths.mjs';

const runsDir = path.join(evidenceDir, 'runs');
const read = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const round = (n) => n == null ? null : Number(n.toFixed(1));
const overlap = (a0, a1, b0, b1) => a0 <= b1 && b0 <= a1;
const cpuSummary = (samples) => {
  const values = samples.map((sample) => sample.loadPct).filter((value) => value != null).sort((a, b) => a - b);
  if (!values.length) return { samples: 0, meanPct: null, p95Pct: null, maxPct: null };
  return { samples: values.length, meanPct: round(values.reduce((sum, value) => sum + value, 0) / values.length), p95Pct: values[Math.min(values.length - 1, Math.floor(values.length * 0.95))], maxPct: values.at(-1) };
};

function documents(diagnostics) {
  const last = new Map();
  for (const snapshot of diagnostics.performanceSnapshots ?? []) if (snapshot.perf) last.set(snapshot.document, snapshot);
  return last;
}

function comparisonRow(dir, summary) {
  const diagnostics = read(path.join(dir, 'phone-1-diagnostics.json'));
  const machineCpu = read(path.join(dir, 'machine-cpu.json'));
  const docs = documents(diagnostics);
  const parts = (diagnostics.screenshots ?? []).filter((shot) => /^part-vote-\d+$/.test(shot.shot)).map((shot) => {
    const snapshot = docs.get(shot.document);
    const origin = snapshot?.timeOriginMs ?? null;
    const start = Date.parse(shot.startedAt);
    const end = Date.parse(shot.endedAt);
    const gaps = origin == null ? [] : (snapshot.perf.timerGaps ?? []).filter((gap) => {
      const gapEnd = origin + gap.atMs;
      return gap.screen === 'vote' && overlap(start, end, gapEnd - gap.gapMs, gapEnd);
    });
    const tasks = origin == null ? [] : (snapshot.perf.longTasks ?? []).filter((task) => {
      const taskStart = origin + task.startMs;
      return task.durationMs > 50 && task.screen === 'vote' && overlap(start, end, taskStart, taskStart + task.durationMs);
    });
    const vote = summary.voteMeasurements?.find((item) => item.roundId === `m1.part.${shot.shot.split('-').at(-1)}`);
    const fallbackCpu = cpuSummary(machineCpu.samples.filter((sample) => sample.atMs >= start && sample.atMs <= end));
    return {
      roundId: `m1.part.${shot.shot.split('-').at(-1)}`,
      screenshotMs: shot.durationMs,
      screenshotOutcome: shot.outcome,
      probeEvalMs: shot.probeEvalMs ?? null,
      longestMainThreadGapMs: round(Math.max(0, ...gaps.map((gap) => gap.gapMs))),
      estimatedStallMs: round(Math.max(0, ...gaps.map((gap) => gap.excessMs))),
      longTasksOver50Ms: tasks.map((task) => round(task.durationMs)),
      machineCpu: vote?.machineCpu ?? fallbackCpu,
      machineCpuSource: vote?.machineCpu ? 'vote-milestone-window' : 'screenshot-window-fallback',
    };
  });
  return {
    runId: summary.runId,
    mode: summary.phoneProcessMode,
    failures: summary.failures.length,
    phone1PartVotes: parts,
    runMachineCpu: summary.machineCpu,
  };
}

function profileAnalysis(dir, summary) {
  const diagnostics = read(path.join(dir, 'phone-1-diagnostics.json'));
  const wrapped = read(path.join(dir, 'phone-1-vote-cpu-profile.json'));
  const profile = wrapped.profile;
  const snapshot = [...documents(diagnostics).values()].at(-1);
  const origin = snapshot.timeOriginMs;
  const startPerfMs = Date.parse(wrapped.startedAt) - origin;
  const endPerfMs = Date.parse(wrapped.endedAt) - origin;
  const nodes = new Map(profile.nodes.map((node) => [node.id, node]));
  const parents = new Map();
  for (const node of profile.nodes) for (const child of node.children ?? []) parents.set(child, node.id);
  const samples = [];
  let atMs = startPerfMs;
  for (let i = 0; i < profile.samples.length; i += 1) {
    const deltaMs = (profile.timeDeltas[i] ?? 0) / 1000;
    atMs += deltaMs;
    samples.push({ atMs, deltaMs, node: nodes.get(profile.samples[i]) });
  }
  const ignored = new Set(['(root)', '(idle)', '(program)', '(garbage collector)']);
  // The milestone hook runs only after the server reaches VOTE; include the preceding REVEAL/INSPECT render.
  const partWindows = summary.milestones.filter((item) => item.kind === 'PART' || item.roundId === 'm1.test').map((item) => ({ roundId: item.roundId, atMs: Date.parse(item.at) - origin - 1000 }));
  const tasks = (snapshot.perf.longTasks ?? []).filter((task) => task.durationMs > 50 && task.screen === 'vote' && task.startMs >= startPerfMs && task.startMs <= endPerfMs).map((task) => {
    const self = new Map();
    for (const sample of samples) {
      if (sample.atMs < task.startMs || sample.atMs > task.startMs + task.durationMs) continue;
      const frame = sample.node?.callFrame;
      if (!frame || ignored.has(frame.functionName)) continue;
      const key = `${frame.functionName || '(anonymous)'} | ${path.basename(new URL(frame.url || 'file:///native').pathname)}:${frame.lineNumber + 1}:${frame.columnNumber + 1}`;
      self.set(key, (self.get(key) ?? 0) + sample.deltaMs);
    }
    const responsible = [...self].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([frame, selfMs]) => ({ frame, selfMs: round(selfMs) }));
    const windowIndex = partWindows.findLastIndex((item) => item.atMs <= task.startMs);
    const roundId = windowIndex >= 0 && partWindows[windowIndex].roundId !== 'm1.test' ? partWindows[windowIndex].roundId : 'between-rounds';
    return { roundId, startMs: round(task.startMs), durationMs: round(task.durationMs), responsible };
  });
  const allSelf = new Map();
  for (const sample of samples) {
    const frame = sample.node?.callFrame;
    if (!frame || ignored.has(frame.functionName)) continue;
    const key = `${frame.functionName || '(anonymous)'} | ${path.basename(new URL(frame.url || 'file:///native').pathname)}:${frame.lineNumber + 1}:${frame.columnNumber + 1}`;
    allSelf.set(key, (allSelf.get(key) ?? 0) + sample.deltaMs);
  }
  const chainFor = (node) => {
    const chain = [];
    let current = node;
    while (current && chain.length < 20) {
      const frame = current.callFrame;
      if (frame.functionName && !ignored.has(frame.functionName)) chain.push(`${frame.functionName} | ${path.basename(new URL(frame.url || 'file:///native').pathname)}:${frame.lineNumber + 1}:${frame.columnNumber + 1}`);
      current = nodes.get(parents.get(current.id));
    }
    return chain;
  };
  const topSelf = [...allSelf].sort((a, b) => b[1] - a[1]).slice(0, 20).map(([frame, selfMs]) => ({ frame, selfMs: round(selfMs) }));
  const timerGaps = (snapshot.perf.timerGaps ?? []).filter((gap) => gap.screen === 'vote' && gap.atMs >= startPerfMs && gap.atMs <= endPerfMs);
  const hotCallChains = topSelf.slice(0, 10).map((hot) => {
    const [name, location] = hot.frame.split(' | ');
    const node = profile.nodes.find((item) => item.callFrame.functionName === name && `${path.basename(new URL(item.callFrame.url || 'file:///native').pathname)}:${item.callFrame.lineNumber + 1}:${item.callFrame.columnNumber + 1}` === location);
    return { selfMs: hot.selfMs, chain: node ? chainFor(node) : [hot.frame] };
  });
  return {
    runId: summary.runId,
    phone: summary.profileVotePhone,
    cpuThrottleRate: summary.profileCpuRate,
    browserMode: summary.phoneProcessMode,
    longestMainThreadGapMs: round(Math.max(0, ...timerGaps.map((gap) => gap.gapMs))),
    estimatedStallMs: round(Math.max(0, ...timerGaps.map((gap) => gap.excessMs))),
    longTasksOver50Ms: tasks,
    topProfileSelfTime: topSelf,
    hotCallChains,
  };
}

const comparisons = [];
let profile = null;
const entries = fs.readdirSync(runsDir, { withFileTypes: true }).filter((entry) => entry.isDirectory()).sort((a, b) => a.name.localeCompare(b.name));
for (const entry of entries) {
  const dir = path.join(runsDir, entry.name);
  const summaryFile = path.join(dir, 'run-summary.json');
  if (!fs.existsSync(summaryFile)) continue;
  const summary = read(summaryFile);
  if (summary.playerCount !== 10) continue;
  if (summary.segment === 'vote-profile' && summary.renderedPages === 1 && summary.profileVotePhone) profile = profileAnalysis(dir, summary);
  else if (!summary.profileVotePhone && summary.segment === 'full' && fs.existsSync(path.join(dir, 'machine-cpu.json'))) comparisons.push(comparisonRow(dir, summary));
}
comparisons.sort((a, b) => a.runId.localeCompare(b.runId));
const output = { generatedAt: new Date().toISOString(), comparisonRuns: comparisons, profile };
fs.writeFileSync(path.join(evidenceDir, 'MEASUREMENTS.json'), JSON.stringify(output, null, 2));
console.log(JSON.stringify(output, null, 2));
