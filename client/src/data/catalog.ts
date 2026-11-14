// The game catalog bundled with the phone client (protocol Decision 20: "Phones bundle the
// catalog and string tables; part cards are rendered from partId plus the host's deltas").
// Everything is read from the shared `data/` folder at build time. Files that do not exist yet
// (facts, minigames, codex) simply produce empty collections.
import type { RoleId } from '@protocol';

export type Maturity = 'proven' | 'mature' | 'new';

export interface PartGame {
  cost_M?: number;
  lead_days?: number;
  integ_days?: number;
  reliability?: number;
  maturity?: Maturity;
}

export interface Part {
  id: string;
  category: string;
  name_key: string;
  twin?: string;
  strengths?: string[];
  drawbacks?: string[];
  facts?: string[];
  contracts?: string[];
  model?: string;
  stats?: Record<string, number | string | boolean>;
  game?: PartGame;
}

export interface PartCategory {
  category: string;
  name_key: string;
  intro_key?: string;
  facts?: string[];
  parts: Part[];
}

export interface RoleDef {
  id: RoleId;
  name_key: string;
  origin_key: string;
  insight_key: string;
  console_key: string;
  ability: { id: string; name_key: string; description_key: string };
}

export interface FactDef {
  id: string;
  topic_key?: string;
  text_key: string;
  detail_key?: string;
  source_key?: string;
  source_url?: string;
  status: 'unverified' | 'verified' | 'rejected';
}

export interface CodexEntryDef {
  id: string;
  kind: string;
  title_key: string;
  body_key: string;
  simplification_key?: string;
  facts?: string[];
  sensitive?: boolean;
}

export interface MinigameDef {
  id: string;
  name_key: string;
  how_to_play_key: string;
  success_key?: string;
  duration_s?: number;
  facts?: string[];
}

const partFiles = import.meta.glob('../../../data/parts/*.json', { eager: true, import: 'default' }) as Record<string, PartCategory>;
const roleFiles = import.meta.glob('../../../data/roles.json', { eager: true, import: 'default' }) as Record<string, { roles: RoleDef[] }>;
const factFiles = import.meta.glob('../../../data/facts.json', { eager: true, import: 'default' }) as Record<string, { facts?: FactDef[] }>;
const codexFiles = import.meta.glob('../../../data/codex.json', { eager: true, import: 'default' }) as Record<string, { entries?: CodexEntryDef[] }>;
const minigameFiles = import.meta.glob('../../../data/minigames.json', { eager: true, import: 'default' }) as Record<string, { minigames?: MinigameDef[] }>;

const categories = new Map<string, PartCategory>();
const parts = new Map<string, Part>();
for (const file of Object.values(partFiles)) {
  if (!file || !Array.isArray(file.parts)) continue;
  categories.set(file.category, file);
  for (const p of file.parts) parts.set(p.id, p);
}

const roles = new Map<RoleId, RoleDef>();
for (const file of Object.values(roleFiles)) for (const r of file.roles ?? []) roles.set(r.id, r);

const facts = new Map<string, FactDef>();
for (const file of Object.values(factFiles)) for (const f of file.facts ?? []) facts.set(f.id, f);

const codex = new Map<string, CodexEntryDef>();
for (const file of Object.values(codexFiles)) for (const e of file.entries ?? []) codex.set(e.id, e);

const minigames = new Map<string, MinigameDef>();
for (const file of Object.values(minigameFiles)) for (const m of file.minigames ?? []) minigames.set(m.id, m);

export function getPart(id: string | null | undefined): Part | undefined {
  return id ? parts.get(id) : undefined;
}

export function getCategory(id: string | null | undefined): PartCategory | undefined {
  return id ? categories.get(id) : undefined;
}

/** All parts of a category, in catalog order. Empty when the category is unknown. */
export function partsOfCategory(id: string | null | undefined): Part[] {
  return (id && categories.get(id)?.parts) || [];
}

export function allCategories(): PartCategory[] {
  return [...categories.values()];
}

export function getRole(id: RoleId): RoleDef | undefined {
  return roles.get(id);
}

/**
 * A fact by id. When `data/facts.json` has no such entry yet, the fact is looked up by the
 * conventional string keys `fact.<id>.text` and treated as unverified.
 */
export function getFact(id: string | null | undefined): FactDef | undefined {
  if (!id) return undefined;
  return facts.get(id) ?? { id, text_key: `fact.${id}.text`, detail_key: `fact.${id}.detail`, status: 'unverified' };
}

export function getCodexEntry(id: string): CodexEntryDef {
  const entry = codex.get(id);
  if (entry) return entry;
  // A fact unlocked as a Codex entry (debrief, events): its topic is the title, its text the body.
  const fact = facts.get(id);
  if (fact) return { id, kind: 'fact', title_key: fact.topic_key ?? fact.text_key, body_key: fact.text_key, facts: [id] };
  return { id, kind: 'part', title_key: `codex.${id}.title`, body_key: `codex.${id}.body` };
}

export function getMinigame(id: string): MinigameDef {
  return (
    minigames.get(id) ?? {
      id,
      name_key: `minigame.${id}.name`,
      how_to_play_key: `minigame.${id}.how_to_play`,
      success_key: `minigame.${id}.success`,
    }
  );
}

/** Uncertainty band of a maturity level, in percentage points (design section 7.0, game value). */
export function maturityBandPct(m: Maturity | undefined): number | null {
  switch (m) {
    case 'proven':
      return 1;
    case 'mature':
      return 3;
    case 'new':
      return 6;
    default:
      return null;
  }
}
