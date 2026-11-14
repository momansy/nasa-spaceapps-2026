// Lobby: you are in, who else is here, and how roles will be assigned (random, pick or vote).
import type { PlayerInfo, RoleGroup } from '@protocol';
import { useT } from '../i18n';
import { myPlayer } from '../state/selectors';
import { useSel, useStore } from '../state/store';
import { Icon } from '../ui/Icon';
import { Avatar, CallSign } from '../ui/kit';
import './lobby.css';

export function CrewRow({ player, me, trailing }: { player: PlayerInfo; me: boolean; trailing?: React.ReactNode }) {
  const t = useT();
  return (
    <li className={`crew__row ${me ? 'crew__row--me' : ''}`}>
      <Avatar avatar={player.avatar} off={!player.connected} />
      <span className="crew__name">
        <span className="crew__nick">{player.nickname}</span>
        {me && <span className="crew__you">{t('ui.common.you')}</span>}
        {!player.connected && (
          <span className="crew__away">
            <Icon name="signalOff" size="0.9rem" />
            {t('ui.lobby.away')}
          </span>
        )}
      </span>
      {trailing}
    </li>
  );
}

function RolePicker() {
  const t = useT();
  const store = useStore();
  const roles = useSel((s) => s.roles);
  const meId = useSel((s) => s.me?.id);
  const players = useSel((s) => s.room?.players ?? []);
  if (!roles || roles.locked) return null;

  if (roles.mode === 'PICK') {
    const pick = (g: RoleGroup) => store.conn.send('roles.pick', { lead: g.playerId === meId ? null : g.lead });
    return (
      <section className="stack">
        <h2 className="section-title">{t('ui.lobby.pick_title')}</h2>
        <ul className="lobby__groups">
          {roles.groups.map((g) => {
            const holder = players.find((p) => p.id === g.playerId);
            const mine = g.playerId === meId;
            const taken = !!g.playerId && !mine;
            return (
              <li key={g.lead}>
                <button type="button" className={`lobby__group ${mine ? 'is-mine' : ''}`} disabled={taken} onClick={() => pick(g)} aria-pressed={mine}>
                  <span className="lobby__grouproles">
                    {g.roles.map((r) => (
                      <CallSign key={r} role={r} plain={!mine} />
                    ))}
                  </span>
                  <span className="lobby__groupwho">
                    {mine ? (
                      <>
                        <Icon name="check" size="1rem" /> {t('ui.lobby.pick_yours')}
                      </>
                    ) : holder ? (
                      holder.nickname
                    ) : (
                      t('ui.lobby.pick_free')
                    )}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </section>
    );
  }

  if (roles.mode === 'VOTE') {
    return (
      <section className="stack">
        <h2 className="section-title">{t('ui.lobby.vote_title')}</h2>
        <p className="body-sm">{t('ui.lobby.vote_hint')}</p>
        <ul className="crew">
          {players.map((p) => {
            const n = roles.flightVotes.find((v) => v.playerId === p.id)?.n ?? 0;
            return (
              <CrewRow
                key={p.id}
                player={p}
                me={p.id === meId}
                trailing={
                  <button type="button" className="btn btn--sm" onClick={() => store.conn.send('roles.vote', { playerId: p.id })} aria-label={t('ui.lobby.vote_for', { name: p.nickname })}>
                    <Icon name="flag" size="1rem" />
                    <span className="num">{n}</span>
                  </button>
                }
              />
            );
          })}
        </ul>
      </section>
    );
  }

  return (
    <div className="banner banner--accent">
      <Icon name="sparkle" size="1.2rem" className="tone-accent" />
      <span>{t('ui.lobby.random_hint')}</span>
    </div>
  );
}

export function LobbyScreen() {
  const t = useT();
  const me = useSel(myPlayer);
  const kind = useSel((s) => s.me?.kind);
  const players = useSel((s) => s.room?.players ?? []);
  const spectators = useSel((s) => s.room?.spectatorCount ?? 0);
  const locked = useSel((s) => !!s.roles?.locked);

  return (
    <div className="screen" data-testid="screen-lobby">
      <div className="screen__scroll">
        <section className="lobby__me panel panel--accent">
          {me ? <Avatar avatar={me.avatar} size="lg" /> : <span className="lobby__eye"><Icon name="eye" size="2.4rem" /></span>}
          <div className="grow stack stack--sm">
            <p className="eyebrow">{t('ui.lobby.eyebrow')}</p>
            <h1 className="title">{me ? me.nickname : t('ui.shell.spectator')}</h1>
            <p className="lobby__wait">
              <span className="pulse-dot" aria-hidden="true" />
              <span>{t(kind === 'SPECTATOR' ? 'ui.lobby.wait_spectator' : locked ? 'ui.lobby.wait_locked' : 'ui.lobby.wait')}</span>
            </p>
          </div>
        </section>

        <section className="stack">
          <h2 className="section-title">
            <Icon name="users" size="1rem" />
            {t('ui.lobby.crew', { n: players.length })}
          </h2>
          <ul className="crew">
            {players.map((p) => (
              <CrewRow key={p.id} player={p} me={p.id === me?.id} trailing={<span className="crew__slot num">{String(p.slot).padStart(2, '0')}</span>} />
            ))}
          </ul>
          {spectators > 0 && (
            <p className="body-sm">
              <Icon name="eye" size="1rem" style={{ display: 'inline', verticalAlign: '-0.15em', marginInlineEnd: 6 }} />
              {t('ui.lobby.audience', { n: spectators })}
            </p>
          )}
        </section>

        {kind === 'PLAYER' && <RolePicker />}

        <p className="body-sm center">{t('ui.lobby.tip')}</p>
      </div>
    </div>
  );
}
