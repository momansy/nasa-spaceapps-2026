// Guidance cue and console requests from `pilot.hud` (design 9.3 guidance cue, 9.5 requests).
import { useT } from '../../i18n';
import { currentHud } from '../../state/selectors';
import { useSel } from '../../state/store';
import { Icon } from '../../ui/Icon';
import { CallSign } from '../../ui/kit';

export function HudBanners() {
  const t = useT();
  const cue = useSel((s) => currentHud(s)?.cue ?? null);
  const prompts = useSel((s) => currentHud(s)?.prompts ?? []);
  return (
    <>
      {cue && (
        <div className="pbanner pbanner--cue" role="status" data-testid="pilot-cue">
          <Icon name="bulb" size="1.3rem" />
          <span>
            <b>{t('ui.pilot.cue')}</b> {t(cue.key, cue.args)}
          </span>
        </div>
      )}
      {prompts.map((p) => (
        <div key={p.requestId} className="pbanner pbanner--prompt" role="status" data-testid={`pilot-prompt-${p.requestId}`}>
          <Icon name="hand" size="1.3rem" />
          <span className="pbanner__text">
            <b>{t('ui.pilot.prompt_title')}</b>
            <CallSign role={p.role} />
            <span>{t(`request.${p.requestId}.label`)}</span>
          </span>
        </div>
      ))}
    </>
  );
}

