// What the audience reacted: `react.audience` windows (one per second, anonymous) as rising emoji
// bursts, capped at a readable number, plus counters that count up. With reduced motion there
// are no bursts: the counters are the display. Also shows how many people are in the audience.
import { useEffect, useRef, useState } from 'react';
import type { ReactionId } from '@protocol';
import { REACTION_IDS } from '@protocol';
import { fmt } from '../../data/format';
import { useT } from '../../i18n';
import { isReducedMotion, useSel } from '../../state/store';
import type { AudienceWindow } from '../../state/types';
import { Icon } from '../../ui/Icon';
import { REACTION_GLYPH, reactionLabelKey } from '../vote/Pings';

/** At most this many emoji per reaction type and window, and on screen at once (game values). */
export const BURST_PER_TYPE = 3;
export const BURST_ON_SCREEN = 18;
const BURST_LIFE_MS = 2600;
/** Windows that count towards the totals shown, ≈ the last 10 s. */
const COUNT_WINDOWS = 10;

export interface Burst {
  key: string;
  emoji: ReactionId;
  /** Horizontal position, percent. */
  left: number;
  delayMs: number;
}

/** Deterministic position from the window id, so a replay looks the same. */
function spread(id: number, i: number): number {
  const x = Math.sin(id * 12.9898 + i * 78.233) * 43758.5453;
  return 8 + Math.round((x - Math.floor(x)) * 84);
}

/** The bursts one window produces: `BURST_PER_TYPE` per type at most, in reaction order. */
export function burstsOf(w: Pick<AudienceWindow, 'id' | 'counts'>): Burst[] {
  const out: Burst[] = [];
  for (const emoji of REACTION_IDS) {
    const n = Math.min(BURST_PER_TYPE, Math.max(0, Math.floor(w.counts[emoji] ?? 0)));
    for (let i = 0; i < n; i++) out.push({ key: `${w.id}.${emoji}.${i}`, emoji, left: spread(w.id, out.length), delayMs: out.length * 90 });
  }
  return out;
}

/** Totals per reaction over the newest windows. */
export function totalsOf(windows: AudienceWindow[]): Record<ReactionId, number> {
  const t = { ROCKET: 0, THUMBS_UP: 0, GRIMACE: 0, FIRE: 0, THINKING: 0 } as Record<ReactionId, number>;
  for (const w of windows.slice(-COUNT_WINDOWS)) for (const id of REACTION_IDS) t[id] += w.counts[id] ?? 0;
  return t;
}

/** A number that counts up to its target in steps (no pulsing, safe with reduced motion). */
function CountUp({ value, testId }: { value: number; testId: string }) {
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  useEffect(() => {
    const start = from.current;
    if (start === value) return undefined;
    const t0 = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / 450);
      const v = Math.round(start + (value - start) * p);
      setShown(v);
      from.current = v;
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return (
    <span className="num" data-testid={testId} data-value={value}>
      {fmt(shown, 0)}
    </span>
  );
}

export function AudienceDisplay() {
  const t = useT();
  const windows = useSel((s) => s.audience, Object.is);
  const size = useSel((s) => s.room?.spectatorCount ?? 0);
  const reduced = useSel(isReducedMotion);
  const [bursts, setBursts] = useState<Burst[]>([]);
  const seen = useRef(0);
  // Each burst is removed after its animation; the timers only stop when the screen goes away.
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());
  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach(clearTimeout);
  }, []);

  useEffect(() => {
    if (reduced) return;
    const fresh = windows.filter((w) => w.id > seen.current);
    if (fresh.length === 0) return;
    seen.current = fresh[fresh.length - 1]!.id;
    const add = fresh.flatMap(burstsOf);
    if (add.length === 0) return;
    setBursts((cur) => [...cur, ...add].slice(-BURST_ON_SCREEN));
    const keys = new Set(add.map((b) => b.key));
    const id = setTimeout(() => {
      timers.current.delete(id);
      setBursts((cur) => cur.filter((b) => !keys.has(b.key)));
    }, BURST_LIFE_MS + 900);
    timers.current.add(id);
  }, [windows, reduced]);

  const totals = totalsOf(windows);
  return (
    <section className="aud" aria-label={t('ui.watch.audience')} data-testid="watch-audience">
      <header className="aud__head">
        <p className="eyebrow">{t('ui.watch.audience')}</p>
        <span className="chip" data-testid="watch-audience-size">
          <Icon name="users" size="1rem" />
          <span>{t('ui.watch.audience_size', { n: Math.max(1, size) })}</span>
        </span>
      </header>
      <div className="aud__stage">
        {!reduced && (
          <div className="aud__bursts" aria-hidden="true" data-testid="audience-burst-layer">
            {bursts.map((b) => (
              <span key={b.key} className="aud__burst" data-testid="audience-burst" style={{ insetInlineStart: `${b.left}%`, animationDelay: `${b.delayMs}ms` }}>
                {REACTION_GLYPH[b.emoji]}
              </span>
            ))}
          </div>
        )}
        <ul className="aud__counters">
          {REACTION_IDS.map((id) => (
            <li key={id} className="aud__counter" aria-label={t('ui.watch.counter_aria', { name: t(reactionLabelKey(id)), n: totals[id] })}>
              <span className="aud__glyph" aria-hidden="true">
                {REACTION_GLYPH[id]}
              </span>
              <CountUp value={totals[id]} testId={`audience-count-${id}`} />
            </li>
          ))}
        </ul>
      </div>
      <p className="body-sm aud__hint">{windows.length ? t('ui.watch.audience_hint') : t('ui.watch.audience_none')}</p>
    </section>
  );
}
