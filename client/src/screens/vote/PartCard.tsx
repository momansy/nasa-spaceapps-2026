// The Part Card (design 14.3): 3D model, name and twin, stat bars normalised within the
// category with units, lead / integration / reliability, strengths, drawbacks in a red-bordered
// block that never scrolls out of view, the hidden-risk badge, the host's "if chosen" deltas,
// a fact, and tap-a-stat explanations. Every number shown comes from the bundled catalog (part
// figures) or from the host (deltas, affordability); nothing is recomputed here.
import { memo, useCallback, useEffect, useId, useRef, useState, type CSSProperties } from 'react';
import type { RoleId, TagKind, VoteOption, VoteTagsPayload } from '@protocol';
import { getFact, getPart, partsOfCategory, type Part } from '../../data/catalog';
import { fmt, fmtMetricDelta, fmtMetricValue, fmtMoney, METRIC_SPECS } from '../../data/format';
import { reliabilityLine, scheduleLine, statExplainKey, statLabelFallback, statLabelKey, statRows } from '../../data/stats';
import { useT } from '../../i18n';
import type { Translator } from '../../i18n/core';
import { resolveText } from '../../i18n/textref';
import { Icon, TONE_ICON, toneOfRating } from '../../ui/Icon';
import { PartViewer } from '../../viewer/PartViewer';

export interface PartCardProps {
  option: VoteOption;
  /** Category of the round (used when the option has no part, e.g. a token option). */
  categoryId: string | null;
  /** Live tally count for this option; null when hidden or not in a voting stage. */
  count: number | null;
  leading: boolean;
  mine: boolean;
  vetoed: string | null;
  tags: VoteTagsPayload['tags'];
  insight: Array<{ role: RoleId; text: string }>;
  /** Tag controls for an owner role the player holds; null when the player cannot tag. */
  tagAs: { role: RoleId; current: TagKind | null; onTag: (tag: TagKind | null) => void } | null;
  /** Whether the card is the visible one in the carousel (runs the 3D viewer). */
  active: boolean;
  onExpandViewer: () => void;
  emergencyAvailable: boolean;
}

function label(t: Translator, id: string): string {
  const key = statLabelKey(id);
  return t.has(key) ? t(key) : statLabelFallback(id);
}

function listKeys(part: Part, field: 'strengths' | 'drawbacks'): string[] {
  const listed = part[field];
  if (listed && listed.length) return listed;
  // Parts that list no keys still have numbered strings (`part.<id>.drawback.1`).
  const single = field === 'strengths' ? 'strength' : 'drawback';
  const out: string[] = [];
  for (let i = 1; i <= 6; i++) out.push(`part.${part.id}.${single}.${i}`);
  return out;
}

function StatRow({ id, text, fraction, noteKey, open, onToggle }: { id: string; text: string; fraction: number | null; noteKey?: string; open: boolean; onToggle: () => void }) {
  const t = useT();
  const explainKey = statExplainKey(id);
  const explain = t.has(explainKey) ? t(explainKey) : null;
  const pid = useId();
  const valueText = noteKey ? (text ? `${text} · ${t(noteKey)}` : t(noteKey)) : text;
  return (
    <li className={`stat ${open ? 'stat--open' : ''}`}>
      <button type="button" className="stat__btn" onClick={onToggle} aria-expanded={explain ? open : undefined} aria-controls={explain ? pid : undefined} disabled={!explain}>
        <span className="stat__k">{label(t, id)}</span>
        <span className="stat__v num">{valueText}</span>
        {fraction != null ? (
          <span className="stat__bar" aria-hidden="true">
            {/* The gradient spans the whole track (Ocean → Signal → Ceramic), so a part near the top
                of its category reaches the bright end; the fill only reveals it. */}
            <span className="stat__fill" style={{ '--f': Math.max(0.03, Math.min(1, fraction)) } as CSSProperties} />
          </span>
        ) : (
          <span aria-hidden="true" />
        )}
      </button>
      {explain && open && (
        <p id={pid} className="stat__explain" role="note">
          <Icon name="info" size="0.95rem" />
          <span>{explain}</span>
        </p>
      )}
    </li>
  );
}

function Deltas({ option }: { option: VoteOption }) {
  const t = useT();
  if (option.deltas.length === 0) return <p className="body-sm">{t('ui.card.if_chosen_none')}</p>;
  return (
    <ul className="deltas">
      {option.deltas.map((d) => {
        const spec = METRIC_SPECS[d.metric];
        const tone = toneOfRating(d.rating);
        const text = spec.show === 'value' ? fmtMetricValue(d.metric, d.value) : fmtMetricDelta(d.metric, d.delta);
        const dir = d.delta > 0 ? 'arrowUp' : d.delta < 0 ? 'arrowDown' : null;
        return (
          <li key={d.metric} className={`delta delta--${tone}`}>
            <span className="delta__k">{t(spec.labelKey)}</span>
            <span className="delta__v">
              {dir && <Icon name={dir} size="0.9rem" strokeWidth={2.6} />}
              <span className="num">{text}</span>
            </span>
            <span className={`delta__r tone-${tone}`} title={t(`ui.rating.${d.rating}`)}>
              <Icon name={TONE_ICON[tone]} size="1rem" strokeWidth={2.4} label={t(`ui.rating.${d.rating}`)} />
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function Warnings({ option, emergencyAvailable }: { option: VoteOption; emergencyAvailable: boolean }) {
  const t = useT();
  const items: Array<{ tone: 'bad' | 'warn'; text: string; sub?: string }> = [];
  if (option.afford !== 'OK' || option.overBudgetByM > 0) {
    items.push({
      tone: option.afford === 'NEVER' || !emergencyAvailable ? 'bad' : 'warn',
      text: option.overBudgetByM > 0 ? t('ui.card.over_budget', { amount: fmtMoney(option.overBudgetByM) }) : t('ui.card.never_affordable'),
      sub: option.afford === 'EMERGENCY_FUNDING' && emergencyAvailable ? t('ui.card.emergency_ok') : option.afford === 'NEVER' ? t('ui.card.never_affordable') : undefined,
    });
  }
  if (option.overScheduleByDays > 0) items.push({ tone: 'bad', text: t('ui.card.over_schedule', { days: fmt(option.overScheduleByDays, 0) }) });
  if (option.willNotFly) items.push({ tone: option.fixExists ? 'warn' : 'bad', text: t('ui.card.will_not_fly'), sub: t(option.fixExists ? 'ui.card.fix_exists' : 'ui.card.no_fix') });
  for (const w of option.warnings) items.push({ tone: 'warn', text: resolveText(t, w) });
  if (items.length === 0) return null;
  return (
    <div className="stack stack--sm">
      {items.map((it, i) => (
        <div key={i} className={`banner banner--${it.tone}`} role="note">
          <Icon name={TONE_ICON[it.tone]} size="1.15rem" className={`tone-${it.tone}`} />
          <div>
            <strong>{it.text}</strong>
            {it.sub && <div className="body-sm">{it.sub}</div>}
          </div>
        </div>
      ))}
    </div>
  );
}

export const PartCard = memo(function PartCard(props: PartCardProps) {
  const { option, count, leading, mine, vetoed, tags, insight, tagAs, active, onExpandViewer, emergencyAvailable } = props;
  const t = useT();
  const [openStat, setOpenStat] = useState<string | null>(null);
  const part = getPart(option.partId);
  const toggle = (id: string) => setOpenStat((cur) => (cur === id ? null : id));

  // The face scrolls above the pinned drawbacks block. While more is hidden below the fold, a
  // "More" pill says so (and scrolls on tap), so every stat row is reachable.
  const scrollRef = useRef<HTMLDivElement>(null);
  const [more, setMore] = useState(false);
  const measure = useCallback(() => {
    const el = scrollRef.current;
    if (el) setMore(el.scrollHeight - el.scrollTop - el.clientHeight > 12);
  }, []);
  const scrollMore = () => scrollRef.current?.scrollBy({ top: Math.max(80, (scrollRef.current?.clientHeight ?? 200) * 0.7), behavior: 'smooth' });
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return undefined;
    measure();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    ro?.observe(el);
    Array.from(el.children).forEach((c) => ro?.observe(c));
    return () => ro?.disconnect();
  }, [measure, option.id, openStat]);

  if (!part) return null;
  const rows = statRows(part);
  const sched = scheduleLine(part);
  const rel = reliabilityLine(part);
  const twinKey = part.twin;
  const strengths = listKeys(part, 'strengths').filter((k) => t.has(k));
  const drawbacks = listKeys(part, 'drawbacks').filter((k) => t.has(k));
  const factId = part.facts?.[0] ?? null;
  const fact = factId ? getFact(factId) : null;
  const factText = fact && t.has(fact.text_key) ? t(fact.text_key) : null;
  const categoryName = t(`category.${part.category}.name`);
  const peers = partsOfCategory(part.category).length;

  return (
    <article
      className={`pcard ${mine ? 'pcard--mine' : ''} ${vetoed ? 'pcard--vetoed' : ''} ${leading ? 'pcard--leading' : ''}`}
      aria-label={t(part.name_key)}
      data-testid={`card-${option.id}`}
      data-maturity={part.game?.maturity ?? undefined}
    >
      <div className="pcard__viewport">
      <div className="pcard__scroll" ref={scrollRef} onScroll={measure}>
        <div className="pcard__media">
          <PartViewer partId={part.id} size="card" active={active && !vetoed} onExpand={onExpandViewer} />
          <div className="pcard__badges">
            {tags.map((tg) => (
              <span key={`${tg.playerId}-${tg.optionId}`} className={`rtag rtag--${tg.tag === 'RECOMMENDED' ? 'rec' : 'con'}`}>
                <Icon name={tg.tag === 'RECOMMENDED' ? 'star' : 'warn'} size="0.85rem" filled={tg.tag === 'RECOMMENDED'} strokeWidth={2.2} />
                <span>{t('ui.vote.tag_by', { role: tg.role, tag: t(`ui.vote.tag.${tg.tag}`) })}</span>
              </span>
            ))}
          </div>
          {count != null && (
            <span className={`pcard__tally ${leading ? 'pcard__tally--lead' : ''}`} data-testid={`tally-${option.id}`}>
              <Icon name="users" size="0.9rem" />
              <span className="num">{count === 1 ? t('ui.vote.tally_one') : t('ui.vote.tally', { n: count })}</span>
            </span>
          )}
          {mine && (
            <span className="pcard__mine">
              <Icon name="check" size="0.9rem" strokeWidth={3} />
              {t('ui.vote.yours')}
            </span>
          )}
        </div>

        <header className="pcard__head">
          <div className="pcard__meta">
            <span className="pcard__cat">{categoryName}</span>
            {rel?.maturityKey && (
              <span className={`pcard__grade pcard__grade--${part.game?.maturity}`}>
                <Icon name={part.game?.maturity === 'proven' ? 'shield' : part.game?.maturity === 'new' ? 'sparkle' : 'award'} size="0.95em" strokeWidth={2.2} />
                {t(rel.maturityKey)}
              </span>
            )}
          </div>
          <h2 className="pcard__name">{t(part.name_key)}</h2>
          {twinKey && t.has(twinKey) && <p className="pcard__twin">{t('ui.card.twin', { name: t(twinKey) })}</p>}
        </header>

        <Warnings option={option} emergencyAvailable={emergencyAvailable} />

        {rows.length > 0 ? (
          <ul className="stats" aria-label={t('ui.card.tap_stat')}>
            {rows.map((r) => (
              <StatRow key={r.id} id={r.id} text={r.text} fraction={peers > 1 ? r.fraction : null} noteKey={r.noteKey} open={openStat === r.id} onToggle={() => toggle(r.id)} />
            ))}
          </ul>
        ) : (
          <p className="body-sm">{t('ui.card.no_stats')}</p>
        )}

        {(sched.leadDays != null || sched.integDays != null || rel) && (
          <ul className="stats stats--plain">
            {(sched.leadDays != null || sched.integDays != null) && (
              <li className={`stat ${openStat === 'lead' ? 'stat--open' : ''}`}>
                <button type="button" className="stat__btn stat__btn--split" onClick={() => toggle('lead')} aria-expanded={openStat === 'lead'}>
                  {sched.leadDays != null && (
                    <span className="stat__pair">
                      <span className="stat__k">{t('ui.card.lead')}</span>
                      <span className="stat__v num">{t('ui.card.days', { n: fmt(sched.leadDays, 0) })}</span>
                    </span>
                  )}
                  {sched.integDays != null && (
                    <span className="stat__pair">
                      <span className="stat__k">{t('ui.card.integ')}</span>
                      <span className="stat__v num">{t('ui.card.days', { n: fmt(sched.integDays, 0) })}</span>
                    </span>
                  )}
                </button>
                {openStat === 'lead' && (
                  <p className="stat__explain" role="note">
                    <Icon name="info" size="0.95rem" />
                    <span>
                      {t('ui.card.explain_lead')} {t('ui.card.explain_integ')}
                    </span>
                  </p>
                )}
              </li>
            )}
            {rel && (
              <li className={`stat ${openStat === 'rel' ? 'stat--open' : ''}`}>
                <button type="button" className="stat__btn" onClick={() => toggle('rel')} aria-expanded={openStat === 'rel'}>
                  <span className="stat__k">{t('ui.card.reliability')}</span>
                  <span className="stat__v num">
                    {rel.text}
                    {rel.band && <span className="dim"> {rel.band}</span>}
                  </span>
                  <span className="stat__tagcell">{rel.maturityKey && <span className={`maturity maturity--${part.game?.maturity}`}>{t(rel.maturityKey)}</span>}</span>
                </button>
                {openStat === 'rel' && (
                  <p className="stat__explain" role="note">
                    <Icon name="info" size="0.95rem" />
                    <span>{t('ui.card.explain_reliability')}</span>
                  </p>
                )}
              </li>
            )}
          </ul>
        )}

        {rel?.hiddenRisk && (
          <p className="riskbadge" data-testid="hidden-risk">
            <Icon name="search" size="1rem" strokeWidth={2.4} />
            <span>{t('ui.card.hidden_risk')}</span>
          </p>
        )}

        {strengths.length > 0 && (
          <section className="plist plist--good">
            <h3 className="plist__title">
              <Icon name={TONE_ICON.good} size="1rem" />
              {t('ui.card.strengths')}
            </h3>
            <ul>
              {strengths.map((k) => (
                <li key={k}>{t(k)}</li>
              ))}
            </ul>
          </section>
        )}

        <section className="ifchosen">
          <h3 className="plist__title">
            <Icon name="gauge" size="1rem" />
            {t('ui.card.if_chosen')}
          </h3>
          <Deltas option={option} />
        </section>

        {insight.length > 0 && (
          <section className="insight">
            {insight.map((line, i) => (
              <p key={i} className="insight__line">
                <span className="callsign">{line.role}</span>
                <span>{line.text}</span>
              </p>
            ))}
          </section>
        )}

        {tagAs && !vetoed && (
          <section className="tagbar" aria-label={t('ui.vote.tag_as', { role: tagAs.role })}>
            <span className="tagbar__k">{t('ui.vote.tag_as', { role: tagAs.role })}</span>
            <div className="tagbar__btns">
              {(['RECOMMENDED', 'CONCERN'] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  className={`btn btn--sm ${tagAs.current === k ? (k === 'RECOMMENDED' ? 'btn--good' : 'btn--warn') : ''}`}
                  aria-pressed={tagAs.current === k}
                  onClick={() => tagAs.onTag(tagAs.current === k ? null : k)}
                  data-testid={`tag-${k}`}
                >
                  <Icon name={k === 'RECOMMENDED' ? 'star' : 'warn'} size="1rem" filled={k === 'RECOMMENDED' && tagAs.current === k} />
                  {t(k === 'RECOMMENDED' ? 'ui.vote.tag_recommend' : 'ui.vote.tag_concern')}
                </button>
              ))}
            </div>
          </section>
        )}

        {factText && (
          <aside className="dyk">
            <Icon name="bulb" size="1.2rem" className="dyk__icon" />
            <div>
              <p className="dyk__k">{t('ui.card.did_you_know')}</p>
              <p className="dyk__v">{factText}</p>
            </div>
          </aside>
        )}
      </div>
      {more && (
        <button type="button" className="pcard__more" onClick={scrollMore} aria-label={t('ui.card.more_stats')} data-testid="card-more">
          <Icon name="chevronDown" size="1rem" strokeWidth={2.6} />
          <span>{t('ui.card.more')}</span>
        </button>
      )}
      </div>
      <div className="pcard__pin">
        {drawbacks.length > 0 && (
          <section className="plist plist--bad drawbacks" data-testid="drawbacks">
            <h3 className="plist__title">
              <Icon name={TONE_ICON.bad} size="1rem" />
              {t('ui.card.drawbacks')}
            </h3>
            <ul>
              {drawbacks.map((k) => (
                <li key={k}>{t(k)}</li>
              ))}
            </ul>
          </section>
        )}
      </div>

      {vetoed && (
        <div className="pcard__stamp" role="status">
          <Icon name="ban" size="2rem" strokeWidth={2.4} />
          <span>{vetoed}</span>
        </div>
      )}
    </article>
  );
});
