// The `env.coop` channel of a cooperative minigame run: moves go out as protocol `mg.action`,
// the host's shared state comes back as `mg.state` (via the store, which drops older states).
import type { AppState } from '../state/types';
import type { CoopState, MinigameCoop } from './types';

export interface CoopStore {
  getState(): AppState;
  subscribe(cb: () => void): () => void;
  minigameAction(runId: string, a: string, x?: number[]): void;
}

export function coopChannel(store: CoopStore, runId: string): MinigameCoop {
  return {
    send(action) {
      store.minigameAction(runId, action.a, action.x ?? []);
    },
    onState(cb) {
      let last: unknown = null;
      const check = () => {
        const mg = store.getState().mg;
        if (!mg || mg.start.runId !== runId || !mg.shared || mg.shared === last) return;
        last = mg.shared;
        const state: CoopState = { n: mg.shared.n, shared: mg.shared.shared, progress: mg.shared.progress };
        cb(state);
      };
      check();
      return store.subscribe(check);
    },
  };
}
