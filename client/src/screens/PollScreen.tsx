// GO / NO-GO polling ritual (design 4.3, messages.md section 8): FLIGHT calls one console at a
// time. The called player answers GO or NO-GO for all their consoles; everyone else sees who
// is being called and the answers so far.
import type { PollAnswer, RoleId } from '@protocol';
import { useT } from '../i18n';
import { isPaused, playerById } from '../state/selectors';
import { useSel, useStore } from '../state/store';
import { Icon, TONE_ICON, type Tone } from '../ui/Icon';
import { Avatar, CallSign, Countdown, CountdownBar } from '../ui/kit';
import './poll.css';

const ANSWER_TONE: Record<PollAnswer, Tone> = { GO: 'good', NO_GO: 'bad', NO_ANSWER: 'neutral' };

function roleList(roles: RoleId[]): string {
  return roles.join(' · ');
}

export function PollScreen() {
  const t = useT();
  const store = useStore();
  const poll = useSel((s) => s.poll, Object.is);
  const meId = useSel((s) => s.me?.id ?? null);
  const paused = useSel(isPaused);
  const caller = useSel((s) => playerById(s, s.poll?.call.playerId));
  const players = useSel((s) => s.room?.players ?? []);
  if (!poll) return null;
  const { call, result } = poll;
  const myTurn = !result && call.playerId === meId;
  const myAnswer = poll.myAnswer;

  return (
    <div className="screen poll" data-testid="screen-poll">
      <header className="votehead">
        <div className="grow votehead__text">
          <p className="eyebrow">{t('ui.poll.eyebrow', { round: call.round })}</p>
          <h1 className="title title--sm">{t(`ui.poll.title.${call.context}`)}</h1>
        </div>
        {!result && <Countdown startedAtMs={poll.callAtMs} endsAtMs={call.endsAtMs} label={t('ui.vote.timer')} paused={paused} />}
      </header>
      {!result && <CountdownBar startedAtMs={poll.callAtMs} endsAtMs={call.endsAtMs} />}

      <div className="screen__scroll">
        {result ? (
          <section className={`pollresult ${result.allGo ? 'pollresult--go' : 'pollresult--nogo'} pop`} data-testid="poll-result">
            <Icon name={result.allGo ? TONE_ICON.good : TONE_ICON.bad} size="2.6rem" strokeWidth={2.2} />
            <h2 className="title">{result.allGo ? t('ui.poll.all_go') : t('ui.poll.no_go_result', { n: result.noGoCount })}</h2>
            <p className="lede">{result.allGo ? t('ui.poll.all_go_detail') : t('ui.poll.no_go_detail')}</p>
          </section>
        ) : myTurn ? (
          <section className="pollcall pollcall--me" data-testid="poll-my-call">
            <p className="eyebrow">{t('ui.poll.call_n', { index: call.index, total: call.total })}</p>
            <div className="pollcall__roles">
              {call.roles.map((r) => (
                <CallSign key={r} role={r} />
              ))}
            </div>
            <h2 className="title">{t('ui.poll.your_call', { roles: roleList(call.roles) })}</h2>
            <p className="body-sm">{t('ui.poll.your_call_hint')}</p>
            {myAnswer && <p className={`chip chip--${ANSWER_TONE[myAnswer]}`}>{t('ui.poll.you_said', { answer: t(`ui.poll.answer.${myAnswer}`) })}</p>}
          </section>
        ) : (
          <section className="pollcall" data-testid="poll-waiting">
            <p className="eyebrow eyebrow--dim">{t('ui.poll.call_n', { index: call.index, total: call.total })}</p>
            <div className="pollcall__who">
              <Avatar avatar={caller?.avatar} size="lg" />
              <div className="stack stack--sm">
                <p className="body-sm">{t('ui.poll.calling')}</p>
                <p className="title title--sm">{t('ui.poll.waiting', { name: caller?.nickname ?? t('ui.vote.unknown_player'), roles: roleList(call.roles) })}</p>
              </div>
            </div>
          </section>
        )}

        <ol className="pollboard" aria-label={t('ui.poll.calling')}>
          {poll.answered.map((e) => {
            const p = players.find((x) => x.id === e.playerId);
            const tone = ANSWER_TONE[e.answer];
            return (
              <li key={e.playerId} className={`pollrow pollrow--${tone}`}>
                <Avatar avatar={p?.avatar} size="sm" />
                <span className="grow pollrow__who">
                  <span className="pollrow__name">{p?.nickname ?? t('ui.vote.unknown_player')}</span>
                  <span className="pollrow__roles">{roleList(e.roles)}</span>
                </span>
                <span className={`chip chip--${tone === 'neutral' ? 'accent' : tone}`}>
                  <Icon name={tone === 'neutral' ? 'dot' : TONE_ICON[tone]} size="0.95em" strokeWidth={2.6} />
                  <span>{t(`ui.poll.answer.${e.answer}`)}</span>
                </span>
              </li>
            );
          })}
          {!result && (
            <li className="pollrow pollrow--now" aria-current="step">
              <Avatar avatar={caller?.avatar} size="sm" />
              <span className="grow pollrow__who">
                <span className="pollrow__name">{caller?.nickname ?? ''}</span>
                <span className="pollrow__roles">{roleList(call.roles)}</span>
              </span>
              <span className="chip">
                <span className="pulse-dot" aria-hidden="true" />
                <span>{t('ui.poll.pending')}</span>
              </span>
            </li>
          )}
        </ol>
      </div>

      {myTurn && (
        <div className="actionbar pollbar">
          <button type="button" className={`btn btn--lg btn--grow btn--bad ${myAnswer === 'NO_GO' ? 'btn--selected' : ''}`} disabled={!!myAnswer} onClick={() => store.answerPoll('NO_GO')} data-testid="poll-nogo">
            <Icon name={TONE_ICON.bad} size="1.3rem" />
            {t('ui.poll.no_go')}
          </button>
          <button type="button" className={`btn btn--lg btn--grow btn--good ${myAnswer === 'GO' ? 'btn--selected' : ''}`} disabled={!!myAnswer} onClick={() => store.answerPoll('GO')} data-testid="poll-go">
            <Icon name={TONE_ICON.good} size="1.3rem" />
            {t('ui.poll.go')}
          </button>
        </div>
      )}
    </div>
  );
}
