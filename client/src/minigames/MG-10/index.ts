// MG-10 Fairing Catch (design section 10.5, flight phase F6, reusable fairing only, cooperative
// split, 20 s).
//
// "Two fairing halves drift down under parafoils. Players steer recovery boats (in teams) to
// keep each half over the net." Success: your boat stays under its target ≥ 70 % of the time.
// `fairing_refund_fraction_max` is a host reward, not a success input.
//
// Glue only: rules in `model.ts`, drawing in `render.ts`, browser plumbing in
// `../MG-09/shared/kit.ts`.
import type { MgMap } from '@protocol';
import type { MinigameEnv, MinigameModule } from '../types';
import { replay, type SimInput } from '../MG-09/shared/core';
import { mountDemo, mountGame, type CanvasGame } from '../MG-09/shared/kit';
import { fmt } from '../../data/format';
import { newSim, resolveConfig, scriptedSteer, type Mg10Sim } from './model';
import { Mg10View } from './render';

function makeGame(canvas: HTMLCanvasElement, env: MinigameEnv, params: MgMap, seed: number, preview: boolean): CanvasGame {
  const config = resolveConfig(params, env.mode, env.assistLevel);
  const durationMs = env.durationMs;
  const sim: Mg10Sim = newSim(config, params, seed, durationMs);
  const view = new Mg10View(canvas, sim, env.t, env.reducedMotion, false);
  const coop = preview ? undefined : env.coop;
  // The teammate on the other half: the first other slot of the other parity.
  let liveCrewX: number | null = null;
  const unsubscribe = coop?.onState((st) => {
    for (let i = 0; i < sim.slots; i++) {
      if (i === sim.slot || i % 2 === sim.myHalf) continue;
      const v = st.shared[`boat_${i}`];
      if (typeof v === 'number') {
        liveCrewX = v;
        break;
      }
    }
  });
  let dragId: number | null = null;
  let aimX: number | null = null;
  let holdId: number | null = null;
  let keyDir = 0;
  let lastUnder = false;
  let lastRumble = -1e9;
  let lastSentMs = -1e9;

  return {
    advance: (ms) => sim.advanceTo(ms),
    afterAdvance(ms) {
      if (preview) return;
      const u = sim.under;
      if (u !== lastUnder) {
        env.haptic(u ? 12 : [30, 30, 30]);
        lastUnder = u;
        lastRumble = ms;
      } else if (!u && ms - lastRumble > 600) {
        env.haptic(18);
        lastRumble = ms;
      }
      if (coop && ms - lastSentMs >= 300) {
        coop.send({ a: 'boat', x: [Math.round(sim.boatX)] });
        lastSentMs = ms;
      }
    },
    pointer(kind, x, _y, ms, id) {
      if (config.oneButton) {
        if (kind === 'down' && holdId === null) {
          holdId = id;
          sim.push({ t: ms, k: 'h', v: 1 });
        } else if (kind === 'up' && holdId === id) {
          holdId = null;
          sim.push({ t: ms, k: 'h', v: 0 });
        }
        return;
      }
      if (kind === 'down') dragId = id;
      if ((kind === 'down' || kind === 'move') && dragId === id) {
        aimX = view.worldX(x);
        sim.push({ t: ms, k: 'x', v: aimX });
      } else if (kind === 'up' && dragId === id) dragId = null;
    },
    key(kind, key, ms, repeat) {
      if (config.oneButton) {
        if (key !== ' ' && key !== 'Enter') return false;
        if (kind === 'down' && !repeat) sim.push({ t: ms, k: 'h', v: 1 });
        else if (kind === 'up') sim.push({ t: ms, k: 'h', v: 0 });
        return true;
      }
      if (key !== 'ArrowLeft' && key !== 'ArrowRight') return false;
      const d = key === 'ArrowLeft' ? -1 : 1;
      if (kind === 'down' && !repeat && keyDir !== d) {
        keyDir = d;
        sim.push({ t: ms, k: 'k', v: d });
      } else if (kind === 'up' && keyDir === d) {
        keyDir = 0;
        sim.push({ t: ms, k: 'k', v: 0 });
      }
      aimX = null;
      return true;
    },
    release(ms) {
      dragId = null;
      if (keyDir !== 0) sim.push({ t: ms, k: 'k', v: 0 });
      keyDir = 0;
      if (holdId !== null || config.oneButton) sim.push({ t: ms, k: 'h', v: 0 });
      holdId = null;
    },
    draw(f) {
      view.draw({ timeMs: f.timeMs, active: dragId !== null || holdId !== null || keyDir !== 0 || sim.holding, aimX, liveCrewX, pausedText: f.paused ? env.t('minigame.MG-10.paused') : null });
    },
    resize: () => view.resize(),
    done: () => sim.done,
    result() {
      const s = replay(() => newSim(config, params, seed, durationMs), sim.log).score();
      return { success: s.success, perfect: s.perfect, score: s.score };
    },
    progress: () => sim.underFraction,
    aria() {
      const g = sim.gapM;
      return {
        valuetext: env.t('minigame.MG-10.aria.value', {
          state: env.t(sim.under ? 'minigame.MG-10.status.under' : g > 0 ? 'minigame.MG-10.status.left' : 'minigame.MG-10.status.right', { m: fmt(Math.abs(g), 0) }),
          alt: Math.round(sim.altitudeM),
        }),
      };
    },
    dispose() {
      unsubscribe?.();
    },
  };
}

function create(root: HTMLElement, env: MinigameEnv) {
  return mountGame(root, env, {
    role: 'application',
    labelKey: env.mode === 'ONE_BUTTON' ? 'minigame.MG-10.aria.label_one' : 'minigame.MG-10.aria.label',
    make: (canvas, params, seed, preview) => makeGame(canvas, env, params, seed, preview),
  });
}

/** Demo: 12 s of a run in 3 s, a ghost finger steering the boat under its half. */
const DEMO_RUN_MS = 12_000;
const DEMO_LOOP_MS = 3000;

function createDemo(root: HTMLElement, env: MinigameEnv) {
  return mountDemo(root, (canvas) => {
    const config = resolveConfig({}, 'STANDARD', env.assistLevel);
    const params = { slot: 0, slots: 4 };
    let sim = newSim(config, params, 10, 20_000);
    const view = new Mg10View(canvas, sim, env.t, env.reducedMotion, true);
    let inputs: SimInput[] = [];
    let next = 0;
    let aim = 0;
    const reset = () => {
      sim = newSim(config, params, 10, 20_000);
      inputs = scriptedSteer(() => newSim(config, params, 10, 20_000), 200, 0.3).filter((i) => i.t <= DEMO_RUN_MS);
      next = 0;
      aim = sim.boatX;
      view.setSim(sim);
    };
    reset();
    return {
      loopMs: DEMO_LOOP_MS,
      holdMs: 400,
      reset,
      frame(loopMs, timeMs) {
        const playMs = (loopMs / DEMO_LOOP_MS) * DEMO_RUN_MS;
        while (next < inputs.length && inputs[next]!.t <= playMs) {
          aim = inputs[next]!.v ?? aim;
          sim.push(inputs[next++]!);
        }
        sim.advanceTo(playMs);
        view.draw({ timeMs, active: true, aimX: aim, liveCrewX: null, finger: { x: aim, down: true } });
      },
      resize: () => view.resize(),
    };
  });
}

const module: MinigameModule = { id: 'MG-10', create, createDemo };

export default module;
