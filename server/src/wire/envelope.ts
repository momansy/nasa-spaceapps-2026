// Envelope parsing — protocol/messages.md §2 "Transport and conventions", §12.1 checks 1-2.
import { MESSAGE_TYPES, type MessageType } from '../../../protocol/ts/messages.js';

const MESSAGE_TYPE_SET = new Set<string>(MESSAGE_TYPES);

export interface RawEnvelope {
  t: string;
  seq: number;
  d: Record<string, unknown>;
}

export type ParseResult = { ok: true; envelope: RawEnvelope } | { ok: false; reason: string };

/**
 * Parses one text frame into `{t, seq, d}`. Checks only shape (§12.1 check 2): a JSON object with
 * exactly `t` (string), `seq` (integer) and `d` (object) — not whether `t` is a known type or `seq`
 * is greater than the previous one (the caller tracks per-connection sequence state for that).
 */
export function parseEnvelope(raw: string): ParseResult {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return { ok: false, reason: 'not valid JSON' };
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return { ok: false, reason: 'not a JSON object' };
  }
  const obj = value as Record<string, unknown>;
  if (typeof obj.t !== 'string') return { ok: false, reason: 'missing or non-string t' };
  if (typeof obj.seq !== 'number' || !Number.isInteger(obj.seq)) return { ok: false, reason: 'missing or non-integer seq' };
  if (typeof obj.d !== 'object' || obj.d === null || Array.isArray(obj.d)) return { ok: false, reason: 'missing or non-object d' };
  return { ok: true, envelope: { t: obj.t, seq: obj.seq, d: obj.d as Record<string, unknown> } };
}

export function isKnownType(t: string): t is MessageType {
  return MESSAGE_TYPE_SET.has(t);
}

export function encodeEnvelope(t: string, seq: number, d: unknown): string {
  return JSON.stringify({ t, seq, d });
}

/** UTF-8 byte length of a frame, for the frame-size limits of §11. */
export function byteLength(raw: string): number {
  return Buffer.byteLength(raw, 'utf8');
}
