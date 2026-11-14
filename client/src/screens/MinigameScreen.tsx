// Minigame host screen (design section 10.1, 10.3; protocol section 10).
//
// It owns everything around a minigame: loading `src/minigames/<id>/`, `mg.ready`, the
// one-sentence instruction with the looping demo, the countdown to `startAtMs`, starting the
// run from the shared seed, pause handling, the single `mg.result`, and the result screen
// with tier, boosts and fact. The minigame itself only implements `MinigameModule`.
import { useEffect, useMemo, useRef, useState } from 'react';
import type { BoostGrant, MgMap, MgStartPayload, MgSummaryPayload, MinigameMode, Tier } from '@protocol';
import { getFact, getMinigame } from '../data/catalog';
import { fmt, fmtBoost } from '../data/format';
import { t as translate, useT } from '../i18n';
import { vibrate } from '../lib/haptics';
import { loadMinigame, type MinigameCoop, type MinigameEnv, type MinigameInstance, type MinigameModule, type MinigameResult } from '../minigames/types';
import { isPaused } from '../state/selectors';
import { isReducedMotion, useSel, useStore } from '../state/store';
import type { MinigameOutcome } from '../state/types';
import { Icon, type IconName } from '../ui/Icon';
import { Chip, Switch, useServerNow } from '../ui/kit';
import { coopChannel } from '../minigames/coop';
import { runParams } from '../minigames/slots';
import './minigame.css';

/** A phone that arrives with less than this much play time left sits the run out. */
const MIN_LATE_PLAY_MS = 4000;
/**
 * Starting up to this late still plays the full length, so every phone runs the identical
 * curve (the host accepts results until 2 s after the nominal end).
 */
const LATE_START_SLACK_MS = 500;
/** `mg.progress` is limited to 2 per second (protocol section 11). */
const PROGRESS_GAP_MS = 600;

/** Runs for which this page already sent `mg.ready` (survives remounts of the screen). */
const readySent = new Set<string>();

type Stage = 'intro' | 'play' | 'done' | 'late';

export function MinigameScreen() {
  const runId = useSel((s) => s.mg?.start.runId ?? null);
  if (!runId) return null;
  return <Run key={runId} />;
}

function modeOf(prefs: { oneButton: boolean; relaxed: boolean }, roomRelaxed: boolean): MinigameMode {
  if (prefs.oneButton) return 'ONE_BUTTON';
  if (prefs.relaxed || roomRelaxed) return 'RELAXED';
  return 'STANDARD';
}

function Run() {
  const t = useT();
  const store = useStore();
  const start = useSel((s) => s.mg?.start ?? null);
  const storedOutcome = useSel((s) => s.mg?.outcome ?? null);
  const summary = useSel((s) => s.mg?.summary ?? null);
  const spectator = useSel((s) => s.me?.kind === 'SPECTATOR');
  const meId = useSel((s) => s.me?.id ?? null);
  const prefs = useSel((s) => s.prefs);
  const roomRelaxed = useSel((s) => !!s.settings?.a11y.relaxedMinigames);
  const reducedMotion = useSel(isReducedMotion);
  const paused = useSel(isPaused);

  /** undefined = loading, null = this build has no such minigame. */
  const [mod, setMod] = useState<MinigameModule | null | undefined>(undefined);
  const [localOutcome, setLocalOutcome] = useState<MinigameOutcome | null>(null);
  const [stage, setStage] = useState<Stage>(() => {
    const s = store.getState().mg;
    if (!s) return 'late';
    if (s.outcome) return 'done';
    const left = s.start.startAtMs + s.start.durationMs - store.now();
    return left >= MIN_LATE_PLAY_MS ? 'intro' : 'late';
  });
  /** Fixed when play begins: the mode and the play time of this device's run. */
  const [play, setPlay] = useState<{ mode: MinigameMode; durationMs: number; reducedMotion: boolean } | null>(null);

  const runId = start?.runId ?? '';
  const minigameId = start?.minigameId ?? '';

  // Load the minigame chunk; tell the host we will play (players only, once per run).
  useEffect(() => {
    if (!minigameId) return;
    let alive = true;
    void loadMinigame(minigameId).then((m) => {
      if (!alive) return;
      setMod(m);
    });
    return () => {
      alive = false;
    };
  }, [minigameId]);

  useEffect(() => {
    if (!mod || !runId || spectator || stage === 'late' || stage === 'done') return;
    if (readySent.has(runId)) return;
    readySent.add(runId);
    store.minigameReady(runId);
  }, [mod, runId, spectator, stage, store]);

  // Intro → play exactly at startAtMs on the server clock (never while paused).
  const prefsRef = useRef({ prefs, roomRelaxed, reducedMotion });
  prefsRef.current = { prefs, roomRelaxed, reducedMotion };
  useEffect(() => {
    if (stage !== 'intro' || !mod || !start || paused) return;
    let timer = 0;
    const check = () => {
      const now = store.now();
      const untilStart = start.startAtMs - now;
      if (untilStart > 0) {
        timer = window.setTimeout(check, Math.min(untilStart, 50));
        return;
      }
      const left = start.startAtMs + start.durationMs - now;
      if (left < MIN_LATE_PLAY_MS) {
        setStage('late');
        return;
      }
      const p = prefsRef.current;
      setPlay({ mode: modeOf(p.prefs, p.roomRelaxed), durationMs: left >= start.durationMs - LATE_START_SLACK_MS ? start.durationMs : Math.round(left), reducedMotion: p.reducedMotion });
      setStage('play');
    };
    check();
    return () => window.clearTimeout(timer);
  }, [stage, mod, start, paused, store]);

  if (!start) return null;

  const outcome = storedOutcome ?? localOutcome;
  const def = getMinigame(start.minigameId);
  const name = t(def.name_key);

  const onResult = (result: MinigameResult, elapsedMs: number, mode: MinigameMode) => {
    const o: MinigameOutcome = {
      success: result.success,
      perfect: result.perfect && result.success,
      score: Math.min(1, Math.max(0, result.score)),
      value: result.value ?? null,
      elapsedMs,
      mode,
    };
    setLocalOutcome(o);
    setStage('done');
    // Spectators play for fun and report nothing (protocol `mg.start`).
    if (!spectator) store.minigameResult(start.runId, o);
  };

  if (summary) {
    return <ResultView name={name} summary={summary} outcome={outcome} onContinue={() => store.dismissMinigame(start.runId)} />;
  }

  if (mod === null) {
    return <WaitView name={name} icon="eye" title={t('ui.mg.sitout.title')} body={t('ui.mg.sitout.body')} testId="mg-sitout" />;
  }

  if (stage === 'late') {
    return <WaitView name={name} icon="clock" title={t('ui.mg.late.title')} body={t('ui.mg.late.body')} testId="mg-late" />;
  }

  if (stage === 'done' && outcome) {
    return <OwnResultView name={name} outcome={outcome} />;
  }

  if (stage === 'play' && mod && play) {
    const params: MgMap = runParams(start, meId, store.getState().room?.players ?? [], prefs.holdToToggle ? { hold_to_toggle: true } : {});
    return (
      <PlayStage
        name={name}
        mod={mod}
        start={start}
        params={params}
        mode={play.mode}
        durationMs={play.durationMs}
        reducedMotion={play.reducedMotion}
        paused={paused}
        reportProgress={(p) => {
          if (!spectator) store.minigameProgress(start.runId, p);
        }}
        coop={spectator || start.type === 'PARALLEL_SOLO' ? null : coopChannel(store, start.runId)}
        onResult={onResult}
      />
    );
  }

  return (
    <IntroView
      name={name}
      instruction={t(def.how_to_play_key)}
      success={def.success_key && t.has(def.success_key) ? t(def.success_key) : null}
      start={start}
      mod={mod ?? null}
      paused={paused}
      reducedMotion={reducedMotion}
      mode={modeOf(prefs, roomRelaxed)}
      roomRelaxed={roomRelaxed}
    />
  );
}

// ───────────────────────── intro: instruction, demo, countdown ─────────────────────────

function baseEnv(start: MgStartPayload, mode: MinigameMode, durationMs: number, reducedMotion: boolean): MinigameEnv {
  return {
    mode,
    assistLevel: start.assistLevel,
    durationMs,
    reducedMotion,
    t: translate,
    haptic: vibrate,
    reportProgress: () => undefined,
  };
}

function IntroView(props: {
  name: string;
  instruction: string;
  success: string | null;
  start: MgStartPayload;
  mod: MinigameModule | null;
  paused: boolean;
  reducedMotion: boolean;
  mode: MinigameMode;
  roomRelaxed: boolean;
}) {
  const { name, instruction, success, start, mod, paused, reducedMotion, mode, roomRelaxed } = props;
  const t = useT();
  const store = useStore();
  const prefs = useSel((s) => s.prefs);
  const now = useServerNow(10);
  const demoRef = useRef<HTMLDivElement>(null);

  // The looping demo (design 10.1 rule 4).
  useEffect(() => {
    const root = demoRef.current;
    if (!mod || !root) return;
    const demo = mod.createDemo(root, baseEnv(start, 'STANDARD', start.durationMs, reducedMotion));
    return () => demo.destroy();
  }, [mod, start, reducedMotion]);

  const leftMs = start.startAtMs - now;
  const secs = Math.max(0, Math.ceil(leftMs / 1000));
  const durationS = Math.round(start.durationMs / 1000);

  return (
    <div className="screen mg" data-testid="mg-intro">
      <div className="screen__scroll mg-intro">
        <div className="mg-intro__head">
          <span className="eyebrow">
            {t('ui.mg.eyebrow')}
            {start.flightPhase ? ` · ${start.flightPhase}` : ''}
          </span>
          <span className="mg-intro__time num">
            <Icon name="clock" size="0.95em" />
            {fmt(durationS, 0)} s
          </span>
        </div>
        <h1 className="title">{name}</h1>
        <p className="mg-intro__how">{instruction}</p>

        <div className="mg-demo">
          <div className="mg-demo__stage" ref={demoRef} />
          <span className="mg-demo__tag">{t('ui.mg.demo')}</span>
          {!mod && (
            <div className="mg-demo__loading">
              <span className="spinner" aria-hidden="true" />
              <span>{t('ui.mg.loading')}</span>
            </div>
          )}
        </div>
        {success && (
          <p className="mg-intro__goal">
            <Icon name="target" size="1.1em" />
            <span>{success}</span>
          </p>
        )}

        <div className="panel panel--flat mg-modes">
          <div className="mg-modes__head">
            <span className="eyebrow eyebrow--dim">{t('ui.mg.modes.title')}</span>
            <Chip tone={mode === 'STANDARD' ? 'neutral' : 'accent'} icon={mode === 'STANDARD' ? 'gauge' : mode === 'RELAXED' ? 'scale' : 'hand'}>
              {t(`ui.mg.mode.${mode}`)}
            </Chip>
          </div>
          {roomRelaxed ? (
            <div className="mg-modes__locked">
              <Icon name="lock" size="1.1em" />
              <span>{t('ui.mg.modes.relaxed_room')}</span>
            </div>
          ) : (
            <Switch
              checked={prefs.relaxed}
              onChange={(v) => store.setPrefs({ relaxed: v })}
              title={t('ui.mg.modes.relaxed')}
              description={t('ui.mg.modes.relaxed_desc')}
              testId="mg-relaxed"
            />
          )}
          <Switch
            checked={prefs.oneButton}
            onChange={(v) => store.setPrefs({ oneButton: v })}
            title={t('ui.mg.modes.one_button')}
            description={t('ui.mg.modes.one_button_desc')}
            testId="mg-one-button"
          />
        </div>
      </div>
      {/* Outside the scroll area: the countdown stays on screen at any text size. */}
      <div className="mg-count" role="timer" aria-live="off" aria-label={paused ? t('ui.mg.paused') : t('ui.mg.starts_in_aria', { n: secs })}>
        <span className="mg-count__label">{paused ? t('ui.mg.paused') : secs > 0 ? t('ui.mg.starts_in') : t('ui.mg.get_ready')}</span>
        <span className="mg-count__ring">
          <span className="mg-count__num num" key={paused ? 'p' : secs}>
            {paused ? <Icon name="pause" size="0.7em" /> : secs > 0 ? fmt(secs, 0) : <Icon name="play" size="0.6em" filled />}
          </span>
          {secs > 0 && !paused && <span className="mg-count__unit">s</span>}
        </span>
      </div>
    </div>
  );
}

// ───────────────────────── play ─────────────────────────

function PlayStage(props: {
  name: string;
  mod: MinigameModule;
  start: MgStartPayload;
  params: MgMap;
  mode: MinigameMode;
  durationMs: number;
  reducedMotion: boolean;
  paused: boolean;
  reportProgress: (p: number) => void;
  /** Shared-state channel for cooperative runs; null for PARALLEL_SOLO runs and spectators. */
  coop: MinigameCoop | null;
  onResult: (r: MinigameResult, elapsedMs: number, mode: MinigameMode) => void;
}) {
  const { name, mod, start, mode, durationMs, reducedMotion, paused } = props;
  const t = useT();
  const stageRef = useRef<HTMLDivElement>(null);
  const instRef = useRef<MinigameInstance | null>(null);
  const [leftMs, setLeftMs] = useState(durationMs);

  // Latest callbacks and flags without restarting the run.
  const live = useRef(props);
  live.current = props;
  const pausedRef = useRef(paused);
  pausedRef.current = paused;

  useEffect(() => {
    const root = stageRef.current;
    if (!root) return;
    let activeMs = 0;
    let last = performance.now();
    let lastProgressAt = 0;
    let reported = false;
    const tick = () => {
      const now = performance.now();
      if (!pausedRef.current) activeMs += now - last;
      last = now;
      setLeftMs(Math.max(0, durationMs - activeMs));
    };
    const timer = window.setInterval(tick, 100);

    const env: MinigameEnv = {
      ...baseEnv(start, mode, durationMs, reducedMotion),
      reportProgress: (p) => {
        const now = performance.now();
        if (now - lastProgressAt < PROGRESS_GAP_MS) return;
        lastProgressAt = now;
        live.current.reportProgress(p);
      },
      coop: live.current.coop ?? undefined,
    };
    const inst = mod.create(root, env);
    instRef.current = inst;
    inst.onResult((r) => {
      if (reported) return;
      reported = true;
      tick();
      live.current.onResult(r, Math.min(durationMs, Math.round(activeMs)), mode);
    });
    // Same seed and parameters on every phone (protocol `mg.start`).
    inst.start(live.current.params, start.seed);
    if (pausedRef.current) inst.pause();

    return () => {
      window.clearInterval(timer);
      instRef.current = null;
      inst.destroy();
    };
    // The run is created once per mount; `key` on the parent changes with the run id.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const inst = instRef.current;
    if (!inst) return;
    if (paused) inst.pause();
    else inst.resume();
  }, [paused]);

  const secs = Math.ceil(leftMs / 1000);
  const frac = Math.min(1, Math.max(0, leftMs / durationMs));

  return (
    <div className="screen mg mg-play" data-testid="mg-play" data-mode={mode}>
      <div className="mg-play__head">
        <span className="mg-play__name">{name}</span>
        {mode !== 'STANDARD' && (
          <Chip tone="accent" icon={mode === 'RELAXED' ? 'scale' : 'hand'}>
            {t(`ui.mg.mode.${mode}`)}
          </Chip>
        )}
        <span className="spacer" />
        <span className={`mg-play__left num ${secs <= 5 ? 'mg-play__left--low' : ''}`} role="timer" aria-label={t('ui.mg.time_left_aria', { n: secs })}>
          {paused ? <Icon name="pause" size="0.9em" /> : <Icon name="clock" size="0.9em" />}
          {fmt(secs, 0)} s
        </span>
      </div>
      <div className="timerbar mg-play__bar" aria-hidden="true">
        <div className="timerbar__fill" style={{ transform: `scaleX(${frac})` }} />
      </div>
      <div className="mg-stage" ref={stageRef} />
    </div>
  );
}

// ───────────────────────── waiting states ─────────────────────────

function WaitingLine() {
  const t = useT();
  return (
    <div className="mg-waitline" role="status">
      <span className="spinner" aria-hidden="true" />
      <span>{t('ui.mg.waiting')}</span>
    </div>
  );
}

function WaitView({ name, icon, title, body, testId }: { name: string; icon: IconName; title: string; body: string; testId: string }) {
  return (
    <div className="screen mg" data-testid={testId}>
      <div className="screen__scroll screen__scroll--center mg-wait">
        <span className="eyebrow">{name}</span>
        <span className="mg-badge mg-badge--neutral">
          <Icon name={icon} size="2.6rem" />
        </span>
        <h1 className="title center">{title}</h1>
        <p className="lede center">{body}</p>
        <WaitingLine />
      </div>
    </div>
  );
}

function ScoreMeter({ score }: { score: number }) {
  const t = useT();
  const pct = Math.floor(score * 100 + 1e-9);
  return (
    <div className="mg-score">
      <div className="mg-score__row">
        <span className="mg-score__k">{t('ui.mg.own.score')}</span>
        <span className="mg-score__v num">
          {fmt(pct, 0)}
          <span className="unit">%</span>
        </span>
      </div>
      <div className="bar" role="meter" aria-label={t('ui.mg.own.score')} aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
        <div className="bar__fill" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function OwnResultView({ name, outcome }: { name: string; outcome: MinigameOutcome }) {
  const t = useT();
  const tone = outcome.success ? 'good' : 'neutral';
  return (
    <div className="screen mg" data-testid="mg-own-result">
      <div className="screen__scroll screen__scroll--center mg-wait">
        <span className="eyebrow">{name}</span>
        <span className={`mg-badge mg-badge--${tone}`}>
          <Icon name={outcome.perfect ? 'sparkle' : outcome.success ? 'check' : 'rocket'} size="2.8rem" strokeWidth={outcome.success && !outcome.perfect ? 2.6 : 2} />
        </span>
        <h1 className="title title--lg center">{outcome.perfect ? t('ui.mg.own.perfect') : outcome.success ? t('ui.mg.own.success') : t('ui.mg.own.miss')}</h1>
        <p className="lede center">{outcome.success ? t('ui.mg.own.success_body') : t('ui.mg.own.miss_body')}</p>
        <div className="panel mg-own">
          <ScoreMeter score={outcome.score} />
          {outcome.mode !== 'STANDARD' && (
            <div className="row">
              <Chip tone="accent" icon={outcome.mode === 'RELAXED' ? 'scale' : 'hand'}>
                {t(`ui.mg.mode.${outcome.mode}`)}
              </Chip>
            </div>
          )}
        </div>
        <WaitingLine />
      </div>
    </div>
  );
}

// ───────────────────────── team result: tier, boosts, fact ─────────────────────────

const TIER_ICON: Record<Tier, IconName> = { NONE: 'rocket', BRONZE: 'medal', SILVER: 'medal', GOLD: 'trophy', PLATINUM: 'trophy' };
/** Stars under the emblem: the tier is readable without colour. */
const TIER_PIPS: Record<Tier, number> = { NONE: 0, BRONZE: 1, SILVER: 2, GOLD: 3, PLATINUM: 4 };

function TierEmblem({ tier }: { tier: Tier }) {
  const t = useT();
  const key = tier.toLowerCase();
  const word = tier === 'NONE' ? t('ui.mg.tier.none') : t(`tier.${key}.name`);
  return (
    <div className={`mg-tier mg-tier--${key}`} role="img" aria-label={t('ui.mg.tier.aria', { tier: word })}>
      {(tier === 'GOLD' || tier === 'PLATINUM') && <span className="mg-tier__rays" aria-hidden="true" />}
      <span className="mg-tier__medal" aria-hidden="true">
        <svg viewBox="0 0 120 120" className="mg-tier__shape">
          <path d="M60 6l46.800 27v54L60 114 13.200 87V33z" />
          <path className="mg-tier__inner" d="M60 17l37.200 21.500v43L60 103 22.800 81.500v-43z" />
        </svg>
        <Icon name={TIER_ICON[tier]} size="3rem" className="mg-tier__icon" />
        {tier === 'PLATINUM' && <Icon name="sparkle" size="1.4rem" className="mg-tier__spark" />}
      </span>
      <span className="mg-tier__word" aria-hidden="true">
        {word}
      </span>
      <span className="mg-tier__pips" aria-hidden="true">
        {[0, 1, 2, 3].map((i) => (
          <Icon key={i} name="star" size="1.05rem" filled={i < TIER_PIPS[tier]} className={i < TIER_PIPS[tier] ? 'mg-pip mg-pip--on' : 'mg-pip'} />
        ))}
      </span>
    </div>
  );
}

function BoostRow({ grant }: { grant: BoostGrant }) {
  const t = useT();
  return (
    <li className="mg-reward">
      <span className="mg-reward__icon">
        <Icon name={grant.boost === 'RELIABILITY_SHIELD' ? 'shield' : 'bolt'} size="1.2rem" />
      </span>
      <span className="grow">
        <span className="mg-reward__name">{t(`boost.${grant.boost.toLowerCase()}.name`)}</span>
        {grant.capped && <span className="mg-reward__note">{t('ui.mg.result.capped')}</span>}
      </span>
      <span className="mg-reward__amount num">{fmtBoost(grant.amount, grant.unit)}</span>
    </li>
  );
}

function ResultView({ name, summary, outcome, onContinue }: { name: string; summary: MgSummaryPayload; outcome: MinigameOutcome | null; onContinue: () => void }) {
  const t = useT();
  const tier = summary.tier;
  const fact = useMemo(() => getFact(summary.factId), [summary.factId]);
  const factText = fact && t.has(fact.text_key) ? t(fact.text_key) : null;
  const dots = Math.min(summary.active, 10);
  const headlineKey = `ui.mg.result.headline.${tier}`;

  return (
    <div className="screen mg" data-testid="mg-result" data-tier={tier}>
      <div className="screen__scroll mg-result">
        <span className="eyebrow center">{name}</span>
        <TierEmblem tier={tier} />
        <h1 className="title center mg-result__headline">{t(headlineKey)}</h1>
        {tier === 'NONE' && (
          <p className="lede center">{summary.sparkle ? t('ui.mg.result.sparkle') : t('ui.mg.result.no_boost')}</p>
        )}

        {summary.active > 0 && (
          <div className="panel mg-crew">
            <div className="mg-crew__dots" aria-hidden="true">
              {Array.from({ length: dots }, (_, i) => (
                <span key={i} className={`mg-crew__dot ${i < summary.succeeded ? 'mg-crew__dot--on' : ''}`}>
                  {i < summary.succeeded && <Icon name="check" size="0.9rem" strokeWidth={3} />}
                </span>
              ))}
            </div>
            <p className="mg-crew__text">{t('ui.mg.result.made_it', { n: fmt(summary.succeeded, 0), total: fmt(summary.active, 0) })}</p>
            {outcome && (
              <p className="mg-crew__you">
                <Icon name={outcome.success ? 'check' : 'rocket'} size="1.05em" className={outcome.success ? 'tone-good' : 'tone-neutral'} strokeWidth={outcome.success ? 2.8 : 2} />
                <span>
                  {outcome.perfect ? t('ui.mg.result.you_perfect') : outcome.success ? t('ui.mg.result.you_success') : t('ui.mg.result.you_miss')}
                  {' · '}
                  <span className="num">{fmt(Math.floor(outcome.score * 100 + 1e-9), 0)} %</span>
                </span>
              </p>
            )}
          </div>
        )}

        {(summary.boosts.length > 0 || summary.syncDelta > 0 || summary.points > 0) && (
          <div className="panel mg-rewards">
            <span className="eyebrow eyebrow--dim">{t('ui.mg.result.rewards')}</span>
            <ul className="mg-rewards__list">
              {summary.boosts.map((g, i) => (
                <BoostRow key={`${g.boost}-${i}`} grant={g} />
              ))}
              {summary.syncDelta > 0 && (
                <li className="mg-reward">
                  <span className="mg-reward__icon">
                    <Icon name="users" size="1.2rem" />
                  </span>
                  <span className="grow mg-reward__name">{t('ui.mg.result.sync')}</span>
                  <span className="mg-reward__amount num">+{fmt(summary.syncDelta, 0)} %</span>
                </li>
              )}
              {summary.points > 0 && (
                <li className="mg-reward">
                  <span className="mg-reward__icon">
                    <Icon name="star" size="1.2rem" />
                  </span>
                  <span className="grow mg-reward__name">{t('ui.mg.result.points')}</span>
                  <span className="mg-reward__amount num">+{fmt(summary.points, 0)} pts</span>
                </li>
              )}
            </ul>
          </div>
        )}

        {factText && (
          <div className="banner banner--accent mg-fact">
            <Icon name="bulb" size="1.4rem" className="tone-accent" />
            <div className="grow">
              <span className="eyebrow">{t('ui.mg.result.fact')}</span>
              <p>{factText}</p>
            </div>
          </div>
        )}
      </div>
      <div className="actionbar">
        <button type="button" className="btn btn--primary btn--lg btn--block" onClick={onContinue} data-testid="mg-continue">
          {t('ui.common.continue')}
        </button>
      </div>
    </div>
  );
}
