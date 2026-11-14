// MG-21 Science Capture (design section 10.5, T021 step 4). Parallel solo, 20 s, C1.
//
// "The ground track scrolls over Earth. Frame and snap targets (hurricane, wildfire, glacier,
// city lights, algae bloom) as they pass, avoiding clouds unless you chose radar."
// Success: ≥ 3 good captures. Fact F16.
//
// Glue only: canvas, input (drag across to point, tap / shutter / Space to snap; one button),
// loop, haptics, ARIA.
import type { MgMap } from '@protocol';
import type { MinigameDemo, MinigameEnv, MinigameInstance, MinigameModule } from '../types';
import { DemoHost, DT_S, isButtonKey, liveRegion, LoopHost, makeCanvas, watchSize } from '../MG-13/kit';
import { Mg21Autopilot, Mg21Sim, resolveConfig } from './model';
import { Mg21View } from './render';

/** Keyboard pointing speed, swath half-widths per second (game value). */
const KEY_SPEED = 1.6;
/** A touch that moves less than this and lifts within TAP_MS is a snap, not a drag. */
const TAP_PX = 10;
const TAP_MS = 350;

function create(root: HTMLElement, env: MinigameEnv): MinigameInstance {
  const canvas = makeCanvas(root);
  canvas.tabIndex = 0;
  canvas.setAttribute('role', 'application');
  canvas.setAttribute('aria-roledescription', env.t('minigame.MG-21.aria.role'));
  const oneButton = env.mode === 'ONE_BUTTON';
  canvas.setAttribute('aria-label', env.t(oneButton ? 'minigame.MG-21.aria.field_one' : 'minigame.MG-21.aria.field'));
  const live = liveRegion(root, 900);
  const runS = env.durationMs / 1000;

  let sim = new Mg21Sim(resolveConfig({}, env.mode, env.assistLevel), 0, runS);
  const view = new Mg21View(canvas, sim, { compact: false, reducedMotion: env.reducedMotion, t: env.t });

  let dragId: number | null = null;
  let downX = 0;
  let downY = 0;
  let downT = 0;
  let moved = false;
  let aimStart = 0;
  let keyDir = 0;
  const keys = new Set<string>();
  let auto: Mg21Autopilot | null = null;
  let shotsSeen = 0;
  let lastOutcome = '';
  let lastProgressS = 0;

  const host = new LoopHost<{ done: boolean; tick(): void; result(): ReturnType<Mg21Sim['result']> }>(env, {
    begin(params: MgMap, seed: number) {
      sim = new Mg21Sim(resolveConfig(params, env.mode, env.assistLevel), seed, runS);
      view.setSim(sim);
      return {
        get done() {
          return sim.done;
        },
        tick() {
          if (auto) auto.apply(sim);
          else if (keyDir !== 0 && !sim.config.oneButton) sim.aim(sim.aimX + keyDir * KEY_SPEED * DT_S);
          sim.tick();
        },
        result: () => sim.result(),
      };
    },
    draw(now, paused) {
      view.draw({ timeMs: now, active: dragId !== null || keys.size > 0, pausedText: paused ? env.t('minigame.MG-21.paused') : null });
    },
    afterSteps() {
      // One haptic per shot: a click for a good capture, a dull double for a wasted one.
      while (shotsSeen < sim.shots.length) {
        const shot = sim.shots[shotsSeen++]!;
        host.haptic(shot.outcome === 'good' ? [18, 30, 18] : 45);
        const name = shot.target >= 0 ? env.t(`minigame.MG-21.target.${sim.scene.targets[shot.target]!.type}`) : '';
        live.say(env.t(`minigame.MG-21.shot.${shot.outcome}`, { target: name }), performance.now(), true);
      }
      const w = sim.wouldGet().outcome;
      if (w !== lastOutcome) {
        lastOutcome = w;
        if (w === 'good') live.say(env.t('minigame.MG-21.status.snap'), performance.now());
      }
      const t = sim.timeS;
      if (t - lastProgressS >= 0.5) {
        lastProgressS = t;
        env.reportProgress(Math.min(1, sim.good / sim.config.goodMin));
      }
    },
    onPause() {
      dragId = null;
      keys.clear();
      keyDir = 0;
    },
  });

  const playing = () => host.started && !host.finished && !host.paused;
  const snap = () => {
    if (!playing()) return;
    sim.snap();
  };
  const local = (e: PointerEvent) => {
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const onDown = (e: PointerEvent) => {
    if (host.finished) return;
    e.preventDefault();
    canvas.focus({ preventScroll: true });
    if (sim.config.oneButton) {
      snap();
      return;
    }
    const p = local(e);
    const sh = view.shutter;
    if (Math.hypot(p.x - sh.x, p.y - sh.y) <= sh.r + 8) {
      snap();
      return;
    }
    dragId = e.pointerId;
    downX = e.clientX;
    downY = e.clientY;
    downT = performance.now();
    moved = false;
    aimStart = sim.aimX;
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch {
      /* moves still arrive while over the canvas */
    }
  };
  const onMove = (e: PointerEvent) => {
    if (dragId !== e.pointerId) return;
    e.preventDefault();
    const dx = e.clientX - downX;
    if (!moved && Math.hypot(dx, e.clientY - downY) > TAP_PX) moved = true;
    if (moved) sim.aim(aimStart + dx / view.k);
  };
  const onUp = (e: PointerEvent) => {
    if (dragId !== e.pointerId) return;
    dragId = null;
    if (!moved && performance.now() - downT <= TAP_MS && e.type === 'pointerup') snap();
  };
  const updateKeys = () => {
    keyDir = (keys.has('ArrowRight') ? 1 : 0) - (keys.has('ArrowLeft') ? 1 : 0);
  };
  const onKeyDown = (e: KeyboardEvent) => {
    if (host.finished) return;
    if (isButtonKey(e)) {
      e.preventDefault();
      if (!e.repeat) snap();
      return;
    }
    if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && !sim.config.oneButton) {
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
    __autoplay(on: boolean) {
      auto = on ? new Mg21Autopilot() : null;
    },
  };
  return instance;
}

function createDemo(root: HTMLElement, env: MinigameEnv): MinigameDemo {
  const canvas = makeCanvas(root);
  canvas.setAttribute('aria-hidden', 'true');
  canvas.style.pointerEvents = 'none';
  // A short slice of a standard run: three targets in the 3 s loop.
  const config = resolveConfig({ target_count: 3, good_captures_min: 3 }, 'STANDARD', env.assistLevel);
  const runS = 3 / 0.75;
  const fresh = () => new Mg21Sim({ ...config, speed: config.speed * 2.2 }, 21, runS * 1.0);
  let sim = fresh();
  let pilot = new Mg21Autopilot();
  const view = new Mg21View(canvas, sim, { compact: true, reducedMotion: env.reducedMotion, t: env.t });
  const demo = new DemoHost(
    () => {
      sim = fresh();
      pilot = new Mg21Autopilot();
      view.setSim(sim);
    },
    (phase, now) => {
      const wanted = Math.round(phase * sim.totalSteps);
      while (sim.step < wanted) {
        pilot.apply(sim);
        sim.tick();
      }
      const last = sim.lastShot;
      const pressed = !!last && sim.step - last.step < 20;
      view.draw({ timeMs: now, active: true, finger: phase < 1 ? { x: view.field.x + view.field.w / 2 + sim.fx * view.k + 16, y: view.frameY + 40, pressed } : null });
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

const module: MinigameModule = { id: 'MG-21', create, createDemo };

export default module;
