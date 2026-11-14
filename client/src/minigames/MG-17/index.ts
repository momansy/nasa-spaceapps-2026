// MG-17 Alarm Triage (design section 10.5, T021 step 9). Parallel solo, 20 s.
//
// "Alarm codes flood in. Drag each to IGNORE, MONITOR or ACT according to the role cheat sheet.
// Program alarms that mean 'computer is busy, still working' can be safely continued."
// Success: ≥ 85 % correct. Fact F13.
//
// Glue only: canvas, input (drag the front card to a bin, tap a bin, keys 1–3 / arrows; one
// button), loop, haptics, ARIA. `params.role` (index into data/roles.json or a role id) picks the
// cheat sheet.
import type { MgMap } from '@protocol';
import type { MinigameDemo, MinigameEnv, MinigameInstance, MinigameModule } from '../types';
import { DemoHost, isButtonKey, liveRegion, LoopHost, makeCanvas, watchSize } from '../MG-13/kit';
import { BINS, Mg17Autopilot, Mg17Sim, resolveConfig, type Alarm, type Bin } from './model';
import { Mg17View } from './render';

const KEY_BIN: Record<string, Bin> = { '1': 'ignore', '2': 'monitor', '3': 'act', ArrowLeft: 'ignore', ArrowDown: 'monitor', ArrowRight: 'act' };

function create(root: HTMLElement, env: MinigameEnv): MinigameInstance {
  const canvas = makeCanvas(root);
  canvas.tabIndex = 0;
  canvas.setAttribute('role', 'application');
  canvas.setAttribute('aria-roledescription', env.t('minigame.MG-17.aria.role'));
  const oneButton = env.mode === 'ONE_BUTTON';
  canvas.setAttribute('aria-label', env.t(oneButton ? 'minigame.MG-17.aria.field_one' : 'minigame.MG-17.aria.field'));
  const live = liveRegion(root, 600);
  const runS = env.durationMs / 1000;

  let sim = new Mg17Sim(resolveConfig({}, env.mode, env.assistLevel), 0, runS);
  const view = new Mg17View(canvas, sim, { compact: false, reducedMotion: env.reducedMotion, t: env.t });
  let auto: Mg17Autopilot | null = null;
  let drag: { id: number; x0: number; y0: number; dx: number; dy: number } | null = null;
  let hover: Bin | null = null;
  let lastFront: Alarm | null = null;
  let lastHandled = 0;
  let lastHighlight = -1;
  let pressedUntil = 0;

  const host = new LoopHost<{ done: boolean; tick(): void; result(): ReturnType<Mg17Sim['result']> }>(env, {
    begin(params: MgMap, seed: number) {
      sim = new Mg17Sim(resolveConfig(params, env.mode, env.assistLevel), seed, runS);
      view.setSim(sim);
      return {
        get done() {
          return sim.done;
        },
        tick() {
          if (auto) auto.apply(sim);
          sim.tick();
        },
        result: () => sim.result(),
      };
    },
    draw(now, paused) {
      view.draw({ timeMs: now, active: drag !== null || now < pressedUntil, drag: drag ? { dx: drag.dx, dy: drag.dy } : null, hover, pausedText: paused ? env.t('minigame.MG-17.paused') : null });
    },
    afterSteps() {
      if (sim.handled !== lastHandled) {
        lastHandled = sim.handled;
        const l = sim.lastHandled;
        if (l) host.haptic(l.given === l.answer ? 14 : [50, 40, 50]);
      }
      const f = sim.front;
      if (f !== lastFront) {
        lastFront = f;
        if (f) {
          host.haptic(10);
          live.say(env.t('minigame.MG-17.aria.alarm', { code: f.def.code, text: env.t(`minigame.MG-17.alarm.${f.def.key}`) }), performance.now(), true);
        }
      }
      if (oneButton && sim.highlight !== lastHighlight && f) {
        lastHighlight = sim.highlight;
        live.say(env.t(`minigame.MG-17.bin.${BINS[sim.highlight]}`), performance.now(), true);
      }
      env.reportProgress(sim.correct / sim.alarms.length);
    },
    onPause() {
      drag = null;
      hover = null;
    },
  });

  const playing = () => host.started && !host.finished && !host.paused;
  const sort = (bin: Bin) => {
    if (!playing() || !sim.front) return;
    sim.sort(bin);
    pressedUntil = performance.now() + 150;
  };
  const local = (e: PointerEvent) => {
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const onDown = (e: PointerEvent) => {
    if (host.finished) return;
    e.preventDefault();
    canvas.focus({ preventScroll: true });
    if (!playing()) return;
    if (oneButton) {
      sim.press();
      host.haptic(10);
      pressedUntil = performance.now() + 150;
      return;
    }
    const p = local(e);
    const bin = view.binAt(p.x, p.y);
    if (bin) {
      sort(bin);
      return;
    }
    const cr = view.card;
    if (sim.front && p.x >= cr.x && p.x <= cr.x + cr.w && p.y >= cr.y && p.y <= cr.y + cr.h) {
      drag = { id: e.pointerId, x0: e.clientX, y0: e.clientY, dx: 0, dy: 0 };
      try {
        canvas.setPointerCapture(e.pointerId);
      } catch {
        /* fine */
      }
    }
  };
  const onMove = (e: PointerEvent) => {
    if (!drag || drag.id !== e.pointerId) return;
    e.preventDefault();
    drag.dx = e.clientX - drag.x0;
    drag.dy = e.clientY - drag.y0;
    const p = local(e);
    hover = view.binAt(p.x, p.y);
  };
  const onUp = (e: PointerEvent) => {
    if (!drag || drag.id !== e.pointerId) return;
    if (hover && e.type === 'pointerup') sort(hover);
    drag = null;
    hover = null;
  };
  const onKeyDown = (e: KeyboardEvent) => {
    if (host.finished) return;
    if (oneButton) {
      if (isButtonKey(e)) {
        e.preventDefault();
        if (!e.repeat && playing()) sim.press();
      }
      return;
    }
    const bin = KEY_BIN[e.key];
    if (bin) {
      e.preventDefault();
      if (!e.repeat) sort(bin);
    }
  };
  const noMenu = (e: Event) => e.preventDefault();
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onUp);
  canvas.addEventListener('lostpointercapture', onUp);
  canvas.addEventListener('keydown', onKeyDown);
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
      canvas.removeEventListener('contextmenu', noMenu);
      canvas.remove();
      live.remove();
    },
    __autoplay(on: boolean) {
      auto = on ? new Mg17Autopilot() : null;
    },
  };
  return instance;
}

function createDemo(root: HTMLElement, env: MinigameEnv): MinigameDemo {
  const canvas = makeCanvas(root);
  canvas.setAttribute('aria-hidden', 'true');
  canvas.style.pointerEvents = 'none';
  const config = resolveConfig({ alarm_count: 4 }, 'STANDARD', env.assistLevel);
  let sim = new Mg17Sim(config, 17, 8);
  let pilot = new Mg17Autopilot(0.7);
  const view = new Mg17View(canvas, sim, { compact: true, reducedMotion: env.reducedMotion, t: env.t });
  const demo = new DemoHost(
    () => {
      sim = new Mg17Sim(config, 17, 8);
      pilot = new Mg17Autopilot(0.7);
      view.setSim(sim);
    },
    (phase, now) => {
      // The 3 s loop shows ~5 s of sorting; the ghost card slides towards its bin.
      const wanted = Math.round(phase * 5 * 120);
      while (sim.step < wanted && !sim.done) {
        pilot.apply(sim);
        sim.tick();
      }
      const f = sim.front;
      let dragOff: { dx: number; dy: number } | null = null;
      let finger: { x: number; y: number; pressed: boolean } | null = null;
      let hover: Bin | null = null;
      if (f) {
        const since = (sim.step - f.arriveStep) / (0.7 * 120);
        const k = Math.max(0, Math.min(1, (since - 0.2) / 0.8));
        const target = view.bins.find((b) => b.bin === f.answer)!.r;
        const cr = view.card;
        dragOff = { dx: (target.x + target.w / 2 - (cr.x + cr.w / 2)) * k, dy: (target.y + 10 - cr.y) * k };
        finger = { x: cr.x + cr.w / 2 + dragOff.dx, y: cr.y + cr.h / 2 + dragOff.dy, pressed: k > 0 };
        if (k > 0.7) hover = f.answer;
      }
      view.draw({ timeMs: now, active: true, drag: dragOff, hover, finger });
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

const module: MinigameModule = { id: 'MG-17', create, createDemo };

export default module;
