// Spectator view (design 13.7): the host's view on the phone. A phase strip, what is happening
// now (build headline, or the flight numbers with units, or the blackout state), the reaction pad
// (five emoji, one per second like the server limit) and the audience reaction display.
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactionId } from '@protocol';
import { REACTION_IDS } from '@protocol';
import { fmtMoney } from '../../data/format';
import { useT } from '../../i18n';
import { isPaused } from '../../state/selectors';
import { isReducedMotion, useSel, useStore } from '../../state/store';
import { Icon } from '../../ui/Icon';
import { useRemaining } from '../../ui/kit';
import { FlightStrip } from '../pilot/FlightStrip';
import { REACTION_GLYPH, reactionLabelKey } from '../vote/Pings';
import { AudienceDisplay } from './AudienceDisplay';
import './watch.css';

/** The phases a spectator follows, in order. Contract vote counts as part of the briefing. */
const STRIP = ['BRIEFING', 'BUILD', 'FRR', 'COUNTDOWN', 'FLIGHT', 'DEBRIEF'] as const;

function PhaseStrip() {
  const t = useT();
  const phase = useSel((s) => s.phase?.phase ?? 'BRIEFING');
  const at = phase === 'CONTRACT_VOTE' ? 0 : Math.max(0, STRIP.indexOf(phase as (typeof STRIP)[number]));
  return (
    <ol className="wstrip" aria-label={t('ui.watch.strip_aria')} data-testid="watch-strip">
      {STRIP.map((p, i) => {
        const state = i < at ? 'done' : i === at ? 'now' : 'next';
        return (
          <li key={p} className={`wstrip__step wstrip__step--${state}`} aria-current={state === 'now' ? 'step' : undefined} data-state={state} data-phase={p}>
            <Icon name={state === 'done' ? 'statusGood' : state === 'now' ? 'play' : 'dot'} size="0.95rem" />
            <span>{t(`ui.watch.phase.${p}`)}</span>
          </li>
        );
      })}
    </ol>
  );
}

function BuildNow() {
  const t = useT();
  const build = useSel((s) => s.build);
  const step = useSel((s) => s.phase?.step ?? null);
  const phase = useSel((s) => s.phase?.phase ?? 'BRIEFING');
  const contract = useSel((s) => s.phase?.contractId ?? null);
  let headline: string;
  if (phase === 'FRR') headline = t('ui.watch.frr');
  else if (build) {
    const parts = build.parts.length;
    headline = t('ui.watch.build_headline', {
      parts,
      spent: fmtMoney(build.budgetSpentM),
      total: fmtMoney(build.budgetTotalM),
      days: build.scheduleUsedDays,
      limit: build.scheduleLimitDays,
    });
  } else headline = phase === 'BRIEFING' || phase === 'CONTRACT_VOTE' ? t('ui.watch.briefing') : t('ui.watch.build_wait');
  return (
    <section className="panel watch__now" data-testid="watch-now" aria-live="polite">
      <p className="eyebrow">{t('ui.watch.now')}</p>
      {contract && t.has(`contract.${contract}.name`) && <h2 className="title title--sm">{t(`contract.${contract}.name`)}</h2>}
      {step && <p className="body-sm num">{t('ui.watch.step', { i: step.index, n: step.total })}</p>}
      <p className="watch__headline" data-testid="watch-headline">
        {headline}
      </p>
    </section>
  );
}

function BlackoutNow() {
  const t = useT();
  const blackout = useSel((s) => s.flight.blackout);
  const left = useRemaining(blackout?.expectedEndAtMs ?? null, 1);
  if (!blackout) return null;
  const cause = blackout.cause ?? 'OUT_OF_COVERAGE';
  return (
    <section className="panel watch__blackout" role="status" data-testid="watch-blackout">
      <Icon name="signalOff" size="1.5rem" />
      <div className="grow">
        <b>{t(`ui.blackout.${cause}`)}</b>
        <p className="body-sm">{t(`ui.blackout.${cause}.detail`)}</p>
        <p className="body-sm num">{left != null ? `${t('ui.blackout.back_in')} ${Math.ceil(left / 1000)} s` : t('ui.blackout.waiting')}</p>
      </div>
    </section>
  );
}

/** Five reaction buttons; after a tap all wait one second (the server's spectator limit). */
function ReactionPad() {
  const t = useT();
  const store = useStore();
  const last = useRef(0);
  const [cool, setCool] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  const send = useCallback(
    (id: ReactionId) => {
      const now = performance.now();
      if (now - last.current < 1000) return;
      last.current = now;
      store.react(id);
      setCool(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCool(false), 1000);
    },
    [store],
  );
  return (
    <section className="watch__pad" aria-label={t('ui.watch.react_title')} data-testid="watch-pad">
      <p className="eyebrow">{t('ui.watch.react_title')}</p>
      <div className="emojirow watch__emojis">
        {REACTION_IDS.map((id) => (
          <button
            key={id}
            type="button"
            className={`emojibtn watch__emoji ${cool ? 'is-cool' : ''}`}
            aria-label={t(reactionLabelKey(id))}
            aria-disabled={cool || undefined}
            data-testid={`watch-react-${id}`}
            onClick={() => send(id)}
          >
            <span aria-hidden="true">{REACTION_GLYPH[id]}</span>
          </button>
        ))}
      </div>
      <p className="body-sm watch__limit" role="status">
        {cool ? t('ui.watch.react_wait') : t('ui.watch.react_hint')}
      </p>
    </section>
  );
}

export function WatchScreen() {
  const t = useT();
  const phase = useSel((s) => s.phase?.phase ?? 'BRIEFING');
  const pending = useSel((s) => !!s.me?.pendingPlayer);
  const paused = useSel(isPaused);
  const reduced = useSel(isReducedMotion);
  const flying = phase === 'COUNTDOWN' || phase === 'FLIGHT';
  return (
    <div className="screen watch" data-testid="watch-screen" data-phase={phase} data-motion={reduced ? 'reduced' : 'full'}>
      <div className="screen__scroll watch__main" tabIndex={0}>
        <header className="watch__head">
          <h1 className="title pilot__title">{t('ui.watch.title')}</h1>
          {paused && (
            <span className="chip chip--warn" role="status">
              <Icon name="pause" size="1rem" />
              <span>{t('ui.pilot.paused')}</span>
            </span>
          )}
        </header>
        <PhaseStrip />
        {flying ? <FlightStrip /> : <BuildNow />}
        {flying && <BlackoutNow />}
        {pending && (
          <p className="pbanner pbanner--cue" role="status" data-testid="watch-pending">
            <Icon name="users" size="1.2rem" />
            <span>{t('ui.watch.pending_note')}</span>
          </p>
        )}
        <AudienceDisplay />
        <ReactionPad />
        <p className="body-sm watch__advisory">{t('ui.watch.advisory')}</p>
      </div>
    </div>
  );
}
