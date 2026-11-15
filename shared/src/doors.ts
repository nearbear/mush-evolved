// Doors (#330, owner, 2026-11-14): a door joins two rooms and can break. It isn't equipment of either room: one door
// belongs to both, so its state lives once, in `GameState.doors`, under an id both sides compute the same way
// (`doorId`). `config.rooms` stays the adjacency list; every door in it exists, working unless `doors` says broken.
// A broken door blocks movement through it for everyone (players, summons, drones). Pure.

import { CHEAT_ROOM } from "./cheatRoom.ts";
import { inCraft } from "./patrol.ts";
import type { DeepReadonly, DoorId, DoorView, GameState, RoomId } from "./types.ts";

/** The door between `a` and `b`: their ids sorted and joined, so both sides name it alike. */
export const doorId = (a: RoomId, b: RoomId): DoorId => (a < b ? `${a}|${b}` : `${b}|${a}`);

/** The two rooms a door joins, in id order. */
export function doorRooms(id: DoorId): [RoomId, RoomId] {
  const at = id.indexOf("|");
  return [id.slice(0, at), id.slice(at + 1)];
}

/** The room on the other side of `id` from `room`, or undefined if `room` isn't one of its ends. */
export function doorOtherRoom(id: DoorId, room: RoomId): RoomId | undefined {
  const [a, b] = doorRooms(id);
  return a === room ? b : b === room ? a : undefined;
}

/** Whether the door between `a` and `b` is broken. */
export const isDoorBroken = (state: DeepReadonly<Pick<GameState, "doors">>, a: RoomId, b: RoomId): boolean => state.doors[doorId(a, b)]?.broken === true;

/** Whether a door joins `a` and `b` aboard the Daedalus (not a craft's or the cheat room's, which have none). */
const isShipRoom = (room: RoomId): boolean => room !== CHEAT_ROOM && !inCraft(room);

/** Every door of the Daedalus, in `config.rooms` order, each once. */
export function allDoors(rooms: DeepReadonly<Record<RoomId, readonly RoomId[]>>): DoorId[] {
  const seen = new Set<DoorId>();
  for (const [room, exits] of Object.entries(rooms)) {
    if (!isShipRoom(room)) continue;
    for (const to of exits) if (isShipRoom(to)) seen.add(doorId(room, to));
  }
  return [...seen];
}

/** Whether `id` names a door of the Daedalus. */
export const isDoor = (state: DeepReadonly<Pick<GameState, "config">>, id: string): id is DoorId => {
  const at = id.indexOf("|");
  if (at < 0) return false;
  const [a, b] = doorRooms(id);
  return a < b && isShipRoom(a) && isShipRoom(b) && (state.config.rooms[a] ?? []).includes(b);
};

/** The doors of `room`, in its exit order: where each leads and whether it is broken. */
export function doorsOf(state: DeepReadonly<Pick<GameState, "config" | "doors">>, room: RoomId): DoorView[] {
  return (state.config.rooms[room] ?? [])
    .filter((to) => isShipRoom(room) && isShipRoom(to))
    .map((to) => {
      const id = doorId(room, to);
      return { id, to, ...(isDoorBroken(state, room, to) ? { broken: true as const } : {}) };
    });
}

/** Breaks a door (silently: no line, owner 2026-11-14). Returns whether it was working. Mutates a cloned state. */
export function breakDoor(state: GameState, id: DoorId): boolean {
  if (state.doors[id]?.broken) return false;
  state.doors[id] = { broken: true };
  return true;
}

/** Repairs a door. Returns whether it was broken. Mutates a cloned state. The `doors` map stays sparse. */
export function repairDoor(state: GameState, id: DoorId): boolean {
  if (!state.doors[id]?.broken) return false;
  delete state.doors[id];
  return true;
}

/** A walk's door test for `shortestPath`: open unless broken. */
export const openDoors =
  (state: DeepReadonly<Pick<GameState, "doors">>) =>
  (from: RoomId, to: RoomId): boolean =>
    !isDoorBroken(state, from, to);
