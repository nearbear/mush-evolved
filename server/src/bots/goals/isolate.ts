import { SHIP_ROOMS, type PlayerView, type RoomId } from "@mush2/shared";
import { canAfford, goTo, nearest, where } from "./blocks.ts";
import type { Goal, GoalDef } from "./types.ts";

/** Where an Antisocial bot goes to be alone (owner, 2026-11-19, #470): the Rear Corridor. */
export const ISOLATE_ROOM: RoomId = "CORRIDOR_C";

/**
 * Below every work goal and rest, but above `explore`, which would walk her out of her quiet room every cycle.
 * (The issue said "just above END_CYCLE"; `explore` is the only goal in between.)
 */
export const ISOLATE_PRIORITY = 35;

/** Whether the bot can tell that another living person is in `room` (in its room, by ACTOPI, or as an unidentified dot). */
export function occupied(view: PlayerView, room: RoomId): boolean {
  return view.players.some((p) => p.alive && p.room === room) || view.unidentified.includes(room);
}

/**
 * Raluca's Antisocial trait costs her morale at each cycle change spent with anyone else (#470), so an Antisocial bot
 * with nothing better to do waits alone: in the Rear Corridor when nobody is there, else in the nearest room it can
 * see is empty (its own, if it is alone already). Never the Icarus. It keeps the goal across cycles while still alone;
 * someone arriving fails it, and the next empty room is offered. It never rests in a bed (`rest`).
 */
export const isolate: GoalDef = {
  id: "isolate",
  priority: ISOLATE_PRIORITY,
  options(view, memory) {
    if (!view.statuses.includes("antisocial")) return [];
    const open = (r: RoomId) => !memory.ended.has(`isolate:${r}`) && !occupied(view, r) && canAfford(view, r, 0, 0, memory);
    const room = open(ISOLATE_ROOM)
      ? ISOLATE_ROOM
      : nearest(
          view,
          SHIP_ROOMS.map((r) => r.id).filter((id) => id !== "ICARUS"),
        ).find(open);
    return room ? [isolateIn(view, room)] : [];
  },
};

function isolateIn(view: PlayerView, room: RoomId): Goal {
  return {
    id: "isolate",
    key: `isolate:${room}`,
    label: `Be alone: wait ${where(view, room)}, where nobody else is`, // i18n-ignore: model prompt text, not player-visible
    step(v) {
      if (occupied(v, room)) return { kind: "failed", reason: "not_alone" };
      return goTo(v, room) ?? { kind: "wait" };
    },
    keepAcrossCycle(v) {
      return v.you.room === room && !occupied(v, room);
    },
  };
}
