// MG-14 Debris Dodge (design section 10.5, T021 step 5). Parallel solo, 20 s.
//
// "Debris tracks approach on a radar. Choose the smallest burn direction and duration that
// clears the collision probability threshold. Overburning wastes fuel."
// Success: safe miss with ≤ 1.2× the minimum Δv. Fact F10.
//
// Glue only: canvas, input (buttons and slider; short list; one button), loop, haptics, ARIA.
import type { MgMap } from '@protocol';
import type { MinigameDemo, MinigameEnv, MinigameInstance, MinigameModule } from '../types';
import { DemoHost, isButtonKey, liveRegion, LoopHost, makeCanvas, watchSize } from '../MG-13/kit';
import { DIRS, Mg14Autopilot, Mg14Sim, resolveConfig } from './model';
import { fmtPc, Mg14View, type Hit } from './render';
import { fmt } from '../../data/format';

function create(root: HTMLElement, env: MinigameEnv): MinigameInstance {
  const canvas = makeCanvas(root);
  canvas.tabIndex = 0;
  canvas.setAttribute('role', 'application');
  canvas.setAttribute('aria-roledescription', env.t('minigame.MG-14.aria.role'));
  const oneButton = env.mode === 'ONE_BUTTON';
  const listMode = env.mode !== 'STANDARD';
  canvas.setAttribute('aria-label', env.t(oneButton ? 'minigame.MG-14.aria.field_one' : listMode ? 'minigame.MG-14.aria.field_list' : 'minigame.MG-14.aria.field'));
  const live = liveRegion(root, 700);
  const runS = env.durationMs / 1000;

  let sim = new Mg14Sim(resolveConfig({}, env.mode, env.assistLevel), 0, runS);
  const view = new Mg14View(canvas, sim, { compact: false, reducedMotion: env.reducedMotion, t: env.t });
  let auto: Mg14Autopilot | null = null;
  let sliderId: number | null = null;
  let pressedUntil = 0;
  let lastSel = '';
  let burned = false;

  const host = new LoopHost<{ done: boolean; tick(): void; result(): ReturnType<Mg14Sim['result']> }>(env, {
    begin(params: MgMap, seed: number) {
      sim = new Mg14Sim(resolveConfig(params, env.mode, env.assistLevel), seed, runS);
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
      view.draw({ timeMs: now, active: sliderId !== null || now < pressedUntil, pausedText: paused ? env.t('minigame.MG-14.paused') : null });
    },
    afterSteps() {
      const sel = sim.burn ?? sim.selection;
      const key = `${sel.dir}:${sel.durS}:${sim.burn ? 1 : 0}`;
      if (key !== lastSel) {
        lastSel = key;
        if (!sim.burn && oneButton) host.haptic(8);
        const text = env.t(sel.clears ? 'minigame.MG-14.aria.option_clears' : 'minigame.MG-14.aria.option_above', {
          dir: env.t(`minigame.MG-14.dir.${sel.dir}`),
          s: fmt(sel.durS, 1, 1),
          dv: fmt(sel.dvMs, 2, 2),
          pc: fmtPc(sel.pc),
        });
        live.say(text, performance.now());
      }
      if (sim.burn && !burned) {
        burned = true;
        const s = sim.score();
        host.haptic(s.success ? [60, 40, 30] : [90, 60, 90]);
        env.reportProgress(s.success ? 1 : 0);
      }
    },
    onPause() {
      sliderId = null;
    },
  });

  const playing = () => host.started && !host.finished && !host.paused;
  const local = (e: PointerEvent) => {
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const hitAt = (x: number, y: number): Hit | null => {
    for (const h of view.hits) if (x >= h.r.x && x <= h.r.x + h.r.w && y >= h.r.y && y <= h.r.y + h.r.h) return h.hit;
    return null;
  };
  const apply = (hit: Hit, x: number) => {
    switch (hit.kind) {
      case 'dir':
        sim.selectDir(hit.dir);
        break;
      case 'dur':
        sim.selectDuration(sim.durIndex + hit.delta);
        break;
      case 'durAt':
        sim.selectDuration(view.durationAt(x));
        break;
      case 'row':
        sim.selectRow(hit.index);
        break;
      case 'burn':
        sim.commit();
        break;
    }
    host.haptic(hit.kind === 'burn' ? 20 : 6);
  };

  const onDown = (e: PointerEvent) => {
    if (host.finished) return;
    e.preventDefault();
    canvas.focus({ preventScroll: true });
    if (!playing()) return;
    pressedUntil = performance.now() + 160;
    if (oneButton) {
      sim.commit();
      host.haptic(20);
      return;
    }
    const p = local(e);
    const hit = hitAt(p.x, p.y);
    if (!hit) return;
    apply(hit, p.x);
    if (hit.kind === 'durAt') {
      sliderId = e.pointerId;
      try {
        canvas.setPointerCapture(e.pointerId);
      } catch {
        /* moves still arrive while over the canvas */
      }
    }
  };
  const onMove = (e: PointerEvent) => {
    if (sliderId !== e.pointerId || !playing()) return;
    e.preventDefault();
    sim.selectDuration(view.durationAt(local(e).x));
  };
  const onUp = (e: PointerEvent) => {
    if (sliderId === e.pointerId) sliderId = null;
  };
  const onKeyDown = (e: KeyboardEvent) => {
    if (host.finished || !playing()) return;
    if (isButtonKey(e)) {
      e.preventDefault();
      if (!e.repeat) {
        sim.commit();
        host.haptic(20);
      }
      return;
    }
    if (oneButton) return;
    let handled = true;
    if (listMode) {
      if (e.key === 'ArrowDown') sim.selectRow(sim.row + 1);
      else if (e.key === 'ArrowUp') sim.selectRow(sim.row - 1);
      else handled = false;
    } else {
      const i = DIRS.indexOf(sim.dir);
      if (e.key === 'ArrowRight') sim.selectDuration(sim.durIndex + 1);
      else if (e.key === 'ArrowLeft') sim.selectDuration(sim.durIndex - 1);
      else if (e.key === 'ArrowDown') sim.selectDir(DIRS[(i + 1) % DIRS.length]!);
      else if (e.key === 'ArrowUp') sim.selectDir(DIRS[(i + DIRS.length - 1) % DIRS.length]!);
      else if (e.key >= '1' && e.key <= '4') sim.selectDir(DIRS[Number(e.key) - 1]!);
      else handled = false;
    }
    if (handled) e.preventDefault();
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
      auto = on ? new Mg14Autopilot() : null;
    },
  };
  return instance;
}

function createDemo(root: HTMLElement, env: MinigameEnv): MinigameDemo {
  const canvas = makeCanvas(root);
  canvas.setAttribute('aria-hidden', 'true');
  canvas.style.pointerEvents = 'none';
  // The demo walks the standard menu: the marker leaves the keep-out zone as the burn grows.
  const config = resolveConfig({}, 'STANDARD', env.assistLevel);
  let sim = new Mg14Sim(config, 14, 20);
  const view = new Mg14View(canvas, sim, { compact: true, reducedMotion: env.reducedMotion, t: env.t });
  const demo = new DemoHost(
    () => {
      sim = new Mg14Sim(config, 14, 20);
      sim.selectDir(sim.scenario.best.dir);
      view.setSim(sim);
    },
    (phase, now) => {
      const best = sim.scenario.best;
      const target = Math.round(best.durS / 0.5) - 1;
      sim.selectDuration(Math.min(target, Math.floor(phase * 1.4 * (target + 1))));
      if (phase > 0.85 && !sim.burn) {
        sim.commit();
        sim.tick();
      }
      view.draw({ timeMs: now, active: true });
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

const module: MinigameModule = { id: 'MG-14', create, createDemo };

export default module;
