// The vote screen (design 14.2 screen 3, 4.1, messages.md section 7): reveal, predict, the
// Part Card carousel with vote / change / veto, role tags and insight, pings, live tallies, the
// runoff, trivia sudden-death, the pick, and the result with its animation. Quick votes (test,
// review, abort, MCM…) use the same stages with big option buttons instead of Part Cards.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { OptionId, RoleId, VoteOption } from '@protocol';
import { getPart } from '../../data/catalog';
import { useT } from '../../i18n';
import type { Translator } from '../../i18n/core';
import { resolveText } from '../../i18n/textref';
import { amVoter, canTag, canVeto, isCandidate, isPaused, isVetoed, isWinnable, myOwnerRole, myPlayer, myRoles, playerById, shownBallot } from '../../state/selectors';
import { isReducedMotion, useSel, useStore } from '../../state/store';
import type { AppState, VoteRound } from '../../state/types';
import { Icon, TONE_ICON, toneOfRating } from '../../ui/Icon';
import { Announce, Avatar, Countdown, CountdownBar, Dialog, Sheet } from '../../ui/kit';
import { PartViewer } from '../../viewer/PartViewer';
import { fmtMetricDelta, fmtMetricValue, METRIC_SPECS } from '../../data/format';
import { optionDetail, optionName, optionNameById } from './names';
import { PartCard } from './PartCard';
import { PingFeed, PingSheet } from './Pings';
import { AudienceSays } from '../spectator/AudienceSays';
import './vote.css';

const VOTING = new Set(['VOTE', 'RUNOFF']);

function useRound(): VoteRound | null {
  return useSel((s) => s.vote, Object.is);
}

function countOf(round: VoteRound, optionId: OptionId): number | null {
  const counts = round.tally?.counts;
  if (!counts) return null;
  return counts.find((c) => c.optionId === optionId)?.n ?? 0;
}

// ───────────── header ─────────────

function VoteHeader({ round }: { round: VoteRound }) {
  const t = useT();
  const paused = useSel(isPaused);
  const stage = round.stage!;
  return (
    <>
      <header className="votehead">
        <div className="grow votehead__text">
          <p className="eyebrow">
            {t(`ui.vote.kind.${round.opened.kind}`)} · {t(`ui.vote.stage.${stage.stage}`)}
          </p>
          <h1 className="title title--sm" data-testid="vote-title">
            {resolveText(t, round.opened.title)}
          </h1>
        </div>
        {stage.stage !== 'RESULT' && <Countdown startedAtMs={stage.startedAtMs} endsAtMs={stage.endsAtMs} label={t('ui.vote.timer')} paused={paused} />}
      </header>
      {stage.endsAtMs != null && stage.stage !== 'RESULT' && <CountdownBar startedAtMs={stage.startedAtMs} endsAtMs={stage.endsAtMs} />}
    </>
  );
}

// ───────────── reveal ─────────────

function Reveal({ round }: { round: VoteRound }) {
  const t = useT();
  const players = useSel((s) => s.room?.players ?? []);
  const isPart = round.opened.kind === 'PART';
  return (
    <div className="screen__scroll reveal" tabIndex={0} data-testid="stage-reveal">
      {round.opened.why && (
        <section className="panel panel--accent reveal__why">
          <Icon name={isPart ? 'cube' : 'flag'} size="1.6rem" className="tone-accent" />
          <p className="lede">{resolveText(t, round.opened.why)}</p>
        </section>
      )}
      <p className="eyebrow eyebrow--dim">{t('ui.vote.options_count', { n: round.opened.options.length })}</p>
      <ol className="reveal__list">
        {round.opened.options.map((o, i) => {
          const part = getPart(o.partId);
          return (
            <li key={o.id} className="reveal__item" style={{ animationDelay: `${120 + i * 110}ms` }}>
              <span className="reveal__n num">{String(i + 1).padStart(2, '0')}</span>
              <span className="grow">
                <span className="reveal__name">{optionName(t, round.opened, o, players)}</span>
                {part?.twin && t.has(part.twin) && <span className="reveal__twin">{t('ui.card.twin', { name: t(part.twin) })}</span>}
              </span>
            </li>
          );
        })}
      </ol>
      <p className="body-sm center">{t('ui.vote.reveal_hint')}</p>
    </div>
  );
}

// ───────────── predict ─────────────

/** Outcome of the Predict question. PREDICT ends the moment everyone has answered, so the
    outcome is also shown at the top of the next stage. */
function PredictBanner({ round }: { round: VoteRound }) {
  const t = useT();
  const meId = useSel((s) => s.me?.id ?? null);
  const q = round.opened.predict;
  const result = round.predict.result;
  if (!q || !result) return null;
  const myResult = result.results.find((r) => r.playerId === meId) ?? null;
  const correctText = resolveText(t, q.choices[result.correctIndex]);
  const crewRight = result.results.filter((r) => r.correct).length;
  return (
    <div className={`banner ${myResult?.correct ? 'banner--good' : 'banner--warn'} pop`} role="status" data-testid="predict-result">
      <Icon name={myResult?.correct ? TONE_ICON.good : 'info'} size="1.2rem" className={myResult?.correct ? 'tone-good' : 'tone-warn'} />
      <div>
        <strong>
          {myResult?.correct
            ? t('ui.vote.predict.correct')
            : myResult?.choiceIndex == null
              ? t('ui.vote.predict.missed', { answer: correctText })
              : t('ui.vote.predict.wrong', { answer: correctText })}
        </strong>
        <div className="body-sm">{t('ui.vote.predict.crew_right', { n: crewRight, total: result.results.length })}</div>
      </div>
    </div>
  );
}

function Predict({ round }: { round: VoteRound }) {
  const t = useT();
  const store = useStore();
  const q = round.opened.predict;
  if (!q) return null;
  const mine = round.predict.myChoice;
  const result = round.predict.result;
  return (
    <div className="screen__scroll" tabIndex={0} data-testid="stage-predict">
      <section className="panel predict">
        <p className="eyebrow">
          <Icon name="target" size="0.9rem" style={{ display: 'inline', verticalAlign: '-0.12em', marginInlineEnd: 6 }} />
          {t('ui.vote.predict.title')}
        </p>
        <h2 className="title title--sm">{resolveText(t, q.prompt)}</h2>
        <p className="body-sm">{t('ui.vote.predict.hint')}</p>
      </section>
      <div className="choices" role="radiogroup" aria-label={resolveText(t, q.prompt)}>
        {q.choices.map((c, i) => {
          const chosen = mine === i;
          const correct = result ? result.correctIndex === i : false;
          const wrongPick = result && chosen && !correct;
          return (
            <button
              key={i}
              type="button"
              role="radio"
              aria-checked={chosen}
              className={`choice ${chosen ? 'choice--chosen' : ''} ${correct ? 'choice--correct' : ''} ${wrongPick ? 'choice--wrong' : ''}`}
              disabled={mine != null || !!result}
              onClick={() => store.predict(i)}
              data-testid={`predict-${i}`}
            >
              <span className="choice__letter num">{String.fromCharCode(65 + i)}</span>
              <span className="grow">{resolveText(t, c)}</span>
              {correct && <Icon name={TONE_ICON.good} size="1.3rem" label={t('ui.rating.GOOD')} />}
              {wrongPick && <Icon name={TONE_ICON.bad} size="1.3rem" label={t('ui.rating.BAD')} />}
              {chosen && !result && <Icon name="lock" size="1.1rem" />}
            </button>
          );
        })}
      </div>
      {!result && mine != null && (
        <p className="banner banner--accent" role="status">
          <Icon name="lock" size="1.1rem" className="tone-accent" />
          <span>{t('ui.vote.predict.locked')}</span>
        </p>
      )}
      {result && <PredictBanner round={round} />}
    </div>
  );
}

// ───────────── carousel of Part Cards ─────────────

function Carousel({ round, index, onIndex, onExpand }: { round: VoteRound; index: number; onIndex: (i: number) => void; onExpand: (partId: string) => void }) {
  const t = useT();
  const store = useStore();
  const ref = useRef<HTMLDivElement>(null);
  const players = useSel((s) => s.room?.players ?? []);
  const mineRoles = useSel(myRoles);
  const ownerRole = useSel((s) => myOwnerRole(s, round));
  const tagAllowed = useSel((s) => canTag(s, round));
  const meId = useSel((s) => s.me?.id ?? null);
  const emergencyAvailable = useSel((s) => !s.roles?.abilitiesUsed.includes('PM'));
  const ballot = shownBallot(round);
  const voting = VOTING.has(round.stage?.stage ?? '');
  const options = round.opened.options;
  const roleOf = useCallback((playerId: string) => {
    const g = store.getState().roles?.groups.find((x) => x.playerId === playerId);
    return g?.lead ?? null;
  }, [store]);

  // The index follows the swipe once the scroll settles; a tap on a dot scrolls to the card.
  // While that programmatic scroll runs, scroll events must not move the index back.
  const settle = useRef<ReturnType<typeof setTimeout> | null>(null);
  const programmatic = useRef(false);
  const fromSwipe = useRef(false);
  const nearest = (): number => {
    const el = ref.current;
    if (!el) return index;
    const box = el.getBoundingClientRect();
    const mid = box.left + box.width / 2;
    let best = index;
    let bestD = Infinity;
    Array.from(el.children).forEach((c, i) => {
      const r = (c as HTMLElement).getBoundingClientRect();
      const d = Math.abs(r.left + r.width / 2 - mid);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    return best;
  };
  const onScroll = () => {
    if (settle.current) clearTimeout(settle.current);
    settle.current = setTimeout(() => {
      settle.current = null;
      if (programmatic.current) {
        programmatic.current = false;
        return;
      }
      const i = nearest();
      if (i !== index) {
        fromSwipe.current = true;
        onIndex(i);
      }
    }, 120);
  };

  useEffect(() => {
    if (fromSwipe.current) {
      fromSwipe.current = false;
      return;
    }
    const el = ref.current;
    const card = el?.children[index] as HTMLElement | undefined;
    if (!el || !card) return;
    if (nearest() === index) return;
    programmatic.current = true;
    card.scrollIntoView({ inline: 'center', block: 'nearest', behavior: isReducedMotion(store.getState()) ? 'auto' : 'smooth' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, store]);

  useEffect(() => () => {
    if (settle.current) clearTimeout(settle.current);
  }, []);

  const leading = round.tally?.leadingOptionId ?? null;
  return (
    <>
      <div className="carousel" ref={ref} onScroll={onScroll} data-testid="carousel">
        {options.map((o, i) => {
          const veto = round.vetoes.find((v) => v.optionId === o.id);
          const vetoer = veto ? playerById(store.getState(), veto.playerId) : null;
          const insight = round.insight
            .filter((l) => l.optionId === o.id)
            .map((l) => ({ role: (mineRoles.find((r) => round.opened.ownerRoles.includes(r)) ?? mineRoles[0]) as RoleId, text: resolveText(t, l.text) }));
          const myTag = round.tags.find((tg) => tg.optionId === o.id && tg.playerId === meId)?.tag ?? null;
          return (
            <div className="carousel__slot" key={o.id} aria-roledescription="slide" aria-label={t('ui.vote.card_of', { i: i + 1, n: options.length })}>
              <PartCard
                option={o}
                categoryId={round.opened.subjectId}
                count={voting && isCandidate(round, o.id) ? countOf(round, o.id) : null}
                leading={voting && leading === o.id}
                mine={ballot === o.id}
                vetoed={veto ? t('ui.vote.vetoed_by', { name: vetoer ? `${vetoer.nickname}${roleOf(veto.playerId) ? ` · ${roleOf(veto.playerId)}` : ''}` : t('ui.vote.unknown_player') }) : null}
                tags={round.tags.filter((tg) => tg.optionId === o.id)}
                insight={insight}
                tagAs={tagAllowed && ownerRole ? { role: ownerRole, current: myTag, onTag: (tag) => store.tag(o.id, tag) } : null}
                active={i === index}
                onExpandViewer={() => o.partId && onExpand(o.partId)}
                emergencyAvailable={emergencyAvailable}
              />
            </div>
          );
        })}
      </div>
      <div className="dots" role="tablist" aria-label={t('ui.vote.options_count', { n: options.length })}>
        {options.map((o, i) => {
          const c = voting ? countOf(round, o.id) : null;
          return (
            <button
              key={o.id}
              type="button"
              role="tab"
              aria-selected={i === index}
              aria-label={`${t('ui.vote.go_to', { i: i + 1 })}: ${optionName(t, round.opened, o, players)}`}
              className={`dot ${i === index ? 'dot--on' : ''} ${ballot === o.id ? 'dot--mine' : ''} ${isVetoed(round, o.id) ? 'dot--vetoed' : ''}`}
              onClick={() => onIndex(i)}
            >
              {c != null && c > 0 ? <span className="dot__n num">{c}</span> : null}
            </button>
          );
        })}
      </div>
    </>
  );
}

function BallotLine({ round }: { round: VoteRound }) {
  const t = useT();
  const players = useSel((s) => s.room?.players ?? []);
  const voters = round.opened.voters.length;
  const voted = round.tally?.votedIds.length ?? 0;
  const ballot = shownBallot(round);
  const note = round.ballotNote;
  let text: string;
  let tone: 'warn' | 'accent' | 'neutral' = 'neutral';
  if (!ballot && note === 'OPTION_REMOVED') {
    text = round.vetoes.length ? t('ui.vote.removed_by_veto') : t('ui.vote.removed_option');
    tone = 'warn';
  } else if (!ballot && note === 'RUNOFF_RESET') {
    text = t('ui.vote.runoff_reset');
    tone = 'warn';
  } else if (ballot) {
    text = t('ui.vote.ballot_is', { name: optionNameById(t, round.opened, ballot, players) });
    tone = 'accent';
  } else {
    text = t('ui.vote.ballot_none');
  }
  return (
    <div className={`ballotline ballotline--${tone}`} role="status" data-testid="ballot-line">
      <Icon name={ballot ? 'check' : tone === 'warn' ? TONE_ICON.warn : 'dot'} size="1rem" />
      <span className="grow">{text}</span>
      {round.tally && <span className="num dim">{t('ui.vote.voted_count', { n: voted, total: voters })}</span>}
    </div>
  );
}

function PartStage({ round }: { round: VoteRound }) {
  const t = useT();
  const store = useStore();
  const [index, setIndex] = useState(0);
  const [viewer, setViewer] = useState<string | null>(null);
  const [confirmVeto, setConfirmVeto] = useState<VoteOption | null>(null);
  const [pings, setPings] = useState(false);
  const players = useSel((s) => s.room?.players ?? []);
  const voter = useSel((s) => amVoter(s, round));
  const spectator = useSel((s) => s.me?.kind === 'SPECTATOR');
  const vetoAvailable = useSel((s) => !!myPlayer(s)?.vetoAvailable);
  const stage = round.stage!.stage;
  const voting = VOTING.has(stage);
  const option = round.opened.options[index] ?? round.opened.options[0]!;
  const ballot = shownBallot(round);
  const winnable = useSel((s) => isWinnable(s, round, option));
  const vetoOk = useSel((s) => canVeto(s, round, option));
  const candidate = isCandidate(round, option.id);
  const name = optionName(t, round.opened, option, players);

  // Start on the player's own ballot, else on the first candidate (runoff: the two finalists).
  const startIdx = useMemo(() => {
    const opts = round.opened.options;
    const b = opts.findIndex((o) => o.id === ballot);
    if (b >= 0) return b;
    const c = opts.findIndex((o) => round.stage?.candidateIds.includes(o.id) && !isVetoed(round, o.id));
    return Math.max(0, c);
    // Only when the stage changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage]);
  useEffect(() => setIndex(startIdx), [startIdx]);

  const canCast = (voter || spectator) && voting && candidate && winnable;
  let voteLabel = t('ui.vote.cast');
  if (!voting) voteLabel = t('ui.vote.not_open');
  else if (ballot === option.id) voteLabel = t('ui.vote.yours');
  else if (isVetoed(round, option.id) || !winnable || !candidate) voteLabel = t('ui.vote.cannot_win');
  else if (ballot) voteLabel = t('ui.vote.change');
  const pending = round.pendingBallot === option.id && round.myBallot !== option.id;

  return (
    <>
      <div className="votebody">
        <div className="votebody__hint">
          {!voter && !spectator ? (
            <p className="banner banner--warn">
              <Icon name="info" size="1.1rem" className="tone-warn" />
              <span>{t('ui.vote.not_voter')}</span>
            </p>
          ) : voting ? (
            <BallotLine round={round} />
          ) : (
            <p className="body-sm">{t(stage === 'INSPECT' ? 'ui.vote.inspect_hint' : 'ui.vote.vote_hint')}</p>
          )}
          {stage === 'INSPECT' && <PredictBanner round={round} />}
          {stage === 'RUNOFF' && <p className="body-sm">{t('ui.vote.runoff_hint')}</p>}
          {spectator && <p className="body-sm">{t('ui.vote.spectator_hint')}</p>}
        </div>
        <div className="carouselwrap">
          <PingFeed nameOf={(id) => optionNameById(t, round.opened, id, players)} />
          <Carousel round={round} index={index} onIndex={setIndex} onExpand={setViewer} />
        </div>
      </div>
      <div className="actionbar votebar">
        {!spectator && (
          <button type="button" className="iconbtn iconbtn--framed" onClick={() => setPings(true)} aria-label={t('ui.ping.open')} data-testid="open-pings">
            <Icon name="ping" />
          </button>
        )}
        {round.opened.vetoAllowed && voter && (
          <button
            type="button"
            className="btn btn--outline-bad"
            disabled={!vetoOk}
            onClick={() => setConfirmVeto(option)}
            data-testid="veto"
            aria-label={vetoAvailable ? `${t('ui.vote.veto')}: ${name}` : t('ui.vote.veto_used')}
          >
            <Icon name="ban" size="1.1rem" />
            {vetoAvailable ? t('ui.vote.veto') : t('ui.vote.veto_used')}
          </button>
        )}
        <button
          type="button"
          className={`btn btn--grow ${ballot === option.id ? 'btn--good' : 'btn--primary'}`}
          disabled={!canCast || ballot === option.id}
          aria-pressed={ballot === option.id}
          onClick={() => store.castVote(option.id)}
          data-testid="cast"
        >
          <Icon name={ballot === option.id ? 'check' : 'thumbsUp'} size="1.15rem" />
          <span>{pending ? t('ui.vote.sending') : voteLabel}</span>
        </button>
      </div>
      {confirmVeto && (
        <Dialog tone="bad" onClose={() => setConfirmVeto(null)} labelledBy="veto-title">
          <span className="dialog__icon tone-bad">
            <Icon name="ban" size="2rem" strokeWidth={2.2} />
          </span>
          <h2 id="veto-title" className="title title--sm">
            {t('ui.vote.veto_title', { name: optionName(t, round.opened, confirmVeto, players) })}
          </h2>
          <p className="lede">{t('ui.vote.veto_body')}</p>
          <div className="row">
            <button type="button" className="btn btn--ghost btn--grow" onClick={() => setConfirmVeto(null)} data-testid="veto-cancel">
              {t('ui.common.cancel')}
            </button>
            <button
              type="button"
              className="btn btn--bad btn--grow"
              onClick={() => {
                store.veto(confirmVeto.id);
                setConfirmVeto(null);
              }}
              data-testid="veto-confirm"
            >
              <Icon name="ban" size="1.1rem" />
              {t('ui.vote.veto_confirm')}
            </button>
          </div>
        </Dialog>
      )}
      {viewer && (
        <Sheet title={t(getPart(viewer)?.name_key ?? viewer)} onClose={() => setViewer(null)} full testId="viewer-sheet">
          <div className="viewer-sheet">
            <PartViewer partId={viewer} size="full" />
          </div>
        </Sheet>
      )}
      {pings && <PingSheet optionId={option.id} optionLabel={name} onClose={() => setPings(false)} />}
    </>
  );
}

// ───────────── quick votes ─────────────

function QuickStage({ round }: { round: VoteRound }) {
  const t = useT();
  const store = useStore();
  const players = useSel((s) => s.room?.players ?? []);
  const voter = useSel((s) => amVoter(s, round) || s.me?.kind === 'SPECTATOR');
  const winnableIds = useSel((s) => round.opened.options.filter((o) => isWinnable(s, round, o)).map((o) => o.id));
  const ballot = shownBallot(round);
  const voting = VOTING.has(round.stage?.stage ?? '');
  const total = round.tally?.counts?.reduce((a, c) => a + c.n, 0) ?? 0;
  return (
    <div className="screen__scroll" tabIndex={0} data-testid="stage-quick">
      {round.opened.why && <p className="lede">{resolveText(t, round.opened.why)}</p>}
      {voting && <BallotLine round={round} />}
      <div className="quick">
        {round.opened.options.map((o) => {
          const n = countOf(round, o.id);
          const mine = ballot === o.id;
          const detail = optionDetail(t, round.opened, o);
          const ok = voter && voting && isCandidate(round, o.id) && winnableIds.includes(o.id);
          return (
            <button key={o.id} type="button" className={`quickopt ${mine ? 'quickopt--mine' : ''}`} disabled={!ok} aria-pressed={mine} onClick={() => store.castVote(o.id)} data-testid={`quick-${o.id}`}>
              <span className="row row--between">
                <span className="quickopt__name">{optionName(t, round.opened, o, players)}</span>
                {mine && <Icon name="check" size="1.3rem" strokeWidth={3} className="tone-accent" />}
              </span>
              {detail && <span className="quickopt__detail">{detail}</span>}
              {o.deltas.length > 0 && <DeltaChips deltas={o.deltas} />}
              {n != null && (
                <span className="quickopt__tally">
                  <span className="quickopt__bar">
                    <span style={{ transform: `scaleX(${total ? n / total : 0})` }} />
                  </span>
                  <span className="num">{n === 1 ? t('ui.vote.tally_one') : t('ui.vote.tally', { n })}</span>
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function DeltaChips({ deltas }: { deltas: VoteOption['deltas'] }) {
  const t = useT();
  return (
    <span className="deltachips">
      {deltas.map((d) => {
        const tone = toneOfRating(d.rating);
        const spec = METRIC_SPECS[d.metric];
        return (
          <span key={d.metric} className={`chip chip--${tone === 'neutral' ? 'accent' : tone}`}>
            <Icon name={TONE_ICON[tone]} size="0.9em" strokeWidth={2.6} />
            <span>
              {t(spec.labelKey)} <span className="num">{spec.show === 'value' ? fmtMetricValue(d.metric, d.value) : fmtMetricDelta(d.metric, d.delta)}</span>
            </span>
          </span>
        );
      })}
    </span>
  );
}

// ───────────── tie-break ─────────────

function Trivia({ round }: { round: VoteRound }) {
  const t = useT();
  const store = useStore();
  const players = useSel((s) => s.room?.players ?? []);
  const meId = useSel((s) => s.me?.id ?? null);
  const voter = useSel((s) => amVoter(s, round));
  const open = round.trivia.open;
  const result = round.trivia.result;
  if (!open) return null;
  const mine = round.trivia.myChoice;
  const tied = open.tiedOptionIds.map((id) => optionNameById(t, round.opened, id, players));
  const winner = result?.winnerId ? playerById(store.getState(), result.winnerId) : null;
  return (
    <div className="screen__scroll" tabIndex={0} data-testid="stage-trivia">
      <section className="panel panel--warn-edge trivia">
        <p className="eyebrow tone-warn">
          <Icon name="bolt" size="0.9rem" style={{ display: 'inline', verticalAlign: '-0.12em', marginInlineEnd: 6 }} />
          {t('ui.vote.trivia.title')}
        </p>
        <p className="body-sm">{t('ui.vote.trivia.tied', { names: tied.join(' · ') })}</p>
        <h2 className="title title--sm">{resolveText(t, open.question.prompt)}</h2>
        <p className="body-sm">{t('ui.vote.trivia.hint')}</p>
      </section>
      <div className="choices">
        {open.question.choices.map((c, i) => {
          const chosen = mine === i;
          const correct = result ? result.correctIndex === i : false;
          return (
            <button
              key={i}
              type="button"
              className={`choice ${chosen ? 'choice--chosen' : ''} ${correct ? 'choice--correct' : ''} ${result && chosen && !correct ? 'choice--wrong' : ''}`}
              disabled={!voter || mine != null || !!result}
              onClick={() => store.answerTrivia(i)}
              data-testid={`trivia-${i}`}
            >
              <span className="choice__letter num">{String.fromCharCode(65 + i)}</span>
              <span className="grow">{resolveText(t, c)}</span>
              {correct && <Icon name={TONE_ICON.good} size="1.3rem" />}
            </button>
          );
        })}
      </div>
      {mine != null && !result && (
        <p className="banner banner--accent" role="status">
          <Icon name="clock" size="1.1rem" className="tone-accent" />
          <span>{t('ui.vote.trivia.locked')}</span>
        </p>
      )}
      {result && (
        <p className={`banner ${result.winnerId === meId ? 'banner--good' : 'banner--accent'} pop`} role="status" data-testid="trivia-result">
          <Icon name={result.winnerId ? 'trophy' : 'coin'} size="1.2rem" />
          <span>{result.winnerId === meId ? t('ui.vote.trivia.winner_you') : winner ? t('ui.vote.trivia.winner', { name: winner.nickname }) : t('ui.vote.trivia.nobody')}</span>
        </p>
      )}
    </div>
  );
}

function Pick({ round }: { round: VoteRound }) {
  const t = useT();
  const store = useStore();
  const players = useSel((s) => s.room?.players ?? []);
  const meId = useSel((s) => s.me?.id ?? null);
  const picker = round.stage?.pickerId ?? null;
  const pickerInfo = useSel((s) => playerById(s, picker));
  const tied = round.trivia.open?.tiedOptionIds ?? round.stage?.candidateIds ?? [];
  if (picker !== meId) {
    return (
      <div className="screen__scroll screen__scroll--center" tabIndex={0} data-testid="stage-pick-wait">
        <div className="waitcard">
          <Avatar avatar={pickerInfo?.avatar} size="lg" />
          <p className="title title--sm center">{t('ui.vote.trivia.waiting_pick', { name: pickerInfo?.nickname ?? t('ui.vote.unknown_player') })}</p>
          <span className="spinner" aria-hidden="true" />
        </div>
      </div>
    );
  }
  return (
    <div className="screen__scroll" tabIndex={0} data-testid="stage-pick">
      <section className="panel panel--accent">
        <p className="eyebrow">{t('ui.vote.trivia.winner_you')}</p>
        <h2 className="title title--sm">{t('ui.vote.trivia.pick_title')}</h2>
      </section>
      <div className="quick">
        {tied.map((id) => {
          const o = round.opened.options.find((x) => x.id === id);
          if (!o) return null;
          const picked = round.trivia.myPick === id;
          const part = getPart(o.partId);
          return (
            <button key={id} type="button" className={`quickopt ${picked ? 'quickopt--mine' : ''}`} disabled={!!round.trivia.myPick} onClick={() => store.pickTiebreak(id)} data-testid={`pick-${id}`}>
              <span className="row row--between">
                <span className="quickopt__name">{optionName(t, round.opened, o, players)}</span>
                {picked && <Icon name="check" size="1.3rem" strokeWidth={3} />}
              </span>
              {part?.twin && t.has(part.twin) && <span className="quickopt__detail">{t('ui.card.twin', { name: t(part.twin) })}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ───────────── result ─────────────

function Result({ round }: { round: VoteRound }) {
  const t = useT();
  const players = useSel((s) => s.room?.players ?? []);
  const meId = useSel((s) => s.me?.id ?? null);
  const result = round.result;
  if (!result) {
    return (
      <div className="screen__scroll screen__scroll--center" tabIndex={0}>
        <span className="spinner" aria-hidden="true" />
      </div>
    );
  }
  const winner = round.opened.options.find((o) => o.id === result.winnerId);
  const part = getPart(winner?.partId);
  const myBallot = result.ballots.find((b) => b.playerId === meId)?.optionId ?? null;
  const total = result.counts.reduce((a, c) => a + c.n, 0);
  const abstained = result.ballots.filter((b) => b.optionId == null).length;
  const commit = round.commit;
  return (
    <div className="screen__scroll result" tabIndex={0} data-testid="stage-result">
      <Announce
        testId="result-announce"
        text={`${t('ui.vote.result.winner')} ${winner ? optionName(t, round.opened, winner, players) : ''}. ${t(`ui.vote.method.${result.method}`)}.`}
      />
      <section className="resulthero">
        <span className="resulthero__ring" aria-hidden="true" />
        <p className="eyebrow tone-good">
          <Icon name={TONE_ICON.good} size="0.95rem" style={{ display: 'inline', verticalAlign: '-0.14em', marginInlineEnd: 6 }} />
          {t('ui.vote.result.winner')}
        </p>
        {part && (
          <div className="resulthero__media">
            <PartViewer partId={part.id} size="card" />
          </div>
        )}
        <h2 className="title resulthero__name" data-testid="result-winner">
          {winner ? optionName(t, round.opened, winner, players) : result.winnerId}
        </h2>
        <p className="chip chip--accent resulthero__method">
          <Icon name={result.method === 'COIN_FLIP' ? 'coin' : result.method === 'TRIVIA' ? 'bolt' : 'users'} size="0.95em" />
          <span>{t(`ui.vote.method.${result.method}`)}</span>
        </p>
        {myBallot && (
          <p className="body-sm">
            {t('ui.vote.result.your_pick')}: <strong>{optionNameById(t, round.opened, myBallot, players)}</strong>
          </p>
        )}
      </section>

      {result.counts.length > 0 && (
        <section className="panel stack stack--sm">
          <h3 className="section-title">{t('ui.vote.result.counts')}</h3>
          <ul className="counts">
            {result.counts.map((c) => (
              <li key={c.optionId} className={`counts__row ${c.optionId === result.winnerId ? 'counts__row--win' : ''}`}>
                <span className="counts__name">{optionNameById(t, round.opened, c.optionId, players)}</span>
                <span className="counts__bar" aria-hidden="true">
                  <span style={{ transform: `scaleX(${total ? c.n / total : 0})` }} />
                </span>
                <span className="counts__n num">{c.n}</span>
              </li>
            ))}
          </ul>
          {abstained > 0 && <p className="body-sm">{t('ui.vote.result.abstained', { n: abstained })}</p>}
        </section>
      )}

      {result.emergencyFunding && (
        <p className="banner banner--warn">
          <Icon name={TONE_ICON.warn} size="1.1rem" className="tone-warn" />
          <span>{t('ui.vote.result.emergency')}</span>
        </p>
      )}

      {commit && commit.deltas.length > 0 && (
        <section className="panel stack stack--sm pop" data-testid="commit">
          <h3 className="section-title">
            <Icon name="gauge" size="1rem" />
            {t('ui.vote.result.applied')}
          </h3>
          <DeltaChips deltas={commit.deltas} />
          {commit.codexIds.length > 0 && (
            <p className="body-sm">
              <Icon name="book" size="1rem" style={{ display: 'inline', verticalAlign: '-0.18em', marginInlineEnd: 6 }} />
              {t('ui.vote.result.codex')}
            </p>
          )}
        </section>
      )}
    </div>
  );
}

// ───────────── screen ─────────────

function decisionTimeAvailable(s: AppState, round: VoteRound): boolean {
  if (!myRoles(s).includes('FLIGHT') || s.roles?.abilitiesUsed.includes('FLIGHT')) return false;
  const st = round.stage?.stage;
  return st === 'VOTE' || st === 'RUNOFF';
}

function DecisionTime({ round }: { round: VoteRound }) {
  const t = useT();
  const store = useStore();
  const [ask, setAsk] = useState(false);
  const show = useSel((s) => decisionTimeAvailable(s, round));
  if (!show) return null;
  return (
    <>
      <button type="button" className="btn btn--sm btn--warn decision" onClick={() => setAsk(true)} data-testid="decision-time">
        <Icon name="flag" size="1rem" />
        {t('ui.vote.decision_time')}
      </button>
      {ask && (
        <Dialog onClose={() => setAsk(false)} labelledBy="dt-title">
          <h2 id="dt-title" className="title title--sm">
            {t('ui.vote.decision_time')}
          </h2>
          <p className="lede">{t('ui.vote.decision_time_hint')}</p>
          <div className="row">
            <button type="button" className="btn btn--ghost btn--grow" onClick={() => setAsk(false)}>
              {t('ui.common.cancel')}
            </button>
            <button
              type="button"
              className="btn btn--warn btn--grow"
              onClick={() => {
                store.spendAbility('FLIGHT', shownBallot(round) ? { optionId: shownBallot(round)! } : {});
                setAsk(false);
              }}
            >
              {t('ui.vote.decision_time_confirm')}
            </button>
          </div>
        </Dialog>
      )}
    </>
  );
}

function VetoFlash({ round }: { round: VoteRound }) {
  const t = useT();
  const store = useStore();
  const last = round.vetoes[round.vetoes.length - 1] ?? null;
  const [shown, setShown] = useState<string | null>(null);
  const seen = useRef(round.vetoes.length);
  useEffect(() => {
    if (round.vetoes.length <= seen.current || !last) return undefined;
    seen.current = round.vetoes.length;
    const g = store.getState().roles?.groups.find((x) => x.playerId === last.playerId);
    setShown(t('ui.vote.veto_banner', { role: g?.lead ?? '' }));
    const id = setTimeout(() => setShown(null), 1800);
    return () => clearTimeout(id);
  }, [round.vetoes.length, last, store, t]);
  if (!shown) return null;
  return (
    <div className="vetoflash" role="alert" data-testid="veto-flash">
      <Icon name="ban" size="2.2rem" strokeWidth={2.4} />
      <span>{shown}</span>
    </div>
  );
}

function HintBanner({ round, t }: { round: VoteRound; t: Translator }) {
  const players = useSel((s) => s.room?.players ?? []);
  const hint = round.opened.hint;
  if (!hint) return null;
  return (
    <p className="banner banner--accent votehint">
      <Icon name="radio" size="1.1rem" className="tone-accent" />
      <span>
        <strong>{t('ui.vote.hint_title')}:</strong> {optionNameById(t, round.opened, hint.optionId, players)} · {resolveText(t, hint.reason)}
      </span>
    </p>
  );
}

export function VoteScreen() {
  const t = useT();
  const round = useRound();
  if (!round || !round.stage) return null;
  const stage = round.stage.stage;
  const isPart = round.opened.kind === 'PART' || round.opened.options.some((o) => !!o.partId);
  let body: JSX.Element | null;
  switch (stage) {
    case 'REVEAL':
      body = <Reveal round={round} />;
      break;
    case 'PREDICT':
      body = <Predict round={round} />;
      break;
    case 'INSPECT':
    case 'VOTE':
    case 'RUNOFF':
      body = isPart ? <PartStage round={round} /> : <QuickStage round={round} />;
      break;
    case 'TIEBREAK_TRIVIA':
      body = <Trivia round={round} />;
      break;
    case 'TIEBREAK_PICK':
      body = <Pick round={round} />;
      break;
    case 'RESULT':
      body = <Result round={round} />;
      break;
    default:
      body = null;
  }
  return (
    <div className={`screen vote vote--${stage.toLowerCase()}`} data-testid="screen-vote" data-stage={stage}>
      <VoteHeader round={round} />
      <HintBanner round={round} t={t} />
      <DecisionTime round={round} />
      <AudienceSays round={round} />
      <div className="vote__stage" key={stage}>
        {body}
      </div>
      <VetoFlash round={round} />
    </div>
  );
}
