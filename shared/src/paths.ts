// Walking routes through the ship's room graph (`config.rooms`), for the summons walk (actions/summon.ts).

import type { DeepReadonly, RoomId } from "./types.ts";

/**
 * The rooms to walk through, door by door, to get from `from` to `to` (each step one `move`; `to` last), or null if
 * there is no way. Empty when already there. Breadth-first, trying exits in adjacency-list order, so the same graph
 * always gives the same route, which a replay needs.
 */
export function shortestPath(rooms: DeepReadonly<Record<RoomId, RoomId[]>>, from: RoomId, to: RoomId): RoomId[] | null {
  if (from === to) return [];
  const cameFrom = new Map<RoomId, RoomId>([[from, from]]);
  const frontier: RoomId[] = [from];
  for (let i = 0; i < frontier.length; i++) {
    const room = frontier[i]!;
    for (const next of rooms[room] ?? []) {
      if (cameFrom.has(next)) continue;
      cameFrom.set(next, room);
      if (next === to) {
        const path: RoomId[] = [];
        for (let at = to; at !== from; at = cameFrom.get(at)!) path.push(at);
        return path.reverse();
      }
      frontier.push(next);
    }
  }
  return null;
}
