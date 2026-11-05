// Building blocks most goals are made of: finding an offered action and walking somewhere. Pricing a walk is in shared.

import { doorCount, shortestPath, type Action, type ActionOption, type PlayerView, type RoomId } from "@mush2/shared";
import type { GoalStep } from "./types.ts";

// The situation helpers live in shared (situation.ts), where the client's tips use them too.
export { canAfford, nearest, roomsWith, travelAp } from "@mush2/shared";

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

/** How far `room` is, for a goal's label: "(2 doors away)". */
export function doorsAway(view: PlayerView, room: RoomId): string {
  const doors = doorCount(view, room) ?? "?";
  return `(${doors} door${doors === 1 ? "" : "s"} away)`;
}

/** Where `room` is, for a goal's label: "here", or "in LABORATORY (2 doors away)". */
export const where = (view: PlayerView, room: RoomId): string => (room === view.you.room ? "here" : `in ${room} ${doorsAway(view, room)}`);

/** The item type behind an item id, if the bot can see that item (carried or in its room). */
export const itemType = (view: PlayerView, id: string): string | undefined => [...view.inventory, ...view.roomItems].find((i) => i.id === id)?.type;
