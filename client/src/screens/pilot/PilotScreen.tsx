// Phone pilot (design 9.2 touch column, 9.4 "phones become virtual gamepads"). The host owns the
// simulation: this screen sends inputs and shows what `pilot.hud` and `flight.hud` say. Throttle
// shows the commanded position and the host's read-back (`throttlePct`) side by side.
//
// Assist layouts (9.3): Cadet shows throttle, STAGE, DEPLOY and ABORT only; Engineer and Flight
// Director show the full touch column. The co-pilot seat is `CopilotScreen`.
import { useCallback, useEffect, useRef, useState } from 'react';
import type { AttMode, Craft } from '@protocol';
import { useT } from '../../i18n';
import { currentHud, mySeat, seatActionOpen } from '../../state/selectors';
import { useSel, useStore } from '../../state/store';
import { Icon } from '../../ui/Icon';
import { AbortSwitch, AxisStick, HoldButton, RotatePad, SwipeStrip, ThrottleSlider } from './controls';
import { STAGE_HOLD_MS } from './controlsData';
import { CopilotScreen } from './CopilotScreen';
import { FlightStrip } from './FlightStrip';
import { HudBanners } from './HudBanners';
import './pilot.css';

const ATT_MODES: AttMode[] = ['OFF', 'PROGRADE', 'RETROGRADE', 'HEAT_SHIELD_FWD'];
const SIDE_KEY = 'mf.pilot.throttleSide';

type Side = 'left' | 'right';

function loadSide(): Side {
  try {
    return localStorage.getItem(SIDE_KEY) === 'right' ? 'right' : 'left';
  } catch {
    return 'left';
  }
}

function RotateHint() {
  const t = useT();
  const [off, setOff] = useState(() => {
    try {
      return sessionStorage.getItem('mf.pilot.rotateHint') === '1';
    } catch {
      return false;
    }
  });
  useEffect(() => {
    // A gentle hint, never a wall: it leaves by itself.
    const id = setTimeout(() => setOff(true), 12_000);
    return () => clearTimeout(id);
  }, []);
  if (off) return null;
  return (
    <div className="pbanner pbanner--rotate" data-testid="pilot-rotate-hint">
      <Icon name="rotate" size="1.3rem" />
      <span className="grow">{t('ui.pilot.rotate_hint')}</span>
      <button
        type="button"
        className="iconbtn"
        aria-label={t('ui.pilot.rotate_hint_dismiss')}
        onClick={() => {
          setOff(true);
          try {
            sessionStorage.setItem('mf.pilot.rotateHint', '1');
          } catch {
            /* ignore */
          }
        }}
      >
        <Icon name="cross" size="1.1rem" />
      </button>
    </div>
  );
}

function PilotPad({ craft, booster }: { craft: Craft; booster: boolean }) {
  const t = useT();
  const store = useStore();
  const hud = useSel(currentHud);
  const assist = useSel((s) => s.settings?.assistLevel ?? 'ENGINEER');
  const phase = useSel((s) => s.phase?.phase ?? 'FLIGHT');
  const actionsOpen = useSel(seatActionOpen);
  const [side, setSide] = useState<Side>(loadSide);
  const cadet = assist === 'CADET';
  const mine = hud && hud.craft === craft ? hud : null;
  const rcsOn = mine?.rcsOn ?? false;

  // The sampler starts with the seat; a finger that is up means centred axes (also on exit or when hidden).
  const [cmd, setCmd] = useState(() => store.pilotAxes(craft).throttle);
  useEffect(() => {
    const centre = () => store.pilotInput(craft, { pitch: 0, yaw: 0, roll: 0 });
    const onHide = () => document.hidden && centre();
    document.addEventListener('visibilitychange', onHide);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      centre();
    };
  }, [craft, store]);

  // Until the pilot touches the throttle, the commanded position is what the host holds.
  const touched = useRef(false);
  const hostThrottle = mine ? mine.throttlePct : null;
  useEffect(() => {
    if (!touched.current && hostThrottle != null) setCmd(Math.round(hostThrottle) / 100);
  }, [hostThrottle]);

  const onThrottle = useCallback(
    (v: number) => {
      touched.current = true;
      setCmd(v);
      store.pilotInput(craft, { throttle: v });
    },
    [craft, store],
  );
  const onPitch = useCallback((v: number) => store.pilotInput(craft, { pitch: v }), [craft, store]);
  const onRotate = useCallback((yaw: number, roll: number) => store.pilotInput(craft, { yaw, roll }), [craft, store]);

  // Time warp: the host decides (design 9.7); the phone only says "not now" when nothing changed.
  const [warpNote, setWarpNote] = useState(false);
  const warp = mine?.warp ?? 1;
  const warpAtSend = useRef(1);
  const warpTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const noteRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const warpNow = useRef(warp);
  warpNow.current = warp;
  useEffect(
    () => () => {
      if (warpTimer.current) clearTimeout(warpTimer.current);
      if (noteRef.current) clearTimeout(noteRef.current);
    },
    [],
  );
  const sendWarp = (action: 'WARP_UP' | 'WARP_DOWN') => {
    warpAtSend.current = warpNow.current;
    if (!store.pilotAction(craft, action)) return;
    if (warpTimer.current) clearTimeout(warpTimer.current);
    warpTimer.current = setTimeout(() => {
      if (warpNow.current === warpAtSend.current) {
        setWarpNote(true);
        if (noteRef.current) clearTimeout(noteRef.current);
        noteRef.current = setTimeout(() => setWarpNote(false), 2200);
      }
    }, 900);
  };

  const [mapOn, setMapOn] = useState(false);
  const deployTarget = mine?.deployTarget ?? null;
  const canStage = mine?.canStage ?? false;
  const title = booster ? t('ui.pilot.title_booster') : t('ui.pilot.title');

  return (
    <div className={`screen pilot pilot--${assist.toLowerCase()} pilot--${side}`} data-testid="pilot-screen" data-craft={craft} data-assist={assist}>
      <div className="screen__scroll pilot__scroll pilot__main">
        <div className="pilot__top">
        <header className="pilot__head">
          <h1 className="title pilot__title" data-testid="pilot-title">
            {title}
          </h1>
          <span className="chip chip--accent" data-testid="pilot-assist">
            <Icon name="gauge" size="1rem" />
            <span>{t(`ui.pilot.assist.${assist}`)}</span>
          </span>
          <span className="spacer" />
          <button
            type="button"
            className="btn btn--sm pilot__side"
            data-testid="pilot-side"
            aria-label={t(side === 'left' ? 'ui.pilot.side_left' : 'ui.pilot.side_right')}
            onClick={() => {
              const next: Side = side === 'left' ? 'right' : 'left';
              setSide(next);
              try {
                localStorage.setItem(SIDE_KEY, next);
              } catch {
                /* ignore */
              }
            }}
          >
            <Icon name={side === 'left' ? 'arrowUp' : 'arrowDown'} size="1rem" className="pilot__sideicon" />
            <span>{t(side === 'left' ? 'ui.pilot.side_left_short' : 'ui.pilot.side_right_short')}</span>
          </button>
        </header>
        <RotateHint />
        <FlightStrip />
        <HudBanners />
        </div>

        <>
          <div className="pilot__thr">
            <ThrottleSlider value={cmd} readbackPct={mine ? mine.throttlePct : null} onChange={onThrottle} />
          </div>

          <div className="pilot__mid">
            <button
              type="button"
              className="btn pilot__deploy"
              data-testid="pilot-deploy"
              disabled={!actionsOpen || !deployTarget}
              onClick={() => store.pilotAction(craft, 'DEPLOY', { deploy: 'CONTEXT' })}
            >
              <Icon name="rocket" size="1.2rem" />
              <span className="pilot__deploytext">
                <b>{deployTarget ? t('ui.pilot.deploy_with', { target: t(`ui.pilot.deploy_target.${deployTarget}`) }) : t('ui.pilot.deploy')}</b>
                {!deployTarget && <small>{t('ui.pilot.deploy_none')}</small>}
              </span>
            </button>

            {!cadet && (
              <>
                <div className="pilot__group" role="group" aria-label={t('ui.pilot.att')} data-testid="pilot-att">
                  <span className="pilot__gk">{t('ui.pilot.att')}</span>
                  <div className="pilot__chips">
                    {ATT_MODES.map((m) => (
                      <button
                        key={m}
                        type="button"
                        className={`btn btn--sm pchip ${mine?.attMode === m ? 'btn--selected' : ''}`}
                        aria-pressed={mine?.attMode === m}
                        aria-label={m === 'HEAT_SHIELD_FWD' ? t('ui.pilot.att_HEAT_SHIELD_FWD_full') : undefined}
                        data-testid={`pilot-att-${m}`}
                        disabled={!actionsOpen}
                        onClick={() => store.pilotAction(craft, 'ATT_HOLD', { attMode: m })}
                      >
                        {mine?.attMode === m && <Icon name="check" size="0.95rem" strokeWidth={3} />}
                        {t(`ui.pilot.att_${m}`)}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="pilot__row">
                  <button
                    type="button"
                    role="switch"
                    aria-checked={rcsOn}
                    className={`btn btn--sm pilot__rcs ${rcsOn ? 'btn--selected' : ''}`}
                    data-testid="pilot-rcs"
                    disabled={!actionsOpen}
                    onClick={() => store.pilotAction(craft, 'RCS_TOGGLE')}
                  >
                    <Icon name={rcsOn ? 'statusGood' : 'dot'} size="1.1rem" />
                    <span>
                      {t('ui.pilot.rcs')} {t(rcsOn ? 'ui.pilot.on' : 'ui.pilot.off')}
                    </span>
                  </button>
                  <button
                    type="button"
                    className={`btn btn--sm pilot__map ${mapOn ? 'btn--selected' : ''}`}
                    aria-pressed={mapOn}
                    data-testid="pilot-map"
                    disabled={!actionsOpen}
                    onClick={() => {
                      setMapOn((v) => !v);
                      store.pilotAction(craft, 'MAP_TOGGLE');
                    }}
                  >
                    <Icon name="globe" size="1.1rem" />
                    <span>{t('ui.pilot.map')}</span>
                  </button>
                </div>
              </>
            )}

            {!cadet && (
              <>
                {phase === 'COUNTDOWN' && (
                  <div className="pilot__row" role="group" aria-label={t('ui.pilot.countdown')}>
                    <button type="button" className="btn btn--sm btn--warn grow" data-testid="pilot-hold" disabled={!actionsOpen} onClick={() => store.pilotAction(craft, 'COUNTDOWN_HOLD')}>
                      <Icon name="pause" size="1.1rem" />
                      <span>{t('ui.pilot.countdown_hold')}</span>
                    </button>
                    <button type="button" className="btn btn--sm btn--good grow" data-testid="pilot-resume" disabled={!actionsOpen} onClick={() => store.pilotAction(craft, 'COUNTDOWN_RESUME')}>
                      <Icon name="play" size="1.1rem" />
                      <span>{t('ui.pilot.countdown_resume')}</span>
                    </button>
                  </div>
                )}
                <div className="pilot__row pilot__warp" role="group" aria-label={t('ui.pilot.warp')}>
                  <button type="button" className="btn btn--sm" data-testid="pilot-warp-down" aria-label={t('ui.pilot.warp_down')} disabled={!actionsOpen} onClick={() => sendWarp('WARP_DOWN')}>
                    <Icon name="minus" size="1.1rem" />
                  </button>
                  <span className="pilot__warpnow" data-testid="pilot-warp-now" aria-live="polite">
                    <small>{t('ui.pilot.warp')}</small>
                    <span className="num">{t('ui.pilot.warp_now', { n: warp })}</span>
                  </span>
                  <button type="button" className="btn btn--sm" data-testid="pilot-warp-up" aria-label={t('ui.pilot.warp_up')} disabled={!actionsOpen} onClick={() => sendWarp('WARP_UP')}>
                    <Icon name="plus" size="1.1rem" />
                  </button>
                </div>
                {warpNote && (
                  <span className="pilot__note" role="status" data-testid="pilot-warp-note">
                    <Icon name="statusWarn" size="1rem" />
                    {t('ui.pilot.warp_not_now')}
                  </span>
                )}
                <RotatePad enabled={rcsOn} onChange={onRotate} />
                <SwipeStrip onSwipe={() => store.pilotAction(craft, 'CAMERA_CYCLE')} />
              </>
            )}
          </div>

          {!cadet && (
            <div className="pilot__stick">
              <AxisStick label={t('ui.pilot.pitch')} ariaLabel={t('ui.pilot.pitch_aria')} onChange={onPitch} />
            </div>
          )}
        </>
      </div>
      <div className="actionbar pilot__bar pilot__acts" role="group" aria-label={t('ui.pilot.actions')}>
        <HoldButton
          holdMs={STAGE_HOLD_MS}
          icon="rocket"
          label={t('ui.pilot.stage')}
          ariaLabel={t('ui.pilot.stage_aria', { s: STAGE_HOLD_MS / 1000 })}
          disabled={!actionsOpen || !canStage}
          disabledReason={t('ui.pilot.stage_wait')}
          testId="pilot-stage"
          className="pilot__stage"
          onComplete={() => store.pilotAction(craft, 'STAGE')}
        />
        {!cadet && (
        <button type="button" className="btn pilot__cutoff" data-testid="pilot-cutoff" disabled={!actionsOpen} onClick={() => {
            // Cut engines: the commanded throttle goes to zero here too, or the keep-alive would reopen it.
            onThrottle(0);
            store.pilotAction(craft, 'CUTOFF');
          }}>
          <Icon name="ban" size="1rem" />
          <span>{t('ui.pilot.cutoff')}</span>
        </button>
        )}
        <AbortSwitch onAbort={() => store.pilotAction(craft, 'ABORT')} />
      </div>
    </div>
  );
}

export function PilotScreen() {
  const seat = useSel(mySeat);
  if (!seat) return null;
  if (seat.kind === 'COPILOT') return <CopilotScreen />;
  return <PilotPad key={seat.kind} craft={seat.craft!} booster={seat.kind === 'BOOSTER'} />;
}
