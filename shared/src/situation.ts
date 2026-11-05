// Where things are and what getting there costs, read from one player's own view and the fixed ship map. Pure. Shared by
// the bot goals (server/src/bots/goals) and the client's tips (tips.ts), so both read a situation the same way.

import { SHIP_ROOMS } from "./config.ts";
import { moveCost } from "./modifiers.ts";
import { shortestPath } from "./paths.ts";
import type { PlayerView, RoomId } from "./types.ts";

/** Doors to cross from where the viewer stands to `room` (0 when there), or null when there is no way. */
export function doorCount(view: PlayerView, room: RoomId): number | null {
  return shortestPath(view.rooms, view.you.room, room)?.length ?? null;
}

/** AP a walk to `room` costs from here: MP first, then AP converted when the MP runs short. Null if there's no way or not enough. */
export function travelAp(view: PlayerView, room: RoomId): number | null {
  const path = shortestPath(view.rooms, view.you.room, room);
  if (path === null) return null;
  let points = { ap: view.you.ap, mp: view.you.mp };
  let spent = 0;
  for (let i = 0; i < path.length; i++) {
    const cost = moveCost(view.movement, points);
    if (!cost) return null;
    spent += cost.ap;
    points = { ap: points.ap - cost.ap, mp: cost.mpAfter };
  }
  return spent;
}

/** Whether the viewer can walk to `room` and spend `ap` there, still keeping `reserve` AP. */
export function canAfford(view: PlayerView, room: RoomId, ap: number, reserve: number): boolean {
  const travel = travelAp(view, room);
  return travel !== null && view.you.ap - travel - ap >= reserve;
}

/** `rooms` that can be reached, nearest first; ties keep the given order. */
export function nearest(view: PlayerView, rooms: readonly RoomId[]): RoomId[] {
  return rooms
    .map((id) => ({ id, doors: doorCount(view, id) }))
    .filter((r): r is { id: RoomId; doors: number } => r.doors !== null)
    .sort((a, b) => a.doors - b.doors)
    .map((r) => r.id);
}

/**
 * Rooms of the fixed ship map holding equipment of one of `types`, nearest first (by doors to cross), unreachable ones
 * left out. The map is public and the same for every player; whether the thing is free or working is learned only on
 * arrival, from the view.
 */
export function roomsWith(view: PlayerView, types: readonly string[]): RoomId[] {
  return nearest(view, SHIP_ROOMS.filter((r) => r.equipment.some((e) => types.includes(e.type))).map((r) => r.id));
}
