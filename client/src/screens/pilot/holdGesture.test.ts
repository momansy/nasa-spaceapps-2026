import { describe, expect, it } from 'vitest';
import { ABORT_SLOP_PX, HoldGesture, SLOP_PX } from './holdGesture';

describe('HoldGesture', () => {
  it('reports progress and completes exactly once at the hold time', () => {
    const g = new HoldGesture(300);
    expect(g.begin(1000).progress).toBe(0);
    expect(g.tick(1150).progress).toBeCloseTo(0.5, 5);
    const done = g.tick(1300);
    expect(done).toMatchObject({ state: 'done', progress: 1, completed: true });
    expect(g.tick(1400).completed).toBe(false);
    expect(g.tick(5000).completed).toBe(false);
  });

  it('cancels when the finger lifts early and starts a fresh hold afterwards', () => {
    const g = new HoldGesture(1500);
    g.begin(0);
    g.tick(1000);
    expect(g.release().state).toBe('cancelled');
    expect(g.tick(2000).completed).toBe(false);
    g.begin(3000);
    expect(g.tick(4400).completed).toBe(false);
    expect(g.tick(4500).completed).toBe(true);
  });

  it('cancels when the pointer slides off the control', () => {
    const g = new HoldGesture(300);
    g.begin(0, 100, 100);
    g.move(100, 160, false);
    expect(g.current).toBe('cancelled');
    expect(g.tick(400).completed).toBe(false);
  });

  it('treats a swipe (travel above the slop) as no press', () => {
    const g = new HoldGesture(300);
    g.begin(0, 50, 50);
    g.move(50 + SLOP_PX - 2, 50, true);
    expect(g.current).toBe('holding');
    g.move(50 + SLOP_PX + 2, 50, true);
    expect(g.current).toBe('cancelled');
    expect(g.tick(1000).completed).toBe(false);
  });

  it('does not complete again while the finger stays down after completion', () => {
    const g = new HoldGesture(300);
    g.begin(0);
    expect(g.tick(300).completed).toBe(true);
    expect(g.begin(400).completed).toBe(false);
    g.release();
    g.begin(500);
    expect(g.tick(800).completed).toBe(true);
  });

  it('tolerates more tremor in the long ABORT hold than in the short STAGE hold', () => {
    expect(ABORT_SLOP_PX).toBeGreaterThan(SLOP_PX);
    const g = new HoldGesture(1500, ABORT_SLOP_PX);
    g.begin(0, 0, 0);
    g.move(SLOP_PX + 6, 0, true);
    expect(g.current).toBe('holding');
    g.move(ABORT_SLOP_PX + 4, 0, true);
    expect(g.current).toBe('cancelled');
  });

  it('rejects a non-positive duration', () => {
    expect(() => new HoldGesture(0)).toThrow(RangeError);
  });
});
