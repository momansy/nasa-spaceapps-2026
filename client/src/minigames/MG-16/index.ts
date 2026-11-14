// MG-16 Station Docking (design section 10.5, T021 step 8). Parallel solo, 40 s; the team's
// best three average sets the result. `value` = contact speed, cm/s (null without contact).
//
// "Line up crosshairs using translation thrusters while closing speed must stay under a limit
// (displayed in cm/s). Inertia is real." Success: contact with alignment error < 10 cm and
// speed < 10 cm/s. Fact F12.
//
// Glue only: canvas, input (multi-touch thruster pad, keyboard; one button), loop, haptics, ARIA.
import type { MgMap } from '@protocol';
import type { MinigameDemo, MinigameEnv, MinigameInstance, MinigameModule } from '../types';
import { fmt } from '../../data/format';
import { DemoHost, isButtonKey, liveRegion, LoopHost, makeCanvas, watchSize } from '../MG-13/kit';
import { Mg16Autopilot, Mg16Sim, resolveConfig, T_BACK, T_DOWN, T_FWD, T_LEFT, T_RIGHT, T_UP } from './model';
import { Mg16View } from './render';

const KEY_BITS: Record<string, number> = {
  ArrowLeft: T_LEFT,
  ArrowRight: T_RIGHT,
  ArrowUp: T_UP,
  ArrowDown: T_DOWN,
  w: T_FWD,
  W: T_FWD,
  PageUp: T_FWD,
  s: T_BACK,
  S: T_BACK,
  PageDown: T_BACK,
};

function create(root: HTMLElement, env: MinigameEnv): MinigameInstance {
  const canvas = makeCanvas(root);
  canvas.tabIndex = 0;
  canvas.setAttribute('role', 'application');
  canvas.setAttribute('aria-roledescription', env.t('minigame.MG-16.aria.role'));
  const oneButton = env.mode === 'ONE_BUTTON';
  canvas.setAttribute('aria-label', env.t(oneButton ? 'minigame.MG-16.aria.field_one' : 'minigame.MG-16.aria.field'));
  const live = liveRegion(root, 1500);
  const runS = env.durationMs / 1000;

  let sim = new Mg16Sim(resolveConfig({}, env.mode, env.assistLevel), 0, runS);
  const view = new Mg16View(canvas, sim, { compact: false, reducedMotion: env.reducedMotion, t: env.t });
  let auto: Mg16Autopilot | null = null;
  const pointers = new Map<number, number>();
  let keyMask = 0;
  let lastStatus = '';
  let lastPuff = 0;
  let contacted = false;

  const mask = () => {
    let m = keyMask;
    for (const b of pointers.values()) m |= b;
    return m;
  };

  const host = new LoopHost<{ done: boolean; tick(): void; result(): ReturnType<Mg16Sim['result']> }>(env, {
    begin(params: MgMap, seed: number) {
      sim = new Mg16Sim(resolveConfig(params, env.mode, env.assistLevel), seed, runS);
      view.setSim(sim);
      return {
        get done() {
          return sim.done;
        },
        tick() {
          if (auto) auto.apply(sim);
          else if (!oneButton) sim.setThrust(mask());
          sim.tick();
        },
        result: () => sim.result(),
      };
    },
    draw(now, paused) {
      view.draw({ timeMs: now, active: sim.thrust !== 0 || sim.brakeLeft > 0, pausedText: paused ? env.t('minigame.MG-16.paused') : null });
    },
    afterSteps() {
      const [st, key] = view.status();
      if (key !== lastStatus) {
        lastStatus = key;
        if (st === 'bad') host.haptic([60, 40, 60]);
        live.say(env.t(key), performance.now(), st !== 'good');
      }
      const t = sim.timeS;
      if (sim.thrust !== 0 && t - lastPuff > 0.25) {
        lastPuff = t;
        host.haptic(8);
      }
      if (sim.contact && !contacted) {
        contacted = true;
        const s = sim.score();
        host.haptic(s.success ? [40, 30, 120] : [120, 60, 120]);
        live.say(env.t('minigame.MG-16.aria.contact', { v: fmt(sim.contact.speedCmS, 1), a: fmt(sim.contact.alignCm, 1) }), performance.now(), true);
      }
      env.reportProgress(Math.min(1, 1 - sim.range / sim.config.startRangeCm));
    },
    onPause() {
      pointers.clear();
      keyMask = 0;
    },
  });

  const playing = () => host.started && !host.finished && !host.paused;
  const onDown = (e: PointerEvent) => {
    if (host.finished) return;
    e.preventDefault();
    canvas.focus({ preventScroll: true });
    if (!playing()) return;
    if (oneButton) {
      sim.press();
      host.haptic(15);
      return;
    }
    const r = canvas.getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    for (const b of view.buttons) {
      if (x >= b.r.x - 3 && x <= b.r.x + b.r.w + 3 && y >= b.r.y - 3 && y <= b.r.y + b.r.h + 3) {
        pointers.set(e.pointerId, b.bit);
        host.haptic(8);
        try {
          canvas.setPointerCapture(e.pointerId);
        } catch {
          /* fine */
        }
        return;
      }
    }
  };
  const onMove = (e: PointerEvent) => {
    // Sliding the finger onto another button switches thruster (like a real pad).
    if (!pointers.has(e.pointerId)) return;
    const r = canvas.getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    for (const b of view.buttons) if (x >= b.r.x && x <= b.r.x + b.r.w && y >= b.r.y && y <= b.r.y + b.r.h) pointers.set(e.pointerId, b.bit);
  };
  const onUp = (e: PointerEvent) => {
    pointers.delete(e.pointerId);
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
    const bit = KEY_BITS[e.key];
    if (bit) {
      e.preventDefault();
      keyMask |= bit;
    }
  };
  const onKeyUp = (e: KeyboardEvent) => {
    const bit = KEY_BITS[e.key];
    if (bit) keyMask &= ~bit;
  };
  const onBlur = () => {
    keyMask = 0;
    pointers.clear();
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
      auto = on ? new Mg16Autopilot() : null;
    },
  };
  return instance;
}

function createDemo(root: HTMLElement, env: MinigameEnv): MinigameDemo {
  const canvas = makeCanvas(root);
  canvas.setAttribute('aria-hidden', 'true');
  canvas.style.pointerEvents = 'none';
  const config = resolveConfig({ start_range_cm: 70 }, 'STANDARD', env.assistLevel);
  let sim = new Mg16Sim(config, 16, 40);
  let pilot = new Mg16Autopilot();
  const view = new Mg16View(canvas, sim, { compact: true, reducedMotion: env.reducedMotion, t: env.t });
  const demo = new DemoHost(
    () => {
      sim = new Mg16Sim(config, 16, 40);
      pilot = new Mg16Autopilot();
      view.setSim(sim);
    },
    (phase, now) => {
      // The 3 s loop shows ~14 s of a short approach.
      const wanted = Math.round(phase * 14 * 120);
      while (sim.step < wanted && !sim.done) {
        pilot.apply(sim);
        sim.tick();
      }
      view.draw({ timeMs: now, active: sim.thrust !== 0 });
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

const module: MinigameModule = { id: 'MG-16', create, createDemo };

export default module;
