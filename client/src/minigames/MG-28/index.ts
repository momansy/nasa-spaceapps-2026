// MG-28 Root Cause Investigation (design section 10.5).
//
// "Combine your telemetry cards with those of your teammates to build the chain of evidence that
// leads to the root cause." Success: this player's final vote names the root cause. Perfect: also
// every own card is in a correct chain position (true-chain cards on their place, the others off
// the chain). The contract shared with T024 (the host's Investigation screen) is in README.md:
// common params `cause_options`, `cause_correct`, `clues`, `chain_len`; per-player `slot`, `cards`;
// actions `place` [clueIndex, chainSlot], `clear` [chainSlot], `vote` [optionIndex]; shared `chain`,
// `votes`, `locked`.
//
// This file is the glue: input (taps, keyboard, one button), haptics and ARIA.
import { fmt } from '../../data/format';
import type { MinigameModule } from '../types';
import { runDemo, runMinigame, type Controller, type GameSpec, type Runtime } from '../MG-22/kit';
import { FAILURE_MODES } from './clues';
import { goodPlayer, makeSim, N_OPTIONS, type Mg28Input, type Mg28Sim } from './model';
import { Mg28View } from './render';

interface Queued extends Mg28Input {
  atStep: number;
  /** Message to the host once the simulation has applied the action. */
  report: 'place' | 'clear' | 'vote' | null;
}

function makeController(rt: Runtime<Mg28Sim, Mg28View>): Controller<Mg28Input> {
  const input: Mg28Input = { op: 0, a: 0, b: 0 };
  const queue: Queued[] = [];
  let held = false;
  /** Messages for the host, with a check that the simulation really applied the action. */
  const toReport: Array<{ msg: { a: string; x: number[] }; ok: () => boolean }> = [];

  const push = (op: Mg28Input['op'], a: number, b: number, atStep: number, report: Queued['report'] = null) => {
    if (queue.length < 24) queue.push({ op, a, b, atStep, report });
  };
  const view = () => rt.view;
  const sim = () => rt.sim;
  const total = () => sim().inv.clues.length;

  const placeSelected = (slot: number, at: number) => {
    const s = sim();
    const i = view().sel;
    if (i < 0 || !s.own.includes(i)) return;
    push(1, i, slot, at, 'place');
  };

  return {
    sample(step) {
      input.op = 0;
      // Reports of the actions applied in the previous step (the state has changed by now).
      for (const r of toReport.splice(0)) if (r.ok()) rt.env.coop?.send(r.msg);
      const q = queue[0];
      if (q && q.atStep <= step) {
        queue.shift();
        input.op = q.op;
        input.a = q.a;
        input.b = q.b;
        const s = sim();
        if (q.report === 'place') toReport.push({ msg: { a: 'place', x: [q.a, q.b] }, ok: () => s.chain[q.b] === q.a });
        else if (q.report === 'clear') toReport.push({ msg: { a: 'clear', x: [q.a] }, ok: () => s.chain[q.a] === -1 });
        else if (q.report === 'vote') toReport.push({ msg: { a: 'vote', x: [q.a] }, ok: () => s.myVote === q.a });
        else if (q.op === 5) {
          // One-button: report what the press does (a place, a "set aside" is local only, or the vote).
          if (s.phase === 'place') {
            const card = s.inHand()[0];
            const slot = s.highlight;
            if (card !== undefined && slot < s.inv.chainLen) toReport.push({ msg: { a: 'place', x: [card, slot] }, ok: () => s.chain[slot] === card });
          } else {
            const o = s.highlight;
            toReport.push({ msg: { a: 'vote', x: [o] }, ok: () => s.myVote === o });
          }
        }
      }
      return input;
    },
    down(_e, x, y, clock) {
      const h = view().hit(x, y);
      if (!h) return;
      held = true;
      const at = clock.stepNow();
      const s = sim();
      switch (h.kind) {
        case 'field':
          push(5, 0, 0, at);
          break;
        case 'lock':
          push(4, 0, 0, at);
          break;
        case 'option':
          push(3, h.option, 0, at, 'vote');
          break;
        case 'clue':
          view().sel = h.index;
          break;
        case 'place': {
          view().cursor = h.slot;
          const here = s.displayChain()[h.slot] ?? -1;
          if (here >= 0 && here === view().sel && s.own.includes(here)) push(2, h.slot, 0, at, 'clear'); // a second tap takes it off
          else if (here >= 0 && view().sel !== here && !s.own.includes(view().sel)) view().sel = here;
          else placeSelected(h.slot, at);
          break;
        }
      }
    },
    move() {},
    up() {
      held = false;
    },
    key(e, down, clock) {
      const s = sim();
      const k = e.key;
      if (s.config.oneButton) {
        if (k === ' ' || k === 'Enter') {
          if (down) push(5, 0, 0, clock.stepNow());
          return true;
        }
        return false;
      }
      const used = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Enter', 'Backspace', 'Delete', '1', '2', '3', '4', 'l', 'L'].includes(k);
      if (!used) return false;
      if (!down) return true;
      const at = clock.stepNow();
      const v = view();
      if (k === 'ArrowRight') v.sel = (v.sel + 1) % total();
      else if (k === 'ArrowLeft') v.sel = (v.sel + total() - 1) % total();
      else if (k === 'ArrowDown') v.cursor = (v.cursor + 1) % s.inv.chainLen;
      else if (k === 'ArrowUp') v.cursor = (v.cursor + s.inv.chainLen - 1) % s.inv.chainLen;
      else if (k === 'Enter') placeSelected(v.cursor, at);
      else if (k === 'Backspace' || k === 'Delete') push(2, v.cursor, 0, at, 'clear');
      else if (k === 'l' || k === 'L') push(4, 0, 0, at);
      else push(3, Number(k) - 1, 0, at, 'vote');
      return true;
    },
    release() {
      held = false;
    },
    active() {
      return held;
    },
  };
}

const spec: GameSpec<Mg28Input, Mg28Sim, Mg28View> = {
  id: 'MG-28',
  ariaLabelKey: 'minigame.MG-28.aria.label',
  role: 'application',
  demoSeed: 28,
  makeSim: (params, seed, env) => makeSim(params, seed, env.mode, env.assistLevel, env.durationMs / 1000),
  makeView: (canvas, sim, env, compact) => new Mg28View(canvas, sim, env, compact),
  makeController,
  attach(rt) {
    const coop = rt.env.coop;
    if (!coop) return () => undefined;
    return coop.onState((state) => {
      const sh = state.shared;
      const chain = sh['chain'];
      const votes = sh['votes'];
      const locked = sh['locked'];
      const n = rt.sim.inv.chainLen;
      if (Array.isArray(chain) && chain.length === n && chain.every((v) => typeof v === 'number')) rt.sim.sharedChain = chain as number[];
      if (Array.isArray(votes) && votes.length === N_OPTIONS && votes.every((v) => typeof v === 'number')) rt.sim.sharedVotes = votes as number[];
      if (typeof locked === 'boolean') rt.sim.sharedLocked = locked;
    });
  },
  makeCues(env) {
    let placed = 0;
    let locked = false;
    return (sim) => {
      if (sim.step === 0) {
        placed = 0;
        locked = false;
        return;
      }
      const n = Array.prototype.filter.call(sim.chain, (v: number) => v >= 0).length;
      if (n > placed) env.haptic(15);
      placed = n;
      if (sim.locked && !locked) env.haptic(sim.success ? [25, 40, 25] : [60, 60, 60]);
      locked = sim.locked;
    };
  },
  aria(sim, env) {
    const c = sim.ownCorrect();
    const placed = sim.ownSlot.filter((s) => s !== -1).length;
    const vote = sim.myVote >= 0 ? env.t(`minigame.MG-28.cause.${FAILURE_MODES[sim.inv.options[sim.myVote]!]!}`) : env.t('minigame.MG-28.aria.none');
    return {
      text: env.t(sim.locked ? 'minigame.MG-28.aria.locked' : 'minigame.MG-28.aria.value', { placed, total: c.total, vote, s: fmt(sim.leftS, 0) }),
    };
  },
  demoInput(sim) {
    return goodPlayer(sim, demoBuf);
  },
};
const demoBuf: Mg28Input = { op: 0, a: 0, b: 0 };

const module: MinigameModule = {
  id: 'MG-28',
  create: (root, env) => runMinigame(root, env, spec),
  createDemo: (root, env) => runDemo(root, env, spec),
};

export default module;
