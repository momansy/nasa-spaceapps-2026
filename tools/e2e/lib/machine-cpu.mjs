import os from 'node:os';

function counters(cpus) {
  let idle = 0;
  let total = 0;
  for (const cpu of cpus) {
    idle += cpu.times.idle;
    total += Object.values(cpu.times).reduce((sum, value) => sum + value, 0);
  }
  return { idle, total };
}

export function cpuPercent(beforeCpus, afterCpus) {
  const before = counters(beforeCpus);
  const after = counters(afterCpus);
  const elapsed = after.total - before.total;
  if (elapsed <= 0) return null;
  return Number((100 * (1 - (after.idle - before.idle) / elapsed)).toFixed(1));
}

function distribution(values) {
  if (!values.length) return { samples: 0, meanPct: null, p95Pct: null, maxPct: null };
  const sorted = [...values].sort((a, b) => a - b);
  return {
    samples: values.length,
    meanPct: Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(1)),
    p95Pct: sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))],
    maxPct: sorted.at(-1),
  };
}

export class MachineCpuMonitor {
  constructor({ intervalMs = 250, read = os.cpus } = {}) {
    this.intervalMs = intervalMs;
    this.read = read;
    this.samples = [];
    this.startedAt = null;
    this.endedAt = null;
    this.previous = null;
    this.timer = null;
  }

  start() {
    if (this.timer) return;
    this.startedAt = new Date().toISOString();
    this.previous = this.read();
    this.timer = setInterval(() => {
      const current = this.read();
      const loadPct = cpuPercent(this.previous, current);
      this.previous = current;
      this.samples.push({ atMs: Date.now(), loadPct });
    }, this.intervalMs);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.endedAt = new Date().toISOString();
  }

  summary(fromMs = -Infinity, toMs = Infinity) {
    return distribution(this.samples.filter((sample) => sample.atMs >= fromMs && sample.atMs <= toMs && sample.loadPct != null).map((sample) => sample.loadPct));
  }
}
