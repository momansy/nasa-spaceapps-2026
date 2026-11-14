// MG-25 Reacquire Signal (design section 10.5).
//
// "Turn the tuning dial to find the beacon frequency of the capsule, then press LOCK." Static fills
// the screen after the blackout (fact F19); the waveform and the signal meter peak near the seeded
// beacon. Success: lock within `lock_time_max_s` (10 s); a LOCK outside the zone costs 1 s.
//
// This file is the glue: input (circular drag, keys, one button), haptics and ARIA. The rules are in
// `model.ts` (pure, deterministic), the drawing in `render.ts`, the optional tone in `sound.ts`.
import { fmtSigned } from '../../data/format';
import type { MinigameModule } from '../types';
import { clamp, runDemo, runMinigame, STEP_HZ, type Controller, type GameSpec, type Runtime } from '../MG-22/kit';
import { dialToKhz, goodPlayer, makeSim, MAX_TURN_PER_S, type Mg25Input, type Mg25Sim } from './model';
import { DIAL_SWEEP, Mg25View } from './render';

/** Keyboard turn rates, dial units per second (game_value): arrows fine, Page keys coarse. */
const KEY_FINE = 0.22;
const KEY_COARSE = 0.7;
const MAX_BACKLOG = 0.5;

function makeController(rt: Runtime<Mg25Sim, Mg25View>): Controller<Mg25Input> {
  const input: Mg25Input = { turn: 0, lock: false };
  /** Dial change from the finger not yet handed to the simulation (it limits the knob speed per step). */
  let backlog = 0;
  let dragging = false;
  let lastAngle = 0;
  /** Step at which the LOCK press happened; consumed by `sample`. */
  let pendingStep: number | null = null;
  let heldLock = false;
  const keys = new Set<string>();

  const pressLock = (stepNow: number) => {
    if (pendingStep === null) pendingStep = stepNow;
  };

  return {
    sample(step) {
      const lim = MAX_TURN_PER_S / STEP_HZ;
      let turn = clamp(backlog, -lim, lim);
      backlog -= turn;
      if (keys.has('ArrowRight') || keys.has('ArrowUp')) turn += KEY_FINE / STEP_HZ;
      if (keys.has('ArrowLeft') || keys.has('ArrowDown')) turn -= KEY_FINE / STEP_HZ;
      if (keys.has('PageUp')) turn += KEY_COARSE / STEP_HZ;
      if (keys.has('PageDown')) turn -= KEY_COARSE / STEP_HZ;
      input.turn = turn;
      input.lock = pendingStep !== null && step >= pendingStep;
      if (input.lock) pendingStep = null;
      return input;
    },
    down(e, x, y, clock) {
      const view = rt.view;
      if (view.hitsSound(x, y)) {
        view.sound.toggle(); // inside the pointer handler: a user gesture
        return;
      }
      if (view.hitsLock(x, y)) {
        heldLock = true;
        pressLock(clock.stepNow());
        return;
      }
      if (rt.sim.config.wholeField) return;
      dragging = true;
      lastAngle = view.angleOf(x, y);
      void e;
    },
    move(_e, x, y) {
      if (!dragging) return;
      const a = rt.view.angleOf(x, y);
      let d = a - lastAngle;
      if (d > Math.PI) d -= Math.PI * 2;
      else if (d < -Math.PI) d += Math.PI * 2;
      lastAngle = a;
      // The knob follows the finger: a turn of the whole 300° sweep is the whole dial.
      backlog = clamp(backlog + d / DIAL_SWEEP, -MAX_BACKLOG, MAX_BACKLOG);
    },
    up() {
      dragging = false;
      heldLock = false;
    },
    key(e, down, clock) {
      const k = e.key;
      if (k === ' ' || k === 'Enter') {
        if (down) pressLock(clock.stepNow());
        heldLock = down;
        return true;
      }
      if (k === 's' || k === 'S') {
        if (down) rt.view.sound.toggle();
        return true;
      }
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'PageUp', 'PageDown'].includes(k)) return false;
      if (rt.sim.config.wholeField) return true; // the dial sweeps by itself
      if (down) keys.add(k);
      else keys.delete(k);
      return true;
    },
    release() {
      dragging = false;
      heldLock = false;
      backlog = 0;
      keys.clear();
    },
    active() {
      return dragging || heldLock || keys.size > 0;
    },
  };
}

const STATE_ARIA: Record<'search' | 'strong' | 'locked' | 'slow' | 'lost', string> = {
  search: 'minigame.MG-25.aria.search',
  strong: 'minigame.MG-25.aria.strong',
  locked: 'minigame.MG-25.aria.locked',
  slow: 'minigame.MG-25.aria.slow',
  lost: 'minigame.MG-25.aria.lost',
};

const spec: GameSpec<Mg25Input, Mg25Sim, Mg25View> = {
  id: 'MG-25',
  ariaLabelKey: 'minigame.MG-25.aria.label',
  role: 'slider',
  demoSeed: 25,
  makeSim: (params, seed, env) => makeSim(params, seed, env.mode, env.assistLevel, env.durationMs / 1000),
  makeView: (canvas, sim, env, compact) => new Mg25View(canvas, sim, env, compact),
  makeController,
  // The optional tone is closed with the instance.
  attach: (rt) => () => rt.view.sound.dispose(),
  makeCues(env) {
    let lastState = 'search';
    let lastMisses = 0;
    let strong = false;
    return (sim) => {
      if (sim.step === 0) {
        lastState = sim.state;
        lastMisses = 0;
        strong = false;
        return;
      }
      if (sim.misses !== lastMisses) {
        lastMisses = sim.misses;
        env.haptic(40);
      }
      if (sim.state !== lastState) {
        lastState = sim.state;
        if (sim.state === 'locked') env.haptic(sim.success ? [30, 40, 120] : [60, 60, 60]);
        else if (sim.state === 'lost') env.haptic([60, 60, 60]);
      }
      const nowStrong = sim.closeness > 0.7;
      if (nowStrong && !strong) env.haptic(12);
      strong = nowStrong;
    };
  },
  aria(sim, env) {
    const key = sim.state === 'locked' ? (sim.success ? 'locked' : 'slow') : sim.state === 'lost' ? 'lost' : sim.closeness > 0.55 ? 'strong' : 'search';
    return {
      now: Math.round(dialToKhz(sim.dial) * 10) / 10,
      min: -50,
      max: 50,
      text: env.t('minigame.MG-25.aria.value', {
        khz: fmtSigned(dialToKhz(sim.dial), 1),
        signal: Math.round(sim.signal * 100),
        state: env.t(STATE_ARIA[key]),
      }),
    };
  },
  demoInput(sim) {
    return goodPlayer(sim);
  },
};

const module: MinigameModule = {
  id: 'MG-25',
  create: (root, env) => runMinigame(root, env, spec),
  createDemo: (root, env) => runDemo(root, env, spec),
};

export default module;
