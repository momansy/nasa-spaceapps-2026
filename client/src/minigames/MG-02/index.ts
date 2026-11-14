// MG-02 Rocket Equation Balance (design section 10.5, T019 step 2).
//
// "A balance scale: drop propellant blocks on one side and watch the Δv needle. Each block
// adds less Δv than the one before (logarithm!). Hit the target Δv band with the fewest
// blocks." Success: in band with ≤ 1 extra block. Fact F02.
//
// Glue only: canvas, input (buttons, keys, one button), loop, haptics, ARIA. Rules in
// `model.ts`, drawing in `render.ts`, shared plumbing in `kit.ts`.
import type { MgMap } from '@protocol';
import type { MinigameDemo, MinigameEnv, MinigameInstance, MinigameModule } from '../types';
import { DemoHost, focusQuietly, fmt, isButtonKey, listen, liveRegion, LoopHost, makeCanvas, watchSize, type HostedRun } from './kit';
import { Mg02Autopilot, Mg02Sim, resolveConfig, type Zone } from './model';
import { Mg02View } from './render';

const K = 'minigame.MG-02.';

function create(root: HTMLElement, env: MinigameEnv): MinigameInstance {
  const canvas = makeCanvas(root);
  canvas.tabIndex = 0;
  canvas.setAttribute('role', 'application');
  canvas.setAttribute('aria-roledescription', env.t(K + 'aria.role'));
  const oneButton = env.mode === 'ONE_BUTTON';
  canvas.setAttribute('aria-label', env.t(oneButton ? K + 'aria.field_one' : K + 'aria.field'));
  const live = liveRegion(root, 900);
  // The playfield's current value (screen readers read it with the field).
  canvas.setAttribute('aria-describedby', live.id);
  const durS = env.durationMs / 1000;

  let sim = new Mg02Sim(resolveConfig({}, env.mode, env.assistLevel, durS), 0);
  const view = new Mg02View(canvas, sim, { compact: false, reducedMotion: env.reducedMotion, t: env.t });
  let auto: Mg02Autopilot | null = null;
  let held: 'add' | 'remove' | null = null;
  let lastN = sim.n;
  let lastZone: Zone = sim.zone;
  let lastProgressS = 0;

  const describe = () =>
    env.t(K + 'aria.value', {
      dv: fmt(sim.dvMs / 1000, 2),
      n: sim.n,
      status: env.t(sim.zone < 0 ? K + 'aria.below' : sim.zone > 0 ? K + 'aria.above' : K + 'aria.in_band'),
    });

  const host = new LoopHost<HostedRun>(env, {
    begin(params: MgMap, seed: number) {
      sim = new Mg02Sim(resolveConfig(params, env.mode, env.assistLevel, durS), seed);
      view.setSim(sim);
      lastN = sim.n;
      lastZone = sim.zone;
      canvas.setAttribute('aria-description', env.t(K + 'aria.target', { lo: fmt(sim.plan.loMs / 1000, 2), hi: fmt(sim.plan.hiMs / 1000, 2) }));
      return {
        get done() {
          return sim.done;
        },
        tick() {
          auto?.apply(sim);
          sim.tick();
        },
        result: () => sim.result(),
      };
    },
    draw(now, paused) {
      view.draw({ timeMs: now, held, pausedText: paused ? env.t(K + 'paused') : null });
    },
    afterSteps() {
      if (sim.n !== lastN) {
        lastN = sim.n;
        host.haptic(10);
        live.say(describe(), performance.now(), true);
      }
      const z = sim.zone;
      if (z !== lastZone) {
        lastZone = z;
        host.haptic(z === 0 ? [14, 40, 14] : 35);
      }
      if (sim.timeS - lastProgressS >= 0.5) {
        lastProgressS = sim.timeS;
        const extra = sim.n - sim.plan.nStar;
        env.reportProgress(z === 0 ? Math.max(0.5, 1 - 0.25 * extra) : 0.25);
      }
    },
    onPause() {
      held = null;
    },
  });

  const act = (which: 'add' | 'remove') => {
    if (!host.playing) return;
    const ok = which === 'add' ? sim.add() : sim.remove();
    if (!ok) host.haptic(6);
  };

  const onDown = (e: PointerEvent) => {
    if (host.finished) return;
    e.preventDefault();
    focusQuietly(canvas);
    if (oneButton) {
      held = 'add';
      act('add');
      return;
    }
    const r = canvas.getBoundingClientRect();
    const which = view.hit(e.clientX - r.left, e.clientY - r.top);
    if (which) {
      held = which;
      act(which);
    }
  };
  const onUp = () => {
    held = null;
  };
  const onKeyDown = (e: KeyboardEvent) => {
    if (host.finished) return;
    if (oneButton) {
      if (isButtonKey(e) || e.key === 'ArrowUp' || e.key === '+') {
        e.preventDefault();
        if (!e.repeat) act('add');
      }
      return;
    }
    if (e.key === 'ArrowUp' || e.key === 'ArrowRight' || e.key === '+' || e.key === '=' || isButtonKey(e)) {
      e.preventDefault();
      if (!e.repeat) act('add');
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft' || e.key === '-' || e.key === 'Backspace' || e.key === 'Delete') {
      e.preventDefault();
      if (!e.repeat) act('remove');
    }
  };
  const noMenu = (e: Event) => e.preventDefault();

  const unlisten = listen(canvas, {
    pointerdown: onDown as (e: never) => void,
    pointerup: onUp,
    pointercancel: onUp,
    pointerleave: onUp,
    keydown: onKeyDown as (e: never) => void,
    contextmenu: noMenu as (e: never) => void,
  });
  const unwatch = watchSize(root, () => {
    if (!host.destroyed) view.resize();
  });

  const instance: MinigameInstance & { __autoplay(on: boolean): void } = {
    start(params, seed) {
      host.start(params, seed);
      live.say(describe(), performance.now(), true);
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
      auto = on ? new Mg02Autopilot() : null;
    },
  };
  return instance;
}

function createDemo(root: HTMLElement, env: MinigameEnv): MinigameDemo {
  const canvas = makeCanvas(root);
  canvas.setAttribute('aria-hidden', 'true');
  canvas.style.pointerEvents = 'none';
  // Standard mode, a fixed seed whose run starts below the band: three or four taps on "Add".
  const config = { ...resolveConfig({ start_below: true }, 'STANDARD', env.assistLevel, 30), handlingS: 0.3 };
  const SEED = 22;
  let sim = new Mg02Sim(config, SEED);
  let pilot = new Mg02Autopilot(0.18);
  const view = new Mg02View(canvas, sim, { compact: true, reducedMotion: env.reducedMotion, t: env.t });
  let tapAt = -1;
  const demo = new DemoHost(
    () => {
      sim = new Mg02Sim(config, SEED);
      pilot = new Mg02Autopilot(0.18);
      view.setSim(sim);
      tapAt = -1;
    },
    (phase, now) => {
      // The loop shows about 3 s of play.
      const wanted = Math.round(phase * 3 * 120);
      while (sim.step < wanted) {
        if (pilot.apply(sim) === 1) tapAt = sim.timeS;
        sim.tick();
      }
      const p = view.centreOf('add');
      const pressed = tapAt >= 0 && sim.timeS - tapAt < 0.14;
      view.draw({ timeMs: now, held: pressed ? 'add' : null, finger: { x: p.x + 10, y: p.y + 6, pressed } });
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

const module: MinigameModule = { id: 'MG-02', create, createDemo };

export default module;
