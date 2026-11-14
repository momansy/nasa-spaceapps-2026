// Role groups, assignment and rebalancing — GAME_DESIGN.md §3.2, §3.3; protocol/messages.md §5.
import { ROLE_IDS, type PlayerId, type RoleAssignMode, type RoleGroup, type RoleId } from '../../../protocol/ts/messages.js';

/** Canonical order index of a role (ROLE_IDS order: FLIGHT, BOOSTER, STRUCT, GUIDO, FIDO, EECOM, INCO, PAYLOAD, RETRO, PM). */
function roleOrder(role: RoleId): number {
  return ROLE_IDS.indexOf(role);
}

function sortRoles(roles: readonly RoleId[]): RoleId[] {
  return [...roles].sort((a, b) => roleOrder(a) - roleOrder(b));
}

/** First role of a group in canonical order; identifies the group in `roles.pick` (messages.md §5.1). */
export function leadOf(roles: readonly RoleId[]): RoleId {
  const sorted = sortRoles(roles);
  const first = sorted[0];
  if (first === undefined) throw new Error('leadOf: empty role list');
  return first;
}

/**
 * Role groups by player count, messages.md §5.1 table, in table order. Every entry's roles are
 * already in canonical order (adjacent merges never reorder).
 */
const ROLE_GROUP_TABLE: Readonly<Record<number, readonly RoleId[][]>> = {
  10: [['FLIGHT'], ['BOOSTER'], ['STRUCT'], ['GUIDO'], ['FIDO'], ['EECOM'], ['INCO'], ['PAYLOAD'], ['RETRO'], ['PM']],
  9: [['FLIGHT', 'PM'], ['BOOSTER'], ['STRUCT'], ['GUIDO'], ['FIDO'], ['EECOM'], ['INCO'], ['PAYLOAD'], ['RETRO']],
  8: [['FLIGHT', 'PM'], ['BOOSTER', 'STRUCT'], ['GUIDO'], ['FIDO'], ['EECOM'], ['INCO'], ['PAYLOAD'], ['RETRO']],
  7: [['FLIGHT', 'PM'], ['BOOSTER', 'STRUCT'], ['GUIDO', 'FIDO'], ['EECOM'], ['INCO'], ['PAYLOAD'], ['RETRO']],
  6: [['FLIGHT', 'PM'], ['BOOSTER', 'STRUCT'], ['GUIDO', 'FIDO'], ['EECOM', 'INCO'], ['PAYLOAD'], ['RETRO']],
  5: [['FLIGHT', 'PM'], ['BOOSTER', 'STRUCT'], ['GUIDO', 'FIDO'], ['EECOM', 'INCO'], ['PAYLOAD', 'RETRO']],
  4: [['FLIGHT', 'PM'], ['BOOSTER', 'STRUCT'], ['GUIDO', 'FIDO'], ['EECOM', 'INCO', 'PAYLOAD', 'RETRO']],
  3: [['FLIGHT', 'PM'], ['BOOSTER', 'STRUCT', 'GUIDO', 'FIDO'], ['EECOM', 'INCO', 'PAYLOAD', 'RETRO']],
  2: [['FLIGHT', 'PM', 'BOOSTER', 'STRUCT', 'GUIDO'], ['FIDO', 'EECOM', 'INCO', 'PAYLOAD', 'RETRO']],
  1: [[...ROLE_IDS]],
};

/** Role groups for *n* players (1–10), in table order, each with roles in canonical order. */
export function groupsForCount(n: number): RoleId[][] {
  const table = ROLE_GROUP_TABLE[clampCount(n)];
  if (!table) throw new Error(`groupsForCount: no table for ${n} players`);
  return table.map((g) => [...g]);
}

function clampCount(n: number): number {
  if (!Number.isInteger(n)) throw new Error(`groupsForCount: ${n} is not an integer`);
  if (n < 1) return 1;
  if (n > 10) return 10;
  return n;
}

/** The group (table row) that contains FLIGHT, for the given player count. Always table index 0. */
export function flightGroupIndex(_n: number): number {
  return 0;
}

export type Assignment = Map<PlayerId, RoleId[]>;

/** Builds the public `roles.state.groups` list from an assignment: one RoleGroup per holder, lead-sorted. */
export function toRoleGroups(assignment: Assignment): RoleGroup[] {
  const groups: RoleGroup[] = [];
  for (const [playerId, roles] of assignment) {
    const sorted = sortRoles(roles);
    groups.push({ lead: leadOf(sorted), roles: sorted, playerId });
  }
  groups.sort((a, b) => roleOrder(a.lead) - roleOrder(b.lead));
  return groups;
}

/** Fisher–Yates shuffle using an injectable rng (`() => number` in [0,1)), for deterministic tests. */
function shuffle<T>(items: readonly T[], rng: () => number): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = arr[i]!;
    arr[i] = arr[j]!;
    arr[j] = tmp;
  }
  return arr;
}

export interface LockInput {
  /** Current mode. */
  mode: RoleAssignMode;
  /** Players present at lock time, ordered by slot ascending (lowest slot first). */
  playersBySlot: PlayerId[];
  /** PICK mode: lead role of the group each player currently claims (messages.md §5.2). Stale leads
   *  (not a group of the current table) are ignored. */
  picks?: ReadonlyMap<PlayerId, RoleId>;
  /** VOTE mode: candidate each voter voted for, for the group containing FLIGHT (messages.md §5.2). */
  votes?: ReadonlyMap<PlayerId, PlayerId>;
  /** Injectable rng in [0,1); defaults to Math.random. */
  rng?: () => number;
}

/**
 * Computes the role assignment at lock time (`roles.lock` / leaving LOBBY), messages.md §5.2.
 * RANDOM: a uniform random permutation of players to table groups.
 * PICK: claimed groups stay with their claimers; the rest are dealt at random.
 * VOTE: the player with the most FLIGHT votes gets the FLIGHT group (ties: lowest slot; no votes:
 *       random); the other groups are dealt at random.
 */
export function lockAssignment(input: LockInput): Assignment {
  const { mode, playersBySlot } = input;
  const rng = input.rng ?? Math.random;
  const n = playersBySlot.length;
  const table = groupsForCount(n);
  const assignment: Assignment = new Map();

  if (mode === 'PICK') {
    const picks = input.picks ?? new Map<PlayerId, RoleId>();
    const tableLeads = new Set(table.map((g) => leadOf(g)));
    const claimedGroupIndexByPlayer = new Map<PlayerId, number>();
    const claimedIndices = new Set<number>();
    for (const [playerId, lead] of picks) {
      if (!tableLeads.has(lead)) continue; // stale claim, not a current group
      if (!playersBySlot.includes(playerId)) continue;
      const idx = table.findIndex((g) => leadOf(g) === lead);
      if (idx === -1 || claimedIndices.has(idx)) continue; // first claimant wins on conflict
      claimedGroupIndexByPlayer.set(playerId, idx);
      claimedIndices.add(idx);
    }
    for (const [playerId, idx] of claimedGroupIndexByPlayer) {
      assignment.set(playerId, [...table[idx]!]);
    }
    const remainingPlayers = shuffle(playersBySlot.filter((p) => !claimedGroupIndexByPlayer.has(p)), rng);
    const remainingGroupIndices = table.map((_, i) => i).filter((i) => !claimedIndices.has(i));
    remainingPlayers.forEach((playerId, i) => {
      const idx = remainingGroupIndices[i]!;
      assignment.set(playerId, [...table[idx]!]);
    });
    return assignment;
  }

  if (mode === 'VOTE') {
    const votes = input.votes ?? new Map<PlayerId, PlayerId>();
    const tally = new Map<PlayerId, number>();
    for (const candidate of votes.values()) {
      if (!playersBySlot.includes(candidate)) continue;
      tally.set(candidate, (tally.get(candidate) ?? 0) + 1);
    }
    let winner: PlayerId | undefined;
    if (tally.size > 0) {
      let best = -1;
      for (const playerId of playersBySlot) {
        const count = tally.get(playerId) ?? 0;
        if (count > best) {
          best = count;
          winner = playerId;
        }
      }
      if (best <= 0) winner = undefined;
    }
    if (winner === undefined) {
      const idx = Math.floor(rng() * playersBySlot.length);
      winner = playersBySlot[Math.min(idx, playersBySlot.length - 1)];
    }
    const flightIdx = flightGroupIndex(n);
    assignment.set(winner!, [...table[flightIdx]!]);
    const remainingPlayers = shuffle(playersBySlot.filter((p) => p !== winner), rng);
    const remainingGroupIndices = table.map((_, i) => i).filter((i) => i !== flightIdx);
    remainingPlayers.forEach((playerId, i) => {
      const idx = remainingGroupIndices[i]!;
      assignment.set(playerId, [...table[idx]!]);
    });
    return assignment;
  }

  // RANDOM (default)
  const shuffled = shuffle(playersBySlot, rng);
  shuffled.forEach((playerId, i) => {
    assignment.set(playerId, [...table[i]!]);
  });
  return assignment;
}

/**
 * A player leaves (room.leave, kick, slot hold elapsed): all their roles go, as one block, to the
 * connected player with the fewest roles (ties: lowest slot; if nobody is connected, the player
 * with the fewest roles overall). messages.md §5.3.
 */
export function onLeave(
  assignment: Assignment,
  leavingPlayerId: PlayerId,
  remainingPlayersBySlot: PlayerId[],
  connected: ReadonlySet<PlayerId>,
): Assignment {
  const leavingRoles = assignment.get(leavingPlayerId);
  const next: Assignment = new Map(assignment);
  next.delete(leavingPlayerId);
  if (!leavingRoles || leavingRoles.length === 0 || remainingPlayersBySlot.length === 0) return next;

  const pool = remainingPlayersBySlot.filter((p) => connected.has(p));
  const candidates = pool.length > 0 ? pool : remainingPlayersBySlot;

  let recipient: PlayerId | undefined;
  let fewest = Number.POSITIVE_INFINITY;
  for (const playerId of candidates) {
    const count = next.get(playerId)?.length ?? 0;
    if (count < fewest) {
      fewest = count;
      recipient = playerId;
    }
  }
  if (recipient === undefined) return next;
  next.set(recipient, sortRoles([...(next.get(recipient) ?? []), ...leavingRoles]));
  return next;
}

/**
 * A player arrives (join during BRIEFING/CONTRACT_VOTE, or promotion): the player holding the most
 * roles (ties: highest slot) hands over the last ⌊k/2⌋ of their k roles in canonical order.
 * messages.md §5.3.
 */
export function onArrive(assignment: Assignment, newPlayerId: PlayerId, playersBySlotDescending: PlayerId[]): Assignment {
  if (assignment.size === 0) {
    const next: Assignment = new Map(assignment);
    next.set(newPlayerId, []);
    return next;
  }
  let donor: PlayerId | undefined;
  let most = -1;
  // playersBySlotDescending: all current holders ordered by slot descending, so the first match
  // with the max role count is the highest-slot holder (tie-break: highest slot).
  for (const playerId of playersBySlotDescending) {
    const count = assignment.get(playerId)?.length ?? 0;
    if (count > most) {
      most = count;
      donor = playerId;
    }
  }
  const next: Assignment = new Map(assignment);
  if (donor === undefined) {
    next.set(newPlayerId, []);
    return next;
  }
  const donorRoles = sortRoles(next.get(donor) ?? []);
  const handOverCount = Math.floor(donorRoles.length / 2);
  const kept = donorRoles.slice(0, donorRoles.length - handOverCount);
  const handedOver = donorRoles.slice(donorRoles.length - handOverCount);
  next.set(donor, kept);
  next.set(newPlayerId, handedOver);
  return next;
}

/**
 * Campaign rotation between missions (`roles.rotate`, messages.md §5.3): recompute the fresh group
 * table for the current player count, and give table group *i* to the player who is next in slot
 * order after the previous holder of group *i*. "Previous holder of group i" is read off the current
 * assignment's groups sorted into the same canonical (lead) order as the fresh table — exact when the
 * assignment still matches the table shape (the common case); documented simplification otherwise.
 */
export function onRotate(assignment: Assignment, playersBySlot: PlayerId[]): Assignment {
  const n = playersBySlot.length;
  const table = groupsForCount(n);
  const previousGroups = toRoleGroups(assignment); // sorted by lead, i.e. table order
  const next: Assignment = new Map();
  table.forEach((groupRoles, i) => {
    const previousHolder = previousGroups[i]?.playerId ?? playersBySlot[i % playersBySlot.length]!;
    const idx = playersBySlot.indexOf(previousHolder);
    const nextSlotIdx = idx === -1 ? i % playersBySlot.length : (idx + 1) % playersBySlot.length;
    const newHolder = playersBySlot[nextSlotIdx]!;
    next.set(newHolder, sortRoles([...(next.get(newHolder) ?? []), ...groupRoles]));
  });
  return next;
}
