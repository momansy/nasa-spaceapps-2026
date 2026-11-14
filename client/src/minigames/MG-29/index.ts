// MG-29 Predict the Physics, bonus round (design section 10.5, T019 step 4).
//
// "Quick visual predictions: 'Which falls faster in a vacuum: a hammer or a feather?' Choose
// before the animation plays." Success: correct prediction. Fact F32.
//
// Glue only: canvas, input (tap, keys, one button), loop, haptics, ARIA.
import type { MgMap } from '@protocol';
import type { MinigameDemo, MinigameEnv, MinigameInstance, MinigameModule } from '../types';
import { DemoHost, focusQuietly, isButtonKey, listen, liveRegion, LoopHost, makeCanvas, watchSize, type HostedRun } from '../MG-02/kit';
import { Mg29Autopilot, Mg29Sim, resolveConfig } from './model';
import { Mg29View } from './render';

const K = 'minigame.MG-29.';
const LETTERS = ['A', 'B', 'C'];

function create(root: HTMLElement, env: MinigameEnv): MinigameInstance {
  const canvas = makeCanvas(root);
  canvas.tabIndex = 0;
  canvas.setAttribute('role', 'application');
  canvas.setAttribute('aria-roledescription', env.t(K + 'aria.role'));
  const oneButton = env.mode === 'ONE_BUTTON';
  canvas.setAttribute('aria-label', env.t(oneButton ? K + 'aria.field_one' : K + 'aria.field'));
  const live = liveRegion(root, 500);
  // The playfield's current value (screen readers read it with the field).
  canvas.setAttribute('aria-describedby', live.id);
  const durS = env.durationMs / 1000;

  let sim = new Mg29Sim(resolveConfig({}, env.mode, env.assistLevel, durS), 0);
  const view = new Mg29View(canvas, sim, { compact: false, reducedMotion: env.reducedMotion, t: env.t });
  let auto: Mg29Autopilot | null = null;
  let focus = -1;
  let lastHi = -1;
  let revealed = false;
  let lastProgressS = 0;

  const answers = () =>
    Array.from({ length: sim.q.choices }, (_, i) => `${LETTERS[i]}: ${env.t(`${K}q.${sim.q.id}.a${sim.order[i]}`)}`).join('; ');

  const host = new LoopHost<HostedRun>(env, {
    begin(params: MgMap, seed: number) {
      sim = new Mg29Sim(resolveConfig(params, env.mode, env.assistLevel, durS), seed);
      view.setSim(sim);
      return {
        get done() {
          return sim.done;
        },
        tick() {
          const before = sim.locked;
          auto?.apply(sim);
          if (sim.locked !== before) host.haptic(12);
          sim.tick();
        },
        result: () => sim.result(),
      };
    },
    draw(now, paused) {
      view.draw({ timeMs: now, focus: sim.phase === 'choose' && !oneButton ? focus : -1, pausedText: paused ? env.t(K + 'paused') : null });
    },
    afterSteps() {
      const hi = sim.highlight();
      if (hi !== lastHi) {
        lastHi = hi;
        if (hi >= 0) {
          host.haptic(6);
          live.say(`${LETTERS[hi]}: ${env.t(`${K}q.${sim.q.id}.a${sim.order[hi]}`)}`, performance.now(), true);
        }
      }
      if (!revealed && sim.animK >= 0.74) {
        revealed = true;
        const ok = sim.locked === sim.correctSlot;
        host.haptic(ok ? [14, 40, 14] : 40);
        const verdict = env.t(sim.locked < 0 ? K + 'result.none' : ok ? K + 'result.right' : K + 'result.wrong');
        live.say(`${verdict}. ${env.t(`${K}q.${sim.q.id}.why`)}`, performance.now(), true);
      }
      if (sim.timeS - lastProgressS >= 0.5) {
        lastProgressS = sim.timeS;
        env.reportProgress(sim.locked >= 0 ? 1 : 0);
      }
    },
    onPause() {
      /* nothing is held */
    },
  });

  const lock = (i: number) => {
    if (!host.playing) return;
    if (sim.lock(i)) {
      host.haptic(12);
      live.say(`${env.t(K + 'locked')}: ${LETTERS[i]}`, performance.now(), true);
    }
  };

  const onDown = (e: PointerEvent) => {
    if (host.finished) return;
    e.preventDefault();
    focusQuietly(canvas);
    if (oneButton) {
      if (host.playing && sim.press()) host.haptic(12);
      return;
    }
    const r = canvas.getBoundingClientRect();
    const i = view.hit(e.clientX - r.left, e.clientY - r.top);
    if (i >= 0) lock(i);
  };
  const onKeyDown = (e: KeyboardEvent) => {
    if (host.finished) return;
    if (oneButton) {
      if (isButtonKey(e)) {
        e.preventDefault();
        if (!e.repeat && host.playing && sim.press()) host.haptic(12);
      }
      return;
    }
    const n = sim.q.choices;
    const direct: Record<string, number> = { '1': 0, '2': 1, '3': 2, a: 0, b: 1, c: 2 };
    if (direct[e.key] !== undefined && direct[e.key]! < n) {
      e.preventDefault();
      lock(direct[e.key]!);
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
      e.preventDefault();
      focus = (focus + 1 + n) % n;
      live.say(`${LETTERS[focus]}: ${env.t(`${K}q.${sim.q.id}.a${sim.order[focus]}`)}`, performance.now(), true);
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
      e.preventDefault();
      focus = focus < 0 ? n - 1 : (focus - 1 + n) % n;
      live.say(`${LETTERS[focus]}: ${env.t(`${K}q.${sim.q.id}.a${sim.order[focus]}`)}`, performance.now(), true);
    } else if (isButtonKey(e) && focus >= 0) {
      e.preventDefault();
      lock(focus);
    }
  };
  const noMenu = (e: Event) => e.preventDefault();

  const unlisten = listen(canvas, {
    pointerdown: onDown as (e: never) => void,
    keydown: onKeyDown as (e: never) => void,
    contextmenu: noMenu as (e: never) => void,
  });
  const unwatch = watchSize(root, () => {
    if (!host.destroyed) view.resize();
  });

  const instance: MinigameInstance & { __autoplay(on: boolean): void } = {
    start(params, seed) {
      host.start(params, seed);
      live.say(env.t(K + 'aria.question', { question: env.t(`${K}q.${sim.q.id}.text`), answers: answers() }), performance.now(), true);
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
    /** Test hook (lab `auto=1`): the scripted good player locks the right answer after 1.2 s. */
    __autoplay(on: boolean) {
      auto = on ? new Mg29Autopilot(1.2) : null;
    },
  };
  return instance;
}

function createDemo(root: HTMLElement, env: MinigameEnv): MinigameDemo {
  const canvas = makeCanvas(root);
  canvas.setAttribute('aria-hidden', 'true');
  canvas.style.pointerEvents = 'none';
  // The hammer and the feather: a tap on "They land together" at 0.8 s, then the animation.
  const config = { ...resolveConfig({ question: 0 }, 'STANDARD', env.assistLevel, 10), animS: 2.0 };
  let sim = new Mg29Sim(config, 1);
  let pilot = new Mg29Autopilot(0.8);
  const view = new Mg29View(canvas, sim, { compact: true, reducedMotion: env.reducedMotion, t: env.t });
  const demo = new DemoHost(
    () => {
      sim = new Mg29Sim(config, 1);
      pilot = new Mg29Autopilot(0.8);
      view.setSim(sim);
    },
    (phase, now) => {
      const wanted = Math.round(phase * 3 * 120);
      while (sim.step < wanted && !sim.done) {
        pilot.apply(sim);
        sim.tick();
      }
      const b = view.buttons[sim.correctSlot]!;
      const pressing = sim.timeS > 0.55 && sim.timeS < 0.95;
      view.draw({ timeMs: now, finger: sim.timeS < 1.4 ? { x: b.x + b.w * 0.72, y: b.y + b.h * 0.6, pressed: pressing } : null });
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

const module: MinigameModule = { id: 'MG-29', create, createDemo };

export default module;
