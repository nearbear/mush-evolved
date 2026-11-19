import type { PlayerView, RoomId } from "@mush2/shared";
import { hasBotSkill } from "../duties.ts";
import { act, canAfford, failed, find, goTo, roomsWith, where } from "./blocks.ts";
import { leavesBed } from "./rest.ts";
import type { BotMemory, GoalDef } from "./types.ts";

/**
 * Morale at or below which a bot looks after itself (owner, 2026-11-18, #452): a day's end costs 1 (2 once Chun is
 * dead), each depression death 1 more, and a panic attack 3, so a bot at 5 is a bad day from 0.
 */
export const SELF_CARE_MORALE = 5;
/** Morale at which a bot in the Shrink's bed gets up: two above the trigger, so one night isn't cut short at 6. */
export const SELF_CARE_UNTIL = SELF_CARE_MORALE + 2;
/** Owner, 2026-11-18 (#452): below `eat` (80), above fires (78) and oxygen (77.5). In bed it still gets up for those. */
export const SELF_CARE_PRIORITY = 79;

/** Goals a bot in bed for its morale gets up for (owner, 2026-11-18): fires and broken oxygen tanks. */
const URGENT_GOALS = new Set(["extinguish", "repairOxygen"]);

/** Rooms with a bed where ACTOPI (or sharing the room) shows a living Shrink the bot knows of, nearest first by the list order. */
export function shrinkBedRooms(view: PlayerView, memory: BotMemory): RoomId[] {
  const beds = new Set(roomsWith(view, ["BED"]));
  const rooms = view.players.filter((p) => p.alive && memory.shrinks.has(p.id) && p.room !== undefined && beds.has(p.room)).map((p) => p.room!);
  return [...new Set(rooms)];
}

const shrinkIn = (view: PlayerView, memory: BotMemory, room: RoomId): boolean =>
  view.players.some((p) => p.alive && p.room === room && memory.shrinks.has(p.id));

/**
 * Lie in a bed in the Shrink's room while morale is low (owner, 2026-11-18, #452): anyone lying in a bed with a Shrink
 * in the room gains `shrink.lyingMorale` a cycle. Offered at `SELF_CARE_MORALE` or less, when the bot knows a Shrink
 * (seen in a room or announced, `memory.shrinks`) and ACTOPI shows it in a room with a bed: in practice its dorm at
 * night (`shrinkDorm`). Stays in bed until `SELF_CARE_UNTIL` or the Shrink leaves; a new cycle doesn't end it, but fires
 * and oxygen do (and whatever `rest` gets up for). Not for a Shrink: its bonus works only on others. May spend the AP
 * reserve to get there, as resting does.
 */
export const selfCare: GoalDef = {
  id: "selfCare",
  priority: SELF_CARE_PRIORITY,
  options(view, memory) {
    if (hasBotSkill(view, "shrink") || view.you.morale > SELF_CARE_MORALE) return [];
    const room = shrinkBedRooms(view, memory).find((r) => !memory.ended.has(`selfCare:${r}`) && canAfford(view, r, view.config.lieDownAp, 0, memory));
    if (!room) return [];
    return [
      {
        id: "selfCare",
        key: `selfCare:${room}`,
        label: `Your morale is low: lie down in a bed ${where(view, room)}, where a Shrink is, until it recovers`, // i18n-ignore: model prompt text, not player-visible
        step(v, m) {
          if (v.you.morale >= SELF_CARE_UNTIL) return { kind: "done" };
          if (!shrinkIn(v, m, room)) return { kind: "done" };
          if (v.you.lyingIn !== undefined && v.you.room === room) return { kind: "wait" };
          const walk = goTo(v, room);
          if (walk) return walk;
          const bed = find(v, "lie_down");
          return bed ? act(bed) : failed("bed_taken");
        },
        keepAcrossCycle(v, m, _newDay, goals) {
          if (v.you.morale >= SELF_CARE_UNTIL || !shrinkIn(v, m, room)) return false;
          if (goals.some((def) => URGENT_GOALS.has(def.id) && def.options(v, m).length > 0)) return false;
          return !leavesBed(v, m, goals);
        },
      },
    ];
  },
};
