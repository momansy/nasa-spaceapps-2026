// Settings: accessibility toggles (design section 16), language, privacy and leaving the room.
// Device preferences are saved on the phone and sent to the room with `player.prefs`; flags the
// host switched on for the whole room (`settings.state.a11y`) are shown locked.
import { useState, type ReactNode } from 'react';
import { PROTOCOL_VERSION } from '@protocol';
import type { PlayerPrefs, RoomA11y } from '@protocol';
import { availableLanguages, dirOf, languageName, useT } from '../i18n';
import { canVibrate, vibrate } from '../lib/haptics';
import { APP_VERSION } from '../net/wsConnection';
import { useSel, useStore } from '../state/store';
import { Icon, type IconName } from '../ui/Icon';
import { Dialog, Sheet, Switch } from '../ui/kit';
import './settings.css';

const TEXT_STEPS = [100, 125, 150, 175, 200] as const;

type BoolPref = 'highContrast' | 'reducedMotion' | 'relaxed' | 'oneButton' | 'holdToToggle' | 'haptics' | 'screenReader';

/** Device preference → the room-wide flag that forces it on, where one exists. */
const FORCED_BY: Partial<Record<BoolPref, keyof RoomA11y>> = {
  highContrast: 'highContrast',
  reducedMotion: 'reducedMotion',
  relaxed: 'relaxedMinigames',
};

function Section({ icon, title, children }: { icon: IconName; title: string; children: ReactNode }) {
  return (
    <section className="stack stack--sm">
      <h3 className="section-title">
        <Icon name={icon} size="1rem" />
        <span>{title}</span>
      </h3>
      <div className="panel st-panel">{children}</div>
    </section>
  );
}

/** A switch that the host has turned on for everyone: shown on, not changeable. */
function LockedRow({ title, description }: { title: string; description: string }) {
  const t = useT();
  return (
    <div className="st-locked" role="group" aria-label={`${title}. ${t('ui.settings.host_forced')}`}>
      <span className="switch__text">
        <span className="switch__title">{title}</span>
        <span className="switch__desc">
          <br />
          {description}
        </span>
        <span className="st-locked__tag">
          <Icon name="lock" size="0.85rem" />
          {t('ui.settings.host_forced')}
        </span>
      </span>
      <span className="switch__track st-locked__track" aria-hidden="true">
        <span className="switch__thumb">
          <Icon name="check" size="0.9rem" strokeWidth={3} />
        </span>
      </span>
    </div>
  );
}

export function SettingsSheet({ onClose }: { onClose: () => void }) {
  const t = useT();
  const store = useStore();
  const prefs = useSel((s) => s.prefs);
  const a11y = useSel((s) => s.settings?.a11y ?? null);
  const joined = useSel((s) => !!s.me);
  const room = useSel((s) => s.me?.room ?? null);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const languages = availableLanguages();
  const vibrates = canVibrate();

  const set = (patch: Partial<PlayerPrefs>) => store.setPrefs(patch);

  const toggle = (key: BoolPref) => {
    const flag = FORCED_BY[key];
    const title = t(`ui.settings.${key}.title`);
    const description = t(`ui.settings.${key}.desc`);
    if (flag && a11y?.[flag]) return <LockedRow key={key} title={title} description={description} />;
    return <Switch key={key} checked={prefs[key]} onChange={(v) => set({ [key]: v } as Partial<PlayerPrefs>)} title={title} description={description} testId={`pref-${key}`} />;
  };

  const stepIndex = Math.max(0, TEXT_STEPS.findIndex((s) => s >= prefs.textScalePct));
  const setStep = (i: number) => set({ textScalePct: TEXT_STEPS[Math.min(TEXT_STEPS.length - 1, Math.max(0, i))] });

  // Room-wide flags that have no per-device switch: shown for information when the host set them.
  const roomOnly: Array<keyof RoomA11y> = (['slowTimers', 'subtitles', 'explainTooltips'] as const).filter((k) => a11y?.[k]);

  return (
    <>
      <Sheet title={t('ui.settings.title')} onClose={onClose} full testId="settings-sheet">
        <Section icon="eye" title={t('ui.settings.section.display')}>
          <div className="st-text" role="group" aria-label={t('ui.settings.text.title')}>
            <div className="st-text__head">
              <span className="switch__title">{t('ui.settings.text.title')}</span>
              <span className="num st-text__value" aria-live="polite" data-testid="text-scale-value">
                {prefs.textScalePct}
                <span className="unit">%</span>
              </span>
            </div>
            <div className="st-stepper">
              <button type="button" className="btn st-stepper__btn" onClick={() => setStep(stepIndex - 1)} disabled={stepIndex === 0} aria-label={t('ui.settings.text.smaller')} data-testid="text-smaller">
                <span className="st-stepper__a st-stepper__a--sm" aria-hidden="true">
                  A
                </span>
                <Icon name="minus" size="1rem" strokeWidth={2.600} />
              </button>
              <div className="st-pips" aria-hidden="true">
                {TEXT_STEPS.map((s, i) => (
                  <span key={s} className={`st-pip ${i <= stepIndex ? 'st-pip--on' : ''}`} />
                ))}
              </div>
              <button
                type="button"
                className="btn st-stepper__btn"
                onClick={() => setStep(stepIndex + 1)}
                disabled={stepIndex === TEXT_STEPS.length - 1}
                aria-label={t('ui.settings.text.larger')}
                data-testid="text-larger"
              >
                <span className="st-stepper__a st-stepper__a--lg" aria-hidden="true">
                  A
                </span>
                <Icon name="plus" size="1rem" strokeWidth={2.600} />
              </button>
            </div>
            <p className="st-sample">{t('ui.settings.text.sample')}</p>
          </div>
          <hr className="rule" />
          {toggle('highContrast')}
          <hr className="rule" />
          {toggle('reducedMotion')}
        </Section>

        <Section icon="hand" title={t('ui.settings.section.controls')}>
          {toggle('relaxed')}
          <hr className="rule" />
          {toggle('oneButton')}
          <hr className="rule" />
          {toggle('holdToToggle')}
        </Section>

        <Section icon="radio" title={t('ui.settings.section.feedback')}>
          {toggle('haptics')}
          <div className="st-haptic">
            <button type="button" className="btn btn--sm" disabled={!vibrates || !prefs.haptics} onClick={() => vibrate([40, 50, 40, 50, 120])} data-testid="haptics-test">
              <Icon name="bolt" size="1rem" />
              {t('ui.settings.haptics.test')}
            </button>
            {!vibrates && <span className="st-hint">{t('ui.settings.haptics.unavailable')}</span>}
          </div>
          <hr className="rule" />
          {toggle('screenReader')}
        </Section>

        {roomOnly.length > 0 && (
          <Section icon="users" title={t('ui.settings.section.room')}>
            <ul className="stack stack--sm">
              {roomOnly.map((k) => (
                <li key={k} className="st-roomflag">
                  <Icon name="check" size="1rem" className="tone-good" strokeWidth={2.800} />
                  <span className="grow">{t(`ui.settings.room.${k}`)}</span>
                </li>
              ))}
            </ul>
            <p className="st-hint">{t('ui.settings.room.note')}</p>
          </Section>
        )}

        <Section icon="globe" title={t('ui.settings.section.language')}>
          <div role="radiogroup" aria-label={t('ui.settings.section.language')} className="stack stack--sm">
            {languages.map((code) => {
              const on = code === prefs.lang;
              return (
                <button key={code} type="button" role="radio" aria-checked={on} className={`st-lang ${on ? 'st-lang--on' : ''}`} onClick={() => set({ lang: code })} data-testid={`lang-${code}`}>
                  <span className="st-lang__mark" aria-hidden="true">
                    {on && <Icon name="check" size="0.95rem" strokeWidth={3} />}
                  </span>
                  <span className="grow st-lang__name" lang={code} dir={dirOf(code)}>
                    {languageName(code)}
                  </span>
                  <span className="st-lang__code">{code.toUpperCase()}</span>
                </button>
              );
            })}
          </div>
          <p className="st-hint">{t('ui.settings.language.more')}</p>
        </Section>

        <div className="banner st-privacy">
          <Icon name="shield" size="1.3rem" className="tone-good" />
          <div>
            <p className="st-privacy__title">{t('ui.settings.privacy.title')}</p>
            <p className="body-sm">{t('ui.settings.privacy.text')}</p>
          </div>
        </div>

        {joined && (
          <button type="button" className="btn btn--outline-bad btn--block" onClick={() => setConfirmLeave(true)} data-testid="leave-room">
            <Icon name="exit" size="1.2rem" />
            {t('ui.settings.leave.button')}
          </button>
        )}

        <p className="st-version">
          {t('ui.settings.version', { version: APP_VERSION, protocol: PROTOCOL_VERSION })}
        </p>
      </Sheet>

      {confirmLeave && (
        <Dialog tone="bad" onClose={() => setConfirmLeave(false)} labelledBy="st-leave-title">
          <h3 id="st-leave-title" className="title title--sm">
            {t('ui.settings.leave.title', { room: room ?? '' })}
          </h3>
          <p className="lede">{t('ui.settings.leave.text')}</p>
          <div className="st-dialog-actions">
            <button type="button" className="btn btn--grow" onClick={() => setConfirmLeave(false)} data-testid="leave-cancel">
              {t('ui.settings.leave.stay')}
            </button>
            <button
              type="button"
              className="btn btn--bad btn--grow"
              onClick={() => {
                setConfirmLeave(false);
                store.leave();
                onClose();
              }}
              data-testid="leave-confirm"
            >
              {t('ui.settings.leave.confirm')}
            </button>
          </div>
        </Dialog>
      )}
    </>
  );
}
