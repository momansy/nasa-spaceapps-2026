// MG-27 Recovery Team (design section 10.5).
//
// "Follow the beacon signal to the capsule and arrive in order: swimmers, flotation collar, ship."
// This player's unit is `params.unit` (or `slot` mod 3); the capsule is hidden and a beacon signal
// rises as the unit closes in. Success: this unit arrives after the one before it and before the one
// after it (the others arrive on a seeded schedule, `env.coop` only drives the display).
//
// Teams: per-player params `unit` (0 swimmers, 1 collar, 2 ship) and `slot`, common param `slots`.
// Optional shared state: action `arrive` x = [unit, playTimeMs] when this unit arrives; shared
// `arrived` (number[3]) = play time in ms of each unit's arrival, −1 until it happens.
//
// This file is the glue: input (a drag stick, arrow keys, one button), haptics and ARIA.
import { fmt } from '../../data/format';
import type { MinigameModule } from '../types';
import { clamp, runDemo, runMinigame, type Controller, type GameSpec, type Runtime } from '../MG-22/kit';
import { goodPlayer, makeSim, type Mg27Input, type Mg27Sim } from './model';
import { Mg27View } from './render';

/** A drag of this many px is full stick. */
const STICK_PX = 70;

function makeController(rt: Runtime<Mg27Sim, Mg27View>): Controller<Mg27Input> {
  const input: Mg27Input = { vx: 0, vy: 0, go: false };
  let dragging = false;
  let ox = 0;
  let oy = 0;
  let sx = 0;
  let sy = 0;
  let pendingGo: number | null = null;
  let go = false;
  const keys = new Set<string>();
  const stick = rt.view.stick;
  const press = (stepNow: number) => {
    if (pendingGo === null && !go) pendingGo = stepNow;
  };

  return {
    sample(step) {
      let vx = sx;
      let vy = sy;
      if (!dragging) {
        vx = (keys.has('ArrowRight') ? 1 : 0) - (keys.has('ArrowLeft') ? 1 : 0);
        vy = (keys.has('ArrowDown') ? 1 : 0) - (keys.has('ArrowUp') ? 1 : 0);
      }
      input.vx = vx;
      input.vy = vy;
      if (pendingGo !== null && step >= pendingGo) {
        go = true;
        pendingGo = null;
      }
      input.go = go;
      return input;
    },
    down(_e, x, y, clock) {
      if (!rt.view.hits(x, y)) return;
      if (rt.sim.config.oneButton) {
        press(clock.stepNow());
        return;
      }
      dragging = true;
      ox = x;
      oy = y;
      sx = 0;
      sy = 0;
      stick.on = true;
      stick.ox = ox;
      stick.oy = oy;
      stick.x = x;
      stick.y = y;
    },
    move(_e, x, y) {
      if (!dragging) return;
      const dx = x - ox;
      const dy = y - oy;
      const m = Math.hypot(dx, dy);
      const k = m > STICK_PX ? STICK_PX / m : 1;
      sx = clamp((dx * k) / STICK_PX, -1, 1);
      sy = clamp((dy * k) / STICK_PX, -1, 1);
      stick.x = ox + dx * k;
      stick.y = oy + dy * k;
    },
    up() {
      dragging = false;
      sx = 0;
      sy = 0;
      stick.on = false;
    },
    key(e, down, clock) {
      const k = e.key;
      if (rt.sim.config.oneButton) {
        if (k === ' ' || k === 'Enter') {
          if (down) press(clock.stepNow());
          return true;
        }
        return false;
      }
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(k)) return false;
      if (down) keys.add(k);
      else keys.delete(k);
      return true;
    },
    release() {
      dragging = false;
      sx = 0;
      sy = 0;
      stick.on = false;
      keys.clear();
    },
    active() {
      return dragging || keys.size > 0;
    },
  };
}

const spec: GameSpec<Mg27Input, Mg27Sim, Mg27View> = {
  id: 'MG-27',
  ariaLabelKey: 'minigame.MG-27.aria.label',
  role: 'application',
  demoSeed: 27,
  makeSim: (params, seed, env) => makeSim(params, seed, env.mode, env.assistLevel, env.durationMs / 1000),
  makeView: (canvas, sim, env, compact) => new Mg27View(canvas, sim, env, compact),
  makeController,
  attach(rt) {
    // The own arrival is reported once, for the host's board (display only; the result never depends on it).
    const coop = rt.env.coop;
    if (!coop) return () => undefined;
    let sent = false;
    const timer = window.setInterval(() => {
      if (!sent && rt.sim.arriveStep >= 0) {
        sent = true;
        coop.send({ a: 'arrive', x: [rt.sim.config.unit, Math.round(rt.sim.arriveStep * (1000 / 120))] });
      }
    }, 200);
    return () => window.clearInterval(timer);
  },
  makeCues(env) {
    let state = 'search';
    let last = 0;
    return (sim) => {
      if (sim.step === 0) {
        state = 'search';
        last = 0;
        return;
      }
      if (sim.state !== state) {
        state = sim.state;
        if (sim.state === 'arrived') env.haptic(sim.success ? [20, 40, 140] : [60, 60, 60]);
        else if (sim.state === 'late') env.haptic([60, 60, 60]);
      } else if (sim.state === 'search' && sim.closeness > 0.35 && sim.timeS - last > 1.2 - sim.closeness) {
        last = sim.timeS;
        env.haptic(10);
      }
    };
  },
  aria(sim, env) {
    const w = sim.window;
    let state: string;
    if (sim.state === 'arrived') state = env.t(sim.success ? 'minigame.MG-27.aria.ok' : 'minigame.MG-27.aria.wrong', { s: fmt(sim.arrivalTimeS ?? 0, 1, 1) });
    else if (sim.state === 'late') state = env.t('minigame.MG-27.aria.nothere');
    else state = env.t('minigame.MG-27.aria.search', { from: fmt(w.fromS, 0), to: fmt(Math.min(w.toS, 99), 0) });
    return {
      text: env.t('minigame.MG-27.aria.value', {
        unit: env.t(`minigame.MG-27.unit.${['swimmers', 'collar', 'ship'][sim.config.unit]!}`),
        signal: Math.round(sim.signal * 100),
        state,
      }),
    };
  },
  demoInput(sim) {
    return goodPlayer(sim, demoBuf);
  },
};
const demoBuf: Mg27Input = { vx: 0, vy: 0, go: false };

const module: MinigameModule = {
  id: 'MG-27',
  create: (root, env) => runMinigame(root, env, spec),
  createDemo: (root, env) => runDemo(root, env, spec),
};

export default module;
