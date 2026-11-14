// MG-30 Mission Patch Design, cosmetic (design section 10.5, T019 step 9). Cooperative.
//
// "Each player contributes one patch element (shape, symbol, color, motto from a list). The
// team votes on the final patch." Always succeeds (participation). Fact F36.
//
// Team play: per-player `slot` picks the category (slot mod 4); `slots` is the team size. With
// `env.coop` the phone sends `pick` x = [category, option] and `vote` x = [candidate], and reads
// `mg.state.shared.elements` (number[4], option per category, −1 none) and `votes` (number[3]
// counts); failing those, the last move (`last_a`, `last_x`) as the mock host echoes it.
import type { MgMap } from '@protocol';
import type { CoopState, MinigameDemo, MinigameEnv, MinigameInstance, MinigameModule } from '../types';
import { DemoHost, focusQuietly, isButtonKey, listen, liveRegion, LoopHost, makeCanvas, watchSize, type HostedRun } from '../MG-02/kit';
import { CANDIDATES, CATEGORIES, Mg30Autopilot, Mg30Sim, OPTION_COUNT, resolveConfig, type Phase } from './model';
import { Mg30View } from './render';

const K = 'minigame.MG-30.';
const LETTERS = ['A', 'B', 'C'];

function create(root: HTMLElement, env: MinigameEnv): MinigameInstance {
  const canvas = makeCanvas(root);
  canvas.tabIndex = 0;
  canvas.setAttribute('role', 'application');
  canvas.setAttribute('aria-roledescription', env.t(K + 'aria.role'));
  const oneButton = env.mode === 'ONE_BUTTON';
  canvas.setAttribute('aria-label', env.t(oneButton ? K + 'aria.field_one' : K + 'aria.field'));
  const live = liveRegion(root, 400);
  // The playfield's current value (screen readers read it with the field).
  canvas.setAttribute('aria-describedby', live.id);
  const durS = env.durationMs / 1000;

  let sim = new Mg30Sim(resolveConfig({}, env.mode, env.assistLevel, durS), 0);
  const view = new Mg30View(canvas, sim, { compact: false, reducedMotion: env.reducedMotion, t: env.t });
  let auto: Mg30Autopilot | null = null;
  let pressed = false;
  let focus = -1;
  let lastPick = -1;
  let lastVote = -1;
  let lastHi = -1;
  let lastPhase: Phase = 'pick';
  let lastProgressS = 0;
  let unsub: (() => void) | null = null;
  const coop = env.coop;

  const onShared = (state: CoopState) => {
    const el = state.shared['elements'];
    if (Array.isArray(el)) el.slice(0, 4).forEach((v, c) => (sim.team[c] = typeof v === 'number' && c !== sim.config.category ? v : -1));
    else if (state.shared['last_a'] === 'pick' && Array.isArray(state.shared['last_x'])) {
      const [c, v] = state.shared['last_x'] as number[];
      if (typeof c === 'number' && typeof v === 'number' && c >= 0 && c < 4 && c !== sim.config.category && v >= 0 && v < OPTION_COUNT[c as 0 | 1 | 2 | 3]) sim.team[c] = v;
    }
    const votes = state.shared['votes'];
    if (Array.isArray(votes) && votes.length >= CANDIDATES) sim.teamVotes = votes.slice(0, CANDIDATES).map((v) => (typeof v === 'number' ? v : 0));
  };

  const optionName = (o: number) => env.t(`${K}${CATEGORIES[sim.config.category]}.${o}`);

  const host = new LoopHost<HostedRun>(env, {
    begin(params: MgMap, seed: number) {
      sim = new Mg30Sim(resolveConfig(params, env.mode, env.assistLevel, durS), seed);
      view.setSim(sim);
      if (coop) unsub = coop.onState(onShared);
      return {
        get done() {
          return sim.done;
        },
        tick() {
          const p = auto ? auto.apply(sim) : pressed;
          sim.tick(p);
        },
        result: () => sim.result(),
      };
    },
    draw(now, paused) {
      view.draw({ timeMs: now, focus: oneButton ? -1 : focus, pausedText: paused ? env.t(K + 'paused') : null });
    },
    afterSteps() {
      if (sim.pick !== lastPick) {
        lastPick = sim.pick;
        host.haptic(12);
        coop?.send({ a: 'pick', x: [sim.config.category, sim.pick] });
        live.say(env.t(K + 'aria.pick', { name: optionName(sim.pick) }), performance.now(), true);
      }
      if (sim.vote !== lastVote) {
        lastVote = sim.vote;
        host.haptic(12);
        coop?.send({ a: 'vote', x: [sim.vote] });
        live.say(env.t(K + 'aria.vote', { letter: LETTERS[sim.vote]! }), performance.now(), true);
      }
      const ph = sim.phase;
      if (ph !== lastPhase) {
        lastPhase = ph;
        focus = -1;
        host.haptic(8);
        if (ph === 'vote') live.say(env.t(K + 'vote.title'), performance.now(), true);
        if (ph === 'reveal') {
          host.haptic([14, 40, 14]);
          live.say(env.t(K + 'aria.winner', { letter: LETTERS[sim.winner()]! }), performance.now(), true);
        }
      }
      const hi = oneButton ? sim.highlight() : -1;
      if (hi !== lastHi) {
        lastHi = hi;
        if (hi >= 0) live.say(sim.phase === 'pick' ? optionName(hi) : LETTERS[hi]!, performance.now(), true);
      }
      if (sim.timeS - lastProgressS >= 0.5) {
        lastProgressS = sim.timeS;
        env.reportProgress((sim.pick >= 0 ? 0.5 : 0) + (sim.vote >= 0 ? 0.5 : 0));
      }
    },
    onPause() {
      pressed = false;
    },
  });

  const onDown = (e: PointerEvent) => {
    if (host.finished) return;
    e.preventDefault();
    focusQuietly(canvas);
    if (oneButton) {
      pressed = true;
      return;
    }
    if (!host.playing) return;
    const r = canvas.getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    const tIdx = view.hitTile(x, y);
    if (tIdx >= 0) sim.choose(tIdx);
    const cIdx = view.hitCand(x, y);
    if (cIdx >= 0) sim.castVote(cIdx);
  };
  const onUp = () => {
    pressed = false;
  };
  const onKeyDown = (e: KeyboardEvent) => {
    if (host.finished) return;
    if (oneButton) {
      if (isButtonKey(e)) {
        e.preventDefault();
        pressed = true;
      }
      return;
    }
    const n = sim.phase === 'pick' ? OPTION_COUNT[sim.config.category] : sim.phase === 'vote' ? CANDIDATES : 0;
    if (!n) return;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault();
      focus = (focus + 1 + n) % n;
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      focus = focus < 0 ? n - 1 : (focus - 1 + n) % n;
    } else if (isButtonKey(e) && focus >= 0) {
      e.preventDefault();
      if (sim.phase === 'pick') sim.choose(focus);
      else sim.castVote(focus);
      return;
    } else return;
    live.say(sim.phase === 'pick' ? optionName(focus) : LETTERS[focus]!, performance.now(), true);
  };
  const onKeyUp = (e: KeyboardEvent) => {
    if (isButtonKey(e)) pressed = false;
  };
  const noMenu = (e: Event) => e.preventDefault();

  const unlisten = listen(canvas, {
    pointerdown: onDown as (e: never) => void,
    pointerup: onUp,
    pointercancel: onUp,
    keydown: onKeyDown as (e: never) => void,
    keyup: onKeyUp as (e: never) => void,
    contextmenu: noMenu as (e: never) => void,
  });
  const unwatch = watchSize(root, () => {
    if (!host.destroyed) view.resize();
  });

  const instance: MinigameInstance & { __autoplay(on: boolean): void } = {
    start(params, seed) {
      host.start(params, seed);
      live.say(env.t(K + 'yours', { cat: env.t(`${K}cat.${sim.config.category}`) }), performance.now(), true);
      focusQuietly(canvas);
    },
    onResult: (cb) => host.onResult(cb),
    pause: () => host.pause(),
    resume: () => host.resume(),
    destroy() {
      if (host.destroyed) return;
      host.destroy();
      unsub?.();
      unwatch();
      unlisten();
      canvas.remove();
      live.remove();
    },
    /** Test hook (lab `auto=1`): picks option 3 and votes for patch A, at a calm pace. */
    __autoplay(on: boolean) {
      auto = on ? new Mg30Autopilot(2.5, 3) : null;
    },
  };
  return instance;
}

function createDemo(root: HTMLElement, env: MinigameEnv): MinigameDemo {
  const canvas = makeCanvas(root);
  canvas.setAttribute('aria-hidden', 'true');
  canvas.style.pointerEvents = 'none';
  // A colour contributor (slot 2): a tap on a colourway at 1 s recolours the patch.
  const config = resolveConfig({ slot: 2, slots: 4 }, 'STANDARD', env.assistLevel, 30);
  let sim = new Mg30Sim(config, 9);
  const view = new Mg30View(canvas, sim, { compact: true, reducedMotion: env.reducedMotion, t: env.t });
  const TILE = 2; // the third demo tile shows colourway 5 (dusk)
  const demo = new DemoHost(
    () => {
      sim = new Mg30Sim(config, 9);
      view.setSim(sim);
    },
    (phase, now) => {
      const wanted = Math.round(phase * 3 * 120);
      while (sim.step < wanted) {
        if (sim.step === 120) sim.choose(5);
        sim.tick();
      }
      const r = view.tiles[TILE]!;
      const t = sim.timeS;
      view.draw({ timeMs: now, finger: t < 2.2 ? { x: r.x + r.w * 0.6, y: r.y + r.h * 0.6, pressed: t > 0.85 && t < 1.1 } : null });
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

const module: MinigameModule = { id: 'MG-30', create, createDemo };

export default module;
