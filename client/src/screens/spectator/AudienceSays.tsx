// "Audience says": the spectators' advisory ballots next to the players' vote, from
// `vote.tally.audienceCounts` / `audienceTotal`. Hidden when tallies are hidden (the server then
// sends `audienceCounts: null`) and before anybody in the audience has voted.
import type { OptionCount } from '@protocol';
import { useT } from '../../i18n';
import { useSel } from '../../state/store';
import type { VoteRound } from '../../state/types';
import { Icon } from '../../ui/Icon';
import { optionNameById } from '../vote/names';
import './watch.css';

const SHAPES = ['circle', 'diamond', 'square', 'triangle', 'hex', 'cross'] as const;
const LETTERS = 'ABCDEF';

/**
 * What the bar shows, or null when it is hidden: outside the voting stages, when the tallies are
 * hidden (`audienceCounts` is null) or before anybody in the audience has voted.
 */
export function audienceSays(round: Pick<VoteRound, 'stage' | 'tally'>): { rows: OptionCount[]; total: number; lead: OptionCount } | null {
  const stage = round.stage?.stage;
  const tally = round.tally;
  if ((stage !== 'VOTE' && stage !== 'RUNOFF') || !tally || !tally.audienceCounts || tally.audienceCounts.length === 0 || tally.audienceTotal <= 0) return null;
  const rows = tally.audienceCounts;
  return { rows, total: Math.max(tally.audienceTotal, rows.reduce((a, c) => a + c.n, 0)), lead: rows.reduce((best, c) => (c.n > best.n ? c : best), rows[0]!) };
}

export function AudienceSays({ round }: { round: VoteRound }) {
  const t = useT();
  const players = useSel((s) => s.room?.players ?? []);
  const data = audienceSays(round);
  if (!data) return null;
  const { rows, total, lead } = data;
  const name = (id: string) => optionNameById(t, round.opened, id, players);
  const summary = rows.map((c) => `${name(c.optionId)} ${c.n}`).join(', ');
  return (
    <section className="says" data-testid="audience-says" aria-label={t('ui.watch.says_title')}>
      <header className="says__head">
        <Icon name="megaphone" size="1.1rem" />
        <b>{t('ui.watch.says_title')}</b>
        <span className="num says__total" data-testid="audience-says-total">
          {t(total === 1 ? 'ui.watch.says_total_one' : 'ui.watch.says_total', { n: total })}
        </span>
      </header>
      <div className="says__bar" role="img" aria-label={`${t('ui.watch.says_title')}: ${summary}`}>
        {rows.map((c, i) =>
          c.n > 0 ? (
            <span key={c.optionId} className={`says__seg says__seg--${i % 4}`} style={{ flexGrow: c.n }} data-testid={`audience-seg-${c.optionId}`}>
              {LETTERS[i]}
            </span>
          ) : null,
        )}
      </div>
      <ul className="says__legend">
        {rows.map((c, i) => (
          <li key={c.optionId} className={c.optionId === lead.optionId && c.n > 0 ? 'is-lead' : ''}>
            <span className={`says__key says__key--${i % 4}`} data-shape={SHAPES[i % SHAPES.length]} aria-hidden="true">
              {LETTERS[i]}
            </span>
            <span className="says__name">{name(c.optionId)}</span>
            <span className="num says__n">{c.n}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
