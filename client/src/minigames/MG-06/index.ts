// MG-06 Shake Table (design section 10.5, T019 step 5). Cooperative split.
//
// "A payload shakes at rising frequencies. Each player controls one damper slider; keep the
// resonance meter out of the red as frequencies sweep." Success per player: their damper stays
// in the green ≥ 80 % of the time.
//
// Team play: `slot` picks this player's structural mode. With `env.coop` this phone sends its
// damper as `mg.action` `damp` x = [slot, damping ‰] (≤ 5 per second) and reads teammates from
// `mg.state.shared.damp` (number[] by slot, ‰, −1 unknown) or, failing that, from the last move
// (`last_a` = "damp", `last_x`). Teammates only feed the team meter; success is this player's own.
import type { MgMap } from '@protocol';
import type { CoopState, MinigameDemo, MinigameEnv, MinigameInstance, MinigameModule } from '../types';
import { clamp, DemoHost, DT_S, focusQuietly, isButtonKey, listen, liveRegion, LoopHost, makeCanvas, pct, watchSize, type HostedRun } from '../MG-02/kit';
import { Mg06Autopilot, Mg06Sim, modeCount, resolveConfig, ZETA_MAX, type Zone } from './model';
import { Mg06View } from './render';

const K = 'minigame.MG-06.';
/** Keyboard step of the damper, damping ratio. */
const KEY_STEP = 0.01;
const KEY_SPEED = 0.6;

function create(root: HTMLElement, env: MinigameEnv): MinigameInstance {
  const canvas = makeCanvas(root);
  canvas.tabIndex = 0;
  canvas.setAttribute('role', 'slider');
  canvas.setAttribute('aria-orientation', 'vertical');
  canvas.setAttribute('aria-valuemin', '0');
  canvas.setAttribute('aria-valuemax', String(Math.round(ZETA_MAX * 100)));
  const oneButton = env.mode === 'ONE_BUTTON';
  canvas.setAttribute('aria-label', env.t(oneButton ? K + 'aria.field_one' : K + 'aria.field'));
  const live = liveRegion(root, 1500);
  // The playfield's current value (screen readers read it with the field).
  canvas.setAttribute('aria-describedby', live.id);
  const durS = env.durationMs / 1000;

  let sim = new Mg06Sim(resolveConfig({}, env.mode, env.assistLevel, durS), 0);
  const view = new Mg06View(canvas, sim, { compact: false, reducedMotion: env.reducedMotion, t: env.t });
  let auto: Mg06Autopilot | null = null;
  let pressed = false;
  let dragId: number | null = null;
  let dragY = 0;
  let dragZeta = 0;
  let keyDir = 0;
  let lastZone: Zone = 1;
  let lastProgressS = 0;
  let lastSentS = -1;
  let lastSent = -1;
  let teamKnown: boolean[] = [];
  let unsub: (() => void) | null = null;
  const coop = env.coop;

  const onShared = (state: CoopState) => {
    const m = sim.plan.fnHz.length;
    const known = new Array<boolean>(m).fill(false);
    const arr = state.shared['damp'];
    if (Array.isArray(arr)) {
      arr.forEach((v, slot) => {
        if (typeof v === 'number' && v >= 0 && slot !== sim.config.slot) {
          sim.setRemote(slot % m, v / 1000);
          known[slot % m] = true;
        }
      });
    } else if (state.shared['last_a'] === 'damp' && Array.isArray(state.shared['last_x'])) {
      const [slot, v] = state.shared['last_x'] as number[];
      if (typeof slot === 'number' && typeof v === 'number' && slot !== sim.config.slot && v >= 0) {
        sim.setRemote(slot % m, v / 1000);
        teamKnown[slot % m] = true;
      }
      known.forEach((_, i) => (known[i] = !!teamKnown[i]));
    }
    teamKnown = known;
  };

  const host = new LoopHost<HostedRun>(env, {
    begin(params: MgMap, seed: number) {
      sim = new Mg06Sim(resolveConfig(params, env.mode, env.assistLevel, durS), seed);
      view.setSim(sim);
      lastZone = sim.zone;
      teamKnown = new Array<boolean>(modeCount(sim.config)).fill(false);
      if (coop) unsub = coop.onState(onShared);
      return {
        get done() {
          return sim.done;
        },
        tick() {
          let p = pressed;
          if (auto) p = auto.apply(sim);
          else if (!oneButton && keyDir !== 0) sim.setZeta(sim.zeta + keyDir * KEY_SPEED * DT_S);
          sim.tick(p);
        },
        result: () => sim.result(),
      };
    },
    draw(now, paused) {
      view.draw({ timeMs: now, active: dragId !== null || pressed || keyDir !== 0, teamKnown, pausedText: paused ? env.t(K + 'paused') : null });
    },
    afterSteps() {
      if (sim.zone !== lastZone) {
        lastZone = sim.zone;
        host.haptic(sim.zone === 0 ? 12 : sim.zone < 0 ? [40, 30, 40] : 25);
        live.say(env.t(sim.zone === 0 ? K + 'status.green' : sim.zone < 0 ? K + 'status.resonance' : K + 'status.over'), performance.now());
      }
      const v = pct(sim.zeta);
      canvas.setAttribute('aria-valuenow', String(v));
      canvas.setAttribute('aria-valuetext', env.t(K + 'aria.value', { pct: v }));
      if (sim.timeS - lastProgressS >= 0.5) {
        lastProgressS = sim.timeS;
        env.reportProgress(sim.fraction);
      }
      if (coop) {
        const permille = Math.round(sim.zeta * 1000);
        if (sim.timeS - lastSentS >= 0.2 && Math.abs(permille - lastSent) >= 5) {
          lastSentS = sim.timeS;
          lastSent = permille;
          coop.send({ a: 'damp', x: [sim.config.slot, permille] });
        }
      }
    },
    onPause() {
      pressed = false;
      dragId = null;
      keyDir = 0;
    },
  });

  const onDown = (e: PointerEvent) => {
    if (host.finished) return;
    e.preventDefault();
    focusQuietly(canvas);
    if (oneButton) {
      pressed = true;
      dragId = e.pointerId;
    } else {
      dragId = e.pointerId;
      dragY = e.clientY;
      dragZeta = sim.zeta;
    }
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch {
      /* moves still arrive over the canvas */
    }
  };
  const onMove = (e: PointerEvent) => {
    if (dragId !== e.pointerId || oneButton || !host.playing) return;
    e.preventDefault();
    // Relative drag: up raises damping; the slider's length covers the full travel.
    const z = clamp(dragZeta - ((e.clientY - dragY) / view.trackPx) * ZETA_MAX, 0, ZETA_MAX);
    sim.setZeta(z);
    if (z === 0 || z === ZETA_MAX) {
      dragY = e.clientY;
      dragZeta = z;
    }
  };
  const onUp = (e: PointerEvent) => {
    if (dragId !== e.pointerId) return;
    dragId = null;
    pressed = false;
  };
  const onKeyDown = (e: KeyboardEvent) => {
    if (host.finished) return;
    if (oneButton) {
      if (isButtonKey(e)) {
        e.preventDefault();
        pressed = true;
      }
      return;
    }
    if (e.key === 'ArrowUp' || e.key === 'ArrowRight') {
      e.preventDefault();
      keyDir = 1;
      if (!e.repeat) sim.setZeta(sim.zeta + KEY_STEP);
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') {
      e.preventDefault();
      keyDir = -1;
      if (!e.repeat) sim.setZeta(sim.zeta - KEY_STEP);
    } else if (e.key === 'Home') sim.setZeta(0);
    else if (e.key === 'End') sim.setZeta(ZETA_MAX);
  };
  const onKeyUp = (e: KeyboardEvent) => {
    if (oneButton && isButtonKey(e)) pressed = false;
    if (e.key.startsWith('Arrow')) keyDir = 0;
  };
  const onBlur = () => {
    keyDir = 0;
    if (dragId === null) pressed = false;
  };
  const noMenu = (e: Event) => e.preventDefault();

  const unlisten = listen(canvas, {
    pointerdown: onDown as (e: never) => void,
    pointermove: onMove as (e: never) => void,
    pointerup: onUp as (e: never) => void,
    pointercancel: onUp as (e: never) => void,
    lostpointercapture: onUp as (e: never) => void,
    keydown: onKeyDown as (e: never) => void,
    keyup: onKeyUp as (e: never) => void,
    blur: onBlur,
    contextmenu: noMenu as (e: never) => void,
  });
  const unwatch = watchSize(root, () => {
    if (!host.destroyed) view.resize();
  });

  const instance: MinigameInstance & { __autoplay(on: boolean): void } = {
    start(params, seed) {
      host.start(params, seed);
      focusQuietly(canvas);
    },
    onResult: (cb) => host.onResult(cb),
    pause: () => host.pause(),
    resume: () => host.resume(),
    destroy() {
      if (host.destroyed) return;
      host.destroy();
      unsub?.();
      unwatch();
      unlisten();
      canvas.remove();
      live.remove();
    },
    /** Test hook (lab `auto=1`): the scripted good player of the model tests takes over. */
    __autoplay(on: boolean) {
      auto = on ? new Mg06Autopilot() : null;
    },
  };
  return instance;
}

function createDemo(root: HTMLElement, env: MinigameEnv): MinigameDemo {
  const canvas = makeCanvas(root);
  canvas.setAttribute('aria-hidden', 'true');
  canvas.style.pointerEvents = 'none';
  // Standard drag through one resonance: a 30 s run, the 3 s slice around the crossing.
  const config = resolveConfig({ slot: 0, slots: 1 }, 'STANDARD', env.assistLevel, 30);
  const SEED = 3;
  const probe = new Mg06Sim(config, SEED);
  let startStep = 0;
  while (startStep < probe.totalSteps && probe.fHz < probe.plan.fnHz[0]! * 0.62) {
    probe.tick();
    startStep++;
  }
  let sim = new Mg06Sim(config, SEED);
  let pilot = new Mg06Autopilot();
  const view = new Mg06View(canvas, sim, { compact: true, reducedMotion: env.reducedMotion, t: env.t });
  const demo = new DemoHost(
    () => {
      sim = new Mg06Sim(config, SEED);
      pilot = new Mg06Autopilot();
      // Start in the band just before the crossing.
      sim.zeta = 0.06;
      while (sim.step < startStep) sim.tick(pilot.apply(sim));
      view.setSim(sim);
    },
    (phase, now) => {
      const wanted = startStep + Math.round(phase * 3 * 120);
      while (sim.step < wanted) sim.tick(pilot.apply(sim));
      const p = view.thumbPos();
      view.draw({ timeMs: now, active: true, finger: { x: p.x + 8, y: p.y + 22, pressed: true } });
    },
  );
  const unwatch = watchSize(root, () => view.resize());
  return {
    destroy() {
      demo.destroy();
      unwatch();
      canvas.remove();
    },
  };
}

const module: MinigameModule = { id: 'MG-06', create, createDemo };

export default module;
