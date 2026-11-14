// MG-03 Weld Inspector (design section 10.5, T019 step 6).
//
// "Scan X-ray images of tank welds by sweeping a finger; tap the hidden porosity and cracks.
// Avoid false alarms." Success: find ≥ 80 % of defects with ≤ 1 false alarm.
//
// Glue only: canvas, input (sweep, tap, keys, one button), loop, haptics, ARIA.
import type { MgMap } from '@protocol';
import type { MinigameDemo, MinigameEnv, MinigameInstance, MinigameModule } from '../types';
import { DemoHost, DT_S, focusQuietly, isButtonKey, listen, liveRegion, LoopHost, makeCanvas, watchSize, type HostedRun } from '../MG-02/kit';
import { Mg03Autopilot, Mg03Sim, resolveConfig } from './model';
import { Mg03View } from './render';

const K = 'minigame.MG-03.';
/** Keyboard lens speed, film widths per second (game value). */
const KEY_SPEED = 0.55;
/** A press shorter than this and moving less than TAP_PX is a tap (marks), else a sweep. */
const TAP_MS = 350;
const TAP_PX = 12;

function create(root: HTMLElement, env: MinigameEnv): MinigameInstance {
  const canvas = makeCanvas(root);
  canvas.tabIndex = 0;
  canvas.setAttribute('role', 'application');
  canvas.setAttribute('aria-roledescription', env.t(K + 'aria.role'));
  const oneButton = env.mode === 'ONE_BUTTON';
  canvas.setAttribute('aria-label', env.t(oneButton ? K + 'aria.field_one' : K + 'aria.field'));
  const live = liveRegion(root, 400);
  // The playfield's current value (screen readers read it with the field).
  canvas.setAttribute('aria-describedby', live.id);
  const durS = env.durationMs / 1000;

  let sim = new Mg03Sim(resolveConfig({}, env.mode, env.assistLevel, durS), 0);
  const view = new Mg03View(canvas, sim, { compact: false, reducedMotion: env.reducedMotion, t: env.t });
  let auto: Mg03Autopilot | null = null;
  let press: { id: number; x: number; y: number; at: number; moved: boolean } | null = null;
  const keys = new Set<string>();
  let lastMarks = 0;
  let lastProgressS = 0;

  const host = new LoopHost<HostedRun>(env, {
    begin(params: MgMap, seed: number) {
      sim = new Mg03Sim(resolveConfig(params, env.mode, env.assistLevel, durS), seed);
      view.setSim(sim);
      lastMarks = 0;
      return {
        get done() {
          return sim.done;
        },
        tick() {
          if (auto) auto.apply(sim);
          else if (!oneButton && keys.size > 0) {
            const dx = (keys.has('ArrowRight') ? 1 : 0) - (keys.has('ArrowLeft') ? 1 : 0);
            const dy = (keys.has('ArrowDown') ? 1 : 0) - (keys.has('ArrowUp') ? 1 : 0);
            sim.setLens(sim.lensX + dx * KEY_SPEED * DT_S, sim.lensY + dy * KEY_SPEED * DT_S);
          }
          sim.tick();
        },
        result: () => sim.result(),
      };
    },
    draw(now, paused) {
      view.draw({ timeMs: now, active: !!press || keys.size > 0, pausedText: paused ? env.t(K + 'paused') : null });
    },
    afterSteps() {
      if (sim.marks.length !== lastMarks) {
        lastMarks = sim.marks.length;
        const m = sim.marks[sim.marks.length - 1]!;
        host.haptic(m.hit >= 0 ? 14 : [40, 40, 40]);
        live.say(env.t(m.hit >= 0 ? K + 'aria.hit' : K + 'aria.false', { found: sim.foundCount, total: sim.defects.length, alarms: sim.falseAlarms }), performance.now(), true);
      }
      if (sim.timeS - lastProgressS >= 0.5) {
        lastProgressS = sim.timeS;
        env.reportProgress(sim.foundCount / sim.defects.length);
      }
    },
    onPause() {
      press = null;
      keys.clear();
    },
  });

  const local = (e: PointerEvent) => {
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const onDown = (e: PointerEvent) => {
    if (host.finished) return;
    e.preventDefault();
    focusQuietly(canvas);
    if (oneButton) {
      if (host.playing) sim.markLens();
      return;
    }
    const p = local(e);
    press = { id: e.pointerId, x: p.x, y: p.y, at: performance.now(), moved: false };
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch {
      /* moves still arrive over the canvas */
    }
  };
  const onMove = (e: PointerEvent) => {
    if (!press || press.id !== e.pointerId || oneButton || !host.playing) return;
    e.preventDefault();
    const p = local(e);
    if (!press.moved && Math.hypot(p.x - press.x, p.y - press.y) > TAP_PX) press.moved = true;
    if (press.moved) {
      // The lens rides above the finger so the finger never covers what it shows.
      const f = view.toFilm(p.x, p.y - view.lensOffsetPx);
      sim.setLens(f.x, f.y);
    }
  };
  const onUp = (e: PointerEvent) => {
    if (!press || press.id !== e.pointerId) return;
    const p = press;
    press = null;
    if (!p.moved && performance.now() - p.at < TAP_MS && host.playing) {
      const f = view.toFilm(p.x, p.y);
      sim.setLens(f.x, f.y);
      sim.mark(f.x, f.y);
    }
  };
  const onCancel = () => {
    press = null;
  };
  const onKeyDown = (e: KeyboardEvent) => {
    if (host.finished) return;
    if (isButtonKey(e)) {
      e.preventDefault();
      if (!e.repeat && host.playing) sim.markLens();
      return;
    }
    if (!oneButton && e.key.startsWith('Arrow')) {
      e.preventDefault();
      keys.add(e.key);
    }
  };
  const onKeyUp = (e: KeyboardEvent) => {
    keys.delete(e.key);
  };
  const onBlur = () => keys.clear();
  const noMenu = (e: Event) => e.preventDefault();

  const unlisten = listen(canvas, {
    pointerdown: onDown as (e: never) => void,
    pointermove: onMove as (e: never) => void,
    pointerup: onUp as (e: never) => void,
    pointercancel: onCancel,
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
      unwatch();
      unlisten();
      canvas.remove();
      live.remove();
    },
    /** Test hook (lab `auto=1`): the scripted good player of the model tests takes over. */
    __autoplay(on: boolean) {
      // A calm human pace (0.3 film widths per second, 0.6 s to decide), as in the lab screenshots.
      auto = on ? new Mg03Autopilot(0.3, 0.6) : null;
    },
  };
  return instance;
}

function createDemo(root: HTMLElement, env: MinigameEnv): MinigameDemo {
  const canvas = makeCanvas(root);
  canvas.setAttribute('aria-hidden', 'true');
  canvas.style.pointerEvents = 'none';
  // Standard sweep along seam A, then a tap on the defect the lens reveals.
  const config = resolveConfig({ defects: 3 }, 'STANDARD', env.assistLevel, 25);
  const SEED = 21;
  let sim = new Mg03Sim(config, SEED);
  let pilot = new Mg03Autopilot(0.32, 0.4);
  const view = new Mg03View(canvas, sim, { compact: true, reducedMotion: env.reducedMotion, t: env.t });
  let tapAt = -1;
  const demo = new DemoHost(
    () => {
      sim = new Mg03Sim(config, SEED);
      sim.setLens(Math.max(0.05, sim.defects[0]!.x - 0.34), sim.defects[0]!.y);
      pilot = new Mg03Autopilot(0.32, 0.4);
      view.setSim(sim);
      tapAt = -1;
    },
    (phase, now) => {
      const wanted = Math.round(phase * 3 * 120);
      while (sim.step < wanted) {
        const before = sim.marks.length;
        pilot.apply(sim);
        if (sim.marks.length !== before) tapAt = sim.timeS;
        sim.tick();
      }
      const fx = view.px(sim.lensX) + 6;
      const fy = view.py(sim.lensY) + 22;
      view.draw({ timeMs: now, active: true, finger: { x: fx, y: fy, pressed: tapAt >= 0 && sim.timeS - tapAt < 0.2 } });
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

const module: MinigameModule = { id: 'MG-03', create, createDemo };

export default module;
