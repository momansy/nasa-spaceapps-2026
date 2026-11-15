// Co-pilot seat (design 9.4): STAGE (hold 0.3 s) and DEPLOY with a target on the phone while the
// pilot flies. The pilot's throttle and attitude mode come from `pilot.hud` as read-back only.
import type { DeployTarget } from '@protocol';
import { useT } from '../../i18n';
import { currentHud, seatActionOpen } from '../../state/selectors';
import { useSel, useStore } from '../../state/store';
import { Icon } from '../../ui/Icon';
import { HoldButton } from './controls';
import { STAGE_HOLD_MS } from './controlsData';
import { FlightStrip } from './FlightStrip';
import { HudBanners } from './HudBanners';
import './pilot.css';

const TARGETS: DeployTarget[] = ['CONTEXT', 'FAIRING', 'CHUTES', 'LEGS', 'ARRAYS'];

export function CopilotScreen() {
  const t = useT();
  const store = useStore();
  const hud = useSel(currentHud);
  const open = useSel(seatActionOpen);
  const assist = useSel((s) => s.settings?.assistLevel ?? 'ENGINEER');
  const canStage = hud?.canStage ?? false;
  const suggested = hud?.deployTarget ?? null;
  return (
    <div className="screen pilot pilot--copilot" data-testid="copilot-screen">
      <div className="screen__scroll pilot__scroll copilot__main" tabIndex={0}>
        <div className="pilot__top copilot__top">
          <header className="copilot__head">
            <h1 className="title pilot__title" data-testid="copilot-title">
              {t('ui.copilot.title')}
            </h1>
            <span className="chip chip--accent">
              <Icon name="gauge" size="1rem" />
              <span>{t(`ui.pilot.assist.${assist}`)}</span>
            </span>
          </header>
          <FlightStrip />
          <HudBanners />
          <dl className="copilot__readback" data-testid="copilot-readback">
            <div className="copilot__cell">
              <dt>{t('ui.copilot.pilot_throttle')}</dt>
              <dd className="num" data-testid="copilot-throttle">
                {hud ? `${Math.round(hud.throttlePct)}\u00a0%` : '—'}
              </dd>
            </div>
            <div className="copilot__cell">
              <dt>{t('ui.copilot.pilot_mode')}</dt>
              <dd data-testid="copilot-mode">{hud ? t(`ui.pilot.att_${hud.attMode}`) : '—'}</dd>
            </div>
          </dl>
        </div>

        <div className="copilot__stage">
          <HoldButton
            holdMs={STAGE_HOLD_MS}
            icon="rocket"
            label={t('ui.pilot.stage')}
            ariaLabel={t('ui.pilot.stage_aria', { s: STAGE_HOLD_MS / 1000 })}
            disabled={!open || !canStage}
            disabledReason={t('ui.pilot.stage_wait')}
            testId="copilot-stage"
            onComplete={() => store.copilotAction('STAGE')}
          />
        </div>

        <section className="stack stack--sm" aria-label={t('ui.copilot.deploy_title')}>
          <h2 className="copilot__targets-title">{t('ui.copilot.deploy_title')}</h2>
          <div className="copilot__targets" data-testid="copilot-targets">
            {TARGETS.map((target) => {
              const isCtx = target === 'CONTEXT';
              const label = isCtx ? t('ui.copilot.target_context') : t(`ui.copilot.target_${target}`);
              const hint = isCtx ? (suggested ? t('ui.copilot.context_is', { target: t(`ui.pilot.deploy_target.${suggested}`) }) : t('ui.pilot.deploy_none')) : suggested === target ? t('ui.copilot.suggested') : null;
              return (
                <button
                  key={target}
                  type="button"
                  className={`btn copilot__target ${suggested === target || (isCtx && suggested) ? 'btn--selected' : ''}`}
                  disabled={!open}
                  data-testid={`copilot-deploy-${target}`}
                  aria-label={t('ui.copilot.deploy_aria', { target: isCtx ? t('ui.copilot.target_context') : label })}
                  onClick={() => store.copilotAction('DEPLOY', target)}
                >
                  <span>{label}</span>
                  {hint && <small className="copilot__tag">{hint}</small>}
                </button>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}
