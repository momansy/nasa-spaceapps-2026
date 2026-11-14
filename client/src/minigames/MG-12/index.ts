// MG-12 Engine-Out Rebalance (design section 10.5, flight phases F5 / F7, cooperative split, 20 s).
//
// "Each player controls one remaining engine's throttle/gimbal; balance the thrust around the
// center of mass to keep the rocket straight." Success: the net torque stays inside the zero
// zone (torque_zone_knm) for ≥ in_zone_fraction_min of the time (both game values). Fact F08.
//
// Glue only: rules in `model.ts`, drawing in `render.ts`, browser plumbing in
// `../MG-09/shared/kit.ts`.
import type { MgMap } from '@protocol';
import type { MinigameEnv, MinigameModule } from '../types';
import { replay, slotOf, type SimInput } from '../MG-09/shared/core';
import { mountDemo, mountGame, type CanvasGame } from '../MG-09/shared/kit';
import { fmt } from '../../data/format';
import { createLayout, newSim, resolveConfig, scriptedPad, type Mg12Sim } from './model';
import { Mg12View } from './render';

const KEY_THROTTLE = 0.02;
const KEY_GIMBAL_DEG = 0.25;

function makeGame(canvas: HTMLCanvasElement, env: MinigameEnv, params: MgMap, seed: number, preview: boolean): CanvasGame {
  const config = resolveConfig(params, env.mode, env.assistLevel);
  const durationMs = env.durationMs;
  const sim: Mg12Sim = newSim(config, params, seed, durationMs);
  const view = new Mg12View(canvas, sim, env.t, env.reducedMotion, false);
  const { slot, slots } = slotOf(params);
  const coop = preview ? undefined : env.coop;
  // Teammates' throttles from the host (decoration), engine of slot i = the i-th pick of the layout.
  const live = new Map<number, number>();
  const unsubscribe = coop?.onState((st) => {
    for (let i = 0; i < slots; i++) {
      if (i === slot) continue;
      const v = st.shared[`eng_${i}`];
      if (typeof v !== 'number') continue;
      const l = createLayout({ ...params, slot: i }, seed).mine;
      live.set(l, Math.min(1, Math.max(0, v / 100)));
    }
  });
  let dragId: number | null = null;
  let pressed = false;
  let lastZone = true;
  let lastRumble = -1e9;
  let lastSentMs = -1e9;
  let lastSent = '';

  const setFrom = (x: number, y: number, ms: number) => {
    const s = view.settingsAt(x, y);
    sim.push({ t: ms, k: 'c', v: s.throttle, w: s.gimbal });
  };

  return {
    advance: (ms) => sim.advanceTo(ms),
    afterAdvance(ms) {
      if (preview) return;
      const z = sim.inZone;
      if (z !== lastZone) {
        env.haptic(z ? 10 : [30, 30, 30]);
        lastZone = z;
        lastRumble = ms;
      } else if (!z && ms - lastRumble > 500) {
        env.haptic(20);
        lastRumble = ms;
      }
      // Throttle and gimbal to the host at most 4 times a second, when they change.
      if (coop && ms - lastSentMs >= 250) {
        const x = [Math.round(sim.cmdThrottle * 100), Math.round(sim.cmdGimbalDeg * 10)];
        const key = x.join(',');
        if (key !== lastSent) {
          coop.send({ a: 'eng', x });
          lastSent = key;
          lastSentMs = ms;
        }
      }
    },
    pointer(kind, x, y, ms, id) {
      if (config.oneButton) {
        if (kind === 'down') {
          pressed = true;
          sim.push({ t: ms, k: 'p' });
        } else if (kind === 'up') pressed = false;
        return;
      }
      if (kind === 'down') {
        dragId = id;
        setFrom(x, y, ms);
      } else if (kind === 'move' && dragId === id) setFrom(x, y, ms);
      else if (kind === 'up' && dragId === id) dragId = null;
    },
    key(kind, key, ms, repeat) {
      if (config.oneButton) {
        if (key !== ' ' && key !== 'Enter') return false;
        if (kind === 'down' && !repeat) {
          pressed = true;
          sim.push({ t: ms, k: 'p' });
        } else if (kind === 'up') pressed = false;
        return true;
      }
      let input: SimInput | null = null;
      if (key === 'ArrowUp') input = { t: ms, k: 't', v: KEY_THROTTLE };
      else if (key === 'ArrowDown') input = { t: ms, k: 't', v: -KEY_THROTTLE };
      else if (key === 'ArrowRight') input = { t: ms, k: 'g', v: KEY_GIMBAL_DEG };
      else if (key === 'ArrowLeft') input = { t: ms, k: 'g', v: -KEY_GIMBAL_DEG };
      if (!input) return false;
      if (kind === 'down') sim.push(input);
      return true;
    },
    release() {
      dragId = null;
      pressed = false;
    },
    draw(f) {
      view.draw({ timeMs: f.timeMs, active: dragId !== null || pressed, live, pausedText: f.paused ? env.t('minigame.MG-12.paused') : null });
    },
    resize: () => view.resize(),
    done: () => sim.done,
    result() {
      const s = replay(() => newSim(config, params, seed, durationMs), sim.log).score();
      return { success: s.success, perfect: s.perfect, score: s.score };
    },
    progress: () => sim.inZoneFraction,
    aria() {
      return {
        valuetext: env.t('minigame.MG-12.aria.value', {
          torque: fmt(Math.round(sim.netKnm), 0),
          state: env.t(sim.inZone ? 'minigame.MG-12.status.ok' : sim.netKnm > 0 ? 'minigame.MG-12.status.left' : 'minigame.MG-12.status.right'),
          throttle: Math.round(sim.cmdThrottle * 100),
          gimbal: fmt(sim.cmdGimbalDeg, 1),
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
    labelKey: env.mode === 'ONE_BUTTON' ? 'minigame.MG-12.aria.label_one' : 'minigame.MG-12.aria.label',
    make: (canvas, params, seed, preview) => makeGame(canvas, env, params, seed, preview),
  });
}

/** Demo: 9 s of a run in 3 s, a ghost finger steering on the pad. */
const DEMO_RUN_MS = 9000;
const DEMO_LOOP_MS = 3000;

function createDemo(root: HTMLElement, env: MinigameEnv) {
  return mountDemo(root, (canvas) => {
    const config = resolveConfig({}, 'STANDARD', env.assistLevel);
    const params = { slot: 0, slots: 4 };
    let sim = newSim(config, params, 12, 20_000);
    const view = new Mg12View(canvas, sim, env.t, env.reducedMotion, true);
    let inputs: SimInput[] = [];
    let next = 0;
    const reset = () => {
      sim = newSim(config, params, 12, 20_000);
      inputs = scriptedPad(() => newSim(config, params, 12, 20_000), 150, 0.1).filter((i) => i.t <= DEMO_RUN_MS);
      next = 0;
      view.setSim(sim);
    };
    reset();
    return {
      loopMs: DEMO_LOOP_MS,
      holdMs: 400,
      reset,
      frame(loopMs, timeMs) {
        const playMs = (loopMs / DEMO_LOOP_MS) * DEMO_RUN_MS;
        while (next < inputs.length && inputs[next]!.t <= playMs) sim.push(inputs[next++]!);
        sim.advanceTo(playMs);
        const p = view.pointOf(sim.cmdThrottle, sim.cmdGimbalDeg);
        view.draw({ timeMs, active: true, finger: { x: p.x + 4, y: p.y + 6, down: true } });
      },
      resize: () => view.resize(),
    };
  });
}

const module: MinigameModule = { id: 'MG-12', create, createDemo };

export default module;
