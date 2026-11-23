// Room spore traps (Trapper Mush skill, owner 2026-11-21, #473).
// A Mush with `trapper` can booby-trap their current room with a spore (`trap_room`). The next player who interacts
// with the room triggers the trap, consuming it and contaminating the actor (Mush or Immune players waste the spore).

import { contaminate } from "./infection.ts";
import type { Action, GameState, PlayerState, RoomId } from "./types.ts";

/** Whether `room` currently has an active spore trap. */
export function isRoomTrapped(state: Readonly<GameState>, room: RoomId): boolean {
  return state.trappedRooms.includes(room);
}

/** Whether `itemId` is currently on the shelf/floor of `room` (not carried in a player's inventory). */
function isRoomItem(state: Readonly<GameState>, room: RoomId, itemId: string): boolean {
  const item = state.items.find((i) => i.id === itemId);
  return item !== undefined && item.at.kind === "room" && item.at.id === room;
}

/**
 * Whether `actor` performing `action` in their current room will trigger a spore trap there (#473).
 * Must be evaluated **before** `def.apply` runs, so actions like `take` still see the item was in the room.
 * Only a trap in the actor's own room ever triggers (never an adjacent room when acting on a shared door).
 */
export function willTriggerRoomTrap(state: Readonly<GameState>, actor: Readonly<PlayerState>, action: Action): boolean {
  if (!isRoomTrapped(state, actor.room)) return false;
  if (action.type === "move" || action.type === "drop" || action.type === "trap_room") return false;
  if (
    action.type === "get_up" ||
    action.type === "search" ||
    action.type === "report_fire" ||
    action.type === "report_equipment" ||
    action.type === "report_door"
  ) {
    return true;
  }
  if ("equipment" in action || "door" in action) return true;
  if (action.type === "examine") {
    if (action.target.kind === "equipment") return true;
    if (action.target.kind === "item") return isRoomItem(state, actor.room, action.target.id);
    return false;
  }
  if ("item" in action && isRoomItem(state, actor.room, action.item)) return true;
  if ("weapon" in action && isRoomItem(state, actor.room, action.weapon)) return true;
  if ("fruit" in action && isRoomItem(state, actor.room, action.fruit)) return true;
  return false;
}

/**
 * Consumes the trap in `room` and contaminates `actor` (+1 contamination; conversion, Immunity, Strong Skin, and
 * Mush-channel notices are handled by `contaminate`). Silent to humans, and no private log when wasted by a Mush or
 * Immune human. Mutates a state the caller already cloned.
 */
export function triggerRoomTrap(state: GameState, actor: PlayerState, room: RoomId): void {
  const index = state.trappedRooms.indexOf(room);
  if (index === -1) return;
  state.trappedRooms.splice(index, 1);
  contaminate(state, actor);
}
