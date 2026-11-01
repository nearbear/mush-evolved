// Building blocks most goals are made of: finding an offered action, walking somewhere, and pricing a walk.

import { SHIP_ROOMS, moveCost, shortestPath, type Action, type ActionOption, type PlayerView, type RoomId } from "@mush2/shared";
import type { GoalStep } from "./types.ts";

type ActionOf<T extends Action["type"]> = Extract<Action, { type: T }>;

/** The view's offered actions of one type, affordable or not (`lacks` says why not). */
export function offered<T extends Action["type"]>(view: PlayerView, type: T): (ActionOption & { action: ActionOf<T> })[] {
  return view.actions.filter((o): o is ActionOption & { action: ActionOf<T> } => o.action.type === type);
}

/** The first affordable action of `type` passing `test`. */
export function find<T extends Action["type"]>(view: PlayerView, type: T, test: (action: ActionOf<T>) => boolean = () => true): ActionOf<T> | undefined {
  return offered(view, type).find((o) => o.lacks.length === 0 && test(o.action))?.action;
}

export const act = (action: Action): GoalStep => ({ kind: "act", action });
export const failed = (reason: string): GoalStep => ({ kind: "failed", reason });

/**
 * The next move toward `room` along the shortest path, or null once there. Recomputed from where the bot stands each
 * turn, so a bot walked somewhere else (a plan's summons) re-paths by itself.
 */
export function goTo(view: PlayerView, room: RoomId): GoalStep | null {
  const path = shortestPath(view.rooms, view.you.room, room);
  if (path === null) return failed("no_path");
  if (path.length === 0) return null;
  const move = find(view, "move", (m) => m.to === path[0]);
  return move ? act(move) : failed("cant_move");
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

/** Whether the bot can walk to `room` and spend `ap` there, still keeping `reserve` AP. */
export function canAfford(view: PlayerView, room: RoomId, ap: number, reserve: number): boolean {
  const travel = travelAp(view, room);
  return travel !== null && view.you.ap - travel - ap >= reserve;
}

/**
 * Rooms of the fixed ship map holding equipment of one of `types`, nearest first (by doors to cross), unreachable ones
 * left out. The map is public and the same for every player; whether the thing is free or working is learned only on
 * arrival, from the view.
 */
export function roomsWith(view: PlayerView, types: readonly string[]): RoomId[] {
  return nearest(view, SHIP_ROOMS.filter((r) => r.equipment.some((e) => types.includes(e.type))).map((r) => r.id));
}

/** `rooms` that can be reached, nearest first; ties keep the given order. */
export function nearest(view: PlayerView, rooms: readonly RoomId[]): RoomId[] {
  return rooms
    .map((id) => ({ id, doors: shortestPath(view.rooms, view.you.room, id)?.length }))
    .filter((r): r is { id: RoomId; doors: number } => r.doors !== undefined)
    .sort((a, b) => a.doors - b.doors)
    .map((r) => r.id);
}

/** The item type behind an item id, if the bot can see that item (carried or in its room). */
export const itemType = (view: PlayerView, id: string): string | undefined => [...view.inventory, ...view.roomItems].find((i) => i.id === id)?.type;
