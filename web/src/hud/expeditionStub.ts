// STUB for docs/plans/expedition-ui.md, build order slice 1 (the view data), which isn't built yet: the expedition
// screen (ExpeditionTimeline.tsx) needs how many steps are left, when the next resolves, and the members' exact HP.
// Until the server sends them, they are read here if present and are otherwise absent, and the timeline falls back:
// one mystery column with no countdown, then Return; HP for yourself only. Never a max HP (owner, 2026-11-19). When slice 1 lands, add the fields to
// `PlayerView["expedition"]` (with these names, or change them here), read them directly, and delete this file.

import type { CharacterId, PlayerView } from "@mush2/shared";

/** One member's HP, by character, as slice 1 is to send it to members still with the crew. */
export interface MemberHp {
  name: CharacterId;
  hp: number;
}

/** The fields slice 1 adds to `view.expedition`; each absent until then. */
export interface ExpeditionExtras {
  /** How many steps are left (public). */
  steps?: number;
  /** When the next step resolves (server ms, public). */
  nextAt?: number;
  /** Each member's exact HP, only to members still with the crew while away. */
  hp?: MemberHp[];
}

/** The slice 1 fields of the expedition under way, where the view already has them. */
export function expeditionExtras(expedition: NonNullable<PlayerView["expedition"]>): ExpeditionExtras {
  const e = expedition as NonNullable<PlayerView["expedition"]> & ExpeditionExtras;
  const extras: ExpeditionExtras = {};
  if (typeof e.steps === "number") extras.steps = e.steps;
  if (typeof e.nextAt === "number") extras.nextAt = e.nextAt;
  if (Array.isArray(e.hp)) extras.hp = e.hp;
  return extras;
}
