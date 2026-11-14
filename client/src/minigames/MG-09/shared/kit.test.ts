import { describe, expect, it } from 'vitest';
import { DPR_CAP, setDprCap } from './draw';
import { FramePacer } from './kit';

describe('dynamic resolution (FramePacer)', () => {
  it('keeps full resolution at 60 fps', () => {
    setDprCap(2);
    const p = new FramePacer();
    for (let i = 0; i <= 100; i++) expect(p.frame(i * 16.7)).toBe(false);
    expect(DPR_CAP).toBe(2);
  });

  it('steps down to 1.5 at about 30 fps and to 1 when it stays slow, never back up', () => {
    setDprCap(2);
    const p = new FramePacer();
    let t = 0;
    let changes = 0;
    for (let i = 0; i <= 21; i++) changes += p.frame((t += 33.3)) ? 1 : 0;
    expect(DPR_CAP).toBe(1.5);
    for (let i = 0; i <= 20; i++) changes += p.frame((t += 33.3)) ? 1 : 0;
    expect(DPR_CAP).toBe(1);
    for (let i = 0; i <= 60; i++) p.frame((t += 16.7));
    expect(DPR_CAP).toBe(1);
    expect(changes).toBe(2);
  });

  it('goes straight to 1 below about 22 fps and ignores stalls', () => {
    setDprCap(2);
    const p = new FramePacer();
    let t = 0;
    for (let i = 0; i <= 21; i++) p.frame((t += 60));
    expect(DPR_CAP).toBe(1);
    setDprCap(2);
    const q = new FramePacer();
    t = 0;
    for (let i = 0; i <= 40; i++) q.frame((t += i % 10 === 0 ? 2000 : 16.7));
    expect(DPR_CAP).toBe(2);
  });
});
