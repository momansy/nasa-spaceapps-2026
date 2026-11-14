// Generic recipient resolution driven by protocol/ts/messages.ts MESSAGE_META — avoids a bespoke
// routing rule per message type for the many "host → server → client, relayed unchanged/inside relay"
// messages (protocol/messages.md §12.3 message index `to` column).
import { MESSAGE_META, type MessageType, type PlayerId, type RoleId } from '../../../protocol/ts/messages.js';
import type { Connection } from './connection.js';

export interface RoutingContext {
  host: Connection | null;
  players: () => Connection[];
  spectators: () => Connection[];
  playerById: (id: PlayerId) => Connection | null;
  roleHolderConn: (role: RoleId) => Connection | null;
  /** Whether the currently active minigame run (if any) has `audience = true`. */
  mgAudienceActive: () => boolean;
}

/**
 * Resolves the recipients of a message purely from `MESSAGE_META[type].to` and the fields of `d`
 * that carry routing information (`role`, `to`). `TARGET` (only `room.promoted`) is not resolved
 * here: the caller picks the one connection explicitly since it is not derivable from `d`.
 */
export function recipientsFor(type: MessageType, d: Record<string, unknown>, sender: Connection, ctx: RoutingContext): Connection[] {
  const meta = MESSAGE_META[type];
  switch (meta.to) {
    case 'SERVER':
      return [];
    case 'SENDER':
      return [sender];
    case 'HOST':
      return ctx.host ? [ctx.host] : [];
    case 'EVERYONE':
      return [...(ctx.host ? [ctx.host] : []), ...ctx.players(), ...ctx.spectators()];
    case 'CLIENTS':
      return [...ctx.players(), ...ctx.spectators()];
    case 'PLAYERS':
      return ctx.players();
    case 'ROLE': {
      const role = d.role as RoleId | undefined;
      if (!role) return [];
      const conn = ctx.roleHolderConn(role);
      return conn ? [conn] : [];
    }
    case 'TO': {
      const ids = (d.to as PlayerId[] | undefined) ?? [];
      return ids.map((id) => ctx.playerById(id)).filter((c): c is Connection => c !== null);
    }
    case 'TO_OR_CLIENTS': {
      const ids = d.to as PlayerId[] | null | undefined;
      if (ids === null || ids === undefined) return [...ctx.players(), ...ctx.spectators()];
      return ids.map((id) => ctx.playerById(id)).filter((c): c is Connection => c !== null);
    }
    case 'TO_OR_PLAYERS': {
      const ids = d.to as PlayerId[] | null | undefined;
      if (ids === null || ids === undefined) return ctx.players();
      return ids.map((id) => ctx.playerById(id)).filter((c): c is Connection => c !== null);
    }
    case 'PLAYERS_PLUS_AUDIENCE': {
      const audienceField = (d as { audience?: boolean }).audience;
      const includeAudience = audienceField !== undefined ? audienceField : ctx.mgAudienceActive();
      return includeAudience ? [...ctx.players(), ...ctx.spectators()] : ctx.players();
    }
    case 'TARGET':
      return [];
    default:
      return [];
  }
}
