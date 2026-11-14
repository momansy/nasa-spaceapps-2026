// Touch controls of the virtual gamepad (design 9.2 touch column): throttle slider, vertical
// stick, hold-to-confirm button with its ring, guarded abort switch, two-finger rotate pad and
// the camera swipe strip. They only report what the finger did; sending, rate limits and the
// host's read-back live in the store and the screens.
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { useT } from '../../i18n';
import { vibrate } from '../../lib/haptics';
import { Icon, type IconName } from '../../ui/Icon';
import { ABORT_COVER_MS, ABORT_HOLD_MS } from './controlsData';
import { ABORT_SLOP_PX, HoldGesture } from './holdGesture';

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** The pointer is still on the control, with a small margin for a thumb's wobble. */
function inside(el: Element | null, x: number, y: number, margin = 12): boolean {
  if (!el) return false;
  const r = el.getBoundingClientRect();
  return x >= r.left - margin && x <= r.right + margin && y >= r.top - margin && y <= r.bottom + margin;
}

function capture(e: ReactPointerEvent<Element>) {
  try {
    e.currentTarget.setPointerCapture(e.pointerId);
  } catch {
    /* synthetic or already released pointer */
  }
}

// ───────────── hold-to-confirm ─────────────

export interface HoldButtonProps {
  holdMs: number;
  onComplete: () => void;
  /** Visible label inside the ring. */
  label: ReactNode;
  /** Accessible name (includes the hold time). */
  ariaLabel: string;
  icon?: IconName;
  tone?: 'primary' | 'bad';
  disabled?: boolean;
  /** Why it is disabled; shown as text next to the button and read by screen readers. */
  disabledReason?: string;
  testId: string;
  className?: string;
  /** Finger travel that cancels the hold, CSS px (default: the swipe slop). */
  slopPx?: number;
  /** Called when a hold starts (true) and ends, completed or not (false). */
  onHolding?: (holding: boolean) => void;
}

/** A button that completes only after `holdMs` of continuous press; sliding off or lifting cancels. */
export function HoldButton({ holdMs, onComplete, label, ariaLabel, icon, tone = 'primary', disabled, disabledReason, testId, className = '', slopPx, onHolding }: HoldButtonProps) {
  const gesture = useMemo(() => new HoldGesture(holdMs, slopPx), [holdMs, slopPx]);
  const report = useRef(onHolding);
  report.current = onHolding;
  const btn = useRef<HTMLButtonElement>(null);
  const ring = useRef<SVGCircleElement>(null);
  const raf = useRef(0);
  const done = useRef(onComplete);
  done.current = onComplete;
  const [holding, setHolding] = useState(false);
  const [sent, setSent] = useState(false);

  const draw = useCallback((p: number) => ring.current?.style.setProperty('stroke-dashoffset', String(100 - p * 100)), []);
  const stop = useCallback(() => {
    cancelAnimationFrame(raf.current);
    raf.current = 0;
  }, []);
  const cancel = useCallback(() => {
    stop();
    gesture.release();
    draw(0);
    setHolding(false);
    report.current?.(false);
  }, [draw, gesture, stop]);

  const loop = useCallback(() => {
    const step = gesture.tick(performance.now());
    draw(step.progress);
    if (step.completed) {
      stop();
      setHolding(false);
      setSent(true);
      vibrate(30);
      report.current?.(false);
      done.current();
      return;
    }
    if (step.state === 'holding') raf.current = requestAnimationFrame(loop);
  }, [draw, gesture, stop]);

  const begin = useCallback(
    (x: number, y: number) => {
      if (disabled || gesture.current !== 'idle') return;
      setSent(false);
      setHolding(true);
      report.current?.(true);
      gesture.begin(performance.now(), x, y);
      raf.current = requestAnimationFrame(loop);
    },
    [disabled, gesture, loop],
  );

  useEffect(() => {
    if (disabled) cancel();
  }, [disabled, cancel]);
  useEffect(() => () => stop(), [stop]);
  useEffect(() => {
    if (!sent) return undefined;
    const id = setTimeout(() => setSent(false), 900);
    return () => clearTimeout(id);
  }, [sent]);

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) {
      e.preventDefault();
      begin(0, 0);
    }
  };

  return (
    <div className={`hold ${className}`}>
      <button
        ref={btn}
        type="button"
        className={`hold__btn hold__btn--${tone} ${holding ? 'is-holding' : ''} ${sent ? 'is-sent' : ''}`}
        aria-label={ariaLabel}
        aria-disabled={disabled || undefined}
        aria-describedby={disabled && disabledReason ? `${testId}-why` : undefined}
        data-testid={testId}
        data-state={disabled ? 'disabled' : holding ? 'holding' : sent ? 'sent' : 'ready'}
        onPointerDown={(e) => {
          if (e.pointerType === 'mouse' && e.button !== 0) return;
          capture(e);
          begin(e.clientX, e.clientY);
        }}
        onPointerMove={(e) => {
          if (gesture.current !== 'holding') return;
          if (gesture.move(e.clientX, e.clientY, inside(btn.current, e.clientX, e.clientY)).state === 'cancelled') cancel();
        }}
        onPointerUp={cancel}
        onPointerCancel={cancel}
        onLostPointerCapture={cancel}
        onKeyDown={onKeyDown}
        onKeyUp={(e) => {
          if (e.key === ' ' || e.key === 'Enter') cancel();
        }}
        onBlur={cancel}
        onContextMenu={(e) => e.preventDefault()}
      >
        <svg className="hold__ring" viewBox="0 0 100 100" aria-hidden="true">
          <circle className="hold__track" cx="50" cy="50" r="46" pathLength="100" />
          <circle ref={ring} className="hold__arc" cx="50" cy="50" r="46" pathLength="100" strokeDasharray="100" strokeDashoffset="100" transform="rotate(-90 50 50)" />
        </svg>
        <span className="hold__label">
          {icon && <Icon name={sent ? 'check' : icon} size="1.5rem" strokeWidth={2.6} />}
          <span>{label}</span>
        </span>
      </button>
      {disabled && disabledReason && (
        <span id={`${testId}-why`} className="hold__why">
          <Icon name="statusWarn" size="1rem" />
          {disabledReason}
        </span>
      )}
    </div>
  );
}

// ───────────── guarded abort switch ─────────────

export function AbortSwitch({ onAbort }: { onAbort: () => void }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [holding, setHolding] = useState(false);
  // The cover closes by itself, but never under a finger that is holding the switch.
  useEffect(() => {
    if (!open || holding) return undefined;
    const id = setTimeout(() => setOpen(false), ABORT_COVER_MS);
    return () => clearTimeout(id);
  }, [open, holding]);
  return (
    <div className={`abort ${open ? 'abort--open' : ''}`} data-testid="pilot-abort-switch" data-open={open}>
      <button
        type="button"
        className="abort__cover btn btn--outline-bad"
        onClick={() => {
          vibrate(12);
          setOpen((v) => !v);
        }}
        data-testid="pilot-abort-cover"
        aria-expanded={open}
        aria-label={open ? t('ui.pilot.abort_close') : t('ui.pilot.abort_cover')}
      >
        <Icon name={open ? 'statusBad' : 'lock'} size="1rem" />
        <span className="abort__cover-text">
          <b>{t('ui.pilot.abort')}</b>
          <small>{open ? t('ui.pilot.abort_open_hint') : t('ui.pilot.abort_cover_hint')}</small>
        </span>
      </button>
      {open && (
        <div className="abort__panel" role="group" aria-label={t('ui.pilot.abort')} data-testid="pilot-abort-panel">
          <HoldButton
            holdMs={ABORT_HOLD_MS}
            tone="bad"
            icon="statusBad"
            label={t('ui.pilot.abort')}
            ariaLabel={t('ui.pilot.abort_aria', { s: ABORT_HOLD_MS / 1000 })}
            testId="pilot-abort"
            slopPx={ABORT_SLOP_PX}
            onHolding={setHolding}
            onComplete={() => {
              onAbort();
              setOpen(false);
            }}
          />
          <p className="abort__text">{t('ui.pilot.abort_panel', { s: ABORT_HOLD_MS / 1000 })}</p>
          <button type="button" className="btn btn--sm abort__close" onClick={() => setOpen(false)} data-testid="pilot-abort-close" aria-label={t('ui.pilot.abort_close')}>
            <Icon name="cross" size="1.1rem" />
          </button>
        </div>
      )}
    </div>
  );
}

// ───────────── throttle slider ─────────────

export interface ThrottleSliderProps {
  /** Commanded throttle 0…1 (owned by the screen: CUTOFF sets it to 0). */
  value: number;
  /** The host's read-back, percent (null before the first `pilot.hud`). */
  readbackPct: number | null;
  onChange: (value: number) => void;
}

export function ThrottleSlider({ value, readbackPct, onChange }: ThrottleSliderProps) {
  const t = useT();
  const track = useRef<HTMLDivElement>(null);
  const pct = Math.round(clamp(value, 0, 1) * 100);
  const dragging = useRef(false);

  const set = useCallback((frac: number) => onChange(Math.round(clamp(frac, 0, 1) * 100) / 100), [onChange]);
  const fromEvent = (e: ReactPointerEvent<HTMLDivElement>) => {
    const r = track.current!.getBoundingClientRect();
    set(1 - (e.clientY - r.top) / r.height);
  };
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey ? 1 : 5;
    const map: Record<string, number> = { ArrowUp: pct + step, ArrowRight: pct + step, PageUp: pct + 10, ArrowDown: pct - step, ArrowLeft: pct - step, PageDown: pct - 10, Home: 100, End: 0 };
    if (e.key in map) {
      e.preventDefault();
      set(map[e.key]! / 100);
    }
  };
  const host = readbackPct == null ? null : Math.round(readbackPct);
  return (
    <div className="thr" data-testid="pilot-throttle-wrap">
      <div className="thr__read">
        <span className="thr__readrow">
          <span className="thr__k">{t('ui.pilot.throttle_cmd')}</span>
          <span className="num thr__v" data-testid="pilot-throttle-cmd">{pct}&nbsp;%</span>
        </span>
        <span className="thr__readrow thr__readrow--host">
          <span className="thr__k">{t('ui.pilot.throttle_host')}</span>
          <span className="num thr__v" data-testid="pilot-throttle-host">{host == null ? '—' : `${host} %`}</span>
        </span>
      </div>
      <div
        ref={track}
        className="thr__track"
        role="slider"
        tabIndex={0}
        aria-orientation="vertical"
        aria-label={t('ui.pilot.throttle')}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        aria-valuetext={t('ui.pilot.throttle_aria', { cmd: pct, host: host ?? '—' })}
        data-testid="pilot-throttle"
        onPointerDown={(e) => {
          if (e.pointerType === 'mouse' && e.button !== 0) return;
          capture(e);
          dragging.current = true;
          fromEvent(e);
        }}
        onPointerMove={(e) => {
          if (dragging.current) fromEvent(e);
        }}
        onPointerUp={() => (dragging.current = false)}
        onPointerCancel={() => (dragging.current = false)}
        onKeyDown={onKey}
        onContextMenu={(e) => e.preventDefault()}
      >
        <span className="thr__fill" style={{ height: `${pct}%` }} />
        {host != null && <span className="thr__host" style={{ bottom: `${clamp(host, 0, 100)}%` }} aria-hidden="true" />}
        <span className="thr__thumb" style={{ bottom: `${pct}%` }} aria-hidden="true">
          <Icon name="chevronUp" size="1.2rem" strokeWidth={3} />
        </span>
        <span className="thr__tick thr__tick--100" aria-hidden="true">100</span>
        <span className="thr__tick thr__tick--0" aria-hidden="true">0</span>
      </div>
    </div>
  );
}

// ───────────── vertical stick (pitch) ─────────────

export function AxisStick({ label, onChange, ariaLabel }: { label: string; ariaLabel: string; onChange: (v: number) => void }) {
  const track = useRef<HTMLDivElement>(null);
  const active = useRef(false);
  const [v, setV] = useState(0);
  const put = useCallback(
    (next: number) => {
      const r = Math.round(clamp(next, -1, 1) * 50) / 50;
      setV(r);
      onChange(r);
    },
    [onChange],
  );
  const fromEvent = (e: ReactPointerEvent<HTMLDivElement>) => {
    const r = track.current!.getBoundingClientRect();
    put(-((e.clientY - (r.top + r.height / 2)) / (r.height / 2)));
  };
  const release = () => {
    active.current = false;
    put(0);
  };
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'ArrowUp') put(v + 0.25);
    else if (e.key === 'ArrowDown') put(v - 0.25);
    else if (e.key === ' ' || e.key === 'Home') put(0);
    else return;
    e.preventDefault();
  };
  return (
    <div className="stick" data-testid="pilot-stick-wrap">
      <span className="stick__label">{label}</span>
      <div
        ref={track}
        className="stick__track"
        role="slider"
        tabIndex={0}
        aria-orientation="vertical"
        aria-label={ariaLabel}
        aria-valuemin={-100}
        aria-valuemax={100}
        aria-valuenow={Math.round(v * 100)}
        data-testid="pilot-stick"
        onPointerDown={(e) => {
          if (e.pointerType === 'mouse' && e.button !== 0) return;
          capture(e);
          active.current = true;
          fromEvent(e);
        }}
        onPointerMove={(e) => {
          if (active.current) fromEvent(e);
        }}
        onPointerUp={release}
        onPointerCancel={release}
        onLostPointerCapture={() => active.current && release()}
        onKeyDown={onKey}
        onContextMenu={(e) => e.preventDefault()}
      >
        <span className="stick__centre" aria-hidden="true" />
        <span className="stick__thumb" style={{ transform: `translateY(${-v * 100}%)`, top: '50%' }} aria-hidden="true" />
        <Icon name="arrowUp" className="stick__arrow stick__arrow--up" size="1.1rem" />
        <Icon name="arrowDown" className="stick__arrow stick__arrow--down" size="1.1rem" />
      </div>
      <span className="num stick__value" aria-hidden="true">
        {Math.round(v * 100)}&nbsp;%
      </span>
    </div>
  );
}

// ───────────── two-finger rotate pad (yaw and roll, RCS on) ─────────────

/** Finger travel for full yaw, CSS px (game value). */
export const YAW_FULL_PX = 70;
/** Twist for full roll, degrees (game value). */
export const ROLL_FULL_DEG = 45;

export function RotatePad({ enabled, onChange }: { enabled: boolean; onChange: (yaw: number, roll: number) => void }) {
  const t = useT();
  const pts = useRef(new Map<number, { x: number; y: number }>());
  const base = useRef<{ cx: number; angle: number } | null>(null);
  const [axes, setAxes] = useState({ yaw: 0, roll: 0 });

  const geometry = () => {
    const [a, b] = [...pts.current.values()];
    return { cx: (a!.x + b!.x) / 2, angle: (Math.atan2(b!.y - a!.y, b!.x - a!.x) * 180) / Math.PI };
  };
  const centre = () => {
    base.current = null;
    setAxes({ yaw: 0, roll: 0 });
    onChange(0, 0);
  };
  useEffect(() => {
    if (!enabled) centre();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  const update = () => {
    if (pts.current.size < 2) return;
    const g = geometry();
    if (!base.current) base.current = g;
    let d = g.angle - base.current.angle;
    d = ((((d + 180) % 360) + 360) % 360) - 180;
    const yaw = Math.round(clamp((g.cx - base.current.cx) / YAW_FULL_PX, -1, 1) * 50) / 50;
    const roll = Math.round(clamp(d / ROLL_FULL_DEG, -1, 1) * 50) / 50;
    setAxes({ yaw, roll });
    onChange(yaw, roll);
  };
  const up = (e: ReactPointerEvent<HTMLDivElement>) => {
    pts.current.delete(e.pointerId);
    if (pts.current.size < 2) centre();
  };
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = 0.25;
    let { yaw, roll } = axes;
    if (e.key === 'ArrowLeft') yaw -= step;
    else if (e.key === 'ArrowRight') yaw += step;
    else if (e.key === 'q' || e.key === 'Q') roll -= step;
    else if (e.key === 'e' || e.key === 'E') roll += step;
    else if (e.key === ' ' || e.key === 'Home') {
      yaw = 0;
      roll = 0;
    } else return;
    e.preventDefault();
    yaw = clamp(yaw, -1, 1);
    roll = clamp(roll, -1, 1);
    setAxes({ yaw, roll });
    onChange(yaw, roll);
  };
  return (
    <div
      className={`rotpad ${enabled ? '' : 'is-off'}`}
      role="group"
      tabIndex={enabled ? 0 : -1}
      aria-label={t('ui.pilot.rotate_pad')}
      aria-disabled={!enabled}
      data-testid="pilot-rotate"
      data-yaw={axes.yaw}
      data-roll={axes.roll}
      onPointerDown={(e) => {
        if (!enabled) return;
        capture(e);
        pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (pts.current.size === 2) base.current = geometry();
      }}
      onPointerMove={(e) => {
        if (!pts.current.has(e.pointerId)) return;
        pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
        update();
      }}
      onPointerUp={up}
      onPointerCancel={up}
      onKeyDown={onKey}
      onContextMenu={(e) => e.preventDefault()}
    >
      <Icon name="rotate" size="1.4rem" />
      <span className="rotpad__text">{enabled ? t('ui.pilot.rotate_hint_on') : t('ui.pilot.rotate_off')}</span>
      {enabled && (
        <span className="num rotpad__vals" aria-hidden="true">
          {t('ui.pilot.yaw')} {Math.round(axes.yaw * 100)}&nbsp;% · {t('ui.pilot.roll')} {Math.round(axes.roll * 100)}&nbsp;%
        </span>
      )}
    </div>
  );
}

// ───────────── camera swipe strip ─────────────

/** Sideways travel that counts as a swipe, CSS px (game value). */
export const SWIPE_PX = 60;

export function SwipeStrip({ onSwipe }: { onSwipe: () => void }) {
  const t = useT();
  const from = useRef<{ x: number; y: number } | null>(null);
  return (
    <div
      className="swipe"
      role="button"
      tabIndex={0}
      aria-label={t('ui.pilot.camera_aria')}
      data-testid="pilot-camera"
      onPointerDown={(e) => {
        capture(e);
        from.current = { x: e.clientX, y: e.clientY };
      }}
      onPointerUp={(e) => {
        const f = from.current;
        from.current = null;
        if (f && Math.abs(e.clientX - f.x) >= SWIPE_PX && Math.abs(e.clientX - f.x) > Math.abs(e.clientY - f.y) * 1.5) {
          vibrate(12);
          onSwipe();
        }
      }}
      onPointerCancel={() => (from.current = null)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          onSwipe();
        }
      }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <Icon name="chevronLeft" size="1.1rem" />
      <span>{t('ui.pilot.camera_hint')}</span>
      <Icon name="chevronRight" size="1.1rem" />
    </div>
  );
}
