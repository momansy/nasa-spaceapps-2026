// MG-18 Eclipse Power Juggle (design section 10.5, T021 step 6). Parallel solo, 25 s.
//
// "Toggle spacecraft loads (heaters, radio, instrument) on/off to keep the battery above the
// red line through the eclipse while keeping critical heaters on."
// Success: battery stays above minimum, critical loads always on. Fact F14.
//
// Glue only: canvas, input (tap a load row, keys 1–4 or arrows + Space; one button), loop,
// haptics, ARIA.
import type { MgMap } from '@protocol';
import type { MinigameDemo, MinigameEnv, MinigameInstance, MinigameModule } from '../types';
import { DemoHost, isButtonKey, liveRegion, LoopHost, makeCanvas, watchSize } from '../MG-13/kit';
import { LOADS, Mg18Autopilot, Mg18Sim, resolveConfig, type LoadId } from './model';
import { Mg18View } from './render';

function create(root: HTMLElement, env: MinigameEnv): MinigameInstance {
  const canvas = makeCanvas(root);
  canvas.tabIndex = 0;
  canvas.setAttribute('role', 'application');
  canvas.setAttribute('aria-roledescription', env.t('minigame.MG-18.aria.role'));
  const oneButton = env.mode === 'ONE_BUTTON';
  canvas.setAttribute('aria-label', env.t(oneButton ? 'minigame.MG-18.aria.field_one' : 'minigame.MG-18.aria.field'));
  const live = liveRegion(root, 1000);
  const runS = env.durationMs / 1000;

  let sim = new Mg18Sim(resolveConfig({}, env.mode, env.assistLevel), 0, runS);
  const view = new Mg18View(canvas, sim, { compact: false, reducedMotion: env.reducedMotion, t: env.t });
  let auto: Mg18Autopilot | null = null;
  let focus = 0;
  let pressedUntil = 0;
  let lastStatus = '';
  let lastHighlight = -1;
  let lastProgressS = 0;

  const host = new LoopHost<{ done: boolean; tick(): void; result(): ReturnType<Mg18Sim['result']> }>(env, {
    begin(params: MgMap, seed: number) {
      sim = new Mg18Sim(resolveConfig(params, env.mode, env.assistLevel), seed, runS);
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
      view.draw({ timeMs: now, active: now < pressedUntil, pausedText: paused ? env.t('minigame.MG-18.paused') : null });
    },
    afterSteps() {
      const [st, key] = view.status();
      if (key !== lastStatus) {
        lastStatus = key;
        if (st === 'bad') host.haptic([70, 50, 70]);
        else if (st === 'warn') host.haptic(30);
        live.say(env.t(key), performance.now(), st === 'bad');
      }
      if (oneButton && sim.highlight !== lastHighlight) {
        lastHighlight = sim.highlight;
        host.haptic(6);
      }
      const t = sim.timeS;
      if (t - lastProgressS >= 0.5) {
        lastProgressS = t;
        env.reportProgress(sim.failure === 'none' ? Math.min(1, sim.step / sim.totalSteps) : 0);
      }
    },
  });

  const playing = () => host.started && !host.finished && !host.paused;
  const toggle = (id: LoadId) => {
    if (!playing()) return;
    sim.toggle(id);
    host.haptic(12);
    pressedUntil = performance.now() + 150;
  };

  const onDown = (e: PointerEvent) => {
    if (host.finished) return;
    e.preventDefault();
    canvas.focus({ preventScroll: true });
    if (!playing()) return;
    if (oneButton) {
      sim.press();
      host.haptic(12);
      pressedUntil = performance.now() + 150;
      return;
    }
    const r = canvas.getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    for (const row of view.rows) {
      if (x >= row.r.x && x <= row.r.x + row.r.w && y >= row.r.y - 3 && y <= row.r.y + row.r.h + 3) {
        toggle(row.id);
        return;
      }
    }
  };
  const onKeyDown = (e: KeyboardEvent) => {
    if (host.finished) return;
    if (oneButton) {
      if (isButtonKey(e)) {
        e.preventDefault();
        if (!e.repeat && playing()) {
          sim.press();
          host.haptic(12);
        }
      }
      return;
    }
    if (e.key >= '1' && e.key <= '4') {
      e.preventDefault();
      focus = Number(e.key) - 1;
      toggle(LOADS[focus]!);
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      focus = (focus + (e.key === 'ArrowDown' ? 1 : LOADS.length - 1)) % LOADS.length;
      live.say(env.t(`minigame.MG-18.load.${LOADS[focus]}`), performance.now(), true);
    } else if (isButtonKey(e)) {
      e.preventDefault();
      if (!e.repeat) toggle(LOADS[focus]!);
    }
  };
  const noMenu = (e: Event) => e.preventDefault();
  canvas.addEventListener('pointerdown', onDown);
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
      canvas.removeEventListener('keydown', onKeyDown);
      canvas.removeEventListener('contextmenu', noMenu);
      canvas.remove();
      live.remove();
    },
    __autoplay(on: boolean) {
      auto = on ? new Mg18Autopilot() : null;
    },
  };
  return instance;
}

function createDemo(root: HTMLElement, env: MinigameEnv): MinigameDemo {
  const canvas = makeCanvas(root);
  canvas.setAttribute('aria-hidden', 'true');
  canvas.style.pointerEvents = 'none';
  const config = resolveConfig({}, 'STANDARD', env.assistLevel);
  let sim = new Mg18Sim(config, 18, 25);
  let pilot = new Mg18Autopilot();
  const view = new Mg18View(canvas, sim, { compact: true, reducedMotion: env.reducedMotion, t: env.t });
  let lastToggle = -1e9;
  let lastId: LoadId = 'instrument';
  const demo = new DemoHost(
    () => {
      sim = new Mg18Sim(config, 18, 25);
      pilot = new Mg18Autopilot();
      view.setSim(sim);
    },
    (phase, now) => {
      const wanted = Math.round(phase * sim.totalSteps);
      while (sim.step < wanted) {
        const before = { ...sim.on };
        pilot.apply(sim);
        sim.tick();
        for (const id of LOADS) if (before[id] !== sim.on[id]) {
          lastToggle = sim.step;
          lastId = id;
        }
      }
      const row = view.rows.find((r) => r.id === lastId);
      const finger = row && sim.step - lastToggle < 120 ? { x: row.r.x + row.r.w - 14, y: row.r.y + row.r.h / 2, pressed: sim.step - lastToggle < 30 } : null;
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

const module: MinigameModule = { id: 'MG-18', create, createDemo };

export default module;
