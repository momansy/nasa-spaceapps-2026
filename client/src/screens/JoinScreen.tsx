// Join (design 14.2 screen 1): room code (typed or from the QR's ?room= query), nickname from a
// filtered list or free text, and an avatar (suit colour + patch). No account, no personal data.
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import type { Avatar as AvatarData } from '@protocol';
import { NICKNAME_SUGGESTIONS, PATCHES, SUITS } from '../data/cosmetics';
import { useT } from '../i18n';
import { loadProfile, useSel, useStore } from '../state/store';
import { Icon } from '../ui/Icon';
import { Avatar } from '../ui/kit';
import './join.css';

/** Room code alphabet: A–Z without I and O (messages.md 4.1). */
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const CODE_LENGTH = 4;

export function cleanRoomCode(raw: string): string {
  return [...raw.toUpperCase()].filter((c) => CODE_ALPHABET.includes(c)).slice(0, CODE_LENGTH).join('');
}

/** Protocol nickname shape: 2–16 characters; letters, digits, space, underscore, hyphen; starts and ends with a letter or digit. */
const NICK_RE = /^[\p{L}\p{N}](?:[\p{L}\p{N} _-]{0,14}[\p{L}\p{N}])$/u;

export function normaliseNickname(raw: string): string {
  return raw.normalize('NFC').replace(/\s+/g, ' ').trim();
}

export function isValidNickname(raw: string): boolean {
  return NICK_RE.test(normaliseNickname(raw));
}

function pickSuggestions(seed: number, n: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < n; i++) out.push(NICKNAME_SUGGESTIONS[(seed * 7 + i * 5) % NICKNAME_SUGGESTIONS.length]!);
  return out;
}

export function JoinScreen() {
  const t = useT();
  const store = useStore();
  const query = useMemo(() => new URLSearchParams(location.search), []);
  const fromLink = cleanRoomCode(query.get('room') ?? '');
  const watch = query.get('watch') === '1';
  const saved = useMemo(loadProfile, []);

  const [code, setCode] = useState(fromLink);
  const [editCode, setEditCode] = useState(fromLink.length !== CODE_LENGTH);
  const [nick, setNick] = useState(saved?.nickname ?? '');
  const [avatar, setAvatar] = useState<AvatarData>(saved?.avatar ?? { suitId: SUITS[0]!.id, patchId: PATCHES[0]!.id });
  const [shuffle, setShuffle] = useState(() => Math.floor(Math.random() * 97));
  const [touched, setTouched] = useState(false);

  const phase = useSel((s) => s.conn.phase);
  const joinError = useSel((s) => s.joinError);
  const closeReason = useSel((s) => s.conn.closeReason);
  const busy = phase === 'connecting' || phase === 'joining' || phase === 'reconnecting';
  const codeRef = useRef<HTMLInputElement>(null);

  const codeOk = code.length === CODE_LENGTH;
  const nickOk = watch || isValidNickname(nick);
  const suggestions = useMemo(() => pickSuggestions(shuffle, 4), [shuffle]);

  useEffect(() => {
    if (joinError?.code === 'ROOM_NOT_FOUND') {
      setEditCode(true);
      codeRef.current?.focus();
    }
  }, [joinError]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (!codeOk || !nickOk || busy) return;
    store.join(code, normaliseNickname(nick), avatar, watch);
  };

  const errorKey = joinError ? `ui.error.${joinError.code}` : null;
  const errorText = errorKey ? (t.has(errorKey) ? t(errorKey) : t('ui.error.generic')) : null;
  const roomError = joinError?.code === 'ROOM_NOT_FOUND';
  const byeKey = !joinError && closeReason ? `ui.bye.${closeReason}` : null;

  return (
    <form className="screen join" onSubmit={submit} noValidate data-testid="screen-join">
      <div className="screen__scroll">
        <div className="join__hero">
          <div className="join__orbit" aria-hidden="true">
            <span className="join__planet" />
            <span className="join__sat" />
          </div>
          <p className="eyebrow">{t('ui.join.eyebrow')}</p>
          <h1 className="title title--lg">{t(watch ? 'ui.join.title_watch' : 'ui.join.title')}</h1>
          <p className="lede">{t(watch ? 'ui.join.lede_watch' : 'ui.join.lede')}</p>
        </div>

        {byeKey && t.has(byeKey) && (
          <div className="banner banner--warn" role="status">
            <Icon name="info" size="1.2rem" className="tone-warn" />
            <span>{t(byeKey)}</span>
          </div>
        )}

        <div className="field">
          <label className="field__label" htmlFor="join-code">
            {t('ui.join.code_label')}
          </label>
          {!editCode && codeOk ? (
            <div className="join__codelocked">
              <span className="join__codechars" aria-label={code.split('').join(' ')}>
                {code.split('').map((c, i) => (
                  <span key={i} aria-hidden="true">
                    {c}
                  </span>
                ))}
              </span>
              <span className="chip chip--good">
                <Icon name="check" size="0.95em" strokeWidth={2.6} />
                <span>{t('ui.join.code_from_link')}</span>
              </span>
              <span className="spacer" />
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => setEditCode(true)}>
                {t('ui.join.code_change')}
              </button>
            </div>
          ) : (
            <div className="join__codewrap">
              <input
                id="join-code"
                ref={codeRef}
                className={`input join__code ${roomError || (touched && !codeOk) ? 'input--bad' : ''}`}
                value={code}
                onChange={(e) => setCode(cleanRoomCode(e.target.value))}
                inputMode="text"
                autoCapitalize="characters"
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                maxLength={8}
                placeholder="••••"
                aria-describedby="join-code-hint"
                aria-invalid={roomError || (touched && !codeOk)}
                data-testid="join-code"
              />
              <div className="join__codeslots" aria-hidden="true">
                {Array.from({ length: CODE_LENGTH }, (_, i) => (
                  <span key={i} className={i === code.length ? 'is-next' : i < code.length ? 'is-set' : ''} />
                ))}
              </div>
            </div>
          )}
          <p id="join-code-hint" className={`field__hint ${roomError ? 'field__hint--bad' : ''}`}>
            {roomError ? errorText : t('ui.join.code_hint')}
          </p>
        </div>

        {!watch && (
          <>
            <div className="field">
              <label className="field__label" htmlFor="join-nick">
                {t('ui.join.nick_label')}
              </label>
              <input
                id="join-nick"
                className={`input ${(touched && !nickOk) || (joinError && !roomError) ? 'input--bad' : ''}`}
                value={nick}
                onChange={(e) => setNick(e.target.value.slice(0, 16))}
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                maxLength={16}
                placeholder={t('ui.join.nick_placeholder')}
                aria-describedby="join-nick-hint"
                aria-invalid={touched && !nickOk}
                data-testid="join-nick"
              />
              <div className="join__suggest" role="group" aria-label={t('ui.join.nick_suggestions')}>
                {suggestions.map((s) => (
                  <button key={s} type="button" className={`join__pill ${nick === s ? 'is-on' : ''}`} onClick={() => setNick(s)}>
                    {s}
                  </button>
                ))}
                <button type="button" className="join__pill join__pill--icon" onClick={() => setShuffle((n) => n + 1)} aria-label={t('ui.join.nick_more')}>
                  <Icon name="refresh" size="1.1rem" />
                </button>
              </div>
              <p id="join-nick-hint" className={`field__hint ${(touched && !nickOk) || (joinError && !roomError) ? 'field__hint--bad' : ''}`}>
                {joinError && !roomError ? (
                  <>
                    {errorText}{' '}
                    {joinError.suggestion && (
                      <button type="button" className="join__use" onClick={() => setNick(joinError.suggestion!)}>
                        {t('ui.join.nick_use', { name: joinError.suggestion })}
                      </button>
                    )}
                  </>
                ) : touched && !nickOk ? (
                  t('ui.join.nick_invalid')
                ) : (
                  t('ui.join.nick_hint')
                )}
              </p>
            </div>

            <div className="field">
              <span className="field__label" id="join-avatar-label">
                {t('ui.join.avatar_label')}
              </span>
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
          </>
        )}

        <p className="join__privacy">
          <Icon name="lock" size="1rem" />
          <span>{t('ui.join.privacy')}</span>
        </p>
      </div>

      <div className="actionbar">
        <button type="submit" className="btn btn--primary btn--lg btn--block" disabled={busy} aria-disabled={!codeOk || !nickOk} data-testid="join-submit">
          {busy ? (
            <>
              <span className="spinner" aria-hidden="true" />
              {t('ui.join.joining')}
            </>
          ) : (
            <>
              <Icon name="rocket" />
              {t(watch ? 'ui.join.submit_watch' : 'ui.join.submit')}
            </>
          )}
        </button>
      </div>
    </form>
  );
}
