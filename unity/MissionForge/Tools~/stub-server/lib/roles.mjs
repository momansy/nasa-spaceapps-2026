// Role groups, lobby assignment and rebalancing (messages.md section 5) for the stub server.
// `players` arguments are arrays of { id, slot, connected } ordered by slot.

import { ERR, ROLE_GROUP_TABLE, ROLES } from './protocol.mjs';

const roleIndex = (role) => ROLES.indexOf(role);
const byCanonical = (a, b) => roleIndex(a) - roleIndex(b);

/** The table groups for `count` players (at least one group), roles in canonical order. */
export function tableGroups(count) {
  const n = Math.min(10, Math.max(1, count));
  return ROLE_GROUP_TABLE[n].map((spec) => {
    const roles = spec.split('+').sort(byCanonical);
    return { lead: roles[0], roles };
  });
}

function shuffle(items, random) {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export class RoleBook {
  /** @param {() => number} random uniform [0, 1) source; the contract does not require seeding. */
  constructor(random = Math.random) {
    this.random = random;
    this.locked = false;
    /** Map playerId -> roles[] once roles were assigned (lock, set, rotate); null while table groups apply. */
    this.assignment = null;
    /** PICK mode: lead -> playerId. */
    this.picks = new Map();
    /** VOTE mode: voter -> candidate. */
    this.votes = new Map();
    this.abilitiesUsed = new Set();
  }

  /** roles.state payload. */
  view(mode, players) {
    let groups;
    if (this.assignment) {
      groups = [...this.assignment.entries()]
        .filter(([, roles]) => roles.length > 0)
        .map(([playerId, roles]) => {
          const sorted = [...roles].sort(byCanonical);
          return { lead: sorted[0], roles: sorted, playerId };
        })
        .sort((a, b) => roleIndex(a.lead) - roleIndex(b.lead));
    } else {
      groups = tableGroups(players.length).map((g) => ({
        ...g,
        playerId: mode === 'PICK' ? this.picks.get(g.lead) ?? null : null,
      }));
    }
    const slotOf = new Map(players.map((p) => [p.id, p.slot]));
    const counts = new Map();
    if (mode === 'VOTE' && !this.locked) {
      for (const candidate of this.votes.values()) counts.set(candidate, (counts.get(candidate) ?? 0) + 1);
    }
    const flightVotes = [...counts.entries()]
      .sort((a, b) => (slotOf.get(a[0]) ?? 99) - (slotOf.get(b[0]) ?? 99))
      .map(([playerId, n]) => ({ playerId, n }));
    return {
      mode,
      locked: this.locked,
      groups,
      flightVotes,
      abilitiesUsed: [...this.abilitiesUsed].sort(byCanonical),
    };
  }

  rolesOf(playerId) {
    return this.assignment?.get(playerId) ?? [];
  }

  /** Lobby: the player count changed while unlocked, so the groups are recomputed. */
  onCountChanged(players) {
    if (this.locked) return;
    this.assignment = null;
    this.picks.clear();
    const present = new Set(players.map((p) => p.id));
    for (const [voter, candidate] of this.votes) {
      if (!present.has(voter) || !present.has(candidate)) this.votes.delete(voter);
    }
  }

  clearLobbyChoices() {
    this.picks.clear();
    this.votes.clear();
  }

  /** roles.pick: returns an error { code, field } or null. */
  pick(playerId, lead, players) {
    // Validate first: a rejected message must have no effect (messages.md 12.1).
    if (lead !== null) {
      const leads = tableGroups(players.length).map((g) => g.lead);
      if (!leads.includes(lead)) return { code: 'BAD_PAYLOAD', field: 'lead' };
      const holder = this.picks.get(lead);
      if (holder && holder !== playerId) return { code: ERR.ROLE_TAKEN };
    }
    if (this.assignment) this.assignment = null; // back to table groups in the lobby
    for (const [l, holder] of this.picks) if (holder === playerId) this.picks.delete(l);
    if (lead !== null) this.picks.set(lead, playerId);
    return null;
  }

  vote(voter, candidate) {
    this.votes.set(voter, candidate);
  }

  /** roles.lock or leaving LOBBY: completes the assignment for `mode` (messages.md 5.2). */
  lock(mode, players) {
    const groups = tableGroups(players.length);
    const present = new Set(players.map((p) => p.id));
    const holders = new Map(); // group index -> playerId
    if (mode === 'PICK') {
      groups.forEach((g, i) => {
        const pid = this.picks.get(g.lead);
        if (pid && present.has(pid)) holders.set(i, pid);
      });
    } else if (mode === 'VOTE') {
      const counts = new Map();
      for (const candidate of this.votes.values()) if (present.has(candidate)) counts.set(candidate, (counts.get(candidate) ?? 0) + 1);
      let best = null;
      for (const p of players) {
        const n = counts.get(p.id) ?? 0;
        if (n > 0 && (best === null || n > best.n)) best = { id: p.id, n }; // players are in slot order: ties keep the lowest slot
      }
      if (best) holders.set(groups.findIndex((g) => g.roles.includes('FLIGHT')), best.id);
    }
    const taken = new Set(holders.values());
    const free = shuffle(players.filter((p) => !taken.has(p.id)).map((p) => p.id), this.random);
    groups.forEach((_, i) => {
      if (!holders.has(i) && free.length > 0) holders.set(i, free.shift());
    });
    this.assignment = new Map(players.map((p) => [p.id, []]));
    for (const [i, pid] of holders) this.assignment.get(pid).push(...groups[i].roles);
    this.locked = true;
  }

  /** roles.set: returns an error code or null. */
  set(assignments, players) {
    const present = new Set(players.map((p) => p.id));
    const seenPlayers = new Set();
    const seenRoles = new Set();
    for (const entry of assignments) {
      if (!present.has(entry.playerId)) return ERR.UNKNOWN_PLAYER;
      if (seenPlayers.has(entry.playerId)) return ERR.INVALID_ASSIGNMENT;
      seenPlayers.add(entry.playerId);
      for (const role of entry.roles) {
        if (seenRoles.has(role)) return ERR.INVALID_ASSIGNMENT;
        seenRoles.add(role);
      }
    }
    if (seenRoles.size !== ROLES.length) return ERR.INVALID_ASSIGNMENT;
    this.assignment = new Map(players.map((p) => [p.id, []]));
    for (const entry of assignments) this.assignment.set(entry.playerId, [...entry.roles].sort(byCanonical));
    this.locked = true;
    return null;
  }

  /** roles.rotate: group i goes to the player after its previous holder in slot order. */
  rotate(players) {
    const groups = tableGroups(players.length);
    const ids = players.map((p) => p.id);
    const used = new Set();
    const last = this.assignment ?? new Map();
    this.assignment = new Map(ids.map((id) => [id, []]));
    const previous = (lead) => {
      for (const [pid, roles] of last) if (roles.includes(lead)) return pid;
      return null;
    };
    groups.forEach((g, i) => {
      const prev = previous(g.lead);
      const start = prev && ids.includes(prev) ? (ids.indexOf(prev) + 1) % ids.length : i % ids.length;
      for (let k = 0; k < ids.length; k++) {
        const candidate = ids[(start + k) % ids.length];
        if (!used.has(candidate)) {
          used.add(candidate);
          this.assignment.get(candidate).push(...g.roles);
          return;
        }
      }
    });
    this.locked = true;
  }

  /** A player left after lock: all their roles go to the connected player with the fewest roles. */
  removePlayer(playerId, remaining) {
    for (const [lead, holder] of this.picks) if (holder === playerId) this.picks.delete(lead);
    this.votes.delete(playerId);
    for (const [voter, candidate] of this.votes) if (candidate === playerId) this.votes.delete(voter);
    if (!this.assignment) return;
    const roles = this.assignment.get(playerId) ?? [];
    this.assignment.delete(playerId);
    if (remaining.length === 0) {
      this.assignment = null;
      return;
    }
    if (roles.length === 0) return;
    const connected = remaining.filter((p) => p.connected);
    const pool = connected.length > 0 ? connected : remaining;
    let target = pool[0];
    for (const p of pool) if (this.rolesOf(p.id).length < this.rolesOf(target.id).length) target = p;
    this.assignment.set(target.id, [...this.rolesOf(target.id), ...roles].sort(byCanonical));
  }

  /** A player arrived after lock: the player with the most roles hands over the last floor(k/2). */
  addPlayer(playerId, players) {
    if (!this.assignment) return;
    let donor = null;
    for (const p of players) {
      if (p.id === playerId) continue;
      if (donor === null || this.rolesOf(p.id).length >= this.rolesOf(donor.id).length) donor = p; // ties: highest slot
    }
    const mine = [];
    if (donor) {
      const theirs = [...this.rolesOf(donor.id)].sort(byCanonical);
      const give = Math.floor(theirs.length / 2);
      mine.push(...theirs.splice(theirs.length - give, give));
      this.assignment.set(donor.id, theirs);
    }
    this.assignment.set(playerId, mine);
  }

  newMission() {
    this.abilitiesUsed.clear();
  }
}

/**
 * Applies roles.pick / roles.vote / roles.lock / roles.set / roles.rotate with their server
 * validation (messages.md 13). Returns null on success or { code, field? } on rejection, in
 * which case nothing changed.
 * @param {{ book: RoleBook, mode: string, phase: string, players: object[], senderId: string|null }} ctx
 */
export function applyRolesMessage(t, d, { book, mode, phase, players, senderId }) {
  switch (t) {
    case 'roles.pick':
      if (mode !== 'PICK' || book.locked) return { code: ERR.WRONG_PHASE };
      return book.pick(senderId, d.lead, players);
    case 'roles.vote':
      if (mode !== 'VOTE' || book.locked) return { code: ERR.WRONG_PHASE };
      if (!players.some((p) => p.id === d.playerId)) return { code: ERR.UNKNOWN_PLAYER };
      book.vote(senderId, d.playerId);
      return null;
    case 'roles.lock':
      if (phase !== 'LOBBY' || players.length === 0) return { code: ERR.WRONG_PHASE };
      book.lock(mode, players);
      return null;
    case 'roles.set': {
      const code = book.set(d.assignments, players);
      return code ? { code } : null;
    }
    case 'roles.rotate':
      if (!['LOBBY', 'CAMPAIGN_HUB'].includes(phase) || players.length === 0) return { code: ERR.WRONG_PHASE };
      book.rotate(players);
      return null;
    default:
      return { code: ERR.INTERNAL };
  }
}
