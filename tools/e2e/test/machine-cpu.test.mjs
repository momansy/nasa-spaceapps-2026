import assert from 'node:assert/strict';
import test from 'node:test';
import { cpuPercent } from '../lib/machine-cpu.mjs';

const cpu = (idle, user, sys = 0) => ({ times: { idle, user, sys, nice: 0, irq: 0 } });

test('calculates total-machine CPU percentage across logical CPUs', () => {
  const before = [cpu(100, 100), cpu(100, 100)];
  const after = [cpu(150, 150), cpu(125, 175)];
  assert.equal(cpuPercent(before, after), 62.5);
});

test('returns null when CPU counters do not advance', () => {
  const sample = [cpu(100, 100)];
  assert.equal(cpuPercent(sample, sample), null);
});
