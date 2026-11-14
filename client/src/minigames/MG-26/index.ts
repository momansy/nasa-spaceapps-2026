// MG-26 Seven Minutes of Terror (design section 10.5).
//
// "Before entry, place your step of the landing sequence in the right order with the right timing,
// then watch the result arrive." Seven cards (heat shield, parachute, separate heat shield, radar,
// descent engines, sky crane, cut cables) are dealt by team slot; this player places their own cards
// on the seven-position board and sets each trigger (altitude in km or time in s), then sends the
// program; the sequence replays with the one-way light time (fact F20). Success: every own card in
// its right position with its trigger inside the window.
//
// Teams: per-player param `slot`, common param `slots`. Optional shared state: action `place`
// x = [card, position, trigger] with trigger = round(value × 100) in the card's unit (km or s);
// shared `seq` (number[7]) = card per position or −1. Without `env.coop` a seeded crew places the
// other cards. See README.md.
//
// This file is the glue: input (taps, drag slider, keyboard, one button), haptics and ARIA.
import { fmt } from '../../data/format';
import type { MinigameModule } from '../types';
import { clamp, runDemo, runMinigame, type Controller, type GameSpec, type Runtime } from '../MG-22/kit';
import { goodPlayer, N_CARDS, type Mg26Input, type Mg26Sim, makeSim } from './model';
import { Mg26View } from './render';

interface Queued extends Mg26Input {
  atStep: number;
}

function makeController(rt: Runtime<Mg26Sim, Mg26View>): Controller<Mg26Input> {
  const input: Mg26Input = { op: 0, card: 0, pos: 0, frac: 0 };
  const queue: Queued[] = [];
  let dragging = false;
  let dragFrac = -1;
  let held = false;
  /** Cards whose placement is reported to the host (`env.coop`) once the simulation has applied it. */
  const toSend: number[] = []; // flushed at the start of the next step; also holds the cards of actions just queued for the sim

  const push = (op: Mg26Input['op'], card: number, pos: number, frac: number, atStep: number) => {
    if (queue.length < 32) queue.push({ op, card, pos, frac, atStep });
  };
  const sendPlace = (card: number) => {
    const coop = rt.env.coop;
    const sim = rt.sim;
    if (coop && sim.cardPos[card]! >= 0) coop.send({ a: 'place', x: [card, sim.cardPos[card]!, Math.round(sim.valueOf(card) * 100)] });
  };
  /** Pick the next own card with the keys (wraps), −1 steps back. */
  const pickNext = (dir: number) => {
    const own = rt.sim.config.own;
    if (own.length === 0) return;
    const i = own.indexOf(rt.sim.active);
    rt.sim.active = own[(i + dir + own.length) % own.length]!;
  };

  return {
    sample(step) {
      input.op = 0;
      while (toSend.length > 0) sendPlace(toSend.shift()!);
      if (dragging && dragFrac >= 0 && rt.sim.active >= 0) {
        input.op = 3;
        input.card = rt.sim.active;
        input.frac = dragFrac;
        dragFrac = -1;
        return input;
      }
      const q = queue[0];
      if (q && q.atStep <= step) {
        queue.shift();
        // Reported at the start of the next step, once the simulation has applied the action.
        if (q.op === 1 || q.op === 3) toSend.push(q.card);
        else if (q.op === 5) {
          const next = rt.sim.trayCards()[0];
          if (next !== undefined) toSend.push(next);
        }
        input.op = q.op;
        input.card = q.card;
        input.pos = q.pos;
        input.frac = q.frac;
      }
      return input;
    },
    down(_e, x, y, clock) {
      const sim = rt.sim;
      const h = rt.view.hit(x, y);
      if (!h) return;
      held = true;
      const at = clock.stepNow();
      if (h.kind === 'field') push(5, 0, 0, 0, at);
      else if (h.kind === 'send') push(4, 0, 0, 0, at);
      else if (h.kind === 'chip') sim.active = h.card;
      else if (h.kind === 'slider') {
        dragging = true;
        dragFrac = h.frac;
      } else if (h.kind === 'row') {
        rt.view.cursor = h.pos;
        const there = sim.config.own.find((c) => sim.cardPos[c] === h.pos);
        if (there !== undefined) {
          if (sim.active === there) push(2, there, 0, 0, at); // a second tap takes it off
          else sim.active = there;
        } else if (sim.active >= 0 && sim.cardPos[sim.active]! < 0) {
          push(1, sim.active, h.pos, sim.frac[sim.active]!, at);
        } else if (sim.active >= 0) {
          push(1, sim.active, h.pos, sim.frac[sim.active]!, at); // move the picked card here
        }
      }
    },
    move(_e, x) {
      if (dragging) dragFrac = rt.view.fracAt(x);
    },
    up() {
      if (dragging && rt.sim.active >= 0) toSend.push(rt.sim.active);
      dragging = false;
      held = false;
    },
    key(e, down, clock) {
      const sim = rt.sim;
      const k = e.key;
      if (sim.config.oneButton) {
        if (k === ' ' || k === 'Enter') {
          if (down) push(5, 0, 0, 0, clock.stepNow());
          return true;
        }
        return false;
      }
      if (!down) return ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Enter', 'Backspace', 'Delete', 'PageUp', 'PageDown', '[', ']', 's', 'S'].includes(k);
      const at = clock.stepNow();
      const view = rt.view;
      switch (k) {
        case 'ArrowLeft':
          pickNext(-1);
          return true;
        case 'ArrowRight':
          pickNext(1);
          return true;
        case 'ArrowUp':
          view.cursor = (view.cursor + N_CARDS - 1) % N_CARDS;
          return true;
        case 'ArrowDown':
          view.cursor = (view.cursor + 1) % N_CARDS;
          return true;
        case 'Enter':
        case ' ':
          if (sim.active >= 0) {
            push(1, sim.active, view.cursor, sim.frac[sim.active]!, at);
            }
          return true;
        case 'Backspace':
        case 'Delete':
          if (sim.active >= 0) push(2, sim.active, 0, 0, at);
          return true;
        case 'PageUp':
        case 'PageDown':
        case '[':
        case ']': {
          if (sim.active < 0) return true;
          const d = k === 'PageUp' ? 0.05 : k === 'PageDown' ? -0.05 : k === ']' ? 0.01 : -0.01;
          push(3, sim.active, 0, clamp(sim.frac[sim.active]! + d, 0, 1), at);
          return true;
        }
        case 's':
        case 'S':
          push(4, 0, 0, 0, at);
          return true;
        default:
          return false;
      }
    },
    release() {
      dragging = false;
      held = false;
      dragFrac = -1;
    },
    active() {
      return dragging || held;
    },
  };
}

const spec: GameSpec<Mg26Input, Mg26Sim, Mg26View> = {
  id: 'MG-26',
  ariaLabelKey: 'minigame.MG-26.aria.label',
  role: 'application',
  demoSeed: 26,
  makeSim: (params, seed, env) => makeSim(params, seed, env.mode, env.assistLevel, env.durationMs / 1000),
  makeView: (canvas, sim, env, compact) => new Mg26View(canvas, sim, env, compact),
  makeController,
  attach(rt) {
    const coop = rt.env.coop;
    if (!coop) return () => undefined;
    return coop.onState((state) => {
      const s = state.shared['seq'];
      if (Array.isArray(s) && s.length === N_CARDS && s.every((v) => typeof v === 'number')) rt.sim.coopSeq = s as number[];
    });
  },
  makeCues(env) {
    let placed = 0;
    let phase = 'program';
    return (sim) => {
      if (sim.step === 0) {
        placed = 0;
        phase = 'program';
        return;
      }
      const n = sim.config.own.filter((c) => sim.cardPos[c]! >= 0).length;
      if (n > placed) env.haptic(15);
      placed = n;
      if (sim.phase !== phase) {
        phase = sim.phase;
        if (sim.phase === 'watch') env.haptic([40, 40, 40]);
      }
    };
  },
  aria(sim, env) {
    const own = sim.config.own;
    const placed = own.filter((c) => sim.cardPos[c]! >= 0).length;
    return {
      text:
        sim.phase === 'program'
          ? env.t('minigame.MG-26.aria.program', { placed, total: own.length, s: fmt(sim.leftS, 0) })
          : env.t('minigame.MG-26.aria.watch', { m: sim.lightMin }),
    };
  },
  demoInput(sim) {
    return goodPlayer(sim, demoBuf);
  },
};
const demoBuf: Mg26Input = { op: 0, card: 0, pos: 0, frac: 0 };

const module: MinigameModule = {
  id: 'MG-26',
  create: (root, env) => runMinigame(root, env, spec),
  createDemo: (root, env) => runDemo(root, env, spec),
};

export default module;
