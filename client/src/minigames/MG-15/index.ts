// MG-15 Solar Wing Deploy (design section 10.5, T021 step 3). Cooperative split, 20 s.
//
// "Each player releases one hinge in the correct order shown by a diagram; then everyone
// rotates the wing to face the Sun as the spacecraft turns." Success: your hinge released in
// order + Sun-pointing ≥ 80 %. Fact F11.
//
// Glue only: canvas, input (tap / Space to release, circular drag or arrows to turn the wing,
// one button), loop, `env.coop` (teammates' hinges, decoration), haptics, ARIA.
import type { MgMap } from '@protocol';
import type { CoopState, MinigameDemo, MinigameEnv, MinigameInstance, MinigameModule } from '../types';
import { DemoHost, DT_S, isButtonKey, liveRegion, LoopHost, makeCanvas, watchSize, wrapDeg } from '../MG-13/kit';
import { Mg15Autopilot, Mg15Sim, resolveConfig } from './model';
import { Mg15View } from './render';

/** Keyboard wing-drive speed, °/s (game value). */
const KEY_DEG_S = 70;
/** Coop action name: x = [hinge index, play time ms]. */
export const ACTION_HINGE = 'hinge';

/** Teammates' released hinges from the host's shared state (see README "Teams"). */
export function releasedHinges(state: Pick<CoopState, 'shared'>): number[] {
  const out: number[] = [];
  const sh = state.shared;
  for (const key of Object.keys(sh)) {
    const m = /^hinge_(\d+)$/.exec(key);
    const v = sh[key];
    if (m && typeof v === 'number' && v >= 0) out.push(Number(m[1]));
  }
  // The mock room (and simple hosts) only echo the last move.
  if (sh['last_a'] === ACTION_HINGE && Array.isArray(sh['last_x']) && typeof sh['last_x'][0] === 'number') out.push(sh['last_x'][0]);
  return out;
}

function create(root: HTMLElement, env: MinigameEnv): MinigameInstance {
  const canvas = makeCanvas(root);
  canvas.tabIndex = 0;
  canvas.setAttribute('role', 'application');
  canvas.setAttribute('aria-roledescription', env.t('minigame.MG-15.aria.role'));
  const oneButton = env.mode === 'ONE_BUTTON';
  canvas.setAttribute('aria-label', env.t(oneButton ? 'minigame.MG-15.aria.field_one' : 'minigame.MG-15.aria.field'));
  const live = liveRegion(root);
  const runS = env.durationMs / 1000;

  let sim = new Mg15Sim(resolveConfig({}, env.mode, env.assistLevel), 0, runS);
  const view = new Mg15View(canvas, sim, { compact: false, reducedMotion: env.reducedMotion, t: env.t });

  let dragId: number | null = null;
  let lastAng = 0;
  let keyDir = 0;
  const keys = new Set<string>();
  let auto: Mg15Autopilot | null = null;
  let lastState = '';
  let lastPointing = false;
  let lastProgressS = 0;
  let sentRelease = false;
  let unsubscribe: (() => void) | null = null;

  const host = new LoopHost<{ done: boolean; tick(): void; result(): ReturnType<Mg15Sim['result']> }>(env, {
    begin(params: MgMap, seed: number) {
      sim = new Mg15Sim(resolveConfig(params, env.mode, env.assistLevel), seed, runS);
      view.setSim(sim);
      if (env.coop) {
        unsubscribe = env.coop.onState((s) => {
          for (const k of releasedHinges(s)) if (k !== sim.config.myHinge) sim.crewReleased(k);
        });
      }
      return {
        get done() {
          return sim.done;
        },
        tick() {
          if (auto) auto.apply(sim);
          else if (keyDir !== 0 && sim.phase === 2 && !sim.config.oneButton) sim.turn(keyDir * KEY_DEG_S * DT_S);
          sim.tick();
        },
        result: () => sim.result(),
      };
    },
    draw(now, paused) {
      view.draw({ timeMs: now, active: dragId !== null || keys.size > 0, pausedText: paused ? env.t('minigame.MG-15.paused') : null });
    },
    afterSteps() {
      const m = sim.mine;
      const state = `${sim.phase}:${m.state}`;
      if (state !== lastState) {
        lastState = state;
        if (m.state === 'open' && sim.phase === 1) host.haptic([20, 40, 20]);
        else if (m.state === 'done' && sim.phase === 1) host.haptic(30);
        else if (m.state === 'early' || m.state === 'late') host.haptic([60, 50, 60]);
        canvas.setAttribute('aria-description', env.t(view.status()[1]));
      }
      // Tell the host once that this hinge released (teammates draw it).
      if (!sentRelease && m.releasedStep >= 0 && env.coop) {
        sentRelease = true;
        env.coop.send({ a: ACTION_HINGE, x: [m.index, Math.round(m.releasedStep * DT_S * 1000)] });
      }
      if (sim.phase === 2 && sim.pointing !== lastPointing) {
        lastPointing = sim.pointing;
        host.haptic(sim.pointing ? 12 : 25);
      }
      const t = sim.timeS;
      if (t - lastProgressS >= 0.5) {
        lastProgressS = t;
        env.reportProgress(sim.phase === 1 ? (m.state === 'done' ? 0.25 : 0) : 0.25 + 0.75 * (sim.pointSteps / sim.phase2Steps));
      }
      const msg =
        sim.phase === 1
          ? env.t(view.status()[1])
          : env.t(sim.pointing ? 'minigame.MG-15.aria.sun' : 'minigame.MG-15.aria.turn', { deg: Math.round(Math.abs(sim.thetaDeg)), pct: Math.floor(sim.pointingFraction * 100) });
      live.say(msg, performance.now());
    },
    onPause() {
      dragId = null;
      keys.clear();
      keyDir = 0;
    },
  });

  const playing = () => host.started && !host.finished && !host.paused;
  const angleAt = (e: PointerEvent) => {
    const r = canvas.getBoundingClientRect();
    return (Math.atan2(-(e.clientY - r.top - view.dialY), e.clientX - r.left - view.dialX) * 180) / Math.PI;
  };

  const act = () => {
    if (!playing()) return;
    if (sim.phase === 1 || sim.config.oneButton) {
      sim.press();
      host.haptic(10);
    }
  };

  const onDown = (e: PointerEvent) => {
    if (host.finished) return;
    e.preventDefault();
    canvas.focus({ preventScroll: true });
    if (sim.phase === 1 || sim.config.oneButton) {
      act();
      return;
    }
    dragId = e.pointerId;
    lastAng = angleAt(e);
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch {
      /* moves still arrive while over the canvas */
    }
  };
  const onMove = (e: PointerEvent) => {
    if (dragId !== e.pointerId) return;
    e.preventDefault();
    // Circular drag: the wing turns with the finger's angle around the dial (relative).
    const a = angleAt(e);
    if (playing()) sim.turn(wrapDeg(a - lastAng));
    lastAng = a;
  };
  const onUp = (e: PointerEvent) => {
    if (dragId === e.pointerId) dragId = null;
  };
  const updateKeys = () => {
    keyDir = (keys.has('ArrowLeft') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('ArrowRight') || keys.has('ArrowDown') ? 1 : 0);
  };
  const onKeyDown = (e: KeyboardEvent) => {
    if (host.finished) return;
    if (isButtonKey(e)) {
      e.preventDefault();
      if (!e.repeat) act();
      return;
    }
    if (e.key.startsWith('Arrow') && !sim.config.oneButton) {
      e.preventDefault();
      keys.add(e.key);
      updateKeys();
    }
  };
  const onKeyUp = (e: KeyboardEvent) => {
    keys.delete(e.key);
    updateKeys();
  };
  const onBlur = () => {
    keys.clear();
    updateKeys();
  };
  const noMenu = (e: Event) => e.preventDefault();

  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onUp);
  canvas.addEventListener('lostpointercapture', onUp);
  canvas.addEventListener('keydown', onKeyDown);
  canvas.addEventListener('keyup', onKeyUp);
  canvas.addEventListener('blur', onBlur);
  canvas.addEventListener('contextmenu', noMenu);
  const unwatch = watchSize(root, () => {
    if (!host.destroyed) view.resize();
  });

  const instance: MinigameInstance & { __autoplay(on: boolean): void } = {
    start(params, seed) {
      host.start(params, seed);
      try {
        canvas.focus({ preventScroll: true });
      } catch {
        /* keyboard convenience only */
      }
    },
    onResult: (cb) => host.onResult(cb),
    pause: () => host.pause(),
    resume: () => host.resume(),
    destroy() {
      if (host.destroyed) return;
      host.destroy();
      unsubscribe?.();
      unwatch();
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onUp);
      canvas.removeEventListener('lostpointercapture', onUp);
      canvas.removeEventListener('keydown', onKeyDown);
      canvas.removeEventListener('keyup', onKeyUp);
      canvas.removeEventListener('blur', onBlur);
      canvas.removeEventListener('contextmenu', noMenu);
      canvas.remove();
      live.remove();
    },
    __autoplay(on: boolean) {
      auto = on ? new Mg15Autopilot() : null;
    },
  };
  return instance;
}

function createDemo(root: HTMLElement, env: MinigameEnv): MinigameDemo {
  const canvas = makeCanvas(root);
  canvas.setAttribute('aria-hidden', 'true');
  canvas.style.pointerEvents = 'none';
  const config = resolveConfig({ slot: 1, slots: 4 }, 'STANDARD', env.assistLevel);
  let sim = new Mg15Sim(config, 15, 20);
  let pilot = new Mg15Autopilot(2);
  const view = new Mg15View(canvas, sim, { compact: true, reducedMotion: env.reducedMotion, t: env.t });
  let pressedAt = -1e9;
  const demo = new DemoHost(
    () => {
      sim = new Mg15Sim(config, 15, 20);
      pilot = new Mg15Autopilot(2);
      view.setSim(sim);
      pressedAt = -1e9;
    },
    (phase, now) => {
      const wanted = Math.round(phase * sim.totalSteps);
      while (sim.step < wanted) {
        const before = sim.presses;
        pilot.apply(sim);
        sim.tick();
        if (sim.presses > before) pressedAt = sim.step;
      }
      let finger: { x: number; y: number; pressed: boolean } | null = null;
      if (sim.phase === 1) finger = { x: view.dialX + 4, y: view.dialY + 8, pressed: sim.step - pressedAt < 40 };
      else if (phase < 1) {
        const a = ((sim.bodyDeg + sim.driveDeg) * Math.PI) / 180;
        finger = { x: view.dialX + Math.cos(a) * view.dialR * 0.9, y: view.dialY - Math.sin(a) * view.dialR * 0.9, pressed: true };
      }
      view.draw({ timeMs: now, active: true, finger });
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

const module: MinigameModule = { id: 'MG-15', create, createDemo };

export default module;
