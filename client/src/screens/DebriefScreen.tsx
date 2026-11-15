// Personal results and awards (design 14.2 screen 8, sections 11.3 to 11.5 and 12.2).
// Everything shown here comes from the host's `debrief.score`, `debrief.awards` and
// `debrief.facts`; the phone only formats it. Recognition is positive only: no ranking.
import { useEffect, useState } from 'react';
import type { DebriefAwardsPayload, DebriefFactsPayload, DebriefScorePayload, Grade, MissionOutcome, ObjectiveKind } from '@protocol';
import { getCodexEntry, getFact, getPart } from '../data/catalog';
import { fmt } from '../data/format';
import { useT, type Translator } from '../i18n';
import { rolesOf } from '../state/reducer';
import { isReducedMotion, useSel } from '../state/store';
import { Icon, type IconName, type Tone } from '../ui/Icon';
import { Avatar, Bar, CallSign, Chip } from '../ui/kit';
import './debrief.css';

// ───────────── contract objectives (text keys by objective id) ─────────────

interface ObjectiveDef {
  id: string;
  text_key: string;
}

interface ContractFile {
  contracts?: Array<{
    id: string;
    objectives?: { primary?: ObjectiveDef; secondary?: ObjectiveDef[]; stretch?: ObjectiveDef; safety?: ObjectiveDef };
  }>;
}

// The contract catalog is only needed here, so it is a separate chunk fetched at debrief.
const contractLoaders = import.meta.glob('../../../data/contracts.json', { import: 'default' }) as Record<string, () => Promise<ContractFile>>;
let objectiveIndex: Promise<Map<string, Map<string, string>>> | null = null;

function loadObjectiveIndex(): Promise<Map<string, Map<string, string>>> {
  if (!objectiveIndex) {
    objectiveIndex = Promise.all(Object.values(contractLoaders).map((load) => load().catch(() => ({}) as ContractFile))).then((files) => {
      const index = new Map<string, Map<string, string>>();
      for (const file of files) {
        for (const c of file.contracts ?? []) {
          const o = c.objectives ?? {};
          const keys = new Map<string, string>();
          for (const def of [o.primary, ...(o.secondary ?? []), o.stretch, o.safety]) {
            if (def && typeof def.id === 'string' && typeof def.text_key === 'string') keys.set(def.id, def.text_key);
          }
          index.set(c.id, keys);
        }
      }
      return index;
    });
  }
  return objectiveIndex;
}

/** Objective id → string key for one contract; empty until the catalog chunk has loaded. */
function useObjectiveKeys(contractId: string | undefined): Map<string, string> {
  const [keys, setKeys] = useState<Map<string, string>>(() => new Map());
  useEffect(() => {
    if (!contractId) return;
    let alive = true;
    void loadObjectiveIndex().then((index) => {
      if (alive) setKeys(index.get(contractId) ?? new Map());
    });
    return () => {
      alive = false;
    };
  }, [contractId]);
  return keys;
}

// ───────────── small helpers ─────────────

const OUTCOME: Record<MissionOutcome, { tone: Tone; icon: IconName }> = {
  SUCCESS: { tone: 'good', icon: 'check' },
  PARTIAL: { tone: 'warn', icon: 'warn' },
  FAILURE: { tone: 'bad', icon: 'cross' },
};

const AWARD_ICON: Record<string, IconName> = {
  best_callout: 'megaphone',
  budget_hawk: 'wallet',
  fact_finder: 'bulb',
  steady_hands: 'hand',
  team_player: 'users',
  veto_visionary: 'eye',
  rocket_scientist: 'rocket',
  calm_under_pressure: 'shield',
};

const KIND_ORDER: ObjectiveKind[] = ['SAFETY', 'PRIMARY', 'SECONDARY', 'STRETCH'];

function awardIcon(id: string): IconName {
  return AWARD_ICON[id] ?? 'medal';
}

function awardName(t: Translator, id: string): string {
  return t(`award.${id}.name`);
}

function awardDescription(t: Translator, id: string): string | null {
  const key = `award.${id}.description`;
  return t.has(key) ? t(key) : null;
}

/** Counts from 0 to `target`; jumps straight to it in reduced-motion mode. */
function useCountUp(target: number, ms: number, instant: boolean): number {
  const [value, setValue] = useState(instant ? target : 0);
  useEffect(() => {
    if (instant || typeof requestAnimationFrame !== 'function') {
      setValue(target);
      return;
    }
    let raf = 0;
    const t0 = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / ms);
      setValue(Math.round(target * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, ms, instant]);
  return value;
}

// ───────────── hero: outcome, grade, score ─────────────

function Hero({ score }: { score: DebriefScorePayload }) {
  const t = useT();
  const instant = useSel(isReducedMotion);
  const shown = useCountUp(score.total, 1600, instant);
  const outcome = OUTCOME[score.outcome];
  const contractKey = `contract.${score.contractId}.name`;
  const grade: Grade = score.grade;
  return (
    <section className="db-hero" data-grade={grade} data-testid="debrief-hero">
      <p className="eyebrow">{t('ui.debrief.eyebrow', { n: score.missionSeq })}</p>
      {t.has(contractKey) && <p className="db-hero__contract">{t(contractKey)}</p>}
      <div className="db-hero__chips">
        <Chip tone={outcome.tone} icon={outcome.icon}>
          {t(`ui.outcome.${score.outcome}`)}
        </Chip>
        {score.crewSafe != null && (
          <Chip tone={score.crewSafe ? 'good' : 'bad'} icon={score.crewSafe ? 'shield' : 'warn'}>
            {t(score.crewSafe ? 'ui.debrief.crew_safe' : 'ui.debrief.crew_not_safe')}
          </Chip>
        )}
      </div>
      <div className="db-grade" role="img" aria-label={t('ui.debrief.grade_label', { grade })}>
        <svg viewBox="0 0 100 100" aria-hidden="true">
          <polygon className="db-grade__ring" points="50,3 91,26.500 91,73.500 50,97 9,73.500 9,26.500" />
          <polygon className="db-grade__core" points="50,11 84,30.500 84,69.500 50,89 16,69.500 16,30.500" />
        </svg>
        <span className="db-grade__letter" aria-hidden="true">
          {grade}
        </span>
      </div>
      <h1 className="title db-hero__title">{t(score.title.key, score.title.args)}</h1>
      <p className="db-score">
        <span className="sr-only">{t('ui.debrief.score_label', { points: fmt(score.total, 0) })}</span>
        <span className="num db-score__value" aria-hidden="true">
          {fmt(shown, 0)}
        </span>
        <span className="db-score__unit" aria-hidden="true">
          {t('ui.debrief.pts')}
        </span>
      </p>
      <p className="body-sm">{t('ui.debrief.score_caption')}</p>
    </section>
  );
}

// ───────────── my awards and stats ─────────────

type AwardRow = DebriefAwardsPayload['players'][number];

function MyAwards({ mine }: { mine: AwardRow }) {
  const t = useT();
  const stats: Array<{ icon: IconName; value: number; label: string }> = [
    { icon: 'bulb', value: mine.kp, label: t('ui.debrief.stat.kp') },
    { icon: 'megaphone', value: mine.goodCalls, label: t('ui.debrief.stat.good_calls') },
    { icon: 'target', value: mine.minigameSuccesses, label: t('ui.debrief.stat.minigames') },
    { icon: 'check', value: mine.predictionsCorrect, label: t('ui.debrief.stat.predictions') },
  ];
  return (
    <section className="stack" aria-labelledby="db-mine" data-testid="debrief-awards">
      <h2 id="db-mine" className="section-title">
        <Icon name="trophy" size="1rem" />
        <span>{t('ui.debrief.my_awards')}</span>
      </h2>
      <ul className="stack stack--sm">
        {mine.awardIds.map((id, i) => {
          const desc = awardDescription(t, id);
          return (
            <li key={id} className="db-award" style={{ animationDelay: `${200 + i * 140}ms` }}>
              <span className="db-award__medal" aria-hidden="true">
                <Icon name={awardIcon(id)} size="1.6rem" />
              </span>
              <span className="grow">
                <span className="db-award__name">{awardName(t, id)}</span>
                {desc && <span className="db-award__desc">{desc}</span>}
              </span>
            </li>
          );
        })}
      </ul>
      <ul className="db-stats" aria-label={t('ui.debrief.my_stats')}>
        {stats.map((s) => (
          <li key={s.label} className="db-stat">
            <Icon name={s.icon} size="1.1rem" className="tone-accent" />
            <span className="num db-stat__value">{fmt(s.value, 0)}</span>
            <span className="db-stat__label">{s.label}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ───────────── score breakdown ─────────────

function Breakdown({ score }: { score: DebriefScorePayload }) {
  const t = useT();
  const b = score.breakdown;
  const rows: Array<{ id: string; icon: IconName; value: number }> = [
    { id: 'objectives', icon: 'flag', value: b.objectives },
    { id: 'efficiency', icon: 'wallet', value: b.efficiency },
    { id: 'safetyRecovery', icon: 'shield', value: b.safetyRecovery },
    { id: 'scienceData', icon: 'globe', value: b.scienceData },
    { id: 'teamwork', icon: 'users', value: b.teamwork },
    { id: 'knowledge', icon: 'bulb', value: b.knowledge },
  ];
  const max = Math.max(1, ...rows.map((r) => r.value));
  const subtotal = rows.reduce((sum, r) => sum + r.value, 0);
  return (
    <section className="stack" aria-labelledby="db-breakdown">
      <h2 id="db-breakdown" className="section-title">
        <Icon name="scale" size="1rem" />
        <span>{t('ui.debrief.breakdown.title')}</span>
      </h2>
      <div className="panel db-breakdown">
        <ul className="stack stack--sm">
          {rows.map((r) => (
            <li key={r.id} className="db-line">
              <Icon name={r.icon} size="1.05rem" className="db-line__icon" />
              <span className="db-line__label">{t(`ui.debrief.breakdown.${r.id}`)}</span>
              <span className="num db-line__value">
                {fmt(r.value, 0)}
                <span className="unit">{t('ui.debrief.pts')}</span>
              </span>
              <span className="db-line__bar">
                <Bar fraction={r.value / max} />
              </span>
            </li>
          ))}
        </ul>
        <hr className="rule" />
        <dl className="db-sum">
          <div className="kv">
            <dt className="kv__k">{t('ui.debrief.breakdown.subtotal')}</dt>
            <dd className="kv__v num">
              {fmt(subtotal, 0)}
              <span className="unit">{t('ui.debrief.pts')}</span>
            </dd>
          </div>
          <div className="kv">
            <dt className="kv__k">{t('ui.debrief.breakdown.difficultyMult')}</dt>
            <dd className="kv__v num">×{fmt(b.difficultyMult, 2, 1)}</dd>
          </div>
          <div className="kv">
            <dt className="kv__k">{t('ui.debrief.breakdown.boostMult')}</dt>
            <dd className="kv__v num">×{fmt(b.boostMult, 2, 1)}</dd>
          </div>
          <div className="kv db-sum__total">
            <dt className="kv__k">{t('ui.debrief.breakdown.total')}</dt>
            <dd className="kv__v num">
              {fmt(score.total, 0)}
              <span className="unit">{t('ui.debrief.pts')}</span>
            </dd>
          </div>
        </dl>
      </div>
    </section>
  );
}

// ───────────── objectives ─────────────

function Objectives({ score }: { score: DebriefScorePayload }) {
  const t = useT();
  const keys = useObjectiveKeys(score.contractId);
  if (score.objectives.length === 0) return null;
  const sorted = [...score.objectives].sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind));
  const met = sorted.filter((o) => o.met).length;
  return (
    <section className="stack" aria-labelledby="db-objectives">
      <h2 id="db-objectives" className="section-title">
        <Icon name="flag" size="1rem" />
        <span>{t('ui.debrief.objectives.title', { met, total: sorted.length })}</span>
      </h2>
      <ul className="stack stack--sm">
        {sorted.map((o) => {
          const key = keys.get(o.id);
          const text = key && t.has(key) ? t(key) : t(`ui.objective.${o.kind}`);
          return (
            <li key={o.id} className={`db-objective ${o.met ? 'db-objective--met' : 'db-objective--missed'}`}>
              <span className="db-objective__mark">
                <Icon name={o.met ? 'check' : 'cross'} size="1.1rem" strokeWidth={2.800} label={t(o.met ? 'ui.debrief.objectives.met' : 'ui.debrief.objectives.missed')} />
              </span>
              <span className="grow">
                <span className="db-objective__head">
                  <span className="db-objective__kind">{t(`ui.objective.kind.${o.kind}`)}</span>
                  <span className="num db-objective__pts">
                    +{fmt(o.points, 0)}
                    <span className="unit">{t('ui.debrief.pts')}</span>
                  </span>
                </span>
                <span className="db-objective__text">{text}</span>
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

// ───────────── crew awards ─────────────

function Crew({ awards, meId }: { awards: DebriefAwardsPayload; meId: string | null }) {
  const t = useT();
  const players = useSel((s) => s.room?.players ?? null);
  const roles = useSel((s) => s.roles);
  const order = (id: string) => players?.find((p) => p.id === id)?.slot ?? 99;
  // Seat order, never a ranking (design 11.5: "No shaming or last place").
  const rows = [...awards.players].sort((a, b) => order(a.playerId) - order(b.playerId));
  if (rows.length === 0) return null;
  return (
    <section className="stack" aria-labelledby="db-crew">
      <h2 id="db-crew" className="section-title">
        <Icon name="users" size="1rem" />
        <span>{t('ui.debrief.crew.title')}</span>
      </h2>
      <ul className="panel db-crew">
        {rows.map((row) => {
          const p = players?.find((x) => x.id === row.playerId) ?? null;
          const held = rolesOf({ roles }, row.playerId);
          const isMe = row.playerId === meId;
          return (
            <li key={row.playerId} className="db-crew__row">
              <Avatar avatar={p?.avatar} />
              <div className="grow">
                <div className="db-crew__who">
                  <span className="db-crew__name">{p?.nickname ?? t('ui.debrief.crew.unknown')}</span>
                  {isMe && <span className="callsign callsign--plain">{t('ui.common.you')}</span>}
                  {held.slice(0, 2).map((r) => (
                    <CallSign key={r} role={r} plain />
                  ))}
                </div>
                <ul className="db-crew__awards">
                  {row.awardIds.map((id) => (
                    <li key={id} className="db-crew__award">
                      <Icon name={awardIcon(id)} size="0.95rem" />
                      <span>{awardName(t, id)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

// ───────────── what we learned ─────────────

function Learned({ facts }: { facts: DebriefFactsPayload }) {
  const t = useT();
  const shown = facts.factIds
    .map((id) => getFact(id))
    .filter((f): f is NonNullable<typeof f> => !!f && f.status !== 'rejected' && t.has(f.text_key));
  const anyUnverified = shown.some((f) => f.status !== 'verified');
  const codexTitles = facts.codexIds.map((id) => {
    const entry = getCodexEntry(id);
    if (t.has(entry.title_key)) return { id, title: t(entry.title_key) };
    const part = getPart(id);
    return { id, title: part ? t(part.name_key) : t(entry.title_key) };
  });
  const lesson = facts.lessonId;
  if (shown.length === 0 && codexTitles.length === 0 && !lesson) return null;
  const lessonTitleKey = lesson ? `lesson.${lesson}.title` : '';
  const lessonTextKey = lesson ? `lesson.${lesson}.text` : '';
  const lessonEntry = lesson ? getCodexEntry(lesson) : null;
  return (
    <section className="stack" aria-labelledby="db-learned">
      <h2 id="db-learned" className="section-title">
        <Icon name="bulb" size="1rem" />
        <span>{t('ui.debrief.learned.title')}</span>
      </h2>

      {lesson && lessonEntry && (
        <div className="db-lesson">
          <span className="db-lesson__icon" aria-hidden="true">
            <Icon name="shield" size="1.5rem" />
          </span>
          <div className="grow">
            <p className="eyebrow">{t('ui.debrief.lesson.eyebrow')}</p>
            <p className="db-lesson__title">
              {t.has(lessonTitleKey) ? t(lessonTitleKey) : t.has(lessonEntry.title_key) ? t(lessonEntry.title_key) : t('ui.debrief.lesson.generic_title')}
            </p>
            <p className="body-sm">
              {t.has(lessonTextKey) ? t(lessonTextKey) : t.has(lessonEntry.body_key) ? t(lessonEntry.body_key) : t('ui.debrief.lesson.generic_text')}
            </p>
          </div>
        </div>
      )}

      {shown.length > 0 && (
        <div className="panel">
          <p className="db-count">
            <span className="num db-count__n">{fmt(shown.length, 0)}</span>
            <span>{t(shown.length === 1 ? 'ui.debrief.learned.facts_one' : 'ui.debrief.learned.facts_many')}</span>
          </p>
          <ul className="db-facts">
            {shown.map((f) => (
              <li key={f.id} className="db-fact">
                <Icon name="bulb" size="1rem" className="db-fact__icon" />
                <span className="grow">
                  <span className="db-fact__text">{t(f.text_key)}</span>
                  <span className="db-fact__meta">
                    {f.source_key && t.has(f.source_key) && <span>{t('ui.debrief.learned.source', { source: t(f.source_key) })}</span>}
                    {f.status !== 'verified' && (
                      <span className="db-fact__pending">
                        <Icon name="clock" size="0.8rem" />
                        {t('ui.debrief.learned.pending')}
                      </span>
                    )}
                  </span>
                </span>
              </li>
            ))}
          </ul>
          {anyUnverified && <p className="db-footnote">{t('ui.debrief.learned.pending_note')}</p>}
        </div>
      )}

      {codexTitles.length > 0 && (
        <div className="panel db-codex">
          <p className="db-count">
            <span className="num db-count__n">{fmt(codexTitles.length, 0)}</span>
            <span>{t(codexTitles.length === 1 ? 'ui.debrief.learned.codex_one' : 'ui.debrief.learned.codex_many')}</span>
          </p>
          <ul className="db-codex__list">
            {codexTitles.slice(0, 8).map((c) => (
              <li key={c.id} className="db-codex__item">
                <Icon name="book" size="0.9rem" />
                <span>{c.title}</span>
              </li>
            ))}
            {codexTitles.length > 8 && <li className="db-codex__item db-codex__item--more">{t('ui.common.and_more', { n: codexTitles.length - 8 })}</li>}
          </ul>
          <p className="db-footnote">{t('ui.debrief.learned.codex_hint')}</p>
        </div>
      )}
    </section>
  );
}

// ───────────── your rocket vs. a real one ─────────────

function Comparison({ comparison }: { comparison: NonNullable<DebriefFactsPayload['comparison']> }) {
  const t = useT();
  const twin = t(comparison.twin.key, comparison.twin.args);
  const rows = [
    { id: 'mass', yours: comparison.yourMassT, theirs: comparison.twinMassT, unit: 't', decimals: 1 },
    { id: 'dv', yours: comparison.yourDvMs, theirs: comparison.twinDvMs, unit: 'm/s', decimals: 0 },
  ];
  return (
    <section className="stack" aria-labelledby="db-compare">
      <h2 id="db-compare" className="section-title">
        <Icon name="rocket" size="1rem" />
        <span>{t('ui.debrief.compare.title')}</span>
      </h2>
      <div className="panel stack">
        {rows.map((r) => {
          const max = Math.max(1e-9, r.yours, r.theirs);
          return (
            <div key={r.id} className="db-compare">
              <p className="db-compare__metric">{t(`ui.debrief.compare.${r.id}`)}</p>
              <div className="db-compare__row">
                <span className="db-compare__who">{t('ui.debrief.compare.yours')}</span>
                <span className="num db-compare__value">
                  {fmt(r.yours, r.decimals)}
                  <span className="unit">{r.unit}</span>
                </span>
                <span className="db-compare__bar">
                  <Bar fraction={r.yours / max} />
                </span>
              </div>
              <div className="db-compare__row db-compare__row--twin">
                <span className="db-compare__who">{twin}</span>
                <span className="num db-compare__value">
                  {fmt(r.theirs, r.decimals)}
                  <span className="unit">{r.unit}</span>
                </span>
                <span className="db-compare__bar">
                  <Bar fraction={r.theirs / max} tone="neutral" />
                </span>
              </div>
            </div>
          );
        })}
        <p className="db-footnote">{t('ui.debrief.compare.note')}</p>
      </div>
    </section>
  );
}

// ───────────── waiting state ─────────────

function Tallying() {
  const t = useT();
  return (
    <div className="screen__scroll screen__scroll--center" tabIndex={0} data-testid="debrief-waiting">
      <div className="waiting">
        <span className="db-tally" aria-hidden="true">
          <Icon name="trophy" size="2.2rem" />
        </span>
        <p className="eyebrow">{t('ui.debrief.waiting.eyebrow')}</p>
        <h1 className="title">{t('ui.debrief.waiting.title')}</h1>
        <p className="lede">{t('ui.debrief.waiting.text')}</p>
        <ul className="db-skeleton" aria-hidden="true">
          <li />
          <li />
          <li />
        </ul>
      </div>
    </div>
  );
}

// ───────────── screen ─────────────

export function DebriefScreen() {
  const t = useT();
  const score = useSel((s) => s.debrief.score);
  const awards = useSel((s) => s.debrief.awards);
  const facts = useSel((s) => s.debrief.facts);
  const meId = useSel((s) => s.me?.id ?? null);
  const mine = awards?.players.find((p) => p.playerId === meId) ?? null;

  if (!score) {
    return (
      <div className="screen" data-testid="screen-debrief">
        <Tallying />
      </div>
    );
  }

  return (
    <div className="screen" data-testid="screen-debrief">
      <div className="screen__scroll" tabIndex={0}>
        <Hero score={score} />
        {mine && mine.awardIds.length > 0 && <MyAwards mine={mine} />}
        <Breakdown score={score} />
        <Objectives score={score} />
        {awards && <Crew awards={awards} meId={meId} />}
        {facts && <Learned facts={facts} />}
        {facts?.comparison && <Comparison comparison={facts.comparison} />}
        <div className={`banner ${score.retryAvailable ? 'banner--accent' : ''} db-next`}>
          <Icon name={score.retryAvailable ? 'refresh' : 'eye'} size="1.2rem" />
          <span>{t(score.retryAvailable ? 'ui.debrief.next.retry' : 'ui.debrief.next.host')}</span>
        </div>
      </div>
    </div>
  );
}
