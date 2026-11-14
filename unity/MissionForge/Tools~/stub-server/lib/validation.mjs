// Common validation of every received frame, in the order of messages.md 12.1 (rate limits are
// not simulated). Pure: it only reads the session; the caller applies the verdict.

import { validate } from './contract.mjs';
import { ERR, LIMITS, MSG, PRE_HELLO_MAX_FRAME_BYTES } from './protocol.mjs';
import { isPlainObject } from './rules.mjs';

const MAX_RE = 2_147_483_647;
const MAX_TYPE_CHARS = 64;
const MAX_FIELD_CHARS = 64;

/** Which error a sender that may not send this type gets (steps 6–7). */
function senderError(session, meta) {
  if (session.room) return meta.from.includes('UNJOINED') ? ERR.ALREADY_IN_ROOM : ERR.FORBIDDEN;
  const kinds = session.hello.client === 'HOST' ? ['HOST'] : ['PLAYER', 'SPECTATOR'];
  return kinds.some((k) => meta.from.includes(k)) ? ERR.NOT_IN_ROOM : ERR.FORBIDDEN;
}

/**
 * Checks one text frame. Returns one of
 *   { verdict: 'fatal', code, ctx }                    -> error (fatal) + bye + close
 *   { verdict: 'error', code, ctx, extra }             -> non-fatal error, message has no effect
 *   { verdict: 'ok', ctx, t, d, seq, meta }            -> dispatch
 * `ctx` is { seq, t } of the rejected message for error.re / error.reT.
 */
export function checkFrame(contract, session, text) {
  const limit = session.hello ? LIMITS[session.hello.client].maxFrameBytes : PRE_HELLO_MAX_FRAME_BYTES;
  if (Buffer.byteLength(text, 'utf8') > limit) return { verdict: 'fatal', code: ERR.FRAME_TOO_LARGE, ctx: null };

  let frame;
  try {
    frame = JSON.parse(text);
  } catch {
    return { verdict: 'fatal', code: ERR.BAD_ENVELOPE, ctx: null };
  }
  const object = isPlainObject(frame);
  const ctx = {
    seq: object && Number.isInteger(frame.seq) && frame.seq >= 0 && frame.seq <= MAX_RE ? frame.seq : null,
    t: object && typeof frame.t === 'string' && frame.t.length <= MAX_TYPE_CHARS ? frame.t : null,
  };
  const envelope = contract.envelope;
  if (!object || validate(envelope, frame, envelope).length > 0 || frame.seq <= session.inSeq) {
    return { verdict: 'fatal', code: ERR.BAD_ENVELOPE, ctx };
  }

  const { t, d, seq } = frame;
  if (!session.hello !== (t === MSG.HELLO)) return { verdict: 'fatal', code: ERR.HANDSHAKE_REQUIRED, ctx };

  const meta = contract.meta.get(t);
  if (!meta) return { verdict: 'error', code: ERR.UNKNOWN_TYPE, ctx, seq };

  const sender = session.room ? session.kind : 'UNJOINED';
  if (!meta.from.includes(sender)) return { verdict: 'error', code: senderError(session, meta), ctx, seq };

  const payload = contract.checkPayload(t, d, { lenient: true });
  if (!payload.ok) {
    return { verdict: 'error', code: ERR.BAD_PAYLOAD, ctx, seq, extra: { field: payload.field.slice(0, MAX_FIELD_CHARS) } };
  }

  if (meta.pauseBlocked && session.room?.paused) return { verdict: 'error', code: ERR.PAUSED, ctx, seq };
  return { verdict: 'ok', ctx, t, d, seq, meta };
}
