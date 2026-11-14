// Single-minigame lab (task T020). Mounts one minigame from `src/minigames/<id>/` in a
// 390 × 844 phone frame with the real theme, the real string tables and the host-screen
// chrome, so it can be played, screenshotted and measured without a room or a mock session.
//
// Query: mg (id), mode (STANDARD | RELAXED | ONE_BUTTON), assist (CADET | ENGINEER |
// FLIGHT_DIRECTOR), seed (uint32), dur (ms, default from data/minigames.json), p (URL-encoded
// JSON merged over the data params), demo=1 (intro with the demo loop), rm=1 (reduced motion),
// dir=rtl, scale=2 (text scale 1–2), hc=1 (high contrast), coop=1 (loop-back env.coop),
// slot / slots (shortcuts for p.slot / p.slots), hold=1 (mount, but start only on __lab.go()).
//
// window.__lab = { ready, result, haptics, progress, frames, error, instance }.
import '../../../src/theme/tokens.css';
import '../../../src/theme/base.css';
import '../../../src/theme/components.css';
import '../../../src/screens/minigame.css';
import type { AssistLevel, MgMap, MinigameMode } from '@protocol';
import { t } from '../../../src/i18n';
import { fmt } from '../../../src/data/format';
import { loadMinigame, type CoopState, type MinigameCoop, type MinigameEnv, type MinigameResult } from '../../../src/minigames/types';
import minigamesJson from '../../../../data/minigames.json';

interface DataEntry {
  id: string;
  name_key: string;
  how_to_play_key: string;
  success_key?: string;
  duration_s?: number;
  duration_per_player?: boolean;
  params?: MgMap;
}

interface LabState {
  ready: boolean;
  result: MinigameResult | null;
  results: number;
  haptics: Array<number | number[]>;
  progress: number[];
  frames: number[];
  sent: Array<{ a: string; x?: number[] }>;
  error: string | null;
  params: MgMap;
  durationMs: number;
  instance: { pause(): void; resume(): void; destroy(): void } | null;
  /** With hold=1: starts the run (the spec moves a fake clock first). */
  go: () => void;
}

declare global {
  interface Window {
    __lab: LabState;
  }
}

const lab: LabState = { ready: false, result: null, results: 0, haptics: [], progress: [], frames: [], sent: [], error: null, params: {}, durationMs: 0, instance: null, go: () => undefined };
window.__lab = lab;

const q = new URLSearchParams(location.search);
const id = q.get('mg') ?? 'MG-08';
const mode = (q.get('mode') ?? 'STANDARD') as MinigameMode;
const assist = (q.get('assist') ?? 'ENGINEER') as AssistLevel;
const seed = Number(q.get('seed') ?? '20251004') >>> 0;
const demo = q.get('demo') === '1';
const reducedMotion = q.get('rm') === '1';
const scale = Math.min(2, Math.max(1, Number(q.get('scale') ?? '1') || 1));

const html = document.documentElement;
html.dir = q.get('dir') === 'rtl' ? 'rtl' : 'ltr';
html.style.setProperty('--text-scale', String(scale));
html.dataset.textScale = scale >= 1.5 ? 'large' : 'normal';
html.dataset.motion = reducedMotion ? 'reduced' : 'full';
html.dataset.contrast = q.get('hc') === '1' ? 'high' : 'normal';

const entry: DataEntry =
  ((minigamesJson as unknown as { minigames: DataEntry[] }).minigames ?? []).find((m) => m.id === id) ??
  ({ id, name_key: `minigame.${id}.name`, how_to_play_key: `minigame.${id}.how_to_play` } as DataEntry);

let extra: MgMap = {};
try {
  const raw = q.get('p');
  if (raw) extra = JSON.parse(raw) as MgMap;
} catch (e) {
  lab.error = `bad p: ${String(e)}`;
}
const params: MgMap = { ...(entry.params ?? {}), ...extra };
if (q.has('slot')) params.slot = Number(q.get('slot'));
if (q.has('slots')) params.slots = Number(q.get('slots'));
if (typeof params.slot !== 'number') params.slot = 0;
if (typeof params.slots !== 'number') params.slots = 4;
lab.params = params;

function defaultDuration(): number {
  const base = (entry.duration_s ?? 20) * 1000;
  if (!entry.duration_per_player) return base;
  // RELAY: every player has one turn of `turnMs`.
  const turn = typeof params.turnMs === 'number' ? params.turnMs : base;
  return turn * (params.slots as number);
}
const durationMs = Number(q.get('dur') ?? defaultDuration());
lab.durationMs = durationMs;

/** Loop-back channel: the lab plays the host and stores each move as `<a>_<slot>` = x[0]. */
function loopbackCoop(): MinigameCoop {
  const shared: MgMap = {};
  let n = 0;
  const subs = new Set<(s: CoopState) => void>();
  const state = (): CoopState => ({ n, shared: { ...shared }, progress: [] });
  return {
    send(action) {
      lab.sent.push(action);
      n++;
      shared[`${action.a}_${params.slot as number}`] = action.x?.[0] ?? 1;
      shared.moves = n;
      const s = state();
      setTimeout(() => subs.forEach((cb) => cb(s)), 30);
    },
    onState(cb) {
      subs.add(cb);
      if (n > 0) cb(state());
      return () => subs.delete(cb);
    },
  };
}

function env(m: MinigameMode): MinigameEnv {
  return {
    mode: m,
    assistLevel: assist,
    durationMs,
    reducedMotion,
    t,
    haptic: (p) => {
      lab.haptics.push(p);
    },
    reportProgress: (p) => {
      lab.progress.push(p);
    },
    coop: q.get('coop') === '1' ? loopbackCoop() : undefined,
  };
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

// Records every animation frame (for the fps measurement of the spec).
const recordFrame = (ts: number) => {
  lab.frames.push(ts);
  if (lab.frames.length > 4000) lab.frames.splice(0, 1000);
  requestAnimationFrame(recordFrame);
};
requestAnimationFrame(recordFrame);

async function main() {
  const frame = document.getElementById('lab')!;
  const mod = await loadMinigame(id);
  if (!mod) {
    lab.error = `no minigame ${id}`;
    frame.appendChild(el('div', 'lab-error', lab.error));
    return;
  }

  if (demo) {
    // The intro of the host screen: name, one-line instruction, demo loop, success line.
    const screen = el('div', 'screen mg lab-intro');
    screen.dataset.testid = 'mg-intro';
    const head = el('div', 'mg-intro__head');
    head.appendChild(el('span', 'eyebrow', t('ui.mg.eyebrow')));
    head.appendChild(el('span', 'mg-intro__time num', `${fmt(Math.round(durationMs / 1000), 0)} s`));
    screen.appendChild(head);
    screen.appendChild(el('h1', 'title', t(entry.name_key)));
    screen.appendChild(el('p', 'mg-intro__how', t(entry.how_to_play_key)));
    const box = el('div', 'mg-demo');
    const stage = el('div', 'mg-demo__stage');
    box.appendChild(stage);
    box.appendChild(el('span', 'mg-demo__tag', t('ui.mg.demo')));
    screen.appendChild(box);
    if (entry.success_key) screen.appendChild(el('p', 'mg-intro__goal', t(entry.success_key)));
    frame.appendChild(screen);
    const d = mod.createDemo(stage, env('STANDARD'));
    lab.instance = { pause() {}, resume() {}, destroy: () => d.destroy() };
    lab.ready = true;
    return;
  }

  // The play screen of the host: name, mode chip, seconds left, time bar, then the stage.
  const screen = el('div', 'screen mg mg-play');
  screen.dataset.testid = 'mg-play';
  screen.dataset.mode = mode;
  const head = el('div', 'mg-play__head');
  head.appendChild(el('span', 'mg-play__name', t(entry.name_key)));
  if (mode !== 'STANDARD') head.appendChild(el('span', 'chip chip--accent', t(`ui.mg.mode.${mode}`)));
  head.appendChild(el('span', 'spacer'));
  const left = el('span', 'mg-play__left num');
  head.appendChild(left);
  screen.appendChild(head);
  const bar = el('div', 'timerbar mg-play__bar');
  const fill = el('div', 'timerbar__fill');
  bar.appendChild(fill);
  screen.appendChild(bar);
  const stage = el('div', 'mg-stage');
  screen.appendChild(stage);
  frame.appendChild(screen);

  let startedAt = performance.now();
  const tick = () => {
    const leftMs = Math.max(0, durationMs - (performance.now() - startedAt));
    const secs = Math.ceil(leftMs / 1000);
    left.textContent = `${fmt(secs, 0)} s`;
    left.classList.toggle('mg-play__left--low', secs <= 5);
    fill.style.transform = `scaleX(${Math.min(1, leftMs / durationMs)})`;
  };
  let timer = 0;
  const inst = mod.create(stage, env(mode));
  inst.onResult((r) => {
    lab.results++;
    lab.result = r;
    window.clearInterval(timer);
  });
  lab.instance = inst;
  const go = () => {
    lab.go = () => undefined;
    startedAt = performance.now();
    tick();
    timer = window.setInterval(tick, 100);
    inst.start(params, seed);
  };
  if (q.get('hold') === '1') {
    left.textContent = `${fmt(Math.ceil(durationMs / 1000), 0)} s`;
    lab.go = go;
  } else go();
  lab.ready = true;
}

main().catch((e) => {
  lab.error = String(e instanceof Error ? e.stack ?? e.message : e);
  console.error(e);
});
