import { SHIP_ROOMS } from "@mush2/shared";
import { canAfford, doorsAway, goTo, nearest, travelAp } from "./blocks.ts";
import type { Goal, GoalDef } from "./types.ts";

/**
 * Walk to one of the two nearest rooms not visited this cycle, on MP alone: exploring never converts AP into MP, so it
 * never eats into the AP kept for work and emergencies (and preserves a holding Commander's return to the bridge, #421).
 * Arriving finishes it.
 */
export const explore: GoalDef = {
  id: "explore",
  priority: 30,
  options(view, memory) {
    const unseen = SHIP_ROOMS.map((r) => r.id).filter((id) => !memory.visited.has(id));
    return nearest(view, unseen)
      .filter((room) => travelAp(view, room) === 0 && canAfford(view, room, 0, 0))
      .slice(0, 2)
      .map(
        (room): Goal => ({
          id: "explore",
          key: `explore:${room}`,
          label: `Explore: walk to ${room} ${doorsAway(view, room)}`,
          step: (v) => goTo(v, room) ?? { kind: "done" },
        }),
      );
  },
};
