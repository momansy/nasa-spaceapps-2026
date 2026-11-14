// Edit call sign and astronaut in the lobby (design 3.1 step 2, messages.md `player.profile`).
// Shows the server's answers: NICK_REJECTED, NICK_TAKEN (with its suggestion) and WRONG_PHASE.
// The saved device profile (the Join screen's key) follows the nickname the server accepted.
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Avatar as AvatarData, ErrorCode } from '@protocol';
import { NICKNAME_SUGGESTIONS, PATCHES, SUITS } from '../../data/cosmetics';
import { useT } from '../../i18n';
import { myPlayer } from '../../state/selectors';
import { useSel, useStore } from '../../state/store';
import { Icon } from '../../ui/Icon';
import { Avatar, Sheet } from '../../ui/kit';
import { isValidNickname, normaliseNickname } from '../JoinScreen';
import './profile.css';

type Problem = { code: ErrorCode | 'NO_ANSWER' | 'INVALID'; suggestion: string | null };

export function ProfileSheet({ onClose }: { onClose: () => void }) {
  const t = useT();
  const store = useStore();
  const me = useSel(myPlayer);
  const phase = useSel((s) => s.phase?.phase ?? 'LOBBY');
  const [nick, setNick] = useState(me?.nickname ?? '');
  const [avatar, setAvatar] = useState<AvatarData>(me?.avatar ?? { suitId: SUITS[0]!.id, patchId: PATCHES[0]!.id });
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<Problem | null>(null);
  const [saved, setSaved] = useState(false);
  const suggestions = useMemo(() => NICKNAME_SUGGESTIONS.filter((n) => n.toLowerCase() !== nick.toLowerCase()).slice(0, 4), [nick]);
  const lobby = phase === 'LOBBY';
  const clean = normaliseNickname(nick);
  const valid = isValidNickname(nick);
  const unchanged = !!me && clean === me.nickname && avatar.suitId === me.avatar.suitId && avatar.patchId === me.avatar.patchId;

  // The parent re-renders with every `room.state`: keep the "Saved" timer out of that.
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    if (!saved) return undefined;
    const id = setTimeout(() => close.current(), 700);
    return () => clearTimeout(id);
  }, [saved]);

  const save = async () => {
    if (busy) return;
    if (!valid) {
      setProblem({ code: 'INVALID', suggestion: null });
      return;
    }
    setBusy(true);
    setProblem(null);
    const result = await store.setProfile(clean, avatar);
    setBusy(false);
    if (result.ok) setSaved(true);
    else setProblem({ code: result.code, suggestion: result.suggestion });
  };

  const known: Array<Problem['code']> = ['NICK_REJECTED', 'NICK_TAKEN', 'WRONG_PHASE', 'NO_ANSWER', 'INVALID', 'RATE_LIMITED'];
  const errorText = !lobby
    ? t('ui.profile.err.WRONG_PHASE')
    : problem
      ? t(`ui.profile.err.${known.includes(problem.code) ? problem.code : 'OTHER'}`)
      : null;
  const nickBad = !!problem && (problem.code === 'NICK_REJECTED' || problem.code === 'NICK_TAKEN' || problem.code === 'INVALID');

  return (
    <Sheet
      title={t('ui.profile.title')}
      onClose={onClose}
      testId="profile-sheet"
      footer={
        <button type="button" className="btn btn--primary btn--lg btn--block" disabled={busy || saved || !lobby || unchanged} data-testid="profile-save" onClick={() => void save()}>
          {busy ? (
            <>
              <span className="spinner" aria-hidden="true" />
              {t('ui.profile.saving')}
            </>
          ) : saved ? (
            <>
              <Icon name="check" strokeWidth={3} />
              {t('ui.profile.saved')}
            </>
          ) : (
            t('ui.profile.save')
          )}
        </button>
      }
    >
      <div className="profile stack">
        <div className="field">
          <label className="field__label" htmlFor="profile-nick">
            {t('ui.join.nick_label')}
          </label>
          <input
            id="profile-nick"
            className={`input ${nickBad ? 'input--bad' : ''}`}
            value={nick}
            onChange={(e) => {
              setNick(e.target.value.slice(0, 16));
              setProblem(null);
            }}
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            maxLength={16}
            disabled={!lobby}
            placeholder={t('ui.join.nick_placeholder')}
            aria-describedby="profile-nick-hint"
            aria-invalid={nickBad}
            data-testid="profile-nick"
          />
          <p id="profile-nick-hint" className={`field__hint ${errorText ? 'field__hint--bad' : ''}`} role={errorText ? 'alert' : undefined} data-testid="profile-error" data-code={!lobby ? 'WRONG_PHASE' : (problem?.code ?? '')}>
            {errorText ?? t('ui.join.nick_hint')}{' '}
            {lobby && problem?.suggestion && (
              <button
                type="button"
                className="join__use"
                data-testid="profile-use-suggestion"
                onClick={() => {
                  setNick(problem.suggestion!);
                  setProblem(null);
                }}
              >
                {t('ui.join.nick_use', { name: problem.suggestion })}
              </button>
            )}
          </p>
          {lobby && (
            <div className="join__suggest" role="group" aria-label={t('ui.join.nick_suggestions')}>
              {suggestions.map((s) => (
                <button key={s} type="button" className={`join__pill ${nick === s ? 'is-on' : ''}`} onClick={() => setNick(s)}>
                  {s}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="field">
          <span className="field__label">{t('ui.join.avatar_label')}</span>
          <div className="join__avatar panel">
            <Avatar avatar={avatar} size="lg" label={t('ui.join.avatar_preview')} />
            <div className="join__pickers">
              <div className="join__swatches" role="radiogroup" aria-label={t('ui.join.suit_label')}>
                {SUITS.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    role="radio"
                    aria-checked={avatar.suitId === s.id}
                    aria-label={t(`ui.cosmetic.${s.id}`)}
                    className="join__swatch"
                    data-testid={`profile-${s.id}`}
                    disabled={!lobby}
                    style={{ background: s.color, borderColor: s.trim }}
                    onClick={() => setAvatar((a) => ({ ...a, suitId: s.id }))}
                  >
                    {avatar.suitId === s.id && <Icon name="check" size="1.1rem" strokeWidth={3.2} />}
                  </button>
                ))}
              </div>
              <div className="join__swatches" role="radiogroup" aria-label={t('ui.join.patch_label')}>
                {PATCHES.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    role="radio"
                    aria-checked={avatar.patchId === p.id}
                    aria-label={t(`ui.cosmetic.${p.id}`)}
                    className="join__patch"
                    data-testid={`profile-${p.id}`}
                    disabled={!lobby}
                    onClick={() => setAvatar((a) => ({ ...a, patchId: p.id }))}
                  >
                    <svg viewBox="0 0 24 24" width="1.4rem" height="1.4rem" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d={p.path} />
                    </svg>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </Sheet>
  );
}
