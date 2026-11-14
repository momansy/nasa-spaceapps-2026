// MG-05 Clean Room (design section 10.5, T019 step 8).
//
// "Particles drift onto a camera lens and mirror; wipe them with gentle strokes. Wiping too
// hard scratches." Success: ≥ 90 % clean, no scratches.
//
// Glue only: canvas, input (strokes with pressure where real, keys, one button), loop,
// haptics, ARIA.
import type { MgMap } from '@protocol';
import type { MinigameDemo, MinigameEnv, MinigameInstance, MinigameModule } from '../types';
import { DemoHost, DT_S, focusQuietly, isButtonKey, listen, liveRegion, LoopHost, makeCanvas, pct, watchSize, type HostedRun } from '../MG-02/kit';
import { LENS, Mg05Autopilot, Mg05Sim, resolveConfig } from './model';
import { Mg05View } from './render';

const K = 'minigame.MG-05.';
/** Keyboard swab speed, field widths per second (gentle, game value). */
const KEY_SPEED = 0.6;

/** True when the event carries a real pressure reading (pens, force touch), not the 0 / 0.5 defaults. */
function realPressure(e: PointerEvent): boolean {
  return e.pointerType === 'pen' || (e.pressure > 0 && e.pressure !== 0.5 && e.pressure !== 1);
}

function create(root: HTMLElement, env: MinigameEnv): MinigameInstance {
  const canvas = makeCanvas(root);
  canvas.tabIndex = 0;
  canvas.setAttribute('role', 'application');
  canvas.setAttribute('aria-roledescription', env.t(K + 'aria.role'));
  const oneButton = env.mode === 'ONE_BUTTON';
  canvas.setAttribute('aria-label', env.t(oneButton ? K + 'aria.field_one' : K + 'aria.field'));
  const live = liveRegion(root, 1500);
  // The playfield's current value (screen readers read it with the field).
  canvas.setAttribute('aria-describedby', live.id);
  const durS = env.durationMs / 1000;

  let sim = new Mg05Sim(resolveConfig({}, env.mode, env.assistLevel, durS), 0);
  const view = new Mg05View(canvas, sim, { compact: false, reducedMotion: env.reducedMotion, t: env.t });
  let auto: Mg05Autopilot | null = null;
  let pressed = false;
  let dragId: number | null = null;
  const keys = new Set<string>();
  let lastWiped = 0;
  let lastScratches = 0;
  let lastWipeHapticS = -1;
  let lastProgressS = 0;

  const host = new LoopHost<HostedRun>(env, {
    begin(params: MgMap, seed: number) {
      sim = new Mg05Sim(resolveConfig(params, env.mode, env.assistLevel, durS), seed);
      view.setSim(sim);
      lastWiped = 0;
      lastScratches = 0;
      return {
        get done() {
          return sim.done;
        },
        tick() {
          let p = pressed;
          if (auto) p = auto.apply(sim);
          else if (!oneButton && keys.size > 0) {
            const dx = (keys.has('ArrowRight') ? 1 : 0) - (keys.has('ArrowLeft') ? 1 : 0);
            const dy = (keys.has('ArrowDown') ? 1 : 0) - (keys.has('ArrowUp') ? 1 : 0);
            if (!sim.down) sim.press(sim.swabX, sim.swabY);
            sim.move(sim.swabX + dx * KEY_SPEED * DT_S, sim.swabY + dy * KEY_SPEED * DT_S);
          }
          sim.tick(p);
        },
        result: () => sim.result(),
      };
    },
    draw(now, paused) {
      view.draw({ timeMs: now, pausedText: paused ? env.t(K + 'paused') : null });
    },
    afterSteps() {
      if (sim.wiped !== lastWiped) {
        lastWiped = sim.wiped;
        if (sim.timeS - lastWipeHapticS > 0.12) {
          lastWipeHapticS = sim.timeS;
          host.haptic(6);
        }
      }
      if (sim.scratches.length !== lastScratches) {
        lastScratches = sim.scratches.length;
        host.haptic([60, 40, 60]);
        live.say(env.t(K + 'aria.scratch', { n: lastScratches }), performance.now(), true);
      }
      live.say(env.t(K + 'aria.clean', { pct: pct(sim.clean) }), performance.now());
      if (sim.timeS - lastProgressS >= 0.5) {
        lastProgressS = sim.timeS;
        env.reportProgress(sim.clean);
      }
    },
    onPause() {
      pressed = false;
      dragId = null;
      keys.clear();
      sim.release();
    },
  });

  const local = (e: PointerEvent) => {
    const r = canvas.getBoundingClientRect();
    return view.toField(e.clientX - r.left, e.clientY - r.top);
  };

  const onDown = (e: PointerEvent) => {
    if (host.finished) return;
    e.preventDefault();
    focusQuietly(canvas);
    dragId = e.pointerId;
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch {
      /* moves still arrive over the canvas */
    }
    if (oneButton) {
      pressed = true;
      return;
    }
    if (!host.playing) return;
    const p = local(e);
    sim.press(p.x, p.y, e.timeStamp);
  };
  const onMove = (e: PointerEvent) => {
    if (dragId !== e.pointerId || oneButton || !host.playing) return;
    e.preventDefault();
    const hard = realPressure(e) && e.pressure > sim.config.pressureLimit;
    // Coalesced samples keep fast strokes from skipping particles between frames; each carries
    // its own timestamp, so the stroke speed is the same at any frame rate.
    const list = typeof e.getCoalescedEvents === 'function' ? e.getCoalescedEvents() : [];
    if (list.length > 1) for (const ce of list) {
      const p = local(ce);
      sim.move(p.x, p.y, hard, ce.timeStamp);
    }
    else {
      const p = local(e);
      sim.move(p.x, p.y, hard, e.timeStamp);
    }
  };
  const onUp = (e: PointerEvent) => {
    if (dragId !== e.pointerId) return;
    dragId = null;
    pressed = false;
    if (!oneButton) sim.release();
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
    if (e.key.startsWith('Arrow')) {
      e.preventDefault();
      keys.add(e.key);
    }
  };
  const onKeyUp = (e: KeyboardEvent) => {
    if (oneButton && isButtonKey(e)) pressed = false;
    keys.delete(e.key);
    if (!oneButton && keys.size === 0 && dragId === null) sim.release();
  };
  const onBlur = () => {
    keys.clear();
    if (dragId === null) {
      pressed = false;
      if (!oneButton) sim.release();
    }
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
      unwatch();
      unlisten();
      canvas.remove();
      live.remove();
    },
    /** Test hook (lab `auto=1`): the scripted good player of the model tests takes over. */
    __autoplay(on: boolean) {
      auto = on ? new Mg05Autopilot(0.6) : null;
    },
  };
  return instance;
}

function createDemo(root: HTMLElement, env: MinigameEnv): MinigameDemo {
  const canvas = makeCanvas(root);
  canvas.setAttribute('aria-hidden', 'true');
  canvas.style.pointerEvents = 'none';
  // Standard strokes on the lens: dust settles, a slow wipe clears it.
  const config = { ...resolveConfig({ particles: 10 }, 'STANDARD', env.assistLevel, 4.2), driftS: 0.7 };
  let sim = new Mg05Sim(config, 4);
  let pilot = new Mg05Autopilot(0.5);
  const view = new Mg05View(canvas, sim, { compact: true, reducedMotion: env.reducedMotion, t: env.t });
  const demo = new DemoHost(
    () => {
      sim = new Mg05Sim(config, 4);
      // The demo frames the lens only: particles bound for the mirror are left out.
      sim.particles.forEach((p, i) => {
        if (p.optic === 1) sim.state[i] = 3;
      });
      sim.press(LENS.x - 0.2, LENS.y - 0.1);
      sim.release();
      pilot = new Mg05Autopilot(0.5);
      view.setSim(sim);
    },
    (phase, now) => {
      const wanted = Math.round(phase * 3 * 120);
      // Dust settles for 1.5 s, then the swab wipes it.
      while (sim.step < wanted) sim.tick(sim.timeS >= 1.5 ? pilot.apply(sim) : false);
      view.draw({ timeMs: now, finger: { x: view.px(sim.swabX) + 14, y: view.py(sim.swabY) + 18, pressed: sim.down } });
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

const module: MinigameModule = { id: 'MG-05', create, createDemo };

export default module;
