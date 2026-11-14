// Role card (design 14.2 screen 2): your console(s), what you do, your once-per-mission ability.
import { useId, useState } from 'react';
import type { RoleId } from '@protocol';
import { getRole } from '../data/catalog';
import { useT } from '../i18n';
import { myRoles, rolesSignature } from '../state/selectors';
import { useSel, useStore } from '../state/store';
import { Icon, type IconName } from '../ui/Icon';
import { CallSign, Chip, Dialog } from '../ui/kit';
import './role.css';

export const ROLE_ICON: Record<RoleId, IconName> = {
  FLIGHT: 'flag',
  BOOSTER: 'flame',
  STRUCT: 'cube',
  GUIDO: 'target',
  FIDO: 'globe',
  EECOM: 'bolt',
  INCO: 'radio',
  PAYLOAD: 'eye',
  RETRO: 'shield',
  PM: 'wallet',
};

function AbilityUse({ role, onDone }: { role: RoleId; onDone: () => void }) {
  const t = useT();
  const store = useStore();
  const def = getRole(role);
  const [stage, setStage] = useState(1);
  if (!def) return null;
  const confirm = () => {
    store.spendAbility(role, role === 'STRUCT' ? { stageIndex: stage } : {});
    onDone();
  };
  return (
    <Dialog onClose={onDone} labelledBy="ability-title">
      <p className="eyebrow">{t('ui.role.ability_once')}</p>
      <h2 id="ability-title" className="title title--sm">
        {t(def.ability.name_key)}
      </h2>
      <p className="lede">{t(def.ability.description_key)}</p>
      {role === 'STRUCT' && (
        <div className="segmented" role="radiogroup" aria-label={t('ui.role.stage_label')}>
          {[1, 2].map((n) => (
            <button key={n} type="button" role="radio" aria-checked={stage === n} className="segmented__opt" onClick={() => setStage(n)}>
              {t(`ui.role.stage_${n}`)}
            </button>
          ))}
        </div>
      )}
      <div className="row">
        <button type="button" className="btn btn--ghost btn--grow" onClick={onDone}>
          {t('ui.common.cancel')}
        </button>
        <button type="button" className="btn btn--primary btn--grow" onClick={confirm} data-testid="ability-confirm">
          {t('ui.role.ability_use')}
        </button>
      </div>
    </Dialog>
  );
}

/** Embroidered-style mission patch: call sign around the rim, console icon in the middle. */
export function RolePatch({ role, size = 'lg' }: { role: RoleId; size?: 'lg' | 'sm' }) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  return (
    <span className={`patch patch--${size}`} aria-hidden="true">
      <svg viewBox="0 0 120 120" className="patch__svg">
        <defs>
          <path id={`${uid}-top`} d="M 22 60 A 38 38 0 0 1 98 60" />
          <radialGradient id={`${uid}-field`} cx="50%" cy="35%" r="70%">
            <stop offset="0" stopColor="#1f5878" />
            <stop offset="0.6" stopColor="#103049" />
            <stop offset="1" stopColor="#081a2a" />
          </radialGradient>
          <linearGradient id={`${uid}-rim`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#fff1d6" />
            <stop offset="0.5" stopColor="#ffce83" />
            <stop offset="1" stopColor="#b98a45" />
          </linearGradient>
        </defs>
        <circle cx="60" cy="60" r="57" fill={`url(#${uid}-rim)`} />
        <circle cx="60" cy="60" r="53" fill={`url(#${uid}-field)`} stroke="#071522" strokeWidth="1.5" />
        <circle cx="60" cy="60" r="31" fill="none" stroke="#55c5cd" strokeWidth="1.2" strokeDasharray="2 3" opacity="0.8" />
        <path d="M14 76 A 48 48 0 0 0 106 76" fill="none" stroke="#e8eef0" strokeWidth="0.8" opacity="0.35" />
        <text className="patch__text">
          <textPath href={`#${uid}-top`} startOffset="50%" textAnchor="middle">
            {role}
          </textPath>
        </text>
        <g fill="#ffce83">
          <path d="M40 92l1.6 3.3 3.6.5-2.6 2.5.6 3.6-3.2-1.700-3.2 1.700.6-3.6-2.6-2.5 3.6-.5z" />
          <path d="M60 97l1.6 3.3 3.6.5-2.6 2.5.6 3.6-3.2-1.700-3.2 1.700.6-3.6-2.6-2.5 3.6-.5z" />
          <path d="M80 92l1.6 3.3 3.6.5-2.6 2.5.6 3.6-3.2-1.700-3.2 1.700.6-3.6-2.6-2.5 3.6-.5z" />
        </g>
      </svg>
      <span className="patch__icon">
        <Icon name={ROLE_ICON[role]} size="100%" strokeWidth={1.8} />
      </span>
      <span className="patch__sheen" />
    </span>
  );
}

function OneRole({ role, canUse, index }: { role: RoleId; canUse: boolean; index: number }) {
  const t = useT();
  const def = getRole(role);
  const used = useSel((s) => !!s.roles?.abilitiesUsed.includes(role));
  const [asking, setAsking] = useState(false);
  if (!def) return null;
  return (
    <article className="rolecard" style={{ animationDelay: `${index * 160}ms` }}>
      <header className="rolecard__head">
        <RolePatch role={role} />
        <div className="rolecard__title">
          <CallSign role={role} />
          <h3 className="rolecard__name">{t(def.name_key)}</h3>
        </div>
      </header>
      <p className="rolecard__origin">
        <Icon name="book" size="0.95rem" />
        <span>
          {t('ui.role.origin')} {t(def.origin_key)}
        </span>
      </p>
      <dl className="rolecard__duties">
        <div>
          <dt>
            <Icon name="search" size="1rem" />
            {t('ui.role.during_build')}
          </dt>
          <dd>{t(def.insight_key)}</dd>
        </div>
        <div>
          <dt>
            <Icon name="gauge" size="1rem" />
            {t('ui.role.during_flight')}
          </dt>
          <dd>{t(def.console_key)}</dd>
        </div>
      </dl>
      <div className={`rolecard__ability ${used ? 'is-used' : ''}`}>
        <div className="row row--between">
          <span className="eyebrow rolecard__abilitytag">
            <Icon name="bolt" size="1rem" filled />
            {t('ui.role.ability_once')}
          </span>
          {used ? <Chip icon="check">{t('ui.role.ability_spent')}</Chip> : <Chip tone="good">{t('ui.role.ability_ready')}</Chip>}
        </div>
        <p className="rolecard__abilityname">{t(def.ability.name_key)}</p>
        <p className="body-sm">{t(def.ability.description_key)}</p>
        {canUse && !used && role !== 'FLIGHT' && (
          <button type="button" className="btn btn--sm" onClick={() => setAsking(true)} data-testid={`ability-${role}`}>
            <Icon name="bolt" size="1rem" />
            {t('ui.role.ability_use')}
          </button>
        )}
        {canUse && !used && role === 'FLIGHT' && <p className="body-sm">{t('ui.role.ability_flight_hint')}</p>}
      </div>
      {asking && <AbilityUse role={role} onDone={() => setAsking(false)} />}
    </article>
  );
}

/** The cards themselves; used by the first-time screen and by the "your role" sheet. */
export function RoleCardBody({ canUse = true }: { canUse?: boolean }) {
  const t = useT();
  const roles = useSel(myRoles);
  if (roles.length === 0) {
    return <p className="lede center">{t('ui.role.none')}</p>;
  }
  return (
    <div className="stack">
      {roles.map((r, i) => (
        <OneRole key={r} role={r} canUse={canUse} index={i} />
      ))}
    </div>
  );
}

export function RoleCardScreen() {
  const t = useT();
  const store = useStore();
  const roles = useSel(myRoles);
  const signature = useSel(rolesSignature);
  return (
    <div className="screen" data-testid="screen-role">
      <div className="screen__scroll">
        <header className="stack stack--sm">
          <p className="eyebrow">{t('ui.role.eyebrow')}</p>
          <h1 className="title">{t(roles.length > 1 ? 'ui.role.title_many' : 'ui.role.title_one', { n: roles.length })}</h1>
          <p className="lede">{t('ui.role.lede')}</p>
        </header>
        <RoleCardBody canUse={false} />
      </div>
      <div className="actionbar">
        <button type="button" className="btn btn--primary btn--lg btn--block" onClick={() => store.ackRoleCard(signature)} data-testid="role-ready">
          <Icon name="check" />
          {t('ui.role.ready')}
        </button>
      </div>
    </div>
  );
}
