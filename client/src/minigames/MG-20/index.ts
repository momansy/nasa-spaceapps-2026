// MG-20 Deorbit Burn (design section 10.5, T021 step 7). Parallel solo, 15 s; the team median
// of `value` (periapsis altitude, km) sets the real burn.
//
// "Hold the burn button while the periapsis marker drops; release when it's inside the target
// band." Success: periapsis inside the band. Fact: the MG-20 line.
//
// Glue only: canvas, input (hold anywhere / Space / Enter; `hold_to_toggle`), loop, haptics, ARIA.
import type { MgMap } from '@protocol';
import type { MinigameDemo, MinigameEnv, MinigameInstance, MinigameModule } from '../types';
import { fmt } from '../../data/format';
import { DemoHost, isButtonKey, liveRegion, LoopHost, makeCanvas, watchSize } from '../MG-13/kit';
import { Mg20Autopilot, Mg20Sim, resolveConfig } from './model';
import { Mg20View } from './render';

function create(root: HTMLElement, env: MinigameEnv): MinigameInstance {
  const canvas = makeCanvas(root);
  canvas.tabIndex = 0;
  canvas.setAttribute('role', 'button');
  canvas.setAttribute('aria-roledescription', env.t('minigame.MG-20.aria.role'));
  canvas.setAttribute('aria-label', env.t('minigame.MG-20.aria.field'));
  canvas.setAttribute('aria-pressed', 'false');
  const live = liveRegion(root, 700);
  const runS = env.durationMs / 1000;

  let sim = new Mg20Sim(resolveConfig({}, env.mode, env.assistLevel), runS);
  const view = new Mg20View(canvas, sim, { compact: false, reducedMotion: env.reducedMotion, t: env.t });
  let auto: Mg20Autopilot | null = null;
  let pointer: number | null = null;
  let keyDown = false;
  let lastBurning = false;
  let lastBand = '';
  let lastRumble = 0;
  let lastAriaKm = Infinity;

  const host = new LoopHost<{ done: boolean; tick(): void; result(): ReturnType<Mg20Sim['result']> }>(env, {
    begin(params: MgMap) {
      // The burn needs no seed: every phone starts from the same orbit (team median).
      sim = new Mg20Sim(resolveConfig(params, env.mode, env.assistLevel), runS);
      view.setSim(sim);
      return {
        get done() {
          return sim.done;
        },
        tick() {
          if (auto) auto.apply(sim);
          else sim.hold(pointer !== null || keyDown);
          sim.tick();
        },
        result: () => sim.result(),
      };
    },
    draw(now, paused) {
      view.draw({ timeMs: now, active: sim.burning, pausedText: paused ? env.t('minigame.MG-20.paused') : null });
    },
    afterSteps() {
      if (sim.burning !== lastBurning) {
        lastBurning = sim.burning;
        canvas.setAttribute('aria-pressed', String(sim.burning));
        host.haptic(sim.burning ? 30 : 15);
      }
      // Engine rumble while burning (short pulses; none in reduced motion).
      const t = sim.timeS;
      if (sim.burning && !env.reducedMotion && t - lastRumble > 0.4) {
        lastRumble = t;
        host.haptic(18);
      }
      const [st, key] = view.status();
      const band = `${st}:${key}`;
      if (band !== lastBand) {
        lastBand = band;
        if (st === 'good') host.haptic([20, 30, 20]);
        live.say(env.t(key), performance.now(), true);
      }
      const km = sim.periapsisKm;
      if (Math.abs(km - lastAriaKm) >= 20) {
        lastAriaKm = km;
        live.say(env.t('minigame.MG-20.aria.periapsis', { km: fmt(km, 0) }), performance.now());
      }
      env.reportProgress(Math.min(1, sim.step / sim.endsAt));
    },
    onPause() {
      pointer = null;
      keyDown = false;
    },
  });

  const onDown = (e: PointerEvent) => {
    if (host.finished) return;
    e.preventDefault();
    canvas.focus({ preventScroll: true });
    pointer = e.pointerId;
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch {
      /* fine */
    }
  };
  const onUp = (e: PointerEvent) => {
    if (pointer === e.pointerId) pointer = null;
  };
  const onKeyDown = (e: KeyboardEvent) => {
    if (host.finished || !isButtonKey(e)) return;
    e.preventDefault();
    keyDown = true;
  };
  const onKeyUp = (e: KeyboardEvent) => {
    if (isButtonKey(e)) keyDown = false;
  };
  const onBlur = () => {
    keyDown = false;
  };
  const noMenu = (e: Event) => e.preventDefault();
  canvas.addEventListener('pointerdown', onDown);
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
      auto = on ? new Mg20Autopilot(1.2) : null;
    },
  };
  return instance;
}

function createDemo(root: HTMLElement, env: MinigameEnv): MinigameDemo {
  const canvas = makeCanvas(root);
  canvas.setAttribute('aria-hidden', 'true');
  canvas.style.pointerEvents = 'none';
  const config = resolveConfig({}, 'STANDARD', env.assistLevel);
  let sim = new Mg20Sim(config, 15);
  let pilot = new Mg20Autopilot(0.6);
  const view = new Mg20View(canvas, sim, { compact: true, reducedMotion: env.reducedMotion, t: env.t });
  const demo = new DemoHost(
    () => {
      sim = new Mg20Sim(config, 15);
      pilot = new Mg20Autopilot(0.6);
      view.setSim(sim);
    },
    (phase, now) => {
      // 3 s loop shows ~7 s of play.
      const wanted = Math.round(phase * 7 * 120);
      while (sim.step < wanted && !sim.done) {
        pilot.apply(sim);
        sim.tick();
      }
      view.draw({ timeMs: now, active: sim.burning, finger: phase < 1 ? { x: view.c.W * 0.35, y: view.c.H * 0.8, pressed: sim.burning } : null });
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

const module: MinigameModule = { id: 'MG-20', create, createDemo };

export default module;
