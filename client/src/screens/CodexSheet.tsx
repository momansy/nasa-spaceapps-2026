// Personal Mission Codex (design 14.2 screen 9, 12.2): the entries this phone has collected.
// The collection is kept on the device (`codex.unlock`: "Each phone adds them to its personal
// collection"); nothing here is sent anywhere.
import { useMemo, useState } from 'react';
import { getCodexEntry, getFact, getPart, type CodexEntryDef, type Part } from '../data/catalog';
import { fmt } from '../data/format';
import { useT, type Translator } from '../i18n';
import { useSel } from '../state/store';
import { Icon, type IconName } from '../ui/Icon';
import { Sheet } from '../ui/kit';
import './codex.css';

const KIND_ICON: Record<string, IconName> = {
  part: 'cube',
  physics: 'scale',
  simplification: 'info',
  history: 'clock',
  mission: 'rocket',
  lesson_learned: 'shield',
  milestone: 'flag',
  glossary: 'book',
  fact: 'bulb',
};

const KIND_ORDER = ['part', 'physics', 'simplification', 'history', 'mission', 'lesson_learned', 'milestone', 'glossary', 'fact'];

interface Entry {
  id: string;
  def: CodexEntryDef;
  /** The catalog part when the entry is about one. */
  part: Part | undefined;
  title: string;
  kind: string;
  fresh: boolean;
  badge: boolean;
}

function titleOf(t: Translator, def: CodexEntryDef, part: Part | undefined): string {
  if (t.has(def.title_key)) return t(def.title_key);
  if (part) return t(part.name_key);
  return t(def.title_key);
}

/** Kind used for grouping and icons. An id that is neither in the codex data nor a catalog part is 'other'. */
function kindOf(def: CodexEntryDef, part: Part | undefined, known: boolean): string {
  return def.kind === 'part' && !part && !known ? 'other' : def.kind;
}

function kindLabel(t: Translator, kind: string): string {
  const key = `ui.codex.kind.${kind}`;
  return t.has(key) ? t(key) : t('ui.codex.kind.other');
}

function FactList({ ids }: { ids: string[] }) {
  const t = useT();
  const facts = ids
    .map((id) => getFact(id))
    .filter((f): f is NonNullable<typeof f> => !!f && f.status !== 'rejected' && t.has(f.text_key));
  if (facts.length === 0) return null;
  return (
    <section className="stack stack--sm">
      <h4 className="section-title">
        <Icon name="bulb" size="1rem" />
        <span>{t('ui.codex.facts')}</span>
      </h4>
      <ul className="stack stack--sm">
        {facts.map((f) => (
          <li key={f.id} className="cx-fact">
            <p>{f.detail_key && t.has(f.detail_key) ? t(f.detail_key) : t(f.text_key)}</p>
            <p className="cx-fact__meta">
              {f.source_key && t.has(f.source_key) && <span>{t('ui.codex.source', { source: t(f.source_key) })}</span>}
              {f.status !== 'verified' && (
                <span className="cx-fact__pending">
                  <Icon name="clock" size="0.8rem" />
                  {t('ui.codex.pending')}
                </span>
              )}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Detail({ entry, onBack }: { entry: Entry; onBack: () => void }) {
  const t = useT();
  const { def, part } = entry;
  const hasBody = t.has(def.body_key);
  const factIds = [...new Set([...(def.facts ?? []), ...(part?.facts ?? [])])];
  return (
    <article className="stack cx-detail" data-testid="codex-detail">
      <button type="button" className="btn btn--ghost btn--sm cx-back" onClick={onBack}>
        <Icon name="chevronLeft" size="1.1rem" className="cx-flip" />
        {t('ui.codex.back')}
      </button>
      <header className="cx-detail__head">
        <span className="cx-detail__icon" aria-hidden="true">
          <Icon name={KIND_ICON[entry.kind] ?? 'book'} size="1.8rem" />
        </span>
        <div className="grow">
          <p className="eyebrow">{kindLabel(t, entry.kind)}</p>
          <h3 className="title">{entry.title}</h3>
          {entry.badge && (
            <p className="cx-badge">
              <Icon name="medal" size="1rem" />
              {t('ui.codex.badge')}
            </p>
          )}
        </div>
      </header>

      {hasBody && <p className="cx-body">{t(def.body_key)}</p>}

      {part && (
        <div className="panel stack stack--sm">
          {part.twin && t.has(part.twin) && (
            <p className="kv">
              <span className="kv__k">{t('ui.codex.twin')}</span>
              <span className="kv__v">{t(part.twin)}</span>
            </p>
          )}
          {(part.strengths ?? []).length > 0 && (
            <div>
              <p className="cx-list-title tone-good">
                <Icon name="check" size="0.95rem" strokeWidth={2.800} />
                {t('ui.codex.strengths')}
              </p>
              <ul className="cx-bullets">
                {(part.strengths ?? []).map((k) => (
                  <li key={k}>{t(k)}</li>
                ))}
              </ul>
            </div>
          )}
          {(part.drawbacks ?? []).length > 0 && (
            <div>
              <p className="cx-list-title tone-bad">
                <Icon name="warn" size="0.95rem" strokeWidth={2.400} />
                {t('ui.codex.drawbacks')}
              </p>
              <ul className="cx-bullets">
                {(part.drawbacks ?? []).map((k) => (
                  <li key={k}>{t(k)}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {def.simplification_key && t.has(def.simplification_key) && (
        <div className="banner banner--accent">
          <Icon name="info" size="1.2rem" />
          <div>
            <p className="cx-simplified">{t('ui.codex.simplification')}</p>
            <p>{t(def.simplification_key)}</p>
          </div>
        </div>
      )}

      <FactList ids={factIds} />

      {!hasBody && !part && factIds.length === 0 && <p className="lede">{t('ui.codex.no_text')}</p>}
    </article>
  );
}

export function CodexSheet({ onClose }: { onClose: () => void }) {
  const t = useT();
  const unlocked = useSel((s) => s.codex.unlocked);
  const fresh = useSel((s) => s.codex.fresh);
  const badges = useSel((s) => s.codex.badges);
  const kp = useSel((s) => s.kp);
  const [openId, setOpenId] = useState<string | null>(null);

  const entries = useMemo<Entry[]>(() => {
    // Newest first: the list is stored in unlock order.
    return [...unlocked].reverse().map((id) => {
      const def = getCodexEntry(id);
      const part = getPart(id);
      const kind = kindOf(def, part, t.has(def.title_key));
      return { id, def, part, title: titleOf(t, def, part), kind, fresh: fresh.includes(id), badge: badges.includes(id) };
    });
  }, [unlocked, fresh, badges, t]);

  const groups = useMemo(() => {
    const byKind = new Map<string, Entry[]>();
    for (const e of entries) {
      const list = byKind.get(e.kind) ?? [];
      list.push(e);
      byKind.set(e.kind, list);
    }
    const rank = (k: string) => (KIND_ORDER.includes(k) ? KIND_ORDER.indexOf(k) : KIND_ORDER.length);
    return [...byKind].sort((a, b) => rank(a[0]) - rank(b[0]));
  }, [entries]);

  const open = openId ? entries.find((e) => e.id === openId) ?? null : null;

  return (
    <Sheet title={t('ui.codex.title')} onClose={onClose} full testId="codex-sheet">
      {open ? (
        <Detail entry={open} onBack={() => setOpenId(null)} />
      ) : (
        <>
          <div className="cx-summary">
            <div className="cx-tile">
              <span className="cx-tile__k">{t('ui.codex.entries')}</span>
              <span className="num cx-tile__v">{fmt(entries.length, 0)}</span>
            </div>
            <div className="cx-tile">
              <span className="cx-tile__k">{t('ui.codex.kp_mine')}</span>
              <span className="num cx-tile__v">
                {fmt(kp.mine, 0)}
                <span className="unit">{t('ui.codex.kp_unit')}</span>
              </span>
            </div>
            <div className="cx-tile">
              <span className="cx-tile__k">{t('ui.codex.kp_team')}</span>
              <span className="num cx-tile__v">
                {fmt(kp.team, 0)}
                <span className="unit">{t('ui.codex.kp_unit')}</span>
              </span>
            </div>
          </div>

          {entries.length === 0 ? (
            <div className="cx-empty" data-testid="codex-empty">
              <span className="cx-empty__art" aria-hidden="true">
                <Icon name="book" size="2.6rem" />
              </span>
              <h3 className="title title--sm">{t('ui.codex.empty.title')}</h3>
              <p className="lede">{t('ui.codex.empty.text')}</p>
              <ul className="cx-empty__how">
                <li>
                  <Icon name="cube" size="1.1rem" />
                  <span>{t('ui.codex.empty.how_parts')}</span>
                </li>
                <li>
                  <Icon name="target" size="1.1rem" />
                  <span>{t('ui.codex.empty.how_minigames')}</span>
                </li>
                <li>
                  <Icon name="rocket" size="1.1rem" />
                  <span>{t('ui.codex.empty.how_flight')}</span>
                </li>
              </ul>
            </div>
          ) : (
            groups.map(([kind, list]) => (
              <section key={kind} className="stack stack--sm">
                {groups.length > 1 && (
                  <h3 className="section-title">
                    <Icon name={KIND_ICON[kind] ?? 'book'} size="1rem" />
                    <span>{kindLabel(t, kind)}</span>
                  </h3>
                )}
                <ul className="stack stack--sm">
                  {list.map((e) => (
                    <li key={e.id}>
                      <button type="button" className={`cx-item ${e.fresh ? 'cx-item--new' : ''}`} onClick={() => setOpenId(e.id)} data-testid="codex-item">
                        <span className="cx-item__icon" aria-hidden="true">
                          <Icon name={KIND_ICON[e.kind] ?? 'book'} size="1.3rem" />
                        </span>
                        <span className="grow cx-item__text">
                          <span className="cx-item__title">
                            {e.title}
                            {e.fresh && <span className="cx-new">{t('ui.codex.new')}</span>}
                            {e.badge && <Icon name="medal" size="1.1em" className="cx-item__badge" label={t('ui.codex.badge')} />}
                          </span>
                          <span className="cx-item__sub">
                            {e.part?.twin && t.has(e.part.twin) ? t('ui.codex.twin_line', { twin: t(e.part.twin) }) : kindLabel(t, e.kind)}
                          </span>
                        </span>
                        <Icon name="chevronRight" size="1.1rem" className="cx-item__go cx-flip" />
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            ))
          )}
          <p className="cx-note">
            <Icon name="lock" size="0.9rem" />
            <span>{t('ui.codex.device_note')}</span>
          </p>
        </>
      )}
    </Sheet>
  );
}
