// Small shared components used by every screen.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { Avatar as AvatarData } from '@protocol';
import { patchById, suitById } from '../data/cosmetics';
import { useT } from '../i18n';
import { useStore } from '../state/store';
import { Icon, TONE_ICON, type IconName, type Tone } from './Icon';

/** Server-clock time, refreshed `hz` times per second while mounted. */
export function useServerNow(hz = 4): number {
  const store = useStore();
  const [now, setNow] = useState(() => store.now());
  useEffect(() => {
    const id = setInterval(() => setNow(store.now()), Math.max(50, 1000 / hz));
    return () => clearInterval(id);
  }, [store, hz]);
  return now;
}

/** Milliseconds left until a server-clock deadline (never negative); null without a deadline. */
export function useRemaining(endsAtMs: number | null | undefined, hz = 5): number | null {
  const now = useServerNow(hz);
  if (endsAtMs == null) return null;
  return Math.max(0, endsAtMs - now);
}

export interface CountdownProps {
  /** Server-clock start and end of the window. */
  startedAtMs: number;
  endsAtMs: number | null;
  /** Accessible description, e.g. "Time left to vote". */
  label: string;
  paused?: boolean;
}

/** Circular countdown with the seconds in the middle. Turns amber, then red and dashed. */
export function Countdown({ startedAtMs, endsAtMs, label, paused }: CountdownProps) {
  const t = useT();
  const remaining = useRemaining(endsAtMs, 8);
  const frozen = useRef<number | null>(null);
  if (endsAtMs == null || remaining == null) {
    return (
      <span className="timer" role="timer" aria-label={label}>
        <svg viewBox="0 0 36 36" aria-hidden="true">
          <circle className="timer__track" cx="18" cy="18" r="15.5" />
        </svg>
        <span className="timer__label timer__inf">
          <Icon name="clock" size="1.2rem" />
        </span>
      </span>
    );
  }
  if (paused) {
    if (frozen.current == null) frozen.current = remaining;
  } else {
    frozen.current = null;
  }
  const left = frozen.current ?? remaining;
  const total = Math.max(1, endsAtMs - startedAtMs);
  const frac = Math.min(1, Math.max(0, left / total));
  const secs = Math.ceil(left / 1000);
  const tone = secs <= 3 ? 'bad' : secs <= 7 ? 'warn' : '';
  const C = 2 * Math.PI * 15.5;
  return (
    <span className={`timer ${tone ? `timer--${tone}` : ''}`} role="timer" aria-label={`${label}: ${secs} ${t('ui.unit.seconds')}`}>
      <svg viewBox="0 0 36 36" aria-hidden="true">
        <circle className="timer__track" cx="18" cy="18" r="15.5" />
        <circle
          className="timer__arc"
          cx="18"
          cy="18"
          r="15.5"
          strokeDasharray={tone === 'bad' ? undefined : `${C * frac} ${C}`}
          pathLength={tone === 'bad' ? 100 : undefined}
          style={tone === 'bad' ? { strokeDasharray: '4 3', strokeDashoffset: 0, opacity: 0.35 + 0.65 * frac } : undefined}
        />
      </svg>
      <span className="timer__label">
        {secs}
        <span className="timer__unit">s</span>
      </span>
    </span>
  );
}

/** A thin progress line under a header that empties as a server deadline approaches. */
export function CountdownBar({ startedAtMs, endsAtMs }: { startedAtMs: number; endsAtMs: number | null }) {
  const remaining = useRemaining(endsAtMs, 15);
  const total = endsAtMs == null ? 1 : Math.max(1, endsAtMs - startedAtMs);
  const frac = remaining == null ? 1 : Math.min(1, Math.max(0, remaining / total));
  return (
    <div className="timerbar" aria-hidden="true">
      <div className="timerbar__fill" style={{ transform: `scaleX(${frac})` }} />
    </div>
  );
}

export function Chip({ tone, icon, children, wrap }: { tone?: Tone; icon?: IconName | false; children: ReactNode; wrap?: boolean }) {
  const ic = icon === false ? null : icon ?? (tone ? TONE_ICON[tone] : null);
  return (
    <span className={`chip ${tone && tone !== 'neutral' ? `chip--${tone}` : ''} ${wrap ? 'chip--wrap' : ''}`}>
      {ic && <Icon name={ic} size="0.95em" strokeWidth={2.6} />}
      <span>{children}</span>
    </span>
  );
}

export function Bar({ fraction, tone, label }: { fraction: number; tone?: Tone; label?: string }) {
  const pct = Math.round(Math.min(1, Math.max(0, fraction)) * 100);
  return (
    <div className="bar" role={label ? 'meter' : undefined} aria-label={label} aria-valuemin={label ? 0 : undefined} aria-valuemax={label ? 100 : undefined} aria-valuenow={label ? pct : undefined}>
      <div className={`bar__fill ${tone && tone !== 'accent' ? `bar__fill--${tone}` : ''}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

/** Astronaut avatar: helmet, suit colour and mission patch. */
export function Avatar({ avatar, size, off, label }: { avatar: AvatarData | null | undefined; size?: 'sm' | 'lg'; off?: boolean; label?: string }) {
  const suit = suitById(avatar?.suitId);
  const patch = patchById(avatar?.patchId);
  return (
    <span className={`avatar ${size ? `avatar--${size}` : ''} ${off ? 'avatar--off' : ''}`} role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      <svg viewBox="0 0 48 48">
        <circle cx="24" cy="24" r="23" fill="#0d2234" stroke="#24435c" strokeWidth="1.5" />
        <path d="M6 46c1-10 8-15 18-15s17 5 18 15z" fill={suit.color} stroke={suit.trim} strokeWidth="1.5" />
        <rect x="18.500" y="27" width="11" height="6" rx="2" fill={suit.trim} />
        <circle cx="24" cy="19" r="12" fill="#f4f7fc" stroke={suit.trim} strokeWidth="1.5" />
        <path d="M14.500 18.500a9.500 8 0 0119 0v2.500a9.500 7 0 01-19 0z" fill="#0b1d2e" stroke="#31466f" strokeWidth="1" />
        <path d="M17 16.500c1.500-2.500 4-3.500 6.500-3.500" stroke="#7fd3ff" strokeWidth="1.500" strokeLinecap="round" fill="none" opacity="0.9" />
        <g transform="translate(27 33) scale(0.42)">
          <circle cx="12" cy="12" r="13" fill="#0b1d2e" stroke="#f4f7fc" strokeWidth="2" />
          <path d={patch.path} fill="none" stroke="#f4f7fc" strokeWidth="2.200" strokeLinecap="round" strokeLinejoin="round" />
        </g>
      </svg>
    </span>
  );
}

export interface SheetProps {
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
  full?: boolean;
  footer?: ReactNode;
  testId?: string;
}

/** Bottom sheet (or full-screen page) over the current screen. Escape and the scrim close it. */
export function Sheet({ title, onClose, children, full, footer, testId }: SheetProps) {
  const t = useT();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      prev?.focus?.();
    };
  }, [onClose]);
  return (
    <div className="scrim" onClick={onClose}>
      <div
        ref={ref}
        className={`sheet ${full ? 'sheet--full' : ''}`}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        data-testid={testId}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sheet__head">
          <h2 className="title title--sm grow">{title}</h2>
          <button type="button" className="iconbtn" onClick={onClose} aria-label={t('ui.common.close')}>
            <Icon name="cross" />
          </button>
        </div>
        <div className="sheet__body">{children}</div>
        {footer && <div className="actionbar">{footer}</div>}
      </div>
    </div>
  );
}

export function Dialog({ children, tone, onClose, labelledBy }: { children: ReactNode; tone?: 'bad'; onClose: () => void; labelledBy?: string }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="scrim scrim--center" onClick={onClose}>
      <div className={`dialog ${tone ? `dialog--${tone}` : ''}`} role="alertdialog" aria-modal="true" aria-labelledby={labelledBy} onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

export function Switch({ checked, onChange, title, description, testId }: { checked: boolean; onChange: (v: boolean) => void; title: string; description?: string; testId?: string }) {
  return (
    <button type="button" role="switch" aria-checked={checked} className="switch" onClick={() => onChange(!checked)} data-testid={testId}>
      <span className="switch__text">
        <span className="switch__title">{title}</span>
        {description && <span className="switch__desc"><br />{description}</span>}
      </span>
      <span className="switch__track" aria-hidden="true">
        <span className="switch__thumb">{checked && <Icon name="check" size="0.9rem" strokeWidth={3} />}</span>
      </span>
    </button>
  );
}

export function Segmented<T extends string | number>({ value, options, onChange, label }: { value: T; options: Array<{ value: T; label: string }>; onChange: (v: T) => void; label: string }) {
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button key={String(o.value)} type="button" role="radio" aria-checked={o.value === value} className="segmented__opt" onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Role call sign badge: "BOOSTER". */
export function CallSign({ role, plain }: { role: string; plain?: boolean }) {
  return <span className={`callsign ${plain ? 'callsign--plain' : ''}`}>{role}</span>;
}

/** Keeps a value on screen for `ms` after it last changed to something non-null. */
export function useLinger<T>(value: T | null, ms: number): T | null {
  const [shown, setShown] = useState<T | null>(value);
  useEffect(() => {
    if (value == null) return;
    setShown(value);
    const id = setTimeout(() => setShown(null), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return shown;
}
