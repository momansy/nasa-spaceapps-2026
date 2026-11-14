// MG-10a Staging Timing (design section 10.5, flight phase F5, team sync, 10 s).
//
// "The engine-cutoff light flashes and propellant gauges drain. Everyone taps SEPARATE in the
// green window just after cutoff, then IGNITE after settling." Success: each tap within
// ±tap_window_s (0.3 s). Perfect: both within ±0.1 s (game value). Fact F03.
//
// Glue only: rules in `model.ts`, drawing in `render.ts`, browser plumbing in
// `../MG-09/shared/kit.ts`.
import type { MgMap } from '@protocol';
import type { MinigameEnv, MinigameModule } from '../types';
import { replay, slotOf, type SimInput } from '../MG-09/shared/core';
import { mountDemo, mountGame, type CanvasGame } from '../MG-09/shared/kit';
import { newSim, resolveConfig, tapInputs, type Mg10aSim } from './model';
import { Mg10aView, type Mate } from './render';

/** Haptic patterns (≤ 300 ms): STAGING thunk from lib/haptics, a shortened IGNITION ramp. */
const HAPTIC_STAGING = [90, 60, 30];
const HAPTIC_IGNITION = [40, 30, 60, 30, 120];

function makeGame(canvas: HTMLCanvasElement, env: MinigameEnv, params: MgMap, seed: number, preview: boolean): CanvasGame {
  const config = resolveConfig(params, env.mode, env.assistLevel);
  const durationMs = env.durationMs;
  const sim: Mg10aSim = newSim(config, params, seed, durationMs);
  const view = new Mg10aView(canvas, sim, env.t, env.reducedMotion, false);
  const { slot, slots } = slotOf(params);

  // Teammates: from the host when there is a channel, otherwise the seeded crew.
  const coop = preview ? undefined : env.coop;
  const mates: Mate[] = coop
    ? Array.from({ length: Math.max(0, slots - 1) }, () => ({ sep: null, ign: null, live: true }))
    : sim.plan.crew.map((c) => ({ sep: c.sep, ign: c.ign, live: false }));
  const others = Array.from({ length: slots }, (_, i) => i).filter((i) => i !== slot);
  const unsubscribe = coop?.onState((st) => {
    others.forEach((i, j) => {
      const m = mates[j];
      if (!m) return;
      const s = st.shared[`sep_${i}`];
      const g = st.shared[`ign_${i}`];
      if (typeof s === 'number') m.sep = s / 1000;
      if (typeof g === 'number') m.ign = g / 1000;
    });
  });

  let down: 'sep' | 'ign' | null = null;
  let sentSep = false;
  let sentIgn = false;
  let wasSeparated = false;
  let wasIgnited = false;
  let wasCutoff = false;

  const tap = (k: 'sep' | 'ign' | 'p', ms: number) => sim.push({ t: ms, k });

  return {
    advance: (ms) => sim.advanceTo(ms),
    afterAdvance() {
      if (preview) return;
      if (!wasCutoff && sim.cutoff) {
        wasCutoff = true;
        env.haptic(60);
      }
      if (!wasSeparated && sim.separated) {
        wasSeparated = true;
        env.haptic(HAPTIC_STAGING);
      }
      if (!wasIgnited && sim.ignited && sim.ign) {
        wasIgnited = true;
        env.haptic(HAPTIC_IGNITION);
      }
      // Tell the host how far off this player was (ms), once per step.
      if (coop && !sentSep && sim.sep) {
        sentSep = true;
        coop.send({ a: 'sep', x: [Math.round(sim.sep.dtS * 1000)] });
      }
      if (coop && !sentIgn && sim.ign) {
        sentIgn = true;
        coop.send({ a: 'ign', x: [Math.round(sim.ign.dtS * 1000)] });
      }
    },
    pointer(kind, x, y, ms) {
      if (kind === 'up') {
        down = null;
        return;
      }
      if (kind !== 'down') return;
      if (config.oneButton) {
        down = sim.nextStep === 'ign' ? 'ign' : 'sep';
        tap('p', ms);
        return;
      }
      const b = view.buttonAt(x, y);
      if (b) {
        down = b;
        tap(b, ms);
      }
    },
    key(kind, key, ms, repeat) {
      const k = key.toLowerCase();
      const isNext = key === ' ' || key === 'Enter';
      const isSep = k === 's' || key === '1';
      const isIgn = k === 'i' || key === '2';
      if (!isNext && !isSep && !isIgn) return false;
      if (kind === 'up') {
        down = null;
        return true;
      }
      if (repeat) return true;
      if (config.oneButton || isNext) {
        down = sim.nextStep === 'ign' ? 'ign' : 'sep';
        tap(config.oneButton ? 'p' : down, ms);
      } else {
        down = isSep ? 'sep' : 'ign';
        tap(down, ms);
      }
      return true;
    },
    release() {
      down = null;
    },
    draw(f) {
      view.draw({ timeMs: f.timeMs, mates, down, pausedText: f.paused ? env.t('minigame.MG-10a.paused') : null });
    },
    resize: () => view.resize(),
    done: () => sim.done,
    result() {
      const s = replay(() => newSim(config, params, seed, durationMs), sim.log).score();
      return { success: s.success, perfect: s.perfect, score: s.score };
    },
    progress: () => (sim.sep?.ok ? 0.5 : 0) + (sim.ign?.ok ? 0.5 : 0),
    aria() {
      const step = sim.nextStep;
      const state = step === 'sep' ? (sim.cutoff ? 'cutoff' : 'burning') : step === 'ign' ? (sim.settle >= 1 ? 'ignite' : 'settling') : 'done';
      return { valuetext: env.t(`minigame.MG-10a.aria.${state}`) };
    },
    dispose() {
      unsubscribe?.();
    },
  };
}

function create(root: HTMLElement, env: MinigameEnv) {
  return mountGame(root, env, {
    role: 'application',
    labelKey: env.mode === 'ONE_BUTTON' ? 'minigame.MG-10a.aria.label_one' : 'minigame.MG-10a.aria.label',
    make: (canvas, params, seed, preview) => makeGame(canvas, env, params, seed, preview),
  });
}

/** Demo: the whole sequence from 0.4 s before cutoff to just after ignition, in about 3 s. */
function createDemo(root: HTMLElement, env: MinigameEnv) {
  return mountDemo(root, (canvas) => {
    const config = resolveConfig({}, 'STANDARD', env.assistLevel);
    const params = { slot: 0, slots: 4 };
    let sim = newSim(config, params, 3, 10_000);
    const view = new Mg10aView(canvas, sim, env.t, env.reducedMotion, true);
    let taps: SimInput[] = [];
    let next = 0;
    const p0 = () => sim.plan;
    const from = () => (p0().cutoffS - 0.6) * 1000;
    const to = () => (p0().ignS + 0.9) * 1000;
    let mates: Mate[] = [];
    const reset = () => {
      sim = newSim(config, params, 3, 10_000);
      taps = tapInputs(sim, 0.04, 0.03);
      next = 0;
      mates = sim.plan.crew.map((c) => ({ sep: c.sep, ign: c.ign, live: false }));
      view.setSim(sim);
    };
    reset();
    return {
      loopMs: 3200,
      holdMs: 600,
      reset,
      frame(loopMs, timeMs) {
        const playMs = from() + (loopMs / 3200) * (to() - from());
        while (next < taps.length && taps[next]!.t <= playMs) sim.push(taps[next++]!);
        sim.advanceTo(playMs);
        const nextTap = taps[next];
        const target: 'sep' | 'ign' = !sim.separated ? 'sep' : 'ign';
        const pressing = !!nextTap && nextTap.t - playMs < 160 && nextTap.t - playMs > -40;
        view.draw({ timeMs, mates, finger: target, fingerDown: pressing || (taps[next - 1] !== undefined && playMs - taps[next - 1]!.t < 160) });
      },
      resize: () => view.resize(),
    };
  });
}

const module: MinigameModule = { id: 'MG-10a', create, createDemo };

export default module;
