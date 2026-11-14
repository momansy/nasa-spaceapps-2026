// The one interface every minigame implements (ARCHITECTURE section 7):
// `start(params, seed)` and a result `{ success, perfect, score }`.
//
// A minigame lives in `src/minigames/<MG-id>/index.ts` and default-exports a `MinigameModule`.
// The host screen (`screens/MinigameScreen.tsx`) owns everything around it: the instruction
// line, the demo slot, the countdown to `startAtMs`, the time bar, pause handling, reporting
// `mg.result`, and the result screen with tier and fact.
import type { AssistLevel, MgMap, MinigameMode } from '@protocol';

export interface MinigameResult {
  /** The player met the minigame's success condition. */
  success: boolean;
  /** The player met the "perfect" condition (needed by everyone for Platinum). Implies success. */
  perfect: boolean;
  /** Performance quality 0–1. */
  score: number;
  /** Raw measurement for minigames whose team value steers the flight; otherwise omit. */
  value?: number | null;
}

/**
 * One move in a shared-state minigame, sent as protocol `mg.action` (`a`: action name defined by
 * the minigame, `x`: numeric arguments). The protocol carries nothing else, so keep moves to a
 * name and numbers. At most 10 per second.
 */
export interface CoopAction {
  a: string;
  x?: number[];
}

/** Shared state kept by the host, from protocol `mg.state` (newest only; older ones are dropped). */
export interface CoopState {
  /** State counter, increasing. */
  n: number;
  /** Shared state defined by the minigame (the host's board, counters, turn…). */
  shared: MgMap;
  /** Progress 0–1 per active player. */
  progress: Array<{ playerId: string; p: number }>;
}

/** Channel to the host for COOP_SPLIT, RELAY and TEAM_SYNC minigames. */
export interface MinigameCoop {
  /** Sends one move (`mg.action`). Dropped silently when the connection is down. */
  send(action: CoopAction): void;
  /** Receives every new shared state (`mg.state`); the latest known state is delivered at once. Returns an unsubscribe function. */
  onState(cb: (state: CoopState) => void): () => void;
}

export interface MinigameEnv {
  /** Input mode: STANDARD, RELAXED (wider windows) or ONE_BUTTON (design section 16). */
  mode: MinigameMode;
  /** Difficulty the minigame scales with (design 10.1 rule 6). */
  assistLevel: AssistLevel;
  /** Length of play in milliseconds, from `mg.start.durationMs`. */
  durationMs: number;
  /** No shake, fewer particles, no flashing. */
  reducedMotion: boolean;
  /** Translate a string key (interface language of this device). */
  t: (key: string, args?: Record<string, string | number>) => string;
  /** Vibrate if the device can and the player allows it. */
  haptic: (pattern: number | number[]) => void;
  /** Optional coarse progress 0–1 for the host's team meter (sent at most twice a second). */
  reportProgress: (p: number) => void;
  /**
   * Shared-state channel, present only for COOP_SPLIT, RELAY and TEAM_SYNC runs on a player's
   * phone (never for PARALLEL_SOLO runs or spectators). Every minigame must still work when it
   * is undefined (solo play, spectators, demo loop).
   */
  coop?: MinigameCoop;
}

/**
 * Keys the host screen always adds to `params` before `start(params, seed)`:
 * `slot` — this player's 0-based position in the task split / relay order (the host's
 * `mg.start.assignments[].index`, else the player's rank by seat among the room's players);
 * `slots` — the number of active players (assignments listed by the host, else room players).
 * The player's own `assignments[].params` are merged over the common `params` first.
 */
export const SLOT_PARAM = 'slot';
export const SLOTS_PARAM = 'slots';

export interface MinigameInstance {
  /**
   * Begins play now. `params` are the host's parameters (`mg.start.params`, defaults apply to
   * missing keys) and `seed` is the shared unsigned 32-bit seed: the same seed and the same
   * inputs must give the same run on every phone.
   */
  start(params: MgMap, seed: number): void;
  /** Registers the callback that receives the result exactly once, when play ends. */
  onResult(cb: (result: MinigameResult) => void): void;
  /** Freezes the minigame clock (game paused) and resumes it. */
  pause(): void;
  resume(): void;
  /** Stops everything and removes what was mounted. Safe to call at any time. */
  destroy(): void;
}

export interface MinigameDemo {
  destroy(): void;
}

export interface MinigameModule {
  /** Minigame id as in the design catalog, e.g. "MG-08". */
  id: string;
  /** Mounts the playfield into `root` (it fills the element) and returns the instance. */
  create(root: HTMLElement, env: MinigameEnv): MinigameInstance;
  /** Mounts a non-interactive loop of about 3 s that shows how to play (design 10.1 rule 4). */
  createDemo(root: HTMLElement, env: MinigameEnv): MinigameDemo;
}

type Loader = () => Promise<{ default: MinigameModule }>;

// Each minigame is its own lazy chunk: phones download only what the host starts.
const loaders = import.meta.glob('./*/index.ts') as Record<string, Loader>;

/** Ids of the minigames bundled with this build. */
export function availableMinigames(): string[] {
  return Object.keys(loaders)
    .map((p) => /^\.\/([^/]+)\/index\.ts$/.exec(p)?.[1])
    .filter((id): id is string => !!id);
}

/** Loads `src/minigames/<id>/`. Resolves to null when this build has no such minigame. */
export async function loadMinigame(id: string): Promise<MinigameModule | null> {
  const loader = loaders[`./${id}/index.ts`];
  if (!loader) return null;
  try {
    return (await loader()).default;
  } catch {
    return null;
  }
}
