// MG-08 Max Q Throttle Bucket (design section 10.5).
//
// "A dynamic-pressure curve rises. Slide your throttle so the vehicle's stress line stays
// inside a safe band. Too low wastes time against gravity; too high overloads."
// Success: in band at least 85 % of the time. Fact: rockets throttle down near Max Q.
//
// This file is the glue: canvas, input (drag, keyboard, one button), the frame loop and
// haptics. The rules are in `model.ts` (pure, deterministic), the drawing in `render.ts`.
import type { MgMap } from '@protocol';
import type { MinigameDemo, MinigameEnv, MinigameInstance, MinigameModule, MinigameResult } from '../types';
import { autopilotLever, createCurve, FixedStepper, Mg08Sim, resolveConfig, type Mg08Config, type Zone } from './model';
import { Mg08View } from './render';

/** Keyboard step of the lever, fraction of full thrust. */
const KEY_STEP = 0.02;
const KEY_STEP_BIG = 0.1;

function makeCanvas(root: HTMLElement): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.style.display = 'block';
  canvas.style.width = '100%';
  canvas.style.height = '100%';
  canvas.style.touchAction = 'none';
  canvas.style.userSelect = 'none';
  canvas.style.setProperty('-webkit-user-select', 'none');
  canvas.style.setProperty('-webkit-touch-callout', 'none');
  root.appendChild(canvas);
  return canvas;
}

function watchSize(el: HTMLElement, cb: () => void): () => void {
  if (typeof ResizeObserver === 'function') {
    const ro = new ResizeObserver(cb);
    ro.observe(el);
    return () => ro.disconnect();
  }
  window.addEventListener('resize', cb);
  return () => window.removeEventListener('resize', cb);
}

function create(root: HTMLElement, env: MinigameEnv): MinigameInstance {
  const canvas = makeCanvas(root);
  canvas.tabIndex = 0;
  canvas.setAttribute('role', 'slider');
  canvas.setAttribute('aria-orientation', 'vertical');
  canvas.setAttribute('aria-label', env.t('minigame.MG-08.aria.lever'));

  let config: Mg08Config = resolveConfig({}, env.mode, env.assistLevel);
  let sim = new Mg08Sim(config, createCurve(config, 0, env.durationMs / 1000));
  const view = new Mg08View(canvas, sim, { compact: false, reducedMotion: env.reducedMotion, t: env.t });
  const stepper = new FixedStepper();

  let started = false;
  let paused = false;
  let destroyed = false;
  let finished = false;
  let resultCb: ((r: MinigameResult) => void) | null = null;
  let pending: MinigameResult | null = null;

  // Input state. `lever` is the lever position the player asks for; `pressed` the one button.
  let lever = 1;
  let pressed = false;
  let dragId: number | null = null;
  let dragStartY = 0;
  let dragStartLever = 1;
  let keyHeld = false;

  let lastFrame = 0;
  let raf = 0;
  let lastZone: Zone = 0;
  let lastRumbleS = -1;
  let lastProgressS = 0;
  let lastAriaS = -1;
  let ariaPct = -1;

  const clampLever = (v: number) => Math.min(1, Math.max(config.throttleMin, v));

  const finish = () => {
    if (finished) return;
    finished = true;
    const s = sim.score();
    const result: MinigameResult = { success: s.success, perfect: s.perfect, score: s.score };
    if (resultCb) resultCb(result);
    else pending = result;
  };

  const updateAria = () => {
    canvas.setAttribute('aria-valuemin', String(Math.round(config.throttleMin * 100)));
    canvas.setAttribute('aria-valuemax', '100');
    ariaPct = Math.round(sim.target * 100);
    canvas.setAttribute('aria-valuenow', String(ariaPct));
    const zoneKey = sim.zone === 0 ? 'minigame.MG-08.status.in_band' : sim.zone === 1 ? 'minigame.MG-08.status.over' : 'minigame.MG-08.status.under';
    canvas.setAttribute('aria-valuetext', `${Math.round(sim.target * 100)} %, ${env.t(zoneKey)}`);
  };

  /** Runs the simulation steps that are due. Called from the frame loop and a slow timer. */
  const advance = (now: number) => {
    if (!started || paused || finished) {
      lastFrame = now;
      return;
    }
    const dt = now - lastFrame;
    lastFrame = now;
    for (let n = stepper.advance(dt); n > 0 && !sim.done; n--) {
      if (config.oneButton) sim.stepButton(pressed);
      else sim.stepLever(lever);
    }
    if (config.oneButton) lever = sim.target;

    const t = sim.timeS;
    // Haptics: a rumble while out of the band, a tick on the way back in.
    if (sim.zone !== lastZone) {
      if (sim.zone === 0) env.haptic(12);
      else {
        env.haptic([40, 30, 40]);
        lastRumbleS = t;
      }
      lastZone = sim.zone;
      updateAria();
    } else if (sim.zone !== 0 && t - lastRumbleS > 0.45) {
      env.haptic(sim.zone === 1 ? 35 : 20);
      lastRumbleS = t;
    }
    if (t - lastProgressS >= 0.5) {
      lastProgressS = t;
      env.reportProgress(sim.inBandFraction);
    }
    // Screen-reader read-back: when the setting changes, at most ten times a second.
    if (t - lastAriaS >= 0.1 && Math.round(sim.target * 100) !== ariaPct) {
      lastAriaS = t;
      updateAria();
    }
    if (sim.done) finish();
  };

  const frame = () => {
    if (destroyed) return;
    const now = performance.now();
    advance(now);
    view.draw({ timeMs: now, active: dragId !== null || pressed || keyHeld, pausedText: paused ? env.t('minigame.MG-08.paused') : null });
    raf = requestAnimationFrame(frame);
  };

  // Keeps the run on the clock when the browser stops animation frames (tab in background).
  const backup = window.setInterval(() => advance(performance.now()), 250);

  // ── pointer: drag anywhere, relative to where the finger went down ──
  const onDown = (e: PointerEvent) => {
    if (finished) return;
    e.preventDefault();
    canvas.focus({ preventScroll: true });
    if (config.oneButton) {
      pressed = true;
      dragId = e.pointerId;
    } else {
      dragId = e.pointerId;
      dragStartY = e.clientY;
      dragStartLever = lever;
    }
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch {
      /* not capturable: moves still arrive while over the canvas */
    }
  };
  const onMove = (e: PointerEvent) => {
    if (dragId !== e.pointerId || config.oneButton) return;
    e.preventDefault();
    const range = 1 - config.throttleMin;
    lever = clampLever(dragStartLever - ((e.clientY - dragStartY) / view.trackLengthPx) * range);
    // Re-anchor at the end stops so the lever answers at once when the finger turns back.
    if (lever === 1 || lever === config.throttleMin) {
      dragStartY = e.clientY;
      dragStartLever = lever;
    }
  };
  const onUp = (e: PointerEvent) => {
    if (dragId !== e.pointerId) return;
    dragId = null;
    pressed = false;
  };

  // ── keyboard: arrows move the lever; Space or Enter is the one button ──
  const onKeyDown = (e: KeyboardEvent) => {
    if (finished) return;
    if (config.oneButton) {
      if (e.key === ' ' || e.key === 'Enter' || e.key === 'ArrowUp') {
        e.preventDefault();
        pressed = true;
        keyHeld = true;
      }
      return;
    }
    let delta = 0;
    if (e.key === 'ArrowUp' || e.key === 'ArrowRight') delta = KEY_STEP;
    else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') delta = -KEY_STEP;
    else if (e.key === 'PageUp') delta = KEY_STEP_BIG;
    else if (e.key === 'PageDown') delta = -KEY_STEP_BIG;
    else if (e.key === 'Home') delta = -1;
    else if (e.key === 'End') delta = 1;
    else return;
    e.preventDefault();
    keyHeld = true;
    lever = clampLever(lever + delta);
  };
  const onKeyUp = (e: KeyboardEvent) => {
    keyHeld = false;
    if (config.oneButton && (e.key === ' ' || e.key === 'Enter' || e.key === 'ArrowUp')) pressed = false;
  };
  const onBlur = () => {
    keyHeld = false;
    if (dragId === null) pressed = false;
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
    if (!destroyed) view.resize();
  });

  lastFrame = performance.now();
  raf = requestAnimationFrame(frame);

  return {
    start(params: MgMap, seed: number) {
      if (started || destroyed) return;
      config = resolveConfig(params, env.mode, env.assistLevel);
      sim = new Mg08Sim(config, createCurve(config, seed >>> 0, env.durationMs / 1000));
      view.setSim(sim);
      lever = sim.target;
      lastZone = sim.zone;
      started = true;
      lastFrame = performance.now();
      updateAria();
      try {
        canvas.focus({ preventScroll: true });
      } catch {
        /* focus is a convenience for keyboard players only */
      }
    },
    onResult(cb) {
      resultCb = cb;
      if (pending) {
        const r = pending;
        pending = null;
        cb(r);
      }
    },
    pause() {
      paused = true;
      // Let go of everything so nothing is "held" through the pause.
      dragId = null;
      pressed = false;
      keyHeld = false;
    },
    resume() {
      paused = false;
      lastFrame = performance.now();
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      cancelAnimationFrame(raf);
      window.clearInterval(backup);
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
    },
  };
}

/** How long one demo loop lasts and how long it rests on its last frame, ms. */
const DEMO_LOOP_MS = 3000;
const DEMO_HOLD_MS = 500;
/** Play time shown by the demo, s (a whole 20 s run squeezed into the loop). */
const DEMO_RUN_S = 20;

function createDemo(root: HTMLElement, env: MinigameEnv): MinigameDemo {
  const canvas = makeCanvas(root);
  canvas.setAttribute('aria-hidden', 'true');
  canvas.style.pointerEvents = 'none';

  // The demo always shows the standard lever so the picture matches the instruction line.
  const config = resolveConfig({}, 'STANDARD', env.assistLevel);
  const newSim = () => new Mg08Sim(config, createCurve(config, 8, DEMO_RUN_S));
  let sim = newSim();
  const view = new Mg08View(canvas, sim, { compact: true, reducedMotion: env.reducedMotion, t: env.t });
  let destroyed = false;
  let raf = 0;
  let loopStart = performance.now();

  const frame = () => {
    if (destroyed) return;
    const now = performance.now();
    let phase = now - loopStart;
    if (phase > DEMO_LOOP_MS + DEMO_HOLD_MS) {
      loopStart = now;
      phase = 0;
      sim = newSim();
      view.setSim(sim);
    }
    const wanted = Math.min(sim.totalSteps, Math.round((phase / DEMO_LOOP_MS) * sim.totalSteps));
    while (sim.step < wanted) {
      // A steady hand with a little human wobble.
      sim.stepLever(autopilotLever(config, sim.curve, sim.timeS, 0.1) + 0.012 * Math.sin(sim.step / 37));
    }
    view.draw({ timeMs: now, active: true, finger: true });
    raf = requestAnimationFrame(frame);
  };
  const unwatch = watchSize(root, () => {
    if (!destroyed) view.resize();
  });
  raf = requestAnimationFrame(frame);

  return {
    destroy() {
      if (destroyed) return;
      destroyed = true;
      cancelAnimationFrame(raf);
      unwatch();
      canvas.remove();
    },
  };
}

const module: MinigameModule = { id: 'MG-08', create, createDemo };

export default module;
