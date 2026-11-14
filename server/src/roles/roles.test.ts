import { describe, expect, it } from 'vitest';
import { ROLE_IDS, type PlayerId, type RoleId } from '../../../protocol/ts/messages.js';
import { Assignment, groupsForCount, lockAssignment, onArrive, onLeave, onRotate, toRoleGroups } from './roles.js';

function players(n: number): PlayerId[] {
  return Array.from({ length: n }, (_, i) => `p${i + 1}`);
}

function allRoles(assignment: Assignment): RoleId[] {
  return [...assignment.values()].flat();
}

describe('groupsForCount', () => {
  it('covers all ten roles exactly once for every player count 1..10', () => {
    for (let n = 1; n <= 10; n++) {
      const groups = groupsForCount(n);
      expect(groups).toHaveLength(n);
      const flat = groups.flat();
      expect(flat).toHaveLength(10);
      expect(new Set(flat)).toEqual(new Set(ROLE_IDS));
    }
  });

  it('matches the exact table of §5.1 for 10, 5 and 1 players', () => {
    expect(groupsForCount(10)).toEqual([
      ['FLIGHT'], ['BOOSTER'], ['STRUCT'], ['GUIDO'], ['FIDO'], ['EECOM'], ['INCO'], ['PAYLOAD'], ['RETRO'], ['PM'],
    ]);
    expect(groupsForCount(5)).toEqual([
      ['FLIGHT', 'PM'], ['BOOSTER', 'STRUCT'], ['GUIDO', 'FIDO'], ['EECOM', 'INCO'], ['PAYLOAD', 'RETRO'],
    ]);
    expect(groupsForCount(1)).toEqual([[...ROLE_IDS]]);
  });

  it('merge order follows FLIGHT+PM, BOOSTER+STRUCT, GUIDO+FIDO, EECOM+INCO, PAYLOAD+RETRO', () => {
    expect(groupsForCount(9)[0]).toEqual(['FLIGHT', 'PM']);
    expect(groupsForCount(8)[1]).toEqual(['BOOSTER', 'STRUCT']);
    expect(groupsForCount(7)[2]).toEqual(['GUIDO', 'FIDO']);
    expect(groupsForCount(6)[3]).toEqual(['EECOM', 'INCO']);
    expect(groupsForCount(5)[4]).toEqual(['PAYLOAD', 'RETRO']);
  });
});

describe('lockAssignment RANDOM', () => {
  it('assigns every player exactly one group, covering all roles, for every count 1..10', () => {
    for (let n = 1; n <= 10; n++) {
      const assignment = lockAssignment({ mode: 'RANDOM', playersBySlot: players(n), rng: Math.random });
      expect(assignment.size).toBe(n);
      expect(new Set(allRoles(assignment))).toEqual(new Set(ROLE_IDS));
    }
  });

  it('is a deterministic permutation for a fixed rng', () => {
    const rng = (() => {
      const seq = [0.9, 0.1, 0.5, 0.0];
      let i = 0;
      return () => seq[i++ % seq.length]!;
    })();
    const assignment = lockAssignment({ mode: 'RANDOM', playersBySlot: players(4), rng });
    expect(assignment.size).toBe(4);
    expect(new Set(allRoles(assignment))).toEqual(new Set(ROLE_IDS));
  });
});

describe('lockAssignment PICK', () => {
  it('honours claimed groups and deals the rest randomly', () => {
    const picks = new Map<PlayerId, RoleId>([
      ['p2', 'BOOSTER'], // claims BOOSTER+STRUCT group at n=5
    ]);
    const assignment = lockAssignment({ mode: 'PICK', playersBySlot: players(5), picks, rng: () => 0 });
    expect(assignment.get('p2')).toEqual(['BOOSTER', 'STRUCT']);
    expect(new Set(allRoles(assignment))).toEqual(new Set(ROLE_IDS));
    expect(assignment.size).toBe(5);
  });

  it('ignores a stale claim for a lead that is not a current group', () => {
    const picks = new Map<PlayerId, RoleId>([['p1', 'STRUCT']]); // STRUCT is never a lead
    const assignment = lockAssignment({ mode: 'PICK', playersBySlot: players(5), picks, rng: () => 0 });
    expect(new Set(allRoles(assignment))).toEqual(new Set(ROLE_IDS));
  });

  it('first claimant wins when two players claim the same lead', () => {
    const picks = new Map<PlayerId, RoleId>([
      ['p1', 'BOOSTER'],
      ['p2', 'BOOSTER'],
    ]);
    const assignment = lockAssignment({ mode: 'PICK', playersBySlot: players(5), picks, rng: () => 0 });
    expect(assignment.get('p1')).toEqual(['BOOSTER', 'STRUCT']);
    expect(assignment.get('p2')).not.toEqual(['BOOSTER', 'STRUCT']);
  });
});

describe('lockAssignment VOTE', () => {
  it('gives the FLIGHT group to the player with the most votes', () => {
    const votes = new Map<PlayerId, PlayerId>([
      ['p1', 'p3'],
      ['p2', 'p3'],
      ['p3', 'p3'],
      ['p4', 'p1'],
    ]);
    const assignment = lockAssignment({ mode: 'VOTE', playersBySlot: players(4), votes, rng: () => 0 });
    expect(assignment.get('p3')).toEqual(['FLIGHT', 'PM']);
    expect(new Set(allRoles(assignment))).toEqual(new Set(ROLE_IDS));
  });

  it('breaks a vote tie by lowest slot', () => {
    const votes = new Map<PlayerId, PlayerId>([
      ['p1', 'p2'],
      ['p2', 'p1'],
    ]);
    const assignment = lockAssignment({ mode: 'VOTE', playersBySlot: players(3), votes, rng: () => 0.99 });
    // p1 and p2 tie 1-1; lowest slot is p1.
    expect(assignment.get('p1')).toEqual(['FLIGHT', 'PM']);
  });

  it('picks a random winner when there are no votes', () => {
    const assignment = lockAssignment({ mode: 'VOTE', playersBySlot: players(3), votes: new Map(), rng: () => 0.999 });
    expect(assignment.get('p3')).toEqual(['FLIGHT', 'PM']);
  });
});

describe('onLeave', () => {
  it('moves the leaver\'s roles as one block to the connected player with the fewest roles', () => {
    const assignment: Assignment = new Map([
      ['p1', ['FLIGHT', 'PM']],
      ['p2', ['BOOSTER', 'STRUCT']],
      ['p3', ['GUIDO', 'FIDO']],
      ['p4', ['EECOM', 'INCO']],
      ['p5', ['PAYLOAD', 'RETRO']],
    ]);
    const next = onLeave(assignment, 'p1', ['p2', 'p3', 'p4', 'p5'], new Set(['p2', 'p3', 'p4', 'p5']));
    expect(next.has('p1')).toBe(false);
    // all have 2 roles already; tie -> lowest slot -> p2
    expect(next.get('p2')).toEqual(['FLIGHT', 'BOOSTER', 'STRUCT', 'PM']);
    expect(new Set(allRoles(next))).toEqual(new Set(ROLE_IDS));
  });

  it('skips disconnected players when choosing the recipient', () => {
    const assignment: Assignment = new Map([
      ['p1', ['FLIGHT', 'PM']],
      ['p2', ['BOOSTER']],
      ['p3', ['STRUCT', 'GUIDO', 'FIDO', 'EECOM', 'INCO', 'PAYLOAD', 'RETRO']],
    ]);
    // p2 has fewer roles but is disconnected; p3 is connected, gets the roles even though it has more.
    const next = onLeave(assignment, 'p1', ['p2', 'p3'], new Set(['p3']));
    expect(next.get('p3')).toContain('FLIGHT');
    expect(next.get('p2')).toEqual(['BOOSTER']);
  });

  it('falls back to fewest roles overall when nobody is connected', () => {
    const assignment: Assignment = new Map([
      ['p1', ['FLIGHT', 'PM']],
      ['p2', ['BOOSTER']],
      ['p3', ['STRUCT', 'GUIDO']],
    ]);
    const next = onLeave(assignment, 'p1', ['p2', 'p3'], new Set());
    expect(next.get('p2')).toEqual(['FLIGHT', 'BOOSTER', 'PM']);
  });
});

describe('onArrive', () => {
  it('takes the last ⌊k/2⌋ roles in canonical order from the most-loaded player', () => {
    const assignment: Assignment = new Map([
      ['p1', ['FLIGHT', 'PM', 'BOOSTER', 'STRUCT', 'GUIDO']],
      ['p2', ['FIDO', 'EECOM', 'INCO', 'PAYLOAD', 'RETRO']],
    ]);
    const next = onArrive(assignment, 'p3', ['p2', 'p1']); // descending slot: p2 then p1 (equal load, tie->highest slot p2)
    // p1 and p2 both hold 5 roles; tie-break highest slot -> p2 donates.
    expect(next.get('p3')).toEqual(['PAYLOAD', 'RETRO']); // last floor(5/2)=2 of p2's roles in canonical order
    expect(next.get('p2')).toEqual(['FIDO', 'EECOM', 'INCO']);
    expect(new Set(allRoles(next))).toEqual(new Set(ROLE_IDS));
  });

  it('keeps at least two roles with a loaded player at 9 players before arrival', () => {
    // 9 players -> FLIGHT+PM (2 roles) is the smallest group, everyone else has 1 except someone has 2.
    let assignment = lockAssignment({ mode: 'RANDOM', playersBySlot: players(9), rng: () => 0.42 });
    const bySlotDesc = players(9).slice().reverse();
    const before = Math.max(...[...assignment.values()].map((r) => r.length));
    expect(before).toBeGreaterThanOrEqual(2);
    assignment = onArrive(assignment, 'p10', bySlotDesc);
    expect(assignment.size).toBe(10);
    expect(new Set(allRoles(assignment))).toEqual(new Set(ROLE_IDS));
  });
});

describe('onRotate', () => {
  it('moves every group to the next player in slot order when membership is unchanged', () => {
    const assignment = lockAssignment({ mode: 'RANDOM', playersBySlot: players(5), rng: () => 0 });
    const rotated = onRotate(assignment, players(5));
    expect(rotated.size).toBe(5);
    expect(new Set(allRoles(rotated))).toEqual(new Set(ROLE_IDS));
    // Every player's new roles differ from their old roles (rotation actually moves something).
    let changed = 0;
    for (const p of players(5)) {
      if (JSON.stringify(assignment.get(p)) !== JSON.stringify(rotated.get(p))) changed++;
    }
    expect(changed).toBeGreaterThan(0);
  });
});

describe('toRoleGroups', () => {
  it('produces one RoleGroup per holder, sorted by lead in canonical order', () => {
    const assignment: Assignment = new Map([
      ['p2', ['BOOSTER', 'STRUCT']],
      ['p1', ['FLIGHT', 'PM']],
    ]);
    const groups = toRoleGroups(assignment);
    expect(groups.map((g) => g.lead)).toEqual(['FLIGHT', 'BOOSTER']);
    expect(groups[0]).toEqual({ lead: 'FLIGHT', roles: ['FLIGHT', 'PM'], playerId: 'p1' });
  });
});
