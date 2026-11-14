// MG-19 Scrubber Fix (design section 10.5, T021 step 10). Cooperative split, 35 s, crewed.
//
// "CO₂ rising. Players receive spare parts (hose, tape, card, bag, sock) and must collectively
// assemble an adapter connecting a square filter to a round socket by dragging parts into
// slots." Success: each player who placed a correct part succeeds. Fact F15.
//
// Glue only: canvas, input (drag the part card onto a slot, tap a slot, keys 1–5; one button),
// loop, `env.coop` (teammates' parts and the shared CO₂, decoration), haptics, ARIA.
import type { MgMap } from '@protocol';
import type { CoopState, MinigameDemo, MinigameEnv, MinigameInstance, MinigameModule } from '../types';
import { DemoHost, isButtonKey, liveRegion, LoopHost, makeCanvas, watchSize } from '../MG-13/kit';
import { ACTION_PLACE, CORRECT_SLOT, Mg19Autopilot, Mg19Sim, PARTS, resolveConfig, SLOTS } from './model';
import { Mg19View } from './render';

/** Teammates' placements and CO₂ from the host's shared state (see README "Teams"). */
export function readShared(state: Pick<CoopState, 'shared'>): { placements: Array<[number, number]>; co2: number | null } {
  const sh = state.shared;
  const placements: Array<[number, number]> = [];
  const slots = sh['slots'];
  if (Array.isArray(slots)) slots.forEach((p, i) => typeof p === 'number' && p >= 0 && placements.push([p, i]));
  // Hosts that only echo the last move (the mock room).
  const lx = sh['last_x'];
  if (sh['last_a'] === ACTION_PLACE && Array.isArray(lx) && typeof lx[0] === 'number' && typeof lx[1] === 'number') placements.push([lx[0], lx[1]]);
  const co2 = typeof sh['co2_pct'] === 'number' ? (sh['co2_pct'] as number) : null;
  return { placements, co2 };
}

function create(root: HTMLElement, env: MinigameEnv): MinigameInstance {
  const canvas = makeCanvas(root);
  canvas.tabIndex = 0;
  canvas.setAttribute('role', 'application');
  canvas.setAttribute('aria-roledescription', env.t('minigame.MG-19.aria.role'));
  const oneButton = env.mode === 'ONE_BUTTON';
  canvas.setAttribute('aria-label', env.t(oneButton ? 'minigame.MG-19.aria.field_one' : 'minigame.MG-19.aria.field'));
  const live = liveRegion(root, 900);
  const runS = env.durationMs / 1000;

  let sim = new Mg19Sim(resolveConfig({}, env.mode, env.assistLevel), 0, runS);
  const view = new Mg19View(canvas, sim, { compact: false, reducedMotion: env.reducedMotion, t: env.t });
  let auto: Mg19Autopilot | null = null;
  let drag: { id: number; x0: number; y0: number; dx: number; dy: number } | null = null;
  let hover: number | null = null;
  let unsubscribe: (() => void) | null = null;
  let sent = false;
  let lastStatus = '';
  let lastHighlight = -1;
  let wasComplete = false;

  const host = new LoopHost<{ done: boolean; tick(): void; result(): ReturnType<Mg19Sim['result']> }>(env, {
    begin(params: MgMap, seed: number) {
      // With env.coop the teammates are real; without it a simulated crew places their parts.
      sim = new Mg19Sim(resolveConfig(params, env.mode, env.assistLevel), seed, runS, !env.coop);
      view.setSim(sim);
      if (env.coop) {
        unsubscribe = env.coop.onState((s) => {
          const { placements, co2 } = readShared(s);
          for (const [p, i] of placements) sim.teamPlaced(p, i);
          if (co2 !== null) sim.hostCo2 = co2;
        });
      }
      live.say(env.t('minigame.MG-19.aria.part', { part: env.t(`minigame.MG-19.part.${PARTS[sim.config.part]}`) }), performance.now(), true);
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
      view.draw({ timeMs: now, active: drag !== null, drag: drag ? { dx: drag.dx, dy: drag.dy } : null, hover, pausedText: paused ? env.t('minigame.MG-19.paused') : null });
    },
    afterSteps() {
      const [st, key] = view.status();
      if (key !== lastStatus) {
        lastStatus = key;
        if (st === 'good') host.haptic([30, 40, 60]);
        else if (st === 'warn') host.haptic([60, 40, 60]);
        live.say(env.t(key), performance.now(), true);
      }
      if (sim.placed && !sent && env.coop) {
        sent = true;
        env.coop.send({ a: ACTION_PLACE, x: [sim.config.part, CORRECT_SLOT[sim.config.part]!] });
      }
      if (sim.complete && !wasComplete) {
        wasComplete = true;
        live.say(env.t('minigame.MG-19.status.complete'), performance.now() + 1, true);
      }
      if (oneButton && sim.highlight !== lastHighlight && !sim.placed) {
        lastHighlight = sim.highlight;
        host.haptic(6);
        live.say(env.t(`minigame.MG-19.slot.${SLOTS[sim.highlight]}`), performance.now(), true);
      }
      env.reportProgress(sim.placed ? 1 : 0);
    },
    onPause() {
      drag = null;
      hover = null;
    },
  });

  const playing = () => host.started && !host.finished && !host.paused;
  const place = (i: number) => {
    if (!playing() || sim.placed) return;
    sim.place(i);
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
      return;
    }
    const p = local(e);
    const slot = view.slotAt(p.x, p.y);
    if (slot !== null) {
      place(slot);
      return;
    }
    const cr = view.card;
    if (!sim.placed && p.x >= cr.x && p.x <= cr.x + cr.w && p.y >= cr.y && p.y <= cr.y + cr.h) {
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
    hover = view.slotAt(p.x, p.y);
  };
  const onUp = (e: PointerEvent) => {
    if (!drag || drag.id !== e.pointerId) return;
    if (hover !== null && e.type === 'pointerup') place(hover);
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
    if (e.key >= '1' && e.key <= '5') {
      e.preventDefault();
      place(Number(e.key) - 1);
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
      unsubscribe?.();
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
      auto = on ? new Mg19Autopilot() : null;
    },
  };
  return instance;
}

function createDemo(root: HTMLElement, env: MinigameEnv): MinigameDemo {
  const canvas = makeCanvas(root);
  canvas.setAttribute('aria-hidden', 'true');
  canvas.style.pointerEvents = 'none';
  const config = resolveConfig({ part: 1 }, 'STANDARD', env.assistLevel);
  let sim = new Mg19Sim(config, 19, 10);
  const view = new Mg19View(canvas, sim, { compact: true, reducedMotion: env.reducedMotion, t: env.t });
  const demo = new DemoHost(
    () => {
      sim = new Mg19Sim(config, 19, 10);
      view.setSim(sim);
    },
    (phase, now) => {
      const wanted = Math.round(phase * 6 * 120);
      while (sim.step < wanted && !sim.done) sim.tick();
      // Ghost drag: the card slides to its slot over the first two thirds, then drops.
      const k = Math.min(1, Math.max(0, (phase - 0.15) / 0.5));
      const target = view.correctRect();
      const cr = view.card;
      if (k >= 1 && !sim.placed) {
        sim.place(CORRECT_SLOT[config.part]!);
        sim.tick();
      }
      const dragOff = sim.placed ? null : { dx: (target.x + target.w / 2 - (cr.x + cr.w / 2)) * k, dy: (target.y + target.h / 2 - (cr.y + cr.h / 2)) * k };
      const finger = dragOff ? { x: cr.x + cr.w / 2 + dragOff.dx, y: cr.y + cr.h / 2 + dragOff.dy, pressed: k > 0 } : null;
      view.draw({ timeMs: now, active: true, drag: dragOff, hover: k > 0.8 ? CORRECT_SLOT[config.part]! : null, finger });
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

const module: MinigameModule = { id: 'MG-19', create, createDemo };

export default module;
