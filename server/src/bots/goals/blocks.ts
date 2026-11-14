// Building blocks most goals are made of: finding an offered action and walking somewhere. Pricing a walk is in shared.

import {
  DEFAULT_CONFIG,
  canAfford as rawCanAfford,
  doorCount,
  moveCost,
  roomsWith,
  shortestPath,
  type Action,
  type ActionOption,
  type PlayerView,
  type RoomId,
} from "@mush2/shared";
import { holdsTrigger } from "../duties.ts";
import { isHoldingJump } from "../planetShare.ts";
import type { BotMemory, GoalStep } from "./types.ts";

// The situation helpers live in shared (situation.ts), where the client's tips use them too.
export { canAfford as rawCanAfford, nearest, roomsWith, travelAp } from "@mush2/shared";

/** Simulates walking `fromRoom -> toRoom` starting with `(ap, mp)` and returns remaining points, or null if unreachable. */
export function walkBudget(view: PlayerView, fromRoom: RoomId, toRoom: RoomId, ap: number, mp: number): { ap: number; mp: number } | null {
  const path = shortestPath(view.rooms, fromRoom, toRoom);
  if (path === null) return null;
  let points = { ap, mp };
  for (let i = 0; i < path.length; i++) {
    const cost = moveCost(view.movement, points);
    if (!cost) return null;
    points = { ap: points.ap - cost.ap, mp: cost.mpAfter };
  }
  return points;
}

/** Whether from `(fromRoom, ap, mp)` the viewer can reach a Command terminal and still pay 1 AP to `travel` (#421). */
export function canReachBridgeWithTravelAp(view: PlayerView, fromRoom: RoomId, ap: number, mp: number): boolean {
  const bridges = roomsWith(view, ["PILOT_MODULE"]);
  const travelCost = DEFAULT_CONFIG.navigation.travel.cost.ap;
  return bridges.some((bridge) => {
    const back = walkBudget(view, fromRoom, bridge, ap, mp);
    return back !== null && back.ap >= travelCost;
  });
}

/** Whether the viewer is the Commander currently holding a jump in global chat (#421). */
export function isCommanderHolding(view: PlayerView, memory: BotMemory): boolean {
  return holdsTrigger(view, "destination") && !view.navigation.traveling && !view.navigation.orbiting && isHoldingJump(view, memory);
}

/**
 * Whether the viewer can walk to `room` and spend `ap` there, keeping `reserve` AP — and when the viewer is the
 * Commander holding a jump (#421), still keeping enough AP/MP to walk back to the bridge and `travel`.
 */
export function canAfford(view: PlayerView, room: RoomId, ap: number, reserve: number, memory: BotMemory): boolean {
  if (!rawCanAfford(view, room, ap, reserve)) return false;
  if (!isCommanderHolding(view, memory)) return true;
  const afterWalk = walkBudget(view, view.you.room, room, view.you.ap, view.you.mp);
  return afterWalk !== null && canReachBridgeWithTravelAp(view, room, afterWalk.ap - ap, afterWalk.mp);
}

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
