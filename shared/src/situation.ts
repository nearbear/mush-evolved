// Where things are and what getting there costs, read from one player's own view and the fixed ship map. Pure. Shared by
// the bot goals (server/src/bots/goals) and the client's tips (tips.ts), so both read a situation the same way.

import { SHIP_ROOMS } from "./config.ts";
import { doorId } from "./doors.ts";
import { moveCost } from "./modifiers.ts";
import { shortestPath } from "./paths.ts";
import type { DoorId, PlayerView, RoomId } from "./types.ts";

/**
 * The door test a walk planned from one player's view uses (#330): every broken door the viewer knows of — in their
 * own room (`doors`), reported on the alert bar (`alerts.reports`), or from Defective piston sensors (`brokenDoors`) —
 * is shut; every other door is taken as working.
 */
export function viewDoorsOpen(
  view: Pick<PlayerView, "doors" | "brokenDoors" | "alerts">,
): (from: RoomId, to: RoomId) => boolean {
  const shut = new Set<DoorId>(view.brokenDoors);
  for (const d of view.doors) if (d.broken) shut.add(d.id);
  for (const r of view.alerts.reports) if (r.kind === "door") shut.add(r.door);
  return (from, to) => !shut.has(doorId(from, to));
}

/** The shortest walk from `from` to `room` the viewer knows of (`viewDoorsOpen`), or null. */
export const viewPath = (view: PlayerView, from: RoomId, room: RoomId): RoomId[] | null => shortestPath(view.rooms, from, room, viewDoorsOpen(view));

/** Doors to cross from where the viewer stands to `room` (0 when there), or null when there is no way. */
export function doorCount(view: PlayerView, room: RoomId): number | null {
  return viewPath(view, view.you.room, room)?.length ?? null;
}

/** AP a walk to `room` costs from here: MP first, then AP converted when the MP runs short. Null if there's no way or not enough. */
export function travelAp(view: PlayerView, room: RoomId): number | null {
  const path = viewPath(view, view.you.room, room);
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
