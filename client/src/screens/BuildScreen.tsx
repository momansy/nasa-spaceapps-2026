// "Our rocket": what the phone shows between decisions in the briefing, build and review
// phases. Every number comes from the host's `build.state`; nothing is recomputed here.
import type { Rating, Severity } from '@protocol';
import { getPart } from '../data/catalog';
import { fmt, fmtMetricValue, fmtMoney, METRIC_SPECS } from '../data/format';
import { useT } from '../i18n';
import { resolveText } from '../i18n/textref';
import { useSel } from '../state/store';
import type { FeedItem } from '../state/types';
import { Icon, TONE_ICON, toneOfRating, type IconName, type Tone } from '../ui/Icon';
import { Bar, Chip } from '../ui/kit';
import { optionName } from './vote/names';
import './build.css';

const SEVERITY_TONE: Record<Severity, Tone> = { BLOCKER: 'bad', MAJOR: 'warn', MINOR: 'neutral' };

function ratingTone(r: Rating): Tone {
  return toneOfRating(r);
}

function Budget() {
  const t = useT();
  const build = useSel((s) => s.build);
  if (!build) return null;
  const budgetFrac = build.budgetTotalM > 0 ? build.budgetSpentM / build.budgetTotalM : 0;
  const schedFrac = build.scheduleLimitDays > 0 ? build.scheduleUsedDays / build.scheduleLimitDays : 0;
  const tone = (f: number): Tone => (f > 1 ? 'bad' : f > 0.85 ? 'warn' : 'good');
  return (
    <section className="panel stack" aria-label={t('ui.build.ledger')}>
      <div className="stack stack--sm">
        <div className="kv">
          <span className="kv__k">
            <Icon name="wallet" size="1rem" style={{ display: 'inline', verticalAlign: '-0.15em', marginInlineEnd: 6 }} />
            {t('ui.build.budget')}
          </span>
          <span className="kv__v num">
            {fmtMoney(build.budgetSpentM)} <span className="dim">/ {fmtMoney(build.budgetTotalM)}</span>
          </span>
        </div>
        <Bar fraction={budgetFrac} tone={tone(budgetFrac)} label={t('ui.build.budget')} />
      </div>
      <div className="stack stack--sm">
        <div className="kv">
          <span className="kv__k">
            <Icon name="calendar" size="1rem" style={{ display: 'inline', verticalAlign: '-0.15em', marginInlineEnd: 6 }} />
            {t('ui.build.schedule')}
          </span>
          <span className="kv__v num">
            {fmt(build.scheduleUsedDays, 0)} <span className="dim">/ {fmt(build.scheduleLimitDays, 0)} {t('ui.unit.days')}</span>
          </span>
        </div>
        <Bar fraction={schedFrac} tone={tone(schedFrac)} label={t('ui.build.schedule')} />
      </div>
    </section>
  );
}

function Dashboard() {
  const t = useT();
  const metrics = useSel((s) => s.build?.metrics ?? []);
  if (metrics.length === 0) return null;
  return (
    <section className="stack">
      <h2 className="section-title">
        <Icon name="gauge" size="1rem" />
        {t('ui.build.dashboard')}
      </h2>
      <ul className="dash">
        {metrics.map((m) => {
          const tone = ratingTone(m.rating);
          return (
            <li key={m.metric} className={`dash__cell dash__cell--${tone}`}>
              <span className="dash__k">{t(METRIC_SPECS[m.metric].labelKey)}</span>
              <span className="dash__v num">{fmtMetricValue(m.metric, m.value)}</span>
              <span className={`dash__r tone-${tone}`}>
                <Icon name={TONE_ICON[tone]} size="0.95rem" strokeWidth={2.6} />
                {m.required != null ? t('ui.build.required', { value: fmtMetricValue(m.metric, m.required) }) : t(`ui.rating.${m.rating}`)}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function Parts() {
  const t = useT();
  const parts = useSel((s) => s.build?.parts ?? []);
  if (parts.length === 0) return null;
  return (
    <section className="stack">
      <h2 className="section-title">
        <Icon name="rocket" size="1rem" />
        {t('ui.build.parts', { n: parts.length })}
      </h2>
      <ul className="partlist">
        {parts.map((p) => {
          const part = getPart(p.partId);
          return (
            <li key={p.category} className="partlist__row">
              <span className="partlist__cat">{t(`category.${p.category}.name`)}</span>
              <span className="partlist__name">
                {part ? t(part.name_key) : p.partId}
                {p.count > 1 && <span className="num dim"> ×{p.count}</span>}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function LastDecision() {
  const t = useT();
  const last = useSel((s) => s.lastVote);
  if (!last?.result) return null;
  const winner = last.opened.options.find((o) => o.id === last.result!.winnerId);
  return (
    <section className="banner banner--good">
      <Icon name="check" size="1.2rem" className="tone-good" />
      <div className="grow">
        <span className="toast__kind">{t('ui.build.last_decision')}</span>
        <strong>{resolveText(t, last.opened.title)}:</strong> {winner ? optionName(t, last.opened, winner) : last.result.winnerId}
      </div>
    </section>
  );
}

const FEED_ICON: Record<FeedItem['kind'], IconName> = { build: 'bolt', flight: 'rocket', notice: 'radio' };

function Feed() {
  const t = useT();
  const feed = useSel((s) => s.feed);
  const items = feed.slice(-4).reverse();
  if (items.length === 0) return null;
  return (
    <section className="stack">
      <h2 className="section-title">
        <Icon name="radio" size="1rem" />
        {t('ui.build.feed')}
      </h2>
      <ul className="feed">
        {items.map((it) => (
          <li key={it.id} className="feed__row">
            <Icon name={FEED_ICON[it.kind]} size="1rem" className="tone-accent" />
            <span>{it.kind === 'notice' ? resolveText(t, it.notice.text) : resolveText(t, it.event.text)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Issues() {
  const t = useT();
  const issues = useSel((s) => s.build?.issues ?? []);
  if (issues.length === 0) return null;
  return (
    <section className="stack">
      <h2 className="section-title">
        <Icon name="warn" size="1rem" />
        {t('ui.build.issues', { n: issues.length })}
      </h2>
      <ul className="stack stack--sm">
        {issues.map((i) => (
          <li key={i.ruleId} className={`banner banner--${SEVERITY_TONE[i.severity] === 'neutral' ? 'accent' : SEVERITY_TONE[i.severity]}`}>
            <Chip tone={SEVERITY_TONE[i.severity]}>{t(`ui.severity.${i.severity}`)}</Chip>
            <span className="grow">{resolveText(t, i.text)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function BuildScreen() {
  const t = useT();
  const phase = useSel((s) => s.phase);
  const build = useSel((s) => s.build);
  const contractId = phase?.contractId ?? build?.contractId ?? null;
  const p = phase?.phase ?? 'BRIEFING';
  const step = phase?.step ?? null;

  return (
    <div className="screen" data-testid="screen-build" data-phase={p}>
      <div className="screen__scroll" tabIndex={0}>
        <header className="stack stack--sm">
          <p className="eyebrow">{t(`ui.phase.${p}`)}</p>
          {contractId ? (
            <>
              <h1 className="title">{t(`contract.${contractId}.name`)}</h1>
              <p className="lede">{t(`contract.${contractId}.destination`)}</p>
            </>
          ) : (
            <h1 className="title">{t('ui.build.no_contract')}</h1>
          )}
        </header>

        {step && (
          <div className="steps" role="group" aria-label={t('ui.build.step', { index: step.index, total: step.total })}>
            <div className="row row--between">
              <span className="body-sm">{t('ui.build.step', { index: step.index, total: step.total })}</span>
              <span className="num dim">{fmt((step.index / step.total) * 100, 0)}&nbsp;%</span>
            </div>
            <Bar fraction={step.index / step.total} />
          </div>
        )}

        <div className="standby">
          <span className="standby__radar" aria-hidden="true" />
          <div className="grow">
            <p className="standby__title">{t(`ui.build.standby.${p === 'FRR' ? 'FRR' : p === 'BRIEFING' ? 'BRIEFING' : 'default'}`)}</p>
            <p className="body-sm">{t('ui.build.standby.hint')}</p>
          </div>
        </div>

        <LastDecision />
        {contractId && !build && (
          <section className="panel stack stack--sm">
            <p className="eyebrow eyebrow--dim">{t('ui.build.payload')}</p>
            <p>{t(`contract.${contractId}.payload`)}</p>
            <hr className="rule" />
            <p className="eyebrow eyebrow--dim">{t('ui.build.primary')}</p>
            <p>{t(`contract.${contractId}.objective.primary`)}</p>
          </section>
        )}
        <Budget />
        <Dashboard />
        <Issues />
        <Parts />
        <Feed />
      </div>
    </div>
  );
}
