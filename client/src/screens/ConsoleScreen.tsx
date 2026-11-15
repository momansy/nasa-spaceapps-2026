// Flight console (design 9.5, 14.2 screen 6): during COUNTDOWN and FLIGHT each phone shows
// the telemetry of the consoles its player staffs, with limits, alerts, callout buttons and
// requests to the pilot. During a communications blackout it shows static instead.
//
// Everything here is rendered from host messages (console.config, console.telemetry,
// console.alert, flight.hud, …); the phone computes nothing about the flight.
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import type { BlackoutSetPayload, EventSeverity, RoleId, TelemetryChannel } from '@protocol';
import { CHANNEL_SPECS, fmt, fmtBoost, fmtMet, fmtMoney } from '../data/format';
import { useT, type Translator } from '../i18n';
import { isPlayer, myRoles } from '../state/selectors';
import { isReducedMotion, useSel, useStore } from '../state/store';
import type { ActiveAlert, ConsoleState } from '../state/types';
import { Icon, type IconName, type Tone } from '../ui/Icon';
import { Bar, CallSign, Chip, useRemaining, useServerNow } from '../ui/kit';
import './console.css';

// ───────────── formatting ─────────────

interface ChannelText {
  /** The number (or clock) as text. */
  num: string;
  /** Unit shown after it; empty when the number already carries it. */
  unit: string;
}

/** `fixed` keeps trailing zeros so a live value does not change width; scale ends drop them. */
function channelText(ch: TelemetryChannel, v: number | null | undefined, fixed = true): ChannelText {
  if (v == null || !Number.isFinite(v)) return { num: '—', unit: '' };
  const spec = CHANNEL_SPECS[ch];
  if (spec.kind === 'time') return { num: fmtMet(v), unit: '' };
  if (spec.kind === 'money') return { num: fmtMoney(v, spec.decimals), unit: '' };
  return { num: fmt(v, spec.decimals, fixed ? spec.decimals : 0), unit: spec.unit };
}

function joinText(x: ChannelText): string {
  if (!x.unit) return x.num;
  return x.unit === '°' ? `${x.num}${x.unit}` : `${x.num}\u00a0${x.unit}`;
}

type LimitState = 'none' | 'ok' | 'near' | 'low' | 'high';

interface ChannelCfg {
  id: TelemetryChannel;
  min: number;
  max: number;
  warnLow: number | null;
  warnHigh: number | null;
}

/** Where a value stands against its limits. "near" is the last 5 % of the range before one. */
function limitState(v: number | undefined, c: ChannelCfg): LimitState {
  if (v == null || !Number.isFinite(v)) return 'none';
  if (c.warnLow != null && v < c.warnLow) return 'low';
  if (c.warnHigh != null && v > c.warnHigh) return 'high';
  // "Near" needs a nominal zone to be near the edge of: a limit that sits on the end of the
  // scale (for example "any red console is too many") has none.
  const margin = Math.abs(c.max - c.min) * 0.05;
  const lo = Math.min(c.min, c.max);
  const hi = Math.max(c.min, c.max);
  if (c.warnLow != null && c.warnLow + margin < hi && v < c.warnLow + margin) return 'near';
  if (c.warnHigh != null && c.warnHigh - margin > lo && v > c.warnHigh - margin) return 'near';
  return 'ok';
}

const STATE_TONE: Record<LimitState, Tone> = { none: 'neutral', ok: 'good', near: 'warn', low: 'bad', high: 'bad' };
const STATE_ICON: Record<LimitState, IconName> = { none: 'dot', ok: 'statusGood', near: 'statusWarn', low: 'statusBad', high: 'statusBad' };

function pct(v: number, min: number, max: number): number {
  if (max === min) return 0;
  return Math.min(100, Math.max(0, ((v - min) / (max - min)) * 100));
}

/** Callout text with its number: "ENGINE 3 OUT"; without one the placeholder disappears. */
function calloutLabel(t: Translator, calloutId: string, arg: number | null): string {
  return t(`callout.${calloutId}.label`, { n: arg ?? '' })
    .replace(/\s{2,}/g, ' ')
    .trim();
}

// ───────────── gauges ─────────────

const FLAG_CHANNELS = new Set<TelemetryChannel>(['hold', 'in_pass']);
const PAIRS: Partial<Record<TelemetryChannel, { total: TelemetryChannel; labelKey: string }>> = {
  engines_running: { total: 'engines_total', labelKey: 'ui.console.pair.engines' },
  targets_captured: { total: 'targets_total', labelKey: 'ui.console.pair.targets' },
};
const PAIR_TOTALS = new Set<TelemetryChannel>(['engines_total', 'targets_total']);

function Sparkline({ history, cfg }: { history: number[] | undefined; cfg: ChannelCfg }) {
  if (!history || history.length < 2) return <svg className="gauge__spark" viewBox="0 0 60 22" aria-hidden="true" />;
  const n = history.length;
  const y = (v: number) => 21 - (pct(v, cfg.min, cfg.max) / 100) * 20;
  let d = '';
  for (let i = 0; i < n; i++) d += `${i === 0 ? 'M' : 'L'}${((i / (n - 1)) * 60).toFixed(1)} ${y(history[i]!).toFixed(1)}`;
  const endY = y(history[n - 1]!);
  return (
    <span className="gauge__sparkwrap" aria-hidden="true">
      <svg className="gauge__spark" viewBox="0 0 60 22" preserveAspectRatio="none">
        {cfg.warnHigh != null && <line className="gauge__sparklimit" x1="0" x2="60" y1={y(cfg.warnHigh)} y2={y(cfg.warnHigh)} />}
        {cfg.warnLow != null && <line className="gauge__sparklimit" x1="0" x2="60" y1={y(cfg.warnLow)} y2={y(cfg.warnLow)} />}
        <path className="gauge__sparkline" d={d} />
      </svg>
      <span className="gauge__sparkdot" style={{ top: `${(endY / 22) * 100}%` }} />
    </span>
  );
}

const Gauge = memo(function Gauge({ cfg, value, history }: { cfg: ChannelCfg; value: number | undefined; history: number[] | undefined }) {
  const t = useT();
  const state = limitState(value, cfg);
  const text = channelText(cfg.id, value);
  const label = t(`ui.channel.${cfg.id}.label`);
  const lowW = cfg.warnLow != null ? pct(cfg.warnLow, cfg.min, cfg.max) : 0;
  const highFrom = cfg.warnHigh != null ? pct(cfg.warnHigh, cfg.min, cfg.max) : 100;
  const pos = value != null ? pct(value, cfg.min, cfg.max) : 0;
  const limit = state === 'low' ? cfg.warnLow : state === 'high' ? cfg.warnHigh : null;
  const aria = t('ui.console.gauge_aria', {
    label,
    value: joinText(text),
    state: t(`ui.console.state.${state}`),
    min: joinText(channelText(cfg.id, cfg.min, false)),
    max: joinText(channelText(cfg.id, cfg.max, false)),
  });
  return (
    <div className={`gauge gauge--${state}`} role="group" aria-label={aria} data-channel={cfg.id}>
      <div className="gauge__head">
        <span className="gauge__label">{label}</span>
        {state !== 'ok' && state !== 'none' && (
          <span className={`gauge__flag tone-${STATE_TONE[state]}`}>
            <Icon name={STATE_ICON[state]} size="0.95em" strokeWidth={2.8} />
            {t(`ui.console.state.${state}`)}
          </span>
        )}
      </div>
      <div className="gauge__row">
        <span className="gauge__value">
          {value == null || !Number.isFinite(value) ? (
            <span className="skel" aria-hidden="true" />
          ) : (
            <>
              <span className="num">{text.num}</span>
              {text.unit && <span className="unit">{text.unit}</span>}
            </>
          )}
        </span>
        <Sparkline history={history} cfg={cfg} />
      </div>
      <div className="gauge__track" aria-hidden="true">
        {value != null && <span className="gauge__fill" style={{ width: `${pos}%` }} />}
        {value != null && <span className="gauge__needle" style={{ insetInlineStart: `${pos}%` }} />}
      </div>
      {/* Limit strip: the hatched stretches are out of limits. */}
      {(cfg.warnLow != null || cfg.warnHigh != null) && (
        <div className="gauge__limits" aria-hidden="true">
          {cfg.warnLow != null && <span className="gauge__zone" style={{ insetInlineStart: 0, width: `${lowW}%` }} />}
          {cfg.warnHigh != null && <span className="gauge__zone" style={{ insetInlineStart: `${highFrom}%`, width: `${100 - highFrom}%` }} />}
        </div>
      )}
      <div className="gauge__scale" aria-hidden="true">
        <span>{joinText(channelText(cfg.id, cfg.min, false))}</span>
        {limit != null && <span className={`tone-${STATE_TONE[state]}`}>{t(state === 'low' ? 'ui.console.limit_low' : 'ui.console.limit_high', { v: joinText(channelText(cfg.id, limit, false)) })}</span>}
        <span>{joinText(channelText(cfg.id, cfg.max, false))}</span>
      </div>
    </div>
  );
});

const PairGauge = memo(function PairGauge({ labelKey, a, b }: { labelKey: string; a: number | undefined; b: number | undefined }) {
  const t = useT();
  const total = b != null ? Math.max(0, Math.round(b)) : 0;
  const on = a != null ? Math.max(0, Math.round(a)) : 0;
  const short = a != null && b != null && on < total;
  const tone: Tone = a == null || b == null ? 'neutral' : short ? 'bad' : 'good';
  const value = a == null || b == null ? '—' : t('ui.console.pair.of', { a: fmt(on, 0), b: fmt(total, 0) });
  return (
    <div className={`gauge gauge--${short ? 'low' : 'ok'}`} role="group" aria-label={`${t(labelKey)}: ${value}`}>
      <div className="gauge__head">
        <span className="gauge__label">{t(labelKey)}</span>
        {short && (
          <span className="gauge__flag tone-bad">
            <Icon name="warn" size="0.95em" strokeWidth={2.8} />
            {t('ui.console.state.low')}
          </span>
        )}
      </div>
      <div className="gauge__row">
        <span className="gauge__value">{a == null || b == null ? <span className="skel" aria-hidden="true" /> : <span className="num">{value}</span>}</span>
      </div>
      {total > 0 && total <= 12 && (
        <div className="lamps" aria-hidden="true">
          {Array.from({ length: total }, (_, i) => (
            <span key={i} className={`lamp ${i < on ? `lamp--on lamp--${tone}` : 'lamp--off'}`}>
              {i < on ? <Icon name="check" size="0.7rem" strokeWidth={3.2} /> : <Icon name="cross" size="0.7rem" strokeWidth={3.2} />}
            </span>
          ))}
        </div>
      )}
    </div>
  );
});

const FlagGauge = memo(function FlagGauge({ id, value }: { id: TelemetryChannel; value: number | undefined }) {
  const t = useT();
  const on = value != null && value >= 0.5;
  // A hold is something to notice; being in a ground pass is good news.
  const tone: Tone = value == null ? 'neutral' : id === 'hold' ? (on ? 'warn' : 'good') : on ? 'good' : 'neutral';
  const text = value == null ? '—' : t(`ui.console.flag.${id}.${on ? 'on' : 'off'}`);
  return (
    <div className={`gauge gauge--${id === 'hold' && on ? 'near' : 'ok'}`} role="group" aria-label={`${t(`ui.channel.${id}.label`)}: ${text}`}>
      <div className="gauge__head">
        <span className="gauge__label">{t(`ui.channel.${id}.label`)}</span>
      </div>
      <div className="gauge__row">
        <span className={`flaglamp flaglamp--${tone} ${on ? 'flaglamp--on' : ''}`} aria-hidden="true">
          <Icon name={id === 'hold' ? (on ? 'pause' : 'play') : on ? 'radio' : 'signalOff'} size="1rem" />
        </span>
        <span className="gauge__value gauge__value--word">{value == null ? <span className="skel" aria-hidden="true" /> : text}</span>
      </div>
    </div>
  );
});

function Gauges({ console: c }: { console: ConsoleState }) {
  const t = useT();
  return (
    <section className="gauges" aria-label={t('ui.console.gauges')}>
      {c.config.channels.map((cfg) => {
        if (PAIR_TOTALS.has(cfg.id)) return null;
        const pair = PAIRS[cfg.id];
        if (pair) return <PairGauge key={cfg.id} labelKey={pair.labelKey} a={c.values[cfg.id]} b={c.values[pair.total]} />;
        if (FLAG_CHANNELS.has(cfg.id)) return <FlagGauge key={cfg.id} id={cfg.id} value={c.values[cfg.id]} />;
        return <Gauge key={cfg.id} cfg={cfg} value={c.values[cfg.id]} history={c.history[cfg.id]} />;
      })}
    </section>
  );
}

// ───────────── alerts ─────────────

/** How long an alert stays on screen after its window closed, to show how it ended. */
const ALERT_LINGER_MS = 2600;

function AlertBanner({ alert, selected, onShow }: { alert: ActiveAlert; selected: boolean; onShow: () => void }) {
  const t = useT();
  const store = useStore();
  const firstSeen = useRef<number | null>(null);
  if (firstSeen.current == null) firstSeen.current = store.now();
  const left = useRemaining(alert.endsAtMs, 10) ?? 0;
  const open = left > 0;
  const total = Math.max(1, alert.endsAtMs - firstSeen.current);
  const callout = calloutLabel(t, alert.calloutId, alert.arg);
  const lastGood = useSel((s) => s.flight.goodCalls.find((g) => g.alertId === alert.alertId) ?? null);
  const state: 'good' | 'sent' | 'open' | 'closed' = alert.good ? 'good' : alert.calledAtMs != null ? 'sent' : open ? 'open' : 'closed';
  const tone = state === 'good' ? 'good' : alert.severity === 'WARNING' ? 'bad' : 'warn';
  return (
    <div className={`alert alert--${tone} ${state === 'open' ? 'alert--live' : ''}`} role="alert" data-testid="console-alert" data-state={state}>
      <div className="alert__head">
        <Icon name={state === 'good' ? 'check' : 'warn'} size="1.4rem" strokeWidth={2.4} />
        <CallSign role={alert.role} />
        {state !== 'good' && <span className="alert__sev">{t(`ui.console.alert.${alert.severity}`)}</span>}
        <span className="spacer" />
        {state === 'open' && (
          <span className="alert__left num" aria-label={t('ui.console.alert.window')}>
            {fmt(left / 1000, 1, 1)}
            <span className="unit">s</span>
          </span>
        )}
      </div>
      {state !== 'open' && <div className="alert__what">{callout}</div>}
      {state === 'open' && (
        <>
          <div className="alert__bar" aria-hidden="true">
            <div className="alert__barfill" style={{ transform: `scaleX(${Math.min(1, left / total)})` }} />
          </div>
          <button type="button" className={`btn btn--lg btn--block ${alert.severity === 'WARNING' ? 'btn--bad' : 'btn--warn'}`} onClick={() => store.callout(alert.role, alert.calloutId)} data-testid="alert-callout">
            <Icon name="megaphone" />
            <span aria-hidden="true">{callout}</span>
            <span className="sr-only">{t('ui.console.alert.call', { callout })}</span>
          </button>
        </>
      )}
      {state === 'sent' && (
        <div className="alert__status">
          <span className="spinner" aria-hidden="true" />
          {t('ui.console.alert.sent')}
        </div>
      )}
      {state === 'good' && (
        <div className="alert__status">
          <Icon name="megaphone" />
          {lastGood ? t('ui.console.alert.good', { sync: lastGood.syncDelta }) : t('ui.console.alert.good_plain')}
        </div>
      )}
      {state === 'closed' && (
        <div className="alert__status">
          <Icon name="clock" />
          {t('ui.console.alert.closed')}
        </div>
      )}
      {!selected && (
        <button type="button" className="btn btn--sm btn--ghost" onClick={onShow}>
          {t('ui.console.alert.show', { role: alert.role })}
        </button>
      )}
    </div>
  );
}

function Alerts({ roles, selected, onSelect }: { roles: RoleId[]; selected: RoleId | null; onSelect: (r: RoleId) => void }) {
  const alerts = useSel((s) => s.flight.alerts);
  const now = useServerNow(alerts.length > 0 ? 4 : 0.5);
  const shown = alerts.filter((a) => roles.includes(a.role) && a.endsAtMs + ALERT_LINGER_MS > now);
  if (shown.length === 0) return null;
  return (
    <div className="alerts">
      {shown.map((a) => (
        <AlertBanner key={a.alertId} alert={a} selected={a.role === selected} onShow={() => onSelect(a.role)} />
      ))}
    </div>
  );
}

// ───────────── header strip ─────────────

function Hud() {
  const t = useT();
  const hud = useSel((s) => s.flight.hud);
  const phase = useSel((s) => s.phase);
  const hold = useSel((s) => (s.flight.consoles.FLIGHT?.values.hold ?? 0) >= 0.5);
  const countdown = phase?.phase === 'COUNTDOWN';
  const phaseName = phase?.flightPhase ? t(`ui.flight_phase.${phase.flightPhase}`) : null;
  const warp = hud?.warp ?? 1;
  return (
    <section className={`hud panel ${countdown ? 'hud--countdown' : ''}`} aria-label={t('ui.console.clock')}>
      <div className="hud__top">
        <div className="hud__clockwrap">
          {countdown && <span className="eyebrow eyebrow--dim">{hold ? t('ui.console.on_hold') : hud && hud.metS >= 0 ? t('ui.console.clock') : t('ui.console.liftoff_in')}</span>}
          <span className="hud__clock num" role="timer" data-testid="hud-clock">
            {hud ? fmtMet(hud.metS) : <span className="skel skel--clock" aria-hidden="true" />}
          </span>
        </div>
        <div className="hud__phase">
          {phase?.flightPhase && <span className="callsign callsign--plain">{phase.flightPhase}</span>}
          {phaseName && <span className="hud__phasename">{phaseName}</span>}
        </div>
      </div>
      {!hud && <p className="body-sm">{t('ui.console.standby')}</p>}
      {hud && !countdown && (
        <dl className="hud__stats">
          <div className="hud__stat">
            <dt>{t('ui.console.hud.altitude')}</dt>
            <dd>
              <span className="num">{fmt(hud.altitudeKm, hud.altitudeKm < 100 ? 1 : 0, hud.altitudeKm < 100 ? 1 : 0)}</span>
              <span className="unit">km</span>
            </dd>
          </div>
          <div className="hud__stat">
            <dt>{t('ui.console.hud.velocity')}</dt>
            <dd>
              <span className="num">{fmt(hud.velocityMs, 0)}</span>
              <span className="unit">m/s</span>
            </dd>
          </div>
          <div className="hud__stat">
            <dt>{t('ui.console.hud.throttle')}</dt>
            <dd>
              <span className="num">{fmt(hud.throttlePct, 0)}</span>
              <span className="unit">%</span>
            </dd>
          </div>
        </dl>
      )}
      {hud && warp !== 1 && (
        <div className={`hud__warp ${warp < 1 ? 'hud__warp--slow' : ''}`} role="status">
          <Icon name="clock" size="1rem" />
          {t(warp < 1 ? 'ui.console.hud.bullet_time' : 'ui.console.hud.warp', { x: fmt(warp, warp < 1 ? 2 : 0) })}
        </div>
      )}
    </section>
  );
}

function TeamStrip() {
  const t = useT();
  const sync = useSel((s) => s.sync);
  const boosts = useSel((s) => s.boosts);
  if (!sync && boosts.length === 0) return null;
  return (
    <section className="teamstrip">
      {sync && (
        <div className="teamstrip__sync">
          <div className="row row--between">
            <span className="gauge__label">{t('ui.console.sync')}</span>
            <span className="num teamstrip__value">{t('ui.console.sync_value', { v: fmt(sync.value, 0) })}</span>
          </div>
          <Bar fraction={sync.value / 100} tone={sync.momentReady ? 'good' : 'accent'} label={t('ui.console.sync')} />
          {sync.momentReady && (
            <Chip tone="good" icon="sparkle" wrap>
              {t('ui.console.moment_ready')}
            </Chip>
          )}
        </div>
      )}
      {boosts.length > 0 && (
        <ul className="teamstrip__boosts" aria-label={t('ui.console.boosts')}>
          {boosts.map((b) => (
            <li key={b.boost}>
              <Chip tone="accent" icon="bolt" wrap>
                {t(`boost.${b.boost.toLowerCase()}.name`)} <span className="num">{fmtBoost(b.total, b.unit)}</span>
              </Chip>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

const SEVERITY_TONE: Record<EventSeverity, Tone> = { INFO: 'neutral', CAUTION: 'warn', WARNING: 'bad', CRITICAL: 'bad' };
const SEVERITY_ICON: Record<EventSeverity, IconName> = { INFO: 'dot', CAUTION: 'warn', WARNING: 'warn', CRITICAL: 'cross' };

function Events() {
  const t = useT();
  const events = useSel((s) => s.flight.events);
  const last = useMemo(() => events.slice(-4).reverse(), [events]);
  return (
    <section className="stack stack--sm">
      <h2 className="section-title">{t('ui.console.events')}</h2>
      {last.length === 0 ? (
        <p className="body-sm">{t('ui.console.events_empty')}</p>
      ) : (
        <ol className="events">
          {last.map((e, i) => (
            <li key={`${e.eventId}:${e.metS}`} className={`event ${i === 0 ? 'event--new' : ''}`}>
              <span className={`event__icon tone-${SEVERITY_TONE[e.severity]}`}>
                <Icon name={SEVERITY_ICON[e.severity]} size="1rem" label={t(`ui.console.severity.${e.severity}`)} />
              </span>
              <span className="event__time num">{fmtMet(e.metS)}</span>
              <span className="event__text">{t(e.text.key, e.text.args)}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

// ───────────── one console ─────────────

function RoleTabs({ roles, selected, onSelect }: { roles: RoleId[]; selected: RoleId; onSelect: (r: RoleId) => void }) {
  const t = useT();
  const alerts = useSel((s) => s.flight.alerts);
  const now = useServerNow(1);
  return (
    <div className="segmented consoletabs" role="tablist" aria-label={t('ui.console.tabs')}>
      {roles.map((r) => {
        const alerting = alerts.some((a) => a.role === r && a.endsAtMs > now && a.calledAtMs == null);
        return (
          <button
            key={r}
            type="button"
            role="tab"
            aria-selected={r === selected}
            aria-label={t(alerting ? 'ui.console.tab_alert' : 'ui.console.tab', { role: r })}
            className={`segmented__opt consoletabs__tab ${alerting ? 'consoletabs__tab--alert' : ''}`}
            onClick={() => onSelect(r)}
            data-testid={`console-tab-${r}`}
          >
            <span className="mono">{r}</span>
            {alerting && (
              <span className="consoletabs__alert">
                <Icon name="warn" size="0.95rem" strokeWidth={2.6} />
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

function Requests({ role, ids }: { role: RoleId; ids: string[] }) {
  const t = useT();
  const store = useStore();
  const [sent, setSent] = useState<string | null>(null);
  useEffect(() => {
    if (!sent) return undefined;
    const id = setTimeout(() => setSent(null), 2600);
    return () => clearTimeout(id);
  }, [sent]);
  if (ids.length === 0) return null;
  return (
    <section className="stack stack--sm">
      <h2 className="section-title">{t('ui.console.requests')}</h2>
      <div className="requests">
        {ids.map((id) => {
          const done = sent === id;
          return (
            <button
              key={id}
              type="button"
              className={`btn request ${done ? 'request--sent' : ''}`}
              onClick={() => {
                store.request(role, id);
                setSent(id);
              }}
              data-testid={`request-${id}`}
            >
              <Icon name={done ? 'check' : 'hand'} />
              <span className="request__text">
                {t(`request.${id}.label`)}
                {done && <span className="request__sent">{t('ui.console.request_sent')}</span>}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function Callouts({ role, ids }: { role: RoleId; ids: string[] }) {
  const t = useT();
  const store = useStore();
  const alerts = useSel((s) => s.flight.alerts);
  const now = useServerNow(2);
  const [called, setCalled] = useState<string | null>(null);
  useEffect(() => {
    if (!called) return undefined;
    const id = setTimeout(() => setCalled(null), 1400);
    return () => clearTimeout(id);
  }, [called]);
  if (ids.length === 0) return null;
  const wanted = (id: string) => alerts.find((a) => a.role === role && a.calloutId === id && a.calledAtMs == null && a.endsAtMs > now);
  // The callout an open alert asks for comes first and spans the bar.
  const ordered = [...ids].sort((a, b) => Number(!!wanted(b)) - Number(!!wanted(a)));
  return (
    <div className="actionbar callouts" role="group" aria-label={t('ui.console.callouts')}>
      {ordered.map((id) => {
        const alert = wanted(id);
        const done = called === id;
        return (
          <button
            key={id}
            type="button"
            className={`btn callout ${alert ? `callout--wanted ${alert.severity === 'WARNING' ? 'btn--bad' : 'btn--warn'}` : ''} ${done ? 'callout--done' : ''}`}
            onClick={() => {
              store.callout(role, id);
              setCalled(id);
            }}
            data-testid={`callout-${id}`}
          >
            <Icon name={done ? 'check' : 'megaphone'} size="1.1em" />
            <span>{done ? t('ui.console.callout_sent') : calloutLabel(t, id, alert ? alert.arg : null)}</span>
          </button>
        );
      })}
    </div>
  );
}

function ConsolePanel({ role }: { role: RoleId }) {
  const t = useT();
  const c = useSel((s) => s.flight.consoles[role] ?? null);
  if (!c) {
    return (
      <div className="panel panel--flat waiting" role="status">
        <span className="spinner" aria-hidden="true" />
        <p className="body-sm">{t('ui.console.standby_detail')}</p>
      </div>
    );
  }
  return (
    <>
      <div className="consolehead">
        <CallSign role={role} />
        <span className="consolehead__name">{t(`role.${role}.name`)}</span>
      </div>
      <Gauges console={c} />
      <Requests role={role} ids={c.config.requestIds} />
    </>
  );
}

// ───────────── blackout ─────────────

function StaticNoise({ still }: { still: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return undefined;
    const W = 96;
    const H = 168;
    canvas.width = W;
    canvas.height = H;
    const img = ctx.createImageData(W, H);
    let band = 0;
    const paint = () => {
      const d = img.data;
      band = (band + 7) % H;
      for (let y = 0; y < H; y++) {
        // A brighter band rolls down the picture like a lost vertical hold.
        const boost = Math.abs(y - band) < 9 ? 46 : 0;
        for (let x = 0; x < W; x++) {
          const i = (y * W + x) * 4;
          const v = (Math.random() * 150 + boost) | 0;
          d[i] = v * 0.78;
          d[i + 1] = v * 0.92;
          d[i + 2] = v;
          d[i + 3] = 255;
        }
      }
      ctx.putImageData(img, 0, 0);
    };
    paint();
    if (still) return undefined;
    const id = setInterval(paint, 90);
    return () => clearInterval(id);
  }, [still]);
  return <canvas ref={ref} className="blackout__noise" aria-hidden="true" />;
}

function Blackout({ blackout }: { blackout: BlackoutSetPayload }) {
  const t = useT();
  const still = useSel(isReducedMotion);
  const left = useRemaining(blackout.expectedEndAtMs, 4);
  const cause = blackout.cause ?? 'OUT_OF_COVERAGE';
  const secs = left != null ? Math.ceil(left / 1000) : null;
  // Under a minute: "12 s"; longer: "3:05 min".
  const eta = secs == null ? null : secs < 60 ? { text: String(secs), unit: 's' } : { text: `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`, unit: 'min' };
  return (
    <div className="screen blackout" data-testid="console-blackout">
      <StaticNoise still={still} />
      <div className="blackout__veil" aria-hidden="true" />
      <div className="blackout__card" role="status" aria-live="polite">
        <span className="blackout__icon">
          <Icon name="signalOff" size="2.2rem" />
        </span>
        <span className="eyebrow">{t('ui.blackout.title')}</span>
        <h1 className="title">{t(`ui.blackout.${cause}`)}</h1>
        <p className="lede">{t(`ui.blackout.${cause}.detail`)}</p>
        {eta ? (
          <p className="blackout__eta">
            <span className="body-sm">{t('ui.blackout.back_in')}</span>
            <span className="num blackout__time">
              {eta.text}
              <span className="unit">{eta.unit}</span>
            </span>
          </p>
        ) : (
          <p className="body-sm">{t('ui.blackout.waiting')}</p>
        )}
      </div>
    </div>
  );
}

// ───────────── screen ─────────────

export function ConsoleScreen() {
  const t = useT();
  const blackout = useSel((s) => s.flight.blackout);
  const player = useSel(isPlayer);
  const roles = useSel(myRoles);
  const [picked, setPicked] = useState<RoleId | null>(null);
  const selected: RoleId | null = picked && roles.includes(picked) ? picked : (roles[0] ?? null);
  const calloutIds = useSel((s) => (selected ? (s.flight.consoles[selected]?.config.calloutIds ?? null) : null));

  if (blackout) return <Blackout blackout={blackout} />;

  const staffed = player && selected != null;
  return (
    <div className="screen console" data-testid="console-screen">
      <div className="screen__scroll console__scroll" tabIndex={0}>
        <h1 className="sr-only">{t('ui.console.mission_view')}</h1>
        {/* Alerts come first and stay pinned while the console scrolls: a Good Call window is short. */}
        {staffed && <Alerts roles={roles} selected={selected} onSelect={setPicked} />}
        <Hud />
        <TeamStrip />
        {staffed && roles.length > 1 && <RoleTabs roles={roles} selected={selected} onSelect={setPicked} />}
        {staffed ? (
          <ConsolePanel key={selected} role={selected} />
        ) : (
          <p className="eyebrow eyebrow--dim">{t('ui.console.mission_view')}</p>
        )}
        <Events />
      </div>
      {staffed && calloutIds && <Callouts role={selected} ids={calloutIds} />}
    </div>
  );
}
