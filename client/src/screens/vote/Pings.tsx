// Quick pings and emoji reactions (design 3.4): no free text, only the eight pings and five
// reactions of the protocol. The sheet points a ping at the card on screen.
import { useEffect, useState } from 'react';
import type { OptionId, PingId, ReactionId } from '@protocol';
import { PING_IDS, REACTION_IDS } from '@protocol';
import { useT } from '../../i18n';
import { useSel, useStore } from '../../state/store';
import { Icon } from '../../ui/Icon';
import { Avatar, Sheet, useServerNow } from '../../ui/kit';

/** Data string ids are the lower-case protocol ids (data/pings.json). Two differ in wording. */
const PING_KEY: Record<PingId, string> = {
  TOO_EXPENSIVE: 'ping.too_expensive.text',
  TOO_HEAVY: 'ping.too_heavy.text',
  LIKE_THIS: 'ping.i_like_this_one.text',
  CHECK_DRAWBACK: 'ping.check_the_drawback.text',
  NEED_MORE_DV: 'ping.need_more_delta_v.text',
  TEST_IT_FIRST: 'ping.test_it_first.text',
  TRUST_ME: 'ping.trust_me.text',
  AGREED: 'ping.agreed.text',
};

export const REACTION_GLYPH: Record<ReactionId, string> = {
  ROCKET: '🚀',
  THUMBS_UP: '👍',
  GRIMACE: '😬',
  FIRE: '🔥',
  THINKING: '🤔',
};

export function pingKey(id: PingId): string {
  return PING_KEY[id];
}

export function reactionLabelKey(id: ReactionId): string {
  return `reaction.${id.toLowerCase()}.label`;
}

export function PingSheet({ optionId, optionLabel, onClose }: { optionId: OptionId | null; optionLabel: string | null; onClose: () => void }) {
  const t = useT();
  const store = useStore();
  const [sent, setSent] = useState<string | null>(null);
  useEffect(() => {
    if (!sent) return undefined;
    const id = setTimeout(onClose, 450);
    return () => clearTimeout(id);
  }, [sent, onClose]);
  return (
    <Sheet title={t('ui.ping.title')} onClose={onClose} testId="ping-sheet">
      {optionLabel && <p className="body-sm">{t('ui.ping.about', { name: optionLabel })}</p>}
      <div className="pinggrid">
        {PING_IDS.map((id) => (
          <button
            key={id}
            type="button"
            className={`btn pingbtn ${sent === id ? 'btn--selected' : ''}`}
            onClick={() => {
              store.ping(id, optionId);
              setSent(id);
            }}
            data-testid={`ping-${id}`}
          >
            <Icon name="ping" size="1rem" />
            <span>{t(PING_KEY[id])}</span>
          </button>
        ))}
      </div>
      <p className="eyebrow eyebrow--dim">{t('ui.ping.react')}</p>
      <div className="emojirow">
        {REACTION_IDS.map((id) => (
          <button
            key={id}
            type="button"
            className={`emojibtn ${sent === id ? 'emojibtn--sent' : ''}`}
            aria-label={t(reactionLabelKey(id))}
            onClick={() => {
              store.react(id);
              setSent(id);
            }}
            data-testid={`react-${id}`}
          >
            <span aria-hidden="true">{REACTION_GLYPH[id]}</span>
          </button>
        ))}
      </div>
    </Sheet>
  );
}

/** The latest ping or reaction of the crew, in its own lane above the card, fading out after a few seconds. */
export function PingFeed({ nameOf }: { nameOf: (optionId: OptionId) => string }) {
  const t = useT();
  const social = useSel((s) => s.social);
  const players = useSel((s) => s.room?.players ?? []);
  const meId = useSel((s) => s.me?.id ?? null);
  const now = useServerNow(2);
  // Items carry the server time at which they arrived; each stays up for six seconds.
  const recent = social.filter((s) => s.playerId !== meId && s.atMs > now - 6000).slice(-1);
  if (recent.length === 0) return null;
  return (
    <ul className="pingfeed" aria-live="polite" aria-label={t('ui.ping.feed')}>
      {recent.map((item) => {
        const p = players.find((x) => x.id === item.playerId);
        return (
          <li key={item.id} className="pingfeed__item">
            <Avatar avatar={p?.avatar} size="sm" />
            <span className="pingfeed__who">{p?.nickname ?? t('ui.vote.unknown_player')}</span>
            {item.ping ? (
              <span className="pingfeed__what">
                {t(PING_KEY[item.ping.pingId])}
                {item.ping.optionId && <span className="dim"> · {nameOf(item.ping.optionId)}</span>}
              </span>
            ) : item.emoji ? (
              <span className="pingfeed__emoji" role="img" aria-label={t(reactionLabelKey(item.emoji))}>
                {REACTION_GLYPH[item.emoji]}
              </span>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
