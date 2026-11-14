// MG-13 Ground Station Pass (design section 10.5, T021 step 2).
//
// "A ground station sweeps across the horizon. Keep your antenna reticle on it as it arcs.
// Packets fill your data bar while locked." Success: lock ≥ 75 % of the pass. Fact F09.
//
// Glue only: canvas, input (drag, arrow keys, one button), loop, haptics, ARIA. Rules in
// `model.ts`, drawing in `render.ts`, shared plumbing in `kit.ts`.
import type { MgMap } from '@protocol';
import type { MinigameDemo, MinigameEnv, MinigameInstance, MinigameModule } from '../types';
import { DemoHost, DT_S, isButtonKey, liveRegion, LoopHost, makeCanvas, watchSize } from './kit';
import { Mg13Autopilot, Mg13Sim, resolveConfig } from './model';
import { Mg13View } from './render';

/** Keyboard antenna speed, sky-plot radii per second (game value). */
const KEY_SPEED = 0.9;

function create(root: HTMLElement, env: MinigameEnv): MinigameInstance {
  const canvas = makeCanvas(root);
  canvas.tabIndex = 0;
  canvas.setAttribute('role', 'application');
  canvas.setAttribute('aria-roledescription', env.t('minigame.MG-13.aria.role'));
  const oneButton = env.mode === 'ONE_BUTTON';
  canvas.setAttribute('aria-label', env.t(oneButton ? 'minigame.MG-13.aria.field_one' : 'minigame.MG-13.aria.field'));
  const live = liveRegion(root);

  const runS = env.durationMs / 1000;
  let sim = new Mg13Sim(resolveConfig({}, env.mode, env.assistLevel), 0, runS);
  const view = new Mg13View(canvas, sim, { compact: false, reducedMotion: env.reducedMotion, t: env.t });

  // Input state.
  let dragId: number | null = null;
  let dragX = 0;
  let dragY = 0;
  let aimStartX = 0;
  let aimStartY = 0;
  let keyX = 0;
  let keyY = 0;
  const keys = new Set<string>();
  let auto: Mg13Autopilot | null = null;
  let lastLocked = false;
  let lastProgressS = 0;

  const host = new LoopHost<{ done: boolean; tick(): void; result(): ReturnType<Mg13Sim['result']> }>(env, {
    begin(params: MgMap, seed: number) {
      sim = new Mg13Sim(resolveConfig(params, env.mode, env.assistLevel), seed, runS);
      view.setSim(sim);
      lastLocked = sim.locked;
      return {
        get done() {
          return sim.done;
        },
        tick() {
          if (auto) auto.apply(sim);
          else if (!sim.config.oneButton && (keyX !== 0 || keyY !== 0)) sim.aim(sim.aimX + keyX * KEY_SPEED * DT_S, sim.aimY + keyY * KEY_SPEED * DT_S);
          sim.tick();
        },
        result: () => sim.result(),
      };
    },
    draw(now, paused) {
      view.draw({ timeMs: now, active: dragId !== null || keys.size > 0, pausedText: paused ? env.t('minigame.MG-13.paused') : null });
    },
    afterSteps() {
      if (sim.locked !== lastLocked) {
        lastLocked = sim.locked;
        host.haptic(sim.locked ? 14 : [30, 40, 30]);
      }
      const t = sim.timeS;
      if (t - lastProgressS >= 0.5) {
        lastProgressS = t;
        env.reportProgress(sim.lockSteps / sim.totalSteps);
      }
      const pct = Math.floor(sim.lockFraction * 100);
      live.say(env.t(sim.locked ? 'minigame.MG-13.aria.locked' : 'minigame.MG-13.aria.lost', { pct }), performance.now());
    },
    onPause() {
      dragId = null;
      keys.clear();
      keyX = 0;
      keyY = 0;
    },
  });

  const playing = () => host.started && !host.finished && !host.paused;

  const onDown = (e: PointerEvent) => {
    if (host.finished) return;
    e.preventDefault();
    canvas.focus({ preventScroll: true });
    if (sim.config.oneButton) {
      if (playing()) {
        sim.press();
        host.haptic(10);
      }
      return;
    }
    dragId = e.pointerId;
    dragX = e.clientX;
    dragY = e.clientY;
    aimStartX = sim.aimX;
    aimStartY = sim.aimY;
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch {
      /* moves still arrive while over the canvas */
    }
  };
  const onMove = (e: PointerEvent) => {
    if (dragId !== e.pointerId || sim.config.oneButton) return;
    e.preventDefault();
    // Relative drag: the finger never covers the reticle; one horizon radius of drag moves
    // the antenna across the whole plot.
    sim.aim(aimStartX + (e.clientX - dragX) / view.R, aimStartY + (e.clientY - dragY) / view.R);
  };
  const onUp = (e: PointerEvent) => {
    if (dragId === e.pointerId) dragId = null;
  };

  const updateKeys = () => {
    keyX = (keys.has('ArrowRight') ? 1 : 0) - (keys.has('ArrowLeft') ? 1 : 0);
    keyY = (keys.has('ArrowDown') ? 1 : 0) - (keys.has('ArrowUp') ? 1 : 0);
  };
  const onKeyDown = (e: KeyboardEvent) => {
    if (host.finished) return;
    if (sim.config.oneButton) {
      if (isButtonKey(e)) {
        e.preventDefault();
        if (!e.repeat && playing()) {
          sim.press();
          host.haptic(10);
        }
      }
      return;
    }
    if (e.key.startsWith('Arrow')) {
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
    /** Test hook (lab `auto=1`): the scripted good player of the model tests takes over. */
    __autoplay(on: boolean) {
      auto = on ? new Mg13Autopilot() : null;
    },
  };
  return instance;
}

function createDemo(root: HTMLElement, env: MinigameEnv): MinigameDemo {
  const canvas = makeCanvas(root);
  canvas.setAttribute('aria-hidden', 'true');
  canvas.style.pointerEvents = 'none';
  // The demo shows the standard drag so the picture matches the instruction line.
  const config = resolveConfig({ max_elevation_deg: 58 }, 'STANDARD', env.assistLevel);
  let sim = new Mg13Sim(config, 13, 20);
  let pilot = new Mg13Autopilot(0.025);
  const view = new Mg13View(canvas, sim, { compact: true, reducedMotion: env.reducedMotion, t: env.t });
  const demo = new DemoHost(
    () => {
      sim = new Mg13Sim(config, 13, 20);
      pilot = new Mg13Autopilot(0.025);
      view.setSim(sim);
    },
    (phase, now) => {
      const wanted = Math.round(phase * sim.totalSteps);
      while (sim.step < wanted) {
        pilot.apply(sim);
        sim.tick();
      }
      // Ghost finger: below and to the right of the reticle, dragging it.
      const fx = view.px(sim.rx) + 26;
      const fy = view.py(sim.ry) + 30;
      view.draw({ timeMs: now, active: true, finger: phase < 1 ? { x: fx, y: fy, pressed: true } : null });
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

const module: MinigameModule = { id: 'MG-13', create, createDemo };

export default module;
