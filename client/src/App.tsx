// App shell: top bar, the current screen, overlays (role card, codex, settings), the paused
// and reconnecting states, and toasts.
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useT } from './i18n';
import { currentScreen, isPaused, myPlayer, myRoles } from './state/selectors';
import { useSel, useStore } from './state/store';
import type { Screen } from './state/types';
import { Icon, type IconName, type Tone } from './ui/Icon';
import { CallSign, Sheet, useRemaining } from './ui/kit';
import { Backdrop, SCENE_OF } from './ui/Backdrop';
import { BrandMark } from './ui/Brand';
import { JoinScreen } from './screens/JoinScreen';
import { LobbyScreen } from './screens/LobbyScreen';
import { RoleCardBody, RoleCardScreen } from './screens/RoleCard';
import { BuildScreen } from './screens/BuildScreen';
import { VoteScreen } from './screens/vote/VoteScreen';
import { PollScreen } from './screens/PollScreen';
import { ConsoleScreen } from './screens/ConsoleScreen';
import { MinigameScreen } from './screens/MinigameScreen';
import { DebriefScreen } from './screens/DebriefScreen';
import { PilotScreen } from './screens/pilot/PilotScreen';
import { WatchScreen } from './screens/spectator/WatchScreen';
import { CodexSheet } from './screens/CodexSheet';
import { SettingsSheet } from './screens/SettingsSheet';
import './screens/shell.css';

type Overlay = 'role' | 'codex' | 'settings' | null;

function ScreenView({ screen }: { screen: Screen }) {
  switch (screen) {
    case 'join':
      return <JoinScreen />;
    case 'lobby':
      return <LobbyScreen />;
    case 'role':
      return <RoleCardScreen />;
    case 'vote':
      return <VoteScreen />;
    case 'poll':
      return <PollScreen />;
    case 'build':
      return <BuildScreen />;
    case 'console':
      return <ConsoleScreen />;
    case 'minigame':
      return <MinigameScreen />;
    case 'debrief':
      return <DebriefScreen />;
    case 'pilot':
      return <PilotScreen />;
    case 'watch':
      return <WatchScreen />;
  }
}

function ConnectionDot() {
  const t = useT();
  const phase = useSel((s) => s.conn.phase);
  const ok = phase === 'open';
  const label = ok ? t('ui.conn.online') : phase === 'closed' ? t('ui.conn.offline') : t('ui.conn.reconnecting');
  return (
    <span className={`conn ${ok ? 'conn--ok' : 'conn--bad'}`} role="status" aria-label={label} title={label}>
      <Icon name={ok ? 'signal' : 'signalOff'} size="1.1rem" />
    </span>
  );
}

function TopBar({ onOpen }: { onOpen: (o: Overlay) => void }) {
  const t = useT();
  const me = useSel((s) => s.me);
  const roles = useSel(myRoles);
  const locked = useSel((s) => !!s.roles?.locked);
  const fresh = useSel((s) => s.codex.fresh.length);
  const mock = useSel((s) => s.conn.kind === 'mock');
  return (
    <header className="topbar">
      {me ? (
        <>
          <span className="roomcode" role="group" aria-label={t('ui.shell.room', { code: me.room.split('').join(' ') })}>
            <span className="roomcode__k" aria-hidden="true">
              {t('ui.shell.room_short')}
            </span>
            <span className="roomcode__v" aria-hidden="true">
              {me.room}
            </span>
          </span>
          <ConnectionDot />
          {me.kind === 'SPECTATOR' ? (
            <span className="callsign callsign--plain">{t('ui.shell.spectator')}</span>
          ) : locked && roles.length > 0 ? (
            <button type="button" className="rolebtn" onClick={() => onOpen('role')} aria-label={t('ui.shell.my_roles', { roles: roles.join(', ') })} data-testid="open-role">
              <CallSign role={roles[0]!} />
              {roles.length > 1 && <span className="rolebtn__more num">+{roles.length - 1}</span>}
            </button>
          ) : null}
        </>
      ) : (
        <span className="brand">
          <BrandMark size={30} />
          <span className="brand__word">
            Mission<span className="brand__forge">Forge</span>
          </span>
        </span>
      )}
      <span className="spacer" />
      {mock && !me && <span className="mockbadge">{t('ui.shell.demo')}</span>}
      {me && (
        <button type="button" className="iconbtn" onClick={() => onOpen('codex')} aria-label={t('ui.shell.codex')} data-testid="open-codex">
          <span className="iconbtn__wrap">
            <Icon name="book" />
            {fresh > 0 && <span className="badge-dot" aria-label={t('ui.shell.codex_new', { n: fresh })} />}
          </span>
        </button>
      )}
      <button type="button" className="iconbtn" onClick={() => onOpen('settings')} aria-label={t('ui.shell.settings')} data-testid="open-settings">
        <Icon name="gear" />
      </button>
    </header>
  );
}

interface ToastData {
  id: number;
  tone: Tone;
  icon: IconName;
  body: ReactNode;
  ms: number;
}

function Toasts() {
  const t = useT();
  const store = useStore();
  const error = useSel((s) => s.error);
  const notice = useSel((s) => s.notice);
  const kp = useSel((s) => s.kp.last);
  const goodCalls = useSel((s) => s.flight.goodCalls);
  const meId = useSel((s) => s.me?.id ?? null);
  const [toasts, setToasts] = useState<ToastData[]>([]);

  const push = useCallback((toast: ToastData) => {
    setToasts((list) => [...list.filter((x) => x.id !== toast.id), toast].slice(-1));
    window.setTimeout(() => setToasts((list) => list.filter((x) => x.id !== toast.id)), toast.ms);
  }, []);

  useEffect(() => {
    if (!error) return;
    const key = `ui.error.${error.code}`;
    push({ id: error.id, tone: 'bad', icon: 'warn', body: t.has(key) ? t(key) : t('ui.error.generic'), ms: 3200 });
    store.dispatch({ type: 'local.dismissError' });
  }, [error, push, store, t]);

  useEffect(() => {
    if (!notice) return;
    const n = notice.notice;
    const tone: Tone = n.kind === 'WARNING' ? 'warn' : n.kind === 'FACT' ? 'accent' : 'neutral';
    const icon: IconName = n.kind === 'CAPCOM' ? 'radio' : n.kind === 'FACT' ? 'bulb' : n.kind === 'WARNING' ? 'warn' : 'info';
    push({
      id: notice.id,
      tone,
      icon,
      body: (
        <>
          <span className="toast__kind">{t(`ui.notice.${n.kind}`)}</span>
          {t(n.text.key, n.text.args)}
        </>
      ),
      ms: n.durationMs > 0 ? Math.min(n.durationMs, 5000) : 5000,
    });
    store.dispatch({ type: 'local.dismissNotice' });
  }, [notice, push, store, t]);

  useEffect(() => {
    if (!kp) return;
    push({ id: kp.id, tone: 'good', icon: 'bulb', body: t('ui.kp.gain', { kp: kp.kp, reason: t(`ui.kp.reason.${kp.reason}`) }), ms: 3500 });
  }, [kp, push, t]);

  useEffect(() => {
    const last = goodCalls[goodCalls.length - 1];
    if (!last || last.playerId !== meId) return;
    push({ id: 900000 + goodCalls.length, tone: 'good', icon: 'megaphone', body: t('ui.console.good_call_toast', { sync: last.syncDelta, points: last.points }), ms: 3500 });
  }, [goodCalls, meId, push, t]);

  if (toasts.length === 0) return null;
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((x) => (
        <div key={x.id} className={`toast toast--${x.tone}`} role="status" onClick={() => setToasts((list) => list.filter((y) => y.id !== x.id))}>
          <Icon name={x.icon} size="1.3rem" className={`tone-${x.tone}`} />
          <div className="grow">{x.body}</div>
        </div>
      ))}
    </div>
  );
}

function PausedOverlay() {
  const t = useT();
  const paused = useSel((s) => s.paused);
  const flag = useSel(isPaused);
  const left = useRemaining(paused?.roomExpiresAtMs ?? null, 1);
  if (!flag) return null;
  const hostGone = paused?.reason === 'HOST_DISCONNECTED';
  return (
    <div className="pausebar" role="status">
      <Icon name="pause" size="1.1rem" />
      <span className="grow">{hostGone ? t('ui.pause.host_gone') : t('ui.pause.host_request')}</span>
      {hostGone && left != null && (
        <span className="num">
          {Math.floor(left / 60000)}:{String(Math.floor((left % 60000) / 1000)).padStart(2, '0')}
        </span>
      )}
    </div>
  );
}

function ReconnectBar() {
  const t = useT();
  const store = useStore();
  const phase = useSel((s) => s.conn.phase);
  const attempt = useSel((s) => s.conn.attempt);
  const reason = useSel((s) => s.conn.closeReason);
  const joined = useSel((s) => !!s.me);
  if (!joined) return null;
  if (phase === 'open') return null;
  if (phase === 'closed' && reason === 'REPLACED') {
    return (
      <div className="reconnect reconnect--bad" role="alert">
        <Icon name="signalOff" size="1.1rem" />
        <span className="grow">{t('ui.conn.replaced')}</span>
        <button type="button" className="btn btn--sm" onClick={() => store.conn.resume()}>
          {t('ui.conn.use_here')}
        </button>
      </div>
    );
  }
  // D-110: the client has stopped for good (the server no longer knows the room or the seat). Nothing is reconnecting,
  // so say that the room ended and offer the way back to the join screen instead of an endless "Reconnecting…".
  if (phase === 'closed' && (reason === 'ROOM_NOT_FOUND' || reason === 'TOKEN_INVALID')) {
    return (
      <div className="reconnect reconnect--bad" role="alert" data-testid="room-ended">
        <Icon name="signalOff" size="1.1rem" />
        <span className="grow">{t('ui.conn.room_ended')}</span>
        <button type="button" className="btn btn--sm" onClick={() => store.leave()} data-testid="room-ended-rejoin">
          {t('ui.conn.rejoin')}
        </button>
      </div>
    );
  }
  return (
    <div className="reconnect" role="status" data-testid="reconnecting">
      <span className="spinner" aria-hidden="true" />
      <span className="grow">{attempt > 1 ? t('ui.conn.retrying', { n: attempt }) : t('ui.conn.reconnecting')}</span>
    </div>
  );
}

function SpectatorBar() {
  const t = useT();
  const me = useSel((s) => s.me);
  if (!me || me.kind !== 'SPECTATOR') return null;
  return (
    <div className="spectatorbar" role="status">
      <Icon name="eye" size="1.1rem" />
      <span>{me.pendingPlayer ? t('ui.spectator.pending') : t('ui.spectator.watching')}</span>
    </div>
  );
}

export function App() {
  const t = useT();
  const store = useStore();
  const screen = useSel(currentScreen);
  const [overlay, setOverlay] = useState<Overlay>(null);
  const close = useCallback(() => setOverlay(null), []);
  const me = useSel(myPlayer);
  const kicked = useSel((s) => (s.me ? null : s.conn.closeReason));
  // The first screen after load appears at once (no entrance animation, no backdrop fade);
  // every later screen change animates.
  const firstScreen = useRef(screen);
  const [booted, setBooted] = useState(false);
  useEffect(() => {
    if (screen !== firstScreen.current) setBooted(true);
  }, [screen]);

  // The screen under an overlay changed to something that needs the player now: close it.
  useEffect(() => {
    if (screen === 'minigame' || screen === 'poll') setOverlay(null);
  }, [screen]);

  useEffect(() => {
    if (overlay === 'codex') return () => store.dispatch({ type: 'local.codexSeen' });
    return undefined;
  }, [overlay, store]);

  useEffect(() => {
    document.title = me ? `${me.nickname} · MissionForge` : 'MissionForge';
  }, [me]);

  return (
    <div className="app" data-screen={screen} data-testid="app">
      <Backdrop scene={SCENE_OF[screen]} still={!booted} />
      <a className="sr-only" href="#main">
        {t('ui.shell.skip')}
      </a>
      <TopBar onOpen={setOverlay} />
      <ReconnectBar />
      <PausedOverlay />
      <SpectatorBar />
      <Toasts />
      <main id="main" className="screen-host" key={screen} data-kicked={kicked ?? undefined} data-first={booted ? undefined : ''}>
        <ScreenView screen={screen} />
      </main>
      {overlay === 'role' && (
        <Sheet title={t('ui.role.sheet_title')} onClose={close} testId="role-sheet">
          <RoleCardBody />
        </Sheet>
      )}
      {overlay === 'codex' && <CodexSheet onClose={close} />}
      {overlay === 'settings' && <SettingsSheet onClose={close} />}
    </div>
  );
}

