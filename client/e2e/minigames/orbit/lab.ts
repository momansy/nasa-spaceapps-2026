// Single-minigame lab for the orbit package (T021). Served by the Vite dev server:
//   /e2e/minigames/orbit/lab.html?mg=MG-13&mode=STANDARD&assist=ENGINEER&seed=7&dur=20000
// Query: mg, mode (STANDARD | RELAXED | ONE_BUTTON), assist (CADET | ENGINEER |
// FLIGHT_DIRECTOR), seed, dur (ms, default from data/minigames.json), p (URL-encoded JSON
// merged over the data params), demo=1, rm=1 (reduced motion), dir=rtl, scale=2 (text 200 %),
// coop=1 (local echo `env.coop` channel), auto=1 (the minigame's scripted good player, if any).
// Exposes `window.__lab = { ready, result, haptics, progress, frames, … }` for the spec.
import '../../../src/theme/base.css';
import '../../../src/theme/components.css';
import '../../../src/screens/minigame.css';
import type { AssistLevel, MgMap, MinigameMode } from '@protocol';
import { getMinigame } from '../../../src/data/catalog';
import { missingKeys, setLanguage, t } from '../../../src/i18n';
import { loadMinigame, type CoopState, type MinigameCoop, type MinigameEnv, type MinigameInstance, type MinigameResult } from '../../../src/minigames/types';
import minigameData from '../../../../data/minigames.json';

interface LabState {
  ready: boolean;
  error: string | null;
  result: MinigameResult | null;
  resultAtMs: number | null;
  haptics: Array<number | number[]>;
  progress: number[];
  frames: number;
  frameTimes: number[];
  sent: Array<{ a: string; x?: number[] }>;
  missing: () => string[];
  instance: MinigameInstance | null;
}

const q = new URLSearchParams(location.search);
const id = q.get('mg') ?? 'MG-13';
const mode = (q.get('mode') ?? 'STANDARD') as MinigameMode;
const assist = (q.get('assist') ?? 'ENGINEER') as AssistLevel;
const seed = Number(q.get('seed') ?? '7') >>> 0;
const demo = q.get('demo') === '1';
const reducedMotion = q.get('rm') === '1';
const dir = q.get('dir') === 'rtl' ? 'rtl' : 'ltr';
const scale = Math.min(2, Math.max(1, Number(q.get('scale') ?? '1') || 1));

const entry = (minigameData as { minigames: Array<{ id: string; duration_s?: number; params?: MgMap }> }).minigames.find((m) => m.id === id);
const durationMs = Number(q.get('dur') ?? '') || (entry?.duration_s ?? 20) * 1000;
let extra: MgMap = {};
try {
  extra = q.get('p') ? (JSON.parse(q.get('p')!) as MgMap) : {};
} catch {
  extra = {};
}
const params: MgMap = { ...(entry?.params ?? {}), slot: 0, slots: 1, ...extra };

const lab: LabState = {
  ready: false,
  error: null,
  result: null,
  resultAtMs: null,
  haptics: [],
  progress: [],
  frames: 0,
  frameTimes: [],
  sent: [],
  missing: missingKeys,
  instance: null,
};
(window as unknown as { __lab: LabState }).__lab = lab;

function countFrames() {
  lab.frames++;
  lab.frameTimes.push(performance.now());
  if (lab.frameTimes.length > 2000) lab.frameTimes.splice(0, 1000);
  requestAnimationFrame(countFrames);
}

/** A local stand-in for the host's shared state: echoes moves like `MockRoom.onMgAction`. */
function echoCoop(): MinigameCoop {
  const listeners = new Set<(s: CoopState) => void>();
  const shared: MgMap = {};
  let n = 0;
  let last: CoopState | null = null;
  const emit = () => {
    n++;
    last = { n, shared: { ...shared }, progress: [] };
    listeners.forEach((l) => l(last!));
  };
  return {
    send(action) {
      lab.sent.push(action);
      shared.moves = ((shared.moves as number) ?? 0) + 1;
      shared.last_a = action.a;
      shared.last_x = (action.x ?? []).slice(0, 8);
      emit();
    },
    onState(cb) {
      listeners.add(cb);
      if (last) cb(last);
      return () => listeners.delete(cb);
    },
  };
}

async function main() {
  document.documentElement.dir = dir;
  document.documentElement.style.setProperty('--text-scale', String(scale));
  if (reducedMotion) document.documentElement.dataset.motion = 'reduced';
  await setLanguage('en');
  document.documentElement.dir = dir;

  const frame = document.getElementById('frame')!;
  const mod = await loadMinigame(id);
  if (!mod) {
    lab.error = `no minigame ${id}`;
    frame.textContent = lab.error;
    return;
  }
  const def = getMinigame(id);
  const env: MinigameEnv = {
    mode,
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
    coop: q.get('coop') === '1' ? echoCoop() : undefined,
  };

  if (demo) {
    frame.innerHTML = `<div class="lab-intro"><span class="eyebrow"></span><p class="lab-intro__how"></p><p class="lab-intro__goal"></p><div class="lab-demo"><div id="stage"></div></div></div>`;
    frame.querySelector('.eyebrow')!.textContent = t(def.name_key);
    frame.querySelector('.lab-intro__how')!.textContent = t(def.how_to_play_key);
    frame.querySelector('.lab-intro__goal')!.textContent = def.success_key ? t(def.success_key) : '';
    mod.createDemo(document.getElementById('stage')!, { ...env, mode: 'STANDARD', coop: undefined, haptic: () => undefined });
  } else {
    frame.innerHTML = `<div class="screen mg mg-play" style="flex:1;min-height:0;display:flex;flex-direction:column">
      <div class="mg-play__head"><span class="mg-play__name"></span><span class="spacer" style="flex:1"></span><span class="mg-play__left num" id="left"></span></div>
      <div class="timerbar mg-play__bar" aria-hidden="true"><div class="timerbar__fill" id="bar"></div></div>
      <div class="mg-stage" id="stage"></div></div><div class="lab-result" id="res"></div>`;
    frame.querySelector('.mg-play__name')!.textContent = t(def.name_key);
    const stage = document.getElementById('stage')!;
    const inst = mod.create(stage, env);
    lab.instance = inst;
    const t0 = performance.now();
    inst.onResult((r) => {
      lab.result = r;
      lab.resultAtMs = Math.round(performance.now() - t0);
      const box = document.getElementById('res')!;
      box.textContent = JSON.stringify(r);
      if (q.get('showres') === '1') box.style.display = 'block';
    });
    inst.start(params, seed);
    if (q.getAll('auto').pop() === '1') (inst as MinigameInstance & { __autoplay?: (on: boolean) => void }).__autoplay?.(true);
    const left = document.getElementById('left')!;
    const bar = document.getElementById('bar')!;
    const tick = () => {
      const el = performance.now() - t0;
      const leftMs = Math.max(0, durationMs - el);
      left.textContent = `${Math.ceil(leftMs / 1000)} s`;
      bar.style.transform = `scaleX(${leftMs / durationMs})`;
      if (!lab.result) requestAnimationFrame(tick);
    };
    tick();
  }
  requestAnimationFrame(countFrames);
  lab.ready = true;
}

main().catch((e: unknown) => {
  lab.error = String(e);
  console.error(e);
});
