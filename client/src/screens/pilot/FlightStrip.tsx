// T+ clock, flight phase and three numbers from `flight.hud` with units (altitude km, speed
// m/s, dynamic pressure kPa). Shared by the pilot, co-pilot and spectator screens. The phone
// shows what the host sent; it computes nothing about the flight.
import { CHANNEL_SPECS, fmt, fmtMet } from '../../data/format';
import { useT } from '../../i18n';
import { isPaused } from '../../state/selectors';
import { useSel } from '../../state/store';
import { Icon } from '../../ui/Icon';

function Stat({ label, value, unit, testId }: { label: string; value: number | null | undefined; unit: string; testId: string }) {
  const known = value != null && Number.isFinite(value);
  return (
    <div className="pstrip__stat" data-testid={testId}>
      <dt>{label}</dt>
      <dd>
        <span className="num">{known ? fmt(value, unit === 'm/s' ? 0 : 1, unit === 'm/s' ? 0 : 1) : '—'}</span>
        <span className="unit">{known ? unit : ''}</span>
      </dd>
    </div>
  );
}

export function FlightStrip() {
  const t = useT();
  const hud = useSel((s) => s.flight.hud);
  const phase = useSel((s) => s.phase);
  const blackout = useSel((s) => !!s.flight.blackout);
  const paused = useSel(isPaused);
  const countdown = phase?.phase === 'COUNTDOWN';
  const code = phase?.flightPhase ?? null;
  return (
    <section className="pstrip panel" aria-label={t('ui.pilot.strip_aria')} data-testid="pilot-strip">
      <div className="pstrip__top">
        <span className="pstrip__met num" data-testid="pilot-met">
          {hud ? fmtMet(hud.metS) : countdown ? t('ui.pilot.countdown') : '—'}
        </span>
        <span className="pstrip__phase">
          {code && <span className="callsign callsign--plain">{code}</span>}
          <span className="pstrip__phasename">{code ? t(`ui.flight_phase.${code}`) : t(`ui.phase.${phase?.phase ?? 'FLIGHT'}`)}</span>
        </span>
        {(blackout || paused) && (
          <span className="chip chip--warn" role="status" data-testid="pilot-strip-flag">
            <Icon name={paused ? 'pause' : 'signalOff'} size="1rem" />
            <span>{paused ? t('ui.pilot.paused') : t('ui.pilot.no_signal')}</span>
          </span>
        )}
      </div>
      <dl className="pstrip__stats">
        <Stat label={t('ui.pilot.hud_alt')} value={hud?.altitudeKm} unit={CHANNEL_SPECS.altitude_km.unit} testId="pilot-hud-alt" />
        <Stat label={t('ui.pilot.hud_speed')} value={hud?.velocityMs} unit={CHANNEL_SPECS.velocity_ms.unit} testId="pilot-hud-speed" />
        <Stat label={t('ui.pilot.hud_q')} value={hud?.qKpa} unit={CHANNEL_SPECS.q_kpa.unit} testId="pilot-hud-q" />
      </dl>
    </section>
  );
}
