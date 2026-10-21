// Where you stand in your room (issues #17 and #21, decided 2026-10-20): a floor cell, or a chair on one, set by the
// free `walk` input, or the door you came in by until you walk off. Mostly cosmetic, but real state: roommates see
// it (`OtherPlayerView.spot`), so it can give away what you walk up to. The client decides which walks to share: floor
// and chair clicks, and walking up to the target of a public action (owner, 2026-10-20). The rules know rooms, not
// cells, so a cell is only checked for size; the client stands someone on a cell it can't walk to in the usual spot.

import type { ActionDef } from "./actions.ts";
import { clone, fail, findPlayer, type ActionResult } from "./helpers.ts";
import type { Action, GameState, PlayerId, PlayerState, RoomId, Spot } from "./types.ts";

/** How far from the room's origin a cell may be, either way. Rooms are a few dozen cells across. */
export const MAX_SPOT_CELL = 500;

/** Walk to a cell of your room, sitting down there if `sitting` (a chair). Free, and not an action: nothing queues or waits. */
export function walk(state: GameState, playerId: PlayerId, x: number, y: number, sitting: boolean): ActionResult {
  const p = findPlayer(state, playerId);
  if (!p) return fail("unknown_player");
  if (!state.config.sharedSpots || !p.alive || state.phase !== "playing") return fail("cant_walk");
  // In bed or pushed in a wheelchair, you can't wander off (as the client already stops you).
  if (p.lyingIn !== undefined || p.pushedBy !== undefined) return fail("cant_walk");
  if (![x, y].every((n) => Number.isInteger(n) && Math.abs(n) <= MAX_SPOT_CELL)) return fail("cant_walk");
  const next = clone(state);
  findPlayer(next, playerId)!.spot = { x, y, ...(sitting && { sitting: true }) };
  return { ok: true, state: next };
}

/**
 * Sending a public action gets you up from a chair (owner, 2026-10-20). Other actions leave you seated as your roommates
 * see it, since standing up would tell them you just did something they can't otherwise see; your own screen stands
 * you up for any action. Mutates a cloned state.
 */
export function standUp(p: PlayerState, action: Pick<ActionDef<Action>, "visibility">): void {
  if (action.visibility === "public" && p.spot && "sitting" in p.spot) delete p.spot.sitting;
}

/** You came into your room through the door from `from`: you stand in front of it until you walk off. Mutates a cloned state. */
export function arrive(p: PlayerState, from: RoomId): void {
  p.spot = { door: from } satisfies Spot;
}
