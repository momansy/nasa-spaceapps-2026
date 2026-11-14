// Avatar cosmetics (design 3.1: "astronaut suit color + patch"). Ids are cosmetic data ids sent
// in `room.join.avatar`; colours and emblem shapes are client presentation.

export interface Suit {
  id: string;
  /** Suit fabric colour. */
  color: string;
  /** Darker trim of the same hue. */
  trim: string;
}

export const SUITS: Suit[] = [
  { id: 'suit_orange', color: '#ff8a3d', trim: '#b9531a' },
  { id: 'suit_white', color: '#eef2f8', trim: '#9aa7bd' },
  { id: 'suit_blue', color: '#4c8dff', trim: '#2553b0' },
  { id: 'suit_teal', color: '#2fd1c5', trim: '#16837b' },
  { id: 'suit_yellow', color: '#ffd24a', trim: '#b08a14' },
  { id: 'suit_violet', color: '#a987ff', trim: '#6646c2' },
  { id: 'suit_pink', color: '#ff7eb6', trim: '#b9457c' },
  { id: 'suit_green', color: '#7ddc5a', trim: '#3f8f24' },
];

export interface Patch {
  id: string;
  /** SVG path drawn in a 24-unit box. */
  path: string;
}

export const PATCHES: Patch[] = [
  { id: 'patch_comet', path: 'M16 8a4 4 0 11-8 0 4 4 0 018 0zM9 11L3 21M12 12l-3 9M15 11l1 6' },
  { id: 'patch_rocket', path: 'M12 2c3 2.500 4 6 3.500 10.500h-7C8 8 9 4.500 12 2zM8.500 12.500L6 17l3-1M15.500 12.500L18 17l-3-1M12 15.500V21' },
  { id: 'patch_planet', path: 'M12 6a6 6 0 100 12 6 6 0 000-12zM3 15c2-4 14-8 18-6M3 15c1 2 5 1 9-1' },
  { id: 'patch_star', path: 'M12 3l2.600 5.600 6.100.700-4.500 4.200 1.200 6L12 16.500 6.600 19.500l1.200-6L3.300 9.300l6.100-.700L12 3z' },
  { id: 'patch_moon', path: 'M17 14.500A7.500 7.500 0 019.500 4 8 8 0 1020 14a7 7 0 01-3 .500z' },
  { id: 'patch_orbit', path: 'M12 10a2 2 0 100 4 2 2 0 000-4zM3 12c0-2.500 4-4.500 9-4.500s9 2 9 4.500-4 4.500-9 4.500-9-2-9-4.500zM18.500 6.500v.1' },
  { id: 'patch_atom', path: 'M12 11a1 1 0 100 2 1 1 0 000-2zM4 12c0-2 3.600-3.500 8-3.500s8 1.500 8 3.500-3.600 3.500-8 3.500-8-1.500-8-3.500zM8 5c1.700-1 4.800 1.400 7 5.200s2.700 7.700 1 8.700-4.800-1.400-7-5.200S6.300 6 8 5zM16 5c1.700 1 1.200 4.900-1 8.700s-5.300 6.200-7 5.200-1.200-4.900 1-8.700S14.300 4 16 5z' },
  { id: 'patch_bolt', path: 'M13.500 2.500L5.500 13.500h5.500l-1 8 8-11h-5.500l1-8z' },
];

export function suitById(id: string | undefined): Suit {
  return SUITS.find((s) => s.id === id) ?? SUITS[0]!;
}

export function patchById(id: string | undefined): Patch {
  return PATCHES.find((p) => p.id === id) ?? PATCHES[0]!;
}

/**
 * Suggested call signs (design 3.1: "nickname (filtered list or free text...)"). Picking from
 * this list needs no typing and no profanity check.
 */
export const NICKNAME_SUGGESTIONS = [
  'Apogee',
  'Booster',
  'Comet',
  'Delta-V',
  'Equinox',
  'Gimbal',
  'Halo',
  'Ion',
  'Juno',
  'Kepler',
  'Lumen',
  'Nebula',
  'Orbit',
  'Perigee',
  'Quasar',
  'Rover',
  'Solstice',
  'Telemetry',
  'Umbra',
  'Vector',
  'Zenith',
];
