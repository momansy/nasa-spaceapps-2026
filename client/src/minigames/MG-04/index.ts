// MG-04 Orientation Check (design section 10.5, T019 step 7).
//
// "Sensors and connectors appear rotated; spin each to match the drawing. Some drawings are
// wrong: spot them with a 'drawing error' button." Success: all correct, including catching
// the drawing error. Fact F21 (Genesis).
//
// Glue only: canvas, input (buttons, keys, one button), loop, haptics, ARIA.
import type { MgMap } from '@protocol';
import type { MinigameDemo, MinigameEnv, MinigameInstance, MinigameModule } from '../types';
import { DemoHost, focusQuietly, isButtonKey, listen, liveRegion, LoopHost, makeCanvas, watchSize, type HostedRun } from '../MG-02/kit';
import { createParts, GOOD_OUTCOMES, Mg04Autopilot, Mg04Sim, resolveConfig } from './model';
import { Mg04View, type Mg04Button } from './render';

const K = 'minigame.MG-04.';

function create(root: HTMLElement, env: MinigameEnv): MinigameInstance {
  const canvas = makeCanvas(root);
  canvas.tabIndex = 0;
  canvas.setAttribute('role', 'application');
  canvas.setAttribute('aria-roledescription', env.t(K + 'aria.role'));
  const oneButton = env.mode === 'ONE_BUTTON';
  canvas.setAttribute('aria-label', env.t(oneButton ? K + 'aria.field_one' : K + 'aria.field'));
  const live = liveRegion(root, 300);
  // The playfield's current value (screen readers read it with the field).
  canvas.setAttribute('aria-describedby', live.id);
  const durS = env.durationMs / 1000;

  let sim = new Mg04Sim(resolveConfig({}, env.mode, env.assistLevel, durS), 0);
  const view = new Mg04View(canvas, sim, { compact: false, reducedMotion: env.reducedMotion, t: env.t });
  let auto: Mg04Autopilot | null = null;
  let held: Mg04Button | null = null;
  let lastResolved = 0;
  let lastRot = -1;
  let lastOffer: number | 'error' = -1;
  let lastProgressS = 0;

  const describePart = () => {
    const p = sim.part;
    if (!p) return '';
    return env.t(K + 'aria.part', { n: sim.current + 1, total: sim.parts.length, kind: env.t(K + 'kind.' + p.kind), drawing: p.drawingRot * 90, part: sim.rot * 90 });
  };

  const host = new LoopHost<HostedRun>(env, {
    begin(params: MgMap, seed: number) {
      sim = new Mg04Sim(resolveConfig(params, env.mode, env.assistLevel, durS), seed);
      view.setSim(sim);
      lastResolved = 0;
      lastRot = sim.rot;
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
      if (sim.outcomes.length !== lastResolved) {
        lastResolved = sim.outcomes.length;
        const last = sim.last;
        if (last) {
          const ok = GOOD_OUTCOMES.includes(last.outcome);
          host.haptic(ok ? [14, 40, 14] : [40, 40, 40]);
          live.say(`${env.t(K + 'feedback.' + last.outcome)}. ${describePart()}`, performance.now(), true);
        }
        lastRot = sim.rot;
      } else if (sim.rot !== lastRot) {
        lastRot = sim.rot;
        if (!oneButton) host.haptic(8);
        live.say(env.t(K + 'aria.turned', { deg: sim.rot * 90 }), performance.now(), true);
      }
      const offer = sim.offer();
      if (oneButton && offer !== lastOffer) {
        lastOffer = offer;
        host.haptic(5);
        if (offer === 'error') live.say(env.t(K + 'btn.error'), performance.now(), true);
      }
      if (sim.timeS - lastProgressS >= 0.5) {
        lastProgressS = sim.timeS;
        env.reportProgress(sim.correct / sim.parts.length);
      }
    },
    onPause() {
      held = null;
    },
  });

  const act = (b: Mg04Button) => {
    if (!host.playing) return;
    if (b === 'left') sim.rotate(-1);
    else if (b === 'right') sim.rotate(1);
    else if (b === 'match') sim.confirm();
    else sim.flag();
  };

  const onDown = (e: PointerEvent) => {
    if (host.finished) return;
    e.preventDefault();
    focusQuietly(canvas);
    if (oneButton) {
      held = 'error';
      if (host.playing) sim.press();
      return;
    }
    const r = canvas.getBoundingClientRect();
    const b = view.hit(e.clientX - r.left, e.clientY - r.top);
    if (b) {
      held = b;
      act(b);
    } else if (e.clientY - r.top >= view.benchR.y && e.clientY - r.top <= view.benchR.y + view.benchR.h) {
      // A tap on the part turns it a quarter clockwise.
      held = 'right';
      act('right');
    }
  };
  const onUp = () => {
    held = null;
  };
  const onKeyDown = (e: KeyboardEvent) => {
    if (host.finished) return;
    if (oneButton) {
      if (isButtonKey(e)) {
        e.preventDefault();
        if (!e.repeat && host.playing) sim.press();
      }
      return;
    }
    const map: Record<string, Mg04Button> = { ArrowLeft: 'left', ArrowRight: 'right', Enter: 'match', m: 'match', e: 'error', Backspace: 'error', Delete: 'error' };
    const b = map[e.key];
    if (b) {
      e.preventDefault();
      if (!e.repeat) act(b);
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
      live.say(describePart(), performance.now(), true);
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
    /** Test hook (lab `auto=1`): the scripted good player, at a calm human pace. */
    __autoplay(on: boolean) {
      auto = on ? new Mg04Autopilot(0.9, 0.45) : null;
    },
  };
  return instance;
}

function createDemo(root: HTMLElement, env: MinigameEnv): MinigameDemo {
  const canvas = makeCanvas(root);
  canvas.setAttribute('aria-hidden', 'true');
  canvas.style.pointerEvents = 'none';
  // Standard: a part one quarter turn off its (correct) drawing: "turn right", then "matches".
  const config = resolveConfig({}, 'STANDARD', env.assistLevel, 20);
  let seed = 1;
  for (; seed < 500; seed++) {
    const p = createParts(config, seed)[0]!;
    if (!p.wrong && p.kind === 'imu' && (p.drawingRot - p.startRot + 4) % 4 === 1) break;
  }
  let sim = new Mg04Sim(config, seed);
  const view = new Mg04View(canvas, sim, { compact: true, reducedMotion: env.reducedMotion, t: env.t });
  const demo = new DemoHost(
    () => {
      sim = new Mg04Sim(config, seed);
      view.setSim(sim);
    },
    (phase, now) => {
      const wanted = Math.round(phase * 3 * 120);
      while (sim.step < wanted) {
        if (sim.step === 120) sim.rotate(1);
        if (sim.step === 240) sim.confirm();
        sim.tick();
      }
      const t = sim.timeS;
      const target: Mg04Button = t < 1.4 ? 'right' : 'match';
      const p = view.centreOf(target);
      const pressed = (t > 0.85 && t < 1.05) || (t > 1.85 && t < 2.05);
      view.draw({ timeMs: now, held: pressed ? target : null, finger: t < 2.6 ? { x: p.x + 12, y: p.y + 6, pressed } : null });
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

const module: MinigameModule = { id: 'MG-04', create, createDemo };

export default module;
