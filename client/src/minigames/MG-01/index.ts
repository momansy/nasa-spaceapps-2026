// MG-01 Unit Converter Sprint (design section 10.5, T019 step 3).
//
// "Engineering values fly in with mixed units (lbf, N, ft, m, psi, kPa). Swipe each to the
// matching SI value before it reaches the 'upload' line." Success: ≥ 8 correct, ≤ 1 wrong.
// Fact F01 (Mars Climate Orbiter).
//
// Glue only: canvas, input (swipe, lane taps, keys, one button), loop, haptics, ARIA.
import type { MgMap } from '@protocol';
import type { MinigameDemo, MinigameEnv, MinigameInstance, MinigameModule } from '../types';
import { clamp, DemoHost, focusQuietly, isButtonKey, listen, liveRegion, LoopHost, makeCanvas, smooth, watchSize, type HostedRun } from '../MG-02/kit';
import { IMPERIAL_UNIT, Mg01Autopilot, Mg01Sim, resolveConfig, SI_UNIT, type Outcome } from './model';
import { Mg01View } from './render';

const K = 'minigame.MG-01.';
const LETTERS = ['A', 'B', 'C'];

function create(root: HTMLElement, env: MinigameEnv): MinigameInstance {
  const canvas = makeCanvas(root);
  canvas.tabIndex = 0;
  canvas.setAttribute('role', 'application');
  canvas.setAttribute('aria-roledescription', env.t(K + 'aria.role'));
  const oneButton = env.mode === 'ONE_BUTTON';
  canvas.setAttribute('aria-label', env.t(oneButton ? K + 'aria.field_one' : K + 'aria.field'));
  const live = liveRegion(root, 700);
  // The playfield's current value (screen readers read it with the field).
  canvas.setAttribute('aria-describedby', live.id);
  const durS = env.durationMs / 1000;

  let sim = new Mg01Sim(resolveConfig({}, env.mode, env.assistLevel, durS), 0);
  const view = new Mg01View(canvas, sim, { compact: false, reducedMotion: env.reducedMotion, t: env.t });
  let auto: Mg01Autopilot | null = null;
  let drag: { id: number; x0: number; y0: number; dx: number; dy: number; card: number } | null = null;
  let lastActive = -1;
  let lastHi = -1;
  let lastResolved = 0;
  let lastProgressS = 0;

  const cardText = (i: number) => {
    const card = sim.deck[i]!;
    const opts = card.options.map((o, k) => `${LETTERS[k]} ${o} ${SI_UNIT[card.kind]}`).join(', ');
    return env.t(K + 'aria.card', { value: String(card.value), unit: IMPERIAL_UNIT[card.kind], options: opts });
  };

  const feedback = (o: Outcome) => {
    host.haptic(o.kind === 'correct' ? 14 : [40, 40, 40]);
    live.say(env.t(K + 'feedback.' + o.kind), performance.now(), true);
  };

  const host = new LoopHost<HostedRun>(env, {
    begin(params: MgMap, seed: number) {
      sim = new Mg01Sim(resolveConfig(params, env.mode, env.assistLevel, durS), seed);
      view.setSim(sim);
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
      let aim = -1;
      if (drag && drag.card === sim.active) aim = view.laneForDrag(drag.dx, drag.dy);
      view.draw({ timeMs: now, drag: drag && drag.card === sim.active ? drag : null, aim, pausedText: paused ? env.t(K + 'paused') : null });
    },
    afterSteps() {
      if (sim.resolved !== lastResolved) {
        lastResolved = sim.resolved;
        if (sim.last) feedback(sim.last);
      }
      const a = sim.active;
      if (a !== lastActive) {
        lastActive = a;
        if (a >= 0) live.say(cardText(a), performance.now() + 1, true);
        if (drag && drag.card !== a) drag = null;
      }
      const hi = sim.highlight();
      if (hi !== lastHi) {
        lastHi = hi;
        if (hi >= 0) {
          host.haptic(6);
          const card = sim.deck[a]!;
          live.say(`${LETTERS[hi]} ${card.options[hi]} ${SI_UNIT[card.kind]}`, performance.now(), true);
        }
      }
      if (sim.timeS - lastProgressS >= 0.5) {
        lastProgressS = sim.timeS;
        env.reportProgress(clamp(sim.correct / sim.config.correctMin, 0, 1));
      }
    },
    onPause() {
      drag = null;
    },
  });

  const sortInto = (lane: number) => {
    if (!host.playing) return;
    sim.sort(lane);
  };

  const local = (e: PointerEvent) => {
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const onDown = (e: PointerEvent) => {
    if (host.finished) return;
    e.preventDefault();
    focusQuietly(canvas);
    if (oneButton) {
      if (host.playing) sim.press();
      return;
    }
    const p = local(e);
    const lane = view.laneAt(p.x, p.y);
    if (lane >= 0) {
      sortInto(lane);
      return;
    }
    if (sim.active >= 0) {
      drag = { id: e.pointerId, x0: e.clientX, y0: e.clientY, dx: 0, dy: 0, card: sim.active };
      try {
        canvas.setPointerCapture(e.pointerId);
      } catch {
        /* moves still arrive over the canvas */
      }
    }
  };
  const onMove = (e: PointerEvent) => {
    if (!drag || drag.id !== e.pointerId) return;
    e.preventDefault();
    drag.dx = e.clientX - drag.x0;
    drag.dy = e.clientY - drag.y0;
  };
  const onUp = (e: PointerEvent) => {
    if (!drag || drag.id !== e.pointerId) return;
    const d = drag;
    drag = null;
    if (d.card !== sim.active) return;
    // A release over a lane also counts, whatever the direction.
    const p = local(e);
    let lane = view.laneAt(p.x, p.y);
    if (lane < 0) lane = view.laneForDrag(d.dx, d.dy);
    if (lane >= 0) sortInto(lane);
  };
  const onCancel = () => {
    drag = null;
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
    const map: Record<string, number> = { '1': 0, '2': 1, '3': 2, a: 0, b: 1, c: 2, ArrowLeft: 0, ArrowDown: 1, ArrowRight: 2 };
    const lane = map[e.key];
    if (lane !== undefined) {
      e.preventDefault();
      if (!e.repeat) sortInto(lane);
    }
  };
  const noMenu = (e: Event) => e.preventDefault();

  const unlisten = listen(canvas, {
    pointerdown: onDown as (e: never) => void,
    pointermove: onMove as (e: never) => void,
    pointerup: onUp as (e: never) => void,
    pointercancel: onCancel,
    keydown: onKeyDown as (e: never) => void,
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
      // A human-like 1.2 s reaction, so the cards are seen travelling down the conveyor.
      auto = on ? new Mg01Autopilot(1.2) : null;
    },
  };
  return instance;
}

function createDemo(root: HTMLElement, env: MinigameEnv): MinigameDemo {
  const canvas = makeCanvas(root);
  canvas.setAttribute('aria-hidden', 'true');
  canvas.style.pointerEvents = 'none';
  // Standard swipes, sped up so two cards are sorted in the 3 s loop.
  const config = { ...resolveConfig({}, 'STANDARD', env.assistLevel, 14), fallS: 2.4 };
  const SEED = 12;
  const REACT_S = 0.75;
  const DRAG_S = 0.38;
  let sim = new Mg01Sim(config, SEED);
  let pilot = new Mg01Autopilot(REACT_S);
  let since = 0;
  let active = -1;
  const view = new Mg01View(canvas, sim, { compact: true, reducedMotion: env.reducedMotion, t: env.t });
  const demo = new DemoHost(
    () => {
      sim = new Mg01Sim(config, SEED);
      pilot = new Mg01Autopilot(REACT_S);
      view.setSim(sim);
      active = -1;
    },
    (phase, now) => {
      const wanted = Math.round(phase * 3 * 120);
      while (sim.step < wanted) {
        pilot.apply(sim);
        sim.tick();
        if (sim.active !== active) {
          active = sim.active;
          since = sim.timeS;
        }
      }
      let drag: { dx: number; dy: number } | null = null;
      let finger: { x: number; y: number; pressed: boolean } | null = null;
      if (active >= 0) {
        const k = smooth((sim.timeS - since - (REACT_S - DRAG_S)) / DRAG_S);
        const p = view.cardPos(active);
        const lane = view.laneCentre(sim.deck[active]!.correctLane);
        drag = { dx: (lane.x - p.x) * k * 0.7, dy: Math.max(0, (lane.y - p.y) * k * 0.35) };
        finger = { x: p.x + drag.dx + 18, y: p.y + drag.dy + 14, pressed: k > 0 };
      }
      view.draw({ timeMs: now, drag, aim: drag && active >= 0 && Math.abs(drag.dx) + drag.dy > 20 ? sim.deck[active]!.correctLane : -1, finger });
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

const module: MinigameModule = { id: 'MG-01', create, createDemo };

export default module;
