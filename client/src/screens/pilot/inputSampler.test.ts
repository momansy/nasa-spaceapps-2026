import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { applyDeadZone, DEAD_ZONE, InputSampler, KEEP_ALIVE_MS, MIN_INTERVAL_MS, type InputFrame } from './inputSampler';

function make(startN = 0) {
  const sent: Array<InputFrame & { at: number }> = [];
  const sampler = new InputSampler(
    {
      send: (f) => sent.push({ ...f, at: performance.now() }),
      now: () => performance.now(),
      setTimer: (fn, ms) => setTimeout(fn, ms),
      clearTimer: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
    },
    startN,
  );
  return { sampler, sent };
}

describe('applyDeadZone', () => {
  it('zeroes small deflections and rescales the rest to the full range', () => {
    expect(applyDeadZone(0.05)).toBe(0);
    expect(applyDeadZone(-DEAD_ZONE)).toBe(0);
    expect(applyDeadZone(1)).toBe(1);
    expect(applyDeadZone(-1)).toBe(-1);
    expect(applyDeadZone(0.5)).toBeCloseTo((0.5 - DEAD_ZONE) / (1 - DEAD_ZONE), 6);
    expect(applyDeadZone(7)).toBe(1);
    expect(applyDeadZone(Number.NaN)).toBe(0);
  });
});

describe('InputSampler', () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: 0 });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('sends nothing while inactive and the current state at once when it becomes active', () => {
    const { sampler, sent } = make();
    sampler.set({ throttle: 0.5 });
    vi.advanceTimersByTime(1000);
    expect(sent).toEqual([]);
    sampler.setActive(true);
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ n: 1, throttle: 0.5, pitch: 0, yaw: 0, roll: 0 });
  });

  it('keeps the counter strictly increasing and starts after startN', () => {
    const { sampler, sent } = make(40);
    sampler.setActive(true);
    for (let i = 1; i <= 5; i++) {
      vi.advanceTimersByTime(60);
      sampler.set({ pitch: i % 2 ? 0.8 : -0.8 });
    }
    const ns = sent.map((f) => f.n);
    expect(ns[0]).toBe(41);
    for (let i = 1; i < ns.length; i++) expect(ns[i]!).toBeGreaterThan(ns[i - 1]!);
  });

  it('limits changes to 30 Hz and sends the newest value', () => {
    const { sampler, sent } = make();
    sampler.setActive(true);
    sent.length = 0;
    // 1000 changes in one second of 1 ms ticks.
    for (let t = 0; t < 1000; t++) {
      sampler.set({ pitch: Math.sin(t / 50) });
      vi.advanceTimersByTime(1);
    }
    expect(sent.length).toBeLessThanOrEqual(30);
    expect(sent.length).toBeGreaterThan(20);
    for (let i = 1; i < sent.length; i++) expect(sent[i]!.at - sent[i - 1]!.at).toBeGreaterThanOrEqual(MIN_INTERVAL_MS - 1);
  });

  it('repeats the unchanged state at 5 Hz as a keep-alive', () => {
    const { sampler, sent } = make();
    sampler.setActive(true);
    sampler.set({ throttle: 0.72 });
    sent.length = 0;
    vi.advanceTimersByTime(2000 + 5);
    expect(sent.length).toBe(10);
    expect(sent.every((f) => f.throttle === 0.72)).toBe(true);
    expect(sent[1]!.at - sent[0]!.at).toBe(KEEP_ALIVE_MS);
  });

  it('centres pitch, yaw and roll when the finger lifts but holds the throttle', () => {
    const { sampler, sent } = make();
    sampler.setActive(true);
    sampler.set({ throttle: 0.9, pitch: 1, yaw: -1, roll: 0.6 });
    vi.advanceTimersByTime(50);
    sampler.centre();
    vi.advanceTimersByTime(50);
    const last = sent[sent.length - 1]!;
    expect(last).toMatchObject({ throttle: 0.9, pitch: 0, yaw: 0, roll: 0 });
  });

  it('applies the dead zone and clamps throttle to 0…1', () => {
    const { sampler } = make();
    sampler.set({ throttle: 4, pitch: 0.03 });
    expect(sampler.current()).toEqual({ throttle: 1, pitch: 0, yaw: 0, roll: 0 });
    sampler.set({ throttle: -2 });
    expect(sampler.current().throttle).toBe(0);
  });

  it('stops all sending when deactivated (pause, seat moved, page hidden) and resumes after', () => {
    const { sampler, sent } = make();
    sampler.setActive(true);
    sampler.set({ pitch: 0.7 });
    vi.advanceTimersByTime(100);
    sampler.setActive(false);
    const count = sent.length;
    sampler.set({ pitch: -0.7 });
    vi.advanceTimersByTime(5000);
    expect(sent.length).toBe(count);
    sampler.setActive(true);
    expect(sent.length).toBe(count + 1);
    expect(sent[sent.length - 1]!.pitch).toBeCloseTo(applyDeadZone(-0.7), 3);
  });

  it('does not send an unchanged value twice within the rate limit', () => {
    const { sampler, sent } = make();
    sampler.setActive(true);
    vi.advanceTimersByTime(MIN_INTERVAL_MS);
    sent.length = 0;
    sampler.set({ throttle: 0.3 });
    sampler.set({ throttle: 0.3 });
    expect(sent).toHaveLength(1);
  });
});
