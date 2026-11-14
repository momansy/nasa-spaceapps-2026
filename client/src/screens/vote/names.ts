// Display names for vote options and vote titles. An option is a catalog part (PART), a
// contract (CONTRACT), a player (PILOT) or an upper-case token whose meaning is fixed by the
// vote kind (messages.md section 7.7). Nothing here is free text: every name is a string key.
import type { PlayerInfo, VoteOpenedPayload, VoteOption } from '@protocol';
import { getPart } from '../../data/catalog';
import type { Translator } from '../../i18n/core';
import { resolveText } from '../../i18n/textref';

type Round = Pick<VoteOpenedPayload, 'kind' | 'subjectId'>;

/** String key for a quick-vote token (TEST, SKIP, PASS, REWORK, ABORT, CONTINUE, MCM ids). */
export function tokenKey(id: string): string {
  return `ui.vote.option.${id}`;
}

/** Name of one option, in the device language. `players` resolves PILOT options. */
export function optionName(t: Translator, round: Round, option: VoteOption, players?: PlayerInfo[]): string {
  if (option.label) return resolveText(t, option.label);
  const part = getPart(option.partId ?? (round.kind === 'PART' ? option.id : null));
  if (part) return t(part.name_key);
  switch (round.kind) {
    case 'CONTRACT':
      return t(`contract.${option.id}.name`);
    case 'PILOT': {
      const p = players?.find((x) => x.id === option.id);
      return p ? p.nickname : t('ui.vote.unknown_player');
    }
    case 'ANOMALY': {
      const key = `anomaly.${round.subjectId}.response.${option.id}`;
      if (t.has(key)) return t(key);
      break;
    }
    case 'MCM': {
      const key = `sync_moment.${option.id.toLowerCase()}.name`;
      if (t.has(key)) return t(key);
      break;
    }
    default:
      break;
  }
  return t(tokenKey(option.id));
}

/** One-line description under a quick-vote option, or null. */
export function optionDetail(t: Translator, round: Round, option: VoteOption): string | null {
  if (round.kind === 'MCM') {
    const key = `sync_moment.${option.id.toLowerCase()}.description`;
    return t.has(key) ? t(key) : null;
  }
  const key = `ui.vote.option.${option.id}.detail`;
  return t.has(key) ? t(key) : null;
}

/** Name of an option id inside a round (looks the option up first). */
export function optionNameById(t: Translator, round: VoteOpenedPayload, optionId: string | null | undefined, players?: PlayerInfo[]): string {
  if (!optionId) return '';
  const o = round.options.find((x) => x.id === optionId);
  return o ? optionName(t, round, o, players) : optionId;
}
