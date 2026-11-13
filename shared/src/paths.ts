// Walking routes through the ship's room graph (`config.rooms`), for the summons walk (actions/summon.ts) and Sensor
// support drones (drones.ts).

import type { DeepReadonly, RoomId } from "./types.ts";

/**
 * The rooms to walk through, door by door, to get from `from` to `to` (or the nearest room matching a predicate),
 * ending at the reached room, or null if there is no way. Empty when `from` matches. Breadth-first, trying exits in
 * adjacency-list order, so the same graph always gives the same route and breaks ties by door order.
 */
export function shortestPath(
  rooms: DeepReadonly<Record<RoomId, RoomId[]>>,
  from: RoomId,
  to: RoomId | ((room: RoomId) => boolean),
): RoomId[] | null {
  const match = typeof to === "function" ? to : (room: RoomId) => room === to;
  if (match(from)) return [];
  const cameFrom = new Map<RoomId, RoomId>([[from, from]]);
  const frontier: RoomId[] = [from];
  for (let i = 0; i < frontier.length; i++) {
    const room = frontier[i]!;
    for (const next of rooms[room] ?? []) {
      if (cameFrom.has(next)) continue;
      cameFrom.set(next, room);
      if (match(next)) {
        const path: RoomId[] = [];
        for (let at = next; at !== from; at = cameFrom.get(at)!) path.push(at);
        return path.reverse();
      }
      frontier.push(next);
    }
  }
  return null;
}
