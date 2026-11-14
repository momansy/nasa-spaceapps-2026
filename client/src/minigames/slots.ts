// Team slot of this phone in a minigame run (see `SLOT_PARAM` in types.ts). Pure.
import type { MgMap, MgStartPayload, PlayerInfo } from '@protocol';

export interface SlotInfo {
  /** 0-based position of this player. */
  slot: number;
  /** Number of active players. */
  slots: number;
}

export function slotInfo(start: Pick<MgStartPayload, 'assignments'>, meId: string | null, players: Pick<PlayerInfo, 'id' | 'slot'>[]): SlotInfo {
  if (start.assignments.length > 0) {
    const mine = meId ? start.assignments.find((a) => a.playerId === meId) : undefined;
    return { slot: mine ? mine.index : 0, slots: start.assignments.length };
  }
  const ordered = [...players].sort((a, b) => a.slot - b.slot);
  const idx = meId ? ordered.findIndex((p) => p.id === meId) : -1;
  return { slot: Math.max(0, idx), slots: Math.max(1, ordered.length) };
}

/** Parameters handed to `start()`: common params, then this player's own, then slot and slots. */
export function runParams(start: Pick<MgStartPayload, 'params' | 'assignments'>, meId: string | null, players: Pick<PlayerInfo, 'id' | 'slot'>[], extra: MgMap = {}): MgMap {
  const mine = meId ? start.assignments.find((a) => a.playerId === meId)?.params : undefined;
  const { slot, slots } = slotInfo(start, meId, players);
  return { ...start.params, ...(mine ?? {}), ...extra, slot, slots };
}
