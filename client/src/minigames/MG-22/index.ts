// MG-22 Entry Corridor (design section 10.5).
//
// "Keep the angle icon of the capsule inside the narrow corridor: not too steep and not too
// shallow." Success: inside the corridor at least 85 % of the time. Fact F17. The team average
// of the mean angle (`value`, degrees) sets the real flight-path angle (aggregation team_average).
//
// This file is the glue: input (drag, keyboard, one button), haptics and ARIA. The rules are in
// `model.ts` (pure, deterministic), the drawing in `render.ts`, the shared plumbing in `kit.ts`.
import { fmtSigned } from '../../data/format';
import type { MinigameModule } from '../types';
import { clamp, runDemo, runMinigame, type Controller, type GameSpec, type Runtime } from './kit';
import { autopilot, makeSim, type Mg22Input, type Mg22Sim, type Zone } from './model';
import { Mg22View } from './render';

const KEY_STICK = 0.6;

function makeController(rt: Runtime<Mg22Sim, Mg22View>): Controller<Mg22Input> {
  const input: Mg22Input = { stick: 0, pressed: false };
  let dragging = false;
  let dragStartY = 0;
  let dragStick = 0;
  let stickDrag = 0;
  let pressedPointer = false;
  const keys = new Set<string>();
  const oneButton = () => rt.sim.config.oneButton;
  const isButtonKey = (k: string) => k === ' ' || k === 'Enter';

  return {
    sample() {
      let stick = stickDrag;
      if (!dragging) {
        stick = 0;
        if (keys.has('ArrowDown') || keys.has('ArrowRight')) stick += KEY_STICK;
        if (keys.has('ArrowUp') || keys.has('ArrowLeft')) stick -= KEY_STICK;
        if (keys.has('PageDown')) stick = 1;
        if (keys.has('PageUp')) stick = -1;
      }
      input.stick = clamp(stick, -1, 1);
      input.pressed = pressedPointer || keys.has(' ') || keys.has('Enter') || keys.has('ArrowDown');
      return input;
    },
    down(_e, _x, y) {
      if (oneButton()) {
        pressedPointer = true;
        return;
      }
      dragging = true;
      dragStartY = y;
      dragStick = 0;
      stickDrag = 0;
    },
    move(_e, _x, y) {
      if (!dragging) return;
      const range = rt.view.dragRangePx;
      dragStick = clamp(dragStick + (y - dragStartY) / range, -1, 1);
      dragStartY = y;
      stickDrag = dragStick;
    },
    up() {
      dragging = false;
      pressedPointer = false;
      stickDrag = 0;
      dragStick = 0;
    },
    key(e, down) {
      const k = e.key;
      const used = oneButton() ? isButtonKey(k) || k === 'ArrowDown' : ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'PageUp', 'PageDown'].includes(k);
      if (!used) return false;
      if (down) keys.add(k);
      else keys.delete(k);
      return true;
    },
    release() {
      dragging = false;
      pressedPointer = false;
      stickDrag = 0;
      dragStick = 0;
      keys.clear();
    },
    active() {
      return dragging || pressedPointer || keys.size > 0;
    },
  };
}

const ZONE_KEY: Record<Zone, string> = {
  [-1]: 'minigame.MG-22.aria.shallow',
  0: 'minigame.MG-22.aria.inside',
  1: 'minigame.MG-22.aria.steep',
};

const spec: GameSpec<Mg22Input, Mg22Sim, Mg22View> = {
  id: 'MG-22',
  ariaLabelKey: 'minigame.MG-22.aria.label',
  role: 'slider',
  demoSeed: 22,
  makeSim: (params, seed, env) => makeSim(params, seed, env.mode, env.assistLevel, env.durationMs / 1000),
  makeView: (canvas, sim, env, compact) => new Mg22View(canvas, sim, env, compact),
  makeController,
  makeCues(env) {
    let lastZone: Zone = 0;
    let lastRumbleS = -1;
    return (sim) => {
      if (sim.step === 0) {
        lastZone = sim.zone;
        return;
      }
      const t = sim.timeS;
      if (sim.zone !== lastZone) {
        if (sim.zone === 0) env.haptic(12);
        else {
          env.haptic([40, 30, 40]);
          lastRumbleS = t;
        }
        lastZone = sim.zone;
      } else if (sim.zone !== 0 && t - lastRumbleS > 0.45) {
        env.haptic(sim.zone === 1 ? 35 : 20);
        lastRumbleS = t;
      }
    };
  },
  aria(sim, env) {
    const c = sim.config;
    return {
      now: Math.round(sim.gammaDeg * 10) / 10,
      min: Math.round((c.steepDeg - 3) * 10) / 10,
      max: Math.round((c.shallowDeg + 3) * 10) / 10,
      text: env.t('minigame.MG-22.aria.value', { deg: fmtSigned(sim.gammaDeg, 1), zone: env.t(ZONE_KEY[sim.zone]) }),
    };
  },
  demoInput(sim) {
    // A steady hand with a little human wobble.
    const a = autopilot(sim);
    a.stick = clamp(a.stick + 0.05 * Math.sin(sim.step / 31), -1, 1);
    return a;
  },
};

const module: MinigameModule = {
  id: 'MG-22',
  create: (root, env) => runMinigame(root, env, spec),
  createDemo: (root, env) => runDemo(root, env, spec),
};

export default module;
